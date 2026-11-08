/**
 * Platform-independent edge geometry. This module owns routing, sampled path
 * distance, label anchors and line hit testing; diagram evaluation owns the
 * surrounding frame state and consumes this internal interface.
 */
import { CYLINDER_CAP_RADIUS } from "./theme.js";
import { nodeBoundaryPoint, nodePortPoint } from "./node-shape.js";
import { formatNumber } from "./svg-number.js";
import type { DiagramEdge, DiagramPoint, EvaluatedNode, PortDirection } from "./model.js";

function straightPoints(from: EvaluatedNode, to: EvaluatedNode): Point[] {
  const fromCenter = { x: from.x + from.width / 2, y: from.y + from.height / 2 };
  const toCenter = { x: to.x + to.width / 2, y: to.y + to.height / 2 };
  const start = boundaryPoint(from, toCenter);
  const end = boundaryPoint(to, fromCenter);
  return [start, end];
}
interface Point {
  x: number;
  y: number;
}

interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

const ROUTING_GAP = 8;
const PORT_SPACING = 24;
const MIN_ARROW_APPROACH = 24;
const ORTHOGONAL_BEND_RADIUS = 12;
const BEND_SAMPLE_COUNT = 16;
const BEND_CLEARANCE_EPSILON = 0.002;
const BEND_RADIUS_SEARCH_STEPS = 16;
const BEND_RADIUS_PRECISION = 1000;
/** Shared by routing, flow distance and on-demand diagnostics; not a pixel-precision promise. */
const CUBIC_SAMPLE_COUNT = 32;
const SEPARATED_CUBIC_SAMPLE_COUNT = 16;
/** SVG marker size in stroke-width units; routing uses the same footprint as serialization. */
export const ARROW_MARKER_SIZE = 7;
const FOCUS_PADDING = 24;
const HIT_TOLERANCE = 6;

/** Internal path representation shared by SVG output, labels, bounds, hit testing and distance-based flow placement. */
export interface PathGeometry {
  readonly path: string;
  readonly points: readonly Point[];
  readonly length: number;
  /** Exact final tangent for SVG marker bounds; sampled chords can differ on curves. */
  readonly terminalDirection: Point;
  /** Exact vertical paint extent for full-view fitting; independent of distance-sampling resolution. */
  readonly paintedBottom: number;
  readonly bounds: Rect;
  pointAt(progress: number): Point;
}

export function emptyPathGeometry(): PathGeometry {
  return createPathGeometry([]);
}

function createPathGeometry(points: readonly Point[], serializedPath?: string, terminalControl?: Point, paintedBottom?: number): PathGeometry {
  const compact = simplifyPoints(points);
  const path = serializedPath ?? pointsToPath(compact);
  const segments = compact.slice(1).map((end, index) => ({ start: compact[index]!, end, length: Math.hypot(end.x - compact[index]!.x, end.y - compact[index]!.y) }));
  const length = segments.reduce((total, segment) => total + segment.length, 0);
  const xs = compact.map((point) => point.x);
  const ys = compact.map((point) => point.y);
  const bounds = xs.length === 0
    ? { left: 0, top: 0, right: 0, bottom: 0 }
    : { left: Math.min(...xs), top: Math.min(...ys), right: Math.max(...xs), bottom: Math.max(...ys) };
  return {
    path,
    points: compact,
    length: length || 1,
    terminalDirection: terminalDirection(compact, terminalControl),
    paintedBottom: paintedBottom ?? bounds.bottom,
    bounds,
    pointAt(progress: number): Point {
      if (compact.length === 0) return { x: 0, y: 0 };
      if (compact.length === 1 || length === 0) return compact[0]!;
      const distance = Math.min(1, Math.max(0, progress)) * length;
      let traversed = 0;
      for (const segment of segments) {
        if (distance <= traversed + segment.length) {
          const ratio = segment.length === 0 ? 0 : (distance - traversed) / segment.length;
          return {
            x: segment.start.x + (segment.end.x - segment.start.x) * ratio,
            y: segment.start.y + (segment.end.y - segment.start.y) * ratio
          };
        }
        traversed += segment.length;
      }
      return compact.at(-1)!;
    }
  };
}

/** Use the exact final cubic control, or the final straight run, for the SVG marker orientation. */
function terminalDirection(points: readonly Point[], control?: Point): Point {
  const end = points.at(-1);
  const previous = control ?? points.at(-2);
  if (!end || !previous) return { x: 1, y: 0 };
  const dx = end.x - previous.x;
  const dy = end.y - previous.y;
  const length = Math.hypot(dx, dy);
  return length > 0 ? { x: dx / length, y: dy / length } : { x: 1, y: 0 };
}

