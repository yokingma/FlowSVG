// @vitest-environment jsdom
import { createElement } from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FlowPlayer, type FlowPlayerHandle } from "../react.js";
import type { DiagramDocument, EmphasisColors } from "../index.js";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const document = {
  version: 1,
  viewport: { width: 320, height: 180 },
  nodes: [],
  edges: [],
  scenes: []
} as const;

const narrativeDocument = {
  ...document,
  scenes: [{
    id: "scene",
    label: "Scene",
    beats: [{ durationMs: 1_000, actions: [] }]
  }]
} as const;

describe("React entry", () => {
  it("propagates invalid emphasis through React effect errors and releases the host", () => {
    const host = window.document.createElement("div");
    const root = createRoot(host);
    try {
      expect(() => act(() => root.render(createElement(FlowPlayer, {
        document: narrativeDocument, emphasis: { fill: null } as unknown as EmphasisColors
      })))).toThrow(/options.emphasis.fill/);
      expect(host.querySelector("svg")).toBeNull();
    } finally { act(() => root.unmount()); }
  });

  it("snapshots emphasis and rebuilds on replacement or clearing without reapplying initial time", () => {
    const document: DiagramDocument = { version: 1, viewport: { width: 320, height: 180 },
      emphasis: { fill: "#fff4db", stroke: "#b45309" },
      nodes: [{ id: "node", kind: "rect", x: 20, y: 20, width: 100, height: 60 }], edges: [],
      scenes: [{ id: "s", label: "Scene", beats: [{ durationMs: 1000, transitionMs: 0, actions: [{ type: "highlight", target: "node" }] }] }] };
    const host = window.document.createElement("div");
    const root = createRoot(host);
    const ref = { current: null as FlowPlayerHandle | null };
    const first: EmphasisColors = { stroke: "#123456" };
    const props = { ref, document, emphasis: first, initialTimeMs: 250, reducedMotion: false, controls: false, loop: true, speed: 2 };
    const paint = () => ref.current!.getState().frame.nodes[0]!.style;
    try {
      act(() => root.render(createElement(FlowPlayer, props)));
      expect(paint()).toMatchObject({ fill: "#fff4db", stroke: "#123456" });
      expect(ref.current?.getState().timeMs).toBe(250);
      first.stroke = "#abcdef";
      act(() => ref.current?.seek(500));
      expect(paint().stroke).toBe("#123456");
      const oldSvg = host.querySelector("svg");
      act(() => root.render(createElement(FlowPlayer, { ...props, emphasis: { fill: "#aabbcc" } })));
      expect(host.querySelector("svg")).not.toBe(oldSvg);
      expect(ref.current?.getState()).toMatchObject({ timeMs: 0, playing: false, speed: 2, loop: true });
      expect(paint()).toMatchObject({ fill: "#aabbcc", stroke: "#b45309" });
      act(() => root.render(createElement(FlowPlayer, { ...props, emphasis: { stroke: "#234567" } })));
      act(() => ref.current?.load({ ...document, emphasis: { fill: "#ddeeff", stroke: "#778899" } }));
      expect(paint()).toMatchObject({ fill: "#ddeeff", stroke: "#234567" });
      act(() => root.render(createElement(FlowPlayer, { ...props, emphasis: undefined, document: { ...document } })));
      expect(paint()).toMatchObject({ fill: "#fff4db", stroke: "#b45309" });
      act(() => root.render(createElement(FlowPlayer, { ...props, emphasis: undefined, document: { ...document, emphasis: undefined }, theme: "dark" })));
      expect(paint()).toMatchObject({ fill: "#233b60", stroke: "#8ab4f8" });
    } finally { act(() => root.unmount()); }
    expect(host.childElementCount).toBe(0);
  });

  it.each([
    { theme: "dark" },
    { hoverFill: true },
    { emphasis: { stroke: "#123456" } },
    { controls: true },
    { reducedMotion: true }
  ] as const)("retains an unchanged speed prop when creation options change: %j", (options) => {
    const container = window.document.createElement("div");
    window.document.body.append(container);
    const root = createRoot(container);
    const ref = { current: null as FlowPlayerHandle | null };
    const props = {
      ref, document: narrativeDocument, speed: 2, theme: "light", controls: false, reducedMotion: false
    } as const;

    try {
      act(() => root.render(createElement(FlowPlayer, props)));
      expect(ref.current?.getState().speed).toBe(2);
      act(() => root.render(createElement(FlowPlayer, { ...props, ...options })));
      expect(ref.current?.getState().speed).toBe(2);
    } finally {
      act(() => root.unmount());
      container.remove();
    }
  });

  it("updates loop mode without rebuilding or losing position and forwards loop changes", () => {
    const host = window.document.createElement("div");
    const root = createRoot(host);
    const ref = { current: null as FlowPlayerHandle | null };
    const changes: boolean[] = [];
    const props = { ref, document: narrativeDocument, reducedMotion: false, loop: true,
      onLoopChange: (state: { loop: boolean }) => changes.push(state.loop) };
    try {
      act(() => root.render(createElement(FlowPlayer, props)));
      expect(ref.current?.getState().loop).toBe(true);
      act(() => ref.current?.seek(250));
      const svg = host.querySelector("svg");
      act(() => root.render(createElement(FlowPlayer, { ...props, loop: false })));
      expect(ref.current?.getState()).toMatchObject({ loop: false, timeMs: 250 });
      expect(host.querySelector("svg")).toBe(svg);
      act(() => ref.current?.setLoop(true));
      expect(changes).toEqual([false, true]);
    } finally { act(() => root.unmount()); }
  });

  it("can render on the server without touching the DOM", () => {
    const markup = renderToStaticMarkup(createElement(FlowPlayer, { document }));

    expect(markup).toContain("flowsvg");
    expect(markup).toContain("<div");
  });

  it("exports the imperative player handle contract", () => {
    const handle: keyof FlowPlayerHandle = "getState";
    expect(handle).toBe("getState");
  });

  it("mounts a browser player, reloads a document, and cleans up on unmount", () => {
    const container = window.document.createElement("div");
    window.document.body.append(container);
    const root = createRoot(container);
    const ref = { current: null as FlowPlayerHandle | null };

    act(() => {
      root.render(createElement(FlowPlayer, {
        ref,
        document: narrativeDocument,
        initialTimeMs: 250,
        reducedMotion: false,
        controls: false
      }));
    });

    expect(container.querySelector("svg")).not.toBeNull();
    expect(ref.current?.getState().timeMs).toBe(250);

    act(() => {
      root.render(createElement(FlowPlayer, { ref, document, reducedMotion: false, controls: false }));
    });

    expect(ref.current?.getState().timeMs).toBe(0);
    act(() => root.unmount());
    expect(container.childElementCount).toBe(0);
    window.document.body.removeChild(container);
  });
});
