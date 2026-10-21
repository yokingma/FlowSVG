import { describe, expect, it } from "vitest";
import { createDiagram, validateDocument, type Action, type DiagramDocument } from "../index.js";

const parallelDocument = (): DiagramDocument => ({
  version: 1,
  viewport: { width: 600, height: 400 },
  nodes: [
    { id: "source", kind: "rect", x: 20, y: 70, width: 80, height: 60 },
    { id: "near", kind: "rect", x: 240, y: 70, width: 80, height: 60 },
    { id: "far", kind: "rect", x: 440, y: 70, width: 80, height: 60 },
    { id: "bottom", kind: "rect", x: 20, y: 270, width: 80, height: 60 },
    { id: "idle", kind: "ellipse", x: 440, y: 270, width: 80, height: 60 }
  ],
  edges: [
    { id: "short", from: "source", to: "near" },
    { id: "long", from: "source", to: "far" },
    { id: "vertical", from: "source", to: "bottom", route: "orthogonal" },
    { id: "continue", from: "near", to: "far" },
    { id: "return", from: "bottom", to: "source", route: "orthogonal" }
  ],
  scenes: [
    { id: "broadcast", label: "Broadcast", beats: [{ durationMs: 1000, transitionMs: 100, actions: [
      { type: "flow", target: "short", direction: "forward" },
      { type: "flow", target: "long", direction: "reverse" },
      { type: "flow", target: "vertical", direction: "forward" }
    ] }] },
    { id: "continue", label: "Continue", beats: [
      { durationMs: 600, transitionMs: 200, actions: [
        { type: "flow", target: "continue", direction: "forward" },
        { type: "flow", target: "return", direction: "reverse" },
        { type: "updateNode", target: "source", value: { fill: "#00ff00" } }
      ] },
      { durationMs: 400, actions: [] }
    ] }
  ]
});

const activeEdges = (document: DiagramDocument, timeMs: number): string[] =>
  createDiagram(document).evaluateAt(timeMs).edges.filter((edge) => edge.flow).map((edge) => edge.id);

describe("parallel transfer frames", () => {
  it.each([0, 0.25, 0.5, 0.999])("keeps three unequal routes synchronized at beat progress %s", (progress) => {
    const diagram = createDiagram(parallelDocument());
    const frame = diagram.evaluateAt(progress * 1000);
    expect(frame.edges.filter((edge) => edge.flow).map((edge) => edge.id)).toEqual(["short", "long", "vertical"]);
    for (const edge of frame.edges.slice(0, 3)) expect(edge.flow?.progress).toBeCloseTo(progress);
    expect(frame.edges[0]?.flow?.point.x).toBeCloseTo(100 + 140 * progress);
    expect(frame.edges[1]?.flow?.point.x).toBeCloseTo(440 - 340 * progress);
    expect(frame.edges[2]?.flow?.point.y).toBeCloseTo(130 + 140 * progress);
    expect(frame.nodes.filter((node) => node.highlighted).map((node) => node.id)).toEqual(["source", "near", "far", "bottom"]);
    expect(frame.edges.filter((edge) => edge.highlighted).map((edge) => edge.id)).toEqual(["short", "long", "vertical"]);
    expect(diagram.renderSvg(progress * 1000).match(/data-flow-id=/g)).toHaveLength(3);
  });

  it("replaces the complete transfer group at adjacent scene boundaries and clears final transfer state", () => {
    const document = parallelDocument();
    const diagram = createDiagram(document);
    expect(activeEdges(document, 999)).toEqual(["short", "long", "vertical"]);
    expect(activeEdges(document, 1000)).toEqual(["continue", "return"]);
    const boundary = diagram.evaluateAt(1000);
    expect(boundary.sceneId).toBe("continue");
    expect(boundary.edges[3]?.flow).toMatchObject({ progress: 0, point: { x: 320, y: 100 } });
    expect(boundary.edges[4]?.flow).toMatchObject({ progress: 0, point: { x: 60, y: 130 } });
    expect(boundary.nodes.find((node) => node.id === "source")?.style?.fill).toBe("#eaf1ff");
    expect(boundary.edges.slice(0, 3).every((edge) => !edge.flow && !edge.highlighted)).toBe(true);
    for (const timeMs of [1600, diagram.totalDuration]) {
      const frame = diagram.evaluateAt(timeMs);
      expect(frame.edges.every((edge) => !edge.flow && !edge.highlighted)).toBe(true);
      expect(frame.nodes.every((node) => !node.highlighted)).toBe(true);
      expect(frame.nodes[0]?.style?.fill).toBe("#00ff00");
      expect(diagram.renderSvg(timeMs)).not.toContain("data-flow-id");
    }
  });

  it("evaluates jumps and repeated queries independently with reduced motion retaining every participant", () => {
    const diagram = createDiagram(parallelDocument());
    const times = [0, 250, 999, 1000, 1150, 1599, 1600, 2000];
    const frames = new Map(times.map((timeMs) => [timeMs, diagram.evaluateAt(timeMs)]));
    for (const timeMs of [...times].reverse().concat(times)) expect(diagram.evaluateAt(timeMs)).toEqual(frames.get(timeMs));
    for (const timeMs of [250, 1150]) {
      const frame = diagram.evaluateAt(timeMs);
      const reduced = diagram.evaluateAt(timeMs, { reducedMotion: true });
      expect(reduced.edges.every((edge) => !edge.flow)).toBe(true);
      expect(reduced.nodes.map((node) => node.highlighted)).toEqual(frame.nodes.map((node) => node.highlighted));
      expect(reduced.edges.map((edge) => edge.highlighted)).toEqual(frame.edges.map((edge) => edge.highlighted));
      expect(reduced.beatProgress).toBe(frame.beatProgress);
      expect(diagram.renderSvg(timeMs, { reducedMotion: true })).not.toContain("data-flow-id");
    }
  });

  it.each(["forward", "reverse"] as const)("rejects two %s transfers to one edge while permitting independent visual layers", (direction) => {
    const document = parallelDocument();
    const actions: Action[] = [
      { type: "flow", target: "short", direction: "forward" },
      { type: "flow", target: "short", direction },
      { type: "highlight", target: "short" },
      { type: "hide", target: "short" },
      { type: "updateEdge", target: "short", value: { stroke: "#ff0000" } }
    ];
    const withActions = (nextActions: Action[]): DiagramDocument => ({ ...document, scenes: [{ id: "validate", label: "Validate", beats: [{ durationMs: 1000, actions: nextActions }] }] });
    expect(validateDocument(withActions(actions))).toEqual([
      { path: "scenes[0].beats[0].actions[1].target", message: "duplicate beat assignment" }
    ]);
    expect(validateDocument(withActions(actions.filter((_, index) => index !== 1)))).toEqual([]);
    const diagram = createDiagram(withActions(actions.filter((_, index) => index !== 1)));
    expect(diagram.evaluateAt(500).edges[0]).toMatchObject({ highlighted: true, visible: false, opacity: 0 });
    expect(diagram.evaluateAt(500).edges[0]?.flow).toBeUndefined();
  });
});
