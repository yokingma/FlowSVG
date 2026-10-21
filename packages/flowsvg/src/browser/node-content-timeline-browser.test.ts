// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createPlayer } from "../browser.js";
import { createDiagram, type DiagramDocument } from "../index.js";

afterEach(() => vi.unstubAllGlobals());

describe("node content playback", () => {
  it.each([false, true])("keeps seek, pause and speed changes equal to direct SVG evaluation (reduced motion: %s)", (reducedMotion) => {
    const document: DiagramDocument = {
      version: 1, viewport: { width: 400, height: 300 },
      nodes: [{ id: "service", kind: "rect", x: 20, y: 20, width: 240, height: 200, label: "Simple" }], edges: [],
      scenes: [{ id: "content", label: "Content", beats: [
        { durationMs: 100, actions: [] },
        { durationMs: 100, transitionMs: 100, actions: [{ type: "updateNode", target: "service", value: {
          content: { blocks: [{ type: "title", text: "Title" }, { type: "paragraph", text: "Body" }] }
        } }] },
        { durationMs: 100, actions: [{ type: "updateNode", target: "service", value: { label: "Next label" } }] },
        { durationMs: 100, actions: [{ type: "updateNode", target: "service", value: { content: null } }] }
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
    const player = createPlayer(host, document, { controls: false, reducedMotion });
    const diagram = createDiagram(document);
    const tick = (timestamp: number): void => {
      for (const [handle, callback] of [...callbacks]) {
        if (callbacks.delete(handle)) callback(timestamp);
      }
    };
    const expectFrame = (timeMs: number, texts: string[], contentPresent: boolean): void => {
      expect(player.getState().frame).toEqual(diagram.evaluateAt(timeMs, { reducedMotion }));
      const expected = window.document.createElement("div");
      expected.innerHTML = diagram.renderSvg(timeMs, { reducedMotion });
      expect(host.querySelector("svg")?.outerHTML).toBe(expected.querySelector("svg")?.outerHTML);
      expect([...host.querySelectorAll("svg text")].map((element) => element.textContent)).toEqual(texts);
      expect(host.querySelectorAll("[data-content-id]")).toHaveLength(Number(contentPresent));
      expect(host.querySelectorAll("clipPath")).toHaveLength(Number(contentPresent));
    };
    try {
      player.seek(99);
      expectFrame(99, ["Simple"], false);
      player.setSpeed(2);
      player.play();
      tick(0);
      tick(0.5);
      expectFrame(100, ["Title", "Body"], true);
      player.pause();
      tick(100);
      expectFrame(100, ["Title", "Body"], true);
      for (const time of [200, 250]) {
        player.seek(time);
        expectFrame(time, ["Next label"], false);
      }
      for (const time of [300, 400]) {
        player.seek(time);
        expectFrame(time, [], false);
      }
      player.seek(100);
      expectFrame(100, ["Title", "Body"], true);
    } finally {
      player.destroy();
    }
    expect(callbacks.size).toBe(0);
    expect(host.children).toHaveLength(0);
  });
});
