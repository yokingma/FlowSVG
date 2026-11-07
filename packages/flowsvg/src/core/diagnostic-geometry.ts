/** Internal convex paint geometry for on-demand diagnostics; no DOM, mutation or public sampler. */
import type { CameraState, DiagramPoint, EvaluatedNode } from "./model.js";
import { CYLINDER_CAP_RADIUS, NODE_CORNER_RADIUS } from "./theme.js";
import { nodeOutline } from "./node-shape.js";

export interface Rect { left: number; top: number; right: number; bottom: number }
export type Polygon = readonly DiagramPoint[];
interface Ellipse { kind: "ellipse"; x: number; y: number; rx: number; ry: number }
interface PolygonPaint { kind: "polygon"; points: Polygon }
export type Paint = Ellipse | PolygonPaint;
/** Positive interiors only; contact within this document-unit tolerance is not an overlap. */
export const GEOMETRY_EPSILON = 1e-6;
/** Contour chords only approximate stroked curves; fills use analytic ellipses. */
const CONTOUR_SAMPLES = 256;

export const rectPolygon = (rect: Rect): Polygon => [
  { x: rect.left, y: rect.top }, { x: rect.right, y: rect.top },
  { x: rect.right, y: rect.bottom }, { x: rect.left, y: rect.bottom }
];
export const cameraRect = (camera: CameraState): Rect => ({ left: camera.x, top: camera.y, right: camera.x + camera.width, bottom: camera.y + camera.height });
const polygonPaint = (points: Polygon): PolygonPaint => ({ kind: "polygon", points });
const rectangle = (left: number, top: number, right: number, bottom: number): PolygonPaint => polygonPaint(rectPolygon({ left, top, right, bottom }));
const ellipse = (x: number, y: number, rx: number, ry: number): Ellipse => ({ kind: "ellipse", x, y, rx, ry });
const cross = (a: DiagramPoint, b: DiagramPoint, p: DiagramPoint): number => (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);

/** Sutherland-Hodgman clipping keeps the actual shared visible region, not just intersecting bounds. */
export function clipPolygon(subject: Polygon, clip: Polygon): Polygon {
  let result = subject;
  for (let index = 0; index < clip.length && result.length > 0; index += 1) {
    const a = clip[index]!;
    const b = clip[(index + 1) % clip.length]!;
    const input = result;
    const next: DiagramPoint[] = [];
    for (let cursor = 0; cursor < input.length; cursor += 1) {
      const p = input[cursor]!;
      const q = input[(cursor + 1) % input.length]!;
      const start = cross(a, b, p);
      const end = cross(a, b, q);
      if (start >= 0) next.push(p);
      if ((start >= 0) !== (end >= 0)) {
        const fraction = start / (start - end);
        next.push({ x: p.x + fraction * (q.x - p.x), y: p.y + fraction * (q.y - p.y) });
      }
    }
    result = next;
  }
  return result;
}

function positiveArea(points: Polygon): boolean {
  if (points.length < 3) return false;
  const origin = points[0]!;
  const twiceArea = points.reduce((sum, point, index) => {
    const next = points[(index + 1) % points.length]!;
    return sum + (point.x - origin.x) * (next.y - origin.y) - (next.x - origin.x) * (point.y - origin.y);
  }, 0);
  return twiceArea > GEOMETRY_EPSILON ** 2;
}

function ellipseOverlapsPolygon(shape: Ellipse, points: Polygon): boolean {
  const normalized = points.map((point) => ({ x: (point.x - shape.x) / shape.rx, y: (point.y - shape.y) / shape.ry }));
  const threshold = 1 - GEOMETRY_EPSILON / Math.max(GEOMETRY_EPSILON, Math.min(shape.rx, shape.ry));
  if (normalized.some((point) => Math.hypot(point.x, point.y) < threshold)) return true;
  if (normalized.every((point, index) => cross(point, normalized[(index + 1) % normalized.length]!, { x: 0, y: 0 }) >= 0)) return true;
  return normalized.some((start, index) => {
    const end = normalized[(index + 1) % normalized.length]!;
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const lengthSquared = dx * dx + dy * dy;
    const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, -(start.x * dx + start.y * dy) / lengthSquared));
    return Math.hypot(start.x + t * dx, start.y + t * dy) < threshold;
  });
}

function polygonBounds(points: Polygon): Rect {
  return { left: Math.min(...points.map(({ x }) => x)), right: Math.max(...points.map(({ x }) => x)),
    top: Math.min(...points.map(({ y }) => y)), bottom: Math.max(...points.map(({ y }) => y)) };
}

function boundsOverlap(left: Rect, right: Rect): boolean {
  return Math.min(left.right, right.right) - Math.max(left.left, right.left) > GEOMETRY_EPSILON
    && Math.min(left.bottom, right.bottom) - Math.max(left.top, right.top) > GEOMETRY_EPSILON;
}

/** Caller polygons are already camera-clipped, so any shared interior is actually visible. */
export function paintOverlapsPolygon(shape: Paint, points: Polygon): boolean {
  if (!positiveArea(points)) return false;
  const bounds = shape.kind === "ellipse" ? { left: shape.x - shape.rx, right: shape.x + shape.rx,
    top: shape.y - shape.ry, bottom: shape.y + shape.ry } : polygonBounds(shape.points);
  if (!boundsOverlap(bounds, polygonBounds(points))) return false;
  return shape.kind === "ellipse" ? ellipseOverlapsPolygon(shape, points) : positiveArea(clipPolygon(points, shape.points));
}

