/**
 * Deterministic node-content model and layout. The core supplies current absolute node geometry and theme colors.
 * This module does not measure browser fonts or mutate authored dimensions; SVG consumes its evaluated lines and tag backgrounds.
 */
import { CONTENT_LINE_HEIGHT_RATIO } from "./typography.js";
import type { NodeKind, ValidationIssue } from "./model.js";
import { CYLINDER_CAP_RADIUS, type ThemePalette } from "./theme.js";

/** Horizontal placement within the current content safe area. */
export type ContentAlignment = "left" | "center" | "right";

/** Controlled text appearance; omitted sizes use the block's semantic role scaled by document node typography. Colors are hexadecimal RGB/RGBA. */
export interface ContentTextStyle {
  /** Positive finite font size in diagram units. */
  fontSize?: number;
  /** Integer weight from 100 through 900. */
  fontWeight?: number;
  color?: string;
  align?: ContentAlignment;
}

/** Controlled inline typography. Alignment belongs to the containing block. */
export type ContentSpanStyle = Pick<ContentTextStyle, "fontSize" | "fontWeight" | "color">;

/** Inline source text with optional appearance; adjacent spans share wrapping and baseline placement. */
export interface ContentTextSpan {
  text: string;
  style?: ContentSpanStyle;
}

/** Plain text or an ordered series of inline styled spans. No span creates an independent target. */
export type ContentText = string | ContentTextSpan[];

/** Controlled tag typography and optional background; tags remain left-aligned within the item. */
export interface ContentTagStyle extends ContentSpanStyle {
  fill?: string;
  /** Rounded corners by default; pill uses half the final tag height without changing text layout. */
  shape?: "rounded" | "pill";
}

/** A decorative text tag, without an independent identity or interaction. */
export interface ContentTag {
  text: ContentText;
  style?: ContentTagStyle;
}

/** One list entry; absent parts consume no height. Explicit empty text preserves an authored line. */
export interface ContentListItem {
  tags?: ContentTag[];
  status?: ContentText;
  /** Status is always right-aligned; its 12-unit default scales with document node typography. */
  statusStyle?: ContentSpanStyle;
  body?: ContentText;
  auxiliary?: ContentText;
  /** Body typography; overrides the containing list style. */
  style?: ContentTextStyle;
  /** Auxiliary typography; its muted 12-unit default scales with document node typography. */
  auxiliaryStyle?: ContentTextStyle;
}

/** Controlled list typography with a nonnegative item gap, defaulting to 12 diagram units. */
export interface ContentListStyle extends ContentTextStyle {
  itemGap?: number;
  /** Space between tags and between wrapped tag rows; defaults to 6. */
  tagGap?: number;
}

/** Decorative entity; x/y are center offsets from the graph block's top left, in diagram units. */
export interface ContentGraphNode {
  id: string;
  label: string;
  x: number;
  y: number;
  highlighted?: boolean;
}

/** Undirected relation with IDs local to its graph block. */
export interface ContentGraphEdge { from: string; to: string }

/** Fixed-height entity graph with authored coordinates and no independent hit targets. */
export interface ContentGraphBlock {
  type: "graph";
  height: number;
  nodes: ContentGraphNode[];
  edges: ContentGraphEdge[];
}

/** Absolute graph primitives sharing the parent content clip. */
export interface ContentGraphLayout {
  blockIndex: number;
  nodes: { x: number; y: number; radius: number; fill: string; highlighted: boolean }[];
  edges: { x1: number; y1: number; x2: number; y2: number; color: string; highlighted: boolean }[];
}

/** One ordered title, paragraph, list or entity graph. */
export type ContentBlock =
  | {
    type: "title";
    text: ContentText;
    style?: ContentTextStyle;
  }
  | {
    type: "paragraph";
    text: ContentText;
    role?: "body" | "auxiliary";
    style?: ContentTextStyle;
  }
  | {
    type: "list";
    /** Omitted markers use unmarked records. */
    marker?: "none" | "bullet" | "number";
    items: ContentListItem[];
    style?: ContentListStyle;
  }
  | ContentGraphBlock;

/** Ordered fixed-node content. It replaces the simple label and never changes node dimensions. */
export interface NodeContent {
  blocks: ContentBlock[];
  style?: {
    /** Uniform inset in diagram units; defaults to 16. */
    padding?: number;
    /** Vertical space between content blocks in diagram units; defaults to 14. */
    blockGap?: number;
  };
}

/** Absolute rectangular clip region; empty safe areas have zero width or height. */
export interface ContentSafeArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** One evaluated inline span. x is its left edge and y is its shared line baseline. */
export interface ContentSpan {
  text: string;
  x: number;
  y: number;
  width: number;
  fontSize: number;
  fontWeight: number;
  color: string;
  /** True when a block or source span supplied this color; highlight paint preserves it. */
  explicitColor: boolean;
}

/** One evaluated text line. x is the alignment anchor and y is the SVG baseline, in document units. */
export interface ContentLine {
  spans: ContentSpan[];
  text: string;
  x: number;
  y: number;
  width: number;
  fontSize: number;
  fontWeight: number;
  color: string;
  align: ContentAlignment;
  role: "title" | "body" | "auxiliary" | "marker" | "tag" | "status";
  blockIndex: number;
  /** Zero-based authored entry index; skipped empty entries do not renumber later entries. */
  itemIndex?: number;
  /** Zero-based authored tag index, present only for tag lines. */
  tagIndex?: number;
}

