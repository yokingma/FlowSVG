/** Shared deterministic paint values for core rendering and browser-only interaction feedback. */
export interface ThemePalette {
  background: string;
  fill: string;
  stroke: string;
  text: string;
  mutedText: string;
  tagText: string;
  tagFill: string;
  accentText: string;
  edge: string;
  /** Border and flow-marker emphasis; node interiors use highlightFill instead. */
  highlight: string;
  highlightFill: string;
  highlightText: string;
}

const LIGHT_PALETTE = {
  background: "#ffffff", fill: "#ffffff", stroke: "#cfd8e3", text: "#1d2939", mutedText: "#5a6473",
  tagText: "#1d4fa8", tagFill: "#eaf1ff", accentText: "#1d4fa8", edge: "#8892a4",
  highlight: "#2a63c8", highlightFill: "#eaf1ff", highlightText: "#ffffff"
} as const;
const DARK_PALETTE = {
  background: "#101828", fill: "#1d2939", stroke: "#475467", text: "#f2f4f7", mutedText: "#b8c2d1",
  tagText: "#caddff", tagFill: "#253b5c", accentText: "#9bbfff", edge: "#98a2b3",
  highlight: "#8ab4f8", highlightFill: "#233b60", highlightText: "#101828"
} as const;

export const DEFAULT_NODE_STROKE_WIDTH = 1.2;
export const NODE_CORNER_RADIUS = 8;
export const DIAGRAM_FONT_FAMILY = 'system-ui, -apple-system, "PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif';

/** Select a palette without consulting browser preferences. */
export function resolveThemePalette(theme: "light" | "dark" | undefined): ThemePalette {
  return theme === "dark" ? DARK_PALETTE : LIGHT_PALETTE;
}
