/** Shared preset geometry for label layout and contour consumers; no browser or document mutation. */
import type { DiagramPoint, NodeKind, PortDirection } from "./model.js";
import type { ContentSafeArea } from "./node-content.js";

export const NODE_LABEL_PADDING = 12;
export const DOCUMENT_WAVE_MAX_BAND = 24;
const DOCUMENT_WAVE_SAMPLES = 256;
const PREDEFINED_PROCESS_MAX_INSET = 12;
const PREDEFINED_PROCESS_INSET_DIVISOR = 6;
const PARALLELOGRAM_SLANT_LIMIT = 24;
const PARALLELOGRAM_SLANT_RATIO = 1 / 4;
export type LabelNodeKind = "diamond" | "document" | "predefinedProcess" | "parallelogram";
export interface NodeBounds { kind: NodeKind; x: number; y: number; width: number; height: number }

/** Only these presets use safe-area labels; existing label behavior remains unchanged. */
export function isLabelNodeKind(kind: unknown): kind is LabelNodeKind {
  return kind === "diamond" || kind === "document" || kind === "predefinedProcess" || kind === "parallelogram";
}

/** Current absolute rectangular text clip, including fixed contour clearance and padding. */
export function nodeLabelSafeArea(node: NodeBounds): ContentSafeArea | undefined {
  if (!isLabelNodeKind(node.kind)) return undefined;
  if (node.kind === "parallelogram") {
    const slant = Math.min(node.width * PARALLELOGRAM_SLANT_RATIO, PARALLELOGRAM_SLANT_LIMIT);
    return { x: node.x + slant + NODE_LABEL_PADDING, y: node.y + NODE_LABEL_PADDING,
      width: Math.max(0, node.width - slant * 2 - NODE_LABEL_PADDING * 2), height: Math.max(0, node.height - NODE_LABEL_PADDING * 2) };
  }
  if (node.kind === "predefinedProcess") {
    const inset = predefinedProcessInset(node.width);
    return { x: node.x + inset + NODE_LABEL_PADDING, y: node.y + NODE_LABEL_PADDING,
      width: Math.max(0, node.width - inset * 2 - NODE_LABEL_PADDING * 2), height: Math.max(0, node.height - NODE_LABEL_PADDING * 2) };
  }
  if (node.kind === "document") return { x: node.x + NODE_LABEL_PADDING, y: node.y + NODE_LABEL_PADDING,
    width: Math.max(0, node.width - NODE_LABEL_PADDING * 2),
    height: Math.max(0, node.height - Math.min(node.height / 4, DOCUMENT_WAVE_MAX_BAND) - NODE_LABEL_PADDING * 2) };
  return { x: node.x + node.width / 4 + NODE_LABEL_PADDING, y: node.y + node.height / 4 + NODE_LABEL_PADDING,
    width: Math.max(0, node.width / 2 - NODE_LABEL_PADDING * 2), height: Math.max(0, node.height / 2 - NODE_LABEL_PADDING * 2) };
}

/** Decorative line inset is capped independently of node height; never an attachment surface. */
export function predefinedProcessInset(width: number): number {
  return Math.min(width / PREDEFINED_PROCESS_INSET_DIVISOR, PREDEFINED_PROCESS_MAX_INSET);
}

/** Clockwise outer contour shared by SVG, edge attachments, hits and diagnostic paint. */
export function nodeOutline(node: NodeBounds): readonly DiagramPoint[] | undefined {
  if (!isLabelNodeKind(node.kind)) return undefined;
  if (node.kind === "parallelogram") {
    const slant = Math.min(node.width * PARALLELOGRAM_SLANT_RATIO, PARALLELOGRAM_SLANT_LIMIT);
    return [{ x: node.x + slant, y: node.y }, { x: node.x + node.width, y: node.y },
      { x: node.x + node.width - slant, y: node.y + node.height }, { x: node.x, y: node.y + node.height }];
  }
  if (node.kind === "predefinedProcess") return [{ x: node.x, y: node.y }, { x: node.x + node.width, y: node.y },
    { x: node.x + node.width, y: node.y + node.height }, { x: node.x, y: node.y + node.height }];
  if (node.kind === "document") return [{ x: node.x, y: node.y },
    { x: node.x + node.width, y: node.y }, ...documentWave(node)];
  return [{ x: node.x + node.width / 2, y: node.y }, { x: node.x + node.width, y: node.y + node.height / 2 },
    { x: node.x + node.width / 2, y: node.y + node.height }, { x: node.x, y: node.y + node.height / 2 }];
}

/** One x-monotone wave, sampled identically for visible outline and every geometry consumer. */
function documentWave(node: NodeBounds): DiagramPoint[] {
  const band = Math.min(node.height / 4, DOCUMENT_WAVE_MAX_BAND);
  return Array.from({ length: DOCUMENT_WAVE_SAMPLES + 1 }, (_, index) => {
    const fraction = 1 - index / DOCUMENT_WAVE_SAMPLES;
    return { x: node.x + node.width * fraction,
      y: node.y + node.height - band + band * (1 + Math.sin(Math.PI * 2 * fraction)) / 2 };
  });
}

