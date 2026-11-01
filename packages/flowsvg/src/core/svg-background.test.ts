import { expect, it } from "vitest";
import { createDiagram, renderSvg, type DiagramDocument } from "../index.js";

const document: DiagramDocument = {
  version: 1, viewport: { width: 200, height: 100 },
  nodes: [{ id: "a", kind: "rect", x: 10, y: 20, width: 40, height: 40, label: "A", style: { fill: "#ffffff" } },
    { id: "b", kind: "rect", x: 150, y: 20, width: 40, height: 40 }],
  edges: [{ id: "ab", from: "a", to: "b", label: "relation" }], scenes: []
};
it("removes only the whole-diagram background from transparent static SVG", () => {
  const compiled = createDiagram(document);
  const opaque = compiled.renderSvg();
  const transparent = renderSvg(document, 0, { background: "transparent" });
  expect(opaque).toContain('<rect x="0" y="0" width="200" height="100" fill="#ffffff"/>');
  expect(transparent).not.toContain('<rect x="0" y="0" width="200" height="100" fill="#ffffff"/>');
  expect(transparent).toContain('fill="#ffffff"');
  expect(transparent).toContain('stroke="#ffffff"');
  expect(compiled.renderSvg(0, { background: "theme" })).toBe(opaque);
  expect(compiled.evaluateAt(0)).toEqual(createDiagram(document).evaluateAt(0));
});
