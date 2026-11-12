// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createPlayer } from "../browser.js";
import { createDiagram, type DiagramDocument } from "../index.js";

afterEach(() => vi.unstubAllGlobals());

describe("parallel transfer playback", () => {
  it("keeps paused, seeked, and speed-adjusted groups equal to direct core evaluation", () => {
    const document: DiagramDocument = {
      version: 1,
      viewport: { width: 500, height: 300 },
      nodes: [
        { id: "source", kind: "rect", x: 20, y: 70, width: 80, height: 60 },
        { id: "target", kind: "rect", x: 400, y: 70, width: 80, height: 60 },
        { id: "bottom", kind: "rect", x: 220, y: 220, width: 80, height: 60 }
      ],
      edges: [
        { id: "first", from: "source", to: "target", label: "Relationship", style: { stroke: "#c2410a", dashed: true } },
        { id: "second", from: "source", to: "bottom" },
        { id: "third", from: "bottom", to: "target" },
        { id: "fourth", from: "target", to: "source" },
        { id: "fifth", from: "target", to: "bottom" }
      ],
      scenes: [{ id: "transfer", label: "Transfer", beats: [
        { durationMs: 1000, actions: [
          { type: "flow", target: "first", direction: "forward", highlightEdge: false },
          { type: "flow", target: "second", direction: "reverse" },
          { type: "flow", target: "third", direction: "forward" }
        ] },
        { durationMs: 1000, actions: [
          { type: "flow", target: "fourth", direction: "reverse" },
          { type: "flow", target: "fifth", direction: "forward" }
        ] }
      ] }]
    };
    const callbacks = new Map<number, FrameRequestCallback>();
    let nextHandle = 0;
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      nextHandle += 1;
      callbacks.set(nextHandle, callback);
      return nextHandle;
    });
    vi.stubGlobal("cancelAnimationFrame", (handle: number) => callbacks.delete(handle));
    const host = window.document.createElement("div");
    const player = createPlayer(host, document, { controls: false, reducedMotion: false });
    const diagram = createDiagram(document);
    const tick = (timestamp: number): void => {
      for (const [handle, callback] of [...callbacks]) {
        if (callbacks.delete(handle)) callback(timestamp);
      }
    };
    const expectCoreFrame = (timeMs: number, count: number): void => {
      expect(player.getState().frame).toEqual(diagram.evaluateAt(timeMs));
      const expected = window.document.createElement("div");
      expected.innerHTML = diagram.renderSvg(timeMs);
      expect(host.querySelector("svg")?.outerHTML).toBe(expected.querySelector("svg")?.outerHTML);
      expect(host.querySelectorAll("[data-flow-id]")).toHaveLength(count);
      expect(host.querySelector('[data-id="first"]')?.getAttribute("stroke")).toBe("#c2410a");
      expect(host.querySelector('[data-id="first"]')?.getAttribute("stroke-dasharray")).toBe("6 4");
    };
    try {
      player.seek(250);
      expectCoreFrame(250, 3);
      player.setSpeed(2);
      player.play();
      tick(0);
      tick(125);
      expectCoreFrame(500, 3);
      player.pause();
      tick(250);
      expectCoreFrame(500, 3);
      player.seek(1000);
      expectCoreFrame(1000, 2);
      player.seek(250);
      expectCoreFrame(250, 3);
      player.seek(2000);
      expectCoreFrame(2000, 0);
    } finally {
      player.destroy();
    }
    expect(callbacks.size).toBe(0);
  });
});
