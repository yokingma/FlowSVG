/** Deterministic safe-area node labels shared by author-time measurement and evaluated frames. */
import type { ContentSafeArea } from "./node-content.js";
import type { TextLine } from "./model.js";
import { estimateTextWidth, findTextBreak, type TextMetrics } from "./typography.js";

const GRAPHEME_SEGMENTER = new Intl.Segmenter("en", { granularity: "grapheme" });
export const NODE_LABEL_OVERFLOW_TOLERANCE = 1e-6;

/** Preserve complete words when possible, but split an overwide token only between complete graphemes. */
export function wrapNodeLabel(label: string, width: number, metrics: TextMetrics): { lines: string[]; widthOverflow: boolean; height: number } {
  if (!label) return { lines: [], widthOverflow: false, height: 0 };
  const lines = label.split("\n").flatMap((paragraph) => wrapParagraph(paragraph, width, metrics));
  return { lines, widthOverflow: lines.some((line) => estimateTextWidth(line, metrics) > width), height: lines.length * metrics.lineHeight };
}

function wrapParagraph(paragraph: string, width: number, metrics: TextMetrics): string[] {
  if (!paragraph) return [""];
  const graphemes = Array.from(GRAPHEME_SEGMENTER.segment(paragraph), ({ segment }) => segment);
  const lines: string[] = [];
  let offset = 0;
  while (offset < graphemes.length) {
    let count = 0;
    let consumed = 0;
    while (offset + count < graphemes.length) {
      const next = estimateTextWidth(graphemes[offset + count]!, metrics);
      if (count > 0 && consumed + next > width) break;
      consumed += next;
      count += 1;
      if (consumed > width) break;
    }
    const remaining = graphemes.slice(offset);
    const cut = Math.min(count, findTextBreak(remaining, count));
    lines.push(remaining.slice(0, cut).join(""));
    offset += cut;
    while (offset < graphemes.length && /^\s+$/u.test(graphemes[offset]!)) offset += 1;
  }
  return lines;
}

/** Complete line boxes remain available even when the caller clips the painted label. */
export function placeNodeLabel(lines: readonly string[], safe: ContentSafeArea, metrics: TextMetrics): TextLine[] {
  const top = safe.y + safe.height / 2 - lines.length * metrics.lineHeight / 2;
  return lines.map((text, index) => ({ text, x: safe.x + safe.width / 2, y: top + index * metrics.lineHeight + metrics.fontSize }));
}
