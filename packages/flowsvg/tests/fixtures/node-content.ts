/** SDK-owned fixed geometry and Unicode content for browser/core parity and clip cleanup. */
import type { DiagramDocument } from "../../src/index.js";

export const nodeContentDocument: DiagramDocument = {
  version: 1, viewport: { width: 1232, height: 488 },
  nodes: [
    { id: "service", kind: "rect", x: 24, y: 24, width: 260, height: 312,
      content: { blocks: [{ type: "title", text: "Rectangle" }, { type: "paragraph", text: "Fixed-size content" }] } },
    { id: "narrow", kind: "roundedRect", x: 320, y: 24, width: 164, height: 176,
      content: { style: { padding: 12, blockGap: 10 }, blocks: [
        { type: "title", text: "Narrow", style: { fontSize: 18, align: "center" } },
        { type: "paragraph", text: "中文换行 and English wrapping.\n".repeat(12) }
      ] } },
    { id: "tiny", kind: "cylinder", x: 528, y: 224, width: 12, height: 12,
      content: { blocks: [{ type: "paragraph", text: "Clipped" }] } },
    { id: "mixed", kind: "rect", x: 904, y: 24, width: 304, height: 392,
      content: { blocks: [
        { type: "title", text: "Mixed Unicode" },
        { type: "paragraph", text: [{ text: "Saved", style: { fontSize: 24, fontWeight: 700 } }, { text: " 2030-01-01", style: { fontSize: 12, color: "#7c66d9" } }] },
        { type: "paragraph", text: "中文 English\n\n👩🏽‍💻 👨‍👩‍👧‍👦 🇨🇳 1️⃣ é" }
      ] } },
    { id: "plain", kind: "roundedRect", x: 320, y: 360, width: 220, height: 72, label: "Plain label" },
    { id: "storage", kind: "cylinder", x: 616, y: 24, width: 260, height: 440,
      content: { blocks: [{ type: "title", text: "Cylinder" }, { type: "paragraph", role: "auxiliary", text: "Curved safe area" }] } }
  ], edges: [], scenes: []
};
