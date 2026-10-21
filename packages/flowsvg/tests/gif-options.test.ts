import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterAll, beforeAll, expect, it } from "vitest";
import { chromium, type Browser, type Page } from "playwright-core";
import { parseGIF, decompressFrames } from "gifuct-js";
import type { DiagramDocument } from "../src/index.js";

const PACKAGE_DIR = new URL("..", import.meta.url).pathname;
const input: DiagramDocument = {
  version: 1, viewport: { width: 240, height: 120 },
  nodes: [{ id: "a", kind: "rect", x: 10, y: 10, width: 60, height: 60, label: "节点" }], edges: [],
  scenes: [{ id: "s", label: "场景", beats: [{ durationMs: 1000, caption: "说明", actions: [{ type: "updateNode", target: "a", value: { x: 140 } }] }] }]
};
let browser: Browser;
let page: Page;
let directory: string;
beforeAll(async () => {
  execFileSync("pnpm", ["--silent", "build"], { cwd: PACKAGE_DIR });
  directory = await mkdtemp(join(tmpdir(), "flowsvg-gif-options-"));
  const script = await readFile(join(PACKAGE_DIR, "dist/portable/export.js"), "utf8");
  const html = join(directory, "export.html");
  await writeFile(html, `<meta charset="utf-8"><script>${script}</script>`);
  browser = await chromium.launch({ executablePath: process.env.FLOWSVG_CHROMIUM_PATH });
  page = await (await browser.newContext({ offline: true, reducedMotion: "reduce" })).newPage();
  await page.goto(pathToFileURL(html).href);
}, 60_000);
afterAll(async () => { await browser?.close(); if (directory) await rm(directory, { recursive: true, force: true }); });

async function exportBytes(document: DiagramDocument = input, options = {}) {
  return Uint8Array.from(await page.evaluate(async ({ document, options }) => {
    const api = (globalThis as unknown as { FlowSVGExport: { exportGif(document: unknown, options: unknown): Promise<Uint8Array> } }).FlowSVGExport;
    return Array.from(await api.exportGif(document, options));
  }, { document, options }));
}
function delayTicks(parsed: ReturnType<typeof parseGIF>): number {
  return parsed.frames.reduce((sum, frame) => sum + ("gce" in frame ? frame.gce.delay : 0), 0);
}

it("rejects malformed runtime options before preparing or allocating canvas resources", async () => {
  const results = await page.evaluate(async (documentInput) => {
    const api = (globalThis as unknown as { FlowSVGExport: { exportGif(document: unknown, options: unknown): Promise<Uint8Array> } }).FlowSVGExport;
    const options = [
      { theme: "system" }, { theme: null }, { includeCaptions: "false" }, { includeCaptions: null },
      { reducedMotion: 0 }, { reducedMotion: null }, { signal: {} }, { signal: { aborted: true } }, { onProgress: 1 },
      { fps: null }, { width: null }, { speed: null }, { startMs: null }, { endMs: null },
      { captionHeight: null }, { captionHeight: -1, includeCaptions: false }, { finalHoldMs: null }, { loopCount: null },
      { fps: 0 }, { fps: 1.5 }, { fps: 31 }, { fps: NaN }, { width: 0 }, { width: -1 }, { width: Infinity },
      { speed: 0 }, { speed: -1 }, { speed: NaN }, { startMs: -1 }, { startMs: 1000 }, { endMs: 0 },
      { endMs: 1001 }, { endMs: Infinity }, { endMs: -1 }, { finalHoldMs: -1 }, { loopCount: -1 },
      { loopCount: 1.5 }, { loopCount: 65537 }, { width: "100" }
    ];
    const results = [];
    for (const value of options) {
      const phases: string[] = [];
      try { await api.exportGif(documentInput, { ...value, onProgress: "onProgress" in value ? value.onProgress : (progress: { phase: string }) => phases.push(progress.phase) }); results.push({ value, code: "none", phases }); }
      catch (error) { const failure = error as { code?: string; message?: string }; results.push({ value, code: failure.code, message: failure.message, phases }); }
    }
    return results;
  }, input);
  for (const result of results) {
    expect(result, JSON.stringify(result.value)).toMatchObject({ code: "options", phases: [] });
    if ("loopCount" in result.value && result.value.loopCount === 65537) expect(result.message).toMatch(/65,536/);
  }
});

