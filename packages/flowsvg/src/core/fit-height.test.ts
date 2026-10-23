import { describe, expect, it } from "vitest";
import { createDiagram, DiagramValidationError, type DiagramDocument } from "../index.js";

function fixture(): DiagramDocument {
  return {
    version: 1, viewport: { width: 400, height: 500, fitHeight: { padding: 24 } },
    nodes: [{ id: "card", kind: "rect", x: 20, y: 20, width: 100, height: 60 }], edges: [],
    scenes: [{ id: "grow", label: "Grow", beats: [
      { durationMs: 1000, actions: [] },
      { durationMs: 1000, transitionMs: 1000, actions: [{ type: "updateNode", target: "card", value: { height: 160 } }] }
    ] }]
  };
}

describe("optional fitted canvas height", () => {
  it("fits current painted nodes while retaining width, origin, SVG agreement and deterministic seeking", () => {
    const input = fixture();
    const diagram = createDiagram(input);
    expect(diagram.evaluateAt(0).camera).toEqual({ x: 0, y: 0, width: 400, height: 105 });
    expect(diagram.evaluateAt(1500).camera.height).toBe(155);
    expect(diagram.evaluateAt(2000).camera.height).toBe(205);
    expect(diagram.renderSvg(0)).toContain('viewBox="0 0 400 105"');
    expect(diagram.hitTest(1500, { x: 50, y: 130 })).toEqual({ id: "card", type: "node" });
    input.viewport.fitHeight!.padding = 90;
    expect(diagram.evaluateAt(0).camera.height).toBe(105);
    const { fitHeight: _fitHeight, ...viewport } = input.viewport;
    expect(createDiagram({ ...input, viewport }).evaluateAt(0).camera.height).toBe(500);
  });
});

it("counts current visible paint, label descent and halo, and excludes hidden ancestors and zero opacity", () => {
  const input = fixture();
  input.viewport.fitHeight = { padding: 0 };
  input.nodes = [
    { id: "a", kind: "rect", x: 0, y: 0, width: 100, height: 10 },
    { id: "b", kind: "rect", x: 250, y: 0, width: 20, height: 10 },
    { id: "hidden", kind: "group", x: 0, y: 900, width: 100, height: 100, visible: false },
    { id: "child", kind: "rect", parentId: "hidden", x: 0, y: 0, width: 100, height: 100 }
  ];
  input.edges = [{ id: "ab", from: "a", to: "b", label: "first\nsecond\nthird" }];
  input.scenes = [];
  const diagram = createDiagram(input);
  expect(diagram.evaluateAt(0).camera.height).toBe(23);
  expect(diagram.renderSvg()).toContain('viewBox="0 0 400 23"');
  input.edges = [];
  input.nodes[0]!.label = "first\nsecond\nthird";
  expect(createDiagram(input).evaluateAt(0).camera.height).toBe(35);
  input.scenes = [{ id: "hide", label: "Hide", beats: [{ durationMs: 1000, transitionMs: 0, actions: [
    { type: "updateNode", target: "a", value: { opacity: 0 } }, { type: "hide", target: "b" }
  ] }] }];
  expect(createDiagram(input).evaluateAt(0).camera.height).toBe(500);
  expect(createDiagram({ ...input, nodes: [], scenes: [] }).evaluateAt(0).camera.height).toBe(500);
});

it.each([null, [], 3, {}, { padding: -1 }, { padding: Infinity }, { padding: "24" }, { padding: 2, extra: true }])("rejects malformed fitHeight %j", (fitHeight) => {
  const input = fixture();
  expect(() => createDiagram({ ...input, viewport: { ...input.viewport, fitHeight } } as unknown as DiagramDocument)).toThrow(DiagramValidationError);
});

it("throws a validation error rather than returning a nonrepresentable fitted height", () => {
  const input = fixture();
  input.nodes[0]!.y = Number.MAX_VALUE;
  input.nodes[0]!.height = Number.MAX_VALUE;
  expect(() => createDiagram(input).evaluateAt(0)).toThrow(DiagramValidationError);
});

it("preserves explicit authored-viewport focus and returns to the current fitted full view", () => {
  const input = fixture();
  input.scenes = [{ id: "focus", label: "Focus", beats: [
    { durationMs: 1000, transitionMs: 0, actions: [{ type: "focus", target: "card" }] },
    { durationMs: 1000, transitionMs: 0, actions: [
      { type: "updateNode", target: "card", value: { height: 160 } }, { type: "focus", target: null }
    ] }
  ] }];
  const diagram = createDiagram(input);
  const fixed = createDiagram({ ...input, viewport: { width: 400, height: 500 } });
  expect(diagram.evaluateAt(0).camera).toEqual(fixed.evaluateAt(0).camera);
  expect(diagram.evaluateAt(1000).camera.height).toBe(205);
  expect(diagram.evaluateAt(0).camera).toEqual(fixed.evaluateAt(0).camera);
});

it("protects active capsules and dots without reserving them under reduced motion", () => {
  const input = fixture();
  input.viewport.fitHeight = { padding: 0 };
  input.nodes = [
    { id: "a", kind: "rect", x: 0, y: 99.5, width: 20, height: 1, style: { strokeWidth: 0 } },
    { id: "b", kind: "rect", x: 250, y: 99.5, width: 20, height: 1, style: { strokeWidth: 0 } }
  ];
  input.edges = [{ id: "ab", from: "a", to: "b", style: { strokeWidth: 0 } }];
  input.scenes = [{ id: "send", label: "Send", beats: [{ durationMs: 1000, actions: [{ type: "flow", target: "ab", direction: "forward", text: "Message" }] }] }];
  const diagram = createDiagram(input);
  expect(diagram.evaluateAt(500).camera.height).toBe(112);
  expect(diagram.evaluateAt(500, { reducedMotion: true }).camera.height).toBe(101);
  input.scenes[0]!.beats[0]!.actions = [{ type: "flow", target: "ab", direction: "forward" }];
  expect(createDiagram(input).evaluateAt(500).camera.height).toBe(105);
});

it("includes the painted arrow footprint beyond a thick horizontal path", () => {
  const input = fixture();
  input.viewport.fitHeight = { padding: 0 };
  input.nodes = [
    { id: "a", kind: "rect", x: 0, y: 99.5, width: 20, height: 1 },
    { id: "b", kind: "rect", x: 250, y: 99.5, width: 20, height: 1 }
  ];
  input.edges = [{ id: "ab", from: "a", to: "b", style: { strokeWidth: 20 } }];
  input.scenes = [];
  expect(createDiagram(input).evaluateAt(0).camera.height).toBe(170);
});

it("includes a cubic extremum between flow samples in the fitted painted height", () => {
  const input: DiagramDocument = {
    version: 1, viewport: { width: 1100, height: 600, fitHeight: { padding: 0 } },
    nodes: [
      { id: "a", kind: "rect", x: 0, y: 100.2, width: 10, height: 10, style: { strokeWidth: 0 } },
      { id: "b", kind: "rect", x: 1000, y: 200.2, width: 10, height: 10, style: { strokeWidth: 0 } }
    ],
    edges: [{ id: "arc", from: "a", to: "b", route: "curved", fromPort: "bottom", toPort: "bottom", style: { strokeWidth: 0 } }],
    scenes: []
  };
  // The cubic's exact lower extremum is 407.1366; its nearest flow sample is 406.9545.
  expect(createDiagram(input).evaluateAt(0).camera.height).toBe(408);
});
