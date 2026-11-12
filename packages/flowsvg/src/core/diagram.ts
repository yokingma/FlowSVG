/**
 * Platform-independent diagram orchestration: compile documents and derive frames, geometry, hit tests and SVG.
 * Validation owns document rules; this module owns cloning and freezing and does not read DOM, clocks or network.
 */
import { diagnoseFrame } from "./geometry-diagnostics.js";
import { isPointInNodeOutline, nodeLabelSafeArea, nodeOutline, predefinedProcessInset } from "./node-shape.js";
import { NODE_LABEL_OVERFLOW_TOLERANCE, placeNodeLabel, wrapNodeLabel } from "./node-label.js";
import { layoutNodeContentWithMetrics, type ContentSafeArea, type NodeContent, type NodeContentLayout } from "./node-content.js";
import { paintContentHighlight } from "./node-content-paint.js";
import { CompiledTimeline, type TimelineObject, type CompiledFlow } from "./timeline.js";
import { mixColor } from "./color.js";
import { CYLINDER_CAP_RADIUS, DEFAULT_NODE_STROKE_WIDTH, DIAGRAM_FONT_FAMILY, NODE_CORNER_RADIUS, resolveThemePalette, type ThemePalette } from "./theme.js";
import { DiagramValidationError, validateDocument } from "./validation.js";
import type { Viewport, DiagramNode, DiagramEdge, DiagramDocument, DiagramBeat, Beat, EvaluateOptions, SvgRenderOptions, TextLine, EvaluatedNode, EvaluatedEdge, EdgeFlowMarker, LayoutWarning, GeometryWarning, CameraState, HitObject, DiagramPoint, DiagramFrameState } from "./model.js";
import { ARROW_MARKER_SIZE, emptyPathGeometry, isPointNearPath, routedTargetOffsets, pathLabelAnchor, routeEdge, type PathGeometry } from "./edge-geometry.js";
import { DEFAULT_NODE_TYPOGRAPHY, EDGE_LABEL_HALO_RADIUS, textLineBounds, estimateTextWidth, findTextBreak, flowCapsuleHeight, resolveTypography, type ResolvedTypography, type TextMetrics } from "./typography.js";
import { formatNumber } from "./svg-number.js";

/**
 * Validate and copy a document, then compile its timeline; later input mutations cannot affect evaluation.
 * @throws {DiagramValidationError} If document structure, values or references are invalid, or derived typography or flow timing is non-finite.
 */
export function createDiagram(input: DiagramDocument): Diagram {
  const issues = validateDocument(input);
  if (issues.length > 0) throw new DiagramValidationError(issues);
  const diagram = new CompiledDiagram(cloneDocument(input));
  frameStateEvaluators.set(diagram, diagram.getFrameStateEvaluator());
  return diagram;
}

/** Internal frame result shared by browser rendering, captions and hit testing. */
export interface DiagramFrameEvaluation {
  readonly frame: DiagramFrameState;
  readonly edgeGeometries: ReadonlyMap<string, PathGeometry>;
  readonly palette: ThemePalette;
  readonly typography: ResolvedTypography;
}

interface FrameStateEvaluator {
  evaluate(timeMs: number, options?: EvaluateOptions): DiagramFrameEvaluation;
  render(evaluation: DiagramFrameEvaluation, options?: SvgRenderOptions): string;
  hitTest(evaluation: DiagramFrameEvaluation, point: DiagramPoint): HitObject | null;
}

const frameStateEvaluators = new WeakMap<Diagram, FrameStateEvaluator>();

/** Evaluate one internal frame result without expanding the public Diagram interface. */
export function evaluateDiagramFrame(diagram: Diagram, timeMs: number, options: EvaluateOptions = {}): DiagramFrameEvaluation {
  const evaluator = frameStateEvaluators.get(diagram);
  if (!evaluator) throw new Error("FlowSVG diagram does not expose its internal frame evaluator.");
  return evaluator.evaluate(timeMs, options);
}

/** Serialize an existing internal frame result without evaluating the timeline again. */
export function renderDiagramFrame(diagram: Diagram, evaluation: DiagramFrameEvaluation, options?: SvgRenderOptions): string {
  const evaluator = frameStateEvaluators.get(diagram);
  if (!evaluator) throw new Error("FlowSVG diagram does not expose its internal frame evaluator.");
  return evaluator.render(evaluation, options);
}

/** Hit-test an existing internal frame result without evaluating the timeline again. */
export function hitTestDiagramFrame(evaluation: DiagramFrameEvaluation, point: DiagramPoint): HitObject | null {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return null;
  const nodes = [...evaluation.frame.nodes].reverse();
  const containsPoint = (candidate: EvaluatedNode): boolean => candidate.visible && candidate.opacity > 0 && isPointInNode(point, candidate, evaluation.typography.nodeLabel);
  const node = nodes.find((candidate) => candidate.kind !== "group" && containsPoint(candidate));
  if (node) return { id: node.id, type: "node" };
  const edge = [...evaluation.frame.edges].reverse().find((candidate) => candidate.visible && candidate.opacity > 0 && isPointNearPath(point, evaluation.edgeGeometries.get(candidate.id) ?? emptyPathGeometry(), (candidate.style?.strokeWidth ?? 2) + HIT_TOLERANCE));
  if (edge) return { id: edge.id, type: "edge" };
  const group = nodes.find((candidate) => candidate.kind === "group" && containsPoint(candidate));
  return group ? { id: group.id, type: "node" } : null;
}

/** One-shot static SVG export; use createDiagram to reuse compilation across repeated evaluations or exports. */
export function renderSvg(document: DiagramDocument, timeMs = 0, options?: SvgRenderOptions): string {
  return createDiagram(document).renderSvg(timeMs, options);
}

