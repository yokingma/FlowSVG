import { describe, expect, it } from "vitest";
import { createDiagram, wrapText, type DiagramDocument } from "../index.js";

describe("English edge label wrapping", () => {
  it.each([
    { label: "Schedule", vertical: false },
    { label: "Cancel", vertical: true },
    { label: "Success", vertical: true },
    { label: "Temp error", vertical: false },
    { label: "Retry timer", vertical: true }
  ])("keeps complete words in $label on a short connection", ({ label, vertical }) => {
    const document: DiagramDocument = {
      version: 1, viewport: { width: 600, height: 450 },
      nodes: [
        { id: "from", kind: "roundedRect", x: 24, y: 60, width: 220, height: 140 },
        { id: "to", kind: "roundedRect", x: vertical ? 24 : 324, y: vertical ? 250 : 60, width: 220, height: 140 }
      ],
      edges: [{ id: "event", from: "from", to: "to", route: "orthogonal",
        fromPort: vertical ? "bottom" : "right", toPort: vertical ? "top" : "left", label }],
      scenes: []
    };
    const lines = createDiagram(document).evaluateAt(0).edges[0]!.labelLines;
    expect(lines.join(" ")).toBe(label);
    for (const line of lines) {
      for (const word of line.split(" ")) expect(label.split(" ")).toContain(word);
    }
    if (vertical) expect(lines).toEqual([label]);
  });

  it.each([
    { text: "Schedule", width: 1, lines: ["Schedule"] },
    { text: "Go Schedule now", width: 51, lines: ["Go", "Schedule", "now"] },
    { text: "重试Success完成", width: 34, lines: ["重试", "Success", "完成"] },
    { text: "don't retry", width: 25.5, lines: ["don't", "retry"] },
    { text: "café résumé", width: 25.5, lines: ["café", "résumé"] },
    { text: "Schedule\n\nCancel", width: 1, lines: ["Schedule", "", "Cancel"] },
    { text: "中文换行", width: 17, lines: ["中文", "换行"] },
    { text: "A😀B", width: 1, lines: ["A", "😀", "B"] }
  ])("preserves words and explicit breaks in $text", ({ text, width, lines }) => {
    expect(wrapText(text, width)).toEqual(lines);
  });
});
