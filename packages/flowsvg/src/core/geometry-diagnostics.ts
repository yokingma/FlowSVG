/** On-demand geometry risk detection; consumes evaluated paint without changing frame evaluation or routing. */
import type { DiagramFrameEvaluation } from "./diagram.js";
import type { EvaluatedNode, GeometryWarning, GeometryWarningCode } from "./model.js";
import type { ContentLine } from "./node-content.js";
import { TEXT_DESCENT_RATIO, EDGE_LABEL_HALO_RADIUS, textLineBounds, type TextMetrics } from "./typography.js";
import { cameraRect, clipPolygon, nodeFill, nodeStroke, paintOverlapsPolygon, rectPolygon, segmentStrip, type Paint, type Polygon } from "./diagnostic-geometry.js";

const WARNING_KEY_NAMESPACE = "flowsvg-layout-warning";
const WARNING_KEY_VERSION = 1;

type Descriptor = readonly (string | number | null)[];
interface Participant { objectId: string; path: string; descriptor: Descriptor }
interface NodePaint extends Participant { node: EvaluatedNode; paint: Paint[] }
interface Label extends Participant {
  ownerNodeId?: string;
  regions: Polygon[];
  /** Only ordinary edge labels have a shared SVG text halo; foreground regions exclude that decoration. */
  foregroundRegions?: Polygon[];
}

/** Validated hexadecimal colors have either no alpha or a final alpha channel. */
function hasPaint(color: string | undefined): boolean {
  if (!color) return false;
  return color.length === 5 ? color.at(-1) !== "0" : color.length === 9 ? color.slice(-2) !== "00" : true;
}

function warning(code: GeometryWarningCode, left: Participant, right: Participant): GeometryWarning {
  return { code, objectId: left.objectId, relatedObjectIds: [right.objectId], path: left.path,
    warningKey: JSON.stringify([WARNING_KEY_NAMESPACE, WARNING_KEY_VERSION, code, left.descriptor, right.descriptor]),
    message: `${left.objectId} ${code} ${right.objectId}; inspect the visible geometry` };
}

function collectNodes(evaluation: DiagramFrameEvaluation): NodePaint[] {
  return evaluation.frame.nodes.flatMap((node, index) => {
    if (!node.visible || node.opacity <= 0) return [];
    const paint = [...(hasPaint(node.style?.fill) ? nodeFill(node) : []),
      ...(hasPaint(node.style?.stroke) && (node.style?.strokeWidth ?? 0) > 0 ? nodeStroke(node) : [])];
    return paint.length ? [{ node, paint, objectId: node.id, path: `nodes[${index}]`, descriptor: ["node", node.id, "shape", `nodes[${index}]`] }] : [];
  });
}

function ordinaryLabels(evaluation: DiagramFrameEvaluation): Label[] {
  const camera = rectPolygon(cameraRect(evaluation.frame.camera));
  const collect = (object: EvaluatedNode | DiagramFrameEvaluation["frame"]["edges"][number], index: number,
    kind: "node" | "edge", typography: TextMetrics, painted: boolean, halo = 0): Label[] => {
    if (!object.visible || object.opacity <= 0 || !painted) return [];
    const path = `${kind === "node" ? "nodes" : "edges"}[${index}].label`;
    return object.labelBoxes.flatMap((line, lineIndex) => line.text.length ? [{ objectId: object.id, path,
      descriptor: [kind, object.id, "label", path, lineIndex], ...(kind === "node" ? { ownerNodeId: object.id } : {}),
      regions: [clipPolygon(rectPolygon(textLineBounds(line, typography, halo)), camera)],
      ...(kind === "edge" ? { foregroundRegions: hasPaint(object.style?.stroke)
        ? [clipPolygon(rectPolygon(textLineBounds(line, typography)), camera)] : [] } : {}) }] : []);
  };
  return [...evaluation.frame.nodes.flatMap((node, index) => collect(node, index, "node", evaluation.typography.nodeLabel, hasPaint(node.style?.textColor))),
    ...evaluation.frame.edges.flatMap((edge, index) => collect(edge, index, "edge", evaluation.typography.edgeLabel,
      hasPaint(edge.style?.stroke) || hasPaint(evaluation.palette.background), EDGE_LABEL_HALO_RADIUS))];
}

function contentFieldPath(node: EvaluatedNode, index: number, line: ContentLine): string {
  const path = `nodes[${index}].content.blocks[${line.blockIndex}]`;
  const block = node.content?.blocks[line.blockIndex];
  if (block?.type === "graph") return `${path}.nodes`;
  if (line.role === "marker") return `${path}.marker`;
  if (line.itemIndex === undefined) return `${path}.text`;
  const item = `${path}.items[${line.itemIndex}]`;
  if (line.tagIndex !== undefined) return `${item}.tags[${line.tagIndex}].text`;
  return `${item}.${line.role}`;
}

