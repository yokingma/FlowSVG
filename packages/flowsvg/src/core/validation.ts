/** Validate document fields, references and action conflicts without mutating input; content rules stay shared. */
import { supportsNodeContent, validateNodeContent } from "./node-content.js";
import type { NodeKind, PortDirection, ValidationIssue } from "./model.js";

/** Validation error for invalid documents or author-time measurement inputs; issues retains all affected field paths. */
export class DiagramValidationError extends Error {
  readonly issues: readonly ValidationIssue[];
  constructor(issues: ValidationIssue[]) {
    super(`Invalid diagram document (${issues.length} issue${issues.length === 1 ? "" : "s"})`);
    this.name = "DiagramValidationError";
    this.issues = issues;
  }
}

/**
 * Validate document structure, values and references; an empty list means validation passed.
 * Accumulate issues across inspectable branches without mutating input or producing a partial Diagram.
 */
export function validateDocument(input: unknown): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!isRecord(input)) {
    return [{ path: "$", message: "document must be an object" }];
  }
  validateUnknownFields(input, ["version", "title", "viewport", "theme", "nodes", "edges", "scenes"], "$", issues);
  if (input.version !== 1) issues.push({ path: "version", message: "must be 1" });
  if (input.title !== undefined && typeof input.title !== "string") issues.push({ path: "title", message: "must be a string" });
  if (input.theme !== undefined && input.theme !== "light" && input.theme !== "dark") issues.push({ path: "theme", message: "must be light or dark" });
  const viewport = input.viewport;
  if (!isRecord(viewport)) {
    issues.push({ path: "viewport", message: "must be an object" });
  } else {
    validateUnknownFields(viewport, ["width", "height", "fitHeight"], "viewport", issues);
    validatePositiveFinite(viewport.width, "viewport.width", issues);
    validatePositiveFinite(viewport.height, "viewport.height", issues);
    if (viewport.fitHeight !== undefined) {
      if (!isRecord(viewport.fitHeight)) issues.push({ path: "viewport.fitHeight", message: "must be an object" });
      else {
        validateUnknownFields(viewport.fitHeight, ["padding"], "viewport.fitHeight", issues);
        validateNonNegativeFinite(viewport.fitHeight.padding, "viewport.fitHeight.padding", issues);
      }
    }
  }
  if (!Array.isArray(input.nodes)) issues.push({ path: "nodes", message: "must be an array" });
  if (!Array.isArray(input.edges)) issues.push({ path: "edges", message: "must be an array" });
  if (!Array.isArray(input.scenes)) issues.push({ path: "scenes", message: "must be an array" });
  const nodes: unknown[] = Array.isArray(input.nodes) ? input.nodes : [];
  const edges: unknown[] = Array.isArray(input.edges) ? input.edges : [];
  const scenes: unknown[] = Array.isArray(input.scenes) ? input.scenes : [];
  validateDenseArray(nodes, "nodes", issues);
  validateDenseArray(edges, "edges", issues);
  validateDenseArray(scenes, "scenes", issues);

  const ids = new Set<string>();
  nodes.forEach((node, index) => {
    const path = `nodes[${index}]`;
    if (!isRecord(node)) {
      issues.push({ path, message: "must be an object" });
      return;
    }
    validateUnknownFields(node, ["id", "kind", "x", "y", "width", "height", "label", "content", "parentId", "visible", "style"], path, issues);
    if (!isNonEmptyString(node.id)) issues.push({ path: `${path}.id`, message: "must be a non-empty string" });
    else if (ids.has(node.id)) issues.push({ path: `${path}.id`, message: `duplicate id \"${node.id}\"` });
    else ids.add(node.id);
    if (!isNodeKind(node.kind)) issues.push({ path: `${path}.kind`, message: "must be a supported node kind" });
    validateFinite(node.x, `${path}.x`, issues);
    validateFinite(node.y, `${path}.y`, issues);
    validatePositiveFinite(node.width, `${path}.width`, issues);
    validatePositiveFinite(node.height, `${path}.height`, issues);
    if (node.label !== undefined && typeof node.label !== "string") issues.push({ path: `${path}.label`, message: "must be a string" });
    if (node.content !== undefined) {
      validateNodeContent(node.content, `${path}.content`, issues);
      if (node.label !== undefined) issues.push({ path: `${path}.content`, message: "must not be declared together with label" });
      if (!supportsNodeContent(node.kind)) issues.push({ path: `${path}.content`, message: "requires a rect, roundedRect or cylinder node" });
    }
    if (node.parentId !== undefined && !isNonEmptyString(node.parentId)) issues.push({ path: `${path}.parentId`, message: "must be a non-empty string" });
    if (node.visible !== undefined && typeof node.visible !== "boolean") issues.push({ path: `${path}.visible`, message: "must be a boolean" });
    validateNodeStyle(node.style, `${path}.style`, issues);
  });
  const nodeById = new Map<string, Record<string, unknown>>();
  nodes.forEach((node) => {
    if (isRecord(node) && isNonEmptyString(node.id)) nodeById.set(node.id, node);
  });
  nodes.forEach((node, index) => {
    if (isRecord(node) && node.parentId !== undefined && isNonEmptyString(node.parentId)) {
      const parent = nodeById.get(node.parentId);
      if (!parent) issues.push({ path: `nodes[${index}].parentId`, message: "must reference an existing node" });
      else if (parent.kind !== "group") issues.push({ path: `nodes[${index}].parentId`, message: "must reference a group node" });
    }
  });
  validateParentCycles(nodes, nodeById, issues);
  const edgeById = new Map<string, Record<string, unknown>>();
  edges.forEach((edge, index) => {
    const path = `edges[${index}]`;
    if (!isRecord(edge)) {
      issues.push({ path, message: "must be an object" });
      return;
    }
    validateUnknownFields(edge, ["id", "from", "to", "label", "route", "fromPort", "toPort", "visible", "style"], path, issues);
    if (!isNonEmptyString(edge.id)) issues.push({ path: `${path}.id`, message: "must be a non-empty string" });
    else if (ids.has(edge.id)) issues.push({ path: `${path}.id`, message: `duplicate id \"${edge.id}\"` });
    else {
      ids.add(edge.id);
      edgeById.set(edge.id, edge);
    }
    validateEdgeEndpoint(edge.from, `${path}.from`, nodeById, issues);
    validateEdgeEndpoint(edge.to, `${path}.to`, nodeById, issues);
    if (edge.label !== undefined && typeof edge.label !== "string") issues.push({ path: `${path}.label`, message: "must be a string" });
    if (edge.route !== undefined && edge.route !== "straight" && edge.route !== "orthogonal" && edge.route !== "curved") issues.push({ path: `${path}.route`, message: "must be straight, orthogonal or curved" });
    if (edge.fromPort !== undefined && !isPortDirection(edge.fromPort)) issues.push({ path: `${path}.fromPort`, message: "must be top, right, bottom or left" });
    if (edge.toPort !== undefined && !isPortDirection(edge.toPort)) issues.push({ path: `${path}.toPort`, message: "must be top, right, bottom or left" });
    if (edge.visible !== undefined && typeof edge.visible !== "boolean") issues.push({ path: `${path}.visible`, message: "must be a boolean" });
    validateEdgeStyle(edge.style, `${path}.style`, issues);
  });
  const allIds = new Set([...nodeById.keys(), ...edgeById.keys()]);
  const sceneIds = new Set<string>();
  scenes.forEach((scene, sceneIndex) => {
    const path = `scenes[${sceneIndex}]`;
    if (!isRecord(scene)) {
      issues.push({ path, message: "must be an object" });
      return;
    }
    validateUnknownFields(scene, ["id", "label", "beats"], path, issues);
    if (!isNonEmptyString(scene.id)) issues.push({ path: `${path}.id`, message: "must be a non-empty string" });
    else if (sceneIds.has(scene.id)) issues.push({ path: `${path}.id`, message: `duplicate id \"${scene.id}\"` });
    else sceneIds.add(scene.id);
    if (!isNonEmptyString(scene.label)) issues.push({ path: `${path}.label`, message: "must be a non-empty string" });
    if (!Array.isArray(scene.beats)) issues.push({ path: `${path}.beats`, message: "must be an array" });
    else {
      validateDenseArray(scene.beats, `${path}.beats`, issues);
      if (scene.beats.length === 0) issues.push({ path: `${path}.beats`, message: "must contain at least one beat" });
      scene.beats.forEach((beat, beatIndex) => validateBeat(beat, `${path}.beats[${beatIndex}]`, allIds, nodeById, edgeById, issues));
    }
  });
  return issues;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}
