import { describe, expect, it } from "vitest";
import { createDiagram, measureNodeContent, DiagramValidationError, type NodeContent, type NodeContentMeasurementInput } from "../index.js";

const prose: NodeContent = { blocks: [{ type: "title", text: "Title" }, { type: "paragraph", text: "First\nLast" }] };

function evaluateContent(input: NodeContentMeasurementInput, content: NodeContent = prose, position = { x: 0, y: 0 }) {
  const measurement = measureNodeContent(input);
  const diagram = createDiagram({ version: 1, viewport: { width: 400, height: 600 },
    nodes: [{ id: "measured", kind: input.kind, ...position, width: input.width, height: measurement.height, content }],
    edges: [], scenes: [] });
  return { measurement, diagram, frame: diagram.evaluateAt(0), layout: diagram.evaluateAt(0).nodes[0]!.contentLayout! };
}

describe("node content measurement", () => {
  it("includes the last complete line box, block gap and both padding in a rectangle", () => {
    const { measurement, frame, layout, diagram } = evaluateContent({ kind: "rect", width: 240, content: prose });
    // 16 + title 27 + gap 14 + two body lines of 20 + 16.
    expect(measurement).toEqual({ height: 113, diagnostics: [] });
    expect(layout.safeArea).toEqual({ x: 16, y: 16, width: 208, height: 81 });
    expect(layout.lines.at(-1)).toMatchObject({ text: "Last", y: 91 });
    expect(frame.warnings).toEqual([]);
    expect(diagram.renderSvg()).toContain('<rect x="16" y="16" width="208" height="81"');
  });
  it.each([
    { kind: "roundedRect", height: 121, area: { x: 20, y: 20, width: 200, height: 81 } },
    { kind: "cylinder", height: 169, area: { x: 16, y: 44, width: 208, height: 81 } }
  ] as const)("reserves $kind contours around complete content", ({ kind, height, area }) => {
    const result = evaluateContent({ kind, width: 240, content: prose });
    expect(result.measurement).toEqual({ height, diagnostics: [] });
    expect(result.layout.safeArea).toEqual(area);
    expect(result.frame.warnings).toEqual([]);
  });

  it("measures authored padding, gap, inline sizes, CJK wrapping and explicit blank lines", () => {
    const content: NodeContent = { style: { padding: 10, blockGap: 8 }, blocks: [
      { type: "title", text: [{ text: "A", style: { fontSize: 30 } }, { text: "B" }], style: { fontSize: 10 } },
      { type: "paragraph", text: "中文英文", style: { fontSize: 20 } },
      { type: "paragraph", text: "x\n\nx", role: "auxiliary" }
    ] };
    const result = evaluateContent({ kind: "rect", width: 70, content }, content);
    // Padding 20, mixed title 40.5, two CJK lines 54, auxiliary 60, two gaps 16.
    expect(result.measurement).toEqual({ height: 190.5, diagnostics: [] });
    expect(result.layout.lines.map(({ text }) => text)).toEqual(["AB", "中文", "英文", "x", "", "x"]);
    expect(result.frame.warnings).toEqual([]);
  });

  it("uses the tallest explicitly supplied version without mutating frozen content", () => {
    const shorter: NodeContent = { blocks: [{ type: "paragraph", text: "Short" }] };
    const longer: NodeContent = { blocks: [{ type: "paragraph", text: "One\nTwo\nThree\nFour\nFive" }] };
    const versions = Object.freeze([freezeContent(shorter), freezeContent(prose), freezeContent(longer)]);
    const input: NodeContentMeasurementInput = { kind: "rect", width: 240, content: versions };
    const before = JSON.stringify(input);
    expect(measureNodeContent(input)).toEqual({ height: 132, diagnostics: [] });
    expect(measureNodeContent(input)).toEqual(measureNodeContent(input));
    expect(JSON.stringify(input)).toBe(before);
    for (const content of versions) expect(evaluateContent(input, content).frame.warnings).toEqual([]);
  });

  it.each(["rect", "roundedRect", "cylinder"] as const)("returns a usable positive height for empty %s content", (kind) => {
    const content: NodeContent = { style: { padding: 0 }, blocks: [] };
    const result = evaluateContent({ kind, width: 1, content }, content);
    expect(result.measurement.height).toBeGreaterThan(0);
    expect(Number.isFinite(result.measurement.height)).toBe(true);
    expect(result.frame.warnings).toEqual([]);
  });

  it("preserves every version's width and graph-internal height diagnostics with source positions", () => {
    const narrow: NodeContent = { style: { padding: 0 }, blocks: [{ type: "paragraph", text: "W" }] };
    const graph: NodeContent = { style: { padding: 0 }, blocks: [
      { type: "graph", height: 40, nodes: [{ id: "outside", label: "A", x: 0, y: 0 }], edges: [] }
    ] };
    const input: NodeContentMeasurementInput = { kind: "rect", width: 1, content: [narrow, graph] };
    expect(measureNodeContent(input)).toEqual({ height: 40, diagnostics: [
      expect.objectContaining({ versionIndex: 0, path: "content[0].blocks[0]", dimension: "width" }),
      expect.objectContaining({ versionIndex: 1, path: "content[1].blocks[0]", dimension: "width" }),
      expect.objectContaining({ versionIndex: 1, path: "content[1].blocks[0]", dimension: "height" })
    ] });
    expect(evaluateContent(input, narrow).frame.warnings.map(({ message }) => message)).toEqual([
      'content for node "measured" exceeds its width'
    ]);
    expect(evaluateContent(input, graph).frame.warnings.map(({ message }) => message)).toEqual([
      'content for node "measured" exceeds its width', 'content for node "measured" exceeds its height'
    ]);
  });

  it("includes numbered entries, wrapped pill backgrounds, status and auxiliary spacing", () => {
    const content: NodeContent = { blocks: [{ type: "list", marker: "number", style: { itemGap: 5, tagGap: 6 }, items: [
      { tags: [{ text: "AAA", style: { shape: "pill", fontSize: 20 } }], status: "Ready", body: "First\nLast", auxiliary: "Hint" },
      { tags: [{ text: "AAAAA" }, { text: "BBBBB" }], body: "Next" }
    ] }] };
    const result = evaluateContent({ kind: "rect", width: 136.8, content }, content);
    // 32 padding + (31 tag + 20 status + 40 body + 20 auxiliary) + 5 gap + (54 tags + 20 body).
    expect(result.measurement).toEqual({ height: 222, diagnostics: [] });
    expect(result.layout.tags.map(({ height }) => height)).toEqual([31, 24, 24]);
    expect(result.layout.lines.filter(({ role }) => role === "marker").map(({ text }) => text)).toEqual(["1.", "2."]);
    expect(result.frame.warnings).toEqual([]);
    expect(result.diagram.renderSvg()).toContain('rx="15.5"');
  });

  it("reserves fixed graph height before the following text", () => {
    const content: NodeContent = { blocks: [
      { type: "graph", height: 80, nodes: [{ id: "a", label: "Entity", x: 100, y: 40 }], edges: [] },
      { type: "paragraph", text: "After graph" }
    ] };
    const result = evaluateContent({ kind: "rect", width: 240, content }, content);
    expect(result.measurement).toEqual({ height: 146, diagnostics: [] });
    expect(result.layout.lines.at(-1)).toMatchObject({ text: "After graph", y: 124 });
    expect(result.frame.warnings).toEqual([]);
  });

  it.each([
    { value: null, path: "$" },
    { value: [], path: "$" },
    { value: { kind: "rect", width: 0, content: prose }, path: "width" },
    { value: { kind: "rect", width: -1, content: prose }, path: "width" },
    { value: { kind: "rect", width: NaN, content: prose }, path: "width" },
    { value: { kind: "rect", width: Infinity, content: prose }, path: "width" },
    { value: { kind: "rect", width: "240", content: prose }, path: "width" },
    { value: { kind: "ellipse", width: 240, content: prose }, path: "kind" },
    { value: { kind: "rect", width: 240, content: [] }, path: "content" },
    { value: { kind: "rect", width: 240, content: new Array(1) }, path: "content[0]" },
    { value: { kind: "rect", width: 240, content: { blocks: [{ type: "paragraph", text: 5 }] } }, path: "content[0].blocks[0].text" },
    { value: { kind: "rect", width: 240, content: [{ blocks: [] }, { blocks: [], style: { padding: -1 } }] }, path: "content[1].style.padding" },
    { value: { kind: "rect", width: 240, content: { blocks: [] }, minHeight: 10 }, path: "minHeight" }
  ])("rejects invalid measurement input at $path", ({ value, path }) => {
    expect(validationIssues(value)).toContainEqual(expect.objectContaining({ path }));
  });

  it.each([0.1, 14.1, 20.1, 23.7, 1000.01])("fits fractional line boxes at font size %s", (fontSize) => {
    const content: NodeContent = { style: { padding: 0.1, blockGap: 0.3 }, blocks: [
      { type: "paragraph", text: "A\nB\nC", style: { fontSize } },
      { type: "paragraph", text: "D\nE\nF", style: { fontSize } }
    ] };
    for (const kind of ["rect", "roundedRect", "cylinder"] as const) {
      const result = evaluateContent({ kind, width: 2000, content }, content);
      expect(result.measurement.diagnostics).toEqual([]);
      expect(result.layout.heightOverflow).toBe(false);
      expect(result.frame.warnings).toEqual([]);
    }
  });

  it("keeps finite extreme widths and tiny safe areas usable", () => {
    for (const width of [Number.MIN_VALUE, Number.MAX_VALUE]) {
      const result = measureNodeContent({ kind: "rect", width, content: { blocks: [{ type: "paragraph", text: "W" }] } });
      expect(result.height).toBe(52);
      expect(result.diagnostics.map(({ dimension }) => dimension)).toEqual(width === Number.MIN_VALUE ? ["width"] : []);
    }
  });

  it.each([13.1, 1000.1, -10.7])("keeps complete fractional line boxes at authored y=%s", (y) => {
    const content: NodeContent = { style: { padding: 0.1, blockGap: 0.3 }, blocks: [
      { type: "paragraph", text: "A\nB\nC\nD\nE", style: { fontSize: 23.7 } },
      { type: "paragraph", text: "F\nG", style: { fontSize: 20.1 } }
    ] };
    for (const kind of ["rect", "roundedRect", "cylinder"] as const) {
      const result = evaluateContent({ kind, width: 240, content }, content, { x: 13.1, y });
      expect(result.layout.heightOverflow).toBe(false);
      expect(result.frame.warnings).toEqual([]);
    }
  });

  it("does not report floating-point accumulation as lost final-line space", () => {
    const content: NodeContent = { style: { padding: 0.1 }, blocks: [
      { type: "paragraph", text: Array.from({ length: 13 }, () => "A").join("\n"), style: { fontSize: 15.1 } }
    ] };
    const result = evaluateContent({ kind: "rect", width: 240, content }, content, { x: 13.1, y: 13.1 });
    // Thirteen complete 20.385-unit line boxes and two 0.1-unit insets.
    expect(result.measurement.height).toBeCloseTo(265.205, 12);
    expect(result.frame.warnings).toEqual([]);
  });

  it("keeps a graph exactly within its own block at fractional positions", () => {
    const content: NodeContent = { style: { padding: 0.1 }, blocks: [
      { type: "graph", height: 27, nodes: [{ id: "a", label: "A", x: 60, y: 23 }], edges: [] }
    ] };
    const result = evaluateContent({ kind: "rect", width: 240, content }, content, { x: 13.1, y: 13.1 });
    expect(result.measurement.diagnostics).toEqual([]);
    expect(result.frame.warnings).toEqual([]);
  });

  it("measures a large valid version collection without a function-argument limit", () => {
    const empty: NodeContent = { blocks: [] };
    const versions = Object.freeze(Array.from({ length: 130_000 }, () => empty));
    expect(measureNodeContent({ kind: "rect", width: 240, content: versions })).toEqual({ height: 32, diagnostics: [] });
  });

  it.each([0.1, 0.3, 0.6])("keeps a graph label at the block top when authored y=%s", (y) => {
    const content: NodeContent = { style: { padding: 0.1 }, blocks: [
      { type: "graph", height: 40, nodes: [{ id: "a", label: "A", x: 20, y: 23 }], edges: [] }
    ] };
    const result = evaluateContent({ kind: "rect", width: 100, content }, content, { x: 0, y });
    expect(result.measurement).toEqual({ height: 40.2, diagnostics: [] });
    expect(result.frame.warnings).toEqual([]);
    expect(result.layout.lines[0]!.y - result.layout.lines[0]!.fontSize).toBeCloseTo(result.layout.safeArea.y, 12);
    expect(result.diagram.renderSvg()).toContain('data-content-id="measured"');
  });

  it("returns every overflow diagnostic for a large valid content block collection", () => {
    const content: NodeContent = { blocks: Array.from({ length: 130_000 }, () => ({ type: "paragraph", text: "W" })) };
    const result = measureNodeContent({ kind: "rect", width: 1, content });
    // 130000 complete 20-unit lines, 129999 14-unit block gaps and two 16-unit insets.
    expect(result.height).toBe(4_420_018);
    expect(result.diagnostics).toHaveLength(130_000);
    expect(result.diagnostics[0]).toMatchObject({ versionIndex: 0, path: "content[0].blocks[0]", dimension: "width" });
    expect(result.diagnostics.at(-1)).toMatchObject({ versionIndex: 0, path: "content[0].blocks[129999]", dimension: "width" });
  });

  it.each([
    { style: { padding: Number.MAX_VALUE }, blocks: [] },
    { blocks: [{ type: "paragraph", text: "W", style: { fontSize: Number.MAX_VALUE } }] }
  ])("rejects finite source values whose required height is non-finite", (content) => {
    expect(validationIssues({ kind: "rect", width: 240, content })).toEqual([
      { path: "content[0]", message: "required node height must be finite" }
    ]);
  });

  it("reports each unrepresentable content version after finite graph and gap values overflow", () => {
    const graphContent: NodeContent = { blocks: [
      { type: "graph", height: Number.MAX_VALUE, nodes: [], edges: [] },
      { type: "graph", height: Number.MAX_VALUE, nodes: [], edges: [] }
    ] };
    const gapContent: NodeContent = { style: { blockGap: Number.MAX_VALUE }, blocks: [
      { type: "paragraph", text: "A" }, { type: "paragraph", text: "B" }, { type: "paragraph", text: "C" }
    ] };
    const content = Object.freeze([prose, freezeContent(graphContent), prose, freezeContent(gapContent)]);
    const before = JSON.stringify(content);
    expect(validationIssues({ kind: "rect", width: 240, content })).toEqual([
      { path: "content[1]", message: "required node height must be finite" },
      { path: "content[3]", message: "required node height must be finite" }
    ]);
    expect(JSON.stringify(content)).toBe(before);
  });

  it.each(["rect", "roundedRect", "cylinder"] as const)("preserves representable extreme %s heights", (kind) => {
    const content: NodeContent = { style: { padding: 0 }, blocks: [
      { type: "paragraph", text: "A", style: { fontSize: 1e300 } }
    ] };
    const result = evaluateContent({ kind, width: Number.MAX_VALUE, content }, content);
    expect(result.measurement.height / 1e300).toBeCloseTo(1.35, 12);
    expect(Number.isFinite(result.measurement.height)).toBe(true);
    expect(result.measurement.diagnostics).toEqual([]);
    expect(result.frame.warnings).toEqual([]);
  });

});

function freezeContent<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    Object.values(value).forEach(freezeContent);
    Object.freeze(value);
  }
  return value;
}

function validationIssues(value: unknown) {
  try {
    Reflect.apply(measureNodeContent, undefined, [value]);
  } catch (error) {
    expect(error).toBeInstanceOf(DiagramValidationError);
    if (error instanceof DiagramValidationError) return error.issues;
    throw error;
  }
  throw new Error("Expected invalid measurement input to be rejected");
}