/**
 * Trim orthogonal corners into quadratic bends. Adjacent trims cannot overlap,
 * and the final run retains the marker approach. SVG and distance consumers
 * share the same controls; conservative hull checks protect stroked node bounds.
 */
function createRoundedGeometry(points: readonly Point[], obstacles: readonly Rect[], strokeWidth: number): PathGeometry {
  const route = simplifyPoints(points);
  if (route.length < 3) return createPathGeometry(route);
  const samples: Point[] = [route[0]!];
  const commands = [`M ${formatNumber(route[0]!.x)} ${formatNumber(route[0]!.y)}`];
  const approach = Math.max(MIN_ARROW_APPROACH, strokeWidth * ARROW_MARKER_SIZE + ROUTING_GAP);
  for (let index = 1; index < route.length - 1; index += 1) {
    const previous = route[index - 1]!;
    const corner = route[index]!;
    const next = route[index + 1]!;
    const incoming = Math.hypot(corner.x - previous.x, corner.y - previous.y);
    const outgoing = Math.hypot(next.x - corner.x, next.y - corner.y);
    const turns = (corner.x - previous.x) * (next.x - corner.x) + (corner.y - previous.y) * (next.y - corner.y) === 0;
    const maximum = turns ? Math.max(0, Math.min(ORTHOGONAL_BEND_RADIUS, incoming / 2, outgoing / 2,
      index === route.length - 2 ? outgoing - Math.min(approach, outgoing) : ORTHOGONAL_BEND_RADIUS)) : 0;
    const radius = clearBendRadius(corner, previous, next, maximum, obstacles, strokeWidth / 2);
    const entry = moveToward(corner, previous, radius);
    const exit = moveToward(corner, next, radius);
    commands.push(`L ${formatNumber(entry.x)} ${formatNumber(entry.y)}`);
    samples.push(entry);
    if (radius === 0) continue;
    commands.push(`Q ${formatNumber(corner.x)} ${formatNumber(corner.y)} ${formatNumber(exit.x)} ${formatNumber(exit.y)}`);
    for (let sample = 1; sample <= BEND_SAMPLE_COUNT; sample += 1) {
      const progress = sample / BEND_SAMPLE_COUNT;
      const inverse = 1 - progress;
      samples.push({ x: inverse ** 2 * entry.x + 2 * inverse * progress * corner.x + progress ** 2 * exit.x,
        y: inverse ** 2 * entry.y + 2 * inverse * progress * corner.y + progress ** 2 * exit.y });
    }
  }
  const end = route.at(-1)!;
  commands.push(`L ${formatNumber(end.x)} ${formatNumber(end.y)}`);
  samples.push(end);
  return createPathGeometry(samples, commands.join(" "));
}

function moveToward(origin: Point, target: Point, distance: number): Point {
  const length = Math.hypot(target.x - origin.x, target.y - origin.y);
  return { x: origin.x + (target.x - origin.x) / length * distance,
    y: origin.y + (target.y - origin.y) / length * distance };
}

/** Shrinking the control hull cannot create a new collision. Retain a rounding margin for SVG serialization. */
function clearBendRadius(corner: Point, previous: Point, next: Point, maximum: number, obstacles: readonly Rect[], strokeRadius: number): number {
  const clear = (radius: number): boolean => {
    const entry = moveToward(corner, previous, radius);
    const exit = moveToward(corner, next, radius);
    const margin = strokeRadius + BEND_CLEARANCE_EPSILON;
    return !obstacles.some((bounds) => Math.min(entry.x, corner.x, exit.x) < bounds.right + margin
      && Math.max(entry.x, corner.x, exit.x) > bounds.left - margin
      && Math.min(entry.y, corner.y, exit.y) < bounds.bottom + margin
      && Math.max(entry.y, corner.y, exit.y) > bounds.top - margin);
  };
  if (maximum === 0 || !clear(0)) return 0;
  if (clear(maximum)) return maximum;
  let lower = 0;
  let upper = maximum;
  for (let iteration = 0; iteration < BEND_RADIUS_SEARCH_STEPS; iteration += 1) {
    const candidate = (lower + upper) / 2;
    if (clear(candidate)) lower = candidate;
    else upper = candidate;
  }
  return Math.floor(lower * BEND_RADIUS_PRECISION) / BEND_RADIUS_PRECISION;
}