it("includes the completed full-timeline picture with zero hold without adding duration", async () => {
  const parsed = parseGIF((await exportBytes(input, { fps: 1, includeCaptions: false, finalHoldMs: 0 })).buffer);
  expect(delayTicks(parsed)).toBe(100);
  const last = decompressFrames(parsed, true).at(-1)!;
  const pixel = (x: number, y: number) => Array.from(last.patch.slice((y * 240 + x) * 4, (y * 240 + x) * 4 + 4));
  expect(pixel(10, 40)).toEqual([255, 255, 255, 255]);
  expect(pixel(140, 40)[0]).toBeLessThan(240);
  expect(parsed.frames.filter((frame) => "gce" in frame).at(-1)).toMatchObject({ gce: { delay: 0 } });
});

it("preflights every effective caption interval, including an unsampled beat and inherited text", async () => {
  const overflowing = "此说明不能容纳在固定高度中。".repeat(15);
  const story: DiagramDocument = { ...input, scenes: [{ id: "caption-scene", label: "说明场景", beats: [
    { durationMs: 1, caption: "短说明", actions: [] },
    { durationMs: 1, caption: overflowing, actions: [] },
    { durationMs: 1000, caption: "短说明", actions: [] }
  ] }] };
  const inherited: DiagramDocument = { ...input, scenes: [
    { id: "earlier", label: "此前", beats: [{ durationMs: 100, caption: overflowing, actions: [] }] },
    { id: "inherits", label: "继承", beats: [{ durationMs: 100, actions: [] }] }
  ] };
  const results = await page.evaluate(async ({ story, inherited }) => {
    const api = (globalThis as unknown as { FlowSVGExport: { exportGif(document: unknown, options: unknown): Promise<Uint8Array> } }).FlowSVGExport;
    const results = [];
    for (const [documentInput, options] of [[story, { fps: 1 }], [inherited, { startMs: 100 }]] as const) {
      const phases: string[] = [];
      try { await api.exportGif(documentInput, { ...options, onProgress: (progress: { phase: string }) => phases.push(progress.phase) }); results.push({ code: "none", message: "", phases }); }
      catch (error) { const failure = error as { code: string; message: string }; results.push({ ...failure, code: failure.code, message: failure.message, phases }); }
    }
    return results;
  }, { story, inherited });
  expect(results[0]).toMatchObject({ code: "caption-overflow", phases: ["preparing"] });
  expect(results[0].message).toMatch(/caption-scene.*(?:beat|节拍).*2/i);
  expect(results[1]).toMatchObject({ code: "caption-overflow", phases: ["preparing"] });
  expect(results[1].message).toMatch(/inherits.*(?:beat|节拍).*1/i);
});

it("bounds final encoded frames before sampling and preserves a representable long hold at the limit", async () => {
  const still: DiagramDocument = { ...input, viewport: { width: 8, height: 8 }, nodes: [], scenes: [] };
  const accepted = parseGIF((await exportBytes(still, { includeCaptions: false, finalHoldMs: 655350 * 1801 })).buffer);
  expect(decompressFrames(accepted, true)).toHaveLength(1801);
  expect(delayTicks(accepted)).toBe(65535 * 1801);
  const results = await page.evaluate(async (documentInput) => {
    const api = (globalThis as unknown as { FlowSVGExport: { exportGif(document: unknown, options: unknown): Promise<Uint8Array> } }).FlowSVGExport;
    const results = [];
    for (const hold of [655350 * 1801 + 10, 1e30, 1e308]) {
      const controller = new AbortController();
      const phases: string[] = [];
      // Cancellation bounds the old encoder's non-progressing arithmetic during the fail-first check.
      const timer = setTimeout(() => controller.abort(), 100);
      try { await api.exportGif(documentInput, { includeCaptions: false, finalHoldMs: hold, signal: controller.signal, onProgress: (progress: { phase: string }) => phases.push(progress.phase) }); results.push({ code: "none", phases }); }
      catch (error) { results.push({ code: (error as { code: string }).code, phases }); }
      finally { clearTimeout(timer); }
    }
    return results;
  }, still);
  for (const result of results) expect(result).toMatchObject({ code: "limit", phases: [] });
});

