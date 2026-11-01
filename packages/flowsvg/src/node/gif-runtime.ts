/** Node image runtime. Share offline Playwright ownership and late-resource cleanup across GIF and PNG. */
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { Browser, BrowserContext } from "playwright-core";
import type { DiagramDocument } from "../core/model.js";
import { GifExportError, type GifExportErrorCode, type GifExportOptions, type GifExportProgress } from "../export/types.js";
import { PngExportError, type PngExportOptions } from "../export/png-types.js";

export type BrowserPngOptions = Omit<PngExportOptions, "signal">;
export type BrowserGifOptions = Omit<GifExportOptions, "signal" | "onProgress">;

export interface NodeGifRuntimeInput {
  signal?: AbortSignal;
  browser?: Browser;
  executablePath?: string;
  onProgress?: (progress: GifExportProgress) => void;
  /** Test-only asset override; production always reads the same-build portable exporter. */
  portableExportScript?: string;
  /** Test-only launcher override; production dynamically imports the pinned Playwright runtime. */
  launchBrowser?: () => Promise<Browser>;
}

/**
 * Internal boundary between image orchestration and Playwright. The caller owns
 * the export protocol; this runtime owns only browser/page/temp resources.
 */
export interface NodeGifRuntime {
  run(document: DiagramDocument, options: BrowserGifOptions): Promise<Uint8Array>;
  abort(): void;
  dispose(): Promise<void>;
}

export interface NodePngRuntime {
  run(document: DiagramDocument, options: BrowserPngOptions): Promise<Uint8Array>;
  abort(): void;
  dispose(): Promise<void>;
}

interface ExportBridge {
  FlowSVGExport: {
    exportGif(document: DiagramDocument, options: GifExportOptions): Promise<Uint8Array>;
    exportPng(document: DiagramDocument, options: PngExportOptions): Promise<Uint8Array>;
  };
  flowSvgProgress(progress: GifExportProgress): Promise<void>;
}
type ExportResult = { bytes: number[] } | { error: { code: GifExportErrorCode; message: string } };

/** Create the production runtime; tests can inject another NodeGifRuntime at the same seam. */
export function createNodeGifRuntime(input: NodeGifRuntimeInput): NodeGifRuntime {
  return new PlaywrightImageRuntime(input);
}

/** Reuse the same ownership state machine; PNG differs only in its browser call and error class. */
export function createNodePngRuntime(input: NodeGifRuntimeInput): NodePngRuntime {
  return new PlaywrightImageRuntime(input, "png");
}

class PlaywrightImageRuntime implements NodeGifRuntime, NodePngRuntime {
  private browser?: Browser;
  private context?: BrowserContext;
  private directory?: string;
  private readonly ownsBrowser: boolean;
  private contextClosing?: Promise<void>;
  private disposed = false;
  private cancelled = false;
  private rejectCancellation?: (error: GifExportError | PngExportError) => void;
  private readonly cancellation: Promise<never>;
  private readonly abortHandler = (): void => { this.abort(); };

  constructor(private readonly input: NodeGifRuntimeInput, private readonly format: "gif" | "png" = "gif") {
    this.ownsBrowser = input.browser === undefined;
    this.cancellation = new Promise<never>((_, reject) => { this.rejectCancellation = reject; });
    void this.cancellation.catch(() => undefined);
    this.input.signal?.addEventListener("abort", this.abortHandler, { once: true });
  }

