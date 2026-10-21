/** SDK-owned list geometry input; no showcase data or build output is required. */
import type { DiagramDocument } from "../../src/index.js";

export const listContentDocument: DiagramDocument = {
  version: 1, viewport: { width: 848, height: 488 },
  nodes: [
    { id: "facts", kind: "cylinder", x: 24, y: 24, width: 240, height: 440,
      content: { blocks: [
        { type: "title", text: "Records" },
        { type: "paragraph", role: "auxiliary", text: "List layout input" },
        { type: "list", marker: "none", items: [
          { tags: [{ text: "initial" }], body: "Initial record", auxiliary: "2030-01-01" },
          { tags: [{ text: "category", style: { fill: "#eadfff", color: "#57319b" } }, { text: "second" }], status: "new", body: [{ text: "Bold", style: { fontWeight: 700 } }, { text: " record" }], auxiliary: "2030-01-02" },
          { auxiliary: "An auxiliary-only item." }
        ] }
      ] } },
    { id: "service", kind: "roundedRect", x: 304, y: 24, width: 240, height: 440,
      content: { blocks: [
        { type: "title", text: "Bullets" },
        { type: "list", marker: "bullet", items: [
          { body: "First item" }, { body: "Second item with wrapped text", auxiliary: "Aligned auxiliary" },
          { body: [{ text: "Styled", style: { fontWeight: 700, color: "#2563eb" } }, { text: " third item" }] }
        ] }
      ] } },
    { id: "steps", kind: "rect", x: 584, y: 24, width: 240, height: 440,
      content: { blocks: [
        { type: "title", text: "Numbers" },
        { type: "list", marker: "number", style: { itemGap: 16 }, items: [
          { body: "One", auxiliary: "First" }, { body: "Two", auxiliary: "Second" }, { body: "Three", auxiliary: "Third 👩🏽‍💻" }
        ] }
      ] } }
  ], edges: [], scenes: []
};