/** Evaluated tag background, in absolute diagram units; paint preserves authored fills. */
export interface ContentTagBackground extends ContentSafeArea {
  fill: string;
  explicitFill: boolean;
  /** Omitted shape uses the default rounded corners; pill follows the final aligned height. */
  shape?: ContentTagStyle["shape"];
  blockIndex: number;
  itemIndex: number;
  tagIndex: number;
}

/** Complete layout before clipping; overflow flags report estimated width and height independently. */
export interface NodeContentLayout {
  safeArea: ContentSafeArea;
  lines: ContentLine[];
  tags: ContentTagBackground[];
  graphs?: ContentGraphLayout[];
  widthOverflow: boolean;
  heightOverflow: boolean;
}

const DEFAULT_PADDING = 16;
const ROUNDED_RECT_INSET = 4;
const DEFAULT_BLOCK_GAP = 14;
const DEFAULT_ITEM_GAP = 12;
const DEFAULT_TAG_GAP = 6;
const TAG_SIZE = 11;
const TAG_PADDING_X = 6;
const TAG_PADDING_Y = 2;
const LIST_MARKER_GAP = 8;
const OVERFLOW_TOLERANCE = 0.000001;
const MIN_LINE_HEIGHT = 20;
const TITLE_SIZE = 20;
const BODY_SIZE = 14;
const AUXILIARY_SIZE = 12;
const TITLE_WEIGHT = 700;
const NORMAL_WEIGHT = 400;
const MIN_FONT_WEIGHT = 100;
const MAX_FONT_WEIGHT = 900;
const NARROW_GLYPH_WIDTH_RATIO = 0.6;
const GRAPH_NODE_RADIUS = 4;
const GRAPH_LABEL_GAP = 7;
const GRAPH_LABEL_SIZE = 12;
const GRAPHEME_SEGMENTER = new Intl.Segmenter("en", { granularity: "grapheme" });

/** Supported content shapes; node validators share this restriction. */
export function supportsNodeContent(kind: unknown): boolean {
  return kind === "rect" || kind === "roundedRect" || kind === "cylinder";
}

/** Derive the clip from current absolute geometry, reserving shape contours before authored padding. */
function contentSafeArea(bounds: ContentSafeArea, padding: number, kind: NodeKind): ContentSafeArea {
  const cornerInset = kind === "roundedRect" ? ROUNDED_RECT_INSET : 0;
  // Match the current SVG cylinder cap; reserve its full diameter above and below the content.
  const capInset = kind === "cylinder" ? Math.min(CYLINDER_CAP_RADIUS, bounds.height / 4) * 2 : 0;
  const horizontalInset = padding + cornerInset;
  const verticalInset = horizontalInset + capInset;
  return {
    x: bounds.x + horizontalInset,
    y: bounds.y + verticalInset,
    width: Math.max(0, bounds.width - horizontalInset * 2),
    height: Math.max(0, bounds.height - verticalInset * 2)
  };
}

/** Lay out current content from the top left, without DOM font measurement or authored-size changes. */
export function layoutNodeContent(content: NodeContent, bounds: ContentSafeArea, palette: ThemePalette, kind: NodeKind, defaultFontScale = 1): NodeContentLayout {
  return layoutNodeContentWithMetrics(content, bounds, palette, kind, defaultFontScale).layout;
}

/**
 * Internal layout shared by fixed-size evaluation and author-time measurement.
 * contentHeight includes complete line boxes, padded tags, graph block heights and all authored gaps.
 * defaultFontScale applies only to omitted role sizes, before explicit block/item/span overrides. Geometry and gaps stay authored.
 * overflows retain only width limits and graph-internal height limits; outer node height remains adjustable.
 */
export function layoutNodeContentWithMetrics(content: NodeContent, bounds: ContentSafeArea, palette: ThemePalette, kind: NodeKind, defaultFontScale = 1): {
  layout: NodeContentLayout;
  contentHeight: number;
  overflows: { blockIndex: number; dimension: "width" | "height" }[];
} {
  const safeArea = contentSafeArea(bounds, content.style?.padding ?? DEFAULT_PADDING, kind);
  let cursorY = safeArea.y;
  let widthOverflow = false;
  let heightOverflow = false;
  const tags: ContentTagBackground[] = [];
  const graphs: ContentGraphLayout[] = [];
  const overflows: { blockIndex: number; dimension: "width" | "height" }[] = [];
  const lines = content.blocks.flatMap((block, blockIndex) => {
    const result = block.type === "graph"
      ? layoutContentGraph(block, safeArea, cursorY, palette, blockIndex, graphs, defaultFontScale)
      : block.type === "list"
      ? layoutContentList(block, safeArea, cursorY, palette, blockIndex, defaultFontScale)
      : layoutTextPart(block.text, block.type === "title" ? "title" : block.role ?? "body", block.style, safeArea, cursorY, palette, blockIndex, undefined, 0, defaultFontScale);
    const blockWidthOverflow = result.widthOverflow || result.lines.some((line) => contentLineExceedsWidth(line, safeArea));
    if (blockWidthOverflow) overflows.push({ blockIndex, dimension: "width" });
    if (result.heightOverflow) overflows.push({ blockIndex, dimension: "height" });
    widthOverflow ||= blockWidthOverflow;
    heightOverflow ||= result.heightOverflow ?? false;
    tags.push(...result.tags);
    cursorY = result.bottom + (blockIndex < content.blocks.length - 1 ? content.style?.blockGap ?? DEFAULT_BLOCK_GAP : 0);
    return result.lines;
  });
  return { contentHeight: cursorY - safeArea.y, overflows, layout: {
    safeArea, lines, tags, ...(graphs.length ? { graphs } : {}),
    widthOverflow,
    // Authored positions change accumulation rounding; use the same geometric tolerance as width checks.
    heightOverflow: heightOverflow || cursorY > safeArea.y + safeArea.height + OVERFLOW_TOLERANCE
  } };
}