export function nodeFill(node: EvaluatedNode): Paint[] {
  const { x, y, width, height } = node;
  // Only convex outlines can be used as a single clipping paint polygon.
  if (node.kind === "diamond" || node.kind === "parallelogram") return [polygonPaint(nodeOutline(node)!)];
  const cx = x + width / 2;
  if (node.kind === "ellipse") return [ellipse(cx, y + height / 2, width / 2, height / 2)];
  if (node.kind === "cylinder") {
    const radius = Math.min(CYLINDER_CAP_RADIUS, height / 4);
    return [rectangle(x, y + radius, x + width, y + height - radius),
      ellipse(cx, y + radius, width / 2, radius), ellipse(cx, y + height - radius, width / 2, radius)];
  }
  if (node.kind !== "roundedRect" && node.kind !== "group") return [rectangle(x, y, x + width, y + height)];
  const radius = Math.min(NODE_CORNER_RADIUS, width / 4, height / 4);
  return [rectangle(x + radius, y, x + width - radius, y + height), rectangle(x, y + radius, x + width, y + height - radius),
    ...[x + radius, x + width - radius].flatMap((cx) => [y + radius, y + height - radius].map((cy) => ellipse(cx, cy, radius, radius)))];
}

/** A sampled route chord paints a butt-capped strip; joining strips retain the SDK's finite path precision. */
export function segmentStrip(start: DiagramPoint, end: DiagramPoint, halfWidth: number): Polygon {
  const length = Math.hypot(end.x - start.x, end.y - start.y);
  if (length <= GEOMETRY_EPSILON || halfWidth <= 0) return [];
  const dx = -(end.y - start.y) / length * halfWidth;
  const dy = (end.x - start.x) / length * halfWidth;
  return [{ x: start.x + dx, y: start.y + dy }, { x: start.x - dx, y: start.y - dy },
    { x: end.x - dx, y: end.y - dy }, { x: end.x + dx, y: end.y + dy }];
}

function ellipseContour(x: number, y: number, rx: number, ry: number, start = 0, end = Math.PI * 2): DiagramPoint[] {
  const count = Math.ceil(CONTOUR_SAMPLES * (end - start) / (Math.PI * 2));
  return Array.from({ length: count + 1 }, (_, index) => {
    const angle = start + (end - start) * index / count;
    return { x: x + Math.cos(angle) * rx, y: y + Math.sin(angle) * ry };
  });
}

function nodeContours(node: EvaluatedNode): Polygon[] {
  const { x, y, width, height } = node;
  const outline = nodeOutline(node);
  if (outline) return [[...outline, outline[0]!]];
  const cx = x + width / 2;
  if (node.kind === "ellipse") return [ellipseContour(cx, y + height / 2, width / 2, height / 2)];
  if (node.kind === "cylinder") {
    const radius = Math.min(CYLINDER_CAP_RADIUS, height / 4);
    return [ellipseContour(cx, y + radius, width / 2, radius),
      [{ x, y: y + radius }, { x: x + width, y: y + radius }, { x: x + width, y: y + height - radius },
        ...ellipseContour(cx, y + height - radius, width / 2, radius, 0, Math.PI), { x, y: y + radius }]];
  }
  if (node.kind !== "roundedRect" && node.kind !== "group") {
    const points = rectPolygon({ left: x, top: y, right: x + width, bottom: y + height });
    return [[...points, points[0]!]];
  }
  const radius = Math.min(NODE_CORNER_RADIUS, width / 4, height / 4);
  const points = [
    ...ellipseContour(x + width - radius, y + radius, radius, radius, -Math.PI / 2, 0),
    ...ellipseContour(x + width - radius, y + height - radius, radius, radius, 0, Math.PI / 2),
    ...ellipseContour(x + radius, y + height - radius, radius, radius, Math.PI / 2, Math.PI),
    ...ellipseContour(x + radius, y + radius, radius, radius, Math.PI, Math.PI * 1.5)
  ];
  return [[...points, points[0]!]];
}

/** Stroke-only nodes contribute contour strips and joins, never the hollow interior. */
export function nodeStroke(node: EvaluatedNode): Paint[] {
  const radius = (node.style?.strokeWidth ?? 0) / 2;
  if (node.kind === "rect") {
    const { x, y, width, height } = node;
    // Rectangles use SVG's default miter joins, including the outer square corner.
    return [rectangle(x - radius, y - radius, x + width + radius, y + radius),
      rectangle(x - radius, y + height - radius, x + width + radius, y + height + radius),
      rectangle(x - radius, y + radius, x + radius, y + height - radius),
      rectangle(x + width - radius, y + radius, x + width + radius, y + height - radius)];
  }
  return nodeContours(node).flatMap((points) => points.slice(1).flatMap((end, index) => [
    polygonPaint(segmentStrip(points[index]!, end, radius)), ellipse(end.x, end.y, radius, radius)
  ]));
}