/** Compiled diagram independent of the DOM, network and clock; each query evaluates from its time and options. */
export interface Diagram {
  /** Global timeline duration in milliseconds; zero for static diagrams. */
  readonly totalDuration: number;
  /** Frozen compiled intervals, including single-flow movement and arrival hold; use these for navigation and export scheduling. */
  readonly beats: readonly DiagramBeat[];
  /**
   * Evaluate a frame; finite times clamp to [0, totalDuration], and non-finite times become zero.
   * Beat intervals include their start and exclude their end; totalDuration returns the completed final beat.
   * Throws DiagramValidationError with a typography role path when text-derived geometry is non-finite.
   */
  evaluateAt(timeMs: number, options?: EvaluateOptions): DiagramFrameState;
  /**
   * Detect three additional geometric risks on demand, using evaluateAt time and visual options.
   * Only visible camera/safe-area portions participate; text is estimated and curves are sampled.
   * Does not return text-overflow warnings, mutate the diagram, or run during normal evaluation/playback.
   */
  diagnoseAt(timeMs: number, options?: EvaluateOptions): GeometryWarning[];
  /** Serialize the same frame as self-contained static SVG with escaped text and resolved colors, without controls. */
  renderSvg(timeMs?: number, options?: SvgRenderOptions): string;
  /**
   * Hit-test document coordinates in paint order: ordinary nodes, then edges, then group backgrounds.
   * Objects within each layer are searched in reverse document order.
   * Node hits include their visible label area. Hidden/zero-opacity objects are excluded.
   * Return null for no hit or non-finite coordinates.
   */
  hitTest(timeMs: number, point: DiagramPoint, options?: EvaluateOptions): HitObject | null;
}

/**
 * Own the frozen document and compiled timeline; derive visual values, absolute geometry/text, routes, then camera.
 * The ancestor index retains hierarchy; geometry is derived from current values on every frame to support group movement.
 * See docs/adr/0001-platform-independent-core.md for the platform boundary.
 */