/** Graph labels reuse text metrics; authored graph geometry is clipped instead of resized. */
function layoutContentGraph(block: ContentGraphBlock, area: ContentSafeArea, top: number, palette: ThemePalette,
  blockIndex: number, graphs: ContentGraphLayout[], defaultFontScale: number): ContentPartLayout {
  const graphLabelSize = GRAPH_LABEL_SIZE * defaultFontScale;
  const points = new Map(block.nodes.map((node) => [node.id, { x: area.x + node.x, y: top + node.y }]));
  const nodes = block.nodes.map((node) => ({ ...points.get(node.id)!, radius: GRAPH_NODE_RADIUS,
    fill: node.highlighted ? palette.accentText : palette.mutedText, highlighted: node.highlighted ?? false }));
  const edges = block.edges.map((edge) => {
    const from = points.get(edge.from)!, to = points.get(edge.to)!;
    const highlighted = [edge.from, edge.to].every((id) => block.nodes.find((node) => node.id === id)?.highlighted);
    return { x1: from.x, y1: from.y, x2: to.x, y2: to.y, color: highlighted ? palette.accentText : palette.mutedText, highlighted };
  });
  const parts = block.nodes.map((node) => {
    const halfWidth = Math.max(0, Math.min(node.x, area.width - node.x));
    const labelArea = { ...area, x: area.x + node.x - halfWidth, width: halfWidth * 2 };
    return layoutTextPart(node.label, "body", { fontSize: graphLabelSize, fontWeight: node.highlighted ? 700 : 400, align: "center" },
      labelArea, top + node.y - GRAPH_NODE_RADIUS - GRAPH_LABEL_GAP - graphLabelSize, palette, blockIndex);
  });
  graphs.push({ blockIndex, nodes, edges });
  return { lines: parts.flatMap((part) => part.lines), tags: [],
    bottom: top + block.height,
    // Recovering a label top from its absolute baseline can round across the block boundary.
    heightOverflow: parts.some((part) => part.lines.some((line) => line.y - line.fontSize < top - OVERFLOW_TOLERANCE)
      || part.bottom > top + block.height)
      || block.nodes.some((node) => node.y - GRAPH_NODE_RADIUS < 0 || node.y + GRAPH_NODE_RADIUS > block.height),
    widthOverflow: parts.some((part) => part.widthOverflow) || block.nodes.some((node) => node.x < GRAPH_NODE_RADIUS
      || node.x + GRAPH_NODE_RADIUS > area.width) };
}

/** Include list indentation when checking the clip; a single oversized grapheme may exceed the body column. */
function contentLineExceedsWidth(line: ContentLine, area: ContentSafeArea): boolean {
  return line.width > area.width || line.spans.some((span) => span.x < area.x - OVERFLOW_TOLERANCE
    || span.x + span.width > area.x + area.width + OVERFLOW_TOLERANCE);
}

interface ContentPartLayout {
  lines: ContentLine[];
  tags: ContentTagBackground[];
  bottom: number;
  widthOverflow: boolean;
  heightOverflow?: boolean;
}

/**
 * Scale role defaults before authored overrides and reuse baseline/wrapping rules for every text part.
 * A marked item's first line also reserves its marker size, so smaller source spans cannot lift the marker above the clip.
 */
function layoutTextPart(text: ContentText, role: ContentLine["role"], style: ContentTextStyle | undefined, area: ContentSafeArea,
  top: number, palette: ThemePalette, blockIndex: number, itemIndex?: number, minimumFirstLineSize = 0, defaultFontScale = 1): ContentPartLayout {
  const fontSize = style?.fontSize ?? (role === "title" ? TITLE_SIZE : role === "auxiliary" || role === "status" ? AUXILIARY_SIZE : role === "tag" ? TAG_SIZE : BODY_SIZE) * defaultFontScale;
  const fontWeight = style?.fontWeight ?? (role === "title" ? TITLE_WEIGHT : NORMAL_WEIGHT);
  const color = style?.color ?? (role === "auxiliary" ? palette.mutedText : role === "tag" ? palette.tagText : role === "status" ? palette.accentText : palette.text);
  const align = style?.align ?? "left";
  const x = area.x + (align === "right" ? area.width : align === "center" ? area.width / 2 : 0);
  const wrapped = wrapContentText(text, area.width, { fontSize, fontWeight, color, explicitColor: style?.color !== undefined });
  let cursorY = top;
  const lines = wrapped.map((glyphs, lineIndex): ContentLine => {
    const textSize = glyphs.length > 0 ? glyphs.reduce((largest, glyph) => Math.max(largest, glyph.style.fontSize), 0) : fontSize;
    const size = Math.max(textSize, lineIndex === 0 ? minimumFirstLineSize : 0);
    const width = glyphs.reduce((sum, glyph) => sum + glyph.width, 0);
    const y = cursorY + size;
    const startX = x - (align === "right" ? width : align === "center" ? width / 2 : 0);
    const spans = collectContentSpans(glyphs, startX, y);
    cursorY += Math.max(MIN_LINE_HEIGHT, size * CONTENT_LINE_HEIGHT_RATIO);
    return { text: glyphs.map((glyph) => glyph.text).join(""), spans, x, y, width,
      fontSize: size, fontWeight, color, align, role, blockIndex, ...(itemIndex === undefined ? {} : { itemIndex }) };
  });
  return { lines, tags: [], bottom: cursorY, widthOverflow: lines.some((line) => line.width > area.width) };
}

