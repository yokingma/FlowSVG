/** Node GIF bridge. Reuse the built browser exporter in an isolated, offline Chromium page. */
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { Browser, BrowserContext, Page } from "playwright-core";
import { createDiagram } from "../core/diagram.js";
import { planGif, validateGifOptions } from "../export/plan.js";
import type { DiagramDocument } from "../core/model.js";
import { GifExportError, type GifExportOptions, type GifExportProgress, type GifExportErrorCode } from "../export/types.js";
import { assertNodeRuntime } from "./html.js";

/** Node-only browser selection. Choose browser or executablePath; a supplied browser remains caller-owned. */
export interface NodeGifExportOptions extends GifExportOptions {
  /** Use an already installed Chromium executable. This function never downloads a browser. */
  executablePath?: string;
  /** Already connected/launched Playwright browser; only the task's isolated context is closed. */
  browser?: Browser;
}
type BrowserOptions = Omit<GifExportOptions, "signal" | "onProgress">;
interface ExportBridge {
  FlowSVGExport: { exportGif(document: DiagramDocument, options: GifExportOptions): Promise<Uint8Array> };
  flowSvgProgress(progress: GifExportProgress): Promise<void>;
}
type ExportResult = { bytes: number[] } | { error: { code: GifExportErrorCode; message: string } };

/**
 * Return GIF bytes using the same exporter as flowsvg/export. Requires Node 20+ and preinstalled Chromium.
 * Snapshot inputs before asynchronous work. Success, error and cancellation release task-owned resources;
 * a supplied browser is never closed. Progress is forwarded from the browser exporter.
 */
export async function exportGif(document: DiagramDocument, options: NodeGifExportOptions = {}): Promise<Uint8Array> {
  assertNodeRuntime();
  validateGifOptions(options);
  const { browser: externalBrowser, executablePath, signal, onProgress, ...settings } = options;
  const snapshot = snapshotInput(document, "document");
  const fixedOptions: BrowserOptions = snapshotInput(settings, "options");
  if (executablePath !== undefined && (typeof executablePath !== "string" || executablePath.length === 0)) {
    throw new GifExportError("options", "executablePath must identify an installed Chromium executable.");
  }
  if (externalBrowser !== undefined && executablePath !== undefined) throw new GifExportError("options", "Choose browser or executablePath, not both.");
  throwIfCancelled(signal);
  let duration: number;
  try { duration = createDiagram(snapshot).totalDuration; }
  catch (cause: unknown) { throw new GifExportError("document", "Invalid diagram document. Correct validation issues before exporting.", { cause }); }
  planGif(snapshot, duration, fixedOptions);
  const job = new BrowserExportJob(signal, onProgress);
  try {
    return await job.run(snapshot, fixedOptions, externalBrowser, executablePath);
  } finally {
    await job.dispose();
  }
}

/** Own one export page/context, optional launched browser and temporary directory. Abort also interrupts launch. */
class BrowserExportJob {
  private browser?: Browser;
  private context?: BrowserContext;
  private page?: Page;
  private directory?: string;
  private ownedBrowser = false;
  private contextClosing?: Promise<void>;
  private callbackError?: unknown;
  private callbackFailed = false;
  private rejectAbort?: (error: GifExportError) => void;
  private readonly cancellation: Promise<never>;
  private readonly abort = (): void => {
    this.rejectAbort?.(cancelledError());
    // Closing the isolated context interrupts font/raster/worker work even if the page cannot evaluate abort.
    // dispose() awaits this same promise and reports cleanup failures after releasing other resources.
    void this.closeContext().catch(() => undefined);
  };

  constructor(private readonly signal?: AbortSignal, private readonly onProgress?: (progress: GifExportProgress) => void) {
    this.cancellation = new Promise<never>((_, reject) => { this.rejectAbort = reject; });
    // A cancellation can arrive during a file read, before launch starts observing this promise.
    void this.cancellation.catch(() => undefined);
    this.signal?.addEventListener("abort", this.abort, { once: true });
  }

