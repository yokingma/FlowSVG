import { describe, expect, it } from "vitest";
import { createDiagram, validateDocument, type DiagramDocument } from "../index.js";

const documentWithText = (text: unknown, width = 232): unknown => ({
  version: 1, viewport: { width: 400, height: 400 },
  nodes: [{ id: "text", kind: "rect", x: 0, y: 0, width, height: 360,
    content: { blocks: [{ type: "paragraph", text }] } }],
  edges: [], scenes: []

});

function diagramWithText(text: unknown, width?: number) {
  const document = documentWithText(text, width);
  expect(validateDocument(document)).toEqual([]);
  return createDiagram(document as DiagramDocument);
}

describe("styled node-content text", () => {
  it("lays out mixed sizes on one baseline and exports each span's controlled appearance", () => {
    const diagram = diagramWithText([
      { text: "Order ", style: { fontSize: 24, fontWeight: 700 } },
      { text: "2026", style: { fontSize: 12, color: "#345abc" } }
    ]);
    const line = diagram.evaluateAt(0).nodes[0]!.contentLayout!.lines[0]!;
    expect(line.text).toBe("Order 2026");
    expect(line.fontSize).toBe(24);
    expect(line.spans).toEqual([
      expect.objectContaining({ text: "Order ", x: 16, y: 40, fontSize: 24, fontWeight: 700 }),
      expect.objectContaining({ text: "2026", y: 40, fontSize: 12, fontWeight: 400, color: "#345abc" })
    ]);
    expect(line.spans[1]!.x).toBeGreaterThan(line.spans[0]!.x);
    expect(diagram.renderSvg()).toContain('font-size="12" font-weight="400"');
    expect(diagram.renderSvg()).toContain('fill="#345abc"');
  });
  it("keeps complete Unicode graphemes together even when a source span ends inside a cluster", () => {
    const clusters = ["e\u0301", "👩🏽‍💻", "👨‍👩‍👧‍👦", "🇨🇳", "1️⃣", "🏴\u{e0067}\u{e0062}\u{e007f}"];
    for (const cluster of clusters) {
      const codePoints = Array.from(cluster);
      const diagram = diagramWithText([
        { text: codePoints[0]!, style: { fontWeight: 700 } },
        { text: codePoints.slice(1).join("") + "A" }
      ], 33);
      const layout = diagram.evaluateAt(0).nodes[0]!.contentLayout!;
      expect(layout.lines.map(({ text }) => text)).toEqual([cluster, "A"]);
      expect(layout.lines[0]!.spans.map(({ text }) => text)).toEqual([cluster]);
      expect(diagram.renderSvg()).toContain(cluster);
      expect(layout.widthOverflow).toBe(true);
    }
  });
  it("uses each actual line's largest font and joins source boundaries before processing newlines", () => {
    const diagram = diagramWithText([
      { text: "Large", style: { fontSize: 30 } },
      { text: "\r", style: { fontSize: 10 } },
      { text: "\n\nsmall", style: { fontSize: 10 } }
    ]);
    const lines = diagram.evaluateAt(0).nodes[0]!.contentLayout!.lines;
    expect(lines.map(({ text }) => text)).toEqual(["Large", "", "small"]);
    expect(lines[0]).toMatchObject({ fontSize: 30, y: 46 });
    expect(lines[2]).toMatchObject({ fontSize: 10, y: 86.5 });
    expect(lines[2]!.spans[0]!.y).toBe(lines[2]!.y);
  });

  it("wraps continuous styled words, English spaces, CJK and long URLs without dropping text", () => {
    const styled = diagramWithText([{ text: "al", style: { color: "#aabbcc" } }, { text: "pha beta" }], 92);
    expect(styled.evaluateAt(0).nodes[0]!.contentLayout!.lines.map(({ text }) => text)).toEqual(["alpha", "beta"]);
    const chinese = diagramWithText([{ text: "中文换行测试" }], 60);
    expect(chinese.evaluateAt(0).nodes[0]!.contentLayout!.lines.map(({ text }) => text)).toEqual(["中文", "换行", "测试"]);
    const url = "https://example.test/verylongword";
    const diagram = diagramWithText([{ text: url }], 74);
    const lines = diagram.evaluateAt(0).nodes[0]!.contentLayout!.lines;
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.map(({ text }) => text).join("")).toBe(url);
    expect(lines.every(({ width }) => width <= 42)).toBe(true);
    expect(diagram.evaluateAt(0)).toEqual(diagram.evaluateAt(0));
  });

  it.each([
    { text: [null], path: "text[0]" },
    { text: new Array(1), path: "text[0]" },
    { text: [{ text: 5 }], path: "text[0].text" },
    { text: [{ text: "A", id: "internal" }], path: "text[0].id" },
    { text: [{ text: "A", style: [] }], path: "text[0].style" },
    { text: [{ text: "A", style: { fontSize: 0 } }], path: "text[0].style.fontSize" },
    { text: [{ text: "A", style: { fontSize: Infinity } }], path: "text[0].style.fontSize" },
    { text: [{ text: "A", style: { fontWeight: 901 } }], path: "text[0].style.fontWeight" },
    { text: [{ text: "A", style: { color: "url(script)" } }], path: "text[0].style.color" },
    { text: [{ text: "A", style: { align: "left" } }], path: "text[0].style.align" },
    { text: [{ text: "A", style: { css: "bad" } }], path: "text[0].style.css" }
  ])("rejects malformed source spans at the exact field: $path", ({ text, path }) => {
    expect(validateDocument(documentWithText(text))).toContainEqual(expect.objectContaining({ path: `nodes[0].content.blocks[0].${path}` }));
  });

  it("escapes styled source text, preserves author colors in both themes, and accepts empty spans", () => {
    const diagram = diagramWithText([{ text: '<script>&"', style: { color: "#abcdef" } }]);
    const svg = diagram.renderSvg();
    expect(svg).toContain("&lt;script&gt;&amp;");
    expect(svg).not.toContain("<script>");
    for (const theme of ["light", "dark"] as const) {
      expect(diagram.evaluateAt(0, { theme }).nodes[0]!.contentLayout!.lines[0]!.spans[0]).toMatchObject({ color: "#abcdef", explicitColor: true });
    }
    expect(diagramWithText([]).evaluateAt(0).nodes[0]!.contentLayout!.lines[0]).toMatchObject({ text: "", spans: [] });
  });

});
