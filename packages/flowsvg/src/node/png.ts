/** Node PNG bridge. Preflight synchronously, then reuse the browser exporter in an offline task context. */
import type { Browser } from "playwright-core";
import type { DiagramDocument } from "../core/model.js";
import { planPng, validatePngOptions } from "../export/png-plan.js";
import { PngExportError, type PngExportOptions } from "../export/png-types.js";
import { assertNodeRuntime } from "./html.js";
import { createNodePngRuntime, type BrowserPngOptions } from "./gif-runtime.js";

/** Node-only browser selection; executablePath and browser are mutually exclusive. */
export interface NodePngExportOptions extends PngExportOptions {
  /** Installed Chromium executable. This API never downloads a browser. */
  executablePath?: string;
  /** Caller-owned Playwright browser. Only this export's isolated context is closed. */
  browser?: Browser;
}

/**
 * Return PNG bytes using flowsvg/export's browser implementation. Requires Node 20+ and installed Chromium.
 * Capture document and options before any asynchronous work. Reject invalid input and pixel limits before
 * browser allocation. Success, failure and cancellation release task resources, including late acquisitions.
 * A supplied browser remains open. The caller owns output file writes.
 */
export async function exportPng(document: DiagramDocument, options: NodePngExportOptions = {}): Promise<Uint8Array> {
  assertNodeRuntime();
  validatePngOptions(options);
  const { browser, executablePath, signal, ...settings } = options;
  if (executablePath !== undefined && (typeof executablePath !== "string" || executablePath.trim().length === 0)) {
    throw new PngExportError("options", "executablePath must identify an installed Chromium executable.");
  }
  if (browser !== undefined && executablePath !== undefined) throw new PngExportError("options", "Choose browser or executablePath, not both.");
  if (browser !== undefined && (browser === null || typeof browser.newContext !== "function")) throw new PngExportError("options", "browser must be a Playwright browser.");
  throwIfCancelled(signal);
  const plan = planPng(document, settings);
  const fixedOptions: BrowserPngOptions = { timeMs: plan.timeMs, width: plan.width, theme: plan.theme, reducedMotion: plan.reducedMotion, background: plan.background };
  const runtime = createNodePngRuntime({ browser, executablePath, signal });
  try {
    const bytes = await runtime.run(plan.document, fixedOptions);
    throwIfCancelled(signal);
    return bytes;
  } catch (cause: unknown) {
    throwIfCancelled(signal);
    if (cause instanceof PngExportError) throw cause;
    throw new PngExportError("environment", "Cannot run Chromium PNG export. Prepare Chromium explicitly or set executablePath to an installed Chromium executable.", { cause });
  } finally {
    try { await runtime.dispose(); }
    catch (cause: unknown) { throw new PngExportError("environment", "Cannot release PNG export resources. Close the browser and retry.", { cause }); }
  }
}
function throwIfCancelled(signal?: AbortSignal): void {
  if (signal?.aborted) throw new PngExportError("cancelled", "PNG export was cancelled. Start a new export when ready.");
}