/** Build sampled geometry for a cubic curve while retaining the exact cubic command for SVG output. */
function createCurveGeometry(start: Point, controlStart: Point, controlEnd: Point, end: Point): PathGeometry {
  const samples: Point[] = [];
  for (let index = 0; index <= CUBIC_SAMPLE_COUNT; index += 1) {
    const progress = index / CUBIC_SAMPLE_COUNT;
    const inverse = 1 - progress;
    samples.push({
      x: inverse ** 3 * start.x + 3 * inverse ** 2 * progress * controlStart.x + 3 * inverse * progress ** 2 * controlEnd.x + progress ** 3 * end.x,
      y: inverse ** 3 * start.y + 3 * inverse ** 2 * progress * controlStart.y + 3 * inverse * progress ** 2 * controlEnd.y + progress ** 3 * end.y
    });
  }
  const path = `M ${formatNumber(start.x)} ${formatNumber(start.y)} C ${formatNumber(controlStart.x)} ${formatNumber(controlStart.y)} ${formatNumber(controlEnd.x)} ${formatNumber(controlEnd.y)} ${formatNumber(end.x)} ${formatNumber(end.y)}`;
  return createPathGeometry(samples, path, controlEnd, cubicBottom(start, controlStart, controlEnd, end));
}

/** Solve the cubic's vertical derivative; sampled flow points can miss the painted lower extremum. */
function cubicBottom(start: Point, first: Point, second: Point, end: Point): number {
  const scale = Math.max(Math.abs(start.y), Math.abs(first.y), Math.abs(second.y), Math.abs(end.y), 1);
  const a = start.y / scale;
  const b = first.y / scale;
  const c = second.y / scale;
  const d = end.y / scale;
  const quadratic = -a + 3 * b - 3 * c + d;
  const linear = 2 * (a - 2 * b + c);
  const constant = b - a;
  const discriminant = linear * linear - 4 * quadratic * constant;
  const roots = quadratic === 0 ? linear === 0 ? [] : [-constant / linear]
    : discriminant < 0 ? [] : [(-linear - Math.sqrt(discriminant)) / (2 * quadratic), (-linear + Math.sqrt(discriminant)) / (2 * quadratic)];
  let bottom = Math.max(start.y, end.y);
  for (const progress of roots) {
    if (progress <= 0 || progress >= 1) continue;
    const inverse = 1 - progress;
    const value = inverse ** 3 * start.y + 3 * inverse ** 2 * progress * first.y + 3 * inverse * progress ** 2 * second.y + progress ** 3 * end.y;
    bottom = Math.max(bottom, value);
  }
  return bottom;
}

/** Build a two-segment cubic route used for opposite relationships; endpoint tangents remain exact port normals. */
function createSeparatedCurveGeometry(start: Point, controlStart: Point, midpoint: Point, controlMidStart: Point, controlMidEnd: Point, controlEnd: Point, end: Point): PathGeometry {
  const samples: Point[] = [];
  const sampleSegment = (first: Point, firstControl: Point, secondControl: Point, last: Point): void => {
    for (let index = 0; index <= SEPARATED_CUBIC_SAMPLE_COUNT; index += 1) {
      if (samples.length > 0 && index === 0) continue;
      const progress = index / SEPARATED_CUBIC_SAMPLE_COUNT;
      const inverse = 1 - progress;
      samples.push({
        x: inverse ** 3 * first.x + 3 * inverse ** 2 * progress * firstControl.x + 3 * inverse * progress ** 2 * secondControl.x + progress ** 3 * last.x,
        y: inverse ** 3 * first.y + 3 * inverse ** 2 * progress * firstControl.y + 3 * inverse * progress ** 2 * secondControl.y + progress ** 3 * last.y
      });
    }
  };
  sampleSegment(start, controlStart, controlMidStart, midpoint);
  sampleSegment(midpoint, controlMidEnd, controlEnd, end);
  const path = `M ${formatNumber(start.x)} ${formatNumber(start.y)} C ${formatNumber(controlStart.x)} ${formatNumber(controlStart.y)} ${formatNumber(controlMidStart.x)} ${formatNumber(controlMidStart.y)} ${formatNumber(midpoint.x)} ${formatNumber(midpoint.y)} C ${formatNumber(controlMidEnd.x)} ${formatNumber(controlMidEnd.y)} ${formatNumber(controlEnd.x)} ${formatNumber(controlEnd.y)} ${formatNumber(end.x)} ${formatNumber(end.y)}`;
  return createPathGeometry(samples, path, controlEnd, Math.max(
    cubicBottom(start, controlStart, controlMidStart, midpoint),
    cubicBottom(midpoint, controlMidEnd, controlEnd, end)
  ));
}

