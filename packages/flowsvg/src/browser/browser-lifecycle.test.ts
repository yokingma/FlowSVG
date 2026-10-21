// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createPlayer } from "../browser.js";
import type { DiagramDocument } from "../index.js";

const document: DiagramDocument = {
  version: 1,
  viewport: { width: 320, height: 180 },
  nodes: [],
  edges: [],
  scenes: [{ id: "scene", label: "Scene", beats: [{ durationMs: 1000, actions: [] }] }]
};

afterEach(() => vi.unstubAllGlobals());

describe("browser playback lifecycle", () => {
  it.each(["timeupdate", "playstatechange"])("keeps one animation loop when %s restarts playback", (eventName) => {
    const callbacks = new Map<number, FrameRequestCallback>();
    let handle = 0;
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      const nextHandle = ++handle;
      callbacks.set(nextHandle, callback);
      return nextHandle;
    });
    vi.stubGlobal("cancelAnimationFrame", (id: number) => callbacks.delete(id));
    const host = window.document.createElement("div");
    const player = createPlayer(host, document, { controls: false, reducedMotion: false });
    let restarted = false;
    let updates = 0;
    host.addEventListener(eventName, () => {
      if (restarted || !player.getState().playing) return;
      restarted = true;
      player.pause();
      player.play();
    });
    host.addEventListener("timeupdate", () => { updates += 1; });

    try {
      player.play();
      for (const timestamp of [0, 16, 32]) {
        for (const [id, callback] of [...callbacks]) {
          if (callbacks.delete(id)) callback(timestamp);
        }
        expect(callbacks.size).toBe(1);
      }
      expect(updates).toBe(3);
      expect(player.getState().playing).toBe(true);
    } finally {
      player.destroy();
    }
    expect(callbacks.size).toBe(0);
  });
});
