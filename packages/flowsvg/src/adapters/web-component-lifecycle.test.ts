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