export function isPointNearPath(point: DiagramPoint, geometry: PathGeometry, tolerance: number): boolean {
  for (let index = 1; index < geometry.points.length; index += 1) if (distanceToSegment(point, geometry.points[index - 1]!, geometry.points[index]!) <= tolerance) return true;
  return false;
}
function distanceToSegment(point: DiagramPoint, start: Point, end: Point): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (dx === 0 && dy === 0) return Math.hypot(point.x - start.x, point.y - start.y);
  const factor = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(point.x - (start.x + factor * dx), point.y - (start.y + factor * dy));
}

/**
 * Orthogonal routes prefer centered bridges and single outside channels before obstacle search.
 * They reserve outward endpoint segments and the final bend before the straight marker approach.
 * Separate ancestor frames set outside clearance but are not obstacles.
 * Curved and orthogonal input slots follow source position with document-order ties, independently of timeline visibility.
 * Routing uses visible separately from paint opacity: reveals block immediately, and hides block until completion.
 */
export function routeEdge(edge: DiagramEdge, from: EvaluatedNode, to: EvaluatedNode, nodes: readonly EvaluatedNode[], routing: { reverseOffset: number; targetOffset: number }): PathGeometry {
  if (edge.route === "curved") {
    const automatic = automaticPorts(from, to);
    const fromDirection = edge.fromPort ?? automatic.from;
    const toDirection = edge.toPort ?? automatic.to;
    const start = portPoint(from, fromDirection);
    const end = portPoint(to, toDirection, routing.targetOffset);
    return curvedPath(start, end, fromDirection, toDirection, routing.reverseOffset);
  }
  if (edge.route !== "orthogonal") {
    const points = edge.fromPort || edge.toPort
      ? [portPoint(from, edge.fromPort ?? automaticPorts(from, to).from), portPoint(to, edge.toPort ?? automaticPorts(from, to).to)]
      : straightPoints(from, to);
    return createPathGeometry(points);
  }
  const obstacles = nodes
    .filter((node) => node.visible && node.kind !== "group" && node.id !== from.id && node.id !== to.id)
    .map(nodeBounds);
  return createRoundedGeometry(orthogonalPortPath(edge, from, to, obstacles, routing.targetOffset, nodes),
    [...obstacles, nodeBounds(from), nodeBounds(to)], edge.style?.strokeWidth ?? 2);
}

/** Order inputs across each side by source position; retain hidden edges so reveals cannot move other arrow tips. */
export function routedTargetOffsets(edges: readonly DiagramEdge[], nodes: ReadonlyMap<string, EvaluatedNode>): ReadonlyMap<string, number> {
  const groups = new Map<string, { node: EvaluatedNode; side: PortDirection; inputs: { id: string; position: number }[] }>();
  for (const edge of edges) {
    if (edge.route !== "orthogonal" && edge.route !== "curved") continue;
    const from = nodes.get(edge.from);
    const to = nodes.get(edge.to);
    if (!from || !to) continue;
    const side = edge.toPort ?? automaticPorts(from, to).to;
    const key = JSON.stringify([to.id, side]);
    const group = groups.get(key);
    const position = side === "top" || side === "bottom" ? from.x + from.width / 2 : from.y + from.height / 2;
    groups.set(key, { node: to, side, inputs: [...(group?.inputs ?? []), { id: edge.id, position }] });
  }
  const offsets = new Map<string, number>();
  for (const { node, side, inputs } of groups.values()) {
    const span = side === "top" || side === "bottom" ? node.width : node.height;
    const spacing = Math.min(PORT_SPACING, span / (2 * inputs.length));
    [...inputs].sort((left, right) => left.position - right.position)
      .forEach((edge, index) => offsets.set(edge.id, (index - (inputs.length - 1) / 2) * spacing));
  }
  return offsets;
}

function nodeBounds(node: EvaluatedNode): Rect {
  return { left: node.x, top: node.y, right: node.x + node.width, bottom: node.y + node.height };
}

function routingBounds(bounds: Rect, side?: PortDirection, approach = ROUTING_GAP): Rect {
  return {
    left: bounds.left - (side === "left" ? approach : ROUTING_GAP),
    top: bounds.top - (side === "top" ? approach : ROUTING_GAP),
    right: bounds.right + (side === "right" ? approach : ROUTING_GAP),
    bottom: bounds.bottom + (side === "bottom" ? approach : ROUTING_GAP)
  };
}

