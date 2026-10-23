import { execFileSync, spawn } from "node:child_process";
import { cp, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterAll, beforeAll, expect, it } from "vitest";
import { parseGIF, decompressFrames } from "gifuct-js";

const PACKAGE_DIR = fileURLToPath(new URL("..", import.meta.url));
const BROWSER_ARGS = process.env.FLOWSVG_CHROMIUM_PATH ? ["--executable-path", process.env.FLOWSVG_CHROMIUM_PATH] : [];
const NODE_ENTRY = new URL("../dist/node.js", import.meta.url).href;
const input = {
  version: 1, title: "中文导出", viewport: { width: 240, height: 120 },
  nodes: [{ id: "a", kind: "rect", x: 10, y: 10, width: 80, height: 60, label: "客户端" }], edges: [],
  scenes: [{ id: "s", label: "场景", beats: [{ durationMs: 1000, caption: "完成说明", actions: [{ type: "updateNode", target: "a", value: { x: 140 } }] }] }]
};
let directory: string;
beforeAll(async () => {
  execFileSync("pnpm", ["--silent", "build"], { cwd: PACKAGE_DIR });
  directory = await mkdtemp(join(tmpdir(), "flowsvg-node-gif-"));
}, 60_000);
afterAll(async () => { if (directory) await rm(directory, { recursive: true, force: true }); });

it("exports an actual decoded GIF through the Node public entry with fixed inputs and progress", async () => {
  const { exportGif } = await import(NODE_ENTRY);
  const mutable = structuredClone(input);
  const options = { executablePath: process.env.FLOWSVG_CHROMIUM_PATH, theme: "dark", loopCount: 3, fps: 3, finalHoldMs: 500 };
  const phases: string[] = [];
  const capturedOptions = { ...options, onProgress: (progress: { phase: string }) => phases.push(progress.phase) };
  const pending = exportGif(mutable, capturedOptions);
  capturedOptions.theme = "light"; capturedOptions.fps = 30;
  mutable.viewport.width = 12; mutable.nodes[0].label = "mutated";
  const bytes: Uint8Array = await pending;
  expect(bytes).toBeInstanceOf(Uint8Array);
  const parsed = parseGIF(bytes.buffer as ArrayBuffer);
  expect(parsed.lsd).toMatchObject({ width: 240, height: 200 });
  expect(parsed.frames.reduce((sum, frame) => sum + ("gce" in frame ? frame.gce.delay : 0), 0)).toBe(150);
  const loop = parsed.frames.find((frame) => "application" in frame && frame.application.id === "NETSCAPE2.0");
  expect(loop && "application" in loop ? Array.from(loop.application.blocks) : []).toEqual([1, 2, 0]);
  const decoded = decompressFrames(parsed, true);
  expect(Array.from(decoded[0].patch.slice(0, 4))).toEqual([16, 24, 40, 255]);
  expect(phases).toContain("preparing"); expect(phases).toContain("sampling"); expect(phases).toContain("encoding"); expect(phases.at(-1)).toBe("complete");
}, 30_000);

it("keeps an external browser usable, closes task contexts, and cancels without completion", async () => {
  const { chromium } = await import("playwright-core");
  const { exportGif, GifExportError } = await import(NODE_ENTRY);
  const browser = await chromium.launch({ executablePath: process.env.FLOWSVG_CHROMIUM_PATH });
  const userContext = await browser.newContext();
  const userPage = await userContext.newPage();
  try {
    const initialContexts = browser.contexts().length;
    const controller = new AbortController();
    const phases: string[] = [];
    await expect(exportGif(input, { browser, signal: controller.signal, onProgress: (progress: { phase: string }) => {
      phases.push(progress.phase); if (progress.phase === "encoding") controller.abort();
    } })).rejects.toMatchObject({ code: "cancelled" });
    expect(phases).not.toContain("complete");
    expect(browser.contexts()).toHaveLength(initialContexts);
    expect(await userPage.evaluate(() => 6 * 7)).toBe(42);
    const bytes = await exportGif(input, { browser, fps: 1, includeCaptions: false });
    expect(decompressFrames(parseGIF(bytes.buffer), true).length).toBeGreaterThan(0);
    expect(browser.contexts()).toHaveLength(initialContexts);
    await expect(exportGif(input, { browser, executablePath: "/unused" })).rejects.toMatchObject({ code: "options" });
    await expect(exportGif(input, { browser, onProgress: () => { throw new Error("callback exploded"); } })).rejects.toBeInstanceOf(GifExportError);
    expect(browser.contexts()).toHaveLength(initialContexts);
  } finally { await browser.close(); }
}, 30_000);

