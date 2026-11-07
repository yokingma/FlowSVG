/** Author-time plain-label measurement shares preset text layout and never reads browser font metrics. */
import type { DiagramTypography, ValidationIssue } from "./model.js";
import { DOCUMENT_WAVE_MAX_BAND, NODE_LABEL_PADDING, isLabelNodeKind, nodeLabelSafeArea, type LabelNodeKind } from "./node-shape.js";
import { wrapNodeLabel } from "./node-label.js";
import { resolveTypography, validateTypography } from "./typography.js";
import { DiagramValidationError } from "./validation.js";

/** Explicit node width and text context; each label array entry is a complete version. */
export interface NodeLabelMeasurementInput {
  kind: LabelNodeKind;
  /** Finite positive node width, in diagram units. */
  width: number;
  /** One label or a nonempty collection; empty strings are valid. Inputs are never mutated. */
  label: string | readonly string[];
  /** Same document typography; omitted roles retain their existing defaults. */
  typography?: DiagramTypography;
}

/** A width problem which increasing node height cannot solve. */
export interface NodeLabelMeasurementDiagnostic {
  /** Zero for a single string; otherwise the source array index. */
  versionIndex: number;
  path: string;
  dimension: "width";
  message: string;
}

/** Suggested explicit height, including full line boxes and shape clearance. */
export interface NodeLabelMeasurement {
  height: number;
  diagnostics: NodeLabelMeasurementDiagnostic[];
}

/**
 * Measure explicit label versions without modifying nodes or scanning scenes; callers apply the height.
 * Width diagnostics can remain after applying the result. Empty text still returns positive contour clearance.
 * @throws {DiagramValidationError} If input is invalid or a required height is non-finite.
 */
export function measureNodeLabel(input: NodeLabelMeasurementInput): NodeLabelMeasurement {
  const issues = validateMeasurementInput(input);
  if (issues.length > 0) throw new DiagramValidationError(issues);
  const metrics = resolveTypography(input.typography).nodeLabel;
  const safe = nodeLabelSafeArea({ kind: input.kind, x: 0, y: 0, width: input.width, height: 1 })!;
  const versions = isLabelVersions(input.label) ? input.label : [input.label];
  const diagnostics: NodeLabelMeasurementDiagnostic[] = [];
  let height = 1;
  versions.forEach((label, versionIndex) => {
    const layout = wrapNodeLabel(label, safe.width, metrics);
    const paddedHeight = layout.height + NODE_LABEL_PADDING * 2;
    const requiredHeight = input.kind === "document"
      ? paddedHeight <= DOCUMENT_WAVE_MAX_BAND * 3 ? paddedHeight / 3 * 4 : paddedHeight + DOCUMENT_WAVE_MAX_BAND
      : paddedHeight * (input.kind === "diamond" ? 2 : 1);
    if (!Number.isFinite(requiredHeight)) issues.push({ path: `label[${versionIndex}]`, message: "required node height must be finite" });
    height = Math.max(height, requiredHeight);
    if (layout.widthOverflow) diagnostics.push({ versionIndex, path: `label[${versionIndex}]`, dimension: "width",
      message: "label exceeds the available width; increasing node height cannot fix this overflow" });
  });
  if (issues.length > 0) throw new DiagramValidationError(issues);
  return { height, diagnostics };
}

/** Validate runtime callers before touching typed fields, including sparse version arrays. */
function validateMeasurementInput(input: unknown): ValidationIssue[] {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return [{ path: "$", message: "measurement input must be an object" }];
  }
  const issues: ValidationIssue[] = [];
  for (const key of Object.keys(input)) {
    if (!["kind", "width", "label", "typography"].includes(key)) issues.push({ path: key, message: "unknown field" });
  }
  if (!("kind" in input) || !isLabelNodeKind(input.kind)) issues.push({ path: "kind", message: "must be a supported safe-area label kind" });
  if (!("width" in input) || typeof input.width !== "number" || !Number.isFinite(input.width) || input.width <= 0) {
    issues.push({ path: "width", message: "must be a finite number greater than zero" });
  }
  validateTypography("typography" in input ? input.typography : undefined, issues);
  const labels: unknown = "label" in input ? input.label : undefined;
  const versions: readonly unknown[] = Array.isArray(labels) ? labels : [labels];
  if (versions.length === 0) issues.push({ path: "label", message: "must contain at least one label version" });
  for (let index = 0; index < versions.length; index += 1) {
    if (typeof versions[index] !== "string") issues.push({ path: `label[${index}]`, message: "must be a string" });
  }
  return issues;
}

function isLabelVersions(value: string | readonly string[]): value is readonly string[] {
  return Array.isArray(value);
}