/** Extend the target obstacle through the final bend and arrow approach so grid search cannot fold back into either reservation. */
function orthogonalPortPath(edge: DiagramEdge, from: EvaluatedNode, to: EvaluatedNode, obstacles: readonly Rect[], targetOffset: number, nodes: readonly EvaluatedNode[]): Point[] {
  const automatic = automaticPorts(from, to);
  const fromDirection = edge.fromPort ?? automatic.from;
  const toDirection = edge.toPort ?? automatic.to;
  const start = portPoint(from, fromDirection);
  const end = portPoint(to, toDirection, targetOffset);
  const approach = Math.max(MIN_ARROW_APPROACH, (edge.style?.strokeWidth ?? 2) * ARROW_MARKER_SIZE + ROUTING_GAP);
  const fromOutline = nodeBounds(from);
  const toOutline = nodeBounds(to);
  const fromRun = availablePortRun(portStub(start, fromDirection, fromOutline), fromDirection, ROUTING_GAP, [...obstacles, toOutline]);
  // Tight gaps clamp the preferred bridge lane to these stubs before the bend radius is reduced.
  const toRun = availablePortRun(portStub(end, toDirection, toOutline), toDirection, approach + ORTHOGONAL_BEND_RADIUS, [...obstacles, fromOutline]);
  const fromBounds = routingBounds(fromOutline, fromDirection, fromRun);
  const toBounds = routingBounds(toOutline, toDirection, toRun);
  const startStub = portStub(start, fromDirection, fromBounds);
  const endStub = portStub(end, toDirection, toBounds);
  const routingObstacles = [...obstacles.map((bounds) => routingBounds(bounds)), fromBounds, toBounds];
  const preferred = preferredPortPath(startStub, endStub, fromDirection, toDirection,
    [fromOutline, toOutline, ...separateAncestorBounds(from, to, nodes)], approach);
  const clear = preferred && preferred.every((point, index) => index === 0
    || !blockedSegment(preferred[index - 1]!, point, routingObstacles));
  const middle = clear ? preferred : orthogonalPath(startStub, endStub, routingObstacles);
  return [start, ...middle, end];
}

/** Prefer a centered bridge or a single outside channel; obstacle search handles unsafe candidates. */
function preferredPortPath(start: Point, end: Point, from: PortDirection, to: PortDirection, outlines: readonly Rect[], clearance: number): Point[] | undefined {
  const vertical = from === "top" || from === "bottom";
  if (vertical !== (to === "top" || to === "bottom")) return undefined;
  const axis = vertical ? "y" : "x";
  const normal = portNormal(from);
  const sign = vertical ? normal.y : normal.x;
  let lane: number;
  if (from === to) {
    const boundary = vertical ? (sign < 0 ? "top" : "bottom") : (sign < 0 ? "left" : "right");
    const extents = outlines.map((bounds) => bounds[boundary]);
    const naturalLane = (sign < 0 ? Math.min(...extents) : Math.max(...extents)) + sign * clearance;
    // Ancestor clearance and endpoint reservations have separate responsibilities:
    // move outward only when a reserved endpoint stub extends beyond the natural lane.
    lane = sign < 0 ? Math.min(naturalLane, start[axis], end[axis]) : Math.max(naturalLane, start[axis], end[axis]);
  } else {
    // Stubs bound the legal turning interval, including the target's arrow footprint.
    if ((end[axis] - start[axis]) * sign < 0) return undefined;
    const first = outlines[0]!;
    const last = outlines[1]!;
    const sourceSide = vertical ? (sign < 0 ? first.top : first.bottom) : (sign < 0 ? first.left : first.right);
    const targetSide = vertical ? (sign < 0 ? last.bottom : last.top) : (sign < 0 ? last.right : last.left);
    const midpoint = (sourceSide + targetSide) / 2;
    lane = Math.max(Math.min(start[axis], end[axis]), Math.min(Math.max(start[axis], end[axis]), midpoint));
  }
  return simplifyPoints([start, { ...start, [axis]: lane }, { ...end, [axis]: lane }, end]);
}

/** Only separate ancestor frames affect outside lanes; a shared container must not push an internal edge outside. */
function separateAncestorBounds(from: EvaluatedNode, to: EvaluatedNode, nodes: readonly EvaluatedNode[]): Rect[] {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const ancestors = (node: EvaluatedNode): EvaluatedNode[] => {
    const result: EvaluatedNode[] = [];
    let parent = node.parentId ? byId.get(node.parentId) : undefined;
    while (parent) {
      result.push(parent);
      parent = parent.parentId ? byId.get(parent.parentId) : undefined;
    }
    return result;
  };
  const sourceAncestors = ancestors(from);
  const targetAncestors = ancestors(to);
  const sourceIds = new Set([from.id, ...sourceAncestors.map(({ id }) => id)]);
  const targetIds = new Set([to.id, ...targetAncestors.map(({ id }) => id)]);
  return [...sourceAncestors.filter(({ id }) => !targetIds.has(id)),
    ...targetAncestors.filter(({ id }) => !sourceIds.has(id))].map(nodeBounds);
}

