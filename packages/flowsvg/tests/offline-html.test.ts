import { execFileSync } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterAll, beforeAll, expect, it } from "vitest";
import { chromium } from "playwright-core";
import { decompressFrames, parseGIF } from "gifuct-js";

const PACKAGE_DIR = fileURLToPath(new URL("..", import.meta.url));
const NODE_ENTRY = new URL("../dist/node.js", import.meta.url).href;
const document = {
  version: 1,
  title: "离线图解",
  viewport: { width: 640, height: 320 },
  nodes: [{ id: "client", kind: "rect", x: 40, y: 40, width: 180, height: 80, label: "中文客户端" }],
  edges: [],
  scenes: [{ id: "intro", label: "介绍", beats: [{ durationMs: 1000, caption: "第一步", actions: [] }] }]
};
let temporaryDirectory: string;

beforeAll(async () => {
  execFileSync("pnpm", ["--silent", "build"], { cwd: PACKAGE_DIR });
  temporaryDirectory = await mkdtemp(join(tmpdir(), "flowsvg-html-"));
}, 60_000);
afterAll(async () => rm(temporaryDirectory, { recursive: true, force: true }));

it("generates self-contained HTML through the Node public entry without a browser", async () => {
  const { renderHtml } = await import(NODE_ENTRY);
  const html = await renderHtml(document);
  await writeFile(join(temporaryDirectory, "diagram.html"), html);
  expect(html).toContain("<!doctype html>");
  expect(html).toContain("离线图解");
  const manifest = JSON.parse(await readFile(join(PACKAGE_DIR, "dist/portable/manifest.json"), "utf8"));
  const metadata = JSON.parse(await readFile(join(PACKAGE_DIR, "package.json"), "utf8"));
  expect(manifest.version).toBe(metadata.version);
  expect(manifest.modules).toEqual(["core", "browser", "export"]);
  for (const name of manifest.files) expect((await readFile(join(PACKAGE_DIR, "dist/portable", name))).length).toBeGreaterThan(0);
  expect(html).not.toMatch(/<script[^>]+src=|<link[^>]+href=/i);
  expect(await readFile(join(temporaryDirectory, "diagram.html"), "utf8")).toBe(html);
});

it("CLI preserves existing output and rejects invalid input without partial output", async () => {
  const source = join(temporaryDirectory, "source.json");
  const output = join(temporaryDirectory, "cli.html");
  const cli = join(PACKAGE_DIR, "dist/node/cli.js");
  await writeFile(source, JSON.stringify(document));
  execFileSync(process.execPath, [cli, source, "--output", output, "--format", "html", "--theme", "dark"]);
  const original = await readFile(output, "utf8");
  expect(original).toContain("<!doctype html>");
  expect(() => execFileSync(process.execPath, [cli, source, "--output", output, "--format", "html"], { stdio: "pipe" })).toThrow();
  expect(await readFile(output, "utf8")).toBe(original);
  await writeFile(source, JSON.stringify({ ...document, version: 99 }));
  const invalidOutput = join(temporaryDirectory, "invalid.html");
  expect(() => execFileSync(process.execPath, [cli, source, "--output", invalidOutput, "--format", "html"], { stdio: "pipe" })).toThrow();
  await expect(readFile(invalidOutput)).rejects.toMatchObject({ code: "ENOENT" });
  expect(() => execFileSync(process.execPath, [cli, source, "--output", invalidOutput, "--format", "gif"], { stdio: "pipe" })).toThrow();
});

