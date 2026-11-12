import { execFileSync } from "node:child_process";
import { createServer, type Server } from "node:http";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { build } from "esbuild";
import { chromium, type Browser, type Page } from "playwright-core";
import { decompressFrames, parseGIF } from "gifuct-js";
import { afterAll, beforeAll, expect, it } from "vitest";

const PACKAGE_DIR = new URL("..", import.meta.url).pathname;
let server: Server;
let browser: Browser;
let page: Page;
let directory: string;
let origin: string;
let exportChunk: string;
const input = {
  version: 1, title: "../Client:<report>?*", theme: "dark", viewport: { width: 240, height: 120 },
  nodes: [{ id: "a", kind: "rect", x: 10, y: 10, width: 80, height: 60 }], edges: [],
  scenes: [{ id: "s", label: "Scene", beats: [{ durationMs: 1000, caption: "Caption", actions: [] }] }]
};

beforeAll(async () => {
  execFileSync("pnpm", ["--silent", "build"], { cwd: PACKAGE_DIR });
  directory = await mkdtemp(join(tmpdir(), "flowsvg-player-gif-"));
  const result = await build({
    stdin: { contents: `import {mountPlayer} from './tests/fixtures/player-hosts.ts'; globalThis.mountPlayer=mountPlayer;`, resolveDir: PACKAGE_DIR },
    bundle: true, splitting: true, format: "esm", outdir: directory, entryNames: "player", metafile: true
  });
  exportChunk = basename(Object.entries(result.metafile!.outputs).find(([, output]) => Object.keys(output.inputs).some((name) => name.endsWith("export/browser.js")))?.[0] ?? "missing-export.js");
  server = createServer(async (request, response) => {
    if (request.url === "/") { response.setHeader("Content-Type", "text/html"); response.end('<script type="module" src="/player.js"></script><div id="host"></div>'); return; }
    try { response.setHeader("Content-Type", "text/javascript"); response.end(await readFile(join(directory, basename(request.url ?? "")))); }
    catch { response.statusCode = 404; response.end(); }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No test server address");
  origin = `http://127.0.0.1:${address.port}`;
  browser = await chromium.launch({ executablePath: process.env.FLOWSVG_CHROMIUM_PATH });
  page = await browser.newPage({ acceptDownloads: true });
}, 60_000);
afterAll(async () => {
  await browser?.close();
  if (server) { server.closeAllConnections(); await new Promise<void>((resolve) => server.close(() => resolve())); }
  if (directory) await rm(directory, { recursive: true, force: true });
});

async function mount(entry: import("./fixtures/player-hosts.js").Host = "browser") {
  await page.goto(origin);
  await page.waitForFunction(() => "mountPlayer" in globalThis);
  await page.evaluate(({ documentInput, entry }) => {
    const urls = new Set<string>();
    const workers = new Set<Worker>();
    const createUrl = URL.createObjectURL.bind(URL);
    const revokeUrl = URL.revokeObjectURL.bind(URL);
    URL.createObjectURL = (blob) => { const url = createUrl(blob); urls.add(url); return url; };
    URL.revokeObjectURL = (url) => { urls.delete(url); revokeUrl(url); };
    const OriginalWorker = Worker;
    globalThis.Worker = class extends OriginalWorker {
      constructor(url: string | URL, options?: WorkerOptions) { super(url, options); workers.add(this); }
      override terminate(): void { workers.delete(this); super.terminate(); }
    };
    Object.assign(globalThis, { resources: () => ({ urls: urls.size, workers: workers.size }) });
    const api = globalThis as unknown as {
      mountPlayer: typeof import("./fixtures/player-hosts.js").mountPlayer;
      player: import("./fixtures/player-hosts.js").MountedPlayer;
      source: typeof documentInput;
      releaseFonts: () => void;
    };
    api.source = documentInput;
    api.player = api.mountPlayer(document.getElementById("host")!, entry, documentInput as import("../src/index.js").DiagramDocument, { gifExport: true, reducedMotion: false });
    const original = document.fonts.load.bind(document.fonts);
    const pendingFonts: Array<() => void> = [];
    api.releaseFonts = () => { document.fonts.load = original; pendingFonts.splice(0).forEach((release) => release()); };
    Object.assign(globalThis, { fontsPending: () => pendingFonts.length });
    document.fonts.load = (...args) => new Promise((resolve, reject) => { pendingFonts.push(() => { original(...args).then(resolve, reject); }); });
  }, { documentInput: input, entry });
}

it.each(["browser", "react", "vue", "element"] as const)("%s lazily downloads captured input/theme while playback stays responsive", async (entry) => {
  const requests: string[] = [];
  const onRequest = (request: { url(): string }) => requests.push(request.url());
  page.on("request", onRequest);
  await mount(entry);
  expect(requests.some((url) => url.endsWith(exportChunk))).toBe(false);
  await page.evaluate(() => {
    const api = globalThis as unknown as { source: typeof input; player: import("../src/browser.js").FlowPlayer };
    api.source.viewport.width = 50;
    api.player.seek(123); api.player.setSpeed(2);
  });
  await page.getByRole("button", { name: "Export GIF", exact: true }).click();
  await expect.poll(() => page.locator('[role="status"]').textContent()).toMatch(/Preparing/);
  await page.evaluate(() => {
    const api = globalThis as unknown as { player: import("../src/browser.js").FlowPlayer };
    document.querySelector('[aria-label="Export GIF"]')!.dispatchEvent(new MouseEvent("click"));
    api.player.play(); api.player.setSpeed(3);
  });
  await expect.poll(() => page.evaluate(() => (globalThis as unknown as { player: import("../src/browser.js").FlowPlayer }).player.getState().timeMs)).toBeGreaterThan(123);
  await page.evaluate(async () => {
    const api = globalThis as unknown as { player: import("./fixtures/player-hosts.js").MountedPlayer };
    await api.player.load({ version: 1, theme: "light", viewport: { width: 100, height: 50 }, nodes: [], edges: [], scenes: [] });
  });
  await expect.poll(() => page.evaluate(() => (globalThis as unknown as { fontsPending(): number }).fontsPending())).toBeGreaterThan(0);
  const downloadPromise = page.waitForEvent("download");
  await page.evaluate(() => (globalThis as unknown as { releaseFonts(): void }).releaseFonts());
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.gif$/);
  expect(download.suggestedFilename()).not.toMatch(/[<>:"/\\|?*\x00-\x1f]/);
  const parsed = parseGIF(Uint8Array.from(await readFile((await download.path())!)).buffer);
  expect(parsed.lsd).toMatchObject({ width: 240, height: 200 });
  expect(parsed.frames.reduce((sum, frame) => sum + ("gce" in frame ? frame.gce.delay : 0), 0)).toBe(200);
  expect(Array.from(decompressFrames(parsed, true)[0].patch.slice(0, 4))).toEqual([16, 24, 40, 255]);
  expect(await page.locator('[role="status"]').textContent()).toMatch(/complete/i);
  expect(requests.filter((url) => url.endsWith(exportChunk))).toHaveLength(1);
  expect(await page.evaluate(() => (globalThis as unknown as { player: import("../src/browser.js").FlowPlayer }).player.getState().speed)).toBe(3);
  page.off("request", onRequest);
});

it("keeps the base portable player free of browser exporter and worker implementation", async () => {
  const portable = await readFile(join(PACKAGE_DIR, "dist/portable/player.js"), "utf8");
  expect(portable.includes("GIF export requires")).toBe(false);
  expect(portable.includes("GIF89a")).toBe(false);
  expect(portable.includes("caption-overflow")).toBe(false);
});

it("captures runtime emphasis on click without exporting hover or later document changes", async () => {
  await mount();
  await page.evaluate(async () => {
    const api = globalThis as unknown as { player: import("./fixtures/player-hosts.js").MountedPlayer; runtimeEmphasis: { fill: string } };
    await api.player.load({ version: 1, viewport: { width: 240, height: 120 }, emphasis: { fill: "#fff4db", stroke: "#b45309" },
      nodes: [{ id: "a", kind: "rect", x: 10, y: 10, width: 80, height: 60 }, { id: "b", kind: "rect", x: 140, y: 10, width: 80, height: 60 }], edges: [],
      scenes: [{ id: "s", label: "Highlight", beats: [{ durationMs: 1000, transitionMs: 0, actions: [{ type: "highlight", target: "a" }] }] }] });
    api.runtimeEmphasis = { fill: "#123456" };
    await api.player.options({ gifExport: true, hoverFill: true, reducedMotion: false, emphasis: api.runtimeEmphasis });
  });
  await page.getByRole("button", { name: "Export GIF", exact: true }).click();
  await expect.poll(() => page.evaluate(() => (globalThis as unknown as { fontsPending(): number }).fontsPending())).toBeGreaterThan(0);
  await page.locator('[data-id="b"]').hover({ position: { x: 15, y: 15 } });
  expect(await page.locator('[data-id="b"]').getAttribute("fill")).toBe("#123456");
  await page.evaluate(async () => {
    const api = globalThis as unknown as { player: import("./fixtures/player-hosts.js").MountedPlayer; runtimeEmphasis: { fill: string } };
    api.runtimeEmphasis.fill = "#ff0000";
    await api.player.load({ version: 1, viewport: { width: 100, height: 50 }, nodes: [], edges: [], scenes: [] });
  });
  const downloadPromise = page.waitForEvent("download");
  await page.evaluate(() => (globalThis as unknown as { releaseFonts(): void }).releaseFonts());
  const download = await downloadPromise;
  const frames = decompressFrames(parseGIF(Uint8Array.from(await readFile((await download.path())!)).buffer), true);
  for (const frame of frames) {
    const pixel = (x: number) => Array.from(frame.patch.slice((30 * 240 + x) * 4, (30 * 240 + x) * 4 + 4));
    expect(pixel(30)).toEqual([18, 52, 86, 255]);
    expect(pixel(160)).toEqual([255, 255, 255, 255]);
  }
});

it("cancels a pending module load immediately and permits one fresh export", async () => {
  let releaseModule: (() => void) | undefined;
  const held = new Promise<void>((resolve) => { releaseModule = resolve; });
  await page.route(`**/${exportChunk}`, async (route) => { await held; await route.continue(); });
  const downloads: string[] = [];
  const onDownload = (download: { suggestedFilename(): string }) => downloads.push(download.suggestedFilename());
  page.on("download", onDownload);
  try {
    await mount();
    await page.getByRole("button", { name: "Export GIF", exact: true }).click();
    await page.getByRole("button", { name: "Cancel export" }).click();
    await expect.poll(() => page.getByRole("button", { name: "Export GIF", exact: true }).isEnabled(), { timeout: 1000 }).toBe(true);
    expect(await page.locator('[role="status"]').textContent()).toMatch(/cancelled/);
    await page.getByRole("button", { name: "Export GIF", exact: true }).click();
    releaseModule!();
    await expect.poll(() => page.evaluate(() => (globalThis as unknown as { fontsPending(): number }).fontsPending())).toBeGreaterThan(0);
    await page.evaluate(() => (globalThis as unknown as { releaseFonts(): void }).releaseFonts());
    await expect.poll(() => downloads.length).toBe(1);
  } finally {
    releaseModule!(); await page.unrouteAll({ behavior: "wait" }); page.off("download", onDownload);
  }
});

it.each(["browser", "react", "vue", "element"] as const)("%s cancels active encoding, releases resources and retries after a readable error", async (entry) => {
  await mount(entry);
  const downloads: string[] = [];
  const listener = (download: { suggestedFilename(): string }) => downloads.push(download.suggestedFilename());
  page.on("download", listener);
  try {
    // Worker availability is a browser environment boundary; the real exporter must show an actionable failure.
    await page.evaluate(() => {
      const original = globalThis.Worker;
      Object.defineProperty(globalThis, "Worker", { configurable: true, value: null });
      document.querySelector<HTMLButtonElement>('[aria-label="Export GIF"]')!.click();
      Object.assign(globalThis, { restoreWorker: () => { globalThis.Worker = original; } });
    });
    await expect.poll(() => page.locator('[role="status"]').textContent()).toMatch(/failed:.*browser.*worker/i);
    await page.evaluate(() => {
      (globalThis as unknown as { restoreWorker(): void }).restoreWorker();
      const status = document.querySelector('[role="status"]')!;
      const observer = new MutationObserver(() => {
        if (!status.textContent?.includes("Encoding")) return;
        observer.disconnect();
        Array.from(document.querySelectorAll("button")).find((button) => button.textContent === "Cancel export")!.click();
      });
      observer.observe(status, { childList: true });
    });
    await page.getByRole("button", { name: "Export GIF", exact: true }).click();
    await expect.poll(() => page.evaluate(() => (globalThis as unknown as { fontsPending(): number }).fontsPending())).toBeGreaterThan(0);
    await page.evaluate(() => (globalThis as unknown as { releaseFonts(): void }).releaseFonts());
    await expect.poll(() => page.locator('[role="status"]').textContent()).toMatch(/cancelled/);
    await expect.poll(() => page.evaluate(() => (globalThis as unknown as { resources(): unknown }).resources())).toEqual({ workers: 0, urls: 0 });
    expect(downloads).toHaveLength(0);
    await page.getByRole("button", { name: "Export GIF", exact: true }).click();
    await expect.poll(() => downloads.length).toBe(1);
    await expect.poll(() => page.evaluate(() => (globalThis as unknown as { resources(): unknown }).resources())).toEqual({ workers: 0, urls: 0 });
  } finally { page.off("download", listener); }
});

it.each(["browser", "react", "vue", "element"] as const)("%s silences active export after destruction or option replacement", async (entry) => {
  for (const action of ["destroy", "options"] as const) {
    await mount(entry);
    let downloadCount = 0;
    const listener = () => { downloadCount++; };
    page.on("download", listener);
    try {
      await page.getByRole("button", { name: "Export GIF", exact: true }).click();
      await expect.poll(() => page.locator('[role="status"]').textContent()).toMatch(/Preparing/);
      await expect.poll(() => page.evaluate(() => (globalThis as unknown as { fontsPending(): number }).fontsPending())).toBeGreaterThan(0);
      await page.evaluate(async (operation) => {
        const api = globalThis as unknown as { player: import("./fixtures/player-hosts.js").MountedPlayer; releaseFonts(): void };
        if (operation === "destroy") api.player.destroy();
        else await api.player.options({ gifExport: false, reducedMotion: false });
        api.releaseFonts();
      }, action);
      await expect.poll(() => page.evaluate(() => (globalThis as unknown as { resources(): unknown }).resources())).toEqual({ workers: 0, urls: 0 });
      // Wait one turn beyond the released font service, observing the real browser's task scheduling boundary.
      await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      expect(downloadCount).toBe(0);
      expect(await page.getByRole("button", { name: "Export GIF", exact: true }).count()).toBe(0);
    } finally { page.off("download", listener); }
  }
});

it("destroying during a pending exporter import cannot start a late worker or download", async () => {
  let releaseModule: (() => void) | undefined;
  const held = new Promise<void>((resolve) => { releaseModule = resolve; });
  let moduleRequested = false;
  await page.route(`**/${exportChunk}`, async (route) => { moduleRequested = true; await held; await route.continue(); });
  let downloadCount = 0;
  const listener = () => { downloadCount++; };
  page.on("download", listener);
  try {
    await mount();
    await page.getByRole("button", { name: "Export GIF", exact: true }).click();
    await expect.poll(() => moduleRequested).toBe(true);
    await page.evaluate(() => (globalThis as unknown as { player: import("./fixtures/player-hosts.js").MountedPlayer }).player.destroy());
    releaseModule!();
    await page.unrouteAll({ behavior: "wait" });
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    expect(await page.evaluate(() => (globalThis as unknown as { fontsPending(): number }).fontsPending())).toBe(0);
    expect(await page.evaluate(() => (globalThis as unknown as { resources(): unknown }).resources())).toEqual({ workers: 0, urls: 0 });
    expect(downloadCount).toBe(0);
  } finally { releaseModule!(); await page.unrouteAll({ behavior: "wait" }); page.off("download", listener); }
});

it("captures the document and task slot before a deferred exporter import", async () => {
  let releaseModule: (() => void) | undefined;
  const held = new Promise<void>((resolve) => { releaseModule = resolve; });
  let moduleRequested = false;
  await page.route(`**/${exportChunk}`, async (route) => { moduleRequested = true; await held; await route.continue(); });
  const downloads: Array<import("playwright-core").Download> = [];
  const listener = (download: import("playwright-core").Download) => downloads.push(download);
  page.on("download", listener);
  try {
    await mount();
    await page.getByRole("button", { name: "Export GIF", exact: true }).click();
    await expect.poll(() => moduleRequested).toBe(true);
    await page.evaluate(async () => {
      document.querySelector('[aria-label="Export GIF"]')!.dispatchEvent(new MouseEvent("click"));
      const api = globalThis as unknown as { player: import("./fixtures/player-hosts.js").MountedPlayer };
      await api.player.load({ version: 1, theme: "light", viewport: { width: 100, height: 50 }, nodes: [], edges: [], scenes: [] });
    });
    releaseModule!();
    await expect.poll(() => page.evaluate(() => (globalThis as unknown as { fontsPending(): number }).fontsPending())).toBeGreaterThan(0);
    await page.evaluate(() => (globalThis as unknown as { releaseFonts(): void }).releaseFonts());
    await expect.poll(() => downloads.length).toBe(1);
    const decoded = parseGIF(Uint8Array.from(await readFile((await downloads[0].path())!)).buffer);
    expect(decoded.lsd).toMatchObject({ width: 240, height: 200 });
    expect(Array.from(decompressFrames(decoded, true)[0].patch.slice(0, 4))).toEqual([16, 24, 40, 255]);
    expect(await page.locator('[role="status"]').textContent()).toMatch(/complete/);
    expect(downloads).toHaveLength(1);
  } finally { releaseModule!(); await page.unrouteAll({ behavior: "wait" }); page.off("download", listener); }
});

it.each([[undefined, "FlowSVG.gif"], ["...   ", "FlowSVG.gif"], ["CON", "_CON.gif"]] as const)("downloads a portable filename for title %s", async (title, filename) => {
  await mount();
  await page.evaluate(async (titleInput) => {
    const api = globalThis as unknown as { player: import("./fixtures/player-hosts.js").MountedPlayer; releaseFonts(): void };
    api.releaseFonts();
    await api.player.load({ version: 1, title: titleInput, viewport: { width: 80, height: 40 }, nodes: [], edges: [], scenes: [] });
  }, title);
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export GIF", exact: true }).click();
  const download = await pending;
  expect(download.suggestedFilename()).toBe(filename);
  await download.path();
});
