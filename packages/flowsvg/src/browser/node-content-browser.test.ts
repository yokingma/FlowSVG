// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { createPlayer } from "../browser.js";
import { createDiagram, type ThemeName } from "../index.js";
import { nodeContentDocument } from "../../tests/fixtures/node-content.js";

describe("node content in the browser", () => {
  it.each<ThemeName>(["light", "dark"])("reuses the core content layout, clip geometry and SVG in %s", (theme) => {
    const host = window.document.createElement("div");
    const diagram = createDiagram(nodeContentDocument);
    const player = createPlayer(host, nodeContentDocument, { controls: false, theme, reducedMotion: false });
    try {
      const expected = window.document.createElement("div");
      expected.innerHTML = diagram.renderSvg(0, { theme });
      expect(host.querySelector("svg")?.outerHTML).toBe(expected.querySelector("svg")?.outerHTML);
      expect(player.getState().frame).toEqual(diagram.evaluateAt(0, { theme }));
      expect(host.querySelectorAll("[data-content-id]")).toHaveLength(5);
      expect(host.querySelectorAll('[data-id="service"]')).toHaveLength(1);
      expect(host.querySelectorAll("clipPath")).toHaveLength(5);
      expect(host.querySelector('[data-content-id="mixed"] tspan[font-size="12"]')?.textContent).toBe(" 2030-01-01");
      player.load({ ...nodeContentDocument, nodes: [nodeContentDocument.nodes.find(({ id }) => id === "plain")!] });
      expect(host.querySelector("[data-content-id]")).toBeNull();
      expect(host.querySelector("clipPath")).toBeNull();
    } finally {
      player.destroy();
    }
    expect(host.children).toHaveLength(0);
  });
});
