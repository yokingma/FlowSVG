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
    return { cleanup: () => player.destroy(), update: async (gifExport: boolean) => {
      player.destroy(); player = createPlayer(host, model, { ...options, gifExport });
    } };
  }
  if (entry === "react") {
    const root = createRoot(host);
    act(() => root.render(createElement(ReactPlayer, { document: model, ...options })));
    return { cleanup: () => act(() => root.unmount()), update: async (gifExport: boolean) => {
      act(() => root.render(createElement(ReactPlayer, { document: model, ...options, gifExport })));
    } };
  }
  if (entry === "vue") {
    const current = ref(options);
    const currentDocument = ref(model);
    const app = createApp({ render: () => h(VuePlayer, { document: currentDocument.value, ...current.value }) });
    app.mount(host);
    return { cleanup: () => app.unmount(), update: async (gifExport: boolean) => {
      current.value = { ...options, gifExport }; await nextTick();
    } };
  }
  const element = document.createElement("flowsvg-player") as FlowPlayerElement;
  Object.assign(element, { document: model, ...options }); host.append(element);
  return { cleanup: () => element.remove(), update: async (gifExport: boolean) => {
    element.gifExport = gifExport;
  } };
}

describe.each<Host>(["browser", "react", "vue", "element"])("GIF controls through %s", (entry) => {
  it("stays opt-in, follows option updates and respects controls:false", async () => {
    const host = document.createElement("div"); document.body.append(host);
    const mounted = mount(host, entry, { reducedMotion: false });
    try {
      expect(host.querySelector('[aria-label="Export GIF"]')).toBeNull();
      await mounted.update(true);
      expect(host.querySelector('[aria-label="Export GIF"]')).not.toBeNull();
      await mounted.update(false);
      expect(host.querySelector('[aria-label="Export GIF"]')).toBeNull();
    } finally { mounted.cleanup(); }
    const hidden = mount(host, entry, { controls: false, gifExport: true, reducedMotion: false });
    expect(host.querySelector('[aria-label="Export GIF"]')).toBeNull();
    hidden.cleanup();
  });
});

it("parses the gif-export attribute consistently with optional booleans", () => {
  const element = document.createElement("flowsvg-player") as FlowPlayerElement;
  element.document = model; element.reducedMotion = false; document.body.append(element);
  try {
    for (const [value, expected] of [["", true], ["false", false], ["yes", true], ["0", false], [null, false]] as const) {
      if (value === null) element.removeAttribute("gif-export"); else element.setAttribute("gif-export", value);
      expect(element.gifExport).toBe(expected);
      expect(!!element.querySelector('[aria-label="Export GIF"]')).toBe(expected);
    }
  } finally { element.remove(); }
});
