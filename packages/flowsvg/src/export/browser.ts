/** Browser-only export owns its canvas, image URLs and inline encoder worker; core rendering stays DOM-free. */
import { createDiagram, type Diagram } from "../core/diagram.js";
import type { DiagramDocument } from "../core/model.js";
import { resolveThemePalette } from "../core/theme.js";
import { CAPTION_FONT, CAPTION_LINE_HEIGHT, CAPTION_PADDING_X, CAPTION_PADDING_Y, collectCaptions, preflightCaptions, wrapCaption } from "./captions.js";
import { planGif, validateGifOptions, type GifPlan } from "./plan.js";
import { GIF_WORKER_SOURCE } from "./worker-source.js";
import { GifExportError, type GifExportOptions, type GifExportProgress } from "./types.js";

/**
 * Return opaque GIF bytes without downloading or changing playback. Snapshot inputs synchronously
 * and release task resources on success, failure or cancellation. Captions are measured before sampling.
 * @throws {GifExportError} With a distinct code for invalid options/document, limits, caption overflow,
 * unavailable browser services, rasterization, encoding or cancellation. See GifExportOptions for limits.
 */
export async function exportGif(input: DiagramDocument, options: GifExportOptions = {}): Promise<Uint8Array> {
  validateGifOptions(options);
  const captured = { ...options };
  checkAbort(captured.signal);
  let diagram: Diagram;
  try { diagram = createDiagram(input); } catch (cause) { throw new GifExportError("document", "Invalid diagram document; correct the validation issues before exporting.", { cause }); }
  const document = JSON.parse(JSON.stringify(input)) as DiagramDocument;
  const plan = planGif(document, diagram.totalDuration, captured);
  if (typeof globalThis.document === "undefined" || typeof Worker !== "function") throw new GifExportError("environment", "GIF export requires a modern browser with canvas and workers; use flowsvg/node in Node.");
  const report = (phase: GifExportProgress["phase"], completed: number) => { checkAbort(captured.signal); captured.onProgress?.({ phase, completed, total: plan.frames.length }); checkAbort(captured.signal); };
  report("preparing", 0);
  const canvas = globalThis.document.createElement("canvas");
  canvas.width = plan.width; canvas.height = plan.height;
  let worker: Worker | undefined;
  let workerUrl: string | undefined;
  const workerFailure = new AbortController();
  const failWorker = (event: ErrorEvent) => workerFailure.abort(new GifExportError("encoding", `Worker failed: ${event.message || "startup or execution was blocked"}. Check Blob worker permissions and retry.`));
  try {
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new GifExportError("environment", "Canvas 2D is unavailable; enable browser canvas support.");
    const captions = captured.includeCaptions === false ? [] : collectCaptions(document, plan.startMs, plan.endMs);
    await waitForFonts([document.title ?? "中文", ...captions.map(({ text }) => text)].join("\n"), captured.signal);
    preflightCaptions(context, captions, plan);
    checkAbort(captured.signal);
    workerUrl = URL.createObjectURL(new Blob([GIF_WORKER_SOURCE], { type: "text/javascript" }));
    worker = createWorker(workerUrl);
    // Startup errors can arrive while image decoding is pending, before the first frame request.
    worker.addEventListener("error", failWorker);
    for (const [index, frame] of plan.frames.entries()) {
      report("sampling", index);
      const caption = diagram.evaluateAt(frame.timeMs, plan).caption ?? "";
      await paintFrame(context, canvas, diagram.renderSvg(frame.timeMs, plan), caption, plan, captured.signal, workerFailure.signal);
      const pixels = readPixels(context, plan);
      report("encoding", index);
      await requestWorker(worker, { type: "frame", rgba: pixels.data.buffer, width: plan.width, height: plan.height, delayMs: frame.delayMs, repeat: plan.loopCount === 1 ? -1 : plan.loopCount === 0 ? 0 : plan.loopCount - 1 }, [pixels.data.buffer], captured.signal, workerFailure.signal);
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
    const result = await requestWorker(worker, { type: "finish" }, [], captured.signal, workerFailure.signal);
    if (!result.bytes) throw new GifExportError("encoding", "Encoder returned no bytes; retry with a smaller export.");
    report("complete", plan.frames.length);
    return result.bytes;
  } finally { worker?.removeEventListener("error", failWorker); worker?.terminate(); if (workerUrl) URL.revokeObjectURL(workerUrl); canvas.width = 0; canvas.height = 0; }
}

function checkAbort(signal?: AbortSignal, workerFailure?: AbortSignal): void {
  if (signal?.aborted) throw new GifExportError("cancelled", "GIF export cancelled; start another export when ready.");
  if (workerFailure?.aborted) throw workerFailure.reason;
}
interface WorkerResult { bytes?: Uint8Array; error?: string }
function requestWorker(worker: Worker, data: unknown, transfer: Transferable[], signal: AbortSignal | undefined, workerFailure: AbortSignal): Promise<WorkerResult> {
  checkAbort(signal, workerFailure);
  return new Promise((resolve, reject) => {
    const cleanup = () => { worker.removeEventListener("message", message); workerFailure.removeEventListener("abort", failure); signal?.removeEventListener("abort", abort); };
    const abort = () => { cleanup(); reject(new GifExportError("cancelled", "GIF export cancelled; start another export when ready.")); };
    const failure = () => { cleanup(); reject(workerFailure.reason); };
    const message = (event: MessageEvent<WorkerResult>) => { cleanup(); if (event.data.error) reject(new GifExportError("encoding", `${event.data.error}; retry with a smaller export.`)); else resolve(event.data); };
    worker.addEventListener("message", message); workerFailure.addEventListener("abort", failure, { once: true }); signal?.addEventListener("abort", abort, { once: true });
    try { worker.postMessage(data, transfer); }
    catch (cause) { cleanup(); reject(new GifExportError("encoding", "Cannot send pixels to the encoder; retry the export.", { cause })); }
  });
}
async function paintFrame(context: CanvasRenderingContext2D, canvas: HTMLCanvasElement, svg: string, caption: string, plan: GifPlan, signal: AbortSignal | undefined, workerFailure: AbortSignal): Promise<void> {
  checkAbort(signal, workerFailure);
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  const image = new Image();
  try {
    image.src = url;
    await withAbort(image.decode(), signal, workerFailure);
    checkAbort(signal, workerFailure);
    const palette = resolveThemePalette(plan.theme);
    context.fillStyle = palette.background; context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, plan.width, plan.diagramHeight);
    if (!plan.captionHeight) return;
    context.font = CAPTION_FONT; context.fillStyle = palette.text; context.textBaseline = "top";
    wrapCaption(context, caption, plan.width - CAPTION_PADDING_X * 2).forEach((line, index) => context.fillText(line, CAPTION_PADDING_X, plan.diagramHeight + CAPTION_PADDING_Y + index * CAPTION_LINE_HEIGHT));
  } catch (cause) {
    if (cause instanceof GifExportError) throw cause;
    throw new GifExportError("rasterization", "Cannot rasterize the diagram; check browser SVG/canvas support and retry.", { cause });
  } finally { image.src = ""; URL.revokeObjectURL(url); }
}