/** Visible span regions share one line identity; transparent gaps never become a filled line rectangle. */
function contentLabels(evaluation: DiagramFrameEvaluation): Label[] {
  const camera = rectPolygon(cameraRect(evaluation.frame.camera));
  return evaluation.frame.nodes.flatMap((node, index) => {
    if (!node.visible || node.opacity <= 0 || !node.contentLayout) return [];
    const area = node.contentLayout.safeArea;
    const safe = rectPolygon({ left: area.x, top: area.y, right: area.x + area.width, bottom: area.y + area.height });
    return node.contentLayout.lines.map((line, lineIndex) => {
      const path = contentFieldPath(node, index, line);
      const regions = line.spans.filter((span) => span.text.length > 0 && hasPaint(span.color)).map((span) => {
        const bounds = rectPolygon({ left: span.x, right: span.x + span.width,
          top: span.y - span.fontSize, bottom: span.y + span.fontSize * TEXT_DESCENT_RATIO });
        return clipPolygon(clipPolygon(bounds, safe), camera);
      });
      return { objectId: node.id, ownerNodeId: node.id, path, regions,
        descriptor: ["node", node.id, "content-line", path, line.blockIndex, line.itemIndex ?? null,
          line.tagIndex ?? null, line.role, lineIndex] };
    });
  });
}

function isOwnerOrAncestor(label: Label, target: EvaluatedNode, byId: ReadonlyMap<string, EvaluatedNode>): boolean {
  let owner = label.ownerNodeId;
  while (owner) {
    if (owner === target.id) return true;
    owner = byId.get(owner)?.parentId;
  }
  return false;
}

function diagnoseLabelNodes(labels: readonly Label[], nodes: readonly NodePaint[], evaluation: DiagramFrameEvaluation): GeometryWarning[] {
  const byId = new Map(evaluation.frame.nodes.map((node) => [node.id, node]));
  return labels.flatMap((label) => nodes.flatMap((target) => {
    if (isOwnerOrAncestor(label, target.node, byId)) return [];
    return label.regions.some((region) => target.paint.some((paint) => paintOverlapsPolygon(paint, region)))
      ? [warning("label-node-overlap", label, target)] : [];
  }));
}

function labelRegionsOverlap(left: readonly Polygon[], right: readonly Polygon[]): boolean {
  return left.some((region) => right.some((other) => paintOverlapsPolygon({ kind: "polygon", points: other }, region)));
}

function diagnoseLabelPairs(labels: readonly Label[]): GeometryWarning[] {
  return labels.flatMap((left, index) => labels.slice(index + 1).flatMap((right) => {
    // Normally spaced lines in one SVG text element can share their background halo without colliding.
    // Keep their foreground conflicts, and keep full halo checks between distinct fields or owners.
    const sharedEdgeLabel = left.foregroundRegions !== undefined && right.foregroundRegions !== undefined
      && left.objectId === right.objectId && left.path === right.path;
    const intersects = sharedEdgeLabel
      ? labelRegionsOverlap(left.foregroundRegions!, right.foregroundRegions!)
      : labelRegionsOverlap(left.regions, right.regions);
    if (!intersects) return [];
    const ordered = JSON.stringify(left.descriptor) < JSON.stringify(right.descriptor) ? [left, right] : [right, left];
    return [warning("label-overlap", ordered[0]!, ordered[1]!)];
  }));
}

/** The explicit Diagram method is the only caller; ordinary frame queries never run pair checks. */
export function diagnoseFrame(evaluation: DiagramFrameEvaluation): GeometryWarning[] {
  const nodes = collectNodes(evaluation);
  const camera = rectPolygon(cameraRect(evaluation.frame.camera));
  const warnings: GeometryWarning[] = [];
  evaluation.frame.edges.forEach((edge, index) => {
    if (!edge.visible || edge.opacity <= 0 || !hasPaint(edge.style?.stroke)) return;
    const points = evaluation.edgeGeometries.get(edge.id)?.points ?? [];
    const strips = points.slice(1).map((end, cursor) => clipPolygon(segmentStrip(points[cursor]!, end, (edge.style?.strokeWidth ?? 2) / 2), camera));
    const participant: Participant = { objectId: edge.id, path: `edges[${index}]`, descriptor: ["edge", edge.id, "path", `edges[${index}]`] };
    for (const target of nodes) {
      if (target.node.kind === "group" || target.objectId === edge.from || target.objectId === edge.to) continue;
      if (strips.some((strip) => target.paint.some((paint) => paintOverlapsPolygon(paint, strip)))) warnings.push(warning("edge-node-overlap", participant, target));
    }
  });
  const labels = [...ordinaryLabels(evaluation), ...contentLabels(evaluation)];
  warnings.push(...diagnoseLabelNodes(labels, nodes, evaluation), ...diagnoseLabelPairs(labels));
  return warnings.sort((left, right) => left.warningKey < right.warningKey ? -1 : left.warningKey > right.warningKey ? 1 : 0);
}
