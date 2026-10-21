import { describe, expect, it } from "vitest";
import { createDiagram, type DiagramDocument, type PortDirection } from "../index.js";

const alignedDocument = (): DiagramDocument => ({
  version: 1,
  viewport: { width: 800, height: 600 },
  nodes: [
    { id: "source", kind: "rect", x: 40, y: 100, width: 100, height: 60 },
    { id: "target", kind: "rect", x: 420, y: 100, width: 100, height: 60 }
  ],
  edges: [{ id: "transfer", from: "source", to: "target", route: "curved", fromPort: "right", toPort: "right", label: "message" }],
  scenes: [{ id: "send", label: "Send", beats: [{ durationMs: 1000, transitionMs: 0, actions: [
    { type: "flow", target: "transfer", direction: "forward" },
    { type: "focus", target: "source" }
  ] }] }]
});

const PORT_NORMALS: Readonly<Record<PortDirection, { x: number; y: number }>> = {
  top: { x: 0, y: -1 },
  right: { x: 1, y: 0 },
  bottom: { x: 0, y: 1 },
  left: { x: -1, y: 0 }
};
const PORTS: readonly (PortDirection | undefined)[] = ["top", "right", "bottom", "left", undefined];
const PORT_CASES = PORTS.flatMap((fromPort) => PORTS
  .filter((toPort) => fromPort !== undefined || toPort !== undefined)
  .map((toPort) => ({ fromPort, toPort })));
const TARGET_CASES = (["rect", "ellipse", "cylinder"] as const).flatMap((kind) =>
  (["top", "right", "bottom", "left"] as const).map((side) => ({ kind, side })));

function pathPoints(path: string): { x: number; y: number }[] {
  const values = path.match(/-?\d+(?:\.\d+)?/g)!.map(Number);
  return Array.from({ length: values.length / 2 }, (_, index) => ({ x: values[index * 2]!, y: values[index * 2 + 1]! }));
}

