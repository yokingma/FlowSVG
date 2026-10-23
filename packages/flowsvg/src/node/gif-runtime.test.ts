import type { Browser, BrowserContext, Page } from "playwright-core";
import { access, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { createNodeGifRuntime, type NodeGifRuntime } from "./gif-runtime.js";
import { GifExportError } from "../export/types.js";

vi.mock("node:fs/promises", async (importOriginal) => {
  const original = await importOriginal<typeof import("node:fs/promises")>();
  return { ...original, mkdtemp: vi.fn(original.mkdtemp) };
});

const documentInput = {
  version: 1,
  title: "runtime",
  viewport: { width: 80, height: 40 },
  nodes: [{ id: "node", kind: "rect", x: 0, y: 0, width: 20, height: 20, label: "node" }],
  edges: [],
  scenes: []
} as const;

const runtimes: NodeGifRuntime[] = [];
afterEach(async () => { await Promise.all(runtimes.splice(0).map((runtime) => runtime.dispose())); });

function browserFixture(evaluate: () => unknown | Promise<unknown>): { browser: Browser; context: { closeCount: number }; page: { progress: (value: unknown) => Promise<void> } } {
  let progressHandler: ((value: unknown) => void) | undefined;
  const context = {
    closeCount: 0,
    async newPage(): Promise<Page> {
      return {
        async exposeFunction(_name: string, handler: (value: unknown) => void) { progressHandler = handler; },
        async goto() { return undefined; },
        async evaluate() { return await evaluate(); }
      } as unknown as Page;
    },
    async close() { context.closeCount += 1; }
  };
  const browser = {
    async newContext() { return context as unknown as BrowserContext; },
    async close() { throw new Error("caller-owned browser must not close"); }
  } as unknown as Browser;
  return { browser, context, page: { progress: async (value) => { progressHandler?.(value); } } };
}

it("runs the portable exporter and releases its task context without closing a caller-owned browser", async () => {
  const phases: string[] = [];
  const fixture = browserFixture(() => {
    void fixture.page.progress({ phase: "sampling", completed: 1, total: 1 });
    return { bytes: [1, 2, 3] };
  });
  const runtime = createNodeGifRuntime({ browser: fixture.browser, onProgress: (progress) => phases.push(progress.phase), portableExportScript: "" });
  runtimes.push(runtime);
  await expect(runtime.run(documentInput, {})).resolves.toEqual(new Uint8Array([1, 2, 3]));
  await runtime.dispose();
  expect(fixture.context.closeCount).toBe(1);
  expect(phases).toEqual(["sampling"]);
});

it("preserves exporter failures while still allowing deterministic cleanup", async () => {
  const fixture = browserFixture(() => ({ error: { code: "encoding", message: "encoder failed" } }));
  const runtime = createNodeGifRuntime({ browser: fixture.browser, portableExportScript: "" });
  runtimes.push(runtime);
  await expect(runtime.run(documentInput, {})).rejects.toMatchObject({ code: "encoding", message: "encoder failed" });
  expect(fixture.context.closeCount).toBe(0);
  await runtime.dispose();
  expect(fixture.context.closeCount).toBe(1);
});

it("interrupts a pending page evaluation when cancelled", async () => {
  let rejectEvaluation!: (error: unknown) => void;
  const fixture = browserFixture(() => new Promise<never>((_, reject) => { rejectEvaluation = reject; }));
  const controller = new AbortController();
  const runtime = createNodeGifRuntime({ browser: fixture.browser, signal: controller.signal, portableExportScript: "" });
  runtimes.push(runtime);
  const pending = runtime.run(documentInput, {});
  for (let attempt = 0; attempt < 20 && !rejectEvaluation; attempt += 1) await new Promise((resolve) => setTimeout(resolve, 1));
  expect(rejectEvaluation).toBeTypeOf("function");
  controller.abort();
  rejectEvaluation?.(new GifExportError("cancelled", "cancelled"));
  await expect(pending).rejects.toMatchObject({ code: "cancelled" });
  expect(fixture.context.closeCount).toBeGreaterThanOrEqual(1);
});

it("interrupts a pending page load when cancelled", async () => {
  const controller = new AbortController();
  let resolveLoad!: () => void;
  const context = {
    async newPage(): Promise<Page> {
      return {
        async exposeFunction() {},
        async goto() { await new Promise<void>((resolve) => { resolveLoad = resolve; }); }
      } as unknown as Page;
    },
    async close() {}
  } as unknown as BrowserContext;
  const browser = { async newContext() { return context; }, async close() {} } as unknown as Browser;
  const runtime = createNodeGifRuntime({ browser, signal: controller.signal, portableExportScript: "" });
  const pending = runtime.run(documentInput, {});
  for (let attempt = 0; attempt < 20 && !resolveLoad; attempt += 1) await new Promise((resolve) => setTimeout(resolve, 1));
  expect(resolveLoad).toBeTypeOf("function");
  controller.abort();
  await expect(pending).rejects.toMatchObject({ code: "cancelled" });
  resolveLoad?.();
  await runtime.dispose();
});

it.each(["signal", "runtime"])("closes a browser that finishes launching after %s cancellation", async (cancellation) => {
  const controller = new AbortController();
  let resolveLaunch!: (browser: Browser) => void;
  let closeCount = 0;
  const browser = { async close() { closeCount += 1; } } as Browser;
  const runtime = createNodeGifRuntime({
    signal: controller.signal,
    portableExportScript: "",
    launchBrowser: () => new Promise<Browser>((resolve) => { resolveLaunch = resolve; })
  });
  const pending = runtime.run(documentInput, {});
  if (cancellation === "signal") controller.abort();
  else runtime.abort();
  await expect(pending).rejects.toMatchObject({ code: "cancelled" });
  if (cancellation === "signal") await runtime.dispose();
  resolveLaunch(browser);
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(closeCount).toBe(1);
  await runtime.dispose();
});

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => { resolve = complete; });
  return { promise, resolve };
}