/** Race browser services with cancellation and worker failure; detach both listeners on settlement. */
function withAbort<T>(promise: PromiseLike<T>, signal?: AbortSignal, workerFailure?: AbortSignal): Promise<T> {
  checkAbort(signal, workerFailure);
  return new Promise((resolve, reject) => {
    const cleanup = () => { signal?.removeEventListener("abort", abort); workerFailure?.removeEventListener("abort", failure); };
    const abort = () => { cleanup(); reject(new GifExportError("cancelled", "GIF export cancelled; start another export when ready.")); };
    const failure = () => { cleanup(); reject(workerFailure?.reason); };
    signal?.addEventListener("abort", abort, { once: true });
    workerFailure?.addEventListener("abort", failure, { once: true });
    Promise.resolve(promise).then(
      (value) => { cleanup(); resolve(value); },
      (error: unknown) => { cleanup(); reject(error); }
    );
  });
}
async function waitForFonts(text: string, signal?: AbortSignal): Promise<void> {
  try {
    await withAbort(globalThis.document.fonts.load(CAPTION_FONT, text), signal);
    await withAbort(globalThis.document.fonts.ready, signal);
  } catch (cause) {
    if (cause instanceof GifExportError) throw cause;
    throw new GifExportError("environment", "Cannot prepare system fonts; check browser font support and retry.", { cause });
  }
}
function createWorker(url: string): Worker {
  try { return new Worker(url); }
  catch (cause) { throw new GifExportError("environment", "Cannot start the GIF worker; allow Blob workers in the browser content security policy.", { cause }); }
}
function readPixels(context: CanvasRenderingContext2D, plan: GifPlan): ImageData {
  try { return context.getImageData(0, 0, plan.width, plan.height); }
  catch (cause) { throw new GifExportError("rasterization", "Cannot read rendered pixels; check browser canvas permissions and retry.", { cause }); }
}
