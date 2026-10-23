// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createPlayer } from "../browser.js";
import type { DiagramDocument } from "../index.js";

// The rectangle boundaries leave a 360-unit straight path: 2 seconds at 180 units/second.
const document: DiagramDocument = {
  version: 1, viewport: { width: 500, height: 120 },
  nodes: [
    { id: "a", kind: "rect", x: 20, y: 20, width: 40, height: 40 },
    { id: "b", kind: "rect", x: 420, y: 20, width: 40, height: 40 }
  ],
  edges: [{ id: "transfer", from: "a", to: "b", route: "straight" }],
  scenes: [
    { id: "transfer", label: "Transfer", beats: [
      { durationMs: 100, transitionMs: 0, caption: "Moving", actions: [{ type: "flow", target: "transfer", direction: "forward" }] },
      { durationMs: 300, caption: "Received", actions: [] }
    ] },
    { id: "done", label: "Done", beats: [{ durationMs: 200, caption: "Done", actions: [] }] }
  ]
};

afterEach(() => Reflect.deleteProperty(window.HTMLElement.prototype, "scrollIntoView"));

describe("compiled playback schedule", () => {
  it("steps to effective beat starts and refreshes the schedule after load", () => {
    const player = createPlayer(window.document.createElement("div"), document, { reducedMotion: false });
    try {
      player.step(1);
      expect(player.getState()).toMatchObject({ timeMs: 2500, totalDuration: 3000, frame: { caption: "Received" } });
      player.step(1);
      expect(player.getState()).toMatchObject({ timeMs: 2800, frame: { sceneId: "done" } });
      player.step(-1);
      expect(player.getState().timeMs).toBe(2500);
      player.load({ ...document, scenes: [{ id: "replacement", label: "Replacement", beats: [
        { durationMs: 70, actions: [] }, { durationMs: 80, actions: [] }
      ] }] });
      player.step(1);
      expect(player.getState()).toMatchObject({ timeMs: 70, totalDuration: 150 });
      player.load(document);
      player.step(1);
      expect(player.getState()).toMatchObject({ timeMs: 2500, totalDuration: 3000 });
    } finally { player.destroy(); }
  });

  it("selects the next scene at its effective start", () => {
    Object.defineProperty(window.HTMLElement.prototype, "scrollIntoView", { configurable: true, value: vi.fn() });
    const host = window.document.createElement("div");
    const player = createPlayer(host, document, { reducedMotion: true });
    try {
      host.querySelector<HTMLButtonElement>('[role="combobox"][aria-label="Scene"]')?.click();
      host.querySelector<HTMLElement>('[role="option"][data-value="done"]')?.click();
      expect(player.getState()).toMatchObject({ timeMs: 2800, frame: { sceneId: "done", caption: "Done" } });
    } finally { player.destroy(); }
  });
});
