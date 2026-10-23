/** Node GIF bridge. Reuse the built browser exporter in an isolated, offline Chromium page. */
import type { Browser } from "playwright-core";
import { createDiagram } from "../core/diagram.js";
import { planGif, validateGifOptions } from "../export/plan.js";
import type { DiagramDocument } from "../core/model.js";
import { GifExportError, type GifExportOptions, type GifExportProgress } from "../export/types.js";
import { assertNodeRuntime } from "./html.js";
import { createNodeGifRuntime, type BrowserGifOptions, type NodeGifRuntime, type NodeGifRuntimeInput } from "./gif-runtime.js";

/** Node-only browser selection. Choose browser or executablePath; a supplied browser remains caller-owned. */
export interface NodeGifExportOptions extends GifExportOptions {
  /** Use an already installed Chromium executable. This function never downloads a browser. */
  executablePath?: string;
  /** Already connected/launched Playwright browser; only the task's isolated context is closed. */
  browser?: Browser;
}
type RuntimeFactory = (input: NodeGifRuntimeInput) => NodeGifRuntime;

/**
 * Return GIF bytes using the same exporter as flowsvg/export. Requires Node 20+ and preinstalled Chromium.
 * Snapshot inputs before asynchronous work. Success, error and cancellation release task-owned resources;
 * a supplied browser is never closed. Progress is forwarded from the browser exporter.
 */
export async function exportGif(document: DiagramDocument, options: NodeGifExportOptions = {}): Promise<Uint8Array> {
  return runNodeGifExport(document, options, createNodeGifRuntime);
}

async function runNodeGifExport(document: DiagramDocument, options: NodeGifExportOptions, runtimeFactory: RuntimeFactory): Promise<Uint8Array> {
  assertNodeRuntime();
  validateGifOptions(options);
  const { browser: externalBrowser, executablePath, signal, onProgress, ...settings } = options;
  const snapshot = snapshotInput(document, "document");
  const fixedOptions: BrowserGifOptions = snapshotInput(settings, "options");
  if (executablePath !== undefined && (typeof executablePath !== "string" || executablePath.length === 0)) {
    throw new GifExportError("options", "executablePath must identify an installed Chromium executable.");
  }
  if (externalBrowser !== undefined && executablePath !== undefined) throw new GifExportError("options", "Choose browser or executablePath, not both.");
  throwIfCancelled(signal);
  let duration: number;
  try { duration = createDiagram(snapshot).totalDuration; }
  catch (cause: unknown) { throw new GifExportError("document", "Invalid diagram document. Correct validation issues before exporting.", { cause }); }
  planGif(snapshot, duration, fixedOptions);
  const job = new BrowserExportJob(signal, onProgress, runtimeFactory);
  try {
    return await job.run(snapshot, fixedOptions, externalBrowser, executablePath);
  } finally {
    await job.dispose();
  }
}

/** Own the export protocol while NodeGifRuntime owns browser/page and temporary resources. */
class BrowserExportJob {
  private runtime?: NodeGifRuntime;
  private callbackError?: unknown;
  private callbackFailed = false;
  private readonly abort = (): void => {
    // Closing the isolated context interrupts font/raster/worker work even if the page cannot evaluate abort.
    this.runtime?.abort();
  };

  constructor(private readonly signal: AbortSignal | undefined, private readonly onProgress: ((progress: GifExportProgress) => void) | undefined, private readonly runtimeFactory: RuntimeFactory) {
    this.signal?.addEventListener("abort", this.abort, { once: true });
  }

  async run(document: DiagramDocument, options: BrowserGifOptions, externalBrowser?: Browser, executablePath?: string): Promise<Uint8Array> {
    try {
      this.runtime = this.runtimeFactory({
        signal: this.signal,
        browser: externalBrowser,
        executablePath,
        onProgress: (progress) => {
          if (this.signal?.aborted) return;
          try { this.onProgress?.(progress); }
          catch (error: unknown) { this.callbackFailed = true; this.callbackError = error; this.abort(); }
        }
      });
      const bytes = await this.runtime.run(document, options);
      if (this.callbackFailed) {
        throw new GifExportError("encoding", "GIF progress callback failed. Correct the callback and retry.", { cause: this.callbackError });
      }
      return bytes;
    } catch (error: unknown) {
      if (this.callbackFailed) throw new GifExportError("encoding", "GIF progress callback failed. Correct the callback and retry.", { cause: this.callbackError });
      throwIfCancelled(this.signal);
      if (error instanceof GifExportError) throw error;
      throw new GifExportError("environment", "Cannot run Chromium GIF export. Prepare Chromium with npx --no-install playwright-core install chromium (and --with-deps on supported Linux), or set executablePath to an installed Chromium executable.", { cause: error });
    }
  }

  async dispose(): Promise<void> {
    this.signal?.removeEventListener("abort", this.abort);
    await this.runtime?.dispose();
  }
}
function cancelledError(): GifExportError { return new GifExportError("cancelled", "GIF export was cancelled. Start a new export when ready."); }
function throwIfCancelled(signal?: AbortSignal): void { if (signal?.aborted) throw cancelledError(); }

function snapshotInput<T>(value: T, code: "document" | "options"): T {
  try { return structuredClone(value); }
  catch (cause: unknown) { throw new GifExportError(code, `GIF ${code} must contain serializable values. Remove functions or other unsupported values and retry.`, { cause }); }
}