it("CLI exports GIF options, preserves existing files and leaves no output on invalid options", async () => {
  const source = join(directory, "cli.json");
  const output = join(directory, "cli.gif");
  const cli = join(PACKAGE_DIR, "dist/node/cli.js");
  await writeFile(source, JSON.stringify(input));
  const args = [cli, source, "--output", output, "--format", "gif", ...BROWSER_ARGS,
    "--width", "120", "--fps", "2", "--speed", "2", "--start-ms", "0", "--end-ms", "1000", "--no-captions", "--loop-count", "1", "--final-hold-ms", "0", "--reduced-motion"];
  execFileSync(process.execPath, args, { stdio: "pipe" });
  const original = await readFile(output);
  const parsed = parseGIF(Uint8Array.from(original).buffer);
  expect(parsed.lsd).toMatchObject({ width: 120, height: 60 });
  expect(parsed.frames.reduce((sum, frame) => sum + ("gce" in frame ? frame.gce.delay : 0), 0)).toBe(50);
  expect(parsed.frames.some((frame) => "application" in frame && frame.application.id === "NETSCAPE2.0")).toBe(false);
  expect(() => execFileSync(process.execPath, args, { stdio: "pipe" })).toThrow();
  expect(await readFile(output)).toEqual(original);
  const invalid = join(directory, "invalid.gif");
  expect(() => execFileSync(process.execPath, [...args.slice(0, 3), invalid, ...args.slice(4), "--fps", "31"], { stdio: "pipe" })).toThrow();
  await expect(readFile(invalid)).rejects.toMatchObject({ code: "ENOENT" });
}, 30_000);

it("reports distinct invalid inputs, unavailable Chromium and already cancelled jobs", async () => {
  const { exportGif } = await import(NODE_ENTRY);
  await expect(exportGif({ ...input, extra: () => {} })).rejects.toMatchObject({ code: "document" });
  await expect(exportGif(input, { theme: () => {} })).rejects.toMatchObject({ code: "options" });
  await expect(exportGif(input, null)).rejects.toMatchObject({ code: "options" });
  await expect(exportGif(input, [])).rejects.toMatchObject({ code: "options" });
  await expect(exportGif(input, { executablePath: "/not-installed/Chromium" })).rejects.toMatchObject({ code: "environment", message: expect.stringMatching(/install|executablePath/i) });
  const controller = new AbortController(); controller.abort();
  await expect(exportGif(input, { signal: controller.signal })).rejects.toMatchObject({ code: "cancelled" });
}, 30_000);

it("validates documents and shared export limits before attempting to launch Chromium", async () => {
  const { exportGif } = await import(NODE_ENTRY);
  const executablePath = "/not-installed/Chromium";
  await expect(exportGif({ ...input, version: 99 }, { executablePath })).rejects.toMatchObject({ code: "document" });
  await expect(exportGif(input, { executablePath, fps: 31 })).rejects.toMatchObject({ code: "options" });
  await expect(exportGif(input, { executablePath, width: 1921 })).rejects.toMatchObject({ code: "limit" });
}, 30_000);

it("CLI SIGINT and SIGTERM cancel active encoding with nonzero status and no partial files", async () => {
  const source = join(directory, "cancel.json");
  await writeFile(source, JSON.stringify(input));
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    const output = join(directory, `${signal}.gif`);
    const child = spawn(process.execPath, [join(PACKAGE_DIR, "dist/node/cli.js"), source, "--output", output, "--format", "gif", "--width", "1280", "--fps", "30", ...BROWSER_ARGS]);
    let log = "";
    let sent = false;
    const timeout = setTimeout(() => child.kill("SIGKILL"), 15_000);
    child.stderr.on("data", (data: Buffer) => {
      log += data.toString();
      if (!sent && log.includes("encoding")) { sent = true; child.kill(signal); }
    });
    const result = await new Promise<{ code: number | null; signal: string | null }>((resolve, reject) => {
      child.on("error", reject); child.on("close", (code, signal) => resolve({ code, signal }));
    }).finally(() => clearTimeout(timeout));
    expect(sent).toBe(true);
    expect(result).toEqual({ code: 1, signal: null });
    expect(log).not.toContain("complete");
    await expect(readFile(output)).rejects.toMatchObject({ code: "ENOENT" });
    expect((await readdir(directory)).filter((name) => name.startsWith(`${signal}.gif.`))).toEqual([]);
  }
}, 40_000);

