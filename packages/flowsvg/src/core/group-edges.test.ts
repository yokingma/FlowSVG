import { describe, expect, it } from "vitest";
import { createDiagram, validateDocument, type DiagramDocument } from "../index.js";

const groupDocument = (route: "straight" | "curved" | "orthogonal"): DiagramDocument => ({
  version: 1, viewport: { width: 800, height: 500 },
  nodes: [
    { id: "bank", kind: "group", x: 50, y: 40, width: 300, height: 300 },
    { id: "index", kind: "group", parentId: "bank", x: 20, y: 40, width: 180, height: 200 },
    { id: "inside", kind: "rect", parentId: "index", x: 20, y: 40, width: 80, height: 60 },
    { id: "agent", kind: "rect", x: 550, y: 160, width: 100, height: 80 }
  ],
  edges: [{ id: "search", from: "agent", to: "index", route, fromPort: "left", toPort: "right" }],
  scenes: [{ id: "search", label: "Search", beats: [
    { durationMs: 1000, transitionMs: 0, actions: [
      { type: "updateNode", target: "bank", value: { x: 100 } },
      { type: "flow", target: "search", direction: "reverse" }
    ] },
    { durationMs: 1000, transitionMs: 0, actions: [{ type: "hide", target: "bank" }] }
  ] }]
});

describe("group edge endpoints", () => {
  it.each(["straight", "curved", "orthogonal"] as const)("attaches %s to the evaluated nested group boundary", (route) => {
    const doc = groupDocument(route);
    expect(validateDocument(doc)).toEqual([]);
    const diagram = createDiagram(doc);
    const frame = diagram.evaluateAt(500);
    expect(frame.edges[0]?.path).toMatch(/^M 550 200 /);
    expect(frame.edges[0]?.path).toMatch(/300 180$/);
    expect(frame.edges[0]?.flow?.direction).toBe("reverse");
    expect(frame.nodes.find(({ id }) => id === "index")?.highlighted).toBe(true);
    expect(frame.nodes.find(({ id }) => id === "inside")?.highlighted).toBe(false);
    expect(diagram.evaluateAt(1000).edges[0]?.opacity).toBe(0);
  });
});
