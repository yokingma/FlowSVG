// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { createApp, h, ref } from "vue";
import { createPlayer, type PlayerOptions } from "../../src/browser.js";
import { FlowPlayer as ReactPlayer, type FlowPlayerHandle } from "../../src/react.js";
import { FlowPlayer as VuePlayer } from "../../src/vue.js";
import { defineFlowPlayer, type FlowPlayerElement } from "../../src/web-component.js";
import { contentStoryDocument } from "../fixtures/content-timeline.js";
import { createDiagram, validateDocument, type DiagramDocument } from "../../src/index.js";

describe("SDK content timeline", () => {
  it("replaces the complete content at the boundary and persists its display mode across scenes", () => {
    expect(validateDocument(contentStoryDocument)).toEqual([]);
    const diagram = createDiagram(contentStoryDocument);
    expect(diagram.evaluateAt(6000).caption).toBe("Inherited caption");
    const facts = (time: number) => diagram.evaluateAt(time).nodes.find(({ id }) => id === "facts")!;
    const text = (time: number) => facts(time).contentLayout?.lines.map(({ text }) => text).join("");
    expect(text(999)).toContain("initial");
    for (const time of [1000, 1500, 2000, 2999]) {
      expect(text(time)).toContain("Replacement record");
      expect(text(time)).toContain("verified");
      expect(text(time)).toContain("2030-01-02");
      expect(text(time)).not.toContain("initial");
    }
    expect(facts(3000).labelLines).toEqual(["Plain replacement"]);
    expect(facts(3000).contentLayout).toBeUndefined();
    expect(text(4000)).toContain("Replacement record");
    for (const time of [5000, 6000, 7000]) {
      expect(facts(time).contentLayout).toBeUndefined();
      expect(facts(time).labelLines).toEqual([]);
      expect(facts(time)).toMatchObject({ width: 260, height: 440 });
    }
    expect(text(1000)).toContain("verified");
    expect(diagram.evaluateAt(0).warnings).toEqual([]);
  });
});


