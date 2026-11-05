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

describe("Web Component interaction events", () => {
  it("forwards hover, click and their aliases from the wrapped player", () => {
    const element = window.document.createElement(FLOW_PLAYER_TAG) as FlowPlayerElement;
    element.controls = false;
    element.reducedMotion = false;
    element.document = {
      version: 1,
      viewport: { width: 200, height: 120 },
      nodes: [{ id: "node", kind: "rect", x: 20, y: 30, width: 80, height: 50 }],
      edges: [],
      scenes: []
    };
    const events = new Map<string, unknown[]>();
    for (const name of ["hover", "objecthover", "click", "objectclick"] as const) {
      const received: unknown[] = [];
      events.set(name, received);
      element.addEventListener(name, (event) => received.push((event as CustomEvent).detail));
    }

    try {
      window.document.body.append(element);
      const svg = element.querySelector<SVGElement>("svg");
      if (!svg) throw new Error("Expected the Web Component SVG");
      svg.getBoundingClientRect = () => ({
        x: 0, y: 0, left: 0, top: 0, right: 200, bottom: 120, width: 200, height: 120,
        toJSON: () => ({})
      });
      const canvas = element.querySelector<HTMLElement>(".flowsvg-canvas");
      if (!canvas) throw new Error("Expected the Web Component canvas");
      canvas.dispatchEvent(new MouseEvent("pointermove", { bubbles: true, clientX: 40, clientY: 50 }));
      canvas.dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: 40, clientY: 50 }));

      for (const name of ["hover", "objecthover", "click", "objectclick"] as const) {
        expect(events.get(name)).toEqual([expect.objectContaining({ id: "node", type: "node" })]);
      }
    } finally {
      element.remove();
    }
  });
});
