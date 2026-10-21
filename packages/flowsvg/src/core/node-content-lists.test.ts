import { describe, expect, it } from "vitest";
import { createDiagram, validateDocument, type ContentBlock, type DiagramDocument } from "../index.js";

const listDocument = (blocks: ContentBlock[], width = 220, height = 400): DiagramDocument => ({
  version: 1, viewport: { width: 300, height: 500 },
  nodes: [{ id: "records", kind: "rect", x: 10, y: 20, width, height, content: { blocks } }],
  edges: [], scenes: []
});

describe("node-content lists", () => {
  it("lays out unmarked records with optional body and muted auxiliary text", () => {
    const document = listDocument([{ type: "list", items: [
      { body: "First record", auxiliary: "2026-10-17" },
      { auxiliary: "Auxiliary only" },
      {},
      { body: [{ text: "Last ", style: { fontWeight: 700 } }, { text: "record" }] }
    ] }]);
    expect(validateDocument(document)).toEqual([]);
    const diagram = createDiagram(document);
    const lines = diagram.evaluateAt(0).nodes[0]!.contentLayout!.lines;
    expect(lines.map(({ text, x, y, role, itemIndex }) => ({ text, x, y, role, itemIndex }))).toEqual([
      { text: "First record", x: 26, y: 50, role: "body", itemIndex: 0 },
      { text: "2026-10-17", x: 26, y: 68, role: "auxiliary", itemIndex: 0 },
      { text: "Auxiliary only", x: 26, y: 100, role: "auxiliary", itemIndex: 1 },
      { text: "Last record", x: 26, y: 134, role: "body", itemIndex: 3 }
    ]);
    expect(lines[1]).toMatchObject({ fontSize: 12, color: "#5a6473" });
    expect(lines[3]!.spans[0]).toMatchObject({ fontWeight: 700 });
    expect(diagram.renderSvg()).toContain("2026-10-17");
  });
  it.each(["bullet", "number"] as const)("aligns %s continuations with the body and markers with the first baseline", (marker) => {
    const diagram = createDiagram(listDocument([{ type: "list", marker, items: Array.from({ length: 10 }, (_, index) => ({
      body: index === 0 ? "alpha beta gamma delta" : `Step ${index + 1}`
    })) }], 132));
    const lines = diagram.evaluateAt(0).nodes[0]!.contentLayout!.lines;
    const body = lines.filter((line) => line.role === "body");
    const markers = lines.filter((line) => line.role === "marker");
    expect(markers.map(({ text }) => text)).toEqual(marker === "bullet" ? Array(10).fill("•") : ["1.", "2.", "3.", "4.", "5.", "6.", "7.", "8.", "9.", "10."]);
    expect(body.filter(({ itemIndex }) => itemIndex === 0).length).toBeGreaterThan(1);
    expect(new Set(body.map(({ x }) => x)).size).toBe(1);
    expect(body[0]!.x).toBeCloseTo(marker === "bullet" ? 42.4 : 59.2);
    expect(markers[0]!.y).toBe(body[0]!.y);
    expect(markers.at(-1)!.x + markers.at(-1)!.width).toBeLessThan(body[0]!.x);
    expect(diagram.renderSvg()).toContain(marker === "bullet" ? "•" : "10.");
  });

  it("keeps marked text inside the safe area when every source span is smaller than the marker", () => {
    const diagram = createDiagram(listDocument([{ type: "list", marker: "bullet", items: [{ body: [{ text: "Small", style: { fontSize: 8 } }] }] }]));
    const layout = diagram.evaluateAt(0).nodes[0]!.contentLayout!;
    const [marker, body] = layout.lines;
    expect(marker!.y).toBe(body!.y);
    expect(marker!.y - marker!.fontSize).toBeGreaterThanOrEqual(layout.safeArea.y);
  });

  it("uses item spacing and controlled typography without reserving absent item parts", () => {
    const diagram = createDiagram(listDocument([{ type: "list", marker: "none", style: { itemGap: 7, fontSize: 16, color: "#123abc" }, items: [
      { body: "One", style: { fontSize: undefined, fontWeight: 700 } },
      {},
      { auxiliary: "Date", auxiliaryStyle: { align: "right", color: "#aabbcc" } },
      { body: "\n👩🏽‍💻" }
    ] }]));
    const lines = diagram.evaluateAt(0).nodes[0]!.contentLayout!.lines;
    expect(lines.map(({ text }) => text)).toEqual(["One", "Date", "", "👩🏽‍💻"]);
    expect(lines[0]).toMatchObject({ fontSize: 16, fontWeight: 700, y: 52, color: "#123abc" });
    expect(lines[1]).toMatchObject({ fontSize: 12, x: 214, y: 76.6, align: "right", color: "#aabbcc" });
    expect(lines[3]!.spans).toHaveLength(1);
    expect(createDiagram(listDocument([])).evaluateAt(0).nodes[0]!.contentLayout!.lines).toEqual([]);
  });

  it("clips lists in fixed tiny nodes, reports both overflow directions and escapes text", () => {
    const diagram = createDiagram(listDocument([{ type: "list", marker: "number", items: [{ body: "<x>👩🏽‍💻", auxiliary: "date" }] }], 20, 20));
    const frame = diagram.evaluateAt(0);
    expect(frame.nodes[0]).toMatchObject({ width: 20, height: 20 });
    expect(frame.nodes[0]!.contentLayout).toMatchObject({ widthOverflow: true, heightOverflow: true });
    expect(frame.warnings.map(({ message }) => message)).toEqual(['content for node "records" exceeds its width', 'content for node "records" exceeds its height']);
    const svg = diagram.renderSvg();
    expect(svg).toContain('clip-path="url(#');
    expect(svg).not.toContain("<x>");
    expect(svg).toContain("&lt;");
    expect(svg).not.toMatch(/NaN|Infinity/);
    expect(diagram.hitTest(0, { x: 50, y: 50 })).toBeNull();
    expect(diagram.evaluateAt(0)).toEqual(frame);
  });

  it.each([
    { block: { type: "list", marker: "decimal", items: [] }, suffix: "marker" },
    { block: { type: "list", items: "rows" }, suffix: "items" },
    { block: { type: "list", items: new Array(1) }, suffix: "items[0]" },
    { block: { type: "list", items: [{ body: 42 }] }, suffix: "items[0].body" },
    { block: { type: "list", items: [{ auxiliary: [{ text: false }] }] }, suffix: "items[0].auxiliary[0].text" },
    { block: { type: "list", items: [{ auxiliaryStyle: { fontSize: 0 } }] }, suffix: "items[0].auxiliaryStyle.fontSize" },
    { block: { type: "list", items: [{ href: "https://example.test" }] }, suffix: "items[0].href" },
    { block: { type: "list", items: [], style: { itemGap: -1 } }, suffix: "style.itemGap" },
    { block: { type: "list", items: [], style: { itemGap: Infinity } }, suffix: "style.itemGap" },
    { block: { type: "list", items: [], style: { css: "bad" } }, suffix: "style.css" }
  ])("rejects invalid list values at the exact path: $suffix", ({ block, suffix }) => {
    const document = listDocument([]);
    const malformed = { ...document, nodes: [{ ...document.nodes[0], content: { blocks: [block] } }] };
    expect(validateDocument(malformed)).toContainEqual(expect.objectContaining({ path: `nodes[0].content.blocks[0].${suffix}` }));
  });

  it("includes all available content blocks in invalid-type diagnostics", () => {
    const document = listDocument([]);
    const malformed = { ...document, nodes: [{ ...document.nodes[0], content: { blocks: [{ type: "table", text: "text" }] } }] };
    expect(validateDocument(malformed)).toContainEqual({ path: "nodes[0].content.blocks[0].type", message: "must be title, paragraph, list or graph" });
  });

  it("reports insufficient body-column width even when right-aligned text still fits the full clip", () => {
    const diagram = createDiagram(listDocument([{ type: "list", marker: "bullet", items: [{
      body: [{ text: "👩🏽‍💻", style: { fontSize: 95 } }], style: { align: "right" }
    }] }], 132));
    expect(diagram.evaluateAt(0).nodes[0]!.contentLayout!.widthOverflow).toBe(true);
    expect(diagram.evaluateAt(0).warnings).toContainEqual(expect.objectContaining({ objectId: "records", message: 'content for node "records" exceeds its width' }));
  });

});
