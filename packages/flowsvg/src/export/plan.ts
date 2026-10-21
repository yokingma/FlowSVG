/** Pure export planning: reject computable limits before any browser resource is allocated. */
import type { DiagramDocument } from "../core/model.js";
import { GifExportError, type GifExportOptions } from "./types.js";

const MAX_DURATION_MS = 120_000;
const MAX_FRAMES = 1800;
const MAX_ENCODED_FRAMES = 1801;
const MAX_FRAME_DELAY_TICKS = 65_535;
const MAX_SIDE = 1920;
const DEFAULT_MAX_WIDTH = 1280;
const DEFAULT_FPS = 15;
const DEFAULT_CAPTION_HEIGHT = 80;
const DEFAULT_HOLD_MS = 1000;
const MIN_FPS = 1;
const MAX_FPS = 30;
const MAX_TOTAL_PLAYS = 65_536;
const GIF_TIME_UNIT_MS = 10;
const SECOND_MS = 1000;
/** Source-time evaluation and its output delay, both in milliseconds. */
export interface GifFrame { timeMs: number; delayMs: number }
/** Fixed integer pixel dimensions and a bounded sampling schedule shared by browser and Node. */
export interface GifPlan {
  width: number; diagramHeight: number; height: number; captionHeight: number;
  theme: "light" | "dark"; frames: GifFrame[]; startMs: number; endMs: number;
  reducedMotion: boolean; loopCount: number;
}
/** Validate supplied fields before defaults or cancellation checks can hide malformed input. */
export function validateGifOptions(options: GifExportOptions): void {
  if (options === null || typeof options !== "object" || Array.isArray(options)) {
    throw new GifExportError("options", "Provide GIF options as an object.");
  }
  for (const name of ["width", "fps", "captionHeight", "startMs", "endMs", "speed", "finalHoldMs", "loopCount"] as const) {
    const value = options[name];
    if (value !== undefined && !Number.isFinite(value)) throw new GifExportError("options", `${name} must be a finite number.`);
  }
  for (const name of ["includeCaptions", "reducedMotion"] as const) {
    if (options[name] !== undefined && typeof options[name] !== "boolean") throw new GifExportError("options", `${name} must be a boolean.`);
  }
  if (options.theme !== undefined && options.theme !== "light" && options.theme !== "dark") throw new GifExportError("options", "theme must be light or dark.");
  if (options.captionHeight !== undefined && options.captionHeight < 0) throw new GifExportError("options", "captionHeight must be nonnegative.");
  if (options.onProgress !== undefined && typeof options.onProgress !== "function") throw new GifExportError("options", "onProgress must be a function.");
  if (options.signal !== undefined && !(options.signal instanceof AbortSignal)) throw new GifExportError("options", "signal must be an AbortSignal from an AbortController.");
}
/** Defaults export the complete timeline at 15 fps, capped at 1280px without upscaling, with a 1s final hold. */
export function planGif(document: DiagramDocument, duration: number, options: GifExportOptions): GifPlan {
  validateGifOptions(options);
  const width = options.width ?? Math.min(DEFAULT_MAX_WIDTH, document.viewport.width);
  const fps = options.fps ?? DEFAULT_FPS;
  const captionHeight = options.includeCaptions === false ? 0 : options.captionHeight ?? DEFAULT_CAPTION_HEIGHT;
  const startMs = options.startMs ?? 0;
  const endMs = options.endMs ?? duration;
  const speed = options.speed ?? 1;
  const hold = options.finalHoldMs ?? DEFAULT_HOLD_MS;
  const loopCount = options.loopCount ?? 0;
  for (const [name, value] of Object.entries({ width, fps, captionHeight, startMs, endMs, speed, finalHoldMs: hold, loopCount })) {
    if (!Number.isFinite(value)) throw new GifExportError("options", `${name} must be finite; provide a valid number.`);
  }
  if (width <= 0 || speed <= 0 || hold < 0 || captionHeight < 0 || !Number.isInteger(fps) || fps < MIN_FPS || fps > MAX_FPS) throw new GifExportError("options", "Use positive width/speed, nonnegative hold/caption height and an integer fps from 1 to 30.");
  if (!Number.isInteger(loopCount) || loopCount < 0 || loopCount > MAX_TOTAL_PLAYS) throw new GifExportError("options", "loopCount must be an integer from 0 to 65,536 (maximum total plays).");
  if (!Number.isFinite(duration) || startMs < 0 || endMs > duration || (duration === 0 ? startMs !== 0 || endMs !== 0 : startMs >= endMs)) throw new GifExportError("options", "Choose a finite, nonempty range within the document timeline; static documents accept only zero.");
  const outputWidth = Math.max(1, Math.round(width));
  const diagramHeight = Math.max(1, Math.round(width * document.viewport.height / document.viewport.width));
  const height = diagramHeight + Math.round(captionHeight);
  const effectiveDuration = (endMs - startMs) / speed;
  const proposedCount = duration === 0 ? 0 : Math.max(1, Math.ceil(effectiveDuration * fps / SECOND_MS));
  // Rounding the division can otherwise add a zero-delay sample at the excluded endpoint.
  const count = proposedCount > 1 && (proposedCount - 1) * SECOND_MS / fps >= effectiveDuration ? proposedCount - 1 : proposedCount;
  if (effectiveDuration > MAX_DURATION_MS || count > MAX_FRAMES || Math.max(outputWidth, height) > MAX_SIDE) throw new GifExportError("limit", "Reduce duration, fps or dimensions: limits are 120 seconds, 1800 samples and a 1920px final long edge.");
  const holdTicks = duration === 0 ? Math.max(1, Math.round(hold / GIF_TIME_UNIT_MS)) : Math.round(hold / GIF_TIME_UNIT_MS);
  const hasFinalFrame = duration === 0 || hold > 0 || endMs === duration;
  // Each encoded GCE delay is 16-bit. Count worker splits before allocating or sampling.
  const encodedFrames = count + (hasFinalFrame ? Math.max(1, Math.ceil(holdTicks / MAX_FRAME_DELAY_TICKS)) : 0);
  if (encodedFrames > MAX_ENCODED_FRAMES) throw new GifExportError("limit", "GIF requires more than 1801 encoded frames including final-hold splits; reduce finalHoldMs, duration or fps.");
  const endLeftTime = duration === 0 ? 0 : previousTime(endMs);
  const frames: GifFrame[] = [];
  for (let index = 0; index < count; index++) {
    const from = index * SECOND_MS / fps;
    const until = Math.min(effectiveDuration, (index + 1) * SECOND_MS / fps);
    frames.push({ timeMs: Math.min(endLeftTime, startMs + from * speed), delayMs: (Math.round(until / GIF_TIME_UNIT_MS) - Math.round(from / GIF_TIME_UNIT_MS)) * GIF_TIME_UNIT_MS });
  }
  const finalTime = endMs === duration ? endMs : endLeftTime;
  // Preserve the global completed state even when it has no additional hold delay.
  if (hasFinalFrame) frames.push({ timeMs: finalTime, delayMs: holdTicks * GIF_TIME_UNIT_MS });
  return { width: outputWidth, diagramHeight, height, captionHeight: Math.round(captionHeight), theme: options.theme ?? document.theme ?? "light", frames, startMs, endMs, reducedMotion: options.reducedMotion ?? false, loopCount };
}

/** Return the immediate predecessor of a positive finite time; epsilon subtraction can skip short beats. */
function previousTime(timeMs: number): number {
  const bits = new DataView(new ArrayBuffer(8));
  bits.setFloat64(0, timeMs);
  bits.setBigUint64(0, bits.getBigUint64(0) - 1n);
  return bits.getFloat64(0);
}
