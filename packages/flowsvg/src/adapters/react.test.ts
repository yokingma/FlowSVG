// @vitest-environment jsdom
import { createElement } from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FlowPlayer, type FlowPlayerHandle } from "../react.js";

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
  it.each([
    { theme: "dark" },
    { hoverFill: true },
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
