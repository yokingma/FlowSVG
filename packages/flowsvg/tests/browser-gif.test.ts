import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterAll, beforeAll, expect, it } from "vitest";
import { chromium, type Browser, type Page } from "playwright-core";
import { parseGIF, decompressFrames } from "gifuct-js";
import { createDiagram, type DiagramDocument } from "../src/index.js";

const PACKAGE_DIR = new URL("..", import.meta.url).pathname;
const input = {
  version: 1, title: "中文图解", viewport: { width: 240, height: 120 },
  nodes: [{ id: "a", kind: "rect", x: 10, y: 10, width: 80, height: 60, label: "客户端" }], edges: [],
  scenes: [{ id: "s", label: "场景", beats: [{ durationMs: 1000, caption: "完成说明", actions: [{ type: "updateNode", target: "a", value: { x: 140 } }] }] }]
} satisfies DiagramDocument;
let browser: Browser;
let page: Page;
let directory: string;
beforeAll(async () => {
  execFileSync("pnpm", ["--silent", "build"], { cwd: PACKAGE_DIR });
  directory = await mkdtemp(join(tmpdir(), "flowsvg-gif-"));
  const script = await readFile(join(PACKAGE_DIR, "dist/portable/export.js"), "utf8");
  const html = join(directory, "export.html");
  await writeFile(html, `<meta charset="utf-8"><script>${script}</script>`);
  browser = await chromium.launch({ executablePath: process.env.FLOWSVG_CHROMIUM_PATH });
  const context = await browser.newContext({ offline: true });
  page = await context.newPage();
  await page.goto(pathToFileURL(html).href);
}, 60_000);
afterAll(async () => { await browser?.close(); if (directory) await rm(directory, { recursive: true, force: true }); });

async function exportBytes(document: DiagramDocument = input, options = {}) {
  return Uint8Array.from(await page.evaluate(async ({ document, options }) => {
    const api = (globalThis as unknown as { FlowSVGExport: { exportGif(document: unknown, options: unknown): Promise<Uint8Array> } }).FlowSVGExport;
    return Array.from(await api.exportGif(document, options));
  }, { document, options }));
}

it("preflights caption ranges at effective single-flow boundaries", async () => {
  const story: DiagramDocument = {
    version: 1, viewport: { width: 500, height: 120 },
    nodes: [
      { id: "a", kind: "rect", x: 20, y: 20, width: 40, height: 40 },
      { id: "b", kind: "rect", x: 420, y: 20, width: 40, height: 40 }
    ],
    edges: [{ id: "transfer", from: "a", to: "b", route: "straight" }],
    scenes: [{ id: "transfer", label: "Transfer", beats: [
      { durationMs: 100, caption: "Moving", actions: [{ type: "flow", target: "transfer", direction: "forward" }] },
      { durationMs: 300, caption: "Overflow\n".repeat(20), actions: [] }
    ] }]
  };
  const result = await page.evaluate(async (documentInput) => {
    const api = (globalThis as unknown as { FlowSVGExport: { exportGif(document: unknown, options: unknown): Promise<Uint8Array> } }).FlowSVGExport;
    const results: (number | string)[] = [];
    for (const startMs of [200, 2400, 2500]) {
      try {
        const bytes = await api.exportGif(documentInput, { startMs, endMs: startMs + 100, captionHeight: 50, finalHoldMs: 0, fps: 2 });
        results.push(bytes.length);
      } catch (error) { results.push((error as { code: string }).code); }
    }
    return results;
  }, story);
  expect(result[0]).toBeTypeOf("number");
  expect(result[1]).toBeTypeOf("number");
  expect(result[2]).toBe("caption-overflow");
});

it("exports an offline decodable full timeline with caption, accurate timing and completed final state", async () => {
  const bytes = await exportBytes();
  const parsed = parseGIF(bytes.buffer);
  expect(parsed.lsd.width).toBe(240);
  expect(parsed.lsd.height).toBe(200);
  const frames = decompressFrames(parsed, true);
  expect(frames.length).toBeGreaterThan(1);
  expect(parsed.frames.reduce((sum, frame) => sum + ("gce" in frame ? frame.gce.delay : 0), 0)).toBe(200);
  expect(parsed.frames.some((frame) => "application" in frame && frame.application.id === "NETSCAPE2.0")).toBe(true);
  const last = frames.at(-1)!;
  const pixel = (x: number, y: number) => Array.from(last.patch.slice((y * 240 + x) * 4, (y * 240 + x) * 4 + 4));
  expect(pixel(10, 40)).toEqual([255, 255, 255, 255]);
  expect(pixel(140, 40)[0]).toBeLessThan(240);
  expect(Array.from(last.patch.slice(120 * 240 * 4)).some((value, index) => index % 4 !== 3 && value < 100)).toBe(true);
});

