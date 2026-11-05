/** Verify copied artifacts through separate static origins, including lazy SDK resources. */
import { CATEGORY_STORIES, FORMAL_CATEGORIES, FORMAL_NAMES, inspectCategoryStory } from "./showcase-category-stories.js";
import { chooseOption } from "./showcase-choice.js";
import { loadStoryDiagram, beatTime } from "./showcase-timing.js";
import { execFileSync } from "node:child_process";
import { cp, mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { extname, join, resolve } from "node:path";
import { chromium, type Browser, type Page } from "playwright-core";
import { expect, it } from "vitest";
import { REPO_ROOT } from "./showcase-browser-site.js";

const HOSTS = ["native", "react", "vue"] as const;
const BASES = ["/", "/showcase/"] as const;
const CONTENT_TYPES: Readonly<Record<string, string>> = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
};
const STATES = [
  { time: 0, theme: "light", reduced: "0" },
  { time: 800, theme: "dark", reduced: "0" },
  { time: 1600, theme: "light", reduced: "1" },
];

/** Build through the maintainer command rather than depending on prepared app output. */
function buildExamples(base: string, source: string): void {
  execFileSync("pnpm", ["build:examples"], {
    cwd: REPO_ROOT,
    stdio: "pipe",
    env: { ...process.env, SHOWCASE_BASE: base, SHOWCASE_SOURCE: source },
  });
}

/** The server can expose one copied artifact only; there is no repository or route fallback. */
async function serveArtifact(
  root: string,
  base: string,
): Promise<{ address: string; close(): Promise<void> }> {
  const server: Server = createServer((request, response) => {
    const path = new URL(request.url ?? "/", "http://localhost").pathname;
    if (!path.startsWith(base)) {
      response.writeHead(404).end();
      return;
    }
    const local = path.slice(base.length);
    const target = resolve(root, local === "" ? "index.html" : local);
    if (!target.startsWith(`${root}/`)) {
      response.writeHead(403).end();
      return;
    }
    void readFile(target).then(
      (bytes) => {
        response.setHeader(
          "Content-Type",
          CONTENT_TYPES[extname(target)] ?? "application/octet-stream",
        );
        response.end(bytes);
      },
      () => {
        response.writeHead(404).end();
      },
    );
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const socket = server.address();
  if (!socket || typeof socket === "string")
    throw new Error("Artifact server has no address");
  return {
    address: `http://127.0.0.1:${socket.port}${base}`,
    async close() {
      server.closeAllConnections();
      await new Promise<void>((done) => server.close(() => done()));
    },
  };
}

async function inspectDefaults(page: Page, address: string) {
  await page.goto(address);
  const names = await page
    .getByRole("navigation", { name: "Examples" })
    .getByRole("button")
    .allTextContents();
  const choices = [];
  for (const id of ["signal-still", "signal-motion"]) {
    await page.goto(`${address}?example=${id}`);
    choices.push({
      id: new URL(page.url()).searchParams.get("example"),
      title: await page.locator("#introduction h2").textContent(),
      introduction: await page.locator("#introduction p").textContent(),
      theme: await page
        .getByRole("combobox", { name: "Theme", exact: true }).getAttribute("data-value"),
      reducedMotion: await page
        .getByRole("checkbox", { name: "Reduce motion", exact: true })
        .isChecked(),
      speed: await page
        .getByRole("combobox", { name: "Speed", exact: true }).getAttribute("data-value"),
      time: await page.getByRole("slider", { name: "Progress" }).inputValue(),
    });
  }
  await page.goto(address);
  return {
    names,
    defaultName: await page.locator("#introduction h2").textContent(),
    choices,
  };
}

async function inspectShare(page: Page, address: string): Promise<void> {
  await page.goto(
    `${address}?example=signal-motion&theme=dark&reduced=0&time=800&retained=%20#frame`,
  );
  await page.reload();
  expect(
    await page.getByRole("slider", { name: "Progress" }).inputValue(),
  ).toBe("800");
  await page.evaluate(() =>
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async () => {
          throw new Error("manual-copy probe");
        },
      },
    }),
  );
  await page
    .getByRole("button", { name: "Share current view", exact: true })
    .click();
  const saved = await page
    .getByRole("textbox", { name: "Share URL", exact: true })
    .inputValue();
  expect(saved).toBe(page.url());
  expect(saved).toContain("retained=%20");
  expect(saved).toContain("#frame");
  await page.goto(saved);
  expect(
    await page.getByRole("slider", { name: "Progress" }).inputValue(),
  ).toBe("800");
}