/** Share narrow endpoint gaps instead of putting a reserved stub inside the opposite node. */
function availablePortRun(point: Point, side: PortDirection, desired: number, obstacles: readonly Rect[]): number {
  const vertical = side === "top" || side === "bottom";
  const normal = portNormal(side);
  return obstacles.reduce((run, bounds) => {
    const transverse = vertical ? point.x : point.y;
    const minimum = vertical ? bounds.left : bounds.top;
    const maximum = vertical ? bounds.right : bounds.bottom;
    if (transverse < minimum - ROUTING_GAP || transverse > maximum + ROUTING_GAP) return run;
    const distance = vertical
      ? (side === "top" ? bounds.bottom - point.y : bounds.top - point.y) * normal.y
      : (side === "left" ? bounds.right - point.x : bounds.left - point.x) * normal.x;
    if (distance < 0) return run;
    return Math.min(run, Math.max(distance - ROUTING_GAP, distance / 2));
  }, desired);
}

function portStub(point: Point, direction: PortDirection, bounds: Rect): Point {
  if (direction === "top") return { x: point.x, y: bounds.top };
  if (direction === "bottom") return { x: point.x, y: bounds.bottom };
  if (direction === "left") return { x: bounds.left, y: point.y };
  return { x: bounds.right, y: point.y };
}

/** Select cardinal sides from the dominant center-to-center axis for automatic routes. */
function automaticPorts(from: EvaluatedNode, to: EvaluatedNode): { from: PortDirection; to: PortDirection } {
  const fromCenter = { x: from.x + from.width / 2, y: from.y + from.height / 2 };
  const toCenter = { x: to.x + to.width / 2, y: to.y + to.height / 2 };
  const horizontal = Math.abs(toCenter.x - fromCenter.x) >= Math.abs(toCenter.y - fromCenter.y);
  if (horizontal) {
    const right = toCenter.x >= fromCenter.x;
    return { from: right ? "right" : "left", to: right ? "left" : "right" };
  }
  const bottom = toCenter.y >= fromCenter.y;
  return { from: bottom ? "bottom" : "top", to: bottom ? "top" : "bottom" };
}

/** Return the actual outline point for a cardinal side, including ellipse contours. */
function portPoint(node: EvaluatedNode, direction: PortDirection, offset = 0): Point {
  const presetPoint = nodePortPoint(node, direction, offset);
  if (presetPoint) return presetPoint;
  const center = { x: node.x + node.width / 2, y: node.y + node.height / 2 };
  const vertical = direction === "top" || direction === "bottom";
  const radius = (vertical ? node.width : node.height) / 2;
  const contour = Math.sqrt(Math.max(0, 1 - (offset / radius) ** 2));
  const inset = node.kind === "ellipse" ? (vertical ? node.height : node.width) / 2 * (1 - contour)
    : node.kind === "cylinder" && vertical ? Math.min(CYLINDER_CAP_RADIUS, node.height / 4) * (1 - contour) : 0;
  if (direction === "top") return { x: center.x + offset, y: node.y + inset };
  if (direction === "right") return { x: node.x + node.width - inset, y: center.y + offset };
  if (direction === "bottom") return { x: center.x + offset, y: node.y + node.height - inset };
  return { x: node.x + inset, y: center.y + offset };
}