function isNodeKind(value: unknown): value is NodeKind {
  return value === "rect" || value === "roundedRect" || value === "ellipse" || value === "cylinder" || value === "group";
}
function isPortDirection(value: unknown): value is PortDirection {
  return value === "top" || value === "right" || value === "bottom" || value === "left";
}
function validateFinite(value: unknown, path: string, issues: ValidationIssue[]): void {
  if (typeof value !== "number" || !Number.isFinite(value)) issues.push({ path, message: "must be a finite number" });
}
function validatePositiveFinite(value: unknown, path: string, issues: ValidationIssue[]): void {
  validateFinite(value, path, issues);
  if (typeof value === "number" && Number.isFinite(value) && value <= 0) issues.push({ path, message: "must be greater than zero" });
}
function validateNonNegativeFinite(value: unknown, path: string, issues: ValidationIssue[]): void {
  validateFinite(value, path, issues);
  if (typeof value === "number" && Number.isFinite(value) && value < 0) issues.push({ path, message: "must be zero or greater" });
}
function validateUnknownFields(record: Record<string, unknown>, allowed: readonly string[], path: string, issues: ValidationIssue[]): void {
  const allowedFields = new Set(allowed);
  for (const key of Object.keys(record)) if (!allowedFields.has(key)) issues.push({ path: path === "$" ? key : `${path}.${key}`, message: "unknown field" });
}
function validateDenseArray(values: unknown[], path: string, issues: ValidationIssue[]): void {
  for (let index = 0; index < values.length; index += 1) if (!(index in values)) issues.push({ path: `${path}[${index}]`, message: "must be a value" });
}