it("cancels while the browser font environment is pending and allows another export", async () => {
  const result = await page.evaluate(async (documentInput) => {
    const api = (globalThis as unknown as { FlowSVGExport: { exportGif(document: unknown, options: unknown): Promise<Uint8Array> } }).FlowSVGExport;
    const controller = new AbortController();
    const originalLoad = document.fonts.load;
    // The browser font service is an external boundary; simulate a font that never becomes ready.
    document.fonts.load = () => new Promise(() => {});
    const pending = api.exportGif(documentInput, { signal: controller.signal }).then(() => "completed", (error: { code?: string }) => error.code);
    setTimeout(() => controller.abort(), 10);
    const state = await Promise.race([pending, new Promise((resolve) => setTimeout(() => resolve("timed-out"), 200))]);
    document.fonts.load = originalLoad;
    return state;
  }, input);
  expect(result).toBe("cancelled");
  expect((await exportBytes()).length).toBeGreaterThan(100);
});

it("rejects an unavailable worker environment with an actionable error before allocating output", async () => {
  const result = await page.evaluate(async (documentInput) => {
    const api = (globalThis as unknown as { FlowSVGExport: { exportGif(document: unknown, options: unknown): Promise<Uint8Array> } }).FlowSVGExport;
    const originalWorker = globalThis.Worker;
    Object.defineProperty(globalThis, "Worker", { configurable: true, value: null });
    const phases: string[] = [];
    try { await api.exportGif(documentInput, { onProgress: (progress: { phase: string }) => phases.push(progress.phase) }); return { code: "none", message: "", phases }; }
    catch (error) { const failure = error as { code: string; message: string }; return { code: failure.code, message: failure.message, phases }; }
    finally { Object.defineProperty(globalThis, "Worker", { configurable: true, value: originalWorker }); }
  }, input);
  expect(result.phases).toEqual([]);
  expect(result.code).toBe("environment");
  expect(result.message).toMatch(/worker.*browser|browser.*worker/i);
});

it("rejects an early worker startup failure, releases task resources and permits a retry", async () => {
  const failurePage = await browser.newPage();
  try {
    await failurePage.setContent(`<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; img-src blob:; worker-src blob:; style-src 'unsafe-inline'">`);
    await failurePage.addScriptTag({ content: await readFile(join(PACKAGE_DIR, "dist/portable/export.js"), "utf8") });
    const result = await failurePage.evaluate(async (documentInput) => {
      const api = (globalThis as unknown as { FlowSVGExport: { exportGif(document: unknown, options: unknown): Promise<Uint8Array> } }).FlowSVGExport;
      const NativeWorker = globalThis.Worker;
      const originalDecode = HTMLImageElement.prototype.decode;
      const originalCreateElement = document.createElement.bind(document);
      const originalCreateUrl = URL.createObjectURL;
      const originalRevokeUrl = URL.revokeObjectURL;
      const urls = new Set<string>();
      const canvases: HTMLCanvasElement[] = [];
      const images: HTMLImageElement[] = [];
      let terminated = 0;
      let errorListeners = 0;
      // Exercise a real asynchronous CSP error at the worker boundary, before image decoding settles.
      globalThis.Worker = class extends NativeWorker {
        constructor() { super("data:text/javascript,postMessage('blocked')"); }
        override terminate() { terminated += 1; super.terminate(); }
        override addEventListener(...args: Parameters<Worker["addEventListener"]>) { if (args[0] === "error") errorListeners += 1; super.addEventListener(...args); }
        override removeEventListener(...args: Parameters<Worker["removeEventListener"]>) { if (args[0] === "error") errorListeners -= 1; super.removeEventListener(...args); }
      };
      HTMLImageElement.prototype.decode = async function () { images.push(this); await originalDecode.call(this); await new Promise<void>(() => {}); };
      document.createElement = ((tag: string) => { const element = originalCreateElement(tag); if (element instanceof HTMLCanvasElement) canvases.push(element); return element; }) as typeof document.createElement;
      URL.createObjectURL = (blob) => { const url = originalCreateUrl(blob); urls.add(url); return url; };
      URL.revokeObjectURL = (url) => { urls.delete(url); originalRevokeUrl(url); };
      let failure;
      try {
        failure = await Promise.race([
          api.exportGif(documentInput, { includeCaptions: false }).then(() => ({ code: "completed", message: "" }), (error: { code: string; message: string }) => ({ code: error.code, message: error.message })),
          new Promise<{ code: string; message: string }>((resolve) => setTimeout(() => resolve({ code: "timed-out", message: "" }), 1000))
        ]);
      } finally {
        globalThis.Worker = NativeWorker;
        HTMLImageElement.prototype.decode = originalDecode;
        document.createElement = originalCreateElement;
        URL.createObjectURL = originalCreateUrl;
        URL.revokeObjectURL = originalRevokeUrl;
      }
      const resources = { urls: urls.size, terminated, errorListeners, canvasesReleased: canvases.every((canvas) => canvas.width === 0 && canvas.height === 0), imagesReleased: images.every((image) => image.getAttribute("src") === "") };
      const retry = await api.exportGif(documentInput, { includeCaptions: false });
      return { failure, resources, retryBytes: retry.length };
    }, input);
    expect(result.failure.code).toBe("encoding");
    expect(result.failure.message).toMatch(/worker/i);
    expect(result.resources).toEqual({ urls: 0, terminated: 1, errorListeners: 0, canvasesReleased: true, imagesReleased: true });
    expect(result.retryBytes).toBeGreaterThan(100);
  } finally { await failurePage.close(); }
});


