/** Shared deterministic typography defaults and validation; core layout never reads browser font metrics. */
import type { DiagramTypography, ValidationIssue } from "./model.js";

/** Internal ordinary-label metrics in diagram units. */
export interface TextMetrics { fontSize: number; lineHeight: number; charWidth: number }
export const DEFAULT_NODE_TYPOGRAPHY: TextMetrics = { fontSize: 16, lineHeight: 20, charWidth: 8.5 };
const DEFAULT_EDGE_TYPOGRAPHY: TextMetrics = { fontSize: 14, lineHeight: 18, charWidth: 8.4 };
const DEFAULT_FLOW_TYPOGRAPHY: TextMetrics = { fontSize: 12, lineHeight: 16, charWidth: 7.2 };
export const CONTENT_LINE_HEIGHT_RATIO = 1.35;
const MAX_CONTENT_FONT_RATIO = 20 / 16;
const FLOW_CAPSULE_HEIGHT_RATIO = 2;
const ROLE_DEFAULTS = { nodeLabel: DEFAULT_NODE_TYPOGRAPHY, edgeLabel: DEFAULT_EDGE_TYPOGRAPHY, flowLabel: DEFAULT_FLOW_TYPOGRAPHY };

/** Effective text context retained internally with each evaluated frame. */
export interface ResolvedTypography {
  nodeLabel: TextMetrics;
  edgeLabel: TextMetrics;
  flowLabel: TextMetrics;
  contentScale: number;
}

/** Resolve independently omitted roles; callers validate source values before resolving. */
export function resolveTypography(input?: DiagramTypography): ResolvedTypography {
  return { contentScale: (input?.nodeLabel ?? DEFAULT_NODE_TYPOGRAPHY.fontSize) / DEFAULT_NODE_TYPOGRAPHY.fontSize,
    nodeLabel: scaleMetrics(ROLE_DEFAULTS.nodeLabel, input?.nodeLabel),
    edgeLabel: scaleMetrics(ROLE_DEFAULTS.edgeLabel, input?.edgeLabel),
    flowLabel: scaleMetrics(ROLE_DEFAULTS.flowLabel, input?.flowLabel) };
}

function scaleMetrics(defaults: TextMetrics, fontSize = defaults.fontSize): TextMetrics {
  if (fontSize === defaults.fontSize) return { ...defaults };
  return { fontSize, lineHeight: fontSize * (defaults.lineHeight / defaults.fontSize), charWidth: fontSize * (defaults.charWidth / defaults.fontSize) };
}

/** Report typography fields using the same source paths in documents and author-time measurement. */
export function validateTypography(input: unknown, issues: ValidationIssue[]): void {
  if (input === undefined) return;
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    issues.push({ path: "typography", message: "must be an object" });
    return;
  }
  const prototype: unknown = Object.getPrototypeOf(input);
  if (prototype !== Object.prototype && prototype !== null) {
    issues.push({ path: "typography", message: "must be a plain object" });
    return;
  }
  for (const key of Object.keys(input)) {
    if (!Object.hasOwn(ROLE_DEFAULTS, key)) issues.push({ path: `typography.${key}`, message: "unknown field" });
  }
  for (const [key, defaults] of Object.entries(ROLE_DEFAULTS)) {
    const value: unknown = Reflect.get(input, key);
    if (value === undefined) continue;
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
      issues.push({ path: `typography.${key}`, message: "must be a finite number greater than zero" });
      continue;
    }
    const metrics = scaleMetrics(defaults, value);
    const derived = [...Object.values(metrics), ...(key === "nodeLabel" ? [value / DEFAULT_NODE_TYPOGRAPHY.fontSize, value * MAX_CONTENT_FONT_RATIO * CONTENT_LINE_HEIGHT_RATIO] : key === "flowLabel" ? [flowCapsuleHeight(metrics)] : [])];
    if (derived.some((metric) => !Number.isFinite(metric) || metric <= 0)) {
      issues.push({ path: `typography.${key}`, message: "derived text metrics must be positive and finite" });
    }
  }
}

/** Keep single-line capsule padding proportional to the effective flow font while preserving default height. */
export function flowCapsuleHeight(typography: TextMetrics): number {
  return typography.fontSize * FLOW_CAPSULE_HEIGHT_RATIO;
}

/** Reuse fixed code-point metrics without DOM measurements; reserve a full em for wide letters and Unicode. */
export function estimateTextWidth(text: string, typography: TextMetrics): number {
  return Array.from(text).reduce((width, character) => {
    const wide = character.codePointAt(0)! > 0xff || "MWmw@%".includes(character);
    return width + (wide ? typography.fontSize : typography.charWidth);
  }, 0);
}

/** Estimated baseline descent shared by ordinary label bounds and content span diagnostics. */
export const TEXT_DESCENT_RATIO = 0.25;
/** SVG edge labels paint a six-unit stroke behind text in every export background mode. */
export const EDGE_LABEL_HALO_RADIUS = 3;

/** Deterministic ordinary label paint bounds; x is centered and y is the shared SVG baseline. */
export function textLineBounds(line: { text: string; x: number; y: number }, typography: TextMetrics, halo = 0): { left: number; top: number; right: number; bottom: number } {
  const halfWidth = estimateTextWidth(line.text, typography) / 2;
  return { left: line.x - halfWidth - halo, right: line.x + halfWidth + halo,
    top: line.y - typography.fontSize - halo, bottom: line.y + typography.fontSize * TEXT_DESCENT_RATIO + halo };
}