async function inspectHistory(page: Page): Promise<void> {
  await chooseOption(page
    .getByRole("combobox", { name: "Theme", exact: true }), "light");
  await page
    .getByRole("navigation", { name: "Examples" })
    .getByRole("button", { name: "Signal at rest", exact: true })
    .click();
  await page.goBack();
  await expect
    .poll(() => page.getByRole("slider", { name: "Progress" }).inputValue())
    .toBe("800");
  await page.goBack();
  await expect
    .poll(() =>
      page.getByRole("combobox", { name: "Theme", exact: true }).getAttribute("data-value"),
    )
    .toBe("dark");
  await page.goForward();
  await expect
    .poll(() =>
      page.getByRole("combobox", { name: "Theme", exact: true }).getAttribute("data-value"),
    )
    .toBe("light");
}

async function inspectDownloads(page: Page): Promise<void> {
  const download = page.waitForEvent("download");
  await page.getByRole("link", { name: "Download diagram JSON" }).click();
  const jsonFile = (await (await download).path())!;
  expect(JSON.parse(await readFile(jsonFile, "utf8"))).toMatchObject({
    version: 1,
    title: "Signal in motion",
  });
  const gifDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export GIF", exact: true }).click();
  const gifFile = (await (await gifDownload).path())!;
  expect((await readFile(gifFile)).subarray(0, 6).toString()).toMatch(
    /^GIF8[79]a$/,
  );
}

interface ArtifactComparison {
  defaults: Awaited<ReturnType<typeof inspectDefaults>>;
  json: readonly unknown[];
  svgs: readonly string[];
}

async function openArtifact(
  browser: Browser,
  temporary: string,
  host: string,
  base: string,
) {
  const artifact = await mkdtemp(join(temporary, `${host}-`));
  await cp(join(REPO_ROOT, "apps", `${host}-example`, "dist"), artifact, {
    recursive: true,
  });
  const site = await serveArtifact(artifact, base);
  try {
    const page = await browser.newPage({ acceptDownloads: true });
    return {
      address: site.address,
      page,
      async close() {
        await page.close();
        await site.close();
      },
    };
  } catch (error) {
    await site.close();
    throw error;
  }
}

function observeResources(page: Page, address: string) {
  const badResources: string[] = [];
  const resources: string[] = [];
  page.on("response", (response) => {
    const url = response.url();
    resources.push(url);
    // GIF sampling reads in-memory SVG blobs created by this page; these are not external assets.
    const sameOriginBlob =
      url.startsWith("blob:") &&
      new URL(url).origin === new URL(address).origin;
    if (
      (!url.startsWith(address) && !sameOriginBlob) ||
      response.status() >= 400
    )
      badResources.push(`${response.status()} ${url}`);
  });
  page.on("requestfailed", (request) => badResources.push(request.url()));
  return { badResources, resources };
}

async function inspectCatalog(page: Page, address: string) {
  const defaults = await inspectDefaults(page, address);
  expect(defaults.names).toEqual(["Signal at rest", "Signal in motion"]);
  expect(defaults.defaultName).toBe("Signal in motion");
  expect(
    defaults.choices.map(({ speed, theme, reducedMotion, time }) => ({
      speed,
      theme,
      reducedMotion,
      time,
    })),
  ).toEqual([
    { speed: "0.5", theme: "light", reducedMotion: true, time: "0" },
    { speed: "1.5", theme: "dark", reducedMotion: false, time: "0" },
  ]);
  const json = await Promise.all(
    ["signal-still", "signal-motion"].map(async (id) => {
      const response = await page.request.get(`${address}json/${id}.json`);
      expect(response.status()).toBe(200);
      const document: unknown = await response.json();
      expect(document).not.toHaveProperty("defaults");
      expect(document).not.toHaveProperty("durationMs");
      return document;
    }),
  );
  return { defaults, json };
}

async function inspectSvgStates(
  page: Page,
  address: string,
): Promise<readonly string[]> {
  const svgs: string[] = [];
  for (const state of STATES) {
    await page.goto(
      `${address}?example=signal-motion&theme=${state.theme}&reduced=${state.reduced}&time=${state.time}`,
    );
    const canvas = page.locator(".flowsvg-canvas > svg");
    await expect.poll(() => canvas.count()).toBe(1);
    const svg = await canvas.evaluate((element) => element.outerHTML);
    expect(svg).toContain("Source");
    svgs.push(svg);
  }
  return svgs;
}

