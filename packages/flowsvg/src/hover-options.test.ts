// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { createApp, h, nextTick, ref } from "vue";
import { createPlayer, type PlayerOptions } from "./browser.js";
import { FlowPlayer as ReactPlayer } from "./react.js";
import { FlowPlayer as VuePlayer } from "./vue.js";
import { defineFlowPlayer, type FlowPlayerElement } from "./web-component.js";
import type { DiagramDocument } from "./index.js";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
defineFlowPlayer();
afterEach(() => document.body.replaceChildren());

const model: DiagramDocument = {
  version: 1, viewport: { width: 400, height: 200 },
  nodes: [
    { id: "group", kind: "group", x: 120, y: 20, width: 260, height: 170 },
    { id: "source", kind: "cylinder", x: 20, y: 50, width: 80, height: 100 },
    { id: "child", kind: "roundedRect", parentId: "group", x: 20, y: 30, width: 220, height: 110,
      content: { blocks: [{ type: "title", text: "Title" }, { type: "paragraph", text: "Body" }] } }
  ], edges: [], scenes: []
};
type Host = "browser" | "react" | "vue" | "element";

function mount(host: HTMLElement, entry: Host, options: PlayerOptions) {
  if (entry === "browser") {
    let player = createPlayer(host, model, options);
    return { cleanup: () => player.destroy(), update: async (hoverFill: boolean) => {
      player.destroy(); player = createPlayer(host, model, { ...options, hoverFill });
    } };
  }
  if (entry === "react") {
    const root = createRoot(host);
    act(() => root.render(createElement(ReactPlayer, { document: model, ...options })));
    return { cleanup: () => act(() => root.unmount()), update: async (hoverFill: boolean) => {
      act(() => root.render(createElement(ReactPlayer, { document: model, ...options, hoverFill })));
    } };
  }
  if (entry === "vue") {
    const current = ref(options);
    const app = createApp({ render: () => h(VuePlayer, { document: model, ...current.value }) });
    app.mount(host);
    return { cleanup: () => app.unmount(), update: async (hoverFill: boolean) => {
      current.value = { ...options, hoverFill }; await nextTick();
    } };
  }
  const element = document.createElement("flowsvg-player") as FlowPlayerElement;
  Object.assign(element, { document: model, ...options }); host.append(element);
  return { cleanup: () => element.remove(), update: async (hoverFill: boolean) => {
    element.hoverFill = hoverFill;
  } };
}

function move(host: HTMLElement, x: number, y: number) {
  host.querySelector("svg")!.getBoundingClientRect = () => ({ x: 0, y: 0, left: 0, top: 0,
    right: 400, bottom: 200, width: 400, height: 200, toJSON: () => ({}) });
  host.querySelector(".flowsvg-canvas")!.dispatchEvent(new MouseEvent("pointermove", {
    bubbles: true, clientX: x, clientY: y
  }));
}

describe.each<Host>(["browser", "react", "vue", "element"])("hover paint through %s", (entry) => {
  it.each(["light", "dark"] as const)("defaults to borders and accepts background highlighting in %s", async (theme) => {
    const host = document.createElement("div"); document.body.append(host);
    const mounted = mount(host, entry, { theme, controls: false, reducedMotion: false });
    const fill = theme === "dark" ? "#1d2939" : "#ffffff";
    const highlight = theme === "dark" ? "#8ab4f8" : "#2a63c8";
    const highlightFill = theme === "dark" ? "#233b60" : "#eaf1ff";
    try {
      for (const enabled of [undefined, true, false]) {
        if (enabled !== undefined) await mounted.update(enabled);
        for (const [id, x, y] of [["source", 30, 80], ["child", 160, 80], ["group", 130, 175]] as const) {
          const content = host.querySelector('[data-content-id="child"]')?.outerHTML;
          move(host, x, y);
          const shape = host.querySelector(`[data-id="${id}"]`)!;
          expect(shape.getAttribute("stroke")).toBe(highlight);
          expect(shape.getAttribute("fill")).toBe(enabled ? highlightFill : fill);
          if (!enabled) expect(host.querySelector('[data-content-id="child"]')?.outerHTML).toBe(content);
          host.querySelector(".flowsvg-canvas")!.dispatchEvent(new MouseEvent("pointerleave"));
          expect(shape.getAttribute("fill")).toBe(fill);
        }
      }
    } finally { mounted.cleanup(); host.remove(); }
  });
});

it("supports declarative hover-fill false values and attribute removal", () => {
  const host = document.createElement("div"); document.body.append(host);
  const mounted = mount(host, "element", { controls: false, reducedMotion: false });
  const element = host.querySelector("flowsvg-player") as FlowPlayerElement;
  try {
    for (const [value, enabled] of [["", true], ["false", false], ["true", true], [null, false]] as const) {
      if (value === null) element.removeAttribute("hover-fill"); else element.setAttribute("hover-fill", value);
      expect(element.hoverFill).toBe(enabled);
      move(host, 30, 80);
      expect(host.querySelector('[data-id="source"]')?.getAttribute("fill")).toBe(enabled ? "#eaf1ff" : "#ffffff");
    }
  } finally { mounted.cleanup(); host.remove(); }
});
