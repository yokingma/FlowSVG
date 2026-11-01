/** DOM-free PNG planning shared with Node; reject computable failures before allocating browser resources. */
import { createDiagram, evaluateDiagramFrame, type Diagram, type DiagramFrameEvaluation } from "../core/diagram.js";
import type { DiagramDocument } from "../core/model.js";
import { PngExportError, type PngExportOptions } from "./png-types.js";
const MAX_SIDE = 8192;
const MAX_PIXELS = 32_000_000;
/** Snapshot, compiled frame and integer pixel dimensions for exactly one source time. */
export interface PngPlan {
  document: DiagramDocument;
  diagram: Diagram;
  evaluation: DiagramFrameEvaluation;
  width: number;
  height: number;
  timeMs: number;
  theme: "light" | "dark";
  reducedMotion: boolean;
  background: "theme" | "transparent";
}
/** Validate supplied fields before defaults can hide malformed input. */
export function validatePngOptions(options: PngExportOptions): void {
  if (options === null || typeof options !== "object" || Array.isArray(options)) throw new PngExportError("options", "Provide PNG options as an object.");
  if (options.width !== undefined && (!Number.isFinite(options.width) || options.width <= 0)) throw new PngExportError("options", "width must be a positive finite number.");
  if (options.timeMs !== undefined && (!Number.isFinite(options.timeMs) || options.timeMs < 0)) throw new PngExportError("options", "timeMs must be finite and nonnegative.");
  if (options.theme !== undefined && options.theme !== "light" && options.theme !== "dark") throw new PngExportError("options", "theme must be light or dark.");
  if (options.background !== undefined && options.background !== "theme" && options.background !== "transparent") throw new PngExportError("options", "background must be theme or transparent.");
  if (options.reducedMotion !== undefined && typeof options.reducedMotion !== "boolean") throw new PngExportError("options", "reducedMotion must be a boolean.");
  if (options.signal !== undefined && !(options.signal instanceof AbortSignal)) throw new PngExportError("options", "signal must be an AbortSignal from an AbortController.");
}
/** Copy the document and evaluate the real selected camera; do not apply GIF's fixed-height rule. */
export function planPng(input: DiagramDocument, options: PngExportOptions = {}): PngPlan {
  validatePngOptions(options);
  let diagram: Diagram;
  let document: DiagramDocument;
  try {
    diagram = createDiagram(input);
    document = JSON.parse(JSON.stringify(input)) as DiagramDocument;
  } catch (cause) { throw new PngExportError("document", "Invalid diagram document; correct its validation issues before exporting.", { cause }); }
  const timeMs = options.timeMs ?? 0;
  if (timeMs > diagram.totalDuration) throw new PngExportError("options", "timeMs must be within the compiled timeline; static documents accept only zero.");
  const theme = options.theme ?? document.theme ?? "light";
  const reducedMotion = options.reducedMotion ?? false;
  let evaluation: DiagramFrameEvaluation;
  try { evaluation = evaluateDiagramFrame(diagram, timeMs, { theme, reducedMotion }); }
  catch (cause) { throw new PngExportError("document", "Cannot evaluate the selected diagram frame; correct its geometry before exporting.", { cause }); }
  const width = Math.max(1, Math.round(options.width ?? document.viewport.width));
  const height = Math.max(1, Math.round(width * (evaluation.frame.camera.height / evaluation.frame.camera.width)));
  if (!Number.isFinite(width) || !Number.isFinite(height) || Math.max(width, height) > MAX_SIDE || width * height > MAX_PIXELS) throw new PngExportError("limit", "Reduce PNG dimensions: each side must be at most 8192 pixels and total pixels at most 32,000,000.");
  return { document, diagram, evaluation, width, height, timeMs, theme, reducedMotion, background: options.background ?? "theme" };
}