it("inherits prior scenes and holds the representable end-left picture without entering the next beat", async () => {
  const boundary = 1_000_000_000_000_000;
  const story: DiagramDocument = { ...input, nodes: [{ ...input.nodes[0], height: 20 }], scenes: [
    { id: "earlier", label: "此前", beats: [{ durationMs: boundary, transitionMs: 0, actions: [{ type: "updateNode", target: "a", value: { x: 140 } }] }] },
    { id: "tiny", label: "短节拍", beats: [{ durationMs: 0.125, transitionMs: 0, actions: [{ type: "updateNode", target: "a", value: { y: 70 } }] }] },
    { id: "next", label: "下一节拍", beats: [{ durationMs: 1000, transitionMs: 0, actions: [{ type: "updateNode", target: "a", value: { x: 10, y: 10 } }] }] }
  ] };
  const parsed = parseGIF((await exportBytes(story, { startMs: boundary, endMs: boundary + 0.125, includeCaptions: false })).buffer);
  const frames = decompressFrames(parsed, true);
  for (const frame of [frames[0], frames.at(-1)!]) {
    expect(frame.patch[(80 * 240 + 140) * 4]).toBeLessThan(240);
    expect(Array.from(frame.patch.slice((20 * 240 + 20) * 4, (20 * 240 + 20) * 4 + 4))).toEqual([255, 255, 255, 255]);
  }
});

it("keeps rounded ordinary samples strictly before a segment end at fractional speed", async () => {
  const story: DiagramDocument = { ...input, nodes: [{ ...input.nodes[0], height: 20 }], scenes: [{ id: "fractional", label: "分段", beats: [
    { durationMs: 0.125, transitionMs: 0, actions: [{ type: "updateNode", target: "a", value: { x: 140 } }] },
    { durationMs: 1000, transitionMs: 0, actions: [{ type: "updateNode", target: "a", value: { x: 10 } }] }
  ] }] };
  const parsed = parseGIF((await exportBytes(story, { endMs: 0.125, speed: 0.00375, fps: 30, finalHoldMs: 0, includeCaptions: false })).buffer);
  expect(delayTicks(parsed)).toBe(3);
  for (const frame of decompressFrames(parsed, true)) expect(frame.patch[(20 * 240 + 140) * 4]).toBeLessThan(240);
});

it("still emits a valid zero-delay segment when a finite export speed underflows the output duration", async () => {
  const story: DiagramDocument = { ...input, scenes: [{ id: "subnormal", label: "极短", beats: [
    { durationMs: Number.MIN_VALUE, transitionMs: 0, actions: [] },
    { durationMs: 1000, actions: [] }
  ] }] };
  const parsed = parseGIF((await exportBytes(story, { endMs: Number.MIN_VALUE, speed: 1e308, finalHoldMs: 0, includeCaptions: false })).buffer);
  expect(decompressFrames(parsed, true)).toHaveLength(1);
  expect(delayTicks(parsed)).toBe(0);
});