/** Restrict colors to interpolable hexadecimal data, excluding CSS expressions and external resource references. */
function validateColor(value: unknown, path: string, issues: ValidationIssue[]): void {
  if (typeof value !== "string" || !/^#(?:[\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})$/i.test(value)) issues.push({ path, message: "must be a hexadecimal color" });
}
function validateNodeStyle(style: unknown, path: string, issues: ValidationIssue[]): void {
  if (style === undefined) return;
  if (!isRecord(style)) {
    issues.push({ path, message: "must be an object" });
    return;
  }
  validateUnknownFields(style, ["fill", "stroke", "strokeWidth", "textColor", "dashed"], path, issues);
  for (const key of ["fill", "stroke", "textColor"] as const) if (style[key] !== undefined) validateColor(style[key], `${path}.${key}`, issues);
  if (style.strokeWidth !== undefined) validateNonNegativeFinite(style.strokeWidth, `${path}.strokeWidth`, issues);
  if (style.dashed !== undefined && typeof style.dashed !== "boolean") issues.push({ path: `${path}.dashed`, message: "must be a boolean" });
}
function validateEdgeStyle(style: unknown, path: string, issues: ValidationIssue[]): void {
  if (style === undefined) return;
  if (!isRecord(style)) {
    issues.push({ path, message: "must be an object" });
    return;
  }
  validateUnknownFields(style, ["stroke", "strokeWidth", "dashed"], path, issues);
  if (style.stroke !== undefined) validateColor(style.stroke, `${path}.stroke`, issues);
  if (style.strokeWidth !== undefined) validateNonNegativeFinite(style.strokeWidth, `${path}.strokeWidth`, issues);
  if (style.dashed !== undefined && typeof style.dashed !== "boolean") issues.push({ path: `${path}.dashed`, message: "must be a boolean" });
}
function validateEdgeEndpoint(value: unknown, path: string, nodeById: Map<string, Record<string, unknown>>, issues: ValidationIssue[]): void {
  if (!isNonEmptyString(value)) {
    issues.push({ path, message: "must reference an existing node" });
    return;
  }
  const node = nodeById.get(value);
  if (!node) issues.push({ path, message: "must reference an existing node" });
}

/** Reject parent cycles at load time so later position and visibility recursion terminates. */
function validateParentCycles(nodes: unknown[], nodeById: Map<string, Record<string, unknown>>, issues: ValidationIssue[]): void {
  const reported = new Set<string>();
  for (const [id, node] of nodeById) {
    const chain = new Set<string>();
    let current: string | undefined = id;
    while (current) {
      if (chain.has(current)) {
        const index = nodes.findIndex((candidate) => isRecord(candidate) && candidate.id === id);
        const path = index >= 0 ? `nodes[${index}].parentId` : "nodes.parentId";
        if (!reported.has(path)) {
          issues.push({ path, message: "group parent references form a cycle" });
          reported.add(path);
        }
        break;
      }
      chain.add(current);
      const parentValue: unknown = nodeById.get(current)?.parentId;
      current = isNonEmptyString(parentValue) ? parentValue : undefined;
    }
  }
}

/** Track assignment keys per beat: allow different fields on one target but reject duplicate writes to a field. */
function validateBeat(beat: unknown, path: string, allIds: Set<string>, nodeById: Map<string, Record<string, unknown>>, edgeById: Map<string, Record<string, unknown>>, issues: ValidationIssue[]): void {
  if (!isRecord(beat)) {
    issues.push({ path, message: "must be an object" });
    return;
  }
  validateUnknownFields(beat, ["durationMs", "transitionMs", "caption", "actions"], path, issues);
  validatePositiveFinite(beat.durationMs, `${path}.durationMs`, issues);
  if (beat.transitionMs !== undefined) {
    validateNonNegativeFinite(beat.transitionMs, `${path}.transitionMs`, issues);
    if (typeof beat.durationMs === "number" && Number.isFinite(beat.durationMs) && typeof beat.transitionMs === "number" && Number.isFinite(beat.transitionMs) && beat.transitionMs > beat.durationMs) issues.push({ path: `${path}.transitionMs`, message: "must not exceed durationMs" });
  }
  if (beat.caption !== undefined && typeof beat.caption !== "string") issues.push({ path: `${path}.caption`, message: "must be a string" });
  if (!Array.isArray(beat.actions)) {
    issues.push({ path: `${path}.actions`, message: "must be an array" });
    return;
  }
  validateDenseArray(beat.actions, `${path}.actions`, issues);
  const assignments = new Set<string>();
  beat.actions.forEach((action, index) => validateAction(action, `${path}.actions[${index}]`, allIds, nodeById, edgeById, assignments, issues));
}

/** Validate fields/targets by action kind; visibility and highlight keys are separate from ordinary style updates. */
function validateAction(action: unknown, path: string, allIds: Set<string>, nodeById: Map<string, Record<string, unknown>>, edgeById: Map<string, Record<string, unknown>>, assignments: Set<string>, issues: ValidationIssue[]): void {
  if (!isRecord(action)) {
    issues.push({ path, message: "must be an object" });
    return;
  }
  if (typeof action.type !== "string") {
    issues.push({ path: `${path}.type`, message: "must be a supported action" });
    return;
  }
  const type = action.type;
  const allowedByType: Record<string, readonly string[]> = {
    show: ["type", "target"], hide: ["type", "target"], highlight: ["type", "target"], unhighlight: ["type", "target"],
    updateNode: ["type", "target", "value"], updateEdge: ["type", "target", "value"], focus: ["type", "target"],
    flow: ["type", "target", "direction", "text", "highlightParticipants"]
  };
  const allowed = Object.hasOwn(allowedByType, type) ? allowedByType[type] : undefined;
  if (!allowed) {
    issues.push({ path: `${path}.type`, message: "unknown action" });
    return;
  }
  validateUnknownFields(action, allowed, path, issues);
  if (["show", "hide", "highlight", "unhighlight"].includes(type)) {
    if (!isNonEmptyString(action.target)) {
      issues.push({ path: `${path}.target`, message: "must reference an existing object" });
      return;
    }
    if (!allIds.has(action.target)) issues.push({ path: `${path}.target`, message: "must reference an existing object" });
    addAssignment(`${type === "show" || type === "hide" ? "visibility" : "highlight"}:${action.target}`, path, assignments, issues);
    return;
  }
  if (type === "focus") {
    if (action.target !== null && (!isNonEmptyString(action.target) || !nodeById.has(action.target))) issues.push({ path: `${path}.target`, message: "must reference a node or group" });
    if (action.target === null || (isNonEmptyString(action.target) && nodeById.has(action.target))) addAssignment("focus", path, assignments, issues);
    return;
  }
  if (type === "flow") {
    if (!isNonEmptyString(action.target)) issues.push({ path: `${path}.target`, message: "must reference an existing edge" });
    else if (!edgeById.has(action.target)) issues.push({ path: `${path}.target`, message: "must reference an existing edge" });
    if (action.direction !== "forward" && action.direction !== "reverse") issues.push({ path: `${path}.direction`, message: "must be forward or reverse" });
    if (action.text !== undefined && typeof action.text !== "string") issues.push({ path: `${path}.text`, message: "must be a string" });
    if (action.highlightParticipants !== undefined && typeof action.highlightParticipants !== "boolean") issues.push({ path: `${path}.highlightParticipants`, message: "must be a boolean" });
    // Reserve the edge independently of other field errors so invalid directions cannot hide duplicate transfers.
    if (isNonEmptyString(action.target) && edgeById.has(action.target)) addAssignment(`flow:${action.target}`, `${path}.target`, assignments, issues);
    return;
  }
  if (!isNonEmptyString(action.target)) {
    issues.push({ path: `${path}.target`, message: `must reference a ${type === "updateNode" ? "node" : "edge"}` });
  }
  else if (type === "updateNode" ? !nodeById.has(action.target) : !edgeById.has(action.target)) issues.push({ path: `${path}.target`, message: `must reference an existing ${type === "updateNode" ? "node" : "edge"}` });
  validateUpdateValue(action.value, `${path}.value`, type === "updateNode", assignments, action.target, issues);
  const targetNode = typeof action.target === "string" ? nodeById.get(action.target) : undefined;
  if (type === "updateNode" && targetNode && isRecord(action.value) && action.value.content !== undefined && action.value.content !== null && !supportsNodeContent(targetNode.kind)) {
    issues.push({ path: `${path}.value.content`, message: "requires a rect, roundedRect or cylinder node" });
  }
}
function validateUpdateValue(value: unknown, path: string, isNode: boolean, assignments: Set<string>, target: unknown, issues: ValidationIssue[]): void {
  if (!isRecord(value)) {
    issues.push({ path, message: "must be an object" });
    return;
  }
  const allowed = isNode ? ["x", "y", "width", "height", "label", "content", "fill", "stroke", "opacity"] as const : ["label", "stroke", "strokeWidth", "opacity"] as const;
  validateUnknownFields(value, allowed, path, issues);
  if (isNode && Object.hasOwn(value, "label") && Object.hasOwn(value, "content")) {
    issues.push({ path: `${path}.content`, message: "must not be declared together with label" });
  }
  for (const key of Object.keys(value)) {
    if (!(allowed as readonly string[]).includes(key)) continue;
    // Both node text fields replace the same display mode, even across separate actions.
    const assignmentField = isNode && (key === "label" || key === "content") ? "text-mode" : key;
    addAssignment(`${isNode ? "node" : "edge"}:${String(target)}:${assignmentField}`, `${path}.${key}`, assignments, issues);
    const field = value[key];
    if (["x", "y", "width", "height", "opacity"].includes(key)) validateFinite(field, `${path}.${key}`, issues);
    if (key === "strokeWidth") validateNonNegativeFinite(field, `${path}.${key}`, issues);
    if (["width", "height"].includes(key) && typeof field === "number" && field <= 0) issues.push({ path: `${path}.${key}`, message: "must be greater than zero" });
    if (key === "opacity" && typeof field === "number" && (field < 0 || field > 1)) issues.push({ path: `${path}.${key}`, message: "must be between zero and one" });
    if (["fill", "stroke"].includes(key)) validateColor(field, `${path}.${key}`, issues);
    if (key === "label" && typeof field !== "string") issues.push({ path: `${path}.${key}`, message: "must be a string" });
    if (key === "content" && field !== null) validateNodeContent(field, `${path}.${key}`, issues);
  }
}
function addAssignment(key: string, path: string, assignments: Set<string>, issues: ValidationIssue[]): void {
  if (assignments.has(key)) issues.push({ path, message: "duplicate beat assignment" });
  else assignments.add(key);
}
