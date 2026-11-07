import { describe, expect, it } from "vitest";
import { createDiagram, validateDocument, type DiagramDocument } from "../index.js";

function diamondDocument(): DiagramDocument {
  return { version: 1, viewport: { width: 500, height: 400 }, nodes: [
    { id: "decision", kind: "diamond", x: 20, y: 30, width: 200, height: 160, label: "Ready?" }
  ], edges: [], scenes: [] };
}

describe("diamond node labels", () => {
  it("renders a decision with its label centered inside the padded inner rectangle", () => {
    const document = diamondDocument();
    expect(validateDocument(document)).toEqual([]);
    const diagram = createDiagram(document);
    const node = diagram.evaluateAt(0).nodes[0]!;
    expect(node.labelLines).toEqual(["Ready?"]);
    expect(node.labelBoxes[0]).toMatchObject({ x: 120, y: 116 });
    expect(diagram.renderSvg()).toContain('points="120,30 220,110 120,190 20,110"');
    expect(diagram.renderSvg()).toContain('<rect x="82" y="82" width="76" height="56"');
    expect(diagram.evaluateAt(0).warnings).toEqual([]);
  });

  it("uses the actual contour for diagonal attachments and corner hit testing", () => {
    const document: DiagramDocument = { version: 1, viewport: { width: 500, height: 500 }, nodes: [
      { id: "decision", kind: "diamond", x: 0, y: 0, width: 200, height: 200 },
      { id: "next", kind: "rect", x: 300, y: 300, width: 40, height: 40 }
    ], edges: [{ id: "relation", from: "decision", to: "next" }], scenes: [] };
    const diagram = createDiagram(document);
    expect(diagram.evaluateAt(0).edges[0]!.path).toBe("M 150 150 L 300 300");
    expect(diagram.hitTest(0, { x: 5, y: 5 })).toBeNull();
    expect(diagram.hitTest(0, { x: 100, y: 100 })).toEqual({ id: "decision", type: "node" });
  });

  it("uses only visible contour and clipped label paint for diagnostics and fitted height", () => {
    const repeated = Array.from({ length: 10 }, () => "A").join("\n");
    const document: DiagramDocument = { version: 1, viewport: { width: 500, height: 400 }, nodes: [
      { id: "decision", kind: "diamond", x: 100, y: 100, width: 200, height: 200, label: repeated },
      { id: "from", kind: "rect", x: 70, y: 105, width: 10, height: 10 },
      { id: "to", kind: "rect", x: 130, y: 105, width: 10, height: 10 },
      { id: "above", kind: "rect", x: 190, y: 100, width: 20, height: 10 }
    ], edges: [{ id: "corner", from: "from", to: "to" }], scenes: [] };
    const diagram = createDiagram(document);
    expect(diagram.diagnoseAt(0)).toEqual([]);
    const crossing = createDiagram({ ...document, nodes: document.nodes.map((node) => node.id === "from"
      ? { ...node, y: 195 } : node.id === "to" ? { ...node, x: 330, y: 195 } : node) });
    expect(crossing.diagnoseAt(0)).toContainEqual(expect.objectContaining({ code: "edge-node-overlap", relatedObjectIds: ["decision"] }));
    const fitted = createDiagram({ version: 1, viewport: { width: 300, height: 400, fitHeight: { padding: 0 } },
      nodes: [{ id: "decision", kind: "diamond", x: 0, y: 0, width: 200, height: 80, label: repeated }], edges: [], scenes: [] });
    expect(fitted.evaluateAt(0).camera.height).toBe(81);
    expect(fitted.hitTest(0, { x: 100, y: 130 })).toBeNull();
  });

  it("wraps long tokens without splitting graphemes and reports safe-area overflow", () => {
    const initial = diamondDocument();
    const document: DiagramDocument = { ...initial, nodes: [
      { ...initial.nodes[0]!, height: 80, label: "ABCDEFGHIKL\n👩‍💻" },
      { id: "narrow", kind: "diamond", x: 260, y: 20, width: 80, height: 160, label: "é" }
    ] };
    const diagram = createDiagram(document);
    const frame = diagram.evaluateAt(0);
    expect(frame.nodes[0]!.labelLines).toEqual(["ABCDEFGH", "IKL", "👩‍💻"]);
    expect(frame.nodes[1]!.labelLines).toEqual(["é"]);
    expect(frame.warnings).toEqual([
      expect.objectContaining({ objectId: "decision", code: "text-overflow", message: expect.stringContaining("height") }),
      expect.objectContaining({ objectId: "narrow", code: "text-overflow", message: expect.stringContaining("width") })
    ]);
    expect(frame.nodes[0]).toMatchObject({ width: 200, height: 80 });
    expect(diagram.renderSvg()).toContain('font-size="16"');
    expect(diagram.renderSvg()).not.toContain("…");
  });

  it.each(["straight", "orthogonal", "curved"] as const)("keeps all cardinal and allocated %s attachments on the diamond", (route) => {
    const expected = { top: "200 100", right: "300 200", bottom: "200 300", left: "100 200" };
    for (const side of ["top", "right", "bottom", "left"] as const) {
      const diagram = createDiagram({ version: 1, viewport: { width: 500, height: 500 }, nodes: [
        { id: "from", kind: "rect", x: 20, y: 20, width: 30, height: 30 },
        { id: "decision", kind: "diamond", x: 100, y: 100, width: 200, height: 200 }
      ], edges: [{ id: "edge", from: "from", to: "decision", route, toPort: side }], scenes: [] });
      expect(diagram.evaluateAt(0).edges[0]!.path).toMatch(new RegExp(`${expected[side]}$`));
    }
    if (route === "straight") return;
    const allocated = createDiagram({ version: 1, viewport: { width: 500, height: 500 }, nodes: [
      { id: "a", kind: "rect", x: 100, y: 0, width: 20, height: 20 },
      { id: "b", kind: "rect", x: 300, y: 0, width: 20, height: 20 },
      { id: "decision", kind: "diamond", x: 100, y: 100, width: 200, height: 200 }
    ], edges: [
      { id: "first", from: "a", to: "decision", route, toPort: "top" },
      { id: "second", from: "b", to: "decision", route, toPort: "top" }
    ], scenes: [] });
    expect(allocated.evaluateAt(0).edges.map(({ path }) => path.split(" ").slice(-2).join(" "))).toEqual(["188 112", "212 112"]);
  });

  it("recomputes grouped label placement from interpolated dimensions and immediate text replacements", () => {
    const diagram = createDiagram({ version: 1, viewport: { width: 500, height: 500 }, nodes: [
      { id: "group", kind: "group", x: 10, y: 20, width: 400, height: 400 },
      { id: "decision", kind: "diamond", parentId: "group", x: 100, y: 100, width: 200, height: 160, label: "A" }
    ], edges: [], scenes: [{ id: "change", label: "Change", beats: [
      { durationMs: 1000, actions: [] },
      { durationMs: 1000, transitionMs: 1000, actions: [
        { type: "updateNode", target: "group", value: { x: 30, y: 40 } },
        { type: "updateNode", target: "decision", value: { width: 240, height: 200, label: "One\nTwo", fill: "#123456" } },
        { type: "highlight", target: "decision" }
      ] }
    ] }] });
    expect(diagram.evaluateAt(999).nodes[1]!.labelLines).toEqual(["A"]);
    expect(diagram.evaluateAt(1000).nodes[1]!.labelLines).toEqual(["One", "Two"]);
    expect(diagram.evaluateAt(1500).nodes[1]).toMatchObject({ x: 120, y: 130, width: 220, height: 180, highlighted: true,
      labelBoxes: [{ text: "One", x: 230, y: 216 }, { text: "Two", x: 230, y: 236 }] });
    expect(diagram.renderSvg(1500)).toContain('<rect x="187" y="187" width="86" height="66"');
    expect(diagram.evaluateAt(2000).nodes[1]).toMatchObject({ x: 130, y: 140, width: 240, height: 200 });
  });

  it("rejects structured content while preserving empty labels, tiny sizes and explicit clearing", () => {
    const initial = diamondDocument();
    expect(validateDocument({ ...initial, nodes: [{ ...initial.nodes[0]!, label: undefined, content: { blocks: [] } }] }))
      .toEqual([expect.objectContaining({ path: "nodes[0].content" })]);
    const clear: DiagramDocument = { ...initial, scenes: [{ id: "clear", label: "Clear", beats: [
      { durationMs: 1000, actions: [{ type: "updateNode", target: "decision", value: { content: null } }] }
    ] }] };
    expect(validateDocument(clear)).toEqual([]);
    expect(createDiagram(clear).evaluateAt(0).nodes[0]!.labelLines).toEqual([]);
    const invalid = { ...clear, scenes: [{ id: "invalid", label: "Invalid", beats: [
      { durationMs: 1000, actions: [{ type: "updateNode", target: "decision", value: { content: { blocks: [] } } }] }
    ] }] };
    expect(validateDocument(invalid)).toContainEqual(expect.objectContaining({ path: "scenes[0].beats[0].actions[0].value.content" }));
    const tiny = createDiagram({ ...initial, nodes: [{ ...initial.nodes[0]!, width: 1, height: 1, label: "" }] });
    expect(tiny.evaluateAt(0).warnings).toEqual([]);
    expect(tiny.renderSvg()).not.toMatch(/NaN|Infinity|(?:width|height)="-/);
  });

  it("reports non-finite derived label width instead of exposing invalid paint bounds", () => {
    const initial = diamondDocument();
    const diagram = createDiagram({ ...initial, typography: { nodeLabel: 1e307 }, nodes: [
      { ...initial.nodes[0]!, width: 1e308, height: 1e308, label: "a" + "́".repeat(30) }
    ] });
    expect(() => diagram.evaluateAt(0)).toThrow("Invalid diagram document");
  });
});