  async run(document: DiagramDocument, options: BrowserGifOptions | BrowserPngOptions): Promise<Uint8Array> {
    const script = this.input.portableExportScript ?? await this.race(readFile(new URL("../portable/export.js", import.meta.url), "utf8"));
    this.checkActive();
    this.browser = this.input.browser ?? await this.launch(this.input.executablePath);
    this.checkActive();
    const context = await this.acquire(this.browser.newContext({ offline: true }), (value) => value.close(), (value) => { this.context = value; });
    this.checkActive();
    // The retained context owns ordinary pages; close pages that arrive after the context was released.
    const page = await this.acquire(context.newPage(), (value) => value.close());
    await this.race(page.exposeFunction("flowSvgProgress", (progress: GifExportProgress) => {
      if (this.cancelled || this.disposed || this.input.signal?.aborted) return;
      this.input.onProgress?.(progress);
    }));
    const directory = await this.acquire(mkdtemp(join(tmpdir(), `flowsvg-${this.format}-`)), removeDirectory, (value) => { this.directory = value; });
    const html = join(directory, "export.html");
    await this.race(writeFile(html, `<meta charset="utf-8"><script>${script}</script>`));
    this.checkActive();
    await this.race(page.goto(pathToFileURL(html).href));
    const result: ExportResult = await this.race(page.evaluate(async ({ document: inputDocument, options: inputOptions, format }) => {
      const bridge = globalThis as unknown as ExportBridge;
      const controller = new AbortController();
      const progressPending: Promise<void>[] = [];
      try {
        const bytes = format === "png" ? await bridge.FlowSVGExport.exportPng(inputDocument, { ...inputOptions, signal: controller.signal }) : await bridge.FlowSVGExport.exportGif(inputDocument, {
          ...inputOptions,
          signal: controller.signal,
          onProgress: (progress) => { progressPending.push(bridge.flowSvgProgress(progress)); }
        });
        await Promise.all(progressPending);
        return { bytes: Array.from(bytes) };
      } catch (error: unknown) {
        const failure = error as { code?: GifExportErrorCode; message?: string };
        return { error: { code: failure.code ?? "encoding", message: failure.message ?? `Browser ${format.toUpperCase()} export failed.` } };
      }
    }, { document, options, format: this.format }));
    this.checkActive();
    if ("error" in result) throw this.exportError(result.error.code, result.error.message);
    return Uint8Array.from(result.bytes);
  }

  abort(): void {
    this.cancelled = true;
    this.rejectCancellation?.(this.cancelledError());
    void this.closeContext().catch(() => undefined);
  }

  private async launch(executablePath?: string): Promise<Browser> {
    if (this.input.launchBrowser) return await this.race(this.input.launchBrowser().then((browser) => this.acceptLaunchedBrowser(browser)));
    let automation: typeof import("playwright-core");
    try { automation = await import("playwright-core"); }
    catch (error: unknown) {
      throw this.exportError("environment", `${this.format.toUpperCase()} export requires playwright-core. Reinstall flowsvg with its runtime dependencies, then prepare Chromium explicitly.`, { cause: error });
    }
    this.checkActive();
    // Keep process signal ownership with the caller so CLI cancellation reaches this task.
    const launched = automation.chromium.launch({ executablePath, handleSIGINT: false, handleSIGTERM: false, handleSIGHUP: false }).then((browser) => this.acceptLaunchedBrowser(browser));
    return await Promise.race([launched, this.cancellation]);
  }

  private async acceptLaunchedBrowser(browser: Browser): Promise<Browser> {
    // A launch can settle after cancellation or dispose; close that late process immediately.
    if (this.cancelled || this.input.signal?.aborted || this.disposed) { await browser.close(); throw this.cancelledError(); }
    this.browser = browser;
    return browser;
  }

  /** Register resources before racing cancellation; release late arrivals even after dispose returns. */
  private acquire<T>(operation: Promise<T>, release: (value: T) => Promise<void>, retain?: (value: T) => void): Promise<T> {
    return this.race(operation.then(async (value) => {
      if (this.cancelled || this.input.signal?.aborted || this.disposed) {
        await release(value);
        throw this.cancelledError();
      }
      retain?.(value);
      return value;
    }));
  }

  private checkActive(): void {
    if (this.cancelled || this.disposed || this.input.signal?.aborted) throw this.cancelledError();
  }

  private closeContext(): Promise<void> {
    if (this.context) this.contextClosing ??= this.context.close();
    return this.contextClosing ?? Promise.resolve();
  }

  private race<T>(operation: PromiseLike<T>): Promise<T> {
    return Promise.race([operation, this.cancellation]);
  }

  private exportError(code: GifExportErrorCode, message: string, options?: ErrorOptions): GifExportError | PngExportError {
    return this.format === "png" ? new PngExportError(code === "caption-overflow" ? "encoding" : code, message, options) : new GifExportError(code, message, options);
  }

  private cancelledError(): GifExportError | PngExportError {
    return this.exportError("cancelled", `${this.format.toUpperCase()} export was cancelled. Start a new export when ready.`);
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    this.input.signal?.removeEventListener("abort", this.abortHandler);
    try { await this.closeContext(); }
    finally {
      try { if (this.ownsBrowser) await this.browser?.close(); }
      finally { if (this.directory) await removeDirectory(this.directory); }
    }
  }
}

async function removeDirectory(directory: string): Promise<void> { await rm(directory, { recursive: true, force: true }); }
