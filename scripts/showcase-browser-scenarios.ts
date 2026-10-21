/** Shared behavior checks run against independently built, real showcase hosts. */
import { CATEGORY_STORIES, FORMAL_CATEGORIES, FORMAL_NAMES, inspectCategoryStory } from "./showcase-category-stories.js";
import { chooseOption } from "./showcase-choice.js";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Browser, Page } from "playwright-core";
import { afterAll, beforeAll, expect, it } from "vitest";
import { REPO_ROOT, startShowcaseSite, type ShowcaseSite } from "./showcase-browser-site.js";

/** Register the same user paths for a real app; no app imports another app's runtime or fixtures. */
export function registerShowcaseBrowserScenarios(config: { packageName: string }): void {
  let site: ShowcaseSite;
  let root: string;
  let origin: string;
  let browser: Browser;
  let page: Page;
  beforeAll(async () => {
    site = await startShowcaseSite(config.packageName);
    ({ root, origin, browser, page } = site);
  }, 120_000);
  afterAll(async () => { await site?.close(); }, 30_000);
  it("uses compact choices with keyboard commit and cancellation for theme, scene and speed", async () => {
    await page.goto(`${origin}/acceptance/?theme=light`);
    const theme = page.getByRole("combobox", { name: "Theme", exact: true });
    await theme.focus();
    await theme.press("ArrowDown");
    await theme.press("End");
    expect(await theme.getAttribute("data-value")).toBe("light");
    await theme.press("Escape");
    expect(await theme.getAttribute("aria-expanded")).toBe("false");
    await theme.press("Space");
    await theme.press("End");
    await theme.press("Enter");
    await expect.poll(() => theme.getAttribute("data-value")).toBe("dark");
    const speed = page.getByRole("combobox", { name: "Speed", exact: true });
    await chooseOption(speed, "2");
    expect(await speed.getAttribute("data-value")).toBe("2");
    const scene = page.getByRole("combobox", { name: "Scene", exact: true });
    await scene.press("ArrowDown");
    await scene.press("End");
    await scene.press("Enter");
    expect(Number(await page.getByRole("slider", { name: "Progress" }).inputValue())).toBeGreaterThan(0);
    await speed.click();
    await page.getByRole("heading", { name: "Diagram showcase", exact: true }).click();
    expect(await speed.getAttribute("aria-expanded")).toBe("false");
    const bounds = await page.getByRole("button", { name: "Play", exact: true }).boundingBox();
    expect(bounds?.height).toBe(32);
  });
  it("browses ordered definitions with complete defaults and downloads the selected standalone diagram", async () => {
    await page.goto(`${origin}/acceptance/`);
    const choices = page.getByRole("navigation", { name: "Examples" }).getByRole("button");
    expect(await choices.allTextContents()).toEqual(["Signal at rest", "Signal in motion"]);
    expect(await page.getByRole("heading", { name: "Signal in motion", exact: true }).count()).toBe(1);
    expect(await page.getByText("An acceptance diagram with two scenes and one directed transfer.").count()).toBe(1);
    expect(await page.getByRole("slider", { name: "Progress" }).inputValue()).toBe("0");
    expect(await page.getByRole("combobox", { name: "Speed" }).getAttribute("data-value")).toBe("1.5");
    expect(await page.getByRole("button", { name: "Play", exact: true }).count()).toBe(1);
    await expect.poll(() => page.locator(".flowsvg-canvas > svg").count()).toBe(1);
    await page.getByRole("button", { name: "Play", exact: true }).click();
    await expect.poll(async () => Number(await page.getByRole("slider", { name: "Progress" }).inputValue())).toBeGreaterThan(0);
    await chooseOption(page.getByRole("combobox", { name: "Speed" }), "2");
    await choices.getByText("Signal at rest", { exact: true }).click();
    expect(await page.getByRole("combobox", { name: "Speed" }).getAttribute("data-value")).toBe("0.5");
    expect(await page.getByRole("button", { name: "Play", exact: true }).isDisabled()).toBe(true);
    expect(await page.getByRole("slider", { name: "Progress" }).inputValue()).toBe("0");
    await expect.poll(() => page.locator(".flowsvg-canvas > svg").count()).toBe(1);
    const downloadUrl = await page.getByRole("link", { name: "Download diagram JSON" }).getAttribute("href");
    expect(new URL(downloadUrl!, page.url()).pathname).toBe("/acceptance/json/signal-still.json");
    const pendingDownload = page.waitForEvent("download");
    await page.getByRole("link", { name: "Download diagram JSON" }).click();
    const download = await pendingDownload;
    const path = (await download.path())!;
    const diagram: unknown = JSON.parse(await readFile(path, "utf8"));
    expect(diagram).toMatchObject({ version: 1, title: "Signal at rest", scenes: [] });
    expect(diagram).not.toHaveProperty("defaults");
    expect(diagram).not.toHaveProperty("durationMs");
    const output = join(root, "download.html");
    execFileSync(process.execPath, [join(REPO_ROOT, "packages/flowsvg/dist/node/cli.js"), path, "--output", output, "--format", "html"]);
    expect(await readFile(output, "utf8")).toContain("<svg");
    await choices.getByText("Signal in motion", { exact: true }).click();
    expect(await page.getByRole("combobox", { name: "Speed" }).getAttribute("data-value")).toBe("1.5");
    expect(await page.getByRole("slider", { name: "Progress" }).inputValue()).toBe("0");
    expect(await page.getByRole("button", { name: "Play", exact: true }).count()).toBe(1);
  }, 20_000);

  it("groups formal navigation by purpose and preserves selection across categories", async () => {
    await page.goto(`${origin}/formal/`);
    const navigation = page.getByRole("navigation", { name: "Examples" });
    expect(await navigation.getByRole("heading", { level: 3 }).allTextContents()).toEqual(FORMAL_CATEGORIES);
    const workflow = navigation.getByRole("group", { name: "业务流程", exact: true });
    const architecture = navigation.getByRole("group", { name: "系统架构", exact: true });
    expect(await workflow.getByRole("button").allTextContents()).toEqual(["请求与响应", "RAG：从资料到答案"]);
    expect(await architecture.getByRole("button").allTextContents()).toEqual(["FlowSVG：图解如何运行", "vllm-metal：分层推理架构"]);
    await architecture.getByRole("button", { name: "vllm-metal：分层推理架构", exact: true }).click();
    expect(await architecture.getByRole("button", { name: "vllm-metal：分层推理架构", exact: true }).getAttribute("aria-current")).toBe("true");
    await workflow.getByRole("button", { name: "RAG：从资料到答案", exact: true }).click();
    expect(await workflow.getByRole("button", { name: "RAG：从资料到答案", exact: true }).getAttribute("aria-current")).toBe("true");
    expect(await architecture.locator('[aria-current="true"]').count()).toBe(0);
    await page.reload();
    expect(await workflow.getByRole("button", { name: "RAG：从资料到答案", exact: true }).getAttribute("aria-current")).toBe("true");
  });

  it("opens the formal stories with default styling and downloads the selected RAG document", async () => {
    await page.goto(`${origin}/formal/`);
    expect(await page.getByRole("navigation", { name: "Examples" }).getByRole("button").allTextContents()).toEqual(FORMAL_NAMES);
    expect(await page.getByRole("heading", { name: "请求与响应", exact: true }).count()).toBe(1);
    expect(await page.getByRole("combobox", { name: "Theme", exact: true }).getAttribute("data-value")).toBe("light");
    expect(await page.getByRole("combobox", { name: "Speed", exact: true }).getAttribute("data-value")).toBe("1");
    expect(await page.getByRole("checkbox", { name: "Reduce motion", exact: true }).isChecked()).toBe(false);
    expect(await page.getByRole("slider", { name: "Progress" }).inputValue()).toBe("0");
    expect(await page.getByRole("button", { name: "Play", exact: true }).count()).toBe(1);
    await expect.poll(() => page.locator(".flowsvg-canvas > svg").count()).toBe(1);
    const data = await page.request.get(`${origin}/formal/json/request-response.json`);
    expect(data.status()).toBe(200);
    expect(await data.json()).toMatchObject({ title: "请求与响应", version: 1 });
    expect((await page.request.get(`${origin}/formal/json/signal-motion.json`)).status()).toBe(404);

    await page.getByRole("navigation", { name: "Examples" }).getByRole("button", { name: "RAG：从资料到答案", exact: true }).click();
    expect(await page.getByRole("heading", { name: "RAG：从资料到答案", exact: true }).count()).toBe(1);
    expect(await page.getByRole("slider", { name: "Progress" }).getAttribute("max")).toBe("21000");
    await chooseOption(page.getByRole("combobox", { name: "Scene", exact: true }), "rerank");
    expect(await page.getByRole("slider", { name: "Progress" }).inputValue()).toBe("11000");
    expect(await page.locator('.flowsvg-canvas [data-content-id="reranker"] tspan').allTextContents())
      .toEqual(expect.arrayContaining(["C1", "C2", "保留", "申请流程 · §4.1", "审批要求 · §4.2"]));
    const download = page.waitForEvent("download");
    await page.getByRole("link", { name: "Download diagram JSON" }).click();
    const downloaded = JSON.parse(await readFile((await (await download).path())!, "utf8"));
    expect(downloaded).toMatchObject({ title: "RAG：从资料到答案", version: 1 });
    expect(downloaded).toEqual(await (await page.request.get(`${origin}/formal/json/rag-workflow.json`)).json());
    await page.goto(`${origin}/formal/?example=rag-workflow&theme=dark&reduced=1&time=19500`);
    expect(await page.getByRole("heading", { name: "RAG：从资料到答案", exact: true }).count()).toBe(1);
    expect(await page.getByRole("slider", { name: "Progress" }).inputValue()).toBe("19500");
    expect(await page.getByRole("combobox", { name: "Theme", exact: true }).getAttribute("data-value")).toBe("dark");
    expect(await page.getByRole("checkbox", { name: "Reduce motion", exact: true }).isChecked()).toBe(true);
    expect(await page.locator(".flowsvg-canvas").textContent()).toContain("直属负责人审批");
    await page.reload();
    expect(await page.getByRole("slider", { name: "Progress" }).inputValue()).toBe("19500");

  });

  it("opens the project architecture with scene selection, direct entry and a matching JSON download", async () => {
    await page.goto(`${origin}/formal/`);
    const architecture = page.getByRole("navigation", { name: "Examples" }).getByRole("button", { name: "FlowSVG：图解如何运行", exact: true });
    expect(await architecture.count()).toBe(1);
    await architecture.click();
    expect(await page.getByRole("heading", { name: "FlowSVG：图解如何运行", exact: true }).count()).toBe(1);
    expect(await page.getByRole("slider", { name: "Progress" }).getAttribute("max")).toBe("24000");
    await chooseOption(page.getByRole("combobox", { name: "Scene", exact: true }), "export");
    expect(await page.getByRole("slider", { name: "Progress" }).inputValue()).toBe("14000");
    expect(await page.locator('.flowsvg-canvas [data-content-id="node-tools"]').textContent()).toContain("仅 GIF 需要 Chromium");
    const download = page.waitForEvent("download");
    await page.getByRole("link", { name: "Download diagram JSON" }).click();
    const downloaded: unknown = JSON.parse(await readFile((await (await download).path())!, "utf8"));
    expect(downloaded).toMatchObject({ title: "FlowSVG：图解如何运行", version: 1 });
    expect(downloaded).toEqual(await (await page.request.get(`${origin}/formal/json/project-architecture.json`)).json());
    await page.goto(`${origin}/formal/?example=project-architecture&theme=dark&reduced=1&time=19000`);
    expect(await page.getByRole("slider", { name: "Progress" }).inputValue()).toBe("19000");
    expect(await page.getByRole("combobox", { name: "Theme", exact: true }).getAttribute("data-value")).toBe("dark");
    expect(await page.getByRole("checkbox", { name: "Reduce motion", exact: true }).isChecked()).toBe(true);
    expect(await page.locator(".flowsvg-caption").textContent()).toContain("同一浏览器导出器");
    await page.reload();
    expect(await page.getByRole("slider", { name: "Progress" }).inputValue()).toBe("19000");
  });

  it("opens the nested vllm-metal stack with scene selection and a standalone download", async () => {
    await page.goto(`${origin}/formal/`);
    const choice = page.getByRole("navigation", { name: "Examples" }).getByRole("button", { name: "vllm-metal：分层推理架构", exact: true });
    expect(await choice.count()).toBe(1);
    await choice.click();
    expect(await page.getByRole("slider", { name: "Progress" }).getAttribute("max")).toBe("24000");
    await chooseOption(page.getByRole("combobox", { name: "Scene", exact: true }), "attention");
    expect(await page.getByRole("slider", { name: "Progress" }).inputValue()).toBe("11000");
    expect(await page.locator('.flowsvg-canvas [data-id="mlx-primitives"]').count()).toBe(1);
    expect(await page.locator('.flowsvg-canvas [data-id="metal-owned"]').count()).toBe(1);
    expect(await page.locator('.flowsvg-canvas [data-content-id="paged-attention"]').textContent()).toContain("cu_seqlens");
    const download = page.waitForEvent("download");
    await page.getByRole("link", { name: "Download diagram JSON" }).click();
    const downloaded: unknown = JSON.parse(await readFile((await (await download).path())!, "utf8"));
    expect(downloaded).toMatchObject({ title: "vllm-metal：分层推理架构", version: 1 });
    expect(downloaded).toEqual(await (await page.request.get(`${origin}/formal/json/vllm-metal-stack.json`)).json());
    await page.goto(`${origin}/formal/?example=vllm-metal-stack&theme=dark&reduced=1&time=14500`);
    expect(await page.getByRole("heading", { name: "vllm-metal：分层推理架构", exact: true }).count()).toBe(1);
    expect(await page.getByRole("combobox", { name: "Theme", exact: true }).getAttribute("data-value")).toBe("dark");
    expect(await page.getByRole("checkbox", { name: "Reduce motion", exact: true }).isChecked()).toBe(true);
    expect(await page.locator(".flowsvg-caption").textContent()).toContain("并非每次请求");
    await page.reload();
    expect(await page.getByRole("slider", { name: "Progress" }).inputValue()).toBe("14500");
  });

  it.each(CATEGORY_STORIES)("opens $id with scene selection, direct entry and a matching download", async (story) => {
    // Isolate these navigation-heavy cases from the later Back/Forward history assertions.
    const target = await browser.newPage({ acceptDownloads: true });
    try { await inspectCategoryStory(target, `${origin}/formal/`, story); }
    finally { await target.close(); }
  });

  it("renders an explicitly empty catalog without loading a player", async () => {
    await page.goto(`${origin}/empty/`);
    expect(await page.getByText("No showcase examples configured.", { exact: true }).count()).toBe(1);
    await expect.poll(() => page.locator(".flowsvg-canvas > svg").count()).toBe(0);
    expect(await page.getByRole("link", { name: "Download diagram JSON" }).count()).toBe(0);
    expect(await page.getByRole("navigation", { name: "Examples" }).getByRole("button").count()).toBe(0);
    expect((await page.request.get(`${origin}/empty/json/signal-motion.json`)).status()).toBe(404);
  });

  it("restores a released player when the browser resumes a persisted page", async () => {
    await page.goto(`${origin}/acceptance/`);
    await page.getByRole("navigation", { name: "Examples" }).getByRole("button", { name: "Signal at rest", exact: true }).click();
    // The browser page-cache boundary sends these events without evaluating the module again.
    await page.evaluate(() => {
      window.dispatchEvent(new PageTransitionEvent("pagehide", { persisted: true }));
      window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true }));
    });
    await expect.poll(() => page.locator(".flowsvg-canvas > svg").count()).toBe(1);
    await page.getByRole("navigation", { name: "Examples" }).getByRole("button", { name: "Signal in motion", exact: true }).click();
    expect(await page.getByRole("combobox", { name: "Speed" }).getAttribute("data-value")).toBe("1.5");
  }, 20_000);

  it("changes visual settings at the playing snapshot and retains speed and session preferences", async () => {
    await page.goto(`${origin}/acceptance/`);
    await chooseOption(page.getByRole("combobox", { name: "Speed", exact: true }), "2");
    await page.getByRole("button", { name: "Play", exact: true }).click();
    await expect.poll(async () => Number(await page.getByRole("slider", { name: "Progress" }).inputValue())).toBeGreaterThan(100);
    const before = Number(await page.getByRole("slider", { name: "Progress" }).inputValue());
    await chooseOption(page.getByRole("combobox", { name: "Theme", exact: true }), "light");
    const retained = Number(await page.getByRole("slider", { name: "Progress" }).inputValue());
    expect(retained).toBeGreaterThanOrEqual(before);
    expect(retained).toBeLessThan(before + 700);
    expect(await page.getByRole("combobox", { name: "Speed", exact: true }).getAttribute("data-value")).toBe("2");
    expect(await page.getByRole("button", { name: "Play", exact: true }).count()).toBe(1);
    await page.getByRole("checkbox", { name: "Reduce motion", exact: true }).check();
    expect(Number(await page.getByRole("slider", { name: "Progress" }).inputValue())).toBe(retained);
    expect(await page.locator("[data-flow-id]").count()).toBe(0);
    await page.getByRole("navigation", { name: "Examples" }).getByRole("button", { name: "Signal at rest", exact: true }).click();
    expect(await page.getByRole("combobox", { name: "Theme", exact: true }).getAttribute("data-value")).toBe("light");
    expect(await page.getByRole("checkbox", { name: "Reduce motion", exact: true }).isChecked()).toBe(true);
    expect(await page.getByRole("combobox", { name: "Speed", exact: true }).getAttribute("data-value")).toBe("0.5");
  }, 20_000);

  it("keeps navigation usable after a browser mount failure and only leaves the latest rapid choice mounted", async () => {
    await page.goto(`${origin}/acceptance/`);
    await failNextPlayerMount(page, "Acceptance DOM environment unavailable");
    const choices = page.getByRole("navigation", { name: "Examples" });
    await choices.getByRole("button", { name: "Signal at rest", exact: true }).click();
    await expect.poll(() => page.getByRole("alert").textContent()).toContain("Acceptance DOM environment unavailable");
    await expect.poll(() => page.locator(".flowsvg-canvas > svg").count()).toBe(0);
    await page.getByRole("checkbox", { name: "Reduce motion", exact: true }).check();
    await expect.poll(() => page.locator(".flowsvg-canvas > svg").count()).toBe(1);
    await page.evaluate(() => {
      const choices = document.querySelectorAll<HTMLButtonElement>('nav button');
      for (const index of [1, 0, 1, 0, 1]) choices[index]!.click();
    });
    expect(await page.getByRole("heading", { name: "Signal in motion", exact: true }).count()).toBe(1);
    await expect.poll(() => page.locator(".flowsvg-canvas > svg").count()).toBe(1);
    expect(await page.getByRole("checkbox", { name: "Reduce motion", exact: true }).isChecked()).toBe(true);
    expect(await page.getByRole("combobox", { name: "Speed", exact: true }).getAttribute("data-value")).toBe("1.5");
    expect(await page.getByRole("alert").isVisible()).toBe(false);
  }, 20_000);

  it.each(["selection", "visual", "exit"] as const)("cancels a real pending GIF export on %s without late downloads or retained resources", async (operation) => {
    await page.goto(`${origin}/acceptance/`);
    await installResourceProbe(page);
    const downloads: string[] = [];
    const onDownload = (download: { suggestedFilename(): string }): void => { downloads.push(download.suggestedFilename()); };
    page.on("download", onDownload);
    try {
      await page.getByRole("button", { name: "Export GIF", exact: true }).click({ timeout: 1500 });
      await expect.poll(() => page.evaluate(() => (globalThis as unknown as ResourceProbe).fontsPending())).toBeGreaterThan(0);
      if (operation === "selection") await page.getByRole("navigation", { name: "Examples" }).getByRole("button", { name: "Signal at rest", exact: true }).click();
      else if (operation === "visual") await chooseOption(page.getByRole("combobox", { name: "Theme", exact: true }), "light");
      else await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent("pagehide")));
      await page.evaluate(() => (globalThis as unknown as ResourceProbe).releaseFonts());
      await expect.poll(() => page.evaluate(() => (globalThis as unknown as ResourceProbe).resources())).toEqual({ workers: 0, urls: 0 });
      await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
      expect(downloads).toEqual([]);
      if (operation === "exit") {
        await expect.poll(() => page.locator(".flowsvg-canvas > svg").count()).toBe(0);
        await page.getByRole("navigation", { name: "Examples" }).getByRole("button", { name: "Signal at rest", exact: true }).click();
        await expect.poll(() => page.locator(".flowsvg-canvas > svg").count()).toBe(0);
      } else await expect.poll(() => page.locator(".flowsvg-canvas > svg").count()).toBe(1);
    } finally { page.off("download", onDownload); }
  }, 20_000);

  interface ResourceProbe {
    fontsPending(): number;
    releaseFonts(): void;
    resources(): { workers: number; urls: number };
  }

  async function installResourceProbe(target: Page): Promise<void> {
    await target.evaluate(() => {
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
      const originalLoad = document.fonts.load.bind(document.fonts);
      const pending: Array<() => void> = [];
      document.fonts.load = (...args) => new Promise((resolve, reject) => { pending.push(() => { originalLoad(...args).then(resolve, reject); }); });
      Object.assign(globalThis, {
        fontsPending: () => pending.length,
        releaseFonts: () => { document.fonts.load = originalLoad; pending.splice(0).forEach((release) => release()); },
        resources: () => ({ workers: workers.size, urls: urls.size })
      });
    });
  }

  it("releases a delayed exporter import without starting an old worker or download", async () => {
    await page.goto(`${origin}/acceptance/`);
    await installResourceProbe(page);
    let release: (() => void) | undefined;
    const held = new Promise<void>((done) => { release = done; });
    let requested = false;
    const exportUrl = /\/assets\/export-[^/]+\.js$/;
    await page.route(exportUrl, async (route) => { requested = true; await held; await route.continue(); });
    let downloads = 0;
    const onDownload = (): void => { downloads++; };
    page.on("download", onDownload);
    try {
      await page.getByRole("button", { name: "Export GIF", exact: true }).click({ timeout: 1500 });
      await expect.poll(() => requested).toBe(true);
      await page.getByRole("navigation", { name: "Examples" }).getByRole("button", { name: "Signal at rest", exact: true }).click();
      release!();
      await page.unrouteAll({ behavior: "wait" });
      await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
      expect(await page.evaluate(() => (globalThis as unknown as ResourceProbe).fontsPending())).toBe(0);
      expect(await page.evaluate(() => (globalThis as unknown as ResourceProbe).resources())).toEqual({ workers: 0, urls: 0 });
      expect(downloads).toBe(0);
    } finally { release!(); await page.unrouteAll({ behavior: "wait" }); page.off("download", onDownload); }
  }, 20_000);

  it("cancels an active encoder on visual replacement and permits the current player to export", async () => {
    await page.goto(`${origin}/acceptance/`);
    await installResourceProbe(page);
    let downloads = 0;
    const onDownload = (): void => { downloads++; };
    page.on("download", onDownload);
    try {
      await page.evaluate(() => {
        const status = document.querySelector('.flowsvg-export-controls [role="status"]')!;
        const observer = new MutationObserver(() => {
          if (!status.textContent?.includes("Encoding")) return;
          observer.disconnect();
          document.querySelector<HTMLButtonElement>('#theme [role="combobox"]')!.click();
          document.querySelector<HTMLElement>('#theme [role="option"][data-value="light"]')!.click();
        });
        observer.observe(status, { childList: true });
      });
      await page.getByRole("button", { name: "Export GIF", exact: true }).click({ timeout: 1500 });
      await expect.poll(() => page.evaluate(() => (globalThis as unknown as ResourceProbe).fontsPending())).toBeGreaterThan(0);
      await page.evaluate(() => (globalThis as unknown as ResourceProbe).releaseFonts());
      await expect.poll(() => page.getByRole("combobox", { name: "Theme", exact: true }).getAttribute("data-value")).toBe("light");
      await expect.poll(() => page.evaluate(() => (globalThis as unknown as ResourceProbe).resources())).toEqual({ workers: 0, urls: 0 });
      expect(downloads).toBe(0);
      await page.getByRole("button", { name: "Export GIF", exact: true }).click();
      await expect.poll(() => downloads, { timeout: 15_000 }).toBe(1);
      await expect.poll(() => page.evaluate(() => (globalThis as unknown as ResourceProbe).resources())).toEqual({ workers: 0, urls: 0 });
    } finally { page.off("download", onDownload); }
  }, 30_000);

  it("restores a persisted page snapshot paused with its time, rate and visual preferences", async () => {
    await page.goto(`${origin}/acceptance/`);
    await chooseOption(page.getByRole("combobox", { name: "Speed", exact: true }), "2");
    await page.getByRole("slider", { name: "Progress" }).evaluate((element) => {
      const progress = element as HTMLInputElement;
      progress.value = "1000";
      progress.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await page.evaluate(() => {
      window.dispatchEvent(new PageTransitionEvent("pagehide", { persisted: true }));
      window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true }));
    });
    expect(await page.getByRole("slider", { name: "Progress" }).inputValue()).toBe("1000");
    expect(await page.getByRole("combobox", { name: "Speed", exact: true }).getAttribute("data-value")).toBe("2");
    expect(await page.getByRole("button", { name: "Play", exact: true }).count()).toBe(1);
    expect(await page.getByRole("combobox", { name: "Theme", exact: true }).getAttribute("data-value")).toBe("dark");
    await page.getByRole("checkbox", { name: "Reduce motion", exact: true }).check();
    expect(await page.getByRole("slider", { name: "Progress" }).inputValue()).toBe("1000");
  }, 20_000);

  it("restores and normalizes address fields without changing unrelated bytes, path or fragment", async () => {
    const raw = "u=%20&phrase=one+two&slash=%2f&flag&&example=unknown&theme=light&reduced=bad&time=1e2";
    await page.goto(`${origin}/acceptance/?${raw}#part%2f`);
    expect(await page.getByRole("heading", { name: "Signal in motion", exact: true }).count()).toBe(1);
    expect(await page.getByRole("combobox", { name: "Theme", exact: true }).getAttribute("data-value")).toBe("light");
    expect(await page.getByRole("checkbox", { name: "Reduce motion", exact: true }).isChecked()).toBe(false);
    expect(await page.getByRole("slider", { name: "Progress" }).inputValue()).toBe("0");
    expect(await page.getByRole("status", { name: "Parameter diagnostics" }).textContent()).toMatch(/example.*reduced.*time/);
    expect(page.url()).toBe(`${origin}/acceptance/?u=%20&phrase=one+two&slash=%2f&flag&&example=signal-motion&theme=light&reduced=0&time=0#part%2f`);
    await page.goto(`${origin}/acceptance/?example=signal-motion&theme=light&reduced=1&time=1250.5#saved`);
    expect(await page.getByRole("slider", { name: "Progress" }).inputValue()).toBe("1250.5");
    expect(await page.getByRole("combobox", { name: "Speed", exact: true }).getAttribute("data-value")).toBe("1.5");
    expect(await page.getByRole("button", { name: "Play", exact: true }).count()).toBe(1);
    await page.reload();
    expect(await page.getByRole("slider", { name: "Progress" }).inputValue()).toBe("1250.5");
  }, 20_000);

  async function seekProgress(target: Page, time: number): Promise<void> {
    await target.getByRole("slider", { name: "Progress" }).evaluate((element, value) => {
      const progress = element as HTMLInputElement;
      progress.value = String(value);
      progress.dispatchEvent(new Event("input", { bubbles: true }));
    }, time);
  }

  it("saves old history snapshots before pushes and restores Back/Forward paused at default speed", async () => {
    await page.goto(`${origin}/acceptance/?time=600&u=%20#history`);
    const initialLength = await page.evaluate(() => history.length);
    await chooseOption(page.getByRole("combobox", { name: "Speed", exact: true }), "2");
    await chooseOption(page.getByRole("combobox", { name: "Theme", exact: true }), "light");
    expect(await page.evaluate(() => history.length)).toBe(initialLength + 1);
    expect(await page.getByRole("combobox", { name: "Speed", exact: true }).getAttribute("data-value")).toBe("2");
    await seekProgress(page, 900);
    await page.getByRole("checkbox", { name: "Reduce motion", exact: true }).check();
    expect(await page.evaluate(() => history.length)).toBe(initialLength + 2);
    await page.goBack();
    await expect.poll(() => page.getByRole("slider", { name: "Progress" }).inputValue()).toBe("900");
    expect(await page.getByRole("checkbox", { name: "Reduce motion", exact: true }).isChecked()).toBe(false);
    expect(await page.getByRole("combobox", { name: "Speed", exact: true }).getAttribute("data-value")).toBe("1.5");
    await page.goBack();
    await expect.poll(() => page.getByRole("combobox", { name: "Theme", exact: true }).getAttribute("data-value")).toBe("dark");
    expect(await page.getByRole("slider", { name: "Progress" }).inputValue()).toBe("600");
    await page.goForward();
    await expect.poll(() => page.getByRole("slider", { name: "Progress" }).inputValue()).toBe("900");
    expect(await page.getByRole("button", { name: "Play", exact: true }).count()).toBe(1);
    expect(page.url()).toContain("u=%20");
    expect(page.url()).toContain("#history");
    const lengthBeforeRepeat = await page.evaluate(() => history.length);
    await page.getByRole("navigation", { name: "Examples" }).getByRole("button", { name: "Signal in motion", exact: true }).click();
    await chooseOption(page.getByRole("combobox", { name: "Theme", exact: true }), "light");
    expect(await page.evaluate(() => history.length)).toBe(lengthBeforeRepeat);
    const saved = page.url();
    await seekProgress(page, 200);
    await chooseOption(page.getByRole("combobox", { name: "Speed", exact: true }), "2");
    await page.getByRole("button", { name: "Play", exact: true }).click();
    await expect.poll(async () => Number(await page.getByRole("slider", { name: "Progress" }).inputValue())).toBeGreaterThan(250);
    expect(page.url()).toBe(saved);
    expect(await page.evaluate(() => history.length)).toBe(lengthBeforeRepeat);
    await page.getByRole("navigation", { name: "Examples" }).getByRole("button", { name: "Signal at rest", exact: true }).click();
    expect(await page.getByRole("slider", { name: "Progress" }).inputValue()).toBe("0");
    await page.goBack();
    await expect.poll(() => page.getByRole("heading", { name: "Signal in motion", exact: true }).count()).toBe(1);
    expect(Number(await page.getByRole("slider", { name: "Progress" }).inputValue())).toBeGreaterThan(250);
    await page.goForward();
    await expect.poll(() => page.getByRole("heading", { name: "Signal at rest", exact: true }).count()).toBe(1);
    expect(await page.getByRole("slider", { name: "Progress" }).inputValue()).toBe("0");
  }, 20_000);

  interface ClipboardProbe {
    copied: string[];
    clipboardMode: "success" | "failure" | "pending";
    failCopy(): void;
  }

  async function clipboardPage(mode: ClipboardProbe["clipboardMode"]): Promise<Page> {
    const target = await browser.newPage();
    await target.addInitScript((initialMode) => {
      const probe = { copied: [] as string[], clipboardMode: initialMode, failCopy: () => {} };
      Object.defineProperty(navigator, "clipboard", { configurable: true, value: {
        writeText: (value: string) => {
          probe.copied.push(value);
          if (probe.clipboardMode === "failure") return Promise.reject(new Error("Clipboard permission denied"));
          if (probe.clipboardMode === "pending") return new Promise<void>((_resolve, reject) => { probe.failCopy = () => reject(new Error("Late clipboard failure")); });
          return Promise.resolve();
        }
      } });
      Object.assign(globalThis, probe);
      // Keep service behavior driven by the exposed boundary probe rather than copying its primitive mode.
      Object.defineProperty(globalThis, "clipboardMode", { get: () => probe.clipboardMode, set: (value: typeof initialMode) => { probe.clipboardMode = value; } });
      Object.defineProperty(globalThis, "failCopy", { value: () => probe.failCopy() });
    }, mode);
    return target;
  }

  it("shares the current playing snapshot without replacing or pausing and restores the link on direct entry", async () => {
    const target = await clipboardPage("success");
    try {
      await target.goto(`${origin}/acceptance/?u=%2f#shared`);
      const before = await target.locator(".flowsvg-canvas").elementHandle();
      const length = await target.evaluate(() => history.length);
      await seekProgress(target, 500);
      await chooseOption(target.getByRole("combobox", { name: "Speed", exact: true }), "2");
      await target.getByRole("button", { name: "Play", exact: true }).click();
      await expect.poll(async () => Number(await target.getByRole("slider", { name: "Progress" }).inputValue())).toBeGreaterThan(550);
      await target.getByRole("button", { name: "Share current view", exact: true }).click();
      const copied = await target.evaluate(() => (globalThis as unknown as ClipboardProbe).copied[0]);
      expect(copied).toBe(target.url());
      const savedTime = Number(new URL(copied).searchParams.get("time"));
      expect(savedTime).toBeGreaterThan(550);
      expect(copied).not.toMatch(/(?:speed|playing)=/);
      expect(await target.evaluate(() => history.length)).toBe(length);
      expect(await before!.evaluate((element) => element.isConnected)).toBe(true);
      expect(await target.getByRole("button", { name: "Pause", exact: true }).count()).toBe(1);
      await expect.poll(async () => Number(await target.getByRole("slider", { name: "Progress" }).inputValue())).toBeGreaterThan(savedTime);
      await target.goto(copied);
      expect(Number(await target.getByRole("slider", { name: "Progress" }).inputValue())).toBeCloseTo(savedTime, 5);
      expect(await target.getByRole("button", { name: "Play", exact: true }).count()).toBe(1);
      expect(await target.getByRole("combobox", { name: "Speed", exact: true }).getAttribute("data-value")).toBe("1.5");
    } finally { await target.close(); }
  }, 20_000);

  it("offers a manual share URL on clipboard failure and silences an obsolete pending copy", async () => {
    const target = await clipboardPage("failure");
    try {
      await target.goto(`${origin}/acceptance/?time=1200`);
      const length = await target.evaluate(() => history.length);
      await target.getByRole("button", { name: "Share current view", exact: true }).click();
      await expect.poll(() => target.getByRole("status", { name: "Sharing", exact: true }).textContent()).toContain("Clipboard permission denied");
      expect(await target.getByRole("textbox", { name: "Share URL", exact: true }).inputValue()).toBe(target.url());
      expect(await target.evaluate(() => history.length)).toBe(length);
      await target.evaluate(() => { (globalThis as unknown as ClipboardProbe).clipboardMode = "pending"; });
      await target.getByRole("button", { name: "Share current view", exact: true }).click();
      await chooseOption(target.getByRole("combobox", { name: "Theme", exact: true }), "light");
      await target.evaluate(() => (globalThis as unknown as ClipboardProbe).failCopy());
      await target.evaluate(() => new Promise<void>((resolve) => queueMicrotask(resolve)));
      expect(await target.getByRole("status", { name: "Sharing", exact: true }).isVisible()).toBe(false);
      await target.evaluate(() => { (globalThis as unknown as ClipboardProbe).clipboardMode = "success"; });
      await target.getByRole("button", { name: "Share current view", exact: true }).click();
      await expect.poll(() => target.getByRole("status", { name: "Sharing", exact: true }).textContent()).toBe("Share link copied.");
      expect(await target.getByRole("textbox", { name: "Share URL", exact: true }).isVisible()).toBe(false);
    } finally { await target.close(); }
  }, 20_000);

  it("normalizes duplicate and bounded parameters with replacement only, including an empty entry", async () => {
    const target = await browser.newPage();
    try {
      const initialLength = await target.evaluate(() => history.length);
      await target.goto(`${origin}/acceptance/?example=signal-still&example=signal-still&theme=light&theme=light&reduced=1&reduced=1&time=600&%74ime=600&u=%20#same`);
      expect(await target.evaluate(() => history.length)).toBe(initialLength + 1);
      expect(await target.getByRole("heading", { name: "Signal in motion", exact: true }).count()).toBe(1);
      expect(await target.getByRole("slider", { name: "Progress" }).inputValue()).toBe("0");
      expect(await target.getByRole("combobox", { name: "Theme", exact: true }).getAttribute("data-value")).toBe("dark");
      expect(await target.getByRole("status", { name: "Parameter diagnostics" }).textContent()).toMatch(/example.*theme.*reduced.*time/);
      await target.goto(`${origin}/acceptance/?time=999999`);
      expect(await target.getByRole("slider", { name: "Progress" }).inputValue()).toBe("2400");
      await target.goto(`${origin}/acceptance/?example=signal-still&time=600`);
      expect(await target.getByRole("slider", { name: "Progress" }).inputValue()).toBe("0");
      expect(await target.getByRole("checkbox", { name: "Reduce motion", exact: true }).isChecked()).toBe(true);
      await target.goto(`${origin}/empty/?example=unknown&time=600&u=%20#empty`);
      expect(await target.getByText("No showcase examples configured.", { exact: true }).count()).toBe(1);
      expect(await target.locator(".flowsvg-canvas").count()).toBe(0);
      expect(await target.getByRole("button", { name: "Share current view", exact: true }).isVisible()).toBe(false);
      expect(target.url()).toBe(`${origin}/empty/?u=%20#empty`);
    } finally { await target.close(); }
  }, 20_000);

  it("shares the saved target after a mount failure and history restoration releases an old GIF", async () => {
    const target = await clipboardPage("success");
    try {
      await target.goto(`${origin}/acceptance/?time=700`);
      await chooseOption(target.getByRole("combobox", { name: "Theme", exact: true }), "light");
      await installResourceProbe(target);
      const downloads: string[] = [];
      target.on("download", (download) => { downloads.push(download.suggestedFilename()); });
      await target.getByRole("button", { name: "Export GIF", exact: true }).click();
      await expect.poll(() => target.evaluate(() => (globalThis as unknown as ResourceProbe).fontsPending())).toBeGreaterThan(0);
      await target.goBack();
      await expect.poll(() => target.getByRole("combobox", { name: "Theme", exact: true }).getAttribute("data-value")).toBe("dark");
      await target.evaluate(() => (globalThis as unknown as ResourceProbe).releaseFonts());
      await expect.poll(() => target.evaluate(() => (globalThis as unknown as ResourceProbe).resources())).toEqual({ workers: 0, urls: 0 });
      await target.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      expect(downloads).toEqual([]);
      await failNextPlayerMount(target, "No player for share acceptance");
      await chooseOption(target.getByRole("combobox", { name: "Theme", exact: true }), "light");
      await expect.poll(() => target.getByRole("alert").textContent()).toContain("No player for share acceptance");
      await target.getByRole("button", { name: "Share current view", exact: true }).click();
      const address = await target.evaluate(() => (globalThis as unknown as ClipboardProbe).copied[0]);
      expect(address).toContain("theme=light&reduced=0&time=700");
      await target.getByRole("checkbox", { name: "Reduce motion", exact: true }).check();
      await expect.poll(() => target.locator(".flowsvg-canvas").count()).toBe(1);
    } finally { await target.close(); }
  }, 20_000);
}

/** Fail at SDK canvas creation, after any framework host elements have been created. */
async function failNextPlayerMount(target: Page, message: string): Promise<void> {
  await target.evaluate((failure) => {
    const create = document.createElement.bind(document);
    const descriptor = Object.getOwnPropertyDescriptor(Element.prototype, "className")!;
    document.createElement = ((tag: string, options?: ElementCreationOptions) => {
      const element = create(tag, options);
      if (tag === "div") Object.defineProperty(element, "className", {
        configurable: true,
        get: () => descriptor.get!.call(element) as string,
        set: (value: string) => {
          if (value === "flowsvg-canvas") {
            document.createElement = create;
            throw new Error(failure);
          }
          descriptor.set!.call(element, value);
        }
      });
      return element;
    }) as typeof document.createElement;
  }, message);
}