class CompiledDiagram implements Diagram {
  readonly totalDuration: number;
  readonly beats: readonly DiagramBeat[];
  private readonly timeline: CompiledTimeline;
  private readonly document: DiagramDocument;
  private readonly typography: ResolvedTypography;
  private readonly nodesById: ReadonlyMap<string, DiagramNode>;
  constructor(document: DiagramDocument) {
    this.document = deepFreeze(document);
    this.typography = resolveTypography(document.typography);
    this.nodesById = new Map(document.nodes.map((node) => [node.id, node]));
    // Resolve reference lengths from target snapshots using the same routing as ordinary frame evaluation.
    // The second compilation changes timing only; authored transitions are capped at each effective beat duration.
    const authoredTimeline = new CompiledTimeline(document);
    const movementDurations = new Map<string, number>();
    let startMs = 0;
    for (const [sceneIndex, scene] of document.scenes.entries()) {
      scene.beats.forEach((beat, index) => {
        const flows = beat.actions.filter((action) => action.type === "flow");
        if (flows.length === 1) {
          const geometry = this.evaluateFrame(startMs, { reducedMotion: true }, authoredTimeline).edgeGeometries.get(flows[0]!.target)!;
          // Invalid finite-input arithmetic can produce NaN points even when geometry's zero-length fallback is finite.
          if (!Number.isFinite(geometry.length) || geometry.points.some((point) => !Number.isFinite(point.x) || !Number.isFinite(point.y))) {
            throw new DiagramValidationError([{ path: `scenes[${sceneIndex}].beats[${index}].durationMs`, message: "effective beat timing must be finite" }]);
          }
          movementDurations.set(`${scene.id}:${index}`, Math.max(MIN_FLOW_MOVEMENT_MS, geometry.length / FLOW_UNITS_PER_SECOND * MILLISECONDS_PER_SECOND));
        }
        startMs += beat.durationMs;
      });
    }
    this.timeline = new CompiledTimeline(document, movementDurations);
    this.totalDuration = this.timeline.totalDuration;
    this.beats = this.timeline.schedule;
  }
  evaluateAt(timeMs: number, options: EvaluateOptions = {}): DiagramFrameState {
    return this.evaluateFrame(timeMs, options).frame;
  }
  diagnoseAt(timeMs: number, options: EvaluateOptions = {}): GeometryWarning[] {
    return diagnoseFrame(this.evaluateFrame(timeMs, options));
  }
  getFrameStateEvaluator(): FrameStateEvaluator {
    return {
      evaluate: (timeMs, options = {}) => this.evaluateFrame(timeMs, options),
      render: (evaluation, options) => serializeSvg(this.document, evaluation.frame, evaluation.palette, this.typography, options),
      hitTest: (evaluation, point) => hitTestDiagramFrame(evaluation, point)
    };
  }
  private evaluateFrame(timeMs: number, options: EvaluateOptions = {}, compiledTimeline = this.timeline): DiagramFrameEvaluation {
    const palette = resolvePalette(this.document, options);
    const { nodeLabel: nodeTypography, edgeLabel: edgeTypography } = this.typography;
    const timeline = compiledTimeline.evaluateAt(timeMs, options, palette);
    const currentNodes = new Map(this.document.nodes.map((node) => {
      const values = timeline.objects.get(node.id)!.values;
      return [node.id, { ...node, x: values.x ?? node.x, y: values.y ?? node.y, width: values.width ?? node.width, height: values.height ?? node.height, label: values.label, content: values.content ?? undefined }];
    }));
    const flowHighlights = resolveFlowHighlights(timeline.flows, this.document.edges, timeline.flowArrivalProgress, timeline.flowDepartureProgress);
    const warnings: LayoutWarning[] = [];
    const nodes = [...currentNodes.values()].map((node, index) => {
      const position = this.resolvePosition(node.id, currentNodes);
      const safeArea = nodeLabelSafeArea({ ...node, ...position });
      const labelLayout = safeArea ? wrapNodeLabel(node.label ?? "", safeArea.width, nodeTypography) : undefined;
      if (labelLayout) {
        assertFiniteTypography("nodeLabel", [labelLayout.height]);
        for (const text of labelLayout.lines) assertFiniteTypography("nodeLabel", [estimateTextWidth(text, nodeTypography)]);
      }
      const labelLines = labelLayout?.lines ?? (node.label ? wrapText(node.label, Math.max(1, node.width - TEXT_PADDING * 2), nodeTypography) : []);
      const labelCenterY = node.kind === "group" ? position.y + 24 : position.y + node.height / 2;
      const labelBoxes = safeArea ? placeNodeLabel(labelLines, safeArea, nodeTypography)
        : makeLabelBoxes(labelLines, position.x + node.width / 2, labelCenterY, nodeTypography, "nodeLabel");
      if (labelLayout && safeArea) {
        for (const dimension of ["width", "height"] as const) {
          const overflow = dimension === "width" ? labelLayout.widthOverflow : labelLayout.height > safeArea.height + NODE_LABEL_OVERFLOW_TOLERANCE;
          if (overflow) warnings.push({ path: `nodes[${index}].label`, objectId: node.id, code: "text-overflow", message: `label for node "${node.id}" exceeds its ${dimension}` });
        }
      } else if (node.label && labelLines.length * nodeTypography.lineHeight > Math.max(0, node.height - TEXT_PADDING * 2)) warnings.push({ path: `nodes[${index}].label`, objectId: node.id, code: "text-overflow", message: `label for node \"${node.id}\" exceeds its height` });
      const visual = this.resolveVisibility(node.id, timeline.objects);
      const own = timeline.objects.get(node.id)!;
      const highlight = Math.max(own.highlight, flowHighlights.get(node.id) ?? 0);
      const style = {
        strokeWidth: DEFAULT_NODE_STROKE_WIDTH,
        textColor: palette.text,
        ...node.style,
        fill: mixColor(own.values.fill ?? palette.fill, palette.highlightFill, highlight),
        stroke: mixColor(own.values.stroke ?? palette.stroke, palette.highlight, highlight)
      };
      const contentLayout = node.content ? paintContentHighlight(
        layoutFiniteNodeContent(node.content, { ...position, width: node.width, height: node.height }, palette, node.kind, this.typography.contentScale),
        highlight, style.fill
      ) : undefined;
      if (contentLayout) {
        for (const direction of ["width", "height"] as const) {
          if (contentLayout[direction === "width" ? "widthOverflow" : "heightOverflow"]) warnings.push({ path: `nodes[${index}].content`, objectId: node.id, code: "text-overflow", message: `content for node "${node.id}" exceeds its ${direction}` });
        }
      }
      return { ...node, contentLayout, ...visual, highlighted: own.highlighted || flowHighlights.has(node.id), style, x: position.x, y: position.y, labelLines, labelBoxes };
    });
    const nodeById = new Map(nodes.map((node) => [node.id, node]));
    const targetOffsets = routedTargetOffsets(this.document.edges, nodeById);
    const edgeGeometries = new Map<string, PathGeometry>();
    const edges = this.document.edges.map((original) => {
      const own = timeline.objects.get(original.id)!;
      const activeFlow = timeline.flows.find((flow) => flow.target === original.id);
      const edge = { ...original, label: own.values.label };
      const from = nodeById.get(edge.from);
      const to = nodeById.get(edge.to);
      const visible = own.visible && Boolean(from?.visible && to?.visible);
      // Take the minimum so simultaneous endpoint fades do not darken an edge again through multiplication.
      const opacity = Math.min(own.opacity, from?.opacity ?? 0, to?.opacity ?? 0);
      const style = {
        ...edge.style,
        strokeWidth: own.values.strokeWidth ?? edge.style?.strokeWidth ?? 2,
        dashed: edge.style?.dashed ?? false,
        stroke: mixColor(own.values.stroke ?? palette.edge, palette.highlight, Math.max(own.highlight, Number(activeFlow !== undefined) * (1 - timeline.flowDepartureProgress)))
      };
      const hasReverseCurve = edge.route === "curved" && this.document.edges.some((candidate) => candidate.id !== edge.id && candidate.route === "curved" && candidate.from === edge.to && candidate.to === edge.from);
      // Both directions use the same lane magnitude; the perpendicular vector reverses with the edge,
      // so the rendered relationships occupy opposite sides of their shared center line.
      const reverseOffset = hasReverseCurve ? 1 : 0;
      const geometry = from && to ? routeEdge({ ...edge, style }, from, to, nodes, { reverseOffset, targetOffset: targetOffsets.get(edge.id) ?? 0 }) : emptyPathGeometry();
      edgeGeometries.set(edge.id, geometry);
      // A vertical route's length is not its horizontal text budget. Reuse the narrower endpoint column.
      const labelWidth = geometry.bounds.left === geometry.bounds.right && from && to
        ? Math.min(from.width, to.width) : geometry.length;
      const labelLines = edge.label ? wrapText(edge.label, Math.max(1, labelWidth - TEXT_PADDING * 2), edgeTypography) : [];
      const midpoint = pathLabelAnchor(geometry);
      const flow = activeFlow && visible && opacity > 0 && !options.reducedMotion ? {
        direction: activeFlow.direction,
        progress: timeline.flowProgress,
        point: geometry.pointAt(activeFlow.direction === "forward" ? timeline.flowProgress : 1 - timeline.flowProgress),
        ...(activeFlow.text !== undefined ? { text: activeFlow.text } : {})
      } : undefined;
      if (flow?.text !== undefined) assertFiniteTypography("flowLabel", [flowCapsuleWidth(flow.text, this.typography.flowLabel)]);
      return { ...edge, visible, opacity, highlighted: own.highlighted || activeFlow !== undefined, style, path: geometry.path, labelLines, labelBoxes: makeLabelBoxes(labelLines, midpoint.x, midpoint.y, edgeTypography, "edgeLabel"), ...(flow ? { flow } : {}) };
    });
    const camera = resolveCamera(this.document.viewport, timeline.focusBefore, timeline.focusAfter, timeline.transitionProgress, nodes, edges, edgeGeometries, this.typography);
    return {
      frame: { timeMs: timeline.timeMs, sceneId: timeline.sceneId, beatId: timeline.beatId, beatProgress: timeline.beatProgress, nodes, edges, camera, warnings, ...(timeline.caption !== undefined ? { caption: timeline.caption } : {}) },
      edgeGeometries,
      palette,
      typography: this.typography
    };
  }
  renderSvg(timeMs = 0, options: SvgRenderOptions = {}): string {
    const evaluation = this.evaluateFrame(timeMs, options);
    return serializeSvg(this.document, evaluation.frame, evaluation.palette, this.typography, options);
  }
  hitTest(timeMs: number, point: DiagramPoint, options: EvaluateOptions = {}): HitObject | null {
    const evaluated = this.evaluateFrame(timeMs, options);
    return hitTestDiagramFrame(evaluated, point);
  }
  private resolvePosition(id: string, nodes: ReadonlyMap<string, DiagramNode>): {
    x: number;
    y: number
  } {
    const node = nodes.get(id);
    if (!node) return { x: 0, y: 0 };
    const parent = node.parentId ? this.resolvePosition(node.parentId, nodes) : { x: 0, y: 0 };
    return { x: node.x + parent.x, y: node.y + parent.y };
  }
  /** Intersect ancestor visibility and take minimum opacity without altering a child's stored state. */
  private resolveVisibility(id: string, states: ReadonlyMap<string, TimelineObject>): {
    visible: boolean;
    opacity: number
  } {
    const node = this.nodesById.get(id);
    const own = states.get(id)!;
    if (!node?.parentId) return { visible: own.visible, opacity: own.opacity };
    const parent = this.resolveVisibility(node.parentId, states);
    return { visible: own.visible && parent.visible, opacity: Math.min(own.opacity, parent.opacity) };
  }
}