it.each([false, true])("copied GIF=%s assets generate offline playback with inert hostile text", async (gifExport) => {
  const copiedRoot = join(temporaryDirectory, `copy-${gifExport}`);
  await mkdir(copiedRoot);
  await cp(join(PACKAGE_DIR, "dist"), join(copiedRoot, "dist"), { recursive: true });
  await writeFile(join(copiedRoot, "package.json"), '{"type":"module"}');
  const hostileText = "中文 </script><script>globalThis.flowSvgInjected=true</script>&<>\"'\u2028\u2029";
  const hostileDocument = {
    ...document, title: hostileText,
    nodes: [{ ...document.nodes[0], label: hostileText }],
    scenes: [{ ...document.scenes[0], beats: [
      { durationMs: 1000, caption: hostileText, actions: [] },
      { durationMs: 1000, caption: "第二步", actions: [] }
    ] }]
  };
  const source = join(copiedRoot, "input.json");
  const output = join(copiedRoot, "playback.html");
  await writeFile(source, JSON.stringify(hostileDocument));
  execFileSync(process.env.FLOWSVG_NODE20_PATH ?? process.execPath, [
    join(copiedRoot, "dist/node/cli.js"), source, "--output", output, "--format", "html", "--theme", "dark", ...(gifExport ? ["--gif-export"] : [])
  ], { cwd: copiedRoot, env: { ...process.env, HTTP_PROXY: "http://127.0.0.1:1", HTTPS_PROXY: "http://127.0.0.1:1" } });
  const browser = await chromium.launch({ executablePath: process.env.FLOWSVG_CHROMIUM_PATH });
  try {
    const context = await browser.newContext({ offline: true });
    const requests: string[] = [];
    context.on("request", (request) => { if (/^https?:/.test(request.url())) requests.push(request.url()); });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(pathToFileURL(output).href);
    expect(await page.title()).toBe(hostileText);
    expect(await page.getByRole("button", { name: "Export GIF", exact: true }).count()).toBe(gifExport ? 1 : 0);
    expect(await page.evaluate(() => "flowSvgInjected" in globalThis)).toBe(false);
    expect(await page.locator(".flowsvg-caption").textContent()).toBe(hostileText);
    expect(await page.locator(".flowsvg-canvas").textContent()).toContain("中文");
    expect(await page.getByRole("slider", { name: "Progress" }).inputValue()).toBe("0");
    await page.getByRole("button", { name: "Play", exact: true }).click();
    await page.waitForFunction(() => Number((document.querySelector('[aria-label="Progress"]') as HTMLInputElement).value) > 0);
    await page.getByRole("button", { name: "Pause", exact: true }).click();
    await page.getByRole("button", { name: "Next step" }).click();
    expect(await page.locator(".flowsvg-caption").textContent()).toBe("第二步");
    expect(await page.getByRole("slider", { name: "Progress" }).inputValue()).toBe("1000");
    expect(await page.locator("svg > rect").first().getAttribute("fill")).toBe("#101828");
    expect(await page.locator("body").evaluate((element) => getComputedStyle(element).backgroundColor)).toBe("rgb(16, 24, 40)");
    expect(requests).toEqual([]);
    expect(errors).toEqual([]);
    const cli = join(copiedRoot, "dist/node/cli.js");
    execFileSync(process.execPath, [cli, source, "--output", output, "--format", "html", "--overwrite"]);
    await page.reload();
    expect(await page.locator("svg > rect").first().getAttribute("fill")).toBe("#ffffff");
    expect(await page.getByRole("slider", { name: "Progress" }).inputValue()).toBe("0");
    expect(await page.getByRole("button", { name: "Play", exact: true }).count()).toBe(1);
    execFileSync(process.execPath, [cli, source, "--output", output, "--format", "html", "--overwrite", "--autoplay", "--no-controls", ...(gifExport ? ["--gif-export"] : [])]);
    await page.reload();
    expect(await page.locator(".flowsvg-controls").count()).toBe(0);
    await page.waitForFunction(() => document.querySelector(".flowsvg-caption")?.textContent === "第二步");
  } finally { await browser.close(); }
}, 30_000);

it("fixes validated input before asynchronous asset reads and rejects invalid options", async () => {
  const { renderHtml } = await import(NODE_ENTRY);
  const input = structuredClone(document);
  const options = { theme: "dark", controls: false };
  const output = renderHtml(input, options);
  input.title = "mutated";
  input.nodes[0].label = "mutated";
  options.theme = "light";
  const html = await output;
  expect(html).not.toContain("mutated");
  expect(html).toContain('"theme":"dark"');
  await expect(renderHtml(document, { theme: "invalid" })).rejects.toThrow(/theme/i);
  await expect(renderHtml(document, { autoplay: "yes" })).rejects.toThrow(/autoplay/i);
});

it("embeds optional same-version GIF capability without adding it to default HTML", async () => {
  const { renderHtml } = await import(NODE_ENTRY);
  const basic = await renderHtml(document);
  const enabled = await renderHtml(document, { gifExport: true });
  expect(basic).not.toContain("GIF89a");
  expect(enabled).toContain("GIF89a");
  expect(enabled).toContain('"gifExport":true');
  expect(enabled).not.toMatch(/<script[^>]+src=|<link[^>]+href=/i);
});

it("validates and snapshots the HTML GIF option before reading assets", async () => {
  const { renderHtml } = await import(NODE_ENTRY);
  await expect(renderHtml(document, { gifExport: "true" })).rejects.toThrow(/gifExport.*boolean/);
  const options = { gifExport: true };
  const output = renderHtml(document, options);
  options.gifExport = false;
  expect((await output).includes("GIF89a")).toBe(true);
  expect((await renderHtml(document, { gifExport: false })).includes("GIF89a")).toBe(false);
});

it("CLI generates optional GIF HTML without Chromium or installed runtime dependencies", async () => {
  const copiedRoot = join(temporaryDirectory, "gif-tool");
  await mkdir(copiedRoot);
  await cp(join(PACKAGE_DIR, "dist"), join(copiedRoot, "dist"), { recursive: true });
  await writeFile(join(copiedRoot, "package.json"), '{"type":"module"}');
  const source = join(copiedRoot, "input.json");
  const output = join(copiedRoot, "gif.html");
  await writeFile(source, JSON.stringify(document));
  execFileSync(process.execPath, [join(copiedRoot, "dist/node/cli.js"), source,
    "--output", output, "--format", "html", "--gif-export"], {
    cwd: copiedRoot,
    env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: join(copiedRoot, "no-browser"), HTTP_PROXY: "http://127.0.0.1:1", HTTPS_PROXY: "http://127.0.0.1:1" }
  });
  const html = await readFile(output, "utf8");
  expect(html.includes("GIF89a")).toBe(true);
  expect(html).toContain('"gifExport":true');
});

