import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterAll, beforeAll, expect, it } from "vitest";
import { chromium, type Browser, type Page } from "playwright-core";
import { createDiagram, type DiagramDocument } from "../src/index.js";
import type { PngExportOptions } from "../src/export.js";
const PACKAGE_DIR = new URL("..", import.meta.url).pathname;
const input: DiagramDocument = {
  version: 1, viewport: { width: 240, height: 120 },
  nodes: [{ id: "a", kind: "rect", x: 10, y: 20, width: 40, height: 40, style: { fill: "#ff0000" } }], edges: [],
  scenes: [{ id: "move", label: "Move", beats: [
    { durationMs: 1000, transitionMs: 1000, actions: [{ type: "updateNode", target: "a", value: { x: 150 } }] },
    { durationMs: 1000, actions: [] }
  ] }]
};
let browser: Browser; let page: Page; let directory: string;
beforeAll(async () => {
  execFileSync("pnpm", ["--silent", "build"], { cwd: PACKAGE_DIR });
  directory = await mkdtemp(join(tmpdir(), "flowsvg-png-"));
  const html = join(directory, "export.html");
  await writeFile(html, `<meta charset="utf-8"><script>${await readFile(join(PACKAGE_DIR, "dist/portable/export.js"), "utf8")}</script>`);
  browser = await chromium.launch({ executablePath: process.env.FLOWSVG_CHROMIUM_PATH });
  page = await (await browser.newContext({ offline: true })).newPage();
  await page.goto(pathToFileURL(html).href);
}, 60_000);
afterAll(async () => { await browser?.close(); if (directory) await rm(directory, { recursive: true, force: true }); });
async function sample(document: DiagramDocument, options: Omit<PngExportOptions, "signal"> = {}, points: [number, number][] = [[0, 0]]) {
  return page.evaluate(async ({ document, options, points }) => {
    const api = (globalThis as unknown as { FlowSVGExport: { exportPng(document: unknown, options: unknown): Promise<Uint8Array> } }).FlowSVGExport;
    const bytes = await api.exportPng(document, options);
    const blob = new Blob([bytes as Uint8Array<ArrayBuffer>], { type: "image/png" });
    const bitmap = await createImageBitmap(blob);
    const canvas = globalThis.document.createElement("canvas"); canvas.width = bitmap.width; canvas.height = bitmap.height;
    const context = canvas.getContext("2d")!; context.drawImage(bitmap, 0, 0);
    const pixels = points.map(([x, y]) => Array.from(context.getImageData(x, y, 1, 1).data));
    bitmap.close();
    return { width: canvas.width, height: canvas.height, pixels, header: Array.from(bytes.slice(0, 8)), byteLength: bytes.length };
  }, { document, options, points });
}
it.each(["light", "dark"] as const)("renders authored emphasis into %s PNG pixels", async (theme) => {
  const document: DiagramDocument = { ...input, emphasis: { fill: "#fff4db", stroke: "#b45309", markerText: "#112233" },
    scenes: [{ id: "highlight", label: "Highlight", beats: [{ durationMs: 1000, transitionMs: 0,
      actions: [{ type: "highlight", target: "a" }] }] }] };
  const result = await sample(document, { theme }, [[20, 40]]);
  expect(result.pixels).toEqual([[255, 244, 219, 255]]);
});
it("decodes complete offline PNGs at 0, middle, beat boundary and completed end without downloads", async () => {
  const downloads: string[] = []; page.on("download", (download) => downloads.push(download.suggestedFilename()));
  for (const [timeMs, x] of [[0, 20], [500, 90], [1000, 160], [2000, 160]]) {
    const result = await sample(input, { timeMs }, [[0, 0], [x!, 40]]);
    expect([result.width, result.height]).toEqual([240, 120]);
    expect(result.header).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    expect(result.pixels).toEqual([[255, 255, 255, 255], [255, 0, 0, 255]]);
  }
  expect(downloads).toEqual([]);
});
it("preserves transparent alpha, node paint and edge-label halos in both themes", async () => {
  const document: DiagramDocument = { ...input, scenes: [], nodes: [
    { id: "a", kind: "rect", x: 10, y: 20, width: 40, height: 40, style: { fill: "#ffffff" } },
    { id: "b", kind: "rect", x: 190, y: 20, width: 40, height: 40 }
  ], edges: [{ id: "ab", from: "a", to: "b", label: "relation" }] };
  for (const theme of ["light", "dark"] as const) {
    const transparent = await sample(document, { theme, background: "transparent" }, [[0, 0], [20, 40], [120, 32]]);
    expect(transparent.pixels[0]).toEqual([0, 0, 0, 0]);
    expect(transparent.pixels[1]).toEqual([255, 255, 255, 255]);
    expect(transparent.pixels[2]![3]).toBeGreaterThan(0);
    const opaque = await sample(document, { theme });
    expect(opaque.pixels[0]).toEqual(theme === "light" ? [255, 255, 255, 255] : [16, 24, 40, 255]);
  }
});
it("uses fitted selected cameras and rounded explicit width without changing the authored document", async () => {
  const fitted: DiagramDocument = { ...input, viewport: { width: 240, height: 120, fitHeight: { padding: 8 } }, scenes: [] };
  const before = JSON.stringify(fitted);
  expect(await sample(fitted)).toMatchObject({ width: 240, height: 69 });
  expect(await sample(fitted, { width: 121.4 })).toMatchObject({ width: 121, height: 35 });
  const focused: DiagramDocument = { ...fitted, scenes: [{ id: "focus", label: "Focus", beats: [{ durationMs: 1000, transitionMs: 0, actions: [{ type: "focus", target: "a" }] }] }] };
  expect(await sample(focused, { timeMs: 500, width: 480 })).toMatchObject({ width: 480, height: 240 });
  expect(JSON.stringify(fitted)).toBe(before);
});
it("matches public SVG pixels for focused parallel Chinese flow markers and reduced motion", async () => {
  const document: DiagramDocument = { version: 1, viewport: { width: 400, height: 200 }, typography: { nodeLabel: 24, edgeLabel: 20, flowLabel: 18 },
    nodes: [{ id: "a", kind: "rect", x: 20, y: 20, width: 90, height: 60, label: "客户端" }, { id: "b", kind: "rect", x: 280, y: 20, width: 90, height: 60, label: "服务端" }, { id: "c", kind: "rect", x: 280, y: 120, width: 90, height: 60, label: "存储" }],
    edges: [{ id: "ab", from: "a", to: "b" }, { id: "ac", from: "a", to: "c" }],
    scenes: [{ id: "flow", label: "Flow", beats: [{ durationMs: 1000, transitionMs: 0, actions: [{ type: "flow", target: "ab", direction: "forward", text: "请求" }, { type: "flow", target: "ac", direction: "reverse", text: "响应" }, { type: "focus", target: "a" }] }] }] };
  for (const reducedMotion of [false, true]) {
    const svg = createDiagram(document).renderSvg(500, { background: "transparent", reducedMotion });
    const difference = await page.evaluate(async ({ document, svg, reducedMotion }) => {
      const api = (globalThis as unknown as { FlowSVGExport: { exportPng(document: unknown, options: unknown): Promise<Uint8Array> } }).FlowSVGExport;
      const png = await api.exportPng(document, { timeMs: 500, width: 400, background: "transparent", reducedMotion });
      const canvas = globalThis.document.createElement("canvas"); canvas.width = 400; canvas.height = 200;
      const context = canvas.getContext("2d")!;
      const pngBitmap = await createImageBitmap(new Blob([png as Uint8Array<ArrayBuffer>], { type: "image/png" }));
      context.drawImage(pngBitmap, 0, 0); const actual = context.getImageData(0, 0, 400, 200).data; pngBitmap.close();
      context.clearRect(0, 0, 400, 200);
      const image = new Image(); const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
      try { image.src = url; await image.decode(); context.drawImage(image, 0, 0, 400, 200); const expected = context.getImageData(0, 0, 400, 200).data; return actual.reduce((sum, value, index) => sum + Math.abs(value - expected[index]!), 0); }
      finally { URL.revokeObjectURL(url); }
    }, { document, svg, reducedMotion });
    // PNG decoding can round premultiplied alpha at antialiased edges.
    expect(difference / (400 * 200 * 4)).toBeLessThan(0.01);
  }
});