const TEXT_PADDING = 12;
const CONTENT_TAG_CORNER_RADIUS = 3;
const FLOW_TEXT_PADDING = 10;
const FLOW_DOT_RADIUS = 5;
const FLOW_UNITS_PER_SECOND = 180;
const MIN_FLOW_MOVEMENT_MS = 400;
const MILLISECONDS_PER_SECOND = 1000;

/**
 * Estimate wrapping with fixed code-point widths, preserving explicit empty lines and complete Latin words.
 * An overwide word stays intact and can exceed maxWidth; other scripts retain code-point wrapping.
 * No font/DOM measurement is used; frame evaluation reports ordinary node-label height overflow.
 */
export function wrapText(label: string, maxWidth: number, typography: TextMetrics = DEFAULT_NODE_TYPOGRAPHY): string[] {
  const maxChars = Math.max(1, Math.floor(maxWidth / typography.charWidth));
  const lines: string[] = [];
  for (const explicitLine of label.split("\n")) {
    if (explicitLine.length === 0) {
      lines.push("");
      continue;
    }
    // Code-point slicing keeps surrogate pairs intact even when only one character fits.
    let remaining = Array.from(explicitLine);
    while (remaining.length > maxChars) {
      const cut = findTextBreak(remaining, maxChars);
      lines.push(remaining.slice(0, cut).join(""));
      remaining = Array.from(remaining.slice(cut).join("").replace(/^\s+/, ""));
    }
    if (remaining.length > 0) lines.push(remaining.join(""));
  }
  return lines;
}

/** Paint senders immediately and receivers after arrival, then remove single-flow paint before beat cleanup. */
function resolveFlowHighlights(flows: readonly CompiledFlow[], edges: readonly DiagramEdge[], arrivalProgress: number, departureProgress: number): ReadonlyMap<string, number> {
  const highlights = new Map<string, number>();
  const amount = 1 - departureProgress;
  for (const flow of flows) {
    if (!flow.highlightParticipants) continue;
    const edge = edges.find((candidate) => candidate.id === flow.target);
    if (!edge) continue;
    const sender = flow.direction === "forward" ? edge.from : edge.to;
    const receiver = flow.direction === "forward" ? edge.to : edge.from;
    highlights.set(sender, amount);
    // Keep membership at zero paint so arrival does not change logical participant state.
    highlights.set(receiver, Math.max(highlights.get(receiver) ?? 0, arrivalProgress * amount));
  }
  return highlights;
}

function makeLabelBoxes(lines: string[], centerX: number, centerY: number, typography: TextMetrics, role: "nodeLabel" | "edgeLabel"): TextLine[] {
  assertFiniteTypography(role, [lines.length * typography.lineHeight, ...lines.map((text) => estimateTextWidth(text, typography))]);
  const startY = centerY - ((lines.length - 1) * typography.lineHeight) / 2 + typography.fontSize * 0.35;
  return lines.map((text, index) => ({ text, x: centerX, y: startY + index * typography.lineHeight }));
}