it("copied Node tools render HTML without automation and report missing GIF runtime dependencies", async () => {
  const copied = join(directory, "copied");
  await cp(join(PACKAGE_DIR, "dist"), join(copied, "dist"), { recursive: true });
  await writeFile(join(copied, "package.json"), '{"type":"module"}');
  const source = join(copied, "input.json");
  const html = join(copied, "output.html");
  await writeFile(source, JSON.stringify(input));
  const cli = join(copied, "dist/node/cli.js");
  execFileSync(process.execPath, [cli, source, "--output", html, "--format", "html"], { stdio: "pipe" });
  expect(await readFile(html, "utf8")).toContain("<!doctype html>");
  const script = `import { exportGif } from ${JSON.stringify(pathToFileURL(join(copied, "dist/node.js")).href)};
    try { await exportGif(${JSON.stringify(input)}); process.exitCode = 2; }
    catch (error) { console.log(JSON.stringify({code:error.code,message:error.message})); }`;
  const result = JSON.parse(execFileSync(process.execPath, ["--input-type=module", "--eval", script], { encoding: "utf8", cwd: copied }));
  expect(result).toMatchObject({ code: "environment", message: expect.stringMatching(/playwright-core.*dependenc/i) });
}, 30_000);

it("matches browser-export representative frames, raw delays and loops in the same offline Chromium", async () => {
  const { chromium } = await import("playwright-core");
  const { exportGif } = await import(NODE_ENTRY);
  const browser = await chromium.launch({ executablePath: process.env.FLOWSVG_CHROMIUM_PATH });
  const context = await browser.newContext({ offline: true });
  const page = await context.newPage();
  const requests: string[] = [];
  context.on("request", (request) => { if (/^https?:/.test(request.url())) requests.push(request.url()); });
  try {
    const script = await readFile(join(PACKAGE_DIR, "dist/portable/export.js"), "utf8");
    const html = join(directory, "browser-comparison.html");
    await writeFile(html, `<meta charset="utf-8"><script>${script}</script>`);
    await page.goto(pathToFileURL(html).href);
    const options = { fps: 3, speed: 2, startMs: 250, endMs: 1000, loopCount: 2, theme: "dark", finalHoldMs: 250 };
    const fromBrowser = Uint8Array.from(await page.evaluate(async ({ input, options }) => {
      const api = (globalThis as unknown as { FlowSVGExport: { exportGif(input: unknown, options: unknown): Promise<Uint8Array> } }).FlowSVGExport;
      return Array.from(await api.exportGif(input, options));
    }, { input, options }));
    const fromNode = await exportGif(input, { ...options, browser });
    const expected = parseGIF(fromBrowser.buffer);
    const actual = parseGIF(fromNode.buffer);
    expect(actual.lsd).toEqual(expected.lsd);
    expect(actual.frames.filter((frame) => "application" in frame)).toEqual(expected.frames.filter((frame) => "application" in frame));
    expect(actual.frames.map((frame) => "gce" in frame ? frame.gce.delay : "application")).toEqual(expected.frames.map((frame) => "gce" in frame ? frame.gce.delay : "application"));
    const actualFrames = decompressFrames(actual, true);
    const expectedFrames = decompressFrames(expected, true);
    for (const index of [0, actualFrames.length - 1]) expect(actualFrames[index].patch).toEqual(expectedFrames[index].patch);
    expect(requests).toEqual([]);
  } finally { await browser.close(); }
}, 30_000);

it("keeps the authored camera and node scale in Node GIF when live height fitting is enabled", async () => {
  const { exportGif } = await import(NODE_ENTRY);
  const fitted = {
    version: 1, viewport: { width: 240, height: 160, fitHeight: { padding: 8 } },
    nodes: [{ id: "card", kind: "rect", x: 20, y: 20, width: 60, height: 30, style: { fill: "#ff0000" } }], edges: [], scenes: []
  };
  const before = JSON.stringify(fitted);
  const bytes: Uint8Array = await exportGif(fitted, { executablePath: process.env.FLOWSVG_CHROMIUM_PATH, includeCaptions: false });
  const parsed = parseGIF(bytes.buffer as ArrayBuffer);
  expect(parsed.lsd).toMatchObject({ width: 240, height: 160 });
  const frame = decompressFrames(parsed, true)[0]!;
  const pixel = (x: number, y: number) => Array.from(frame.patch.slice((y * 240 + x) * 4, (y * 240 + x) * 4 + 4));
  expect(pixel(40, 45)).toEqual([255, 0, 0, 255]);
  expect(pixel(40, 80)).toEqual([255, 255, 255, 255]);
  expect(JSON.stringify(fitted)).toBe(before);
});
