import { describe, expect, it } from "vitest";
import { createDiagram, measureNodeLabel, DiagramValidationError, validateDocument, type DiagramDocument } from "../index.js";

function reportDocument(): DiagramDocument {
  return { version: 1, viewport: { width: 500, height: 400 }, nodes: [
    { id: "report", kind: "document", x: 100, y: 100, width: 200, height: 120, label: "Report" }
  ], edges: [], scenes: [] };
}

describe("document preset", () => {
  it("centers plain report labels above the bounded wave band", () => {
    const source = reportDocument();
    expect(validateDocument(source)).toEqual([]);
    const diagram = createDiagram(source);
    expect(diagram.evaluateAt(0).nodes[0]!.labelBoxes[0]).toMatchObject({ x: 200, y: 154 });
    expect(diagram.renderSvg()).toContain('<rect x="112" y="112" width="176" height="72"');
    expect(diagram.evaluateAt(0).warnings).toEqual([]);
  });
  it("recognizes filled lobes and empty wave notches for hits and crossing diagnostics", () => {
    const source = reportDocument();
    const diagram = createDiagram(source);
    expect(diagram.hitTest(0, { x: 150, y: 216 })).toEqual({ id: "report", type: "node" });
    expect(diagram.hitTest(0, { x: 250, y: 216 })).toBeNull();
    const cross = (x: number, style = {}) => createDiagram({ ...source, nodes: [
      { ...source.nodes[0]!, label: "", style },
      { id: "a", kind: "rect", x: x - 12, y: 210, width: 2, height: 2 },
      { id: "b", kind: "rect", x: x + 10, y: 210, width: 2, height: 2 }
    ], edges: [{ id: "crossing", from: "a", to: "b" }] });
    expect(cross(150).diagnoseAt(0)).toContainEqual(expect.objectContaining({ code: "edge-node-overlap", relatedObjectIds: ["report"] }));
    expect(cross(250).diagnoseAt(0)).toEqual([]);
    expect(cross(150, { fill: "#00000000" }).diagnoseAt(0)).toEqual([]);
    expect(cross(250, { fill: "#00000000" }).diagnoseAt(0)).toEqual([]);
  });
  it("measures frozen report versions with both branches of the wave-band inverse", () => {
    const labels = Object.freeze(["A", "A\nB", "A\nB\nC"]);
    const input = Object.freeze({ kind: "document", width: 200, label: labels });
    expect(measureNodeLabel(input)).toEqual({ height: 108, diagnostics: [] });
    expect(measureNodeLabel({ kind: "document", width: 200, label: "" })).toEqual({ height: 32, diagnostics: [] });
    for (const [font, expected] of [[38, 95.33333333333333], [38.4, 96], [40, 98]]) {
      const measured = measureNodeLabel({ kind: "document", width: 200, label: "A", typography: { nodeLabel: font } });
      expect(measured.height).toBeCloseTo(expected!, 10);
      const diagram = createDiagram({ ...reportDocument(), typography: { nodeLabel: font }, nodes: [
        { ...reportDocument().nodes[0]!, label: "A", height: measured.height }
      ] });
      expect(diagram.evaluateAt(0).warnings).toEqual([]);
    }
    for (const label of labels) {
      const diagram = createDiagram({ ...reportDocument(), nodes: [{ ...reportDocument().nodes[0]!, label, height: measureNodeLabel(input).height }] });
      expect(diagram.evaluateAt(0).warnings).toEqual([]);
    }
    expect(labels).toEqual(["A", "A\nB", "A\nB\nC"]);
  });
  it.each(["straight", "orthogonal", "curved"] as const)("attaches all %s ports to the current document contour", (route) => {
    const expected = { top: "200 100", right: "300 160", bottom: "200 208", left: "100 160" };
    for (const side of ["top", "right", "bottom", "left"] as const) {
      const source = reportDocument();
      const diagram = createDiagram({ ...source, nodes: [...source.nodes,
        { id: "from", kind: "rect", x: 20, y: 20, width: 20, height: 20 }
      ], edges: [{ id: "edge", from: "from", to: "report", route, toPort: side }] });
      expect(diagram.evaluateAt(0).edges[0]!.path).toMatch(new RegExp(`${expected[side]}$`));
    }
    if (route === "straight") return;
    const source = reportDocument();
    const diagram = createDiagram({ ...source, nodes: [...source.nodes,
      { id: "a", kind: "rect", x: 100, y: 300, width: 20, height: 20 },
      { id: "b", kind: "rect", x: 300, y: 300, width: 20, height: 20 }
    ], edges: [{ id: "a-report", from: "a", to: "report", route, toPort: "bottom" },
      { id: "b-report", from: "b", to: "report", route, toPort: "bottom" }] });
    expect(diagram.evaluateAt(0).edges.map(({ path }) => path.split(" ").slice(-2).join(" "))).toEqual(["188 212.417", "212 203.583"]);
  });

  it("recomputes grouped wave clearance and label layout during movement and resizing", () => {
    const diagram = createDiagram({ ...reportDocument(), nodes: [
      { id: "group", kind: "group", x: 10, y: 20, width: 400, height: 350 },
      { ...reportDocument().nodes[0]!, parentId: "group" }
    ], scenes: [{ id: "change", label: "Report", beats: [
      { durationMs: 1000, actions: [] },
      { durationMs: 1000, transitionMs: 1000, actions: [
        { type: "updateNode", target: "group", value: { x: 30, y: 40 } },
        { type: "updateNode", target: "report", value: { width: 240, height: 160, label: "One\nTwo", fill: "#123456" } },
        { type: "highlight", target: "report" }
      ] },
      { durationMs: 1000, actions: [{ type: "hide", target: "report" }] }
    ] }] });
    expect(diagram.evaluateAt(999).nodes[1]!.labelLines).toEqual(["Report"]);
    expect(diagram.evaluateAt(1000).nodes[1]!.labelLines).toEqual(["One", "Two"]);
    expect(diagram.evaluateAt(1500).nodes[1]).toMatchObject({ x: 120, y: 130, width: 220, height: 140, highlighted: true,
      labelBoxes: [{ text: "One", x: 230, y: 184 }, { text: "Two", x: 230, y: 204 }] });
    expect(diagram.renderSvg(1500)).toContain('<rect x="132" y="142" width="196" height="92"');
    expect(diagram.evaluateAt(2000).nodes[1]).toMatchObject({ x: 130, y: 140, width: 240, height: 160 });
    expect(diagram.hitTest(3000, { x: 200, y: 180 })).toEqual({ id: "group", type: "node" });
  });

  it("preserves graphemes and blank lines while clipping safe-area overflow", () => {
    const diagram = createDiagram({ ...reportDocument(), nodes: [
      { ...reportDocument().nodes[0]!, width: 92, height: 50, label: "ABCDEFGHIKL\n\n中文\n👩‍💻" },
      { id: "narrow", kind: "document", x: 350, y: 20, width: 1, height: 1, label: "é" }
    ] });
    expect(diagram.evaluateAt(0).nodes[0]!.labelLines).toEqual(["ABCDEFGH", "IKL", "", "中文", "👩‍💻"]);
    expect(diagram.evaluateAt(0).nodes[1]!.labelLines).toEqual(["é"]);
    expect(diagram.evaluateAt(0).warnings).toContainEqual(expect.objectContaining({ objectId: "report", code: "text-overflow" }));
    expect(diagram.renderSvg()).toContain('font-size="16"');
    expect(diagram.renderSvg()).not.toContain("…");
    expect(diagram.hitTest(0, { x: 140, y: 230 })).toBeNull();
    expect(measureNodeLabel({ kind: "document", width: 1, label: ["👩‍💻", "", "é"] })).toEqual({ height: 58.666666666666664,
      diagnostics: [expect.objectContaining({ versionIndex: 0, dimension: "width" }), expect.objectContaining({ versionIndex: 2, dimension: "width" })] });
  });

  it("rejects structured content and invalid dimensions while allowing explicit clearing and tiny empty labels", () => {
    const source = reportDocument();
    expect(validateDocument({ ...source, nodes: [{ ...source.nodes[0]!, label: undefined, content: { blocks: [] } }] }))
      .toContainEqual(expect.objectContaining({ path: "nodes[0].content" }));
    const scene = (content: unknown) => ({ ...source, scenes: [{ id: "update", label: "Report", beats: [
      { durationMs: 1000, actions: [{ type: "updateNode", target: "report", value: { content } }] }
    ] }] });
    expect(validateDocument(scene({ blocks: [] }))).toContainEqual(expect.objectContaining({ path: "scenes[0].beats[0].actions[0].value.content" }));
    expect(validateDocument(scene(null))).toEqual([]);
    for (const width of [0, -1, Infinity, NaN]) {
      expect(() => measureNodeLabel({ kind: "document", width, label: "A" })).toThrow(DiagramValidationError);
      expect(validateDocument({ ...source, nodes: [{ ...source.nodes[0]!, width }] }).length).toBeGreaterThan(0);
    }
    expect(() => measureNodeLabel({ kind: "document", width: 200, label: [] })).toThrow(DiagramValidationError);
    expect(() => measureNodeLabel({ kind: "document", width: 1e308, typography: { nodeLabel: 1e307 }, label: "A\n".repeat(20) })).toThrow(DiagramValidationError);
    const tiny = createDiagram({ ...source, nodes: [{ ...source.nodes[0]!, label: "", width: 1, height: 1 }] });
    expect(tiny.evaluateAt(0).warnings).toEqual([]);
    expect(tiny.renderSvg()).not.toMatch(/NaN|Infinity|(?:width|height)="-/);
  });
  it("distinguishes visible label paint and hollow wave strokes from empty notches", () => {
    const labelAt = (x: number) => createDiagram({ ...reportDocument(), nodes: [
      { ...reportDocument().nodes[0]!, label: "", style: { stroke: "#0000" } },
      { id: "label", kind: "rect", x: x - 4, y: 205, width: 8, height: 10, label: "A", style: { fill: "#0000", stroke: "#0000" } }
    ] });
    expect(labelAt(150).diagnoseAt(0)).toContainEqual(expect.objectContaining({ code: "label-node-overlap", relatedObjectIds: ["report"] }));
    expect(labelAt(250).diagnoseAt(0)).toEqual([]);
    const stroke = createDiagram({ ...reportDocument(), nodes: [
      { ...reportDocument().nodes[0]!, label: "", style: { fill: "#0000", strokeWidth: 2 } },
      { id: "a", kind: "rect", x: 140, y: 217, width: 2, height: 2 },
      { id: "b", kind: "rect", x: 158, y: 217, width: 2, height: 2 }
    ], edges: [{ id: "wave", from: "a", to: "b" }] });
    expect(stroke.diagnoseAt(0)).toContainEqual(expect.objectContaining({ code: "edge-node-overlap", relatedObjectIds: ["report"] }));
  });
  it.each([[92, 45, "180.5"], [96, 48, "184"], [96.5, 48.5, "184.5"], [100, 52, "188"]] as const)(
    "bounds the wave and label area at height %s", (height, safeHeight, bottom) => {
      const source = reportDocument();
      const diagram = createDiagram({ ...source, nodes: [{ ...source.nodes[0]!, height, label: "A" },
        { id: "next", kind: "rect", x: 180, y: 300, width: 40, height: 40 }
      ], edges: [{ id: "auto", from: "report", to: "next" }] });
      expect(diagram.renderSvg()).toContain(`<rect x="112" y="112" width="176" height="${safeHeight}"`);
      expect(diagram.evaluateAt(0).edges[0]!.path).toBe(`M 200 ${bottom} L 200 300`);
    });
});
