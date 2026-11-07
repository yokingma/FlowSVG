import { describe, expect, it } from "vitest";
import { createDiagram, validateDocument, measureNodeLabel, DiagramValidationError, type DiagramDocument } from "../index.js";

function processDocument(): DiagramDocument {
  return { version: 1, viewport: { width: 500, height: 400 }, nodes: [
    { id: "call", kind: "predefinedProcess", x: 20, y: 30, width: 200, height: 100, label: "Run checks" }
  ], edges: [], scenes: [] };
}

describe("predefined process labels", () => {
  it.each(["diamond", "predefinedProcess"] as const)("never hits a distant %s whose tiny contour collapses at a large origin", (kind) => {
    const diagram = createDiagram({ version: 1, viewport: { width: 600, height: 600 }, nodes: [
      { id: "remote", kind, x: 1e308, y: 1e308, width: 1, height: 1 }
    ], edges: [], scenes: [] });
    expect(diagram.hitTest(0, { x: 500, y: 500 })).toBeNull();
  });
  it("measures frozen label versions using the full rectangular safe-area height", () => {
    const versions = Object.freeze(["Run checks", "中文\n\nEnglish"]);
    const input = Object.freeze({ kind: "predefinedProcess", width: 240, label: versions });
    const result = measureNodeLabel(input);
    expect(result).toEqual({ height: 84, diagnostics: [] });
    expect(measureNodeLabel(input)).toEqual(result);
    for (const label of versions) {
      const model = processDocument();
      const diagram = createDiagram({ ...model, nodes: [{ ...model.nodes[0]!, width: 240, height: result.height, label }] });
      expect(diagram.evaluateAt(0).nodes[0]!.labelLines).toEqual(label.split("\n"));
      expect(diagram.evaluateAt(0).warnings).toEqual([]);
    }
    expect(measureNodeLabel({ kind: "predefinedProcess", width: 100, label: "" })).toEqual({ height: 24, diagnostics: [] });
  });
  it("renders one rectangular subprocess node with decorative side lines and a centered safe label", () => {
    expect(validateDocument(processDocument())).toEqual([]);
    const diagram = createDiagram(processDocument());
    expect(diagram.evaluateAt(0).nodes[0]!.labelBoxes).toEqual([{ text: "Run checks", x: 120, y: 86 }]);
    const svg = diagram.renderSvg();
    expect(svg).toContain('points="20,30 220,30 220,130 20,130"');
    expect(svg).toContain('d="M 32 30 V 130 M 208 30 V 130"');
    expect(svg.match(/data-id="call"/g)).toHaveLength(1);
    expect(svg).toContain('<rect x="44" y="42" width="152" height="76"');
    expect(diagram.evaluateAt(0).warnings).toEqual([]);
  });
  it("keeps inset geometry valid below, at and above its cap, including empty tiny labels", () => {
    for (const [width, expectedLine, expectedClip] of [[60, "M 30 30 V 130 M 70 30 V 130", '<rect x="42" y="42" width="16" height="76"'],
      [72, "M 32 30 V 130 M 80 30 V 130", '<rect x="44" y="42" width="24" height="76"'],
      [84, "M 32 30 V 130 M 92 30 V 130", '<rect x="44" y="42" width="36" height="76"']] as const) {
      const document = processDocument();
      const diagram = createDiagram({ ...document, nodes: [{ ...document.nodes[0]!, width, label: "A" }] });
      expect(diagram.renderSvg()).toContain(expectedLine);
      expect(diagram.renderSvg()).toContain(expectedClip);
      expect(diagram.evaluateAt(0).warnings).toEqual([]);
    }
    for (const size of [1, Number.MIN_VALUE]) {
      const diagram = createDiagram({ version: 1, viewport: { width: 100, height: 100 }, nodes: [
        { id: "tiny", kind: "predefinedProcess", x: 0, y: 0, width: size, height: size, label: "" }
      ], edges: [], scenes: [] });
      expect(diagram.evaluateAt(0).warnings).toEqual([]);
      expect(diagram.renderSvg()).not.toMatch(/NaN|Infinity|(?:width|height)="-/);
    }
  });

  it("wraps complete graphemes, retains blank lines and clips unsatisfied labels without changing geometry", () => {
    const document = processDocument();
    const diagram = createDiagram({ ...document, nodes: [{ ...document.nodes[0]!, width: 84, height: 40,
      label: "ABCDE\n\n👩‍💻é中文" }] });
    const frame = diagram.evaluateAt(0);
    expect(frame.nodes[0]!.labelLines).toEqual(["ABCD", "E", "", "👩‍💻", "é", "中文"]);
    expect(frame.nodes[0]).toMatchObject({ width: 84, height: 40 });
    expect(frame.warnings).toEqual([
      expect.objectContaining({ code: "text-overflow", objectId: "call", message: expect.stringContaining("width") }),
      expect.objectContaining({ code: "text-overflow", objectId: "call", message: expect.stringContaining("height") })
    ]);
    expect(diagram.renderSvg()).toContain('font-size="16"');
    expect(diagram.renderSvg()).not.toContain("…");
    expect(diagram.hitTest(0, { x: 62, y: 110 })).toBeNull();
    const narrow = measureNodeLabel({ kind: "predefinedProcess", width: 1, label: ["👩‍💻", "", "é"] });
    expect(narrow).toEqual({ height: 44, diagnostics: [
      expect.objectContaining({ versionIndex: 0, path: "label[0]", dimension: "width" }),
      expect.objectContaining({ versionIndex: 2, path: "label[2]", dimension: "width" })
    ] });
    const scaled = measureNodeLabel({ kind: "predefinedProcess", width: 240, label: "A\nB", typography: { nodeLabel: 24 } });
    expect(scaled).toEqual({ height: 84, diagnostics: [] });
    expect(createDiagram({ ...document, typography: { nodeLabel: 24 }, nodes: [{ ...document.nodes[0]!, width: 240,
      height: scaled.height, label: "A\nB" }] }).evaluateAt(0).warnings).toEqual([]);
  });

  it("rejects initial and timeline structured content but preserves explicit clearing", () => {
    const document = processDocument();
    expect(validateDocument({ ...document, nodes: [{ ...document.nodes[0]!, label: undefined, content: { blocks: [] } }] }))
      .toEqual([expect.objectContaining({ path: "nodes[0].content" })]);
    const invalid = { ...document, scenes: [{ id: "update", label: "Update", beats: [{ durationMs: 1000, actions: [
      { type: "updateNode", target: "call", value: { content: { blocks: [] } } }
    ] }] }] };
    expect(validateDocument(invalid)).toContainEqual(expect.objectContaining({ path: "scenes[0].beats[0].actions[0].value.content" }));
    const clear: DiagramDocument = { ...document, scenes: [{ id: "clear", label: "Clear", beats: [{ durationMs: 1000, actions: [
      { type: "updateNode", target: "call", value: { content: null } }
    ] }] }] };
    expect(validateDocument(clear)).toEqual([]);
    expect(createDiagram(clear).evaluateAt(0).nodes[0]!.labelLines).toEqual([]);
    for (const input of [{ kind: "predefinedProcess", width: 0, label: "A" },
      { kind: "predefinedProcess", width: 200, label: [] }, { kind: "predefinedProcess", width: 200, label: [1] },
      { kind: "predefinedProcess", width: 200, label: "A", typography: { nodeLabel: Infinity } },
      { kind: "predefinedProcess", width: 1e308, label: "A\nA\nA\nA\nA\nA\nA\nA\nA\nA\nA\nA\nA\nA\nA\nA", typography: { nodeLabel: 1e307 } }]) {
      expect(() => Reflect.apply(measureNodeLabel, undefined, [input])).toThrow(DiagramValidationError);
    }
  });

  it.each(["straight", "orthogonal", "curved"] as const)("uses only outer rectangle attachments for %s routes", (route) => {
    const expected = { top: "200 100", right: "300 150", bottom: "200 200", left: "100 150" };
    for (const side of ["top", "right", "bottom", "left"] as const) {
      const diagram = createDiagram({ version: 1, viewport: { width: 500, height: 500 }, nodes: [
        { id: "from", kind: "rect", x: 20, y: 20, width: 30, height: 30 },
        { id: "call", kind: "predefinedProcess", x: 100, y: 100, width: 200, height: 100 }
      ], edges: [{ id: "edge", from: "from", to: "call", route, toPort: side }], scenes: [] });
      expect(diagram.evaluateAt(0).edges[0]!.path).toMatch(new RegExp(`${expected[side]}$`));
      expect(diagram.hitTest(0, { x: 112, y: 150 })).toEqual({ id: "call", type: "node" });
      expect(diagram.hitTest(0, { x: 200, y: 150 })).toEqual({ id: "call", type: "node" });
    }
    if (route === "straight") return;
    const allocated = createDiagram({ version: 1, viewport: { width: 500, height: 500 }, nodes: [
      { id: "a", kind: "rect", x: 100, y: 0, width: 20, height: 20 },
      { id: "b", kind: "rect", x: 300, y: 0, width: 20, height: 20 },
      { id: "call", kind: "predefinedProcess", x: 100, y: 100, width: 200, height: 100 }
    ], edges: [{ id: "first", from: "a", to: "call", route, toPort: "top" },
      { id: "second", from: "b", to: "call", route, toPort: "top" }], scenes: [] });
    expect(allocated.evaluateAt(0).edges.map(({ path }) => path.split(" ").slice(-2).join(" "))).toEqual(["188 100", "212 100"]);
  });

  it("excludes clipped label paint from diagnostics and fitted height", () => {
    const label = Array.from({ length: 20 }, () => "A").join("\n");
    const document: DiagramDocument = { version: 1, viewport: { width: 300, height: 400, fitHeight: { padding: 0 } }, nodes: [
      { id: "call", kind: "predefinedProcess", x: 0, y: 0, width: 200, height: 40, label }
    ], edges: [], scenes: [] };
    const diagram = createDiagram(document);
    expect(diagram.evaluateAt(0).camera.height).toBe(41);
    expect(diagram.hitTest(0, { x: 100, y: 80 })).toBeNull();
    const overlap = createDiagram({ ...document, viewport: { width: 300, height: 400 }, nodes: [
      ...document.nodes, { id: "below", kind: "rect", x: 90, y: 80, width: 20, height: 20 }
    ] });
    expect(overlap.diagnoseAt(0)).toEqual([]);
  });

  it("keeps automatic diagonal edges on the exterior and diagnostics bound to one node", () => {
    const diagram = createDiagram({ version: 1, viewport: { width: 500, height: 500 }, nodes: [
      { id: "call", kind: "predefinedProcess", x: 100, y: 100, width: 200, height: 100 },
      { id: "next", kind: "rect", x: 400, y: 350, width: 40, height: 40 },
      { id: "from", kind: "rect", x: 50, y: 145, width: 10, height: 10 },
      { id: "to", kind: "rect", x: 340, y: 145, width: 10, height: 10 }
    ], edges: [{ id: "automatic", from: "call", to: "next" }, { id: "crossing", from: "from", to: "to" }], scenes: [] });
    expect(diagram.evaluateAt(0).edges[0]!.path).toMatch(/^M 250 200 L/);
    expect(diagram.diagnoseAt(0).filter(({ code }) => code === "edge-node-overlap"))
      .toEqual([expect.objectContaining({ objectId: "crossing", relatedObjectIds: ["call"] })]);
  });

  it("recomputes grouped geometry, labels and decorative lines across resize, emphasis and visibility", () => {
    const diagram = createDiagram({ version: 1, viewport: { width: 500, height: 500 }, nodes: [
      { id: "group", kind: "group", x: 10, y: 20, width: 400, height: 400 },
      { id: "call", kind: "predefinedProcess", parentId: "group", x: 100, y: 100, width: 60, height: 80, label: "A" }
    ], edges: [], scenes: [{ id: "change", label: "Change", beats: [
      { durationMs: 1000, actions: [] },
      { durationMs: 1000, transitionMs: 1000, actions: [
        { type: "updateNode", target: "group", value: { x: 30, y: 40 } },
        { type: "updateNode", target: "call", value: { width: 100, height: 120, label: "One\nTwo", fill: "#123456" } },
        { type: "highlight", target: "call" }
      ] },
      { durationMs: 1000, transitionMs: 1000, actions: [{ type: "hide", target: "group" }] }
    ] }] });
    expect(diagram.evaluateAt(999).nodes[1]!.labelLines).toEqual(["A"]);
    expect(diagram.evaluateAt(1000).nodes[1]!.labelLines).toEqual(["O", "n", "e", "T", "w", "o"]);
    expect(diagram.evaluateAt(1500).nodes[1]).toMatchObject({ x: 120, y: 130, width: 80, height: 100, highlighted: true,
      labelBoxes: [{ text: "One", x: 160, y: 166 }, { text: "Tw", x: 160, y: 186 }, { text: "o", x: 160, y: 206 }] });
    expect(diagram.renderSvg(1500)).toContain('d="M 132 130 V 230 M 188 130 V 230"');
    expect(diagram.renderSvg(1500)).toContain('<rect x="144" y="142" width="32" height="76"');
    expect(diagram.evaluateAt(2000).nodes[1]).toMatchObject({ x: 130, y: 140, width: 100, height: 120 });
    expect(diagram.evaluateAt(2500).nodes[1]!.opacity).toBeCloseTo(0.5);
    expect(diagram.hitTest(3000, { x: 142, y: 200 })).toBeNull();
    expect(diagram.diagnoseAt(3000)).toEqual([]);
  });

});
