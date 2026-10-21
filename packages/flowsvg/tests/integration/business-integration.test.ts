// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { createApp, h, ref } from "vue";
import { afterEach, describe, expect, it, vi } from "vitest";
import { documentModel } from "../fixtures/parallel-transfers.js";
import { createDiagram } from "../../src/index.js";
import { createPlayer, type PlayerOptions } from "../../src/browser.js";
import { FlowPlayer as ReactPlayer, type FlowPlayerHandle } from "../../src/react.js";
import { FlowPlayer as VuePlayer } from "../../src/vue.js";
import { defineFlowPlayer, type FlowPlayerElement } from "../../src/web-component.js";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
defineFlowPlayer();
afterEach(() => vi.unstubAllGlobals());

type HostEntry = "browser" | "web-component" | "react" | "vue";

function mountPlayer(entry: HostEntry, host: HTMLElement, options: PlayerOptions) {
  if (entry === "browser") {
    const player = createPlayer(host, documentModel, options);
    return { player, cleanup: () => player.destroy() };
  }
  if (entry === "web-component") {
    const player = window.document.createElement("flowsvg-player") as FlowPlayerElement;
    Object.assign(player, options, { document: documentModel });
    host.append(player);
    return { player, cleanup: () => player.remove() };
  }
  if (entry === "react") {
    const root = createRoot(host);
    const handle = { current: null as FlowPlayerHandle | null };
    act(() => root.render(createElement(ReactPlayer, { ...options, document: documentModel, ref: handle })));
    return { player: requireHandle(handle.current), cleanup: () => act(() => root.unmount()) };
  }
  const handle = ref<FlowPlayerHandle | null>(null);
  const app = createApp({ render: () => h(VuePlayer, { ...options, document: documentModel, ref: handle }) });
  app.mount(host);
  return { player: requireHandle(handle.value), cleanup: () => app.unmount() };
}

function requireHandle(handle: FlowPlayerHandle | null): FlowPlayerHandle {
  if (!handle) throw new Error("Expected the framework player to mount");
  return handle;
}

describe.each<HostEntry>(["browser", "web-component", "react", "vue"])("SDK parallel transfers through %s", (entry) => {
  it.each<PlayerOptions>([
    { theme: "light", reducedMotion: false },
    { theme: "dark", reducedMotion: false },
    { theme: "light", reducedMotion: true },
    { theme: "dark", reducedMotion: true }
  ])("shares seek, speed and pause behavior with core for %j", (visualOptions) => {
    const callbacks = new Map<number, FrameRequestCallback>();
    let nextHandle = 0;
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callbacks.set(++nextHandle, callback);
      return nextHandle;
    });
    vi.stubGlobal("cancelAnimationFrame", (handle: number) => callbacks.delete(handle));
    const tick = (timestamp: number) => {
      for (const [handle, callback] of [...callbacks]) {
        if (callbacks.delete(handle)) callback(timestamp);
      }
    };
    const host = window.document.createElement("div");
    window.document.body.append(host);
    const { player, cleanup } = mountPlayer(entry, host, { ...visualOptions, controls: false });
    const diagram = createDiagram(documentModel);
    const assertFrame = (timeMs: number, count: number) => {
      expect(player.getState()?.timeMs).toBe(timeMs);
      expect(player.getState()?.frame).toEqual(diagram.evaluateAt(timeMs, visualOptions));
      const expected = window.document.createElement("div");
      expected.innerHTML = diagram.renderSvg(timeMs, visualOptions);
      expect(host.querySelector("svg")?.outerHTML).toBe(expected.querySelector("svg")?.outerHTML);
      expect(host.querySelectorAll("[data-flow-id]")).toHaveLength(visualOptions.reducedMotion ? 0 : count);
    };
    try {
      player.seek(600);
      assertFrame(600, 3);
      player.setSpeed(2);
      player.play();
      tick(0);
      tick(300);
      assertFrame(1200, 3);
      player.pause();
      tick(600);
      assertFrame(1200, 3);
      for (const [timeMs, count] of [[2399, 3], [2400, 2], [3600, 2], [4800, 2], [6000, 2], [7200, 0], [8200, 0], [600, 3]]) {
        player.seek(timeMs);
        assertFrame(timeMs, count);
      }
      expect(player.getState()?.speed).toBe(2);
      expect(player.getState()?.totalDuration).toBe(8200);
    } finally {
      cleanup();
      host.remove();
    }
    expect(callbacks.size).toBe(0);
  });
});