function layoutContentList(block: Extract<ContentBlock, { type: "list" }>, area: ContentSafeArea, top: number,
  palette: ThemePalette, blockIndex: number, defaultFontScale: number): ContentPartLayout {
  let cursorY = top;
  const lines: ContentLine[] = [];
  const tags: ContentTagBackground[] = [];
  let widthOverflow = false;
  const markerWidth = contentMarkerWidth(block, defaultFontScale);
  const indent = markerWidth > 0 ? markerWidth + LIST_MARKER_GAP : 0;
  const bodyArea = { ...area, x: area.x + indent, width: Math.max(0, area.width - indent) };
  block.items.forEach((item, itemIndex) => {
    if (!hasContentItem(item)) return;
    if (lines.length > 0) cursorY += block.style?.itemGap ?? DEFAULT_ITEM_GAP;
    const itemStart = lines.length;
    const markerSize = markerWidth === 0 ? 0 : item.body === undefined ? item.auxiliaryStyle?.fontSize ?? AUXILIARY_SIZE * defaultFontScale
      : item.style?.fontSize ?? block.style?.fontSize ?? BODY_SIZE * defaultFontScale;
    const header = layoutItemHeader(item, bodyArea, cursorY, palette, blockIndex, itemIndex, block.style?.tagGap ?? DEFAULT_TAG_GAP, markerSize, defaultFontScale);
    lines.push(...header.lines);
    tags.push(...header.tags);
    widthOverflow ||= header.widthOverflow;
    cursorY = header.bottom;
    if (item.body !== undefined) {
      const body = layoutTextPart(item.body, "body", inheritContentStyle(block.style, item.style), bodyArea, cursorY, palette, blockIndex, itemIndex, markerSize, defaultFontScale);
      lines.push(...body.lines);
      widthOverflow ||= body.widthOverflow;
      cursorY = body.bottom;
    }
    if (item.auxiliary !== undefined) {
      const auxiliary = layoutTextPart(item.auxiliary, "auxiliary", item.auxiliaryStyle, bodyArea, cursorY, palette, blockIndex, itemIndex, item.body === undefined ? markerSize : 0, defaultFontScale);
      lines.push(...auxiliary.lines);
      widthOverflow ||= auxiliary.widthOverflow;
      cursorY = auxiliary.bottom;
    }
    if (markerWidth > 0) {
      const first = lines[itemStart]!;
      const style = item.body === undefined ? item.auxiliaryStyle : inheritContentStyle(block.style, item.style);
      const marker = layoutTextPart(block.marker === "bullet" ? "•" : `${itemIndex + 1}.`, "marker",
        { ...style, fontSize: style?.fontSize ?? (item.body === undefined ? AUXILIARY_SIZE : BODY_SIZE) * defaultFontScale, align: "left" },
        { ...area, width: markerWidth }, top, palette, blockIndex, itemIndex).lines[0]!;
      lines.splice(itemStart, 0, { ...marker, y: first.y, spans: marker.spans.map((span) => ({ ...span, y: first.y })) });
    }
  });
  return { lines, tags, bottom: cursorY, widthOverflow };
}

/** Tags occupy rows first. Status shares a single row only when both natural widths fit. */
function layoutItemHeader(item: ContentListItem, area: ContentSafeArea, top: number, palette: ThemePalette,
  blockIndex: number, itemIndex: number, gap: number, markerSize: number, defaultFontScale: number): ContentPartLayout {
  const header = layoutContentTags(item.tags ?? [], area, top, palette, blockIndex, itemIndex, gap, markerSize, defaultFontScale);
  if (item.status === undefined) return header;
  const statusWidth = naturalContentWidth(item.status, item.statusStyle, AUXILIARY_SIZE * defaultFontScale);
  const lastTag = header.tags.at(-1);
  const occupied = lastTag ? lastTag.x + lastTag.width - area.x : 0;
  const singleTagRow = header.tags.every((tag) => tag.y === top) && header.lines.length === header.tags.length;
  const singleStatusLine = !contentTextString(item.status).match(/[\r\n]/);
  const sameRow = singleTagRow && singleStatusLine && occupied + (lastTag ? gap : 0) + statusWidth <= area.width;
  const statusTop = sameRow ? top : header.bottom;
  let status = layoutTextPart(item.status, "status", { ...item.statusStyle, align: "right" }, area, statusTop, palette, blockIndex, itemIndex, markerSize, defaultFontScale);
  let tags = header;
  if (sameRow && header.lines.length > 0) {
    const baseline = Math.max(...header.lines.map((line) => line.y), status.lines[0]!.y);
    tags = shiftTagText(header, baseline - header.lines[0]!.y);
    status = shiftContentPart(status, baseline - status.lines[0]!.y);
  }
  return { lines: [...tags.lines, ...status.lines], tags: tags.tags,
    bottom: Math.max(tags.bottom, status.bottom), widthOverflow: tags.widthOverflow || status.widthOverflow };
}