/** Serialize group backgrounds, edges, ordinary nodes, then labels; write the evaluated camera directly to viewBox. */
function serializeSvg(document: DiagramDocument, frame: DiagramFrameState, palette: ThemePalette, typography: ResolvedTypography, options: SvgRenderOptions = {}): string {
  const { nodeLabel: nodeTypography, edgeLabel: edgeTypography } = typography;
  const title = escapeText(document.title ?? "Diagram");
  const edgeShapes = frame.edges.filter((edge) => edge.opacity > 0).map((edge) => {
    const stroke = edge.style?.stroke ?? palette.edge;
    const width = edge.style?.strokeWidth ?? 2;
    const dash = edge.style?.dashed ? ' stroke-dasharray="6 4"' : "";
    return `<path d="${escapeAttribute(edge.path)}" fill="none" stroke="${escapeAttribute(stroke)}" color="${escapeAttribute(stroke)}" stroke-width="${width}"${dash} marker-end="url(#diagram-arrow)" data-id="${escapeAttribute(edge.id)}" opacity="${edge.opacity}"/>`;
  }).join("");
  const groupShapes = frame.nodes.filter((node) => node.opacity > 0 && node.kind === "group").map((node) => serializeNodeShape(node, palette)).join("");
  const nodeShapes = frame.nodes.filter((node) => node.opacity > 0 && node.kind !== "group").map((node) => serializeNodeShape(node, palette)).join("");
  const labels = frame.edges.filter((edge) => edge.opacity > 0).map((edge) => serializeLabel(edge.labelLines, edge.labelBoxes, edge.style?.stroke ?? palette.text, edgeTypography, edge.opacity, palette.background)).join("") + frame.nodes.filter((node) => node.opacity > 0).map((node, index) => serializeNodeLabel(node, index, palette, nodeTypography)).join("");
  const contents = frame.nodes.filter((node) => node.opacity > 0 && node.contentLayout).map((node, index) => serializeNodeContent(node, index)).join("");
  const flows = frame.edges.filter((edge) => edge.opacity > 0 && edge.flow).map((edge) => serializeFlowMarker(edge.flow!, edge.id, palette, edge.opacity, typography.flowLabel)).join("");
  const marker = `<defs><marker id="diagram-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="${ARROW_MARKER_SIZE}" markerHeight="${ARROW_MARKER_SIZE}" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="context-stroke"/></marker></defs>`;
  const ariaLabel = escapeAttribute(document.title ?? "Diagram");
  const camera = `${formatNumber(frame.camera.x)} ${formatNumber(frame.camera.y)} ${formatNumber(frame.camera.width)} ${formatNumber(frame.camera.height)}`;
  const background = options.background === "transparent" ? "" : `<rect x="${formatNumber(frame.camera.x)}" y="${formatNumber(frame.camera.y)}" width="${formatNumber(frame.camera.width)}" height="${formatNumber(frame.camera.height)}" fill="${palette.background}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${camera}" role="img" aria-label="${ariaLabel}" font-family="${escapeAttribute(DIAGRAM_FONT_FAMILY)}"><title>${title}</title>${marker}${background}${groupShapes}${edgeShapes}${nodeShapes}${labels}${contents}${flows}</svg>`;
}

/** Serialize preset label paint inside its shape-safe rectangle without discarding source lines. */
function serializeNodeLabel(node: EvaluatedNode, index: number, palette: ThemePalette, typography: TextMetrics): string {
  const label = serializeLabel(node.labelLines, node.labelBoxes, node.style?.textColor ?? palette.text, typography, node.opacity);
  const safe = nodeLabelSafeArea(node);
  if (!safe || !label) return label;
  const key = [safe.x, safe.y, safe.width, safe.height].map((value) => String(value).replaceAll("-", "n").replaceAll(".", "p").replaceAll("+", "a")).join("-");
  const clipId = `diagram-label-clip-${index}-${key}`;
  return `<defs><clipPath id="${clipId}" clipPathUnits="userSpaceOnUse"><rect x="${formatNumber(safe.x)}" y="${formatNumber(safe.y)}" width="${formatNumber(safe.width)}" height="${formatNumber(safe.height)}"/></clipPath></defs><g clip-path="url(#${clipId})">${label}</g>`;
}

/** Serialize evaluated text and tag backgrounds inside one clip; authored content cannot introduce SVG markup or CSS. */
function serializeNodeContent(node: EvaluatedNode, index: number): string {
  const layout = node.contentLayout!;
  const safe = layout.safeArea;
  // Include exact clip geometry so independent SVGs with different node dimensions do not share a clip definition.
  const geometryKey = [safe.x, safe.y, safe.width, safe.height].map((value) => String(value).replaceAll("-", "n").replaceAll(".", "p").replaceAll("+", "a")).join("-");
  const clipId = `diagram-content-clip-${index}-${geometryKey}`;
  const clip = `<defs><clipPath id="${clipId}" clipPathUnits="userSpaceOnUse"><rect x="${formatNumber(safe.x)}" y="${formatNumber(safe.y)}" width="${formatNumber(safe.width)}" height="${formatNumber(safe.height)}"/></clipPath></defs>`;
  const tags = layout.tags.map((tag) => `<rect x="${formatNumber(tag.x)}" y="${formatNumber(tag.y)}" width="${formatNumber(tag.width)}" height="${formatNumber(tag.height)}" rx="${formatNumber(tag.shape === "pill" ? tag.height / 2 : CONTENT_TAG_CORNER_RADIUS)}" fill="${escapeAttribute(tag.fill)}"/>`).join("");
  const lines = layout.lines.map((line) => {
    const centered = line.align === "center";
    const anchor = centered ? "middle" : line.align === "right" ? "end" : "start";
    const spans = line.spans.map((span, spanIndex) => {
      // Keep a centered line in one SVG text chunk, including mixed-style spans.
      // Native font advances determine its visible center; estimated widths still own wrapping.
      const position = centered && spanIndex > 0 ? ""
        : ` x="${formatNumber(centered ? line.x : span.x)}" y="${formatNumber(span.y)}"`;
      return `<tspan${position} fill="${escapeAttribute(span.color)}" font-size="${span.fontSize}" font-weight="${span.fontWeight}" text-anchor="${centered ? "middle" : "start"}">${escapeText(span.text)}</tspan>`;
    }).join("");
    return `<text x="${formatNumber(line.x)}" y="${formatNumber(line.y)}" fill="${escapeAttribute(line.color)}" font-size="${line.fontSize}" font-weight="${line.fontWeight}" text-anchor="${anchor}">${spans}</text>`;
  }).join("");
  const graphs = (layout.graphs ?? []).map((graph) => `<g data-content-graph="${graph.blockIndex}" aria-hidden="true">${graph.edges.map((edge) => `<line x1="${formatNumber(edge.x1)}" y1="${formatNumber(edge.y1)}" x2="${formatNumber(edge.x2)}" y2="${formatNumber(edge.y2)}" stroke="${edge.color}"/>`).join("")}${graph.nodes.map((point) => `<circle cx="${formatNumber(point.x)}" cy="${formatNumber(point.y)}" r="${point.radius}" fill="${point.fill}"/>`).join("")}</g>`).join("");
  return `${clip}<g id="diagram-content-${index}" data-content-id="${escapeAttribute(node.id)}" clip-path="url(#${clipId})" opacity="${node.opacity}">${tags}${graphs}${lines}</g>`;
}