describe("shared route geometry regressions", () => {
  it.each(["right", "left", "bottom", "top"] as const)("centers an unobstructed bridge in the %s port gap", (side) => {
    const vertical = side === "top" || side === "bottom";
    const reverse = side === "top" || side === "left";
    const nodes: DiagramDocument["nodes"] = [
      { id: "first", kind: "rect", x: 100, y: 100, width: 100, height: 60 },
      { id: "second", kind: "rect", x: vertical ? 300 : 250, y: vertical ? 210 : 200, width: 100, height: 60 }
    ];
    const opposite = { top: "bottom", bottom: "top", left: "right", right: "left" } as const;
    const diagram = createDiagram({ ...alignedDocument(), nodes, scenes: [], edges: [{
      id: "transfer", from: reverse ? "second" : "first", to: reverse ? "first" : "second",
      route: "orthogonal", fromPort: side, toPort: opposite[side]
    }] });
    const points = pathPoints(diagram.evaluateAt(0).edges[0]!.path);
    expect(points).toHaveLength(4);
    expect(vertical ? points[1]!.y : points[1]!.x).toBe(vertical ? 185 : 225);
    expect(vertical ? points[2]!.y : points[2]!.x).toBe(vertical ? 185 : 225);
  });

  it.each(["right", "left", "bottom", "top"] as const)("uses one outside channel for matching %s ports", (side) => {
    const vertical = side === "top" || side === "bottom";
    const nodes: DiagramDocument["nodes"] = [
      { id: "source", kind: "rect", x: 100, y: 100, width: 100, height: 60 },
      { id: "target", kind: "rect", x: vertical ? 300 : 100, y: vertical ? 100 : 300, width: 100, height: 60 }
    ];
    const diagram = createDiagram({ ...alignedDocument(), nodes, edges: [{
      ...alignedDocument().edges[0]!, route: "orthogonal", fromPort: side, toPort: side
    }] });
    const points = pathPoints(diagram.evaluateAt(0).edges[0]!.path);
    expect(points).toHaveLength(4);
    const expected = { left: 76, right: 224, top: 76, bottom: 184 }[side];
    expect(vertical ? points[1]!.y : points[1]!.x).toBe(expected);
    expect(vertical ? points[2]!.y : points[2]!.x).toBe(expected);
  });

  it("keeps an outside channel clear of separate ancestor frames but inside a shared container", () => {
    const diagram = createDiagram({ ...alignedDocument(), nodes: [
      { id: "shared", kind: "group", x: 0, y: 0, width: 600, height: 600 },
      { id: "upper", kind: "group", parentId: "shared", x: 64, y: 24, width: 400, height: 150 },
      { id: "lower", kind: "group", parentId: "shared", x: 64, y: 224, width: 400, height: 300 },
      { id: "nested", kind: "group", parentId: "lower", x: 16, y: 44, width: 250, height: 200 },
      { id: "source", kind: "rect", parentId: "upper", x: 16, y: 44, width: 100, height: 60 },
      { id: "target", kind: "rect", parentId: "nested", x: 16, y: 44, width: 100, height: 60 }
    ], edges: [{ ...alignedDocument().edges[0]!, route: "orthogonal", fromPort: "left", toPort: "left" }] });
    const points = pathPoints(diagram.evaluateAt(0).edges[0]!.path);
    expect(points).toHaveLength(4);
    expect(points[1]!.x).toBe(40);
    expect(points[2]!.x).toBe(40);
  });

  it("avoids a node that blocks the centered bridge", () => {
    const document = alignedDocument();
    const diagram = createDiagram({ ...document, nodes: [
      document.nodes[0]!, { ...document.nodes[1]!, y: 300 },
      { id: "obstacle", kind: "rect", x: 250, y: 80, width: 60, height: 300 }
    ], edges: [{ ...document.edges[0]!, route: "orthogonal", fromPort: "right", toPort: "left" }] });
    const points = pathPoints(diagram.evaluateAt(0).edges[0]!.path);
    expect(points.some(({ y }) => y <= 72 || y >= 388)).toBe(true);
    for (let time = 1; time < 1000; time += 5) {
      const point = diagram.evaluateAt(time).edges[0]!.flow!.point;
      expect(point.x > 250 && point.x < 310 && point.y > 80 && point.y < 380).toBe(false);
    }
  });

  it("keeps close automatic endpoints free of backtracking when a full arrow approach cannot fit", () => {
    const document = alignedDocument();
    const diagram = createDiagram({
      ...document,
      nodes: [document.nodes[0]!, { ...document.nodes[1]!, x: 160, y: 110 }],
      edges: [{ ...document.edges[0]!, route: "orthogonal", fromPort: undefined, toPort: undefined }]
    });
    const points = pathPoints(diagram.evaluateAt(0).edges[0]!.path);
    expect(points.every(({ x }) => x >= 140 && x <= 160)).toBe(true);
    for (let time = 1; time < 1000; time += 10) {
      const point = diagram.evaluateAt(time).edges[0]!.flow!.point;
      expect(point.x >= 140 && point.x <= 160).toBe(true);
    }
  });

  it.each(TARGET_CASES)("separates automatic $side inputs on the $kind contour in source order", ({ kind, side }) => {
    const vertical = side === "top" || side === "bottom";
    const near = side === "top" || side === "left" ? 40 : 600;
    const diagram = createDiagram({
      version: 1,
      viewport: { width: 800, height: 800 },
      nodes: [
        { id: "first", kind: "rect", x: vertical ? 220 : near, y: vertical ? near : 220, width: 60, height: 60 },
        { id: "second", kind: "rect", x: vertical ? 440 : near, y: vertical ? near : 440, width: 60, height: 60 },
        { id: "target", kind, x: 300, y: 300, width: 100, height: 100 }
      ],
      edges: [
        { id: "second-input", from: "second", to: "target", route: "orthogonal" },
        { id: "first-input", from: "first", to: "target", route: "orthogonal" }
      ],
      scenes: []
    });
    const points = diagram.evaluateAt(0).edges.map(({ path }) => pathPoints(path));
    const tips = points.map((path) => path.at(-1)!);
    expect(vertical ? tips[0]!.x - tips[1]!.x : tips[0]!.y - tips[1]!.y).toBeGreaterThanOrEqual(20);
    for (const path of points) {
      const end = path.at(-1)!;
      const before = path.at(-2)!;
      const normal = PORT_NORMALS[side];
      expect((before.x - end.x) * normal.x + (before.y - end.y) * normal.y).toBeGreaterThanOrEqual(24);
      expect((before.x - end.x) * normal.y - (before.y - end.y) * normal.x).toBeCloseTo(0);
      if (kind === "ellipse") {
        expect(((end.x - 350) / 50) ** 2 + ((end.y - 350) / 50) ** 2).toBeCloseTo(1, 3);
      } else if (kind === "cylinder" && vertical) {
        const capCenterY = side === "top" ? 314 : 386;
        expect(((end.x - 350) / 50) ** 2 + ((end.y - capCenterY) / 14) ** 2).toBeCloseTo(1, 3);
      } else {
        expect(vertical ? end.y : end.x).toBe(side === "top" || side === "left" ? 300 : 400);
      }
    }
  });

  it.each(["orthogonal", "curved"] as const)("gives same-side %s inputs separate arrow tips without changing slots during hides", (route) => {
    const document: DiagramDocument = {
      version: 1,
      viewport: { width: 800, height: 600 },
      nodes: [
        { id: "first", kind: "rect", x: 60, y: 40, width: 100, height: 60 },
        { id: "second", kind: "rect", x: 460, y: 40, width: 100, height: 60 },
        { id: "target", kind: "roundedRect", x: 260, y: 300, width: 220, height: 100 }
      ],
      edges: [
        { id: "first-input", from: "first", to: "target", route, fromPort: "bottom", toPort: "top" },
        { id: "second-input", from: "second", to: "target", route, fromPort: "bottom", toPort: "top" }
      ],
      scenes: [{ id: "hide", label: "Hide one input", beats: [{ durationMs: 1000, actions: [{ type: "hide", target: "first-input" }] }] }]
    };
    const diagram = createDiagram(document);
    const before = diagram.evaluateAt(0).edges.map(({ path }) => pathPoints(path).at(-1)!);
    expect(Math.abs(before[0]!.x - before[1]!.x)).toBeGreaterThanOrEqual(20);
    expect(before.every(({ y }) => y === 300)).toBe(true);
    expect(pathPoints(diagram.evaluateAt(1000).edges[1]!.path).at(-1)).toEqual(before[1]);
  });

  it.each([2, 6])("keeps an arrow-sized straight approach before an explicit elbow at stroke width %s", (strokeWidth) => {
    const document = alignedDocument();
    const diagram = createDiagram({
      ...document,
      nodes: [document.nodes[0]!, { ...document.nodes[1]!, y: 350 }],
      edges: [{ ...document.edges[0]!, route: "orthogonal", fromPort: "bottom", toPort: "left", style: { strokeWidth } }]
    });
    const points = pathPoints(diagram.evaluateAt(0).edges[0]!.path);
    const end = points.at(-1)!;
    const before = points.at(-2)!;
    expect(end.y).toBe(before.y);
    expect(end.x - before.x).toBeGreaterThanOrEqual(strokeWidth * 7 + 8);
  });

  it("resizes the arrow approach with the evaluated stroke width", () => {
    const document = alignedDocument();
    const diagram = createDiagram({
      ...document,
      nodes: [document.nodes[0]!, { ...document.nodes[1]!, y: 350 }],
      edges: [{ ...document.edges[0]!, route: "orthogonal", fromPort: "bottom", toPort: "left" }],
      scenes: [{ id: "thicken", label: "Thicken", beats: [{ durationMs: 1000, transitionMs: 1000, actions: [
        { type: "updateEdge", target: "transfer", value: { strokeWidth: 6 } }
      ] }] }]
    });
    for (const time of [0, 500, 1000]) {
      const edge = diagram.evaluateAt(time).edges[0]!;
      const points = pathPoints(edge.path);
      expect(points.at(-1)!.x - points.at(-2)!.x).toBeGreaterThanOrEqual(edge.style!.strokeWidth! * 7 + 8);
    }
  });

  it("retains the return segment of an aligned cubic for flow, hits, focus bounds and labels", () => {
    const diagram = createDiagram(alignedDocument());
    const frame = diagram.evaluateAt(900);
    const edge = frame.edges[0]!;

    // Independent dense SVG sampling gives x=524.65 at 90% distance and an extremum near x=543.69.
    expect.soft(edge.flow?.point.x).toBeCloseTo(524.65, 0);
    expect.soft(edge.flow?.point.y).toBeCloseTo(130);
    expect.soft(diagram.hitTest(500, { x: 536, y: 130 })).toEqual({ id: "transfer", type: "edge" });
    expect.soft(frame.camera.x).toBe(16);
    expect.soft(frame.camera.width).toBeCloseTo(551.69, 0);
    expect.soft(edge.labelBoxes[0]?.x).toBeGreaterThan(330);
    expect.soft(edge.labelBoxes[0]?.x).toBeLessThan(544);
    const document = alignedDocument();
    const reverse = createDiagram({ ...document, scenes: [{ id: "return", label: "Return", beats: [{ durationMs: 1000, actions: [
      { type: "flow", target: "transfer", direction: "reverse" }
    ] }] }] });
    expect.soft(reverse.evaluateAt(100).edges[0]?.flow?.point.x).toBeCloseTo(524.65, 0);
    expect.soft(diagram.renderSvg(900)).toContain(`d="${edge.path}"`);
  });

  it("leaves and enters away-facing orthogonal ports without crossing endpoint interiors", () => {
    const document = alignedDocument();
    const diagram = createDiagram({
      ...document,
      edges: [{ ...document.edges[0]!, route: "orthogonal", fromPort: "left", toPort: "left" }]
    });
    const values = diagram.evaluateAt(0).edges[0]!.path.match(/-?\d+(?:\.\d+)?/g)!.map(Number);
    expect(values[2]).toBeLessThan(values[0]!);
    expect(values[3]).toBe(values[1]);
    const marker = diagram.evaluateAt(100).edges[0]!.flow!.point;
    expect(marker.x > 40 && marker.x < 140 && marker.y > 100 && marker.y < 160).toBe(false);
  });

  it.each(PORT_CASES)("honors orthogonal port normals and endpoint exclusion for $fromPort → $toPort", ({ fromPort, toPort }) => {
    const document = alignedDocument();
    const diagram = createDiagram({ ...document, edges: [{ ...document.edges[0]!, route: "orthogonal", fromPort, toPort }] });
    const values = diagram.evaluateAt(0).edges[0]!.path.match(/-?\d+(?:\.\d+)?/g)!.map(Number);
    const first = { x: values[2]! - values[0]!, y: values[3]! - values[1]! };
    const last = { x: values.at(-4)! - values.at(-2)!, y: values.at(-3)! - values.at(-1)! };
    for (const [segment, direction] of [[first, fromPort ?? "right"], [last, toPort ?? "left"]] as const) {
      const normal = PORT_NORMALS[direction];
      expect(segment.x * normal.x + segment.y * normal.y).toBeGreaterThan(0);
      expect(segment.x * normal.y - segment.y * normal.x).toBe(0);
    }
    for (let timeMs = 1; timeMs < 1000; timeMs += 10) {
      const point = diagram.evaluateAt(timeMs).edges[0]!.flow!.point;
      for (const node of document.nodes) {
        expect(point.x > node.x && point.x < node.x + node.width && point.y > node.y && point.y < node.y + node.height).toBe(false);
      }
    }
    expect(diagram.evaluateAt(999).edges[0]!.path).toBe(diagram.evaluateAt(0).edges[0]!.path);
  });
});