it.each(["light", "dark"] as const)("offline %s HTML downloads real GIF, reports progress, cancels and keeps playback responsive", async (theme) => {
  const { renderHtml } = await import(NODE_ENTRY);
  const animated = {
    ...document,
    nodes: [{ ...document.nodes[0], style: { fill: "#ff0000" } }],
    scenes: [{ id: "move", label: "移动", beats: [{ durationMs: 1000, caption: "中文说明", actions: [
      { type: "updateNode", target: "client", value: { x: 350 } }
    ] }] }]
  };
  const output = join(temporaryDirectory, `download-${theme}.html`);
  await writeFile(output, await renderHtml(animated, { theme, gifExport: true }));
  const browser = await chromium.launch({ executablePath: process.env.FLOWSVG_CHROMIUM_PATH });
  try {
    const context = await browser.newContext({ offline: true, acceptDownloads: true });
    const requests: string[] = [];
    context.on("request", (request) => requests.push(request.url()));
    const page = await context.newPage();
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(pathToFileURL(output).href);
    expect(await page.locator(".flowsvg-caption").textContent()).toBe("中文说明");
    expect(await page.locator(".flowsvg-canvas").textContent()).toContain("中文客户端");
    await page.evaluate(() => {
      const original = document.fonts.load.bind(document.fonts);
      const pending: Array<() => void> = [];
      Object.assign(globalThis, { releaseFonts: () => {
        document.fonts.load = original;
        pending.splice(0).forEach((release) => release());
      } });
      document.fonts.load = (...args) => new Promise((resolve, reject) => {
        pending.push(() => { original(...args).then(resolve, reject); });
      });
    });
    const downloads: string[] = [];
    page.on("download", (download) => downloads.push(download.suggestedFilename()));
    await page.getByRole("button", { name: "Export GIF", exact: true }).click();
    await expect.poll(() => page.locator('[role="status"]').textContent()).toMatch(/Preparing/);
    expect(await page.getByRole("progressbar", { name: "GIF export progress" }).isVisible()).toBe(true);
    await page.getByRole("button", { name: "Play", exact: true }).click();
    await page.waitForFunction(() => Number((document.querySelector('[aria-label="Progress"]') as HTMLInputElement).value) > 0);
    await page.getByRole("button", { name: "Pause", exact: true }).click();
    await page.getByRole("button", { name: "Cancel export" }).click();
    await expect.poll(() => page.locator('[role="status"]').textContent()).toMatch(/cancelled/);
    await page.evaluate(() => (globalThis as unknown as { releaseFonts(): void }).releaseFonts());
    expect(downloads).toEqual([]);
    await page.evaluate(() => {
      const phases: string[] = [];
      Object.assign(globalThis, { exportPhases: phases });
      new MutationObserver(() => { phases.push(document.querySelector('[role="status"]')?.textContent ?? ""); })
        .observe(document.querySelector('[role="status"]')!, { childList: true });
    });
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export GIF", exact: true }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe("离线图解.gif");
    const parsed = parseGIF(Uint8Array.from(await readFile((await download.path())!)).buffer);
    expect(parsed.lsd).toMatchObject({ width: 640, height: 400 });
    expect(parsed.frames.reduce((sum, frame) => sum + ("gce" in frame ? frame.gce.delay : 0), 0)).toBe(200);
    const frames = decompressFrames(parsed, true);
    const first = frames[0].patch;
    const last = frames[frames.length - 1].patch;
    const pixel = (frame: Uint8ClampedArray, x: number, y: number) => Array.from(frame.slice((y * 640 + x) * 4, (y * 640 + x) * 4 + 4));
    const background = theme === "dark" ? [16, 24, 40, 255] : [255, 255, 255, 255];
    expect(pixel(first, 0, 0)).toEqual(background);
    expect(pixel(first, 60, 70)).toEqual([255, 0, 0, 255]);
    expect(pixel(last, 60, 70)).toEqual(background);
    expect(pixel(last, 370, 70)).toEqual([255, 0, 0, 255]);
    const captionPixels = Array.from({ length: 220 * 50 }, (_, index) => pixel(first, index % 220, 320 + Math.floor(index / 220)));
    expect(captionPixels.filter((value) => value.slice(0, 3).some((channel, index) => Math.abs(channel - background[index]) > 30)).length).toBeGreaterThan(100);
    const phases = await page.evaluate(() => (globalThis as unknown as { exportPhases: string[] }).exportPhases);
    expect(phases.some((value) => value.includes("Sampling"))).toBe(true);
    expect(phases.some((value) => value.includes("Encoding"))).toBe(true);
    expect(await page.locator('[role="status"]').textContent()).toMatch(/complete/);
    expect(downloads).toHaveLength(1);
    expect(requests.filter((url) => !url.startsWith("blob:") && url !== pathToFileURL(output).href)).toEqual([]);
    expect(errors).toEqual([]);
  } finally { await browser.close(); }
}, 30_000);