/** Pack tag boxes in authored order; a long tag wraps inside its own padded full-width box. */
function layoutContentTags(source: ContentTag[], area: ContentSafeArea, top: number, palette: ThemePalette,
  blockIndex: number, itemIndex: number, gap: number, markerSize: number, defaultFontScale: number): ContentPartLayout {
  let row: { tag: ContentTag; tagIndex: number; width: number; x: number }[] = [];
  let right = area.x;
  let result: ContentPartLayout = { lines: [], tags: [], bottom: top, widthOverflow: false };
  const flush = () => {
    if (row.length === 0) return;
    const rowTop = result.tags.length > 0 ? result.bottom + gap : top;
    const parts = row.map(({ tag, tagIndex, width, x }) => layoutContentTag(tag,
      { ...area, x, width }, rowTop, palette, blockIndex, itemIndex, tagIndex, markerSize, defaultFontScale));
    const baseline = Math.max(...parts.map((part) => part.lines[0]!.y));
    const aligned = parts.map((part) => shiftTagText(part, baseline - part.lines[0]!.y));
    result = { lines: [...result.lines, ...aligned.flatMap((part) => part.lines)],
      tags: [...result.tags, ...aligned.flatMap((part) => part.tags)], bottom: Math.max(...aligned.map((part) => part.bottom)),
      widthOverflow: result.widthOverflow || aligned.some((part) => part.widthOverflow) };
    row = [];
    right = area.x;
  };
  source.forEach((tag, tagIndex) => {
    const width = Math.min(area.width, naturalContentWidth(tag.text, tag.style, TAG_SIZE * defaultFontScale) + TAG_PADDING_X * 2);
    if (row.length > 0 && right + width > area.x + area.width) flush();
    row.push({ tag, tagIndex, width, x: right });
    right += width + gap;
  });
  flush();
  return result;
}

function layoutContentTag(tag: ContentTag, area: ContentSafeArea, top: number, palette: ThemePalette,
  blockIndex: number, itemIndex: number, tagIndex: number, markerSize: number, defaultFontScale: number): ContentPartLayout {
  const textArea = { ...area, x: area.x + TAG_PADDING_X, width: Math.max(0, area.width - TAG_PADDING_X * 2) };
  const result = layoutTextPart(tag.text, "tag", tag.style, textArea, top + TAG_PADDING_Y, palette, blockIndex, itemIndex, markerSize, defaultFontScale);
  return { ...result, widthOverflow: result.widthOverflow || area.width < TAG_PADDING_X * 2,
    lines: result.lines.map((line) => ({ ...line, tagIndex })), bottom: result.bottom + TAG_PADDING_Y,
    tags: [{ x: area.x, y: top, width: area.width, height: result.bottom - top + TAG_PADDING_Y,
      fill: tag.style?.fill ?? palette.tagFill, explicitFill: tag.style?.fill !== undefined,
      ...(tag.style?.shape === undefined ? {} : { shape: tag.style.shape }), blockIndex, itemIndex, tagIndex }] };
}

/** Baseline shifts preserve line spacing and expand tag backgrounds instead of moving the row boundary. */
function shiftTagText(part: ContentPartLayout, offset: number): ContentPartLayout {
  return { ...shiftContentPart(part, offset), tags: part.tags.map((tag) => ({ ...tag, height: tag.height + offset })) };
}

function shiftContentPart(part: ContentPartLayout, offset: number): ContentPartLayout {
  return { ...part, bottom: part.bottom + offset,
    lines: part.lines.map((line) => ({ ...line, y: line.y + offset, spans: line.spans.map((span) => ({ ...span, y: span.y + offset })) })) };
}

function contentTextString(text: ContentText): string {
  return typeof text === "string" ? text : text.map((span) => span.text).join("");
}

function naturalContentWidth(text: ContentText, style: ContentSpanStyle | undefined, defaultSize: number): number {
  const wrapped = wrapContentText(text, Number.MAX_VALUE, { fontSize: style?.fontSize ?? defaultSize,
    fontWeight: style?.fontWeight ?? NORMAL_WEIGHT, color: style?.color ?? "#000000", explicitColor: style?.color !== undefined });
  return Math.max(0, ...wrapped.map((glyphs) => glyphs.reduce((sum, glyph) => sum + glyph.width, 0)));
}

function hasContentItem(item: ContentListItem): boolean {
  return item.body !== undefined || item.auxiliary !== undefined || item.status !== undefined || (item.tags?.length ?? 0) > 0;
}

