import { describe, expect, it } from "vitest";
import { createDiagram, type DiagramDocument, type NodeContent } from "../index.js";

const content: NodeContent = { blocks: [
  { type: "title", text: "Facts" },
  { type: "paragraph", role: "auxiliary", text: "Background" },
  { type: "list", marker: "bullet", items: [{ tags: [{ text: "world" }, { text: "custom", style: { fill: "#123456", color: "#fedcba" } }],
    status: "new", body: [{ text: "Record " }, { text: "authored", style: { color: "#765432" } }], auxiliary: "2026-10-17" }] }
] };

const highlightDocument: DiagramDocument = {
  version: 1, viewport: { width: 600, height: 500 },
  nodes: [{ id: "facts", kind: "cylinder", x: 20, y: 20, width: 240, height: 440, content },
    { id: "service", kind: "rect", x: 360, y: 100, width: 180, height: 100, label: "Service" }],
  edges: [{ id: "request", from: "facts", to: "service" }],
  scenes: [{ id: "scene", label: "Scene", beats: [
    { durationMs: 100, transitionMs: 0, actions: [] },
    { durationMs: 100, transitionMs: 0, actions: [{ type: "highlight", target: "facts" }] },
    { durationMs: 100, transitionMs: 0, actions: [{ type: "unhighlight", target: "facts" }, { type: "flow", target: "request", direction: "forward" }] },
    { durationMs: 100, transitionMs: 0, actions: [] }
  ] }]
};

describe("node content highlight paint", () => {
  it.each(["rect", "roundedRect", "cylinder"] as const)("keeps semantic roles readable and authored colors intact for explicit and flow highlights on %s", (kind) => {
    for (const theme of ["light", "dark"] as const) {
      const diagram = createDiagram({ ...highlightDocument, nodes: highlightDocument.nodes.map((node, index) => index === 0 ? { ...node, kind } : node) });
      const normal = diagram.evaluateAt(0, { theme }).nodes[0]!.contentLayout!;
      for (const time of [100, 250]) {
        const layout = diagram.evaluateAt(time, { theme }).nodes[0]!.contentLayout!;
        expect(layout.lines.find(({ role }) => role === "title")!.spans[0]!.color).toBe(theme === "dark" ? "#f2f4f7" : "#1d2939");
        expect(layout.lines.find(({ role }) => role === "auxiliary")!.spans[0]!.color).toBe(theme === "dark" ? "#b8c2d1" : "#5a6473");
        expect(layout.lines.find(({ role }) => role === "status")!.spans[0]!.color).toBe(theme === "dark" ? "#9bbfff" : "#1d4fa8");
        expect(layout.lines.find(({ role }) => role === "marker")!.spans[0]!.color).toBe(theme === "dark" ? "#f2f4f7" : "#1d2939");
        expect(layout.tags[0]!.fill).toBe(theme === "dark" ? "#253b5c" : "#eaf1ff");
        expect(layout.lines.find(({ role }) => role === "tag")!.spans[0]!.color).toBe(theme === "dark" ? "#caddff" : "#1d4fa8");
        expect(layout.tags[1]!.fill).toBe("#123456");
        expect(layout.lines.flatMap(({ spans }) => spans).find(({ text }) => text === "custom")!.color).toBe("#fedcba");
        expect(layout.lines.flatMap(({ spans }) => spans).find(({ text }) => text === "authored")!.color).toBe("#765432");
        expect(layout.safeArea).toEqual(normal.safeArea);
        expect(layout.lines.map(({ x, y, width, fontSize }) => ({ x, y, width, fontSize })))
          .toEqual(normal.lines.map(({ x, y, width, fontSize }) => ({ x, y, width, fontSize })));
        expect(diagram.renderSvg(time, { theme })).toContain(theme === "dark" ? 'fill="#b8c2d1"' : 'fill="#5a6473"');
      }
      expect(diagram.evaluateAt(300, { theme }).nodes[0]!.contentLayout).toEqual(normal);
    }
  });
  it.each(["light", "dark"] as const)("keeps default ink readable during %s explicit highlight transitions without moving content", (theme) => {
    const document: DiagramDocument = { ...highlightDocument, scenes: [{ id: "transition", label: "Transition", beats: [
      { durationMs: 1000, transitionMs: 1000, actions: [{ type: "highlight", target: "facts" }] },
      { durationMs: 1000, transitionMs: 1000, actions: [{ type: "unhighlight", target: "facts" }] }
    ] }] };
    const diagram = createDiagram(document);
    const normal = diagram.evaluateAt(0, { theme }).nodes[0]!.contentLayout!;
    for (const time of [0, 250, 400, 500, 600, 750, 1000, 1250, 1500, 1750, 2000]) {
      const node = diagram.evaluateAt(time, { theme }).nodes[0]!;
      const layout = node.contentLayout!;
      for (const line of layout.lines) {
        const background = line.role === "tag" ? layout.tags.find((tag) => tag.blockIndex === line.blockIndex
          && tag.itemIndex === line.itemIndex && tag.tagIndex === line.tagIndex)!.fill : node.style.fill!;
        for (const span of line.spans.filter(({ explicitColor }) => !explicitColor)) {
          if (time !== 0 && time !== 2000) expect(contrastRatio(span.color, background), `${time}ms ${line.role}`).toBeGreaterThanOrEqual(4.5);
        }
      }
      expect(layout.lines.map(({ x, y, width }) => ({ x, y, width }))).toEqual(normal.lines.map(({ x, y, width }) => ({ x, y, width })));
    }
  });
});

// Independent WCAG relative luminance calculation checks visible default ink against its evaluated node fill.
function contrastRatio(ink: string, fill: string): number {
  const luminance = (color: string): number => {
    const channels = [1, 3, 5].map((offset) => Number.parseInt(color.slice(offset, offset + 2), 16) / 255)
      .map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
    return channels[0]! * 0.2126 + channels[1]! * 0.7152 + channels[2]! * 0.0722;
  };
  const a = luminance(ink), b = luminance(fill);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}
