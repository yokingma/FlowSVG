/** Browser PNG entry owns single-frame resources; shared planning and core evaluation remain DOM-free. */
import { renderDiagramFrame } from "../core/diagram.js";
import type { DiagramDocument } from "../core/model.js";
import { DIAGRAM_FONT_FAMILY } from "../core/theme.js";
import { planPng, validatePngOptions, type PngPlan } from "./png-plan.js";
import { PngExportError, type PngExportOptions } from "./png-types.js";
import { withSvgImage } from "./rasterize.js";

/**
 * Return complete PNG bytes without downloading or changing playback. Capture inputs before asynchronous work.
 * Preserve the selected camera, visibility and transitions; release canvas, image and URLs on every exit.
 * @throws {PngExportError} For invalid options/document, pixel limits, browser services, rasterization, encoding or cancellation.
 */
export async function exportPng(input: DiagramDocument, options: PngExportOptions = {}): Promise<Uint8Array> {
  validatePngOptions(options);
  const captured = { ...options };
  checkAbort(captured.signal);
  const plan = planPng(input, captured);
  if (typeof globalThis.document === "undefined" || typeof Image !== "function") throw new PngExportError("environment", "PNG export requires browser canvas and image decoding; use flowsvg/node in Node.");
  const canvas = createCanvas(plan);
  try {
    const context = getContext(canvas);
    await prepareFonts(plan, captured.signal);
    await paintPng(context, plan, captured.signal);
    return await encodePng(canvas, captured.signal);
  } finally { canvas.width = 0; canvas.height = 0; }
}
function createCanvas(plan: PngPlan): HTMLCanvasElement {
  let canvas: HTMLCanvasElement | undefined;
  try {
    canvas = globalThis.document.createElement("canvas");
    canvas.width = plan.width;
    canvas.height = plan.height;
    return canvas;
  } catch (cause) {
    if (canvas) { canvas.width = 0; canvas.height = 0; }
    throw new PngExportError("environment", "Cannot allocate PNG canvas; enable canvas support or reduce dimensions.", { cause });
  }
}
function getContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  try {
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas 2D returned no context.");
    return context;
  } catch (cause) { throw new PngExportError("environment", "Canvas 2D is unavailable; enable browser canvas support.", { cause }); }
}
async function prepareFonts(plan: PngPlan, signal?: AbortSignal): Promise<void> {
  try {
    // System-font preparation covers all authored content, including structured text and flow labels.
    await withAbort(globalThis.document.fonts.load(`16px ${DIAGRAM_FONT_FAMILY}`, JSON.stringify(plan.document)), signal);
    await withAbort(globalThis.document.fonts.ready, signal);
  } catch (cause) {
    if (cause instanceof PngExportError) throw cause;
    throw new PngExportError("environment", "Cannot prepare system fonts; check browser font support and retry.", { cause });
  }
}
async function paintPng(context: CanvasRenderingContext2D, plan: PngPlan, signal?: AbortSignal): Promise<void> {
  try {
    checkAbort(signal);
    await withSvgImage(renderDiagramFrame(plan.diagram, plan.evaluation, { background: plan.background }), (image) => {
      checkAbort(signal);
      if (plan.background === "theme") {
        context.fillStyle = plan.evaluation.palette.background;
        context.fillRect(0, 0, plan.width, plan.height);
      }
      context.drawImage(image, 0, 0, plan.width, plan.height);
    }, (decode) => withAbort(decode, signal));
  } catch (cause) {
    if (cause instanceof PngExportError) throw cause;
    throw new PngExportError("rasterization", "Cannot rasterize the PNG frame; check browser SVG and canvas support.", { cause });
  }
}
async function encodePng(canvas: HTMLCanvasElement, signal?: AbortSignal): Promise<Uint8Array> {
  try {
    checkAbort(signal);
    const blob = await withAbort(new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((result) => result ? resolve(result) : reject(new Error("Canvas returned no PNG blob.")), "image/png");
    }), signal);
    const bytes = new Uint8Array(await withAbort(blob.arrayBuffer(), signal));
    if (!bytes.length) throw new Error("PNG encoder returned empty bytes.");
    checkAbort(signal);
    return bytes;
  } catch (cause) {
    if (cause instanceof PngExportError) throw cause;
    throw new PngExportError("encoding", "Cannot encode PNG bytes; retry with smaller dimensions or check browser canvas support.", { cause });
  }
}
function checkAbort(signal?: AbortSignal): void {
  if (signal?.aborted) throw new PngExportError("cancelled", "PNG export cancelled; start another export when ready.");
}
/** Detach the task's abort listener when either the browser service or cancellation settles. */
function withAbort<T>(promise: PromiseLike<T>, signal?: AbortSignal): Promise<T> {
  checkAbort(signal);
  return new Promise((resolve, reject) => {
    const cleanup = () => signal?.removeEventListener("abort", abort);
    const abort = () => { cleanup(); reject(new PngExportError("cancelled", "PNG export cancelled; start another export when ready.")); };
    signal?.addEventListener("abort", abort, { once: true });
    Promise.resolve(promise).then((value) => { cleanup(); resolve(value); }, (error: unknown) => { cleanup(); reject(error); });
  });
}