/** Every item uses the same marker column, including multi-digit numbers and authored marker sizes. */
function contentMarkerWidth(block: Extract<ContentBlock, { type: "list" }>, defaultFontScale: number): number {
  if (block.marker === undefined || block.marker === "none") return 0;
  return block.items.reduce((width, item, index) => {
    if (!hasContentItem(item)) return width;
    const size = item.body === undefined ? item.auxiliaryStyle?.fontSize ?? AUXILIARY_SIZE * defaultFontScale
      : item.style?.fontSize ?? block.style?.fontSize ?? BODY_SIZE * defaultFontScale;
    return Math.max(width, estimateContentWidth(block.marker === "bullet" ? "•" : `${index + 1}.`, size));
  }, 0);
}

function inheritContentStyle(base: ContentTextStyle | undefined, override: ContentTextStyle | undefined): ContentTextStyle {
  return { fontSize: override?.fontSize ?? base?.fontSize, fontWeight: override?.fontWeight ?? base?.fontWeight,
    color: override?.color ?? base?.color, align: override?.align ?? base?.align };
}

interface ResolvedContentStyle {
  fontSize: number;
  fontWeight: number;
  color: string;
  explicitColor: boolean;
}

interface ContentGlyph {
  text: string;
  width: number;
  sourceIndex: number;
  style: ResolvedContentStyle;
}

/** Wrap combined source text, so a style boundary never creates an extra break opportunity. */
function wrapContentText(text: ContentText, maxWidth: number, baseStyle: ResolvedContentStyle): ContentGlyph[][] {
  const sources = typeof text === "string" ? [{ text }] : text;
  const glyphs = segmentContentText(sources, baseStyle);
  const explicitLines: ContentGlyph[][] = [[]];
  glyphs.forEach((glyph) => {
    if (/^\r\n$|^[\r\n]$/.test(glyph.text)) explicitLines.push([]);
    else explicitLines.at(-1)!.push(glyph);
  });
  return explicitLines.flatMap((line) => wrapContentGlyphs(line, maxWidth));
}

/** Segment concatenated text before styling: a cluster crossing spans uses its first character's style. */
function segmentContentText(sources: ContentTextSpan[], baseStyle: ResolvedContentStyle): ContentGlyph[] {
  const combined = sources.map((source) => source.text).join("");
  let sourceIndex = 0;
  let sourceEnd = sources[0]?.text.length ?? 0;
  return Array.from(GRAPHEME_SEGMENTER.segment(combined), ({ segment: text, index }) => {
    while (index >= sourceEnd && sourceIndex < sources.length - 1) {
      sourceIndex += 1;
      sourceEnd += sources[sourceIndex]!.text.length;
    }
    const sourceStyle = sources[sourceIndex]?.style;
    const style = { ...baseStyle, ...sourceStyle, explicitColor: sourceStyle?.color !== undefined || baseStyle.explicitColor };
    return { text, sourceIndex, style, width: estimateContentWidth(text, style.fontSize) };
  });
}

/** Prefer English spaces; fallback always consumes one character even when the safe area is empty. */
function wrapContentGlyphs(glyphs: ContentGlyph[], maxWidth: number): ContentGlyph[][] {
  let remaining = glyphs;
  const lines: ContentGlyph[][] = [];
  while (remaining.length > 0) {
    let count = 0;
    let width = 0;
    while (count < remaining.length && width + remaining[count]!.width <= maxWidth) {
      width += remaining[count]!.width;
      count += 1;
    }
    if (count >= remaining.length) {
      lines.push(remaining);
      break;
    }
    const space = remaining.slice(0, count + 1).map((glyph) => glyph.text).lastIndexOf(" ");
    const cut = space > 0 ? space : Math.max(1, count);
    lines.push(remaining.slice(0, cut));
    remaining = remaining.slice(cut);
    while (remaining[0]?.text === " ") remaining = remaining.slice(1);
  }
  return lines.length > 0 ? lines : [[]];
}

function collectContentSpans(glyphs: ContentGlyph[], x: number, y: number): ContentSpan[] {
  const spans: ContentSpan[] = [];
  let cursorX = x;
  let sourceIndex = -1;
  for (const glyph of glyphs) {
    const previous = spans.at(-1);
    if (previous && sourceIndex === glyph.sourceIndex) {
      spans[spans.length - 1] = { ...previous, text: previous.text + glyph.text, width: previous.width + glyph.width };
    } else spans.push({ text: glyph.text, x: cursorX, y, width: glyph.width, ...glyph.style });
    cursorX += glyph.width;
    sourceIndex = glyph.sourceIndex;
  }
  return spans;
}

/** Emoji sequences occupy one em; combining marks and format controls do not add independent advance. */
function estimateContentWidth(text: string, fontSize: number): number {
  if (text === "•") return fontSize * NARROW_GLYPH_WIDTH_RATIO;
  if (/\p{Extended_Pictographic}|\p{Regional_Indicator}|\u20e3/u.test(text)) return fontSize;
  return Array.from(text).filter((character) => !/\p{Mark}|\p{Default_Ignorable_Code_Point}/u.test(character))
    .reduce((width, character) => width + fontSize * (character.codePointAt(0)! > 0xff || "MWmw@%".includes(character) ? 1 : NARROW_GLYPH_WIDTH_RATIO), 0);
}

