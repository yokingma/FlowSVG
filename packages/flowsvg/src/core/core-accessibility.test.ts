// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { renderSvg, type DiagramDocument } from "../index.js";

describe("exported SVG accessibility", () => {
  it("keeps independent accessible names when two deterministic exports share a document", () => {
    const model: DiagramDocument = {
      version: 1, viewport: { width: 100, height: 100 }, nodes: [], edges: [], scenes: []
    };
    const host = window.document.createElement("div");
    host.innerHTML = renderSvg({ ...model, title: "First diagram" })
      + renderSvg({ ...model, title: "Second diagram" });
    window.document.body.append(host);

    try {
      // ARIA ID references resolve against the whole document, not the enclosing SVG.
      const names = [...host.querySelectorAll("svg")].map((svg) => {
        const references = svg.getAttribute("aria-labelledby");
        if (!references) return svg.getAttribute("aria-label");
        return references.split(/\s+/).map((id) => window.document.getElementById(id)?.textContent ?? "").join(" ");
      });
      expect(names).toEqual(["First diagram", "Second diagram"]);
      expect([...host.querySelectorAll("title")].map((title) => title.textContent))
        .toEqual(["First diagram", "Second diagram"]);
      expect(renderSvg(model)).toBe(renderSvg(model));
    } finally {
      host.remove();
    }
  });
});
