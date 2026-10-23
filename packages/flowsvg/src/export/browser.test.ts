import { afterEach, expect, it, vi } from "vitest";
import { CompiledTimeline } from "../core/timeline.js";
import type { DiagramDocument } from "../core/model.js";
import { exportGif } from "./browser.js";

const documentInput: DiagramDocument = {
  version: 1,
  viewport: { width: 80, height: 40 },
  nodes: [{ id: "node", kind: "rect", x: 0, y: 0, width: 20, height: 20 }],
  edges: [],
  scenes: []
};

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

/** Browser services are the external seam; core evaluation and caption selection run unchanged. */
function installBrowserServices(): string[] {
  const captions: string[] = [];
  const context = {
    measureText: (text: string) => ({ width: text.length }),
    fillRect() {}, drawImage() {},
    fillText(text: string) { captions.push(text); },
    getImageData: () => ({ data: new Uint8ClampedArray(4) })
  };
  vi.stubGlobal("document", {
    createElement: () => ({ width: 0, height: 0, getContext: () => context }),
    fonts: { load: async () => [], ready: Promise.resolve() }
  });
  vi.stubGlobal("Image", class { src = ""; async decode() {} });
  vi.stubGlobal("Worker", class extends EventTarget {
    postMessage(message: { type: string }) {
      queueMicrotask(() => this.dispatchEvent(new MessageEvent("message", {
        data: message.type === "finish" ? { bytes: new Uint8Array([71, 73, 70]) } : {}
      })));
    }
    terminate() {}
  });
  return captions;
}

it.each([
  { name: "untitled static", title: undefined, timed: false, includeCaptions: true, expectedCaptions: [""] },
  { name: "titled static", title: "Title", timed: false, includeCaptions: true, expectedCaptions: ["Title"] },
  { name: "untitled static without captions", title: undefined, timed: false, includeCaptions: false, expectedCaptions: [] },
  { name: "titled static without captions", title: "Title", timed: false, includeCaptions: false, expectedCaptions: [] },
  { name: "timed", title: "Title", timed: true, includeCaptions: true, expectedCaptions: ["First", "First", "Second", "Second", "Second"] },
  { name: "timed without captions", title: "Title", timed: true, includeCaptions: false, expectedCaptions: [] }
])("evaluates each $name GIF sample once and preserves its caption", async ({ title, timed, includeCaptions, expectedCaptions }) => {
  const captions = installBrowserServices();
  // Count actual timeline work, including fallback calls through Diagram.evaluateAt.
  const evaluations = vi.spyOn(CompiledTimeline.prototype, "evaluateAt");
  const sampledTimes: number[] = [];
  const input: DiagramDocument = {
    ...documentInput,
    ...(title ? { title } : {}),
    scenes: timed ? [{ id: "scene", label: "Scene", beats: [
      { durationMs: 500, caption: "First", actions: [] },
      { durationMs: 500, caption: "Second", actions: [] }
    ] }] : []
  };
  const bytes = await exportGif(input, {
    fps: 4, finalHoldMs: 0, includeCaptions,
    onProgress: ({ phase }) => { if (phase === "sampling") sampledTimes.push(evaluations.mock.calls.length); }
  });
  expect(bytes).toEqual(new Uint8Array([71, 73, 70]));
  expect(sampledTimes).toHaveLength(timed ? 5 : 1);
  expect(evaluations.mock.calls.map(([timeMs]) => timeMs)).toEqual(timed ? [0, 250, 500, 750, 1000] : [0]);
  expect(captions).toEqual(expectedCaptions);
});