/** Keep markers decorative and horizontal; coordinates come only from the evaluated path point. */
function serializeFlowMarker(flow: EdgeFlowMarker, edgeId: string, palette: ThemePalette, opacity: number, flowTypography: TextMetrics): string {
  const capsuleHeight = flowCapsuleHeight(flowTypography);
  const attributes = `fill="${palette.highlight}" data-flow-id="${escapeAttribute(edgeId)}" opacity="${opacity}" pointer-events="none" aria-hidden="true"`;
  if (flow.text === undefined) return `<circle cx="${formatNumber(flow.point.x)}" cy="${formatNumber(flow.point.y)}" r="${FLOW_DOT_RADIUS}" ${attributes}/>`;
  const width = flowCapsuleWidth(flow.text, flowTypography);
  const x = formatNumber(flow.point.x - width / 2);
  const y = formatNumber(flow.point.y - capsuleHeight / 2);
  // Marker ink follows its saturated fill, independently of node text and interior highlight paint.
  const text = `<text x="${formatNumber(flow.point.x)}" y="${formatNumber(flow.point.y + flowTypography.fontSize * 0.35)}" fill="${palette.highlightText}" font-size="${flowTypography.fontSize}" text-anchor="middle">${escapeText(flow.text)}</text>`;
  return `<g ${attributes}><rect x="${x}" y="${y}" width="${formatNumber(width)}" height="${capsuleHeight}" rx="${capsuleHeight / 2}"/>${text}</g>`;
}

/** Validate text-derived arithmetic before exposing or serializing a frame with non-finite coordinates. */
function assertFiniteTypography(role: "nodeLabel" | "edgeLabel" | "flowLabel", values: Iterable<number>): void {
  for (const value of values) {
    if (!Number.isFinite(value)) {
      throw new DiagramValidationError([{ path: `typography.${role}`, message: "derived text geometry must be finite" }]);
    }
  }
}

/** Check the complete layout, including the final accumulated line box, before paint or public frame exposure. */
function layoutFiniteNodeContent(content: NodeContent, bounds: ContentSafeArea, palette: ThemePalette,
  kind: DiagramNode["kind"], defaultFontScale: number): NodeContentLayout {
  const result = layoutNodeContentWithMetrics(content, bounds, palette, kind, defaultFontScale);
  // Finite role sizes can overflow after many lines or blocks. Keep measurement's version-path errors independent.
  assertFiniteTypography("nodeLabel", geometryNumbers(result));
  return result.layout;
}

/** Walk numeric geometry lazily so large content layouts do not allocate a second metric array. */
function* geometryNumbers(value: unknown): Generator<number> {
  if (typeof value === "number") {
    yield value;
    return;
  }
  if (value === null || typeof value !== "object") return;
  for (const entry of Object.values(value)) yield* geometryNumbers(entry);
}

function flowCapsuleWidth(text: string, typography: TextMetrics): number {
  return Math.max(flowCapsuleHeight(typography), estimateTextWidth(text, typography) + FLOW_TEXT_PADDING * 2);
}

