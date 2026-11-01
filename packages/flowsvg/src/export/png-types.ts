import type { EvaluateOptions, SvgRenderOptions } from "../core/model.js";

/** Browser single-frame export settings, captured before asynchronous browser work. */
export interface PngExportOptions extends EvaluateOptions {
  /** Exact source time in milliseconds, default 0. Must be within the compiled timeline; static documents accept only 0. */
  timeMs?: number;
  /** Positive finite output width, rounded to pixels; default viewport.width. Height preserves the selected camera ratio. */
  width?: number;
  /** Default: theme. Transparent removes the whole-diagram background, preserving object paint and label halos. */
  background?: SvgRenderOptions["background"];
  /** Cancels this export; task-owned canvas, images and URLs are released on every exit. */
  signal?: AbortSignal;
}
export type PngExportErrorCode = "options" | "document" | "limit" | "environment" | "rasterization" | "encoding" | "cancelled";
/** Distinguishable PNG failure with a corrective message; PNG limits are 8192 pixels per side and 32,000,000 total pixels. */
export class PngExportError extends Error {
  constructor(readonly code: PngExportErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "PngExportError";
  }
}