it("validates options objects and all resource boundaries before canvas allocation", async () => {
  const results = await page.evaluate(async (documentInput) => {
    const api = (globalThis as unknown as { FlowSVGExport: { exportGif(document: unknown, options: unknown): Promise<Uint8Array> } }).FlowSVGExport;
    const story = (durationMs: number) => ({ ...documentInput, scenes: [{ id: "limits", label: "上限", beats: [{ durationMs, actions: [] }] }] });
    const cases = [
      { document: documentInput, options: null, expected: "options" },
      { document: documentInput, options: [], expected: "options" },
      { document: documentInput, options: 1, expected: "options" },
      { document: documentInput, options: "options", expected: "options" },
      { document: documentInput, options: { width: 1921 }, expected: "limit" },
      { document: documentInput, options: { width: 1000, captionHeight: 1421 }, expected: "limit" },
      { document: story(120001), options: { fps: 1 }, expected: "limit" },
      { document: story(60001), options: { fps: 30 }, expected: "limit" },
      { document: story(240002), options: { fps: 1, speed: 2 }, expected: "limit" },
      { document: { ...documentInput, scenes: [] }, options: { startMs: 1 }, expected: "options" },
      { document: { ...documentInput, scenes: [] }, options: { endMs: 1 }, expected: "options" }
    ];
    const originalCreate = document.createElement.bind(document);
    let canvases = 0;
    document.createElement = ((...args: Parameters<typeof originalCreate>) => {
      if (args[0] === "canvas") canvases++;
      return originalCreate(...args);
    }) as typeof document.createElement;
    const results = [];
    try {
      for (const testCase of cases) {
        try { await api.exportGif(testCase.document, testCase.options); results.push({ code: "none", expected: testCase.expected, canvases }); }
        catch (error) { results.push({ code: (error as { code: string }).code, expected: testCase.expected, canvases }); }
      }
    } finally { document.createElement = originalCreate; }
    for (const options of [{ fps: 15 }, { fps: 30, speed: 2 }, { fps: 1, width: 1920, includeCaptions: false }, { fps: 1, width: 1280, captionHeight: 1280 }]) {
      const controller = new AbortController();
      try { await api.exportGif(story(120000), { ...options, signal: controller.signal, onProgress: () => controller.abort() }); results.push({ code: "none", expected: "cancelled", canvases: 0 }); }
      catch (error) { results.push({ code: (error as { code: string }).code, expected: "cancelled", canvases: 0 }); }
    }
    return results;
  }, input);
  for (const result of results) { expect(result.code).toBe(result.expected); expect(result.canvases).toBe(0); }
});

it("encodes cumulative 15 fps delays, fractional intervals, speed and total-play metadata", async () => {
  const story: DiagramDocument = { ...input, scenes: [{ id: "timing", label: "时间", beats: [{ durationMs: 1001, actions: [] }] }] };
  for (const [options, ticks, repeat] of [
    [{ fps: 15, loopCount: 0 }, 100, 0],
    [{ fps: 15, speed: 2, loopCount: 1 }, 50, undefined],
    [{ fps: 15, startMs: 2, endMs: 1000, speed: 0.8, loopCount: 3 }, 125, 2],
    [{ fps: 30, speed: 3, loopCount: 65536 }, 33, 65535]
  ] as const) {
    const parsed = parseGIF((await exportBytes(story, { ...options, includeCaptions: false, finalHoldMs: 0 })).buffer);
    expect(delayTicks(parsed)).toBe(ticks);
    const netscape = parsed.frames.find((frame) => "application" in frame && frame.application.id === "NETSCAPE2.0");
    const blocks = netscape && "application" in netscape ? netscape.application.blocks : undefined;
    expect(blocks ? blocks[1] | blocks[2] << 8 : undefined).toBe(repeat);
    const frames = decompressFrames(parsed, true);
    expect(frames.length).toBeGreaterThan(1);
    if (options.loopCount === 0) expect(new Set(parsed.frames.flatMap((frame) => "gce" in frame ? [frame.gce.delay] : []))).toEqual(new Set([6, 7, 0]));
  }
  const staticParsed = parseGIF((await exportBytes({ ...input, scenes: [] }, { finalHoldMs: 0, includeCaptions: false, loopCount: 1 })).buffer);
  expect(delayTicks(staticParsed)).toBe(1);
  expect(decompressFrames(staticParsed, true)).toHaveLength(1);
});