/** Validate nested content separately from shape and label-mode checks at the document boundary. */
export function validateNodeContent(value: unknown, path: string, issues: ValidationIssue[]): void {
  if (!isRecord(value)) {
    issues.push({ path, message: "must be an object" });
    return;
  }
  rejectUnknownFields(value, ["blocks", "style"], path, issues);
  if (!Array.isArray(value.blocks)) {
    issues.push({ path: `${path}.blocks`, message: "must be an array" });
    return;
  }
  validateContentSpacing(value.style, `${path}.style`, issues);
  for (let index = 0; index < value.blocks.length; index += 1) {
    if (!(index in value.blocks)) issues.push({ path: `${path}.blocks[${index}]`, message: "must be a value" });
  }
  value.blocks.forEach((block: unknown, index: number) => {
    const blockPath = `${path}.blocks[${index}]`;
    if (!isRecord(block)) {
      issues.push({ path: blockPath, message: "must be an object" });
      return;
    }
    if (block.type === "list") {
      validateContentList(block, blockPath, issues);
      return;
    }
    if (block.type === "graph") {
      validateContentGraph(block, blockPath, issues);
      return;
    }
    rejectUnknownFields(block, block.type === "paragraph" ? ["type", "text", "role", "style"] : ["type", "text", "style"], blockPath, issues);
    if (block.type !== "title" && block.type !== "paragraph") issues.push({ path: `${blockPath}.type`, message: "must be title, paragraph, list or graph" });
    validateContentText(block.text, `${blockPath}.text`, issues);
    validateContentTextStyle(block.style, `${blockPath}.style`, issues);
    if (block.role !== undefined && block.role !== "body" && block.role !== "auxiliary") issues.push({ path: `${blockPath}.role`, message: "must be body or auxiliary" });
  });
}

function validateContentGraph(block: Record<string, unknown>, path: string, issues: ValidationIssue[]): void {
  rejectUnknownFields(block, ["type", "height", "nodes", "edges"], path, issues);
  validateSpacingNumber(block.height, `${path}.height`, issues, true);
  const ids = new Set<string>();
  if (!Array.isArray(block.nodes)) issues.push({ path: `${path}.nodes`, message: "must be an array" });
  else for (let index = 0; index < block.nodes.length; index += 1) {
    const node: unknown = block.nodes[index];
    const nodePath = `${path}.nodes[${index}]`;
    if (!isRecord(node)) { issues.push({ path: nodePath, message: "must be an object" }); continue; }
    rejectUnknownFields(node, ["id", "label", "x", "y", "highlighted"], nodePath, issues);
    if (typeof node.id !== "string" || !node.id.trim() || ids.has(node.id)) issues.push({ path: `${nodePath}.id`, message: "must be a unique nonempty local ID" });
    else ids.add(node.id);
    if (typeof node.label !== "string") issues.push({ path: `${nodePath}.label`, message: "must be a string" });
    for (const field of ["x", "y"] as const) validateSpacingNumber(node[field], `${nodePath}.${field}`, issues);
    if (node.highlighted !== undefined && typeof node.highlighted !== "boolean") issues.push({ path: `${nodePath}.highlighted`, message: "must be a boolean" });
  }
  if (!Array.isArray(block.edges)) { issues.push({ path: `${path}.edges`, message: "must be an array" }); return; }
  for (let index = 0; index < block.edges.length; index += 1) {
    const edge: unknown = block.edges[index];
    const edgePath = `${path}.edges[${index}]`;
    if (!isRecord(edge)) { issues.push({ path: edgePath, message: "must be an object" }); continue; }
    rejectUnknownFields(edge, ["from", "to"], edgePath, issues);
    for (const field of ["from", "to"] as const) {
      if (typeof edge[field] !== "string" || !ids.has(edge[field])) issues.push({ path: `${edgePath}.${field}`, message: "must reference a node in this graph block" });
    }
  }
}

/** List entries share controlled text validation and preserve the exact nested source path. */
function validateContentList(block: Record<string, unknown>, path: string, issues: ValidationIssue[]): void {
  rejectUnknownFields(block, ["type", "marker", "items", "style"], path, issues);
  if (block.marker !== undefined && block.marker !== "none" && block.marker !== "bullet" && block.marker !== "number") {
    issues.push({ path: `${path}.marker`, message: "must be none, bullet or number" });
  }
  if (isRecord(block.style)) {
    const { itemGap, tagGap, ...textStyle } = block.style;
    validateContentTextStyle(textStyle, `${path}.style`, issues);
    if (itemGap !== undefined) validateSpacingNumber(itemGap, `${path}.style.itemGap`, issues);
    if (tagGap !== undefined) validateSpacingNumber(tagGap, `${path}.style.tagGap`, issues);
  } else validateContentTextStyle(block.style, `${path}.style`, issues);
  if (!Array.isArray(block.items)) {
    issues.push({ path: `${path}.items`, message: "must be an array" });
    return;
  }
  for (let index = 0; index < block.items.length; index += 1) {
    const item: unknown = block.items[index];
    const itemPath = `${path}.items[${index}]`;
    if (!isRecord(item)) {
      issues.push({ path: itemPath, message: "must be an object" });
      continue;
    }
    rejectUnknownFields(item, ["body", "auxiliary", "style", "auxiliaryStyle", "tags", "status", "statusStyle"], itemPath, issues);
    if (item.body !== undefined) validateContentText(item.body, `${itemPath}.body`, issues);
    if (item.auxiliary !== undefined) validateContentText(item.auxiliary, `${itemPath}.auxiliary`, issues);
    validateContentTags(item.tags, `${itemPath}.tags`, issues);
    if (item.status !== undefined) validateContentText(item.status, `${itemPath}.status`, issues);
    validateContentTextStyle(item.statusStyle, `${itemPath}.statusStyle`, issues, true);
    validateContentTextStyle(item.style, `${itemPath}.style`, issues);
    validateContentTextStyle(item.auxiliaryStyle, `${itemPath}.auxiliaryStyle`, issues);
  }
}

