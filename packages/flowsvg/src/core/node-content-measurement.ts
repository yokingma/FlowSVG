/** Author-time content measurement shares deterministic core layout and never reads browser font metrics. */
import { layoutNodeContentWithMetrics, supportsNodeContent, validateNodeContent, type NodeContent } from "./node-content.js";
import type { ValidationIssue } from "./model.js";
import { DiagramValidationError } from "./validation.js";
import { resolveThemePalette } from "./theme.js";

/** Inputs use diagram units and the same content styles as fixed-size nodes. */
export interface NodeContentMeasurementInput {
  kind: "rect" | "roundedRect" | "cylinder";
  /** Positive finite node width in diagram units. */
  width: number;
  /** One content version or a nonempty collection; caller-owned objects and arrays are never mutated. */
  content: NodeContent | readonly NodeContent[];
}

/** Unresolved overflow for a zero-based content version and its source path. */
export interface NodeContentMeasurementDiagnostic {
  /** A single content object uses index zero. */
  versionIndex: number;
  /** Normalized source path, such as content[1].blocks[0]. */
  path: string;
  /** Height refers to overflow inside a fixed-height graph block. */
  dimension: "width" | "height";
  message: string;
}

/** A fixed node height in diagram units; diagnostics can still require content or width changes. */
export interface NodeContentMeasurement {
  /** Positive finite recommended node height, including complete line boxes and shape clearance. */
  height: number;
  diagnostics: NodeContentMeasurementDiagnostic[];
}

/**
 * Measure content before creating a document, using deterministic SDK text estimates rather than browser fonts.
 * Multiple versions share their largest required height. Diagnostics retain every unresolved block overflow.
 * The caller writes the result into explicit node dimensions; input objects and arrays remain unchanged.
 * Finite source values can overflow height arithmetic; validation issues identify every affected content version.
 * @throws {DiagramValidationError} If input is invalid or any required node height is non-finite.
 */
export function measureNodeContent(input: NodeContentMeasurementInput): NodeContentMeasurement {
  const issues = validateMeasurementInput(input);
  if (issues.length > 0) throw new DiagramValidationError(issues);
  const versions = isContentVersions(input.content) ? input.content : [input.content];
  const diagnostics: NodeContentMeasurementDiagnostic[] = [];
  const heights = versions.map((content, versionIndex) => {
    // Saturate shape clearance once. Any nonempty cylinder needs more height than its capped end reserves.
    const { contentHeight, layout, overflows } = layoutNodeContentWithMetrics(content,
      { x: 0, y: 0, width: input.width, height: Number.MAX_VALUE }, resolveThemePalette(undefined), input.kind);
    // Append separately so overflowing block counts cannot exceed the engine's function-argument limit.
    for (const { blockIndex, dimension } of overflows) {
      diagnostics.push({ versionIndex, path: `content[${versionIndex}].blocks[${blockIndex}]`, dimension,
        message: dimension === "width" ? "content exceeds the available width; increasing node height cannot fix this overflow"
          : "graph content exceeds its fixed block height; increasing node height cannot fix this overflow"
      });
    }
    const height = contentHeight + layout.safeArea.y * 2;
    // Individually finite source values can still overflow when line heights, gaps and insets are combined.
    if (!Number.isFinite(height)) {
      issues.push({ path: `content[${versionIndex}]`, message: "required node height must be finite" });
    }
    return height;
  });
  if (issues.length > 0) throw new DiagramValidationError(issues);
  return { height: heights.reduce((largest, height) => Math.max(largest, height), 1), diagnostics };
}

function isContentVersions(value: NodeContent | readonly NodeContent[]): value is readonly NodeContent[] {
  return Array.isArray(value);
}

/** Reuse document content validation before layout so malformed JavaScript inputs receive field errors. */
function validateMeasurementInput(input: unknown): ValidationIssue[] {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return [{ path: "$", message: "measurement input must be an object" }];
  }
  const issues: ValidationIssue[] = [];
  for (const field of Object.keys(input)) {
    if (!["kind", "width", "content"].includes(field)) issues.push({ path: field, message: "unknown field" });
  }
  if (!("kind" in input) || !supportsNodeContent(input.kind)) {
    issues.push({ path: "kind", message: "must be rect, roundedRect or cylinder" });
  }
  if (!("width" in input) || typeof input.width !== "number" || !Number.isFinite(input.width) || input.width <= 0) {
    issues.push({ path: "width", message: "must be a finite number greater than zero" });
  }
  const content: unknown = "content" in input ? input.content : undefined;
  const versions: unknown[] = Array.isArray(content) ? content : [content];
  if (versions.length === 0) issues.push({ path: "content", message: "must contain at least one content version" });
  for (let index = 0; index < versions.length; index += 1) {
    validateNodeContent(versions[index], `content[${index}]`, issues);
  }
  return issues;
}