it("keeps nested movement, current ports, three route flows and focus independent of content", () => {
  const diagram = createDiagram(contentStoryDocument);
  const frame = diagram.evaluateAt(2500);
  const facts = frame.nodes.find(({ id }) => id === "facts")!;
  expect(facts).toMatchObject({ x: 76, y: 100, width: 250, height: 440 });
  expect(facts.contentLayout?.safeArea).toEqual({ x: 92, y: 144, width: 218, height: 352 });
  expect(frame.edges.map(({ flow }) => Boolean(flow))).toEqual([true, true, true]);
  expect(frame.edges[0]?.path).toMatch(/^M 326 320 /);
  expect(frame.camera).not.toEqual({ x: 0, y: 0, width: 1100, height: 740 });
  const withoutContent = createDiagram({ ...contentStoryDocument,
    nodes: contentStoryDocument.nodes.map(({ content: _content, ...node }) => node),
    scenes: contentStoryDocument.scenes.map((scene) => ({ ...scene, beats: scene.beats.map((beat) => ({ ...beat,
      actions: beat.actions.filter((action) => action.type !== "updateNode" || !("content" in action.value))
    })) }))
  }).evaluateAt(2500);
  expect(frame.edges).toEqual(withoutContent.edges);
  expect(frame.camera).toEqual(withoutContent.camera);
});

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
defineFlowPlayer();
afterEach(() => vi.unstubAllGlobals());
type HostEntry = "browser" | "web-component" | "react" | "vue";
function requireHandle(handle: FlowPlayerHandle | null): FlowPlayerHandle {
  if (!handle) throw new Error("Expected mounted framework handle");
  return handle;
}
function mountStory(entry: HostEntry, host: HTMLElement, options: PlayerOptions, model: DiagramDocument = contentStoryDocument) {
  if (entry === "browser") {
    const player = createPlayer(host, model, options);
    return { player, reload: (model: DiagramDocument) => player.load(model), cleanup: () => player.destroy() };
  }
  if (entry === "web-component") {
    const player = document.createElement("flowsvg-player") as FlowPlayerElement;
    Object.assign(player, options, { document: model });
    host.append(player);
    return { player, reload: (model: DiagramDocument) => { player.document = model; }, cleanup: () => player.remove() };
  }
  if (entry === "react") {
    const root = createRoot(host);
    const handle = { current: null as FlowPlayerHandle | null };
    act(() => root.render(createElement(ReactPlayer, { ...options, document: model, ref: handle })));
    return { player: requireHandle(handle.current), reload: (model: DiagramDocument) => requireHandle(handle.current).load(model), cleanup: () => act(() => root.unmount()) };
  }
  const handle = ref<FlowPlayerHandle | null>(null);
  const app = createApp({ render: () => h(VuePlayer, { ...options, document: model, ref: handle }) });
  app.mount(host);
  return { player: requireHandle(handle.value), reload: (model: DiagramDocument) => requireHandle(handle.value).load(model), cleanup: () => app.unmount() };
}
describe.each<HostEntry>(["browser", "web-component", "react", "vue"])("shared content through %s", (entry) => {
  it("consumes document typography through the same core frame and reloads its size context", () => {
    const model: DiagramDocument = { ...contentStoryDocument, typography: { nodeLabel: 32, edgeLabel: 24, flowLabel: 20 } };
    const host = document.createElement("div"); document.body.append(host);
    const { player, reload, cleanup } = mountStory(entry, host, { controls: false, reducedMotion: false }, model);
    try {
      for (const time of [0, 1000, 2500, 3000, 4000]) {
        player.seek(time);
        expect(player.getState()?.frame).toEqual(createDiagram(model).evaluateAt(time, { reducedMotion: false }));
        expect(host.querySelector("svg text[font-size='32'], svg tspan[font-size='40']")).not.toBeNull();
      }
      reload({ ...model, typography: { nodeLabel: 20 } });
      expect(player.getState()?.frame).toEqual(createDiagram({ ...model, typography: { nodeLabel: 20 } }).evaluateAt(0));
      expect(host.querySelector("svg tspan[font-size='25']")).not.toBeNull();
    } finally { cleanup(); host.remove(); }
  });
  it.each<PlayerOptions>([
    { theme: "light", reducedMotion: false }, { theme: "dark", reducedMotion: false },
    { theme: "light", reducedMotion: true }, { theme: "dark", reducedMotion: true }
  ])("keeps core frames and SVG through playback, modes and cleanup for %j", (options) => {
    const callbacks = new Map<number, FrameRequestCallback>();
    let nextHandle = 0;
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callbacks.set(++nextHandle, callback); return nextHandle;
    });
    vi.stubGlobal("cancelAnimationFrame", (handle: number) => callbacks.delete(handle));
    const tick = (time: number) => {
      for (const [handle, callback] of [...callbacks]) if (callbacks.delete(handle)) callback(time);
    };
    const host = document.createElement("div"); document.body.append(host);
    const { player, cleanup } = mountStory(entry, host, { ...options, controls: false });
    const diagram = createDiagram(contentStoryDocument);
    const assertFrame = (time: number) => {
      expect(player.getState()?.timeMs).toBe(time);
      expect(player.getState()?.frame).toEqual(diagram.evaluateAt(time, options));
      const expected = document.createElement("div"); expected.innerHTML = diagram.renderSvg(time, options);
      expect(host.querySelector("svg")?.outerHTML).toBe(expected.querySelector("svg")?.outerHTML);
      expect(host.querySelectorAll("[data-flow-id]")).toHaveLength(!options.reducedMotion && time >= 2000 && time < 3000 ? 3 : 0);
    };
    try {
      player.seek(900); player.setSpeed(2); player.play(); tick(0); tick(100); assertFrame(1100);
      expect(host.querySelector("[data-content-id=facts]")?.textContent).toContain("verified");
      player.pause(); tick(200); assertFrame(1100);
      for (const time of [0, 999, 1000, 1999, 2000, 2500, 3000, 4000, 5000, 6000, 7000, 1000]) {
        player.seek(time); assertFrame(time);
        expect(host.querySelector("[data-content-id=facts]") === null).toBe(time === 3000 || time >= 5000);
      }
      expect(player.getState()?.speed).toBe(2);
      expect(player.getState()?.totalDuration).toBe(7000);
      player.play();
    } finally { cleanup(); host.remove(); }
    expect(callbacks.size).toBe(0);
  });
});