/** Serialize supported shapes with escaped color/identity attributes; labels are drawn in a separate text layer. */
function serializeNodeShape(node: EvaluatedNode, palette: ThemePalette): string {
  const fill = node.style?.fill ?? palette.fill;
  const stroke = node.style?.stroke ?? palette.stroke;
  const width = node.style?.strokeWidth ?? DEFAULT_NODE_STROKE_WIDTH;
  const dash = node.kind === "group" && node.style?.dashed ? ' stroke-dasharray="10 7"' : "";
  const attrs = `fill="${escapeAttribute(fill)}" stroke="${escapeAttribute(stroke)}" stroke-width="${width}"${dash} data-id="${escapeAttribute(node.id)}" opacity="${node.opacity}"`;
  const outline = nodeOutline(node);
  if (node.kind === "predefinedProcess") {
    const inset = predefinedProcessInset(node.width);
    const left = formatNumber(node.x + inset);
    const right = formatNumber(node.x + node.width - inset);
    const top = formatNumber(node.y);
    const bottom = formatNumber(node.y + node.height);
    // One interaction group owns both the outer contour and decorative lines.
    return `<g ${attrs}><polygon points="${outline!.map(({ x, y }) => `${formatNumber(x)},${formatNumber(y)}`).join(" ")}" stroke-linejoin="round"/><path d="M ${left} ${top} V ${bottom} M ${right} ${top} V ${bottom}" fill="none"/></g>`;
  }
  if (outline) return `<polygon points="${outline.map(({ x, y }) => `${formatNumber(x)},${formatNumber(y)}`).join(" ")}" stroke-linejoin="round" ${attrs}/>`;
  if (node.kind === "ellipse") return `<ellipse cx="${formatNumber(node.x + node.width / 2)}" cy="${formatNumber(node.y + node.height / 2)}" rx="${formatNumber(node.width / 2)}" ry="${formatNumber(node.height / 2)}" ${attrs}/>`;
  if (node.kind === "cylinder") {
    const ry = Math.min(CYLINDER_CAP_RADIUS, node.height / 4);
    const bottom = node.y + node.height - ry;
    const bodyPath = `M ${formatNumber(node.x)} ${formatNumber(node.y + ry)} L ${formatNumber(node.x + node.width)} ${formatNumber(node.y + ry)} L ${formatNumber(node.x + node.width)} ${formatNumber(bottom)} A ${formatNumber(node.width / 2)} ${formatNumber(ry)} 0 0 1 ${formatNumber(node.x)} ${formatNumber(bottom)} Z`;
    // Keep the cap as a filled sibling so the SVG fill rule cannot turn its interior into a hole.
    // The group owns the only data-id, allowing hover and DOM synchronization to treat the cylinder as one node.
    const cap = `<ellipse cx="${formatNumber(node.x + node.width / 2)}" cy="${formatNumber(node.y + ry)}" rx="${formatNumber(node.width / 2)}" ry="${formatNumber(ry)}"/>`;
    return `<g ${attrs}><path d="${bodyPath}"/>${cap}</g>`;
  }
  const radius = node.kind === "roundedRect" || node.kind === "group" ? ` rx="${Math.min(NODE_CORNER_RADIUS, node.width / 4, node.height / 4)}"` : "";
  return `<rect x="${formatNumber(node.x)}" y="${formatNumber(node.y)}" width="${formatNumber(node.width)}" height="${formatNumber(node.height)}"${radius} ${attrs}/>`;
}
function serializeLabel(lines: string[], boxes: TextLine[], color: string, typography: TextMetrics, opacity = 1, background?: string): string {
  if (lines.length === 0) return "";
  const x = boxes[0]?.x ?? 0;
  const body = lines.map((line, index) => `<tspan x="${formatNumber(x)}" y="${formatNumber(boxes[index]?.y ?? 0)}">${escapeText(line)}</tspan>`).join("");
  // Only edge labels need background isolation from the path beneath them.
  const halo = background ? ` stroke="${escapeAttribute(background)}" stroke-width="${EDGE_LABEL_HALO_RADIUS * 2}" stroke-linejoin="round" paint-order="stroke"` : "";
  return `<text fill="${escapeAttribute(color)}"${halo} font-size="${typography.fontSize}" text-anchor="middle" opacity="${opacity}">${body}</text>`;
}
interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

const FOCUS_PADDING = 24;
const MIN_FITTED_HEIGHT = 1;
const HIT_TOLERANCE = 6;

/** Resolve both focus targets against current geometry, then interpolate cameras with the timeline's eased progress. */
function resolveCamera(viewport: Viewport, beforeTarget: string | null, afterTarget: string | null, progress: number, nodes: readonly EvaluatedNode[], edges: readonly EvaluatedEdge[], edgeGeometries: ReadonlyMap<string, PathGeometry>, typography: ResolvedTypography): CameraState {
  const full = { x: 0, y: 0, width: viewport.width, height: fittedHeight(viewport, nodes, edges, edgeGeometries, typography) };
  const before = focusCamera(viewport, beforeTarget, nodes, edges, edgeGeometries) ?? full;
  const after = focusCamera(viewport, afterTarget, nodes, edges, edgeGeometries) ?? full;
  if (progress <= 0) return before;
  if (progress >= 1) return after;
  return {
    x: before.x + (after.x - before.x) * progress,
    y: before.y + (after.y - before.y) * progress,
    width: before.width + (after.width - before.width) * progress,
    height: before.height + (after.height - before.height) * progress
  };
}

/** Full-view fitting keeps authored width and origin; include paint without changing node geometry. */
function fittedHeight(viewport: Viewport, nodes: readonly EvaluatedNode[], edges: readonly EvaluatedEdge[], geometries: ReadonlyMap<string, PathGeometry>, typography: ResolvedTypography): number {
  const { nodeLabel: nodeTypography, edgeLabel: edgeTypography } = typography;
  if (!viewport.fitHeight) return viewport.height;
  const bottoms: number[] = [];
  for (const node of nodes) {
    if (node.opacity <= 0) continue;
    bottoms.push(node.y + node.height + (node.style?.strokeWidth ?? DEFAULT_NODE_STROKE_WIDTH) / 2);
    // Preset labels are clipped inside the node, so invisible line boxes cannot enlarge the viewport.
    if (!nodeLabelSafeArea(node)) for (const bottom of labelBottoms(node.labelBoxes, nodeTypography)) bottoms.push(bottom);
  }
  for (const edge of edges) {
    if (edge.opacity <= 0) continue;
    const geometry = geometries.get(edge.id);
    if (geometry) {
      const strokeWidth = edge.style?.strokeWidth ?? 2;
      bottoms.push(geometry.paintedBottom + strokeWidth / 2, arrowBottom(geometry, strokeWidth));
    }
    for (const bottom of labelBottoms(edge.labelBoxes, edgeTypography, EDGE_LABEL_HALO_RADIUS)) bottoms.push(bottom);
    if (edge.flow) bottoms.push(edge.flow.point.y + (edge.flow.text === undefined ? FLOW_DOT_RADIUS : flowCapsuleHeight(typography.flowLabel) / 2));
  }
  if (bottoms.length === 0) return viewport.height;
  const bottom = bottoms.reduce((maximum, value) => Math.max(maximum, value), 0);
  const height = Math.max(MIN_FITTED_HEIGHT, Math.ceil(bottom + viewport.fitHeight.padding));
  if (!Number.isFinite(height)) throw new DiagramValidationError([{ path: "viewport.fitHeight", message: "current painted geometry and padding must produce a finite height" }]);
  return height;
}