it("renders parallel Chinese flow capsules, focused cameras and both opaque themes against the public SVG frame", async () => {
  const story: DiagramDocument = {
    version: 1, viewport: { width: 400, height: 200 }, title: "并行传递",
    typography: { nodeLabel: 24, edgeLabel: 20, flowLabel: 24 },
    nodes: [
      { id: "a", kind: "rect", x: 20, y: 20, width: 90, height: 60, label: "客户端" },
      { id: "b", kind: "rect", x: 280, y: 20, width: 90, height: 60, label: "服务端" },
      { id: "c", kind: "rect", x: 280, y: 120, width: 90, height: 60, label: "存储" }
    ],
    edges: [{ id: "ab", from: "a", to: "b" }, { id: "ac", from: "a", to: "c" }],
    scenes: [{ id: "parallel", label: "并行", beats: [{ durationMs: 1000, transitionMs: 0, actions: [
      { type: "flow", target: "ab", direction: "forward", text: "请求" },
      { type: "flow", target: "ac", direction: "reverse", text: "响应" },
      { type: "focus", target: "a" }
    ] }] }]
  };
  for (const theme of ["light", "dark"] as const) {
    const decoded = decompressFrames(parseGIF((await exportBytes(story, { theme, includeCaptions: false, fps: 2 })).buffer), true);
    const middle = decoded[1];
    expect(middle.dims).toMatchObject({ width: 400, height: 200 });
    const expectedSvg = createDiagram(story).renderSvg(500, { theme });
    const expected = await page.evaluate(async (svg) => {
      const image = new Image();
      const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
      try {
        image.src = url; await image.decode();
        const canvas = document.createElement("canvas"); canvas.width = 400; canvas.height = 200;
        const context = canvas.getContext("2d")!; context.drawImage(image, 0, 0, 400, 200);
        return Array.from(context.getImageData(0, 0, 400, 200).data);
      } finally { URL.revokeObjectURL(url); }
    }, expectedSvg);
    const averageDifference = middle.patch.reduce((sum, value, index) => sum + Math.abs(value - expected[index]), 0) / expected.length;
    expect(averageDifference).toBeLessThan(3);
    const background = theme === "light" ? [255, 255, 255] : [16, 24, 40];
    background.forEach((value, index) => expect(Math.abs(middle.patch[index] - value)).toBeLessThanOrEqual(3));
    expect(middle.patch[3]).toBe(255);
  }
}, 15_000);

it("emits one static frame, keeps default width below 1280 and can remove captions", async () => {
  const staticDocument: DiagramDocument = { ...input, viewport: { width: 2000, height: 500 }, scenes: [] };
  const parsed = parseGIF((await exportBytes(staticDocument, { includeCaptions: false })).buffer);
  expect(parsed.lsd).toMatchObject({ width: 1280, height: 320 });
  expect(decompressFrames(parsed, true)).toHaveLength(1);
  expect(parsed.frames.reduce((sum, frame) => sum + ("gce" in frame ? frame.gce.delay : 0), 0)).toBe(100);
});

