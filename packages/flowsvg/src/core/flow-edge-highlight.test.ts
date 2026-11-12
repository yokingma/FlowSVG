import { describe, expect, it } from "vitest";
import { createDiagram, DiagramValidationError, validateDocument, type Action, type DiagramDocument, type FlowDirection } from "../index.js";

function transferDocument(direction: FlowDirection = "forward", highlightEdge?: boolean): DiagramDocument {
  return {
    version: 1,
    viewport: { width: 500, height: 200 },
    nodes: [
      { id: "source", kind: "rect", x: 20, y: 70, width: 80, height: 60 },
      { id: "target", kind: "rect", x: 280, y: 70, width: 80, height: 60 }
    ],
    edges: [{ id: "transfer", from: "source", to: "target", label: "Relationship", style: { stroke: "#c2410a", dashed: true } }],
    scenes: [{ id: "send", label: "Send", beats: [{ durationMs: 2000, transitionMs: 0, actions: [
      { type: "flow", target: "transfer", direction, text: "Payload", ...(highlightEdge !== undefined ? { highlightEdge } : {}) }
    ] }] }]
  };
}

describe("flow edge highlight policy", () => {
  it.each(["forward", "reverse"] as const)("preserves ordinary edge and label paint during a %s transfer", (direction) => {
    const diagram = createDiagram(transferDocument(direction, false));
    expect(diagram.totalDuration).toBe(1500);
    for (const timeMs of [0, 500, 1200, 1400, 1499]) {
      const frame = diagram.evaluateAt(timeMs);
      expect(frame.edges[0]).toMatchObject({ highlighted: true, style: { stroke: "#c2410a", dashed: true }, flow: { direction, text: "Payload" } });
      expect(frame.nodes.map(node => node.highlighted)).toEqual([true, true]);
      expect(diagram.renderSvg(timeMs)).toMatch(/<text[^>]*fill="#c2410a"[^>]*><tspan[^>]*>Relationship<\/tspan><\/text>/);
    }
    expect(diagram.evaluateAt(500).edges[0]!.flow).toMatchObject({ progress: 0.5, point: { x: 190, y: 100 } });
    expect(diagram.evaluateAt(1500).edges[0]).toMatchObject({ highlighted: false, style: { stroke: "#c2410a" } });
    expect(diagram.renderSvg(1500)).not.toContain("data-flow-id");
  });

  it.each([undefined, true])("retains default paint and timing with highlightEdge %s", (highlightEdge) => {
    const diagram = createDiagram(transferDocument("forward", highlightEdge));
    expect(diagram.totalDuration).toBe(1500);
    expect(diagram.evaluateAt(500).edges[0]).toMatchObject({ highlighted: true, style: { stroke: "#2a63c8" } });
    expect(diagram.evaluateAt(1400).edges[0]!.style.stroke).toBe("#765269");
    expect(diagram.evaluateAt(1500).edges[0]).toMatchObject({ highlighted: false, style: { stroke: "#c2410a" } });
  });

  it.each(["false", 0, null, {}])("rejects an invalid edge policy %j with its field path", (highlightEdge) => {
    const document = transferDocument();
    const malformed: unknown = { ...document, scenes: [{ id: "send", label: "Send", beats: [{
      durationMs: 1000, actions: [{ type: "flow", target: "transfer", direction: "forward", highlightEdge }]
    }] }] };
    expect(validateDocument(malformed)).toEqual([{
      path: "scenes[0].beats[0].actions[0].highlightEdge", message: "must be a boolean"
    }]);
    expect(() => createDiagram(malformed as DiagramDocument)).toThrow(DiagramValidationError);
  });

  it("keeps interpolated updates and explicit highlight layers independent across beats", () => {
    const document = transferDocument("forward", false);
    const flow: Action = { type: "flow", target: "transfer", direction: "forward", highlightEdge: false, highlightParticipants: false };
    const diagram = createDiagram({ ...document, scenes: [{ id: "layers", label: "Layers", beats: [
      { durationMs: 100, transitionMs: 0, actions: [{ type: "highlight", target: "transfer" }] },
      { durationMs: 2000, transitionMs: 400, actions: [flow,
        { type: "unhighlight", target: "transfer" },
        { type: "updateEdge", target: "transfer", value: { stroke: "#008800" } }
      ] },
      { durationMs: 2000, transitionMs: 0, actions: [flow, { type: "highlight", target: "transfer" }] },
      { durationMs: 100, transitionMs: 0, actions: [{ type: "unhighlight", target: "transfer" }] }
    ] }] });
    const midpoint = diagram.evaluateAt(300);
    expect(midpoint.edges[0]).toMatchObject({ highlighted: true, style: { stroke: "#466467" } });
    expect(diagram.evaluateAt(500).edges[0]).toMatchObject({ highlighted: true, style: { stroke: "#008800" } });
    expect(diagram.evaluateAt(1600).edges[0]).toMatchObject({ highlighted: true, style: { stroke: "#2a63c8" } });
    expect(diagram.evaluateAt(3100).edges[0]).toMatchObject({ highlighted: false, style: { stroke: "#008800" } });
    expect(diagram.evaluateAt(3100).edges[0]!.flow).toBeUndefined();
  });

  it("applies mixed policies independently for synchronized flows and reduced motion", () => {
    const document = transferDocument();
    const diagram = createDiagram({ ...document,
      nodes: [...document.nodes, { id: "hidden", kind: "rect", x: 400, y: 70, width: 80, height: 60, visible: false }],
      edges: [...document.edges,
        { id: "return", from: "target", to: "source", style: { stroke: "#c2410a" } },
        { id: "masked", from: "source", to: "hidden", style: { stroke: "#c2410a" } }
      ],
      scenes: [{ id: "mixed", label: "Mixed", beats: [{ durationMs: 1000, actions: [
        { type: "flow", target: "transfer", direction: "forward", highlightEdge: false, highlightParticipants: false },
        { type: "flow", target: "return", direction: "reverse", highlightEdge: true, highlightParticipants: false },
        { type: "flow", target: "masked", direction: "forward", highlightEdge: false, highlightParticipants: false }
      ] }] }]
    });
    for (const reducedMotion of [false, true]) {
      const frame = diagram.evaluateAt(500, { reducedMotion });
      expect(frame.edges.map(edge => edge.style.stroke)).toEqual(["#c2410a", "#2a63c8", "#c2410a"]);
      expect(frame.edges.map(edge => edge.highlighted)).toEqual([true, true, true]);
      expect(frame.nodes.map(node => node.highlighted)).toEqual([false, false, false]);
      expect(frame.edges[0]!.flow?.progress).toBe(reducedMotion ? undefined : 0.5);
      expect(frame.edges[1]!.flow?.point).toEqual(reducedMotion ? undefined : { x: 190, y: 100 });
      expect(frame.edges[2]!.flow).toBeUndefined();
    }
    expect(diagram.totalDuration).toBe(1000);
    expect(diagram.evaluateAt(1000).edges.every(edge => !edge.highlighted && !edge.flow)).toBe(true);
  });

  it("permits no automatic visible cue in reduced motion when both policies are false", () => {
    const document = transferDocument("reverse", false);
    const diagram = createDiagram({ ...document, scenes: [{ id: "quiet", label: "Quiet", beats: [{ durationMs: 1000, actions: [
      { type: "flow", target: "transfer", direction: "reverse", highlightEdge: false, highlightParticipants: false }
    ] }] }] });
    const frame = diagram.evaluateAt(500, { reducedMotion: true });
    expect(frame.edges[0]).toMatchObject({ highlighted: true, style: { stroke: "#c2410a" } });
    expect(frame.nodes.every(node => !node.highlighted)).toBe(true);
    expect(diagram.renderSvg(500, { reducedMotion: true })).not.toContain("data-flow-id");
  });

  it("still rejects duplicate transfers independently of their edge policies", () => {
    const document = transferDocument();
    expect(validateDocument({ ...document, scenes: [{ id: "duplicate", label: "Duplicate", beats: [{ durationMs: 1000, actions: [
      { type: "flow", target: "transfer", direction: "forward", highlightEdge: false },
      { type: "flow", target: "transfer", direction: "reverse", highlightEdge: null }
    ] }] }] })).toEqual([
      { path: "scenes[0].beats[0].actions[1].highlightEdge", message: "must be a boolean" },
      { path: "scenes[0].beats[0].actions[1].target", message: "duplicate beat assignment" }
    ]);
  });
});