  async run(document: DiagramDocument, options: BrowserOptions, externalBrowser?: Browser, executablePath?: string): Promise<Uint8Array> {
    try {
      return await this.execute(document, options, externalBrowser, executablePath);
    } catch (error: unknown) {
      if (this.callbackFailed) throw new GifExportError("encoding", "GIF progress callback failed. Correct the callback and retry.", { cause: this.callbackError });
      throwIfCancelled(this.signal);
      if (error instanceof GifExportError) throw error;
      throw new GifExportError("environment", "Cannot run Chromium GIF export. Prepare Chromium with npx --no-install playwright-core install chromium (and --with-deps on supported Linux), or set executablePath to an installed Chromium executable.", { cause: error });
    }
  }

  private async execute(document: DiagramDocument, options: BrowserOptions, externalBrowser?: Browser, executablePath?: string): Promise<Uint8Array> {
    const script = await readFile(new URL("../portable/export.js", import.meta.url), "utf8");
    throwIfCancelled(this.signal);
    this.browser = externalBrowser ?? await this.launch(executablePath);
    this.ownedBrowser = externalBrowser === undefined;
    throwIfCancelled(this.signal);
    this.context = await this.browser.newContext({ offline: true });
    throwIfCancelled(this.signal);
    this.page = await this.context.newPage();
    await this.page.exposeFunction("flowSvgProgress", (progress: GifExportProgress) => {
      if (this.signal?.aborted) return;
      try { this.onProgress?.(progress); }
      catch (error: unknown) { this.callbackFailed = true; this.callbackError = error; this.abort(); }
    });
    this.directory = await mkdtemp(join(tmpdir(), "flowsvg-gif-"));
    const html = join(this.directory, "export.html");
    await writeFile(html, `<meta charset="utf-8"><script>${script}</script>`);
    throwIfCancelled(this.signal);
    await this.page.goto(pathToFileURL(html).href);
    const result: ExportResult = await this.page.evaluate(async ({ document, options }) => {
      const bridge = globalThis as unknown as ExportBridge;
      const controller = new AbortController();
      const progressPending: Promise<void>[] = [];
      try {
        const bytes = await bridge.FlowSVGExport.exportGif(document, {
          ...options, signal: controller.signal,
          onProgress: (progress) => { progressPending.push(bridge.flowSvgProgress(progress)); }
        });
        await Promise.all(progressPending);
        return { bytes: Array.from(bytes) };
      } catch (error: unknown) {
        const failure = error as { code?: GifExportErrorCode; message?: string };
        return { error: { code: failure.code ?? "encoding", message: failure.message ?? "Browser GIF export failed." } };
      }
    }, { document, options });
    throwIfCancelled(this.signal);
    if ("error" in result) throw new GifExportError(result.error.code, result.error.message);
    return Uint8Array.from(result.bytes);
  }

  private async launch(executablePath?: string): Promise<Browser> {
    let automation: typeof import("playwright-core");
    try { automation = await import("playwright-core"); }
    catch (error: unknown) { throw new GifExportError("environment", "GIF export requires playwright-core. Reinstall flowsvg with its runtime dependencies, then prepare Chromium explicitly.", { cause: error }); }
    throwIfCancelled(this.signal);
    // The host/CLI owns process signals; Playwright defaults can otherwise exit before our cleanup.
    const launched = automation.chromium.launch({ executablePath, handleSIGINT: false, handleSIGTERM: false, handleSIGHUP: false }).then(async (browser) => {
      // A cancelled launch can settle after run() returned; close that late process.
      if (this.signal?.aborted) { await browser.close(); throw cancelledError(); }
      return browser;
    });
    return await Promise.race([launched, this.cancellation]);
  }

  private closeContext(): Promise<void> {
    if (this.context) this.contextClosing ??= this.context.close();
    return this.contextClosing ?? Promise.resolve();
  }

  async dispose(): Promise<void> {
    this.signal?.removeEventListener("abort", this.abort);
    try { await this.closeContext(); }
    finally {
      try { if (this.ownedBrowser) await this.browser?.close(); }
      finally { if (this.directory) await rm(this.directory, { recursive: true, force: true }); }
    }
  }
}
function cancelledError(): GifExportError { return new GifExportError("cancelled", "GIF export was cancelled. Start a new export when ready."); }
function throwIfCancelled(signal?: AbortSignal): void { if (signal?.aborted) throw cancelledError(); }

function snapshotInput<T>(value: T, code: "document" | "options"): T {
  try { return structuredClone(value); }
  catch (cause: unknown) { throw new GifExportError(code, `GIF ${code} must contain serializable values. Remove functions or other unsupported values and retry.`, { cause }); }
}
