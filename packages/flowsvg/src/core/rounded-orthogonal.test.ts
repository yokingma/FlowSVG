import { describe, expect, it } from "vitest";
import { createDiagram, type DiagramDocument } from "../index.js";

const roundedDocument = (): DiagramDocument => ({
  version: 1,
  viewport: { width: 500, height: 400 },
  nodes: [
    { id: "source", kind: "rect", x: 20, y: 100, width: 100, height: 60 },
    { id: "target", kind: "rect", x: 300, y: 220, width: 100, height: 60 }
  ],
  edges: [{ id: "transfer", from: "source", to: "target", route: "orthogonal" }],
  scenes: [{ id: "send", label: "Send", beats: [{ durationMs: 1000, actions: [
    { type: "flow", target: "transfer", direction: "forward" }
  ] }] }]
});

describe("rounded orthogonal routes", () => {
  it("rounds actual SVG bends while keeping cardinal straight runs and endpoint positions", () => {
    const diagram = createDiagram(roundedDocument());
    const edge = diagram.evaluateAt(0).edges[0]!;
    expect(edge.path).toMatch(/^M 120 130 L \d+ 130 Q /);
    expect(edge.path.match(/ Q /g)).toHaveLength(2);
    expect(edge.path).toMatch(/ L 300 250$/);
    expect(diagram.renderSvg()).toContain(`d="${edge.path}"`);
    expect(diagram.evaluateAt(999).edges[0]!.path).toBe(edge.path);
  });
  it.each([2, 6])("keeps rounded obstacle detours outside stroked node bounds at width %s", (strokeWidth) => {
    const document = roundedDocument();
    const diagram = createDiagram({ ...document, nodes: [...document.nodes,
      { id: "blocker", kind: "rect", x: 175, y: 160, width: 60, height: 50 }
    ], edges: [{ ...document.edges[0]!, style: { strokeWidth } }] });
    expect(diagram.evaluateAt(0).edges[0]!.path).toContain(" Q ");
    for (let time = 5; time < 995; time += 5) {
      const point = diagram.evaluateAt(time).edges[0]!.flow!.point;
      expect(point.x > 175 - strokeWidth / 2 && point.x < 235 + strokeWidth / 2
        && point.y > 160 - strokeWidth / 2 && point.y < 210 + strokeWidth / 2).toBe(false);
      expect(diagram.hitTest(time, point)).toEqual({ type: "edge", id: "transfer" });
    }
  });

  it("keeps fractional narrow gaps finite and never rounds through endpoint interiors", () => {
    const document = roundedDocument();
    expect(createDiagram(document).evaluateAt(0).edges[0]!.path).toContain(" Q ");
    for (const gap of [0.1, 1, 7, 20]) {
      const nodes = [document.nodes[0]!, { ...document.nodes[1]!, x: 120 + gap, y: 100.2 }];
      const diagram = createDiagram({ ...document, nodes });
      const path = diagram.evaluateAt(0).edges[0]!.path;
      expect(path).not.toMatch(/NaN|Infinity/);
      for (let time = 1; time < diagram.totalDuration; time += 5) {
        const { x, y } = diagram.evaluateAt(time).edges[0]!.flow!.point;
        expect(Number.isFinite(x) && Number.isFinite(y)).toBe(true);
        for (const node of nodes) expect(x > node.x && x < node.x + node.width
          && y > node.y && y < node.y + node.height).toBe(false);
      }
    }
  });

  it("retains a centered bridge when the gap can fit both rounded bends and arrow clearance", () => {
    const document = roundedDocument();
    const diagram = createDiagram({ ...document, nodes: [document.nodes[0]!, { ...document.nodes[1]!, x: 480 }] });
    const path = diagram.evaluateAt(0).edges[0]!.path;
    expect(path.match(/ Q /g)).toHaveLength(2);
    expect(path).toContain("Q 300 130 300");
    expect(path).toContain("Q 300 250");
  });

});