/** Match the three SVG marker vertices around refX=9, refY=5 in its ten-unit viewBox. */
function arrowBottom(geometry: PathGeometry, strokeWidth: number): number {
  const end = geometry.points.at(-1);
  if (!end) return 0;
  const direction = geometry.terminalDirection;
  const markerScale = ARROW_MARKER_SIZE * strokeWidth;
  const vertexOffset = Math.max(0.1 * direction.y, -0.9 * direction.y + 0.5 * Math.abs(direction.x));
  return end.y + markerScale * vertexOffset;
}

/** Use the same deterministic text descent as node hit bounds; edge labels also paint a three-unit halo. */
function labelBottoms(boxes: readonly TextLine[], typography: TextMetrics, halo = 0): number[] {
  return boxes.filter((line) => line.text.length > 0).map((line) => textLineBounds(line, typography, halo).bottom);
}

/** Pad bounds of the target, descendants and visible incident edges, preserving aspect ratio within the initial viewport. */
function focusCamera(viewport: Viewport, target: string | null, nodes: readonly EvaluatedNode[], edges: readonly EvaluatedEdge[], edgeGeometries: ReadonlyMap<string, PathGeometry>): CameraState | undefined {
  if (!target) return undefined;
  const targetNode = nodes.find((node) => node.id === target);
  if (!targetNode) return undefined;
  const targetIds = new Set(nodes.filter((node) => node.id === target || hasAncestor(node, target, nodes)).map((node) => node.id));
  const bounds: Rect[] = nodes.filter((node) => targetIds.has(node.id)).map(nodeBounds);
  for (const edge of edges) {
    if (edge.visible && edge.opacity > 0 && (targetIds.has(edge.from) || targetIds.has(edge.to))) bounds.push((edgeGeometries.get(edge.id) ?? emptyPathGeometry()).bounds);
  }
  const combined = combineBounds(bounds);
  if (!combined) return undefined;
  const aspect = viewport.width / viewport.height;
  const paddedWidth = combined.right - combined.left + FOCUS_PADDING * 2;
  const paddedHeight = combined.bottom - combined.top + FOCUS_PADDING * 2;
  let width = Math.max(paddedWidth, paddedHeight * aspect);
  let height = Math.max(paddedHeight, paddedWidth / aspect);
  if (width > viewport.width) {
    width = viewport.width;
    height = width / aspect;
  }
  if (height > viewport.height) {
    height = viewport.height;
    width = height * aspect;
  }
  const centerX = (combined.left + combined.right) / 2;
  const centerY = (combined.top + combined.bottom) / 2;
  const x = clampCamera(centerX - width / 2, 0, viewport.width - width);
  const y = clampCamera(centerY - height / 2, 0, viewport.height - height);
  return { x, y, width, height };
}

function hasAncestor(node: EvaluatedNode, ancestorId: string, nodes: readonly EvaluatedNode[]): boolean {
  const byId = new Map(nodes.map((candidate) => [candidate.id, candidate]));
  let parentId = node.parentId;
  while (parentId) {
    if (parentId === ancestorId) return true;
    parentId = byId.get(parentId)?.parentId;
  }
  return false;
}

function nodeBounds(node: EvaluatedNode): Rect {
  return { left: node.x, top: node.y, right: node.x + node.width, bottom: node.y + node.height };
}
function combineBounds(bounds: readonly Rect[]): Rect | undefined {
  if (bounds.length === 0) return undefined;
  return { left: Math.min(...bounds.map((bound) => bound.left)), top: Math.min(...bounds.map((bound) => bound.top)), right: Math.max(...bounds.map((bound) => bound.right)), bottom: Math.max(...bounds.map((bound) => bound.bottom)) };
}
function clampCamera(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Presets use their real outline; existing nodes retain visible overflowing-label interaction targets. */
function isPointInNode(point: DiagramPoint, node: EvaluatedNode, nodeTypography: TextMetrics): boolean {
  const presetHit = isPointInNodeOutline(node, point);
  if (presetHit !== undefined) return presetHit;
  const labelHit = node.labelBoxes.some((line) => {
    if (line.text.length === 0) return false;
    const bounds = textLineBounds(line, nodeTypography);
    return point.x >= bounds.left && point.x <= bounds.right && point.y >= bounds.top && point.y <= bounds.bottom;
  });
  if (labelHit) return true;
  if (node.kind === "ellipse") {
    const dx = (point.x - (node.x + node.width / 2)) / (node.width / 2);
    const dy = (point.y - (node.y + node.height / 2)) / (node.height / 2);
    return dx * dx + dy * dy <= 1;
  }
  return point.x >= node.x && point.x <= node.x + node.width && point.y >= node.y && point.y <= node.y + node.height;
}

function escapeText(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");
}
function escapeAttribute(value: string): string {
  return escapeText(value);
}
/** Validation restricts inputs to serializable documents; clone before freezing to isolate later author mutations. */
function cloneDocument(document: DiagramDocument): DiagramDocument {
  return JSON.parse(JSON.stringify(document)) as DiagramDocument;
}
function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}

function resolvePalette(document: DiagramDocument, options: EvaluateOptions): ThemePalette {
  return resolveThemePalette(options.theme ?? document.theme, document.emphasis);
}
