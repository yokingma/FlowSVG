import { describe, expect, it } from "vitest";
import { createDiagram, measureNodeContent, validateDocument, type ContentListItem, type DiagramDocument } from "../index.js";

const factsDocument = (items: ContentListItem[], width = 240, marker?: "bullet" | "number"): DiagramDocument => ({
  version: 1, viewport: { width: 320, height: 500 },
  nodes: [{ id: "facts", kind: "rect", x: 10, y: 20, width, height: 440,
    content: { blocks: [{ type: "list", marker, items }] } }], edges: [], scenes: []
});

describe("Facts tags and status", () => {
  it("keeps tag internals stable through width transitions, replacement and backward queries", () => {
    const items: ContentListItem[] = [{ tags: [{ text: "Ready" }, { text: "Big", style: { fontSize: 24 } }],
      status: "OK", statusStyle: { fontSize: 28 }, body: "Body" }];
    const initial = factsDocument(items, 280, "number");
    const replacement = { blocks: [{ type: "list" as const, marker: "number" as const,
      items: [{ ...items[0], tags: [{ text: "Ready\n就绪" }] }] }] };
    const document: DiagramDocument = { ...initial, scenes: [{ id: "resize", label: "Resize", beats: [
      { durationMs: 1000, transitionMs: 1000, actions: [{ type: "updateNode", target: "facts", value: { width: 108 } }] },
      { durationMs: 1000, actions: [{ type: "updateNode", target: "facts", value: { content: replacement } }] }
    ] }] };
    const diagram = createDiagram(document);
    const midpoint = diagram.evaluateAt(500);
    for (const time of [0, 500, 1000, 2000, 500, 0]) {
      const node = diagram.evaluateAt(time).nodes[0]!;
      const content = node.content!;
      const measurement = measureNodeContent({ kind: "rect", width: node.width, content });
      const measured = createDiagram({ ...document, scenes: [], nodes: [{ ...document.nodes[0]!, width: node.width,
        height: measurement.height, content }] }).evaluateAt(0);
      expect(measured.warnings).toEqual([]);
      const tag = node.contentLayout!.tags[0]!;
      const lines = node.contentLayout!.lines.filter(({ role, tagIndex }) => role === "tag" && tagIndex === 0);
      const standalone = createDiagram(factsDocument([{ tags: [{ text: lines.map(({ text }) => text).join("\n") }] }]))
        .evaluateAt(0).nodes[0]!.contentLayout!;
      expect(tag.height).toBeCloseTo(standalone.tags[0]!.height);
      expect(lines[0]!.y - tag.y).toBeCloseTo(standalone.lines[0]!.y - standalone.tags[0]!.y);
      const body = node.contentLayout!.lines.find(({ role }) => role === "body")!;
      expect(body.y - body.fontSize).toBeGreaterThanOrEqual(tag.y + tag.height);
    }
    expect(diagram.evaluateAt(500)).toEqual(midpoint);
  });

  it("preserves a tag's own box and baseline offset when numbering or status grows", () => {
    const layouts = [
      factsDocument([{ tags: [{ text: "Ready" }] }]),
      factsDocument([{ tags: [{ text: "Ready" }], body: "Body", style: { fontSize: 28 } }], 240, "number"),
      factsDocument([{ tags: [{ text: "Ready" }], status: "OK", statusStyle: { fontSize: 28 } }])
    ].map((document) => createDiagram(document).evaluateAt(0).nodes[0]!.contentLayout!);
    const reference = layouts[0]!;
    const referenceTag = reference.tags[0]!;
    const referenceLine = reference.lines.find(({ role }) => role === "tag")!;
    for (const layout of layouts.slice(1)) {
      const tag = layout.tags[0]!;
      const line = layout.lines.find(({ role }) => role === "tag")!;
      expect(tag.height).toBe(referenceTag.height);
      expect(line.fontSize).toBe(referenceLine.fontSize);
      expect(line.y - tag.y).toBeCloseTo(referenceLine.y - referenceTag.y);
      const companion = layout.lines.find(({ role }) => role === "marker" || role === "status")!;
      expect(companion.y).toBe(line.y);
      expect(companion.y - companion.fontSize).toBeGreaterThanOrEqual(layout.safeArea.y);
    }
  });

  it.each(["light", "dark"] as const)("renders opt-in pill tags from their final aligned height in %s", (theme) => {
    const diagram = createDiagram(factsDocument([{ tags: [
      { text: "large", style: { fontSize: 24 } },
      { text: "rounded", style: { shape: "rounded" } },
      { text: "pill label", style: { shape: "pill" } }
    ] }], 400));
    const frame = diagram.evaluateAt(0, { theme, reducedMotion: true });
    const tags = frame.nodes[0]!.contentLayout!.tags;
    expect(frame.warnings).toEqual([]);
    const standalone = createDiagram(factsDocument([{ tags: [{ text: "pill label", style: { shape: "pill" } }] }])).evaluateAt(0).nodes[0]!.contentLayout!.tags[0]!;
    expect(tags[2]!.height).toBe(standalone.height);
    expect(tags[2]!.y).toBeGreaterThan(tags[0]!.y);
    const content = diagram.renderSvg(0, { theme }).split('data-content-id="facts"')[1]!;
    const radii = [...content.matchAll(/<rect[^>]* rx="([^"]+)"/g)].map((match) => Number(match[1]));
    expect(radii).toEqual([3, 3, tags[2]!.height / 2]);
  });

  it("centers tag text inside each tag background", () => {
    const diagram = createDiagram(factsDocument([{ tags: [{ text: "Current", style: { shape: "pill" } }] }]));
    const layout = diagram.evaluateAt(0).nodes[0]!.contentLayout!;
    const tag = layout.tags[0]!;
    const line = layout.lines.find(({ role }) => role === "tag")!;
    expect(line.align).toBe("center");
    expect(line.x).toBeCloseTo(tag.x + tag.width / 2);
    expect(line.spans[0]!.x).toBeCloseTo(tag.x + (tag.width - line.width) / 2);
    expect(line.y).toBeGreaterThan(tag.y);
    expect(line.y).toBeLessThan(tag.y + tag.height);
    expect(diagram.renderSvg()).toContain(`<tspan x="${line.x}" y="${line.y}"`);
    expect(diagram.renderSvg()).toMatch(/<tspan[^>]*text-anchor="middle">Current<\/tspan>/);
  });

  it.each([null, "circle", 10])("rejects an unsupported tag shape %s at its authored path", (shape) => {
    const document = factsDocument([]);
    const malformed = { ...document, nodes: [{ ...document.nodes[0], content: {
      blocks: [{ type: "list", items: [{ tags: [{ text: "tag", style: { shape } }] }] }]
    } }] };
    expect(validateDocument(malformed)).toContainEqual({
      path: "nodes[0].content.blocks[0].items[0].tags[0].style.shape", message: "must be rounded or pill"
    });
  });

  it("places a backed tag and right status above body and auxiliary through public SVG", () => {
    const document = factsDocument([{ tags: [{ text: "world" }], status: "new", body: "Record", auxiliary: "2026-10-17" }]);
    expect(validateDocument(document)).toEqual([]);
    const diagram = createDiagram(document);
    const layout = diagram.evaluateAt(0).nodes[0]!.contentLayout!;
    expect(layout.lines.map(({ text, role }) => ({ text, role }))).toEqual([
      { text: "world", role: "tag" }, { text: "new", role: "status" },
      { text: "Record", role: "body" }, { text: "2026-10-17", role: "auxiliary" }
    ]);
    expect(layout.tags).toEqual([expect.objectContaining({ x: 26, y: 36, height: 24, explicitFill: false, blockIndex: 0, itemIndex: 0, tagIndex: 0 })]);
    expect(layout.tags[0]!.width).toBeCloseTo(49.4);
    expect(layout.lines[1]).toMatchObject({ align: "right", x: 234, fontSize: 12 });
    expect(layout.lines[2]!.y - layout.lines[2]!.fontSize).toBeGreaterThanOrEqual(60);
    expect(diagram.renderSvg()).toContain('rx="3"');
    expect(diagram.evaluateAt(0).warnings).toEqual([]);
  });
  it("wraps tags first and moves status to a separate right-aligned row before body", () => {
    const diagram = createDiagram(factsDocument([{ tags: [{ text: "alpha" }, { text: "beta" }, { text: "long tag 👩🏽‍💻 中文" }],
      status: [{ text: "等待", style: { fontSize: 18 } }, { text: " pending 👩🏽‍💻" }], body: "Body" }], 112));
    const layout = diagram.evaluateAt(0).nodes[0]!.contentLayout!;
    expect(layout.tags[1]!.y).toBeGreaterThan(layout.tags[0]!.y);
    expect(layout.tags[2]!.width).toBeLessThanOrEqual(80);
    const status = layout.lines.filter(({ role }) => role === "status");
    const tagBottom = Math.max(...layout.tags.map(({ y, height }) => y + height));
    expect(status[0]!.y - status[0]!.fontSize).toBeGreaterThanOrEqual(tagBottom);
    expect(status.every(({ x, align }) => x === 106 && align === "right")).toBe(true);
    expect(status.map(({ text }) => text).join("")).toContain("👩🏽‍💻");
    const body = layout.lines.find(({ role }) => role === "body")!;
    expect(body.y - body.fontSize).toBeGreaterThan(status.at(-1)!.y);
    expect(diagram.evaluateAt(0).warnings).toEqual([]);
  });

  it("aligns mixed-size tags and status on one baseline and keeps marked metadata above body", () => {
    const document = factsDocument([{ tags: [{ text: "a" }, { text: [{ text: "Big", style: { fontSize: 24, color: "#ab1234" } }], style: { fill: "#123abc" } }],
      status: "new", body: "Body" }, { tags: [{ text: "b" }], body: "Second" }], 240, "bullet");
    const diagram = createDiagram(document);
    const layout = diagram.evaluateAt(0).nodes[0]!.contentLayout!;
    const first = layout.lines.filter(({ itemIndex, role }) => itemIndex === 0 && role !== "body");
    expect(new Set(first.map(({ y }) => y)).size).toBe(1);
    expect(layout.tags[0]!.height).toBe(24);
    expect(layout.tags[0]!.y).toBeGreaterThan(layout.tags[1]!.y);
    expect(layout.tags[1]).toMatchObject({ fill: "#123abc", explicitFill: true });
    expect(layout.lines.find(({ text }) => text === "Big")!.spans[0]).toMatchObject({ color: "#ab1234", explicitColor: true });
    const secondMarker = layout.lines.find(({ itemIndex, role }) => itemIndex === 1 && role === "marker")!;
    const secondTag = layout.tags[2]!;
    expect(secondMarker.y - secondMarker.fontSize).toBeGreaterThanOrEqual(layout.safeArea.y);
    expect(secondTag.y).toBeGreaterThanOrEqual(layout.tags[1]!.y + layout.tags[1]!.height);
    expect(diagram.renderSvg()).toContain('fill="#123abc"');
  });

  it("supports tags-only and status-only entries, skips omitted parts and warns for an empty padded tag in a zero-width clip", () => {
    const diagram = createDiagram(factsDocument([{}, { tags: [] }, { tags: [{ text: "only" }] }, { status: "new" }, { auxiliary: "Date" }]));
    const layout = diagram.evaluateAt(0).nodes[0]!.contentLayout!;
    expect(layout.lines.map(({ role, itemIndex }) => ({ role, itemIndex }))).toEqual([
      { role: "tag", itemIndex: 2 }, { role: "status", itemIndex: 3 }, { role: "auxiliary", itemIndex: 4 }
    ]);
    expect(layout.tags[0]).toMatchObject({ y: 36 });
    expect(layout.lines[1]).toMatchObject({ y: 84 });
    const tiny = createDiagram(factsDocument([{ tags: [{ text: "" }] }], 20));
    expect(tiny.evaluateAt(0).nodes[0]!.contentLayout).toMatchObject({ safeArea: { width: 0 }, widthOverflow: true });
    expect(tiny.renderSvg()).not.toMatch(/NaN|Infinity/);
  });

  it.each(["light", "dark"] as const)("uses readable %s defaults and preserves explicit tag/status colors", (theme) => {
    const diagram = createDiagram(factsDocument([{ tags: [{ text: "default" }, { text: "custom", style: { fill: "#123abc", color: "#fedcba" } }],
      status: [{ text: "new", style: { color: "#abc123", fontSize: 18 } }] }]));
    const layout = diagram.evaluateAt(0, { theme }).nodes[0]!.contentLayout!;
    expect(layout.tags[0]!.fill).toBe(theme === "light" ? "#eaf1ff" : "#253b5c");
    expect(layout.lines[0]!.spans[0]).toMatchObject({ color: theme === "light" ? "#1d4fa8" : "#caddff", explicitColor: false });
    expect(layout.tags[1]).toMatchObject({ fill: "#123abc", explicitFill: true });
    expect(layout.lines[1]!.spans[0]).toMatchObject({ color: "#fedcba", explicitColor: true });
    expect(layout.lines[2]!.spans[0]).toMatchObject({ color: "#abc123", explicitColor: true });
    expect(new Set(layout.lines.map(({ y }) => y)).size).toBe(1);
  });

  it("preserves blank tag lines and complete graphemes and separates multiline status", () => {
    const diagram = createDiagram(factsDocument([{ tags: [{ text: [{ text: "👩" }, { text: "🏽‍💻\n\n中文" }] }], status: "new\nconfirmed" }], 80));
    const layout = diagram.evaluateAt(0).nodes[0]!.contentLayout!;
    expect(layout.lines.filter(({ role }) => role === "tag").map(({ text }) => text)).toEqual(["👩🏽‍💻", "", "中文"]);
    const status = layout.lines.filter(({ role }) => role === "status");
    expect(status[0]!.y - status[0]!.fontSize).toBeGreaterThanOrEqual(layout.tags[0]!.y + layout.tags[0]!.height);
    expect(status.every(({ align }) => align === "right")).toBe(true);
    expect(diagram.evaluateAt(0)).toEqual(diagram.evaluateAt(0));
  });

  it("reports insufficient padded tag and marked status column widths even for oversized graphemes", () => {
    const document = factsDocument([{ tags: [{ text: "👩🏽‍💻", style: { fontSize: 95 } }] },
      { status: [{ text: "👩🏽‍💻", style: { fontSize: 95 } }] }], 132, "bullet");
    const diagram = createDiagram(document);
    expect(diagram.evaluateAt(0).nodes[0]!.contentLayout!.widthOverflow).toBe(true);
    expect(diagram.evaluateAt(0).warnings).toContainEqual(expect.objectContaining({ objectId: "facts", message: 'content for node "facts" exceeds its width' }));
  });

  it.each([
    { item: { tags: "tag" }, suffix: "tags" },
    { item: { tags: new Array(1) }, suffix: "tags[0]" },
    { item: { tags: [{ text: 42 }] }, suffix: "tags[0].text" },
    { item: { tags: [{ text: "tag", id: "target" }] }, suffix: "tags[0].id" },
    { item: { tags: [{ text: "tag", style: { fill: "url(#x)" } }] }, suffix: "tags[0].style.fill" },
    { item: { tags: [{ text: "tag", style: { fontSize: NaN } }] }, suffix: "tags[0].style.fontSize" },
    { item: { tags: [{ text: "tag", style: { align: "right" } }] }, suffix: "tags[0].style.align" },
    { item: { tags: [{ text: [{ text: "tag", style: { fill: "#abc" } }] }] }, suffix: "tags[0].text[0].style.fill" },
    { item: { status: false }, suffix: "status" },
    { item: { status: [{ text: false }] }, suffix: "status[0].text" },
    { item: { statusStyle: { fontWeight: 50 } }, suffix: "statusStyle.fontWeight" },
    { item: { statusStyle: { align: "left" } }, suffix: "statusStyle.align" }
  ])("rejects malformed metadata at its source path: $suffix", ({ item, suffix }) => {
    const document = factsDocument([]);
    const malformed = { ...document, nodes: [{ ...document.nodes[0], content: { blocks: [{ type: "list", items: [item] }] } }] };
    expect(validateDocument(malformed)).toContainEqual(expect.objectContaining({ path: `nodes[0].content.blocks[0].items[0].${suffix}` }));
  });

  it.each([-1, Infinity, "6"])("rejects invalid tag gap %s", (tagGap) => {
    const document = factsDocument([]);
    const malformed = { ...document, nodes: [{ ...document.nodes[0], content: { blocks: [{ type: "list", items: [], style: { tagGap } }] } }] };
    expect(validateDocument(malformed)).toContainEqual(expect.objectContaining({ path: "nodes[0].content.blocks[0].style.tagGap" }));
  });

});
