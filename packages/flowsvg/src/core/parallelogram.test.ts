import { describe, expect, it } from "vitest";
import { createDiagram, measureNodeLabel, validateDocument, DiagramValidationError, type DiagramDocument } from "../index.js";

function inputDocument(): DiagramDocument {
  return { version: 1, viewport: { width: 500, height: 400 }, nodes: [
    { id: "input", kind: "parallelogram", x: 20, y: 30, width: 200, height: 100, label: "Input" }
  ], edges: [], scenes: [] };
}

describe("parallelogram input/output nodes", () => {
  it("renders slanted input/output with a centered label clear of both angled sides", () => {
    const document = inputDocument();
    expect(validateDocument(document)).toEqual([]);
    const diagram = createDiagram(document);
    expect(diagram.evaluateAt(0).nodes[0]!.labelBoxes).toEqual([{ text: "Input", x: 120, y: 86 }]);
    expect(diagram.renderSvg()).toContain('points="44,30 220,30 196,130 20,130"');
    expect(diagram.renderSvg()).toContain('<rect x="56" y="42" width="128" height="76"');
    expect(diagram.evaluateAt(0).warnings).toEqual([]);
  });

  it("measures one stable height across label versions with slant clearance below and above its cap", () => {
    const versions = Object.freeze(["A", "One\nTwo"]);
    const input = Object.freeze({ kind: "parallelogram", width: 200, label: versions });
    const measured = measureNodeLabel(input);
    expect(measured).toEqual({ height: 64, diagnostics: [] });
    expect(measureNodeLabel(input)).toEqual(measured);
    for (const label of versions) {
      const initial = inputDocument();
      const diagram = createDiagram({ ...initial, nodes: [{ ...initial.nodes[0]!, height: measured.height, label }] });
      expect(diagram.evaluateAt(0).warnings).toEqual([]);
      expect(diagram.evaluateAt(0).nodes[0]!.labelLines).toEqual(label.split("\n"));
    }
    for (const [width, clip] of [[80, 'x="52" y="42" width="16" height="76"'],
      [96, 'x="56" y="42" width="24" height="76"'], [100, 'x="56" y="42" width="28" height="76"']] as const) {
      const initial = inputDocument();
      expect(createDiagram({ ...initial, nodes: [{ ...initial.nodes[0]!, width, label: "A" }] }).renderSvg()).toContain(clip);
    }
    expect(versions).toEqual(["A", "One\nTwo"]);
  });

  it("distinguishes real slanted paint from empty corners for connections, hits and diagnostics", () => {
    const document: DiagramDocument = { version: 1, viewport: { width: 500, height: 400 }, nodes: [
      { id: "io", kind: "parallelogram", x: 100, y: 100, width: 200, height: 100 },
      { id: "from", kind: "rect", x: 70, y: 100, width: 10, height: 10 },
      { id: "to", kind: "rect", x: 110, y: 100, width: 10, height: 10 }
    ], edges: [{ id: "corner", from: "from", to: "to" }], scenes: [] };
    const diagram = createDiagram(document);
    expect(diagram.hitTest(0, { x: 102, y: 115 })).toBeNull();
    expect(diagram.hitTest(0, { x: 125, y: 105 })).toEqual({ id: "io", type: "node" });
    expect(diagram.diagnoseAt(0)).toEqual([]);
    const crossing = createDiagram({ ...document, nodes: document.nodes.map((node) => node.id === "from"
      ? { ...node, y: 145 } : node.id === "to" ? { ...node, x: 330, y: 145 } : node) });
    expect(crossing.diagnoseAt(0)).toContainEqual(expect.objectContaining({ code: "edge-node-overlap", relatedObjectIds: ["io"] }));
    const diagonal = createDiagram({ ...document, nodes: [document.nodes[0]!,
      { id: "next", kind: "rect", x: 390, y: 240, width: 20, height: 20 }
    ], edges: [{ id: "out", from: "io", to: "next" }] });
    expect(diagonal.evaluateAt(0).edges[0]!.path).toMatch(/^M 278\.571 189\.286 L /);
  });

  it.each(["straight", "orthogonal", "curved"] as const)("keeps cardinal and same-side %s attachments on the actual outline", (route) => {
    const expected = { top: "200 100", right: "288 150", bottom: "200 200", left: "112 150" };
    for (const side of ["top", "right", "bottom", "left"] as const) {
      const diagram = createDiagram({ version: 1, viewport: { width: 500, height: 400 }, nodes: [
        { id: "from", kind: "rect", x: 10, y: 10, width: 20, height: 20 },
        { id: "io", kind: "parallelogram", x: 100, y: 100, width: 200, height: 100 }
      ], edges: [{ id: "edge", from: "from", to: "io", route, toPort: side }], scenes: [] });
      expect(diagram.evaluateAt(0).edges[0]!.path).toMatch(new RegExp(`${expected[side]}$`));
    }
    if (route === "straight") return;
    const allocated = createDiagram({ version: 1, viewport: { width: 500, height: 400 }, nodes: [
      { id: "a", kind: "rect", x: 0, y: 70, width: 20, height: 20 },
      { id: "b", kind: "rect", x: 0, y: 230, width: 20, height: 20 },
      { id: "io", kind: "parallelogram", x: 100, y: 100, width: 200, height: 100 }
    ], edges: [
      { id: "first", from: "a", to: "io", route, toPort: "left" },
      { id: "second", from: "b", to: "io", route, toPort: "left" }
    ], scenes: [] });
    expect(allocated.evaluateAt(0).edges.map(({ path }) => path.split(" ").slice(-2).join(" "))).toEqual(["114.88 138", "109.12 162"]);
  });

  it("recomputes grouped safe areas, clips and ports during label, size and visual transitions", () => {
    const diagram = createDiagram({ version: 1, viewport: { width: 500, height: 400 }, nodes: [
      { id: "group", kind: "group", x: 10, y: 20, width: 450, height: 350 },
      { id: "io", kind: "parallelogram", parentId: "group", x: 100, y: 100, width: 80, height: 64, label: "A" }
    ], edges: [], scenes: [{ id: "change", label: "Change", beats: [
      { durationMs: 1000, actions: [] },
      { durationMs: 1000, transitionMs: 1000, actions: [
        { type: "updateNode", target: "group", value: { x: 30, y: 40 } },
        { type: "updateNode", target: "io", value: { width: 120, height: 104, label: "One\nTwo", fill: "#123456" } },
        { type: "highlight", target: "io" }
      ] },
      { durationMs: 1000, transitionMs: 1000, actions: [{ type: "hide", target: "group" }] }
    ] }] });
    expect(diagram.evaluateAt(999).nodes[1]!.labelLines).toEqual(["A"]);
    expect(diagram.evaluateAt(1000).nodes[1]!.labelLines).toEqual(["O", "n", "e", "T", "w", "o"]);
    expect(diagram.evaluateAt(1500).nodes[1]).toMatchObject({ x: 120, y: 130, width: 100, height: 84, highlighted: true,
      labelBoxes: [{ text: "One", x: 170, y: 158 }, { text: "Tw", x: 170, y: 178 }, { text: "o", x: 170, y: 198 }] });
    expect(diagram.renderSvg(1500)).toContain('<rect x="156" y="142" width="28" height="60"');
    expect(diagram.evaluateAt(2000).nodes[1]).toMatchObject({ x: 130, y: 140, width: 120, height: 104 });
    expect(diagram.evaluateAt(3000).nodes[1]!.opacity).toBe(0);
  });

  it("keeps label-only validation, grapheme clipping and unresolved measurement widths explicit", () => {
    const document = inputDocument();
    expect(validateDocument({ ...document, nodes: [{ ...document.nodes[0]!, label: undefined, content: { blocks: [] } }] }))
      .toContainEqual(expect.objectContaining({ path: "nodes[0].content" }));
    const clearing: DiagramDocument = { ...document, scenes: [{ id: "clear", label: "Clear", beats: [
      { durationMs: 1000, actions: [{ type: "updateNode", target: "input", value: { content: null } }] }
    ] }] };
    expect(createDiagram(clearing).evaluateAt(0).nodes[0]!.labelLines).toEqual([]);
    expect(validateDocument({ ...clearing, scenes: [{ id: "invalid", label: "Invalid", beats: [
      { durationMs: 1000, actions: [{ type: "updateNode", target: "input", value: { content: { blocks: [] } } }] }
    ] }] })).toContainEqual(expect.objectContaining({ path: "scenes[0].beats[0].actions[0].value.content" }));
    const clipped = createDiagram({ ...document, nodes: [{ ...document.nodes[0]!, width: 80, height: 36, label: "中文\n\n👩‍💻" }] });
    expect(clipped.evaluateAt(0).nodes[0]!.labelLines).toEqual(["中", "文", "", "👩‍💻"]);
    expect(clipped.evaluateAt(0).warnings).toContainEqual(expect.objectContaining({ code: "text-overflow" }));
    expect(clipped.hitTest(0, { x: 60, y: 90 })).toBeNull();
    expect(measureNodeLabel({ kind: "parallelogram", width: 1, label: ["👩‍💻", "", "é"] })).toEqual({ height: 44, diagnostics: [
      expect.objectContaining({ versionIndex: 0, path: "label[0]", dimension: "width" }),
      expect.objectContaining({ versionIndex: 2, path: "label[2]", dimension: "width" })
    ] });
    expect(measureNodeLabel({ kind: "parallelogram", width: 1, label: "" })).toEqual({ height: 24, diagnostics: [] });
    expect(() => measureNodeLabel({ kind: "parallelogram", width: 0, label: "A" })).toThrow(DiagramValidationError);
    expect(() => measureNodeLabel({ kind: "parallelogram", width: 1e308, label: "A\n".repeat(20), typography: { nodeLabel: 1e307 } }))
      .toThrow(DiagramValidationError);
  });
});
