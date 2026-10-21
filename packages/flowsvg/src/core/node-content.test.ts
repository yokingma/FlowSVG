import { describe, expect, it } from "vitest";
import { createDiagram, validateDocument, type DiagramDocument, type DiagramNode } from "../index.js";

const contentDocument = (nodeOverrides: Partial<DiagramNode> = {}): DiagramDocument => ({
  version: 1,
  viewport: { width: 400, height: 400 },
  nodes: [{
    id: "service", kind: "rect", x: 20, y: 30, width: 240, height: 260,
    content: { blocks: [
      { type: "title", text: "Service" },
      { type: "paragraph", role: "auxiliary", text: "Background" },
      { type: "paragraph", text: "Handles requests" }
    ] },
    ...nodeOverrides
  }],
  edges: [], scenes: []
});

describe("node content", () => {
  it("lays out ordered titles, auxiliary text and paragraphs using usable defaults", () => {
    const diagram = createDiagram(contentDocument());
    const node = diagram.evaluateAt(0).nodes[0]!;
    expect(node.labelLines).toEqual([]);
    expect(node.contentLayout?.safeArea).toEqual({ x: 36, y: 46, width: 208, height: 228 });
    expect(node.contentLayout?.lines.map(({ text, fontSize, fontWeight, x, role }) => ({ text, fontSize, fontWeight, x, role }))).toEqual([
      { text: "Service", fontSize: 20, fontWeight: 700, x: 36, role: "title" },
      { text: "Background", fontSize: 12, fontWeight: 400, x: 36, role: "auxiliary" },
      { text: "Handles requests", fontSize: 14, fontWeight: 400, x: 36, role: "body" }
    ]);
    expect(diagram.renderSvg()).toContain('font-size="20" font-weight="700"');
    expect(diagram.evaluateAt(0).warnings).toEqual([]);
  });
  it("applies controlled block typography, alignment, padding and spacing", () => {
    const document = contentDocument({ content: {
      style: { padding: 10, blockGap: 8 },
      blocks: [
        { type: "title", text: "Title", style: { fontSize: 24, fontWeight: 600, color: "#123abc", align: "center" } },
        { type: "paragraph", text: "Body", style: { fontSize: 10, fontWeight: 300, align: "right" } }
      ]
    } });
    const diagram = createDiagram(document);
    const layout = diagram.evaluateAt(0).nodes[0]!.contentLayout!;
    expect(layout.safeArea).toEqual({ x: 30, y: 40, width: 220, height: 240 });
    expect(layout.lines[0]).toMatchObject({ x: 140, y: 64, fontSize: 24, fontWeight: 600, color: "#123abc", align: "center" });
    expect(layout.lines[1]).toMatchObject({ x: 250, y: 90.4, fontSize: 10, fontWeight: 300, align: "right" });
    expect(diagram.renderSvg()).toContain('text-anchor="end"');
  });

  it("wraps fixed-size content, preserves blank lines, and clips with directional warnings", () => {
    const document = contentDocument({ width: 92, height: 72,
      content: { blocks: [{ type: "paragraph", text: "alpha beta\n\nend" }] }
    });
    const diagram = createDiagram(document);
    const frame = diagram.evaluateAt(0);
    expect(frame.nodes[0]).toMatchObject({ width: 92, height: 72 });
    expect(frame.nodes[0]!.contentLayout?.lines.map(({ text }) => text)).toEqual(["alpha", "beta", "", "end"]);
    expect(frame.warnings).toEqual([expect.objectContaining({ objectId: "service", path: "nodes[0].content", code: "text-overflow", message: expect.stringContaining("height") })]);
    const svg = diagram.renderSvg();
    expect(svg).toContain('<clipPath');
    expect(svg).toContain('clip-path="url(#');
    expect(svg).toContain('<rect x="36" y="46" width="60" height="40"');
    expect(diagram.hitTest(0, { x: 40, y: 120 })).toBeNull();
  });

  it.each([
    { content: { blocks: [], unexpected: true }, path: "content.unexpected" },
    { content: { blocks: "text" }, path: "content.blocks" },
    { content: { blocks: [{ type: "paragraph", text: 4 }] }, path: "content.blocks[0].text" },
    { content: { blocks: [{ type: "html", text: "text" }] }, path: "content.blocks[0].type" },
    { content: { blocks: [{ type: "title", text: "text", role: "auxiliary" }] }, path: "content.blocks[0].role" },
    { content: { blocks: [{ type: "paragraph", text: "text", role: "other" }] }, path: "content.blocks[0].role" },
    { content: { blocks: [{ type: "paragraph", text: "text", style: { fontSize: 0 } }] }, path: "content.blocks[0].style.fontSize" },
    { content: { blocks: [{ type: "paragraph", text: "text", style: { fontSize: Infinity } }] }, path: "content.blocks[0].style.fontSize" },
    { content: { blocks: [{ type: "paragraph", text: "text", style: { fontWeight: 700.5 } }] }, path: "content.blocks[0].style.fontWeight" },
    { content: { blocks: [{ type: "paragraph", text: "text", style: { align: "start" } }] }, path: "content.blocks[0].style.align" },
    { content: { blocks: [{ type: "paragraph", text: "text", style: { color: "url(script)" } }] }, path: "content.blocks[0].style.color" },
    { content: { blocks: [{ type: "paragraph", text: "text", style: { css: "bad" } }] }, path: "content.blocks[0].style.css" },
    { content: { blocks: [], style: { padding: -1 } }, path: "content.style.padding" },
    { content: { blocks: [], style: { blockGap: NaN } }, path: "content.style.blockGap" },
    { content: { blocks: [], style: { margin: 3 } }, path: "content.style.margin" },
    { content: { blocks: [], style: [] }, path: "content.style" },
    { content: { blocks: new Array(1) }, path: "content.blocks[0]" }
  ])("rejects invalid content at its exact field path: $path", ({ content, path }) => {
    const document = contentDocument();
    const malformed = { ...document, nodes: [{ ...document.nodes[0], content }] };
    expect(validateDocument(malformed)).toEqual(expect.arrayContaining([expect.objectContaining({ path: `nodes[0].${path}` })]));
  });

  it("rejects label/content conflicts and unsupported content shapes", () => {
    const document = contentDocument();
    expect(validateDocument({ ...document, nodes: [{ ...document.nodes[0], label: "" }] })).toContainEqual(expect.objectContaining({ path: "nodes[0].content", message: expect.stringContaining("label") }));
    for (const kind of ["ellipse", "group"]) {
      expect(validateDocument({ ...document, nodes: [{ ...document.nodes[0], kind }] })).toContainEqual(expect.objectContaining({ path: "nodes[0].content", message: expect.stringContaining("rect") }));
    }
  });

  it("normalizes explicit line endings without losing empty paragraphs or blank lines", () => {
    const document = contentDocument({ content: { blocks: [{ type: "paragraph", text: "A\r\n\r\nB\rC\n" }, { type: "paragraph", text: "" }] } });
    expect(createDiagram(document).evaluateAt(0).nodes[0]!.contentLayout?.lines.map(({ text }) => text)).toEqual(["A", "", "B", "C", "", ""]);
  });

  it("keeps tiny safe areas finite and reports both insufficient dimensions", () => {
    const document = contentDocument({ width: 1, height: 1, content: { blocks: [{ type: "title", text: "W" }] } });
    const diagram = createDiagram(document);
    const frame = diagram.evaluateAt(0);
    expect(frame.nodes[0]!.contentLayout?.safeArea).toMatchObject({ width: 0, height: 0 });
    expect(frame.nodes[0]!.contentLayout).toMatchObject({ widthOverflow: true, heightOverflow: true });
    expect(frame.warnings.map(({ message }) => message)).toEqual(['content for node "service" exceeds its width', 'content for node "service" exceeds its height']);
    expect(diagram.renderSvg()).not.toMatch(/NaN|Infinity|width="-/);
  });

  it("copies content, escapes literal markup, and resolves default versus explicit theme colors", () => {
    const document = contentDocument({ content: { blocks: [
      { type: "title", text: '<script>alert("x")</script>' },
      { type: "paragraph", role: "auxiliary", text: "Muted" },
      { type: "paragraph", text: "Author color", style: { color: "#aabbcc" } }
    ] } });
    const diagram = createDiagram(document);
    // Deliberately mutate caller-owned data to verify compilation isolates the content.
    document.nodes[0]!.content!.blocks[0]!.text = "changed";
    const light = diagram.evaluateAt(0, { theme: "light" }).nodes[0]!.contentLayout!;
    const dark = diagram.evaluateAt(0, { theme: "dark" }).nodes[0]!.contentLayout!;
    expect(light.lines[0]!.text).toContain("<script>");
    expect(light.lines.find(({ role }) => role === "auxiliary")!.color).toBe("#5a6473");
    expect(dark.lines.find(({ role }) => role === "auxiliary")!.color).toBe("#b8c2d1");
    expect(light.lines.at(-1)!.color).toBe("#aabbcc");
    expect(dark.lines.at(-1)!.color).toBe("#aabbcc");
    expect(diagram.renderSvg()).not.toContain("<script>");
    expect(diagram.renderSvg()).toContain("&lt;script&gt;");
    expect(diagram.evaluateAt(0, { theme: "dark" })).toEqual(diagram.evaluateAt(0, { theme: "dark" }));
  });

  it("constrains content paint with current node and ancestor visibility and opacity", () => {
    const initial = contentDocument();
    const document: DiagramDocument = { ...initial,
      nodes: [{ id: "group", kind: "group", x: 50, y: 60, width: 320, height: 320 }, { ...initial.nodes[0]!, parentId: "group" }],
      scenes: [{ id: "visibility", label: "Visibility", beats: [
      { durationMs: 100, transitionMs: 0, actions: [{ type: "updateNode", target: "group", value: { opacity: 0.4 } }] },
      { durationMs: 100, transitionMs: 0, actions: [{ type: "hide", target: "group" }] }
    ] }] };
    const diagram = createDiagram(document);
    expect(diagram.evaluateAt(0).nodes[1]!.contentLayout?.safeArea).toMatchObject({ x: 86, y: 106 });
    expect(diagram.evaluateAt(0).nodes[1]!.opacity).toBe(0.4);
    expect(diagram.renderSvg(0)).toContain('data-content-id="service"');
    expect(diagram.renderSvg(0)).toContain('opacity="0.4"');
    expect(diagram.evaluateAt(100).nodes[1]!.visible).toBe(false);
    expect(diagram.renderSvg(100)).not.toContain('data-content-id="service"');
    expect(diagram.hitTest(100, { x: 90, y: 110 })).toBeNull();
  });

});