/** Generate a smooth cubic route whose endpoint tangents follow port normals. */
function curvedPath(start: Point, end: Point, fromDirection: PortDirection, toDirection: PortDirection, separation: number): PathGeometry {
  const distance = Math.hypot(end.x - start.x, end.y - start.y);
  const tangentLength = Math.max(24, distance * 0.32);
  const fromNormal = portNormal(fromDirection);
  const toNormal = portNormal(toDirection);
  const perpendicular = { x: -(end.y - start.y), y: end.x - start.x };
  const perpendicularLength = Math.hypot(perpendicular.x, perpendicular.y) || 1;
  const lane = separation * Math.min(72, Math.max(28, distance * 0.16));
  if (separation !== 0) {
    const midpoint = {
      x: (start.x + end.x) / 2 + perpendicular.x / perpendicularLength * lane,
      y: (start.y + end.y) / 2 + perpendicular.y / perpendicularLength * lane
    };
    const chord = { x: end.x - start.x, y: end.y - start.y };
    const chordLength = Math.hypot(chord.x, chord.y) || 1;
    const joinTangent = { x: chord.x / chordLength, y: chord.y / chordLength };
    return createSeparatedCurveGeometry(
      start,
      { x: start.x + fromNormal.x * tangentLength, y: start.y + fromNormal.y * tangentLength },
      midpoint,
      { x: midpoint.x - joinTangent.x * tangentLength * 0.5, y: midpoint.y - joinTangent.y * tangentLength * 0.5 },
      { x: midpoint.x + joinTangent.x * tangentLength * 0.5, y: midpoint.y + joinTangent.y * tangentLength * 0.5 },
      { x: end.x + toNormal.x * tangentLength, y: end.y + toNormal.y * tangentLength },
      end
    );
  }
  const controlStart = {
    x: start.x + fromNormal.x * tangentLength + perpendicular.x / perpendicularLength * lane,
    y: start.y + fromNormal.y * tangentLength + perpendicular.y / perpendicularLength * lane
  };
  const controlEnd = {
    x: end.x + toNormal.x * tangentLength + perpendicular.x / perpendicularLength * lane,
    y: end.y + toNormal.y * tangentLength + perpendicular.y / perpendicularLength * lane
  };
  return createCurveGeometry(start, controlStart, controlEnd, end);
}

function portNormal(direction: PortDirection): Point {
  if (direction === "top") return { x: 0, y: -1 };
  if (direction === "right") return { x: 1, y: 0 };
  if (direction === "bottom") return { x: 0, y: 1 };
  return { x: -1, y: 0 };
}

/**
 * Breadth-first search the grid of endpoints and obstacle boundaries, using fixed neighbor order for determinism.
 * Grid-step search does not guarantee shortest geometric length or fewest bends; fall back to a fixed elbow if blocked.
 */
function orthogonalPath(start: Point, end: Point, obstacles: readonly Rect[]): Point[] {
  const xs = uniqueSorted([start.x, end.x, ...obstacles.flatMap((rect) => [rect.left, rect.right])]);
  const ys = uniqueSorted([start.y, end.y, ...obstacles.flatMap((rect) => [rect.top, rect.bottom])]);
  const xIndex = new Map(xs.map((value, index) => [value, index]));
  const yIndex = new Map(ys.map((value, index) => [value, index]));
  const startKey = pointKey(start);
  const endKey = pointKey(end);
  const queue: Point[] = [start];
  const previous = new Map<string, Point | undefined>([[startKey, undefined]]);
  const preferredHorizontal = Math.abs(end.x - start.x) >= Math.abs(end.y - start.y);
  const directions: readonly [number, number][] = preferredHorizontal
    ? [[1, 0], [0, -1], [0, 1], [-1, 0]]
    : [[0, 1], [1, 0], [-1, 0], [0, -1]];

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (pointKey(current) === endKey) break;
    const currentX = xIndex.get(current.x);
    const currentY = yIndex.get(current.y);
    if (currentX === undefined || currentY === undefined) continue;
    for (const [dx, dy] of directions) {
      const nextX = xs[currentX + dx];
      const nextY = ys[currentY + dy];
      if (nextX === undefined || nextY === undefined) continue;
      const next = { x: nextX, y: nextY };
      const key = pointKey(next);
      if (previous.has(key) || isInsideObstacle(next, obstacles) || blockedSegment(current, next, obstacles)) continue;
      previous.set(key, current);
      queue.push(next);
    }
  }

  const points: Point[] = [];
  if (previous.has(endKey)) {
    let current: Point | undefined = end;
    while (current) {
      points.push(current);
      current = previous.get(pointKey(current));
    }
    points.reverse();
  } else {
    const middle = preferredHorizontal ? { x: end.x, y: start.y } : { x: start.x, y: end.y };
    points.push(start, middle, end);
  }
  return removeMicroTurns(points, obstacles);
}

/** Replace tiny obstacle-detour turns with a wider elbow when the replacement remains collision-free. */
function removeMicroTurns(points: readonly Point[], obstacles: readonly Rect[]): Point[] {
  const result = [...points];
  const minimum = ROUTING_GAP * 2;
  for (let index = 1; index + 2 < result.length; index += 1) {
    const before = result[index - 1]!;
    const first = result[index]!;
    const second = result[index + 1]!;
    const after = result[index + 2]!;
    const shortLength = Math.abs(second.x - first.x) + Math.abs(second.y - first.y);
    if (shortLength >= minimum) continue;
    const candidate = before.x === first.x
      ? { x: first.x, y: after.y }
      : { x: after.x, y: first.y };
    if (isInsideObstacle(candidate, obstacles) || blockedSegment(before, candidate, obstacles) || blockedSegment(candidate, after, obstacles)) continue;
    result.splice(index, 2, candidate);
    index = Math.max(0, index - 2);
  }
  return result;
}

