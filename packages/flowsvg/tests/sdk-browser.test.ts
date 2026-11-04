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

it("centers rendered tag text using real font metrics, including styled spans and wrapping", async () => {
  await withPage(async (page, errors) => {
    await page.goto(`${origin}/tests/browser-controls.html`);
    await page.addScriptTag({ type: "module", content: "import * as sdk from '/dist/index.js'; window.tagSdk = sdk;" });
    await page.waitForFunction("Boolean(window.tagSdk)");
    const offsets = await page.evaluate(async () => {
      const sdk: typeof import("../src/index.js") = Reflect.get(window, "tagSdk");
      const diagram = sdk.createDiagram({ version: 1, viewport: { width: 400, height: 400 },
        nodes: [{ id: "tags", kind: "rect", x: 0, y: 0, width: 220, height: 380,
          content: { blocks: [{ type: "list", items: [
            { tags: [{ text: "Question vector", style: { shape: "pill", fontSize: 12 } }] },
            { tags: [{ text: "After retrieval", style: { shape: "pill", fontSize: 12 } }] },
            { tags: [{ text: [{ text: "Mixed " }, { text: "styles", style: { fontWeight: 700, color: "#123456" } }] }] },
            { tags: [{ text: "A long label that wraps onto another line" }] }
          ] }] } }], edges: [], scenes: [] });
      const host = document.createElement("div");
      document.body.append(host);
      host.innerHTML = diagram.renderSvg();
      await document.fonts.ready;
      const layout = diagram.evaluateAt(0).nodes[0]!.contentLayout!;
      const texts = host.querySelectorAll<SVGTextElement>('[data-content-id="tags"] text');
      const result = layout.lines.map((line, index) => {
        const tag = layout.tags.find((candidate) => candidate.itemIndex === line.itemIndex && candidate.tagIndex === line.tagIndex)!;
        const box = texts[index]!.getBBox();
        return { text: line.text, offset: box.x + box.width / 2 - (tag.x + tag.width / 2) };
      });
      host.remove();
      return result;
    });
    expect(offsets.length).toBeGreaterThan(4);
    for (const { text, offset } of offsets) expect(Math.abs(offset), text).toBeLessThan(1);
    expect(errors).toEqual([]);
  });
});

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

it.each(["forward", "reverse"] as const)("keeps rounded %s markers and hits on Chromium's visible SVG geometry", async (direction) => {
  await withPage(async (page, errors) => {
    await page.goto(`${origin}/tests/browser-controls.html`);
    await page.addScriptTag({ type: "module", content: "import * as sdk from '/dist/index.js'; window.roundedSdk = sdk;" });
    await page.waitForFunction("Boolean(window.roundedSdk)");
    const result = await page.evaluate((flowDirection) => {
      const sdk: typeof import("../src/index.js") = Reflect.get(window, "roundedSdk");
      const diagram = sdk.createDiagram({
        version: 1, viewport: { width: 500, height: 400 },
        nodes: [
          { id: "source", kind: "rect", x: 20, y: 100, width: 100, height: 60 },
          { id: "target", kind: "rect", x: 300, y: 220, width: 100, height: 60 },
          { id: "blocker", kind: "rect", x: 175, y: 160, width: 60, height: 50 }
        ],
        edges: [{ id: "transfer", from: "source", to: "target", route: "orthogonal", style: { strokeWidth: 6 } }],
        scenes: [{ id: "send", label: "Send", beats: [{ durationMs: 1000, actions: [
          { type: "flow", target: "transfer", direction: flowDirection }
        ] }] }]
      });
      const root = new DOMParser().parseFromString(diagram.renderSvg(0), "image/svg+xml");
      const path = root.querySelector<SVGPathElement>('path[data-id="transfer"]');
      if (!path) throw new Error("Expected exported transfer path");
      let maximumError = 0;
      let missedHits = 0;
      // Sample movement only: an arrived marker sits on a node boundary, where node hits take precedence.
      for (let sample = 1; sample < 200; sample += 1) {
        const time = (diagram.beats[0]!.endMs - 500) * sample / 200;
        const flow = diagram.evaluateAt(time).edges[0]!.flow!;
        const point = flow.point;
        const progress = flowDirection === "forward" ? flow.progress : 1 - flow.progress;
        const expected = path.getPointAtLength(path.getTotalLength() * progress);
        maximumError = Math.max(maximumError, Math.hypot(point.x - expected.x, point.y - expected.y));
        if (diagram.hitTest(time, point)?.id !== "transfer") missedHits += 1;
      }
      return { rounded: path.getAttribute("d")!.includes(" Q "), maximumError, missedHits };
    }, direction);
    expect(result.rounded).toBe(true);
    expect(result.maximumError).toBeLessThan(0.1);
    expect(result.missedHits).toBe(0);
    expect(errors).toEqual([]);
  });
});