/** Concave document fill is a union of convex vertical strips; only its outside contour is stroked. */
export function documentFillPieces(node: NodeBounds): readonly (readonly DiagramPoint[])[] {
  const wave = documentWave(node);
  return wave.slice(1).map((left, index) => {
    const right = wave[index]!;
    return [{ x: left.x, y: node.y }, { x: right.x, y: node.y }, right, left];
  });
}

/** Intersect the center-to-target ray with the preset contour, using normalized coordinates. */
export function nodeBoundaryPoint(node: NodeBounds, toward: DiagramPoint): DiagramPoint | undefined {
  if (!isLabelNodeKind(node.kind)) return undefined;
  return intersectOutlineRay(node, { x: node.x + node.width / 2, y: node.y + node.height / 2 }, toward);
}

/** Offset cardinal attachments retain their transverse coordinate instead of projecting from the center. */
export function nodePortPoint(node: NodeBounds, side: PortDirection, offset = 0): DiagramPoint | undefined {
  if (!isLabelNodeKind(node.kind)) return undefined;
  const vertical = side === "top" || side === "bottom";
  const origin = { x: node.x + node.width / 2 + (vertical ? offset : 0), y: node.y + node.height / 2 + (vertical ? 0 : offset) };
  const toward = { x: origin.x + (side === "left" ? -node.width : side === "right" ? node.width : 0),
    y: origin.y + (side === "top" ? -node.height : side === "bottom" ? node.height : 0) };
  return intersectOutlineRay(node, origin, toward);
}

function intersectOutlineRay(node: NodeBounds, origin: DiagramPoint, toward: DiagramPoint): DiagramPoint {
  const points = nodeOutline(node)!;
  const start = { x: (origin.x - node.x) / node.width, y: (origin.y - node.y) / node.height };
  const direction = { x: (toward.x - origin.x) / node.width, y: (toward.y - origin.y) / node.height };
  if (direction.x === 0 && direction.y === 0) return origin;
  let nearest = Infinity;
  for (let index = 0; index < points.length; index += 1) {
    const first = points[index]!;
    const next = points[(index + 1) % points.length]!;
    const edge = { x: (next.x - first.x) / node.width, y: (next.y - first.y) / node.height };
    const relative = { x: (first.x - node.x) / node.width - start.x, y: (first.y - node.y) / node.height - start.y };
    const determinant = direction.x * edge.y - direction.y * edge.x;
    if (determinant === 0) continue;
    const distance = (relative.x * edge.y - relative.y * edge.x) / determinant;
    const along = (relative.x * direction.y - relative.y * direction.x) / determinant;
    if (distance >= 0 && along >= 0 && along <= 1) nearest = Math.min(nearest, distance);
  }
  return Number.isFinite(nearest) ? { x: origin.x + direction.x * nearest * node.width, y: origin.y + direction.y * nearest * node.height } : origin;
}

/** Actual preset interior, excluding empty bounding-box corners and invisible label overflow. */
export function isPointInNodeOutline(node: NodeBounds, point: DiagramPoint): boolean | undefined {
  const points = nodeOutline(node);
  if (!points) return undefined;
  // Finite tiny dimensions can collapse vertices at a large origin; half planes alone then accept every point.
  if (point.x < node.x || point.x > node.x + node.width || point.y < node.y || point.y > node.y + node.height) return false;
  if (node.kind === "document") {
    // Even-odd containment accepts concave lobes; normalized coordinates avoid scale-dependent products.
    let inside = false;
    const pointX = (point.x - node.x) / node.width;
    const pointY = (point.y - node.y) / node.height;
    for (let index = 0; index < points.length; index += 1) {
      const start = points[index]!;
      const end = points[(index + 1) % points.length]!;
      const ax = (start.x - node.x) / node.width;
      const ay = (start.y - node.y) / node.height;
      const bx = (end.x - node.x) / node.width;
      const by = (end.y - node.y) / node.height;
      if ((bx - ax) * (pointY - ay) === (by - ay) * (pointX - ax)
        && pointX >= Math.min(ax, bx) && pointX <= Math.max(ax, bx)
        && pointY >= Math.min(ay, by) && pointY <= Math.max(ay, by)) return true;
      if ((ay > pointY) !== (by > pointY) && pointX < ax + (pointY - ay) / (by - ay) * (bx - ax)) inside = !inside;
    }
    return inside;
  }
  return points.every((start, index) => {
    const end = points[(index + 1) % points.length]!;
    return ((end.x - start.x) / node.width) * ((point.y - start.y) / node.height)
      - ((end.y - start.y) / node.height) * ((point.x - start.x) / node.width) >= 0;
  });
}