/** Remove consecutive duplicates and collinear intermediate points to keep SVG paths compact. */
function pointsToPath(points: readonly Point[]): string {
  return simplifyPoints(points).map((point, index) => `${index === 0 ? "M" : "L"} ${formatNumber(point.x)} ${formatNumber(point.y)}`).join(" ");
}

/** Keep collinear reversals: removing an extremum would shorten flow distance and truncate path bounds. */
function simplifyPoints(points: readonly Point[]): Point[] {
  const compact: Point[] = [];
  for (const point of points) {
    const previous = compact.at(-1);
    if (!previous || previous.x !== point.x || previous.y !== point.y) compact.push(point);
  }
  const simplified: Point[] = [];
  for (const point of compact) {
    const previous = simplified.at(-1);
    const beforePrevious = simplified.at(-2);
    const continuesDirection = previous && beforePrevious
      && (previous.x - beforePrevious.x) * (point.x - previous.x) + (previous.y - beforePrevious.y) * (point.y - previous.y) >= 0;
    if (previous && beforePrevious && continuesDirection && (beforePrevious.x === previous.x && previous.x === point.x || beforePrevious.y === previous.y && previous.y === point.y)) {
      simplified[simplified.length - 1] = point;
    } else {
      simplified.push(point);
    }
  }
  return simplified;
}

/** Obstacles already include ROUTING_GAP; allow boundary contact and reject only segments crossing their interiors. */
function blockedSegment(start: Point, end: Point, obstacles: readonly Rect[]): boolean {
  for (const obstacle of obstacles) {
    if (start.x === end.x) {
      if (start.x > obstacle.left && start.x < obstacle.right && rangesOverlap(start.y, end.y, obstacle.top, obstacle.bottom)) return true;
    } else if (start.y === end.y && start.y > obstacle.top && start.y < obstacle.bottom && rangesOverlap(start.x, end.x, obstacle.left, obstacle.right)) {
      return true;
    }
  }
  return false;
}

function isInsideObstacle(point: Point, obstacles: readonly Rect[]): boolean {
  return obstacles.some((obstacle) => point.x > obstacle.left && point.x < obstacle.right && point.y > obstacle.top && point.y < obstacle.bottom);
}

function rangesOverlap(firstStart: number, firstEnd: number, secondStart: number, secondEnd: number): boolean {
  return Math.max(Math.min(firstStart, firstEnd), secondStart) < Math.min(Math.max(firstStart, firstEnd), secondEnd);
}

function pointKey(point: Point): string {
  return `${point.x},${point.y}`;
}
function uniqueSorted(values: readonly number[]): number[] {
  return [...new Set(values)].sort((left, right) => left - right);
}

/** Presets use their shared contour; retain existing ellipse and bounding-rectangle projections. */
function boundaryPoint(node: EvaluatedNode, toward: {
  x: number;
  y: number
}): {
  x: number;
  y: number
} {
  const presetPoint = nodeBoundaryPoint(node, toward);
  if (presetPoint) return presetPoint;
  const center = { x: node.x + node.width / 2, y: node.y + node.height / 2 };
  const dx = toward.x - center.x;
  const dy = toward.y - center.y;
  if (dx === 0 && dy === 0) return center;
  const normalizedX = dx / (node.width / 2);
  const normalizedY = dy / (node.height / 2);
  const scale = 1 / (node.kind === "ellipse"
    ? Math.hypot(normalizedX, normalizedY)
    : Math.max(Math.abs(normalizedX), Math.abs(normalizedY)));
  return { x: center.x + dx * scale, y: center.y + dy * scale };
}
export function pathLabelAnchor(geometry: PathGeometry): {
  x: number;
  y: number
} {
  const points = geometry.points;
  if (points.length < 2) return { x: 0, y: -12 };
  let longest = { start: points[0]!, end: points[1]!, length: 0 };
  for (let index = 1; index < points.length; index += 1) {
    const start = points[index - 1]!;
    const end = points[index]!;
    const length = Math.hypot(end.x - start.x, end.y - start.y);
    if (length > longest.length) longest = { start, end, length };
  }
  const horizontal = longest.start.y === longest.end.y;
  return {
    x: (longest.start.x + longest.end.x) / 2 + (horizontal ? 0 : 20),
    y: (longest.start.y + longest.end.y) / 2 + (horizontal ? -12 : 0)
  };
}
