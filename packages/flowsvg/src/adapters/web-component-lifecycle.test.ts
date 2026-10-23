// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { FLOW_PLAYER_TAG, defineFlowPlayer, type FlowPlayerElement } from "../web-component.js";
import type { DiagramDocument } from "../index.js";

const document: DiagramDocument = {
  version: 1,
  viewport: { width: 320, height: 180 },
  nodes: [],
  edges: [],
  scenes: [{ id: "scene", label: "Scene", beats: [{ durationMs: 1000, actions: [] }] }]
};

defineFlowPlayer();
afterEach(() => vi.unstubAllGlobals());

describe.each([
  { option: "hoverFill", change: (element: FlowPlayerElement) => { element.hoverFill = true; } },
  { option: "theme", change: (element: FlowPlayerElement) => { element.theme = "dark"; } },
  { option: "controls", change: (element: FlowPlayerElement) => { element.controls = false; } },
  { option: "reducedMotion", change: (element: FlowPlayerElement) => { element.reducedMotion = true; } }
])("Web Component $option changes", ({ change }) => {
  it.each([false, true])("preserves the current playing=%s state instead of reapplying autoplay", (playing) => {
    vi.stubGlobal("requestAnimationFrame", () => 1);
    vi.stubGlobal("cancelAnimationFrame", () => {});
    const element = window.document.createElement(FLOW_PLAYER_TAG) as FlowPlayerElement;
    element.autoplay = true;
    element.reducedMotion = false;
    element.document = document;

    try {
      window.document.body.append(element);
      expect(element.getState()?.playing).toBe(true);
      if (!playing) element.pause();
      element.seek(200);
      change(element);
      expect(element.getState()?.playing).toBe(playing);
      expect(element.getState()?.timeMs).toBe(200);
    } finally {
      element.remove();
    }
    expect(element.getState()).toBeUndefined();
  });
});

describe("Web Component loop mode", () => {
  it("reflects initial and dynamic loop options without rebuilding, and forwards loopchange once", () => {
    const element = window.document.createElement(FLOW_PLAYER_TAG) as FlowPlayerElement;
    element.reducedMotion = false;
    element.setAttribute("loop", "");
    element.document = document;
    const changes: boolean[] = [];
    element.addEventListener("loopchange", (event) => changes.push((event as CustomEvent<{ loop: boolean }>).detail.loop));
    try {
      window.document.body.append(element);
      expect(element.getState()?.loop).toBe(true);
      element.seek(250);
      const svg = element.querySelector("svg");
      element.loop = false;
      expect(element.getState()).toMatchObject({ timeMs: 250, loop: false });
      expect(element.querySelector("svg")).toBe(svg);
      element.setLoop(true);
      expect(element.loop).toBe(true);
      expect(changes).toEqual([false, true]);
      element.theme = "dark";
      expect(element.getState()?.loop).toBe(true);
    } finally { element.remove(); }
  });
});
