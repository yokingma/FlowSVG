/**
 * Shared node-content highlight paint for core timeline causes and browser-only hover.
 * Paint consumes evaluated geometry and preserves explicit author colors; it never lays out text again.
 */
import type { NodeContentLayout } from "./node-content.js";
const MIN_CONTENT_CONTRAST = 4.5;
const CONTRAST_DARK_INK = "#000000";
const CONTRAST_LIGHT_INK = "#ffffff";

/**
 * Retain theme-specific semantic ink and tag fills; preserve geometry and explicit author colors.
 * Check default ink against the evaluated fill because authored base fills can cross low-contrast transition colors.
 */
export function paintContentHighlight(layout: NodeContentLayout, amount: number, fill: string): NodeContentLayout {
  if (amount === 0) return layout;
  return {
    ...layout,
    ...(layout.graphs ? { graphs: layout.graphs.map((graph) => ({ ...graph,
      nodes: graph.nodes.map((node) => ({ ...node, fill: readableDefaultInk(node.fill, fill) })),
      edges: graph.edges.map((edge) => ({ ...edge, color: readableDefaultInk(edge.color, fill) }))
    })) } : {}),
    lines: layout.lines.map((line) => {
      const tag = line.role === "tag" ? layout.tags.find((candidate) => candidate.blockIndex === line.blockIndex
        && candidate.itemIndex === line.itemIndex && candidate.tagIndex === line.tagIndex) : undefined;
      const background = tag?.fill ?? fill;
      const paint = (color: string) => readableDefaultInk(color, background);
      const spans = line.spans.map((span) => ({ ...span, color: span.explicitColor ? span.color : paint(span.color) }));
      return { ...line, spans, color: spans[0]?.color ?? paint(line.color) };
    })
  };
}

/** Keep semantic ink when readable; otherwise select opaque dark/light ink without changing author colors. */
function readableDefaultInk(source: string, background: string): string {
  if (contrastRatio(source, background) >= MIN_CONTENT_CONTRAST) return source;
  return contrastRatio(CONTRAST_DARK_INK, background) >= contrastRatio(CONTRAST_LIGHT_INK, background)
    ? CONTRAST_DARK_INK : CONTRAST_LIGHT_INK;
}

function contrastRatio(first: string, second: string): number {
  const a = relativeLuminance(first), b = relativeLuminance(second);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/** Source colors are validated hexadecimal RGB/RGBA; only opaque default paints promise contrast. */
function relativeLuminance(color: string): number {
  const hex = color.slice(1);
  const rgb = hex.length <= 4 ? [...hex.slice(0, 3)].map((digit) => digit + digit).join("") : hex;
  const channels = [0, 2, 4].map((offset) => Number.parseInt(rgb.slice(offset, offset + 2), 16) / 255)
    .map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return channels[0]! * 0.2126 + channels[1]! * 0.7152 + channels[2]! * 0.0722;
}
