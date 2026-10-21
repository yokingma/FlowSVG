// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { createPlayer } from "../browser.js";
import { createDiagram, type ThemeName } from "../index.js";
import { listContentDocument } from "../../tests/fixtures/list-content.js";

describe("SDK list content in the browser", () => {
  it.each<ThemeName>(["light", "dark"])("renders all three list forms from the same core SVG in %s", (theme) => {
    const host = window.document.createElement("div");
    const diagram = createDiagram(listContentDocument);
    const player = createPlayer(host, listContentDocument, { theme, controls: false, reducedMotion: false });
    try {
      const expected = window.document.createElement("div");
      expected.innerHTML = diagram.renderSvg(0, { theme });
      expect(host.querySelector("svg")?.outerHTML).toBe(expected.querySelector("svg")?.outerHTML);
      expect(player.getState().frame).toEqual(diagram.evaluateAt(0, { theme }));
      expect(host.querySelector('[data-content-id="facts"]')?.textContent).toContain("2030-01-01");
      expect(host.querySelector('[data-content-id="facts"]')?.textContent).toContain("initial");
      expect(host.querySelector('[data-content-id="facts"]')?.textContent).toContain("new");
      expect(host.querySelectorAll('[data-content-id="facts"] rect')).toHaveLength(3);
      expect(host.querySelector('[data-content-id="service"]')?.textContent).toContain("•");
      expect(host.querySelector('[data-content-id="steps"]')?.textContent).toContain("3.");
      expect(diagram.evaluateAt(0).warnings).toEqual([]);
      player.load({ version: 1, viewport: { width: 100, height: 100 }, nodes: [], edges: [], scenes: [] });
      expect(host.querySelector("[data-content-id]")).toBeNull();
      expect(host.querySelector("clipPath")).toBeNull();
    } finally { player.destroy(); }
  });
});
