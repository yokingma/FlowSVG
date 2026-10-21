// @vitest-environment jsdom
import { createApp, h, nextTick, ref } from "vue";
import { renderToString } from "vue/server-renderer";
import { describe, expect, it } from "vitest";
import { FlowPlayer, type FlowPlayerHandle } from "../vue.js";
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