it("releases a caller-owned browser's context that arrives after cancellation and disposal", async () => {
  const contextReady = deferred<BrowserContext>();
  let closeCount = 0;
  const browser = { newContext: () => contextReady.promise, close: vi.fn() } as unknown as Browser;
  const runtime = createNodeGifRuntime({ browser, portableExportScript: "" });
  const pending = runtime.run(documentInput, {});
  runtime.abort();
  await expect(pending).rejects.toMatchObject({ code: "cancelled" });
  await runtime.dispose();
  contextReady.resolve({ async close() { closeCount += 1; } } as BrowserContext);
  await vi.waitFor(() => expect(closeCount).toBe(1));
  expect(browser.close).not.toHaveBeenCalled();
});

it("releases a page that arrives after its context was cancelled and disposed", async () => {
  const pageReady = deferred<Page>();
  const pageClose = vi.fn(async () => {});
  const contextClose = vi.fn(async () => {});
  const newPage = vi.fn(() => pageReady.promise);
  const context = { newPage, close: contextClose } as unknown as BrowserContext;
  const browser = { async newContext() { return context; }, close: vi.fn() } as unknown as Browser;
  const controller = new AbortController();
  const runtime = createNodeGifRuntime({ browser, signal: controller.signal, portableExportScript: "" });
  const pending = runtime.run(documentInput, {});
  await vi.waitFor(() => expect(newPage).toHaveBeenCalledOnce());
  controller.abort();
  await expect(pending).rejects.toMatchObject({ code: "cancelled" });
  await runtime.dispose();
  pageReady.resolve({ close: pageClose } as unknown as Page);
  await vi.waitFor(() => expect(pageClose).toHaveBeenCalledOnce());
  expect(contextClose).toHaveBeenCalledOnce();
  expect(browser.close).not.toHaveBeenCalled();
});

it("removes a temporary directory that arrives after cancellation and disposal", async () => {
  const directory = await mkdtemp(join(tmpdir(), "flowsvg-late-directory-"));
  const directoryReady = deferred<string>();
  const createDirectory = vi.mocked(mkdtemp).mockClear().mockImplementationOnce(() => directoryReady.promise);
  const fixture = browserFixture(() => ({ bytes: [1] }));
  const runtime = createNodeGifRuntime({ browser: fixture.browser, portableExportScript: "" });
  try {
    const pending = runtime.run(documentInput, {});
    await vi.waitFor(() => expect(createDirectory).toHaveBeenCalledOnce());
    runtime.abort();
    await expect(pending).rejects.toMatchObject({ code: "cancelled" });
    await runtime.dispose();
    directoryReady.resolve(directory);
    await vi.waitFor(async () => { await expect(access(directory)).rejects.toMatchObject({ code: "ENOENT" }); });
  } finally {
    createDirectory.mockClear();
    await runtime.dispose();
    await rm(directory, { recursive: true, force: true });
  }
});