it("keeps measured caption wrapping, blank lines and fixed dimensions without shrinking or clipping", async () => {
  const still: DiagramDocument = { ...input, title: "第一行\n\n第三行", scenes: [] };
  const results = await page.evaluate(async (documentInput) => {
    const api = (globalThis as unknown as { FlowSVGExport: { exportGif(document: unknown, options: unknown): Promise<Uint8Array> } }).FlowSVGExport;
    const results = [];
    for (const testCase of [
      { document: documentInput, options: {}, location: "static" },
      { document: { ...documentInput, title: "字" }, options: { width: 40 }, location: "static" },
      { document: { ...documentInput, title: "字" }, options: { captionHeight: 45 }, location: "static" },
      { document: { ...documentInput, title: "字" }, options: { captionHeight: 0 }, location: "static" }
    ]) {
      try { await api.exportGif(testCase.document, testCase.options); results.push({ code: "none", message: "" }); }
      catch (error) { const failure = error as { code: string; message: string }; results.push({ code: failure.code, message: failure.message }); }
    }
    return results;
  }, still);
  for (const result of results) { expect(result.code).toBe("caption-overflow"); expect(result.message).toMatch(/static.*title/i); }
  const parsed = parseGIF((await exportBytes(still, { captionHeight: 90 })).buffer);
  expect(parsed.lsd).toMatchObject({ width: 240, height: 210 });
  const frame = decompressFrames(parsed, true)[0];
  const darkPixels = (fromY: number, untilY: number) => {
    let count = 0;
    for (let y = fromY; y < untilY; y++) for (let x = 16; x < 224; x++) if (frame.patch[(y * 240 + x) * 4] < 100) count++;
    return count;
  };
  expect(darkPixels(132, 154)).toBeGreaterThan(10);
  expect(darkPixels(154, 176)).toBe(0);
  expect(darkPixels(176, 198)).toBeGreaterThan(10);
  const wrapped = parseGIF((await exportBytes({ ...still, title: "中文说明自动换行测试" }, { width: 80, captionHeight: 200 })).buffer);
  expect(wrapped.lsd).toMatchObject({ width: 80, height: 240 });
  const wrappedFrame = decompressFrames(wrapped, true)[0];
  expect(Array.from(wrappedFrame.patch.slice(80 * 84 * 4, 80 * 106 * 4)).some((value, index) => index % 4 !== 3 && value < 100)).toBe(true);
  const disabled = parseGIF((await exportBytes(still, { includeCaptions: false, width: 80, captionHeight: 0 })).buffer);
  expect(disabled.lsd).toMatchObject({ width: 80, height: 40 });
});

it("excludes captions starting at an intermediate endpoint and respects explicit blank captions", async () => {
  const tooLong = "说明".repeat(100);
  const story: DiagramDocument = { ...input, scenes: [{ id: "boundaries", label: "说明边界", beats: [
    { durationMs: 100, caption: "短说明", actions: [] },
    { durationMs: 100, caption: tooLong, actions: [] },
    { durationMs: 100, caption: "", actions: [] }
  ] }] };
  const first = parseGIF((await exportBytes(story, { endMs: 100, finalHoldMs: 0 })).buffer);
  expect(first.lsd.height).toBe(200);
  const blank = parseGIF((await exportBytes(story, { startMs: 200, captionHeight: 0, finalHoldMs: 0 })).buffer);
  expect(blank.lsd.height).toBe(120);
  expect(delayTicks(blank)).toBe(10);
});

it("uses explicit or document themes and explicit motion independent of system reduced-motion preferences", async () => {
  const themed: DiagramDocument = { ...input, theme: "dark" };
  for (const [options, background, firstX] of [
    [{}, [16, 24, 40], 10],
    [{ theme: "light" }, [255, 255, 255], 10],
    [{ reducedMotion: true }, [16, 24, 40], 140]
  ] as const) {
    const parsed = parseGIF((await exportBytes(themed, { ...options, fps: 2, finalHoldMs: 0 })).buffer);
    const frames = decompressFrames(parsed, true);
    expect(parsed.lsd).toMatchObject({ width: 240, height: 200 });
    expect(delayTicks(parsed)).toBe(100);
    for (const frame of frames) {
      for (const y of [0, 199]) {
        const offset = y * 240 * 4;
        background.forEach((channel, index) => expect(Math.abs(frame.patch[offset + index] - channel)).toBeLessThanOrEqual(3));
        expect(frame.patch[offset + 3]).toBe(255);
      }
    }
    const oppositeX = firstX === 10 ? 140 : 10;
    const active = frames[0].patch.slice((40 * 240 + firstX) * 4, (40 * 240 + firstX) * 4 + 3);
    expect(Array.from(active)).not.toEqual(background);
    const opposite = frames[0].patch.slice((40 * 240 + oppositeX) * 4, (40 * 240 + oppositeX) * 4 + 3);
    background.forEach((channel, index) => expect(Math.abs(opposite[index] - channel)).toBeLessThanOrEqual(3));
  }
});
