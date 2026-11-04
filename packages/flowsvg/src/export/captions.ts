/** Browser caption layout shares system font fallback with diagram SVG and preserves explicit newlines. */
import type { Diagram } from "../core/diagram.js";
import { GifExportError } from "./types.js";
import type { GifPlan } from "./plan.js";
import { DIAGRAM_FONT_FAMILY } from "../core/theme.js";
import { findTextBreak } from "../core/typography.js";
export const CAPTION_FONT = `16px ${DIAGRAM_FONT_FAMILY}`;
export const CAPTION_LINE_HEIGHT = 22;
export const CAPTION_PADDING_X = 16;
export const CAPTION_PADDING_Y = 12;
/** Measure word-safe wrapping at the available text width; callers must first set CAPTION_FONT. */
export function wrapCaption(context: CanvasRenderingContext2D, text: string, width: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    let remaining = Array.from(paragraph);
    while (remaining.length > 0) {
      let count = 0;
      while (count < remaining.length && context.measureText(remaining.slice(0, count + 1).join("")).width <= width) count += 1;
      const cut = findTextBreak(remaining, count);
      lines.push(remaining.slice(0, cut).join(""));
      remaining = remaining.slice(cut);
      while (remaining[0] === " ") remaining = remaining.slice(1);
    }
    if (paragraph.length === 0) lines.push("");
  }
  return lines;
}

/** Effective plain text and the source location used in actionable overflow errors. */
export interface CaptionInterval { text: string; location: string }
/** Enumerate compiled half-open intervals rather than samples; core already resolves caption inheritance. */
export function collectCaptions(diagram: Diagram, startMs: number, endMs: number, staticCaption?: string): CaptionInterval[] {
  if (diagram.beats.length === 0) return [{ text: staticCaption ?? diagram.evaluateAt(0).caption ?? "", location: "static document title" }];
  return diagram.beats.filter((beat) => beat.startMs < endMs && beat.endMs > startMs).map((beat) => ({
    text: beat.caption ?? "", location: `scene "${beat.sceneId}", beat ${beat.beatIndex + 1}`
  }));
}
/** Measure every effective caption with the same fixed font, wrapping and spacing used by painting. */
export function preflightCaptions(context: CanvasRenderingContext2D, captions: CaptionInterval[], plan: GifPlan): void {
  context.font = CAPTION_FONT;
  const width = plan.width - CAPTION_PADDING_X * 2;
  const height = plan.captionHeight - CAPTION_PADDING_Y * 2;
  for (const { text, location } of captions) {
    if (text === "") continue;
    const lines = wrapCaption(context, text, width);
    if (lines.length * CAPTION_LINE_HEIGHT > height || lines.some((line) => context.measureText(line).width > width)) {
      throw new GifExportError("caption-overflow", `Caption overflows at ${location}; increase captionHeight or width, shorten the text, or disable captions.`);
    }
  }
}
