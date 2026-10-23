import type { Browser } from "playwright-core";
import { expect, it, vi } from "vitest";
import { GifExportError, type GifExportProgress } from "../export/types.js";
import type { NodeGifRuntime, NodeGifRuntimeInput, BrowserGifOptions } from "./gif-runtime.js";

const runtimeFactories: Array<(input: NodeGifRuntimeInput) => NodeGifRuntime> = [];
vi.mock("./gif-runtime.js", async () => {
  const actual = await vi.importActual<typeof import("./gif-runtime.js")>("./gif-runtime.js");
  return {
    ...actual,
    createNodeGifRuntime: (input: NodeGifRuntimeInput): NodeGifRuntime => runtimeFactories.shift()?.(input) ?? actual.createNodeGifRuntime(input)
  };
});

const { exportGif } = await import("./gif.js");

const documentInput = {
  version: 1,
  title: "runtime seam",
  viewport: { width: 80, height: 40 },
  nodes: [{ id: "node", kind: "rect", x: 0, y: 0, width: 20, height: 20, label: "node" }],
  edges: [],
  scenes: []
};

class DeterministicRuntime implements NodeGifRuntime {
  readonly events: string[] = [];
  constructor(readonly input: NodeGifRuntimeInput, private readonly result: Uint8Array | Error = new Uint8Array([7])) {}
  async run(_document: typeof documentInput, _options: BrowserGifOptions): Promise<Uint8Array> {
    this.events.push("run");
    this.input.onProgress?.({ phase: "encoding", completed: 1, total: 1 });
    if (this.result instanceof Error) throw this.result;
    return this.result;
  }
  abort(): void { this.events.push("abort"); }
  async dispose(): Promise<void> { this.events.push("dispose"); }
}

it("uses a deterministic runtime seam and disposes it after a successful export", async () => {
  let runtime: DeterministicRuntime | undefined;
  runtimeFactories.push((input) => {
    runtime = new DeterministicRuntime(input, new Uint8Array([1, 2]));
    return runtime;
  });
  const output = await exportGif(documentInput);
  expect(output).toEqual(new Uint8Array([1, 2]));
  expect(runtime?.events).toEqual(["run", "dispose"]);
});

it("maps progress callback failures to encoding and disposes the runtime", async () => {
  let runtime: DeterministicRuntime | undefined;
  runtimeFactories.push((input) => {
    runtime = new DeterministicRuntime(input);
    return runtime;
  });
  await expect(exportGif(documentInput, { onProgress: () => { throw new Error("callback failed"); } })).rejects.toMatchObject({ code: "encoding" });
  expect(runtime?.events).toEqual(["run", "abort", "dispose"]);
});

it("maps cancellation before runtime completion and keeps the caller-owned browser input", async () => {
  const controller = new AbortController();
  let runtime: DeterministicRuntime | undefined;
  const browser = {} as Browser;
  runtimeFactories.push((input) => {
    runtime = new DeterministicRuntime(input, new GifExportError("cancelled", "cancelled"));
    return runtime;
  });
  const pending = exportGif(documentInput, { browser, signal: controller.signal });
  controller.abort();
  await expect(pending).rejects.toMatchObject({ code: "cancelled" });
  expect(runtime?.input.browser).toBe(browser);
  expect(runtime?.events).toEqual(["run", "abort", "dispose"]);
});

it("preserves runtime errors and still disposes after a failed page operation", async () => {
  let runtime: DeterministicRuntime | undefined;
  runtimeFactories.push((input) => {
    runtime = new DeterministicRuntime(input, new GifExportError("encoding", "page failed"));
    return runtime;
  });
  await expect(exportGif(documentInput)).rejects.toMatchObject({ code: "encoding", message: "page failed" });
  expect(runtime?.events).toEqual(["run", "dispose"]);
});

it("does not forward progress after the signal is cancelled", async () => {
  const controller = new AbortController();
  const phases: GifExportProgress["phase"][] = [];
  runtimeFactories.push((input) => ({
    async run(): Promise<Uint8Array> {
      controller.abort();
      input.onProgress?.({ phase: "complete", completed: 1, total: 1 });
      throw new GifExportError("cancelled", "cancelled");
    },
    abort() {},
    async dispose() {}
  }));
  await expect(exportGif(documentInput, { signal: controller.signal, onProgress: (progress) => phases.push(progress.phase) })).rejects.toMatchObject({ code: "cancelled" });
  expect(phases).toEqual([]);
});
