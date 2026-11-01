import { describe, expect, it } from "vitest";
import { createDiagram, measureNodeContent, renderSvg, validateDocument, DiagramValidationError, type DiagramDocument, type NodeContent } from "../index.js";

function fixture(): DiagramDocument {
  return { version: 1, viewport: { width: 400, height: 300 }, nodes: [
    { id: "a", kind: "rect", x: 20, y: 100, width: 100, height: 20, label: "中文标签需要换行" },
    { id: "b", kind: "group", x: 250, y: 100, width: 100, height: 100, label: "Group" }
  ], edges: [{ id: "ab", from: "a", to: "b", label: "Edge" }], scenes: [] };
}

describe("document typography", () => {
  it("preserves omitted defaults and resolves partial node sizes across wrapping, group labels and hits", () => {
    const input = fixture();
    expect(renderSvg(input)).toBe(renderSvg({ ...input, typography: { nodeLabel: 16, edgeLabel: 14, flowLabel: 12 } }));
    const diagram = createDiagram({ ...input, typography: { nodeLabel: 32 } });
    expect(diagram.evaluateAt(0).nodes[0]!.labelLines).toEqual(["中文标签", "需要换行"]);
    expect(diagram.renderSvg()).toContain('font-size="32"');
    expect(diagram.renderSvg()).toContain('font-size="14"');
    expect(diagram.hitTest(0, { x: 7, y: 80 })).toEqual({ id: "a", type: "node" });
    expect(createDiagram(input).hitTest(0, { x: 7, y: 80 })).toBeNull();
  });
  it.each([0, -1, NaN, Infinity, "32", 1.1e308])("rejects invalid node sizes and non-finite derived content metrics: %s", (nodeLabel) => {
    expect(validateDocument({ ...fixture(), typography: { nodeLabel } })).toContainEqual(expect.objectContaining({ path: "typography.nodeLabel" }));
  });
  it("rejects unknown typography fields and derived capsule overflow with source paths", () => {
    expect(validateDocument({ ...fixture(), typography: { flowLabel: 1e308, toString: 5 } })).toEqual([
      expect.objectContaining({ path: "typography.toString" }), expect.objectContaining({ path: "typography.flowLabel" })
    ]);
    expect(() => createDiagram({ ...fixture(), typography: { edgeLabel: Number.MAX_VALUE } })).toThrow(DiagramValidationError);
  });
  it("fits enlarged single-line flow capsules without adding hit targets or changing compiled time", () => {
    const input: DiagramDocument = { version: 1, viewport: { width: 400, height: 300, fitHeight: { padding: 0 } }, nodes: [
      { id: "a", kind: "rect", x: 0, y: 99.5, width: 20, height: 1, style: { strokeWidth: 0 } },
      { id: "b", kind: "rect", x: 250, y: 99.5, width: 20, height: 1, style: { strokeWidth: 0 } }
    ], edges: [{ id: "ab", from: "a", to: "b", style: { strokeWidth: 0 } }], scenes: [
      { id: "s", label: "Send", beats: [{ durationMs: 1000, actions: [{ type: "flow", target: "ab", direction: "forward", text: "中文" }] }] }
    ] };
    const before = JSON.stringify(input);
    const original = createDiagram(input);
    const diagram = createDiagram({ ...input, typography: { flowLabel: 24 } });
    expect(diagram.beats).toEqual(original.beats);
    expect(diagram.totalDuration).toBe(original.totalDuration);
    expect(diagram.evaluateAt(500).camera.height).toBe(124);
    expect(diagram.evaluateAt(500, { reducedMotion: true }).camera.height).toBe(101);
    const flow = diagram.evaluateAt(500).edges[0]!.flow!;
    expect(diagram.hitTest(500, { x: flow.point.x, y: flow.point.y + 20 })).toBeNull();
    expect(diagram.hitTest(500, flow.point)).toEqual({ id: "ab", type: "edge" });
    expect(diagram.renderSvg(500)).toContain('height="48" rx="24"');
    expect(diagram.renderSvg(500)).toContain('font-size="24" text-anchor="middle">中文</text>');
    expect(diagram.renderSvg(500)).toContain('pointer-events="none" aria-hidden="true"');
    expect(JSON.stringify(input)).toBe(before);
  });
  it("measures scaled content versions with the same layout while keeping authored geometry and gaps", () => {
    const short: NodeContent = { blocks: [{ type: "paragraph", text: "A" }] };
    const content: NodeContent = { blocks: [{ type: "title", text: "Title" }, { type: "paragraph", text: "First\nLast" }] };
    const typography = { nodeLabel: 32 };
    const measurement = measureNodeContent({ kind: "rect", width: 400, content: Object.freeze([short, content]), typography });
    expect(measurement.height).toBeCloseTo(175.6, 10);
    expect(measurement.diagnostics).toEqual([]);
    const document: DiagramDocument = { version: 1, viewport: { width: 500, height: 300 }, typography,
      nodes: [{ id: "content", kind: "rect", x: 0, y: 0, width: 400, height: measurement.height, content }], edges: [], scenes: [] };
    const before = JSON.stringify(document);
    const frame = createDiagram(document).evaluateAt(0);
    expect(frame.warnings).toEqual([]);
    expect(frame.nodes[0]!.contentLayout!.lines.map(({ fontSize }) => fontSize)).toEqual([40, 28, 28]);
    expect(frame.nodes[0]!.contentLayout!.safeArea).toMatchObject({ x: 16, y: 16, width: 368 });
    expect(frame.nodes[0]).toMatchObject({ x: 0, y: 0, width: 400, height: measurement.height });
    expect(JSON.stringify(document)).toBe(before);
  });
  it("scales every omitted structured role while retaining nested explicit sizes and fixed graph geometry", () => {
    const content: NodeContent = { blocks: [
      { type: "title", text: "Fixed title", style: { fontSize: 17 } },
      { type: "paragraph", text: [{ text: "Default span" }, { text: "Fixed span", style: { fontSize: 7 } }] },
      { type: "list", marker: "number", style: { fontSize: 18 }, items: [
        { tags: [{ text: "Default tag" }, { text: "Fixed tag", style: { fontSize: 9 } }], status: "Default status", body: "List body", auxiliary: "Default auxiliary" },
        { body: "Item body", style: { fontSize: 10 }, status: "Fixed status", statusStyle: { fontSize: 8 }, auxiliary: "Fixed auxiliary", auxiliaryStyle: { fontSize: 6 } }
      ] },
      { type: "list", marker: "bullet", items: [{ body: "Default body" }, { auxiliary: "Only auxiliary" }] },
      { type: "graph", height: 30, nodes: [{ id: "entity", label: "Graph label", x: 150, y: 23 }], edges: [] }
    ] };
    const typography = { nodeLabel: 32 };
    const measurement = measureNodeContent({ kind: "rect", width: 1000, content, typography });
    expect(measurement.diagnostics).toContainEqual(expect.objectContaining({ path: "content[0].blocks[4]", dimension: "height" }));
    const frame = createDiagram({ version: 1, typography, viewport: { width: 1000, height: 1000 },
      nodes: [{ id: "c", kind: "rect", x: 0, y: 0, width: 1000, height: measurement.height, content }], edges: [], scenes: [] }).evaluateAt(0);
    const layout = frame.nodes[0]!.contentLayout!;
    const sizes = Object.fromEntries(layout.lines.flatMap(({ spans }) => spans.map(({ text, fontSize }) => [text, fontSize])));
    expect(sizes).toMatchObject({ "Fixed title": 17, "Default span": 28, "Fixed span": 7,
      "Default tag": 22, "Fixed tag": 9, "Default status": 24, "List body": 18,
      "Default auxiliary": 24, "Item body": 10, "Fixed status": 8, "Fixed auxiliary": 6,
      "Default body": 28, "Only auxiliary": 24, "Graph label": 24 });
    expect(layout.lines.filter(({ role }) => role === "marker").map(({ spans }) => spans[0]!.fontSize)).toEqual([18, 10, 28, 24]);
    expect(layout.graphs![0]!.nodes[0]!.x).toBe(166);
    expect(frame.nodes[0]!.height).toBe(measurement.height);
    expect(frame.warnings).toContainEqual(expect.objectContaining({ path: "nodes[0].content", code: "text-overflow" }));
  });
  it("rejects font-derived line and capsule geometry overflow at the relevant typography field", () => {
    const source = fixture();
    const document = { ...source, nodes: source.nodes.map((node, index) => index === 0 ? { ...node, label: "A\n".repeat(30) } : node) };
    for (const [input, time] of [
      [{ ...document, typography: { nodeLabel: 1e307 } }, 0],
      [{ ...document, typography: { edgeLabel: 1e307 }, edges: [{ ...document.edges[0]!, label: "A\n".repeat(30) }] }, 0],
      [{ ...document, typography: { flowLabel: 8e307 }, scenes: [{ id: "s", label: "S", beats: [{ durationMs: 1000, actions: [{ type: "flow" as const, target: "ab", direction: "forward" as const, text: "中文中文" }] }] }] }, 100]
    ] as const) {
      const expectedRole = "nodeLabel" in input.typography ? "nodeLabel" : "edgeLabel" in input.typography ? "edgeLabel" : "flowLabel";
      try { createDiagram(input).renderSvg(time); throw new Error("Expected typography overflow"); }
      catch (error) {
        expect(error).toBeInstanceOf(DiagramValidationError);
        if (error instanceof DiagramValidationError) expect(error.issues).toContainEqual(expect.objectContaining({ path: `typography.${expectedRole}` }));
      }
    }
  });
  it.each([
    { typography: null, path: "typography" }, { typography: [], path: "typography" },
    { typography: new Date(0), path: "typography" },
    { typography: { nodeLabel: Number.MIN_VALUE }, path: "typography.nodeLabel" },
    { typography: { edgeLabel: 0 }, path: "typography.edgeLabel" },
    { typography: { flowLabel: Infinity }, path: "typography.flowLabel" },
    { typography: { extra: 20 }, path: "typography.extra" }
  ])("shares measurement and document field errors at $path", ({ typography, path }) => {
    const content: NodeContent = { blocks: [{ type: "title", text: "T" }] };
    const input = { kind: "rect", width: 100, content, typography };
    expect(validateDocument({ ...fixture(), typography })).toContainEqual(expect.objectContaining({ path }));
    try { Reflect.apply(measureNodeContent, undefined, [input]); throw new Error("Expected invalid typography"); }
    catch (error) {
      expect(error).toBeInstanceOf(DiagramValidationError);
      if (error instanceof DiagramValidationError) expect(error.issues).toContainEqual(expect.objectContaining({ path }));
    }
  });
});