it("fixes input and options at start, reports stages, and cancels without reporting completion", async () => {
  const result = await page.evaluate(async (documentInput) => {
    const api = (globalThis as unknown as { FlowSVGExport: { exportGif(document: unknown, options: unknown): Promise<Uint8Array> } }).FlowSVGExport;
    const mutable = structuredClone(documentInput);
    const options = { theme: "dark", includeCaptions: false };
    const output = api.exportGif(mutable, options);
    mutable.viewport.width = 10; mutable.nodes[0].label = "mutated"; options.theme = "light";
    const bytes = Array.from(await output);
    const controller = new AbortController();
    const phases: string[] = [];
    let code: string | undefined;
    try {
      await api.exportGif(documentInput, { signal: controller.signal, onProgress: (progress: { phase: string }) => {
        phases.push(progress.phase); if (progress.phase === "encoding") controller.abort();
      } });
    } catch (error) { code = (error as { code: string }).code; }
    return { bytes, phases, code };
  }, input);
  const frames = decompressFrames(parseGIF(Uint8Array.from(result.bytes).buffer), true);
  expect(frames[0].dims.width).toBe(240);
  expect(Array.from(frames[0].patch.slice(0, 4))).toEqual([16, 24, 40, 255]);
  expect(result.code).toBe("cancelled");
  expect(result.phases).toEqual(["preparing", "sampling", "encoding"]);
  expect((await exportBytes()).length).toBeGreaterThan(100);
});

it("rejects invalid documents and computable limits before preparing browser resources", async () => {
  const results = await page.evaluate(async (documentInput) => {
    const api = (globalThis as unknown as { FlowSVGExport: { exportGif(document: unknown, options: unknown): Promise<Uint8Array> } }).FlowSVGExport;
    const cases = [
      { document: { ...documentInput, version: 99 }, options: {}, expected: "document" },
      { document: documentInput, options: { fps: 31 }, expected: "options" },
      { document: documentInput, options: { width: 1921 }, expected: "limit" },
      { document: { ...documentInput, scenes: [{ id: "long", label: "long", beats: [{ durationMs: 120001, actions: [] }] }] }, options: {}, expected: "limit" },
      { document: { ...documentInput, scenes: [{ id: "dense", label: "dense", beats: [{ durationMs: 61000, actions: [] }] }] }, options: { fps: 30 }, expected: "limit" }
    ];
    const results = [];
    for (const testCase of cases) {
      const phases: string[] = [];
      try { await api.exportGif(testCase.document, { ...testCase.options, onProgress: (progress: { phase: string }) => phases.push(progress.phase) }); results.push({ code: "none", expected: testCase.expected, phases }); }
      catch (error) { results.push({ code: (error as { code: string }).code, expected: testCase.expected, phases }); }
    }
    return results;
  }, input);
  for (const result of results) { expect(result.code).toBe(result.expected); expect(result.phases).toEqual([]); }
});

it("keeps authored GIF dimensions and scale across fitted stages without mutating the source", async () => {
  const fitted: DiagramDocument = {
    version: 1, viewport: { width: 240, height: 160, fitHeight: { padding: 8 } },
    nodes: [{ id: "card", kind: "rect", x: 20, y: 20, width: 60, height: 30, style: { fill: "#ff0000" } }], edges: [],
    scenes: [{ id: "grow", label: "Grow", beats: [
      { durationMs: 500, transitionMs: 0, actions: [] },
      { durationMs: 500, transitionMs: 0, actions: [{ type: "updateNode", target: "card", value: { height: 100 } }] }
    ] }]
  };
  const before = JSON.stringify(fitted);
  const fixed: DiagramDocument = { ...fitted, viewport: { width: 240, height: 160 } };
  const options = { fps: 2, includeCaptions: false, finalHoldMs: 0 };
  const actual = await exportBytes(fitted, options);
  expect(actual).toEqual(await exportBytes(fixed, options));
  expect(JSON.stringify(fitted)).toBe(before);
  const parsed = parseGIF(actual.buffer);
  expect(parsed.lsd).toMatchObject({ width: 240, height: 160 });
  const frames = decompressFrames(parsed, true);
  const pixel = (frame: typeof frames[number], x: number, y: number) => Array.from(frame.patch.slice((y * 240 + x) * 4, (y * 240 + x) * 4 + 4));
  expect(pixel(frames[0]!, 40, 45)).toEqual([255, 0, 0, 255]);
  expect(pixel(frames[0]!, 40, 80)).toEqual([255, 255, 255, 255]);
  expect(pixel(frames[1]!, 40, 80)).toEqual([255, 0, 0, 255]);
});