async function inspectArtifact(
  page: Page,
  address: string,
): Promise<ArtifactComparison> {
  const probe = observeResources(page, address);
  const catalog = await inspectCatalog(page, address);
  const svgs = await inspectSvgStates(page, address);
  await inspectShare(page, address);
  await inspectHistory(page);
  await inspectDownloads(page);
  expect(
    probe.resources.some((url) => /\/assets\/export-[^/]+\.js$/.test(url)),
  ).toBe(true);
  expect(probe.badResources).toEqual([]);
  // A nested document path must 404: only query navigation is part of this artifact.
  expect((await page.request.get(`${address}not-a-route`)).status()).toBe(404);
  return { ...catalog, svgs };
}

async function inspectEmptyArtifact(
  page: Page,
  address: string,
): Promise<void> {
  await page.goto(address);
  expect(
    await page
      .getByText("No showcase examples configured.", { exact: true })
      .count(),
  ).toBe(1);
  expect(await page.locator(".flowsvg-canvas > svg").count()).toBe(0);
  expect(
    await page.getByRole("link", { name: "Download diagram JSON" }).count(),
  ).toBe(0);
  expect(
    (await page.request.get(`${address}json/signal-motion.json`)).status(),
  ).toBe(404);
}

/** Compare the architecture document and representative states through the copied site's own base. */
async function inspectArchitectureArtifact(page: Page, address: string) {
  const diagram = await loadStoryDiagram(page, address, "project-architecture");
  await page.getByRole("navigation", { name: "Examples" }).getByRole("button", { name: "FlowSVG: How diagrams run", exact: true }).click();
  expect(await page.locator("#introduction h2").textContent()).toBe("FlowSVG: How diagrams run");
  expect(await page.getByRole("slider", { name: "Progress" }).inputValue()).toBe("0");
  const response = await page.request.get(`${address}json/project-architecture.json`);
  expect(response.status()).toBe(200);
  const document: unknown = await response.json();
  expect(document).toMatchObject({ version: 1, title: "FlowSVG: How diagrams run" });
  expect(document).not.toHaveProperty("defaults");
  const download = page.waitForEvent("download");
  await page.getByRole("link", { name: "Download diagram JSON" }).click();
  expect(JSON.parse(await readFile((await (await download).path())!, "utf8"))).toEqual(document);
  const svgs: string[] = [];
  for (const state of [
    { time: beatTime(diagram, 1), theme: "light", reduced: "0", text: "SVG" },
    { time: beatTime(diagram, 8), theme: "dark", reduced: "0", text: "the same browser exporter" },
    { time: beatTime(diagram, 10), theme: "light", reduced: "1", text: "the SDK does not depend on them" }
  ]) {
    await page.goto(`${address}?example=project-architecture&time=${state.time}&theme=${state.theme}&reduced=${state.reduced}`);
    const canvas = page.locator(".flowsvg-canvas > svg");
    await expect.poll(() => canvas.count()).toBe(1);
    expect(Number(await page.getByRole("slider", { name: "Progress" }).inputValue())).toBeCloseTo(state.time, 6);
    expect(await page.locator(".flowsvg-caption").textContent()).toContain(state.text);
    svgs.push(await canvas.evaluate((element) => element.outerHTML));
  }
  await page.reload();
  expect(Number(await page.getByRole("slider", { name: "Progress" }).inputValue())).toBeCloseTo(beatTime(diagram, 10), 6);
  return { document, svgs };
}