/** Validate finite tag styles while preserving the exact authored tag and inline-span paths. */
function validateContentTags(value: unknown, path: string, issues: ValidationIssue[]): void {
  if (value === undefined) return;
  if (!Array.isArray(value)) {
    issues.push({ path, message: "must be an array" });
    return;
  }
  for (let index = 0; index < value.length; index += 1) {
    const tag: unknown = value[index];
    const tagPath = `${path}[${index}]`;
    if (!isRecord(tag)) {
      issues.push({ path: tagPath, message: "must be an object" });
      continue;
    }
    rejectUnknownFields(tag, ["text", "style"], tagPath, issues);
    validateContentText(tag.text, `${tagPath}.text`, issues);
    if (!isRecord(tag.style)) {
      validateContentTextStyle(tag.style, `${tagPath}.style`, issues, true);
      continue;
    }
    const { fill, shape, ...textStyle } = tag.style;
    validateContentTextStyle(textStyle, `${tagPath}.style`, issues, true);
    if (fill !== undefined) validateColor(fill, `${tagPath}.style.fill`, issues);
    if (shape !== undefined && shape !== "rounded" && shape !== "pill") {
      issues.push({ path: `${tagPath}.style.shape`, message: "must be rounded or pill" });
    }
  }
}

/** Validate inline source values before evaluation; unknown fields keep their exact source position. */
export function validateContentText(value: unknown, path: string, issues: ValidationIssue[]): void {
  if (typeof value === "string") return;
  if (!Array.isArray(value)) {
    issues.push({ path, message: "must be a string or an array of text spans" });
    return;
  }
  for (let index = 0; index < value.length; index += 1) {
    const span: unknown = value[index];
    const spanPath = `${path}[${index}]`;
    if (!isRecord(span)) {
      issues.push({ path: spanPath, message: "must be an object" });
      continue;
    }
    rejectUnknownFields(span, ["text", "style"], spanPath, issues);
    if (typeof span.text !== "string") issues.push({ path: `${spanPath}.text`, message: "must be a string" });
    validateContentTextStyle(span.style, `${spanPath}.style`, issues, true);
  }
}

/** Validate the controlled style shared by content blocks; no CSS expression or external resource is accepted. */
export function validateContentTextStyle(value: unknown, path: string, issues: ValidationIssue[], inline = false): void {
  if (value === undefined) return;
  if (!isRecord(value)) {
    issues.push({ path, message: "must be an object" });
    return;
  }
  rejectUnknownFields(value, inline ? ["fontSize", "fontWeight", "color"] : ["fontSize", "fontWeight", "color", "align"], path, issues);
  if (value.fontSize !== undefined) validateSpacingNumber(value.fontSize, `${path}.fontSize`, issues, true);
  if (value.fontWeight !== undefined && (typeof value.fontWeight !== "number" || !Number.isInteger(value.fontWeight) || value.fontWeight < MIN_FONT_WEIGHT || value.fontWeight > MAX_FONT_WEIGHT)) issues.push({ path: `${path}.fontWeight`, message: "must be an integer from 100 through 900" });
  if (value.align !== undefined && value.align !== "left" && value.align !== "center" && value.align !== "right") issues.push({ path: `${path}.align`, message: "must be left, center or right" });
  if (value.color !== undefined) validateColor(value.color, `${path}.color`, issues);
}

function validateColor(value: unknown, path: string, issues: ValidationIssue[]): void {
  if (typeof value !== "string" || !/^#(?:[\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})$/i.test(value)) issues.push({ path, message: "must be a hexadecimal color" });
}

function validateContentSpacing(value: unknown, path: string, issues: ValidationIssue[]): void {
  if (value === undefined) return;
  if (!isRecord(value)) {
    issues.push({ path, message: "must be an object" });
    return;
  }
  rejectUnknownFields(value, ["padding", "blockGap"], path, issues);
  for (const field of ["padding", "blockGap"] as const) {
    if (value[field] !== undefined) validateSpacingNumber(value[field], `${path}.${field}`, issues);
  }
}

function validateSpacingNumber(value: unknown, path: string, issues: ValidationIssue[], positive = false): void {
  if (typeof value !== "number" || !Number.isFinite(value)) issues.push({ path, message: "must be a finite number" });
  else if (positive ? value <= 0 : value < 0) issues.push({ path, message: positive ? "must be greater than zero" : "must be zero or greater" });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function rejectUnknownFields(value: Record<string, unknown>, allowed: readonly string[], path: string, issues: ValidationIssue[]): void {
  for (const key of Object.keys(value)) if (!allowed.includes(key)) issues.push({ path: `${path}.${key}`, message: "unknown field" });
}
