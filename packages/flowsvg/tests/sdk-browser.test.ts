/** Run SDK-owned HTML acceptance through Chromium while serving only SDK files. */
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { extname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Browser, type Page } from "playwright-core";
import { afterAll, beforeAll, expect, it } from "vitest";

const SDK_ROOT = fileURLToPath(new URL("..", import.meta.url));
const MIME_TYPES: Readonly<Record<string, string>> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json" };
const PAGES = [
  ["controls", "browserTestResults"], ["visual-updates", "browserTestResults"],
  ["lifecycle", "browserTestResults"], ["focus", "browserFocusResults"],
  ["accessibility", "browserAccessibilityResults"], ["web-component", "browserWebComponentResults"],
  ["flow-text", "browserFlowTextResults"], ["parallel-flows", "browserTestResults"]
];
let server: Server;
let browser: Browser;
let origin: string;

function createSdkServer(): Server {
  return createServer(async (request, response) => {
    try {
      const pathname = new URL(request.url ?? "/", "http://localhost").pathname;
      const path = resolve(SDK_ROOT, `.${decodeURIComponent(pathname)}`);
      if (relative(SDK_ROOT, path).startsWith("..")) { response.writeHead(403).end(); return; }
      const bytes = await readFile(path);
      response.writeHead(200, { "Content-Type": MIME_TYPES[extname(path)] ?? "application/octet-stream" }).end(bytes);
    } catch (error) {
      const missing = error instanceof Error && "code" in error && error.code === "ENOENT";
      response.writeHead(missing ? 404 : 500).end(missing ? "Not found" : "Cannot read SDK acceptance asset");
    }
  });
}

beforeAll(async () => {
  execFileSync("pnpm", ["--silent", "build"], { cwd: SDK_ROOT });
  server = createSdkServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Expected SDK acceptance server address");
  origin = `http://127.0.0.1:${address.port}`;
  browser = await chromium.launch({ executablePath: process.env.FLOWSVG_CHROMIUM_PATH });
}, 120_000);

afterAll(async () => {
  await browser?.close();
  if (server) await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

async function withPage(run: (page: Page, errors: string[]) => Promise<void>): Promise<void> {
  const page = await browser.newPage();
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("response", (response) => { if (response.status() >= 400 && !response.url().endsWith("favicon.ico")) errors.push(`${response.status()} ${response.url()}`); });
  try { await run(page, errors); } finally { await page.close(); }
}

it.each(PAGES)("passes SDK-only %s browser regressions", async (name, resultKey) => {
  await withPage(async (page, errors) => {
    await page.goto(`${origin}/tests/browser-${name}.html`);
    await page.waitForFunction((key) => Array.isArray(Reflect.get(window, key)), resultKey);
    const results: { passed: boolean; error?: string }[] = await page.evaluate((key) => Reflect.get(window, key), resultKey);
    expect(results.length).toBeGreaterThan(0);
    expect(results.filter(({ passed }) => !passed)).toEqual([]);
    expect(errors).toEqual([]);
  });
}, 30_000);

it.each(["light", "dark"])("keeps content hits, clipping and cleanup independent of apps in %s", async (theme) => {
  await withPage(async (page, errors) => {
    await page.goto(`${origin}/tests/browser-node-content.html?theme=${theme}`);
    await page.waitForFunction("Boolean(window.contentFixture)", undefined, { timeout: 5_000 });
    await page.locator('[data-id="facts"]').first().click();
    await expect.poll(() => page.locator("#click").textContent()).toBe("click: facts");
    await page.locator("#replace").click();
    expect(await page.locator('[data-content-id="facts"]').textContent()).toContain("Current content");
    expect(await page.locator("clipPath").count()).toBe(3);
    const bounds = await page.locator("#host").boundingBox();
    if (!bounds) throw new Error("Expected visible SDK host");
    await page.mouse.click(bounds.x + 280, bounds.y + 200);
    expect(await page.locator("#click").textContent()).toBe("click: none");
    for (const control of ["label", "clear", "shrink", "reload"]) {
      await page.locator(`#${control}`).click();
      expect(await page.evaluate("window.contentFixture.matchesCore()")).toBe(true);
    }
    await page.locator("#destroy").click();
    expect(await page.locator("#host").innerHTML()).toBe("");
    expect(errors).toEqual([]);
  });
}, 30_000);