/** Compare the layered vllm-metal document and representative states through the copied site's own base. */
async function inspectVllmMetalArtifact(page: Page, address: string) {
  const diagram = await loadStoryDiagram(page, address, "vllm-metal-stack");
  await page.getByRole("navigation", { name: "Examples" }).getByRole("button", { name: "vllm-metal: Layered inference architecture", exact: true }).click();
  expect(await page.locator("#introduction h2").textContent()).toBe("vllm-metal: Layered inference architecture");
  expect(await page.getByRole("slider", { name: "Progress" }).inputValue()).toBe("0");
  const response = await page.request.get(`${address}json/vllm-metal-stack.json`);
  expect(response.status()).toBe(200);
  const document: unknown = await response.json();
  expect(document).toMatchObject({ version: 1, title: "vllm-metal: Layered inference architecture" });
  expect(document).not.toHaveProperty("defaults");
  const download = page.waitForEvent("download");
  await page.getByRole("link", { name: "Download diagram JSON" }).click();
  expect(JSON.parse(await readFile((await (await download).path())!, "utf8"))).toEqual(document);
  const svgs: string[] = [];
  for (const state of [
    { time: beatTime(diagram, 1), theme: "light", reduced: "0", text: "KV block IDs" },
    { time: beatTime(diagram, 4), theme: "dark", reduced: "0", text: "not used on every request" },
    { time: beatTime(diagram, 7), theme: "light", reduced: "1", text: "Reference" }
  ]) {
    await page.goto(`${address}?example=vllm-metal-stack&time=${state.time}&theme=${state.theme}&reduced=${state.reduced}`);
    const canvas = page.locator(".flowsvg-canvas > svg");
    await expect.poll(() => canvas.count()).toBe(1);
    expect(Number(await page.getByRole("slider", { name: "Progress" }).inputValue())).toBeCloseTo(state.time, 6);
    expect(await page.locator(".flowsvg-caption").textContent()).toContain(state.text);
    svgs.push(await canvas.evaluate((element) => element.outerHTML));
  }
  await page.reload();
  expect(Number(await page.getByRole("slider", { name: "Progress" }).inputValue())).toBeCloseTo(beatTime(diagram, 7), 6);
  return { document, svgs };
}

async function inspectFormalArtifact(page: Page, address: string) {
  const probe = observeResources(page, address);
  await page.goto(address);
  expect(await page.getByRole("navigation", { name: "Examples" }).getByRole("button").allTextContents()).toEqual(FORMAL_NAMES);
  const navigation = page.getByRole("navigation", { name: "Examples" });
  expect(await navigation.getByRole("heading", { level: 3 }).allTextContents()).toEqual(FORMAL_CATEGORIES);
  expect(await navigation.getByRole("group", { name: "Workflow", exact: true }).getByRole("button").allTextContents()).toEqual(["Request and response", "RAG: From sources to answers", "LLM inference: Prefill, decode and KV cache"]);
  expect(await navigation.getByRole("group", { name: "Architecture", exact: true }).getByRole("button").allTextContents()).toEqual(["FlowSVG: How diagrams run", "vllm-metal: Layered inference architecture"]);
  expect(await page.locator("#introduction h2").textContent()).toBe("Request and response");
  expect(await page.getByRole("combobox", { name: "Theme", exact: true }).getAttribute("data-value")).toBe("dark");
  expect(await page.getByRole("combobox", { name: "Speed", exact: true }).getAttribute("data-value")).toBe("1");
  expect(await page.getByRole("checkbox", { name: "Reduce motion", exact: true }).isChecked()).toBe(false);
  expect(await page.getByRole("slider", { name: "Progress" }).inputValue()).toBe("0");
  const response = await page.request.get(`${address}json/request-response.json`);
  expect(response.status()).toBe(200);
  const document: unknown = await response.json();
  expect(document).toMatchObject({ version: 1, title: "Request and response" });
  expect(document).not.toHaveProperty("defaults");
  const svgs: string[] = [];
  for (const state of [
    { time: 1500, theme: "light", reduced: "0" },
    { time: 7500, theme: "dark", reduced: "0" },
    { time: 4500, theme: "light", reduced: "1" }
  ]) {
    await page.goto(`${address}?time=${state.time}&theme=${state.theme}&reduced=${state.reduced}`);
    const canvas = page.locator(".flowsvg-canvas > svg");
    await expect.poll(() => canvas.count()).toBe(1);
    svgs.push(await canvas.evaluate((element) => element.outerHTML));
  }
  expect(probe.badResources).toEqual([]);
  expect((await page.request.get(`${address}json/signal-motion.json`)).status()).toBe(404);
  await page.getByRole("navigation", { name: "Examples" }).getByRole("button", { name: "RAG: From sources to answers", exact: true }).click();
  expect(await page.locator("#introduction h2").textContent()).toBe("RAG: From sources to answers");
  expect(await page.getByRole("slider", { name: "Progress" }).inputValue()).toBe("0");
  const ragResponse = await page.request.get(`${address}json/rag-workflow.json`);
  expect(ragResponse.status()).toBe(200);
  const ragDocument: unknown = await ragResponse.json();
  const ragDiagram = await loadStoryDiagram(page, address, "rag-workflow");
  expect(ragDocument).toMatchObject({ version: 1, title: "RAG: From sources to answers" });
  expect(ragDocument).not.toHaveProperty("defaults");
  const download = page.waitForEvent("download");
  await page.getByRole("link", { name: "Download diagram JSON" }).click();
  expect(JSON.parse(await readFile((await (await download).path())!, "utf8"))).toEqual(ragDocument);
  for (const state of [
    { time: beatTime(ragDiagram, 6), theme: "light", reduced: "0", text: "C3 Balance" },
    { time: beatTime(ragDiagram, 7), theme: "dark", reduced: "0", text: "Application · §4.1" },
    { time: beatTime(ragDiagram, 10), theme: "light", reduced: "1", text: "Manager approval" }
  ]) {
    await page.goto(`${address}?example=rag-workflow&time=${state.time}&theme=${state.theme}&reduced=${state.reduced}`);
    const canvas = page.locator(".flowsvg-canvas > svg");
    await expect.poll(() => canvas.count()).toBe(1);
    expect(Number(await page.getByRole("slider", { name: "Progress" }).inputValue())).toBeCloseTo(state.time, 6);
    expect(await canvas.textContent()).toContain(state.text);
    svgs.push(await canvas.evaluate((element) => element.outerHTML));
  }
  await page.reload();
  expect(Number(await page.getByRole("slider", { name: "Progress" }).inputValue())).toBeCloseTo(beatTime(ragDiagram, 10), 6);
  expect(probe.badResources).toEqual([]);
  const architecture = await inspectArchitectureArtifact(page, address);
  expect(probe.badResources).toEqual([]);
  const metalStack = await inspectVllmMetalArtifact(page, address);
  expect(probe.badResources).toEqual([]);
  const categoryStories = [];
  for (const story of CATEGORY_STORIES) categoryStories.push(await inspectCategoryStory(page, address, story));
  expect(probe.badResources).toEqual([]);
  return { document, ragDocument, svgs, architecture, metalStack, categoryStories };
}

