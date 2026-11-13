// @vitest-environment jsdom
import { createApp, h, nextTick, ref, shallowRef } from "vue";
import { renderToString } from "vue/server-renderer";
import { describe, expect, it } from "vitest";
import { FlowPlayer, type FlowPlayerHandle } from "../vue.js";
import type { DiagramDocument, EmphasisColors } from "../index.js";
import type { PlayerErrorDetail } from "../browser.js";

const staticDocument = {
  version: 1,
  viewport: { width: 320, height: 180 },
  nodes: [],
  edges: [],
  scenes: []
} as const;

const narrativeDocument = {
  ...staticDocument,
  scenes: [{ id: "scene", label: "Scene", beats: [{ durationMs: 1_000, actions: [] }] }]
} as const;

describe("Vue entry", () => {
  it("propagates invalid emphasis through Vue hook errors without mounting browser resources", () => {
    const host = window.document.createElement("div");
    const errors: unknown[] = [];
    const app = createApp({ render: () => h(FlowPlayer, {
      document: narrativeDocument, emphasis: { fill: null } as unknown as EmphasisColors
    }) });
    app.config.errorHandler = (error) => errors.push(error);
    try {
      app.mount(host);
      expect(errors).toHaveLength(1);
      expect(errors[0]).toBeInstanceOf(TypeError);
      expect((errors[0] as Error).message).toContain("options.emphasis.fill");
      expect(host.querySelector("svg")).toBeNull();
    } finally { app.unmount(); }
    expect(host.childElementCount).toBe(0);
  });

  it("snapshots emphasis and rebuilds on replacement or clearing without reapplying initial time", async () => {
    const document: DiagramDocument = { version: 1, viewport: { width: 320, height: 180 },
      emphasis: { fill: "#fff4db", stroke: "#b45309" },
      nodes: [{ id: "node", kind: "rect", x: 20, y: 20, width: 100, height: 60 }], edges: [],
      scenes: [{ id: "s", label: "Scene", beats: [{ durationMs: 1000, transitionMs: 0, actions: [{ type: "highlight", target: "node" }] }] }] };
    const host = window.document.createElement("div");
    const handle = shallowRef<FlowPlayerHandle>();
    const first: EmphasisColors = { stroke: "#123456" };
    const emphasis = shallowRef<EmphasisColors | undefined>(first);
    const currentDocument = shallowRef(document);
    const app = createApp({ render: () => h(FlowPlayer, { ref: handle, document: currentDocument.value, emphasis: emphasis.value,
      initialTimeMs: 250, reducedMotion: false, controls: false, loop: true, speed: 2 }) });
    const paint = () => handle.value!.getState().frame.nodes[0]!.style;
    try {
      app.mount(host);
      expect(paint()).toMatchObject({ fill: "#fff4db", stroke: "#123456" });
      expect(handle.value?.getState().timeMs).toBe(250);
      first.stroke = "#abcdef";
      handle.value?.seek(500);
      await nextTick();
      expect(paint().stroke).toBe("#123456");
      const oldSvg = host.querySelector("svg");
      emphasis.value = { fill: "#aabbcc" };
      await nextTick();
      expect(host.querySelector("svg")).not.toBe(oldSvg);
      expect(handle.value?.getState()).toMatchObject({ timeMs: 0, playing: false, speed: 2, loop: true });
      expect(paint()).toMatchObject({ fill: "#aabbcc", stroke: "#b45309" });
      emphasis.value = { stroke: "#234567" };
      await nextTick();
      currentDocument.value = { ...document, emphasis: { fill: "#ddeeff", stroke: "#778899" } };
      await nextTick();
      expect(paint()).toMatchObject({ fill: "#ddeeff", stroke: "#234567" });
      emphasis.value = undefined;
      currentDocument.value = { ...document };
      await nextTick();
      expect(paint()).toMatchObject({ fill: "#fff4db", stroke: "#b45309" });
      currentDocument.value = { ...document, emphasis: undefined, theme: "dark" };
      await nextTick();
      expect(paint()).toMatchObject({ fill: "#233b60", stroke: "#8ab4f8" });
    } finally { app.unmount(); }
    expect(host.childElementCount).toBe(0);
  });

  it("notifies onError exactly once for a failed document load and retains the frame", () => {
    const host = window.document.createElement("div");
    window.document.body.append(host);
    const handle = ref<FlowPlayerHandle | null>(null);
    const errors: PlayerErrorDetail[] = [];
    const app = createApp({
      render: () => h(FlowPlayer, {
        document: narrativeDocument, controls: false, reducedMotion: false, ref: handle,
        onError: (error: PlayerErrorDetail) => errors.push(error)
      })
    });

    try {
      app.mount(host);
      handle.value?.seek(250);
      handle.value?.load({ ...narrativeDocument, viewport: { width: 0, height: 180 } });
      expect(errors).toHaveLength(1);
      expect(errors[0]?.error.name).toBe("DiagramValidationError");
      expect(handle.value?.getState().timeMs).toBe(250);
      handle.value?.load(narrativeDocument);
      expect(errors).toHaveLength(1);
      expect(handle.value?.getState().timeMs).toBe(0);
    } finally {
      app.unmount();
      host.remove();
    }
  });

  it("updates loop mode without rebuilding or losing position and emits each change once", async () => {
    const host = window.document.createElement("div");
    const handle = ref<FlowPlayerHandle | null>(null);
    const loop = ref(true);
    const changes: boolean[] = [];
    const app = createApp({ render: () => h(FlowPlayer, {
      document: narrativeDocument, reducedMotion: false, ref: handle, loop: loop.value,
      onLoopChange: (state: { loop: boolean }) => changes.push(state.loop)
    }) });
    try {
      app.mount(host);
      expect(handle.value?.getState().loop).toBe(true);
      handle.value?.seek(250);
      const svg = host.querySelector("svg");
      loop.value = false;
      await nextTick();
      expect(handle.value?.getState()).toMatchObject({ timeMs: 250, loop: false });
      expect(host.querySelector("svg")).toBe(svg);
      handle.value?.setLoop(true);
      expect(changes).toEqual([false, true]);
    } finally { app.unmount(); }
  });

  it("can render on the server without touching the DOM", async () => {
    const markup = await renderToString(h(FlowPlayer, { document: staticDocument }));
    expect(markup).toContain("flowsvg");
  });

  it("exposes the imperative player contract and applies initial time once", async () => {
    const host = window.document.createElement("div");
    window.document.body.append(host);
    const handle = ref<FlowPlayerHandle | null>(null);
    const app = createApp({
      setup() {
        return () => h(FlowPlayer, {
          document: narrativeDocument,
          initialTimeMs: 250,
          controls: false,
          reducedMotion: false,
          ref: handle
        });
      }
    });

    app.mount(host);
    expect(host.querySelector("svg")).not.toBeNull();
    expect(handle.value?.getState().timeMs).toBe(250);

    app.unmount();
    expect(host.childElementCount).toBe(0);
    window.document.body.removeChild(host);
  });

  it("reloads changed documents and forwards player events", async () => {
    const host = window.document.createElement("div");
    window.document.body.append(host);
    const states: number[] = [];
    const handle = ref<FlowPlayerHandle | null>(null);
    const currentDocument = ref(narrativeDocument);
    const app = createApp({
      setup() {
        return () => h(FlowPlayer, {
          document: currentDocument.value,
          controls: false,
          reducedMotion: false,
          ref: handle,
          onTimeUpdate: (state: { timeMs: number }) => states.push(state.timeMs)
        });
      }
    });

    app.mount(host);
    handle.value?.seek(100);
    expect(states).toContain(100);
    currentDocument.value = staticDocument;
    await nextTick();
    expect(handle.value?.getState().timeMs).toBe(0);
    app.unmount();
    expect(states.length).toBeGreaterThan(0);
    window.document.body.removeChild(host);
  });
});

