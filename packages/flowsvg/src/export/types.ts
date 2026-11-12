import type { EmphasisColors, ThemeName } from "../core/model.js";

/** Stages belong to one independent export; counts represent acknowledged sampling frames. */
export interface GifExportProgress {
  phase: "preparing" | "sampling" | "encoding" | "complete";
  completed: number;
  total: number;
}
/**
 * Browser export settings, captured at invocation; times are milliseconds.
 * Animation is limited to 120 effective seconds and 1800 samples. The final GIF
 * permits at most 1801 encoded frames, including splits of long final holds.
 * The final long edge, including captions, must not exceed 1920 pixels.
 * Invalid values and computable limits fail before canvas allocation or sampling.
 */
export interface GifExportOptions {
  /** Explicit theme; otherwise use the document theme, then light. Never reads system preferences. */
  theme?: ThemeName;
  /** Per-field overrides of document emphasis and theme defaults, copied before asynchronous work. */
  emphasis?: EmphasisColors;
  /** Inclusive source start, default 0. Evaluates the full document to retain earlier scene state. */
  startMs?: number;
  /**
   * Exclusive source end, default total duration. A segment holds the end-left picture;
   * the global end includes its completed state, even with finalHoldMs: 0.
   * Animated ranges require 0 <= startMs < endMs <= total duration; static ranges require both 0.
   */
  endMs?: number;
  /** Positive finite source-time multiplier, default 1. Output duration is source range / speed. */
  speed?: number;
  /**
   * Positive diagram width in pixels, rounded to an integer. Diagram height preserves the authored viewport ratio.
   * GIF ignores viewport.fitHeight for all frames to keep pixel dimensions and diagram scale stable.
   * Defaults to min(viewport.width, 1280), without upscaling; captions add height below the diagram.
   */
  width?: number;
  /** Integer samples per second from 1 to 30, default 15; cumulative GIF delay rounding avoids drift. */
  fps?: number;
  /** Include a fixed caption region below the diagram, default true. False removes that region. */
  includeCaptions?: boolean;
  /**
   * Caption-region height in pixels, rounded to an integer; default 80, finite and nonnegative.
   * Text uses 16px system font, 22px line height, 16px horizontal and 12px vertical padding.
   * Every effective caption is measured before sampling; overflow reports its scene/beat without clipping or shrinking.
   */
  captionHeight?: number;
  /** Zero means infinite looping (default); integers 1–65,536 mean total plays, with 1 playing once. */
  loopCount?: number;
  /**
   * Additional final-picture delay, finite and nonnegative; default 1000. Zero adds no delay.
   * Long delays split into bounded GIF frames and count toward the 1801 encoded-frame limit.
   * Static documents produce one picture with at least 10ms delay, even when this value is zero.
   */
  finalHoldMs?: number;
  /** Default false, independent of system preferences. True completes transitions and hides flow markers without changing duration. */
  reducedMotion?: boolean;
  /** Cancels this task with code cancelled; task-owned workers, images, canvas and object URLs are released on every exit. */
  signal?: AbortSignal;
  /** Reports preparing, sampling, encoding and complete. Cancellation never reports complete. Does not change player state. */
  onProgress?: (progress: GifExportProgress) => void;
}
export type GifExportErrorCode = "options" | "limit" | "document" | "caption-overflow" | "environment" | "rasterization" | "encoding" | "cancelled";
/** Distinguishable export failure with a message describing the corrective action. */
export class GifExportError extends Error {
  constructor(readonly code: GifExportErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "GifExportError";
  }
}
