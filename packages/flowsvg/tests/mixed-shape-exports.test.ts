/** Real offline delivery of one SDK-owned document; public APIs and independent decoders only. */
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterAll, beforeAll, expect, it } from "vitest";
import { chromium, type Browser } from "playwright-core";
import { decompressFrames, parseGIF } from "gifuct-js";
import { createDiagram, type DiagramDocument } from "../src/index.js";

const PACKAGE_DIR = new URL("..", import.meta.url).pathname;
let directory: string;
let browser: Browser;
let model: DiagramDocument;
beforeAll(async () => {
  execFileSync("pnpm", ["--silent", "build"], { cwd: PACKAGE_DIR });
  model = JSON.parse(await readFile(join(PACKAGE_DIR, "examples/mixed-flow.json"), "utf8"));
  directory = await mkdtemp(join(tmpdir(), "flowsvg-mixed-"));
  browser = await chromium.launch({ executablePath: process.env.FLOWSVG_CHROMIUM_PATH });
}, 60_000);
afterAll(async () => { await browser?.close(); if (directory) await rm(directory, { recursive: true, force: true }); }, 30_000);

it.each(["light", "dark"] as const)("plays the shared flow without network in %s", async (theme) => {
  const { renderHtml } = await import(new URL("../dist/node.js", import.meta.url).href);
  const file = join(directory, `${theme}.html`);
  await writeFile(file, await renderHtml(model, { theme }));
  const context = await browser.newContext({ offline: true });
  const requests: string[] = [];
  context.on("request", (request) => { if (/^https?:/.test(request.url())) requests.push(request.url()); });
  const page = await context.newPage();
  try {
    await page.goto(pathToFileURL(file).href);
    const progress = page.getByRole("slider", { name: "Progress" });
    await page.getByRole("button", { name: "Play", exact: true }).click();
    await expect.poll(async () => Number(await progress.inputValue())).toBeGreaterThan(0);
    await page.getByRole("button", { name: "Pause", exact: true }).click();
    for (const time of [0, 1000, 1500, 2000, 3000, 4000]) {
      await progress.fill(String(time)); await progress.dispatchEvent("input");
      const expected = await page.evaluate((svg) => { const root = document.createElement("div"); root.innerHTML = svg; return root.querySelector("svg")!.outerHTML; }, createDiagram(model).renderSvg(time, { theme }));
      expect(await page.locator(".flowsvg-canvas svg").evaluate((svg) => svg.outerHTML)).toBe(expected);
    }
    expect(requests).toEqual([]);
  } finally { await context.close(); }
});

it.each(["light", "dark"] as const)("decodes PNG and GIF contours and clipped labels against SVG in %s", async (theme) => {
  const file = join(directory, "export.html");
  await writeFile(file, `<meta charset="utf-8"><script>${await readFile(join(PACKAGE_DIR, "dist/portable/export.js"), "utf8")}</script>`);
  const context = await browser.newContext({ offline: true });
  const page = await context.newPage();
  try {
    await page.goto(pathToFileURL(file).href);
    // These times cover unchanged state, interpolated size and fully visible overflow.
    for (const timeMs of [0, 1500, 3000]) {
      const svg = createDiagram(model).renderSvg(timeMs, { theme });
      const result = await page.evaluate(async ({ model, svg, timeMs, theme }) => {
        const api: typeof import("../src/export.js") = Reflect.get(globalThis, "FlowSVGExport");
        const png = await api.exportPng(model, { timeMs, theme });
        const canvas = document.createElement("canvas"); canvas.width = 1000; canvas.height = 620;
        const context = canvas.getContext("2d")!;
        const bitmap = await createImageBitmap(new Blob([new Uint8Array(png)], { type: "image/png" }));
        context.drawImage(bitmap, 0, 0); bitmap.close(); const actual = context.getImageData(0, 0, 1000, 620).data;
        const image = new Image(); const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
        try {
          image.src = url; await image.decode(); context.clearRect(0, 0, 1000, 620); context.drawImage(image, 0, 0);
          const expected = Array.from(context.getImageData(0, 0, 1000, 620).data);
          const difference = actual.reduce((sum, value, index) => sum + Math.abs(value - expected[index]!), 0) / actual.length;
          const gif = await api.exportGif(model, { startMs: timeMs, endMs: timeMs + 1, finalHoldMs: 0, includeCaptions: false, fps: 1, theme });
          return { difference, gif: Array.from(gif), expected };
        } finally { URL.revokeObjectURL(url); }
      }, { model, svg, timeMs, theme });
      expect(result.difference).toBeLessThan(0.01);
      const gif = Uint8Array.from(result.gif);
      const decoded = decompressFrames(parseGIF(gif.buffer), true)[0]!;
      expect(decoded.dims).toMatchObject({ width: 1000, height: 620 });
      // A lossy palette can move antialiasing colors; require the complete painted frame to agree.
      const meanError = decoded.patch.reduce((sum, value, index) => sum + Math.abs(value - result.expected[index]!), 0) / decoded.patch.length;
      expect(meanError).toBeLessThan(4);
    }
  } finally { await context.close(); }
}, 60_000);

it("fits mixed clipped labels and the actual PNG camera to visible node paint", async () => {
  const file = join(directory, "fit.html");
  await writeFile(file, `<script>${await readFile(join(PACKAGE_DIR, "dist/portable/export.js"), "utf8")}</script>`);
  const fitted: DiagramDocument = { version: 1, viewport: { width: 1000, height: 620, fitHeight: { padding: 8 } },
    nodes: model.nodes.filter(({ kind }) => kind !== "rect" && kind !== "group").slice(0, 4).map((node, index) => ({
      ...node, parentId: undefined, x: 20 + index * 240, y: 20, width: 200, height: 80, label: "Source line\n".repeat(100)
    })), edges: [], scenes: [] };
  const unlabelled: DiagramDocument = { ...fitted, nodes: fitted.nodes.map((node) => ({ ...node, label: "" })) };
  expect(createDiagram(fitted).evaluateAt(0).camera).toEqual(createDiagram(unlabelled).evaluateAt(0).camera);
  expect(createDiagram(fitted).evaluateAt(0).warnings).toHaveLength(4);
  const context = await browser.newContext({ offline: true }); const page = await context.newPage();
  try {
    await page.goto(pathToFileURL(file).href);
    const size = await page.evaluate(async (model) => {
      const api: typeof import("../src/export.js") = Reflect.get(globalThis, "FlowSVGExport");
      const bytes = await api.exportPng(model);
      const bitmap = await createImageBitmap(new Blob([new Uint8Array(bytes)], { type: "image/png" }));
      const size = { width: bitmap.width, height: bitmap.height }; bitmap.close(); return size;
    }, fitted);
    expect(size).toEqual({ width: 1000, height: 109 });
  } finally { await context.close(); }
});