it("delivers all formal stories including nested stack selection, direct entry and downloads through matching root/subpath artifacts", async () => {
  const temporary = await mkdtemp(join(tmpdir(), "flowsvg-formal-delivery-"));
  const browser = await chromium.launch({ executablePath: process.env.FLOWSVG_CHROMIUM_PATH });
  let baseline: Awaited<ReturnType<typeof inspectFormalArtifact>> | undefined;
  try {
    for (const base of BASES) {
      buildExamples(base, "dist/formal.js");
      for (const host of HOSTS) {
        const site = await openArtifact(browser, temporary, host, base);
        try {
          const observed = await inspectFormalArtifact(site.page, site.address);
          baseline ??= observed;
          expect(observed, `${host} formal artifact at ${base}`).toEqual(baseline);
        } finally { await site.close(); }
      }
    }
  } finally {
    await browser.close();
    await rm(temporary, { recursive: true, force: true });
  }
}, 180_000);

it("delivers matching catalogs and SVG through each isolated root/subpath artifact including history and lazy GIF export", async () => {
  const temporary = await mkdtemp(join(tmpdir(), "flowsvg-delivery-"));
  const browser = await chromium.launch({
    executablePath: process.env.FLOWSVG_CHROMIUM_PATH,
  });
  let baseline: ArtifactComparison | undefined;
  try {
    for (const base of BASES) {
      buildExamples(base, "dist/acceptance.js");
      for (const host of HOSTS) {
        const site = await openArtifact(browser, temporary, host, base);
        try {
          const observed = await inspectArtifact(site.page, site.address);
          baseline ??= observed;
          expect(observed, `${host} artifact at ${base}`).toEqual(baseline);
        } finally {
          await site.close();
        }
      }
    }
    // Explicit empty generation after acceptance must remove every JSON document and player.
    buildExamples("/showcase/", "dist/acceptance-empty.js");
    for (const host of HOSTS) {
      const site = await openArtifact(browser, temporary, host, "/showcase/");
      try {
        await inspectEmptyArtifact(site.page, site.address);
      } finally {
        await site.close();
      }
    }
  } finally {
    await browser.close();
    await rm(temporary, { recursive: true, force: true });
  }
}, 300_000);
