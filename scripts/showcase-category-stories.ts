/** Shared navigation, download and direct-address acceptance cases for the formal category stories. */
import { readFile } from "node:fs/promises";
import type { Page } from "playwright-core";
import { expect } from "vitest";
import { chooseOption } from "./showcase-choice.js";
import { loadStoryDiagram, sceneTime } from "./showcase-timing.js";

export const CATEGORY_STORIES = [
  { id: "job-lifecycle", name: "Background task lifecycle", category: "State transitions", scene: "recover", directScene: "exhaust", directBeat: 1, text: "first retry", directText: "Failed terminal state" },
  { id: "order-event-pipeline", name: "Order events: From ingestion to metrics", category: "Data flow", scene: "split", directScene: "overview", directBeat: 0, text: "Two valid records", directText: "CNY 200" },
  { id: "emphasis-flow", name: "Emphasis colors and flow highlighting", category: "Data flow", scene: "preserve-edge", directScene: "compare", directBeat: 0, text: "stay purple", directText: "Compare all three" },
  { id: "web-service-deployment", name: "Web service: Two-replica deployment", category: "Deployment", scene: "health", directScene: "reroute", directBeat: 0, text: "replica A unhealthy", directText: "healthy replica B" },
  { id: "cache-aside-sequence", name: "Cache miss: Read and populate", category: "Sequence", scene: "cache-miss", directScene: "response", directBeat: 0, text: "returns MISS", directText: "to the client" }
] as const;

export const FORMAL_WORKFLOW_NAMES = ["Basic shapes: complete catalog", "Request and response", "RAG: From sources to answers", "LLM inference: Prefill, decode and KV cache"];
export const FORMAL_NAMES = [...FORMAL_WORKFLOW_NAMES, "FlowSVG: SDK architecture",
  "vllm-metal: Layered inference architecture", ...CATEGORY_STORIES.map(({ name }) => name)];
export const FORMAL_CATEGORIES = ["Workflow", "Architecture", ...new Set(CATEGORY_STORIES.map(({ category }) => category))];

async function readTaskGeometry(page: Page) {
  return page.locator(".flowsvg-canvas > svg rect[data-id]").evaluateAll((nodes) => nodes.map((node) =>
    ["data-id", "x", "y", "width", "height"].map((attribute) => node.getAttribute(attribute))));
}

/** Observe real controls and SVG geometry without mirroring the player's clock in the host. */
async function inspectTaskPlayback(page: Page, geometry: Awaited<ReturnType<typeof readTaskGeometry>>): Promise<void> {
  const progress = page.getByRole("slider", { name: "Progress" });
  const readDotAt = async (time: number) => {
    await progress.evaluate((element, value) => {
      (element as HTMLInputElement).value = String(value);
      element.dispatchEvent(new Event("input", { bubbles: true }));
    }, time);
    const marker = page.locator('circle[data-flow-id="schedule"]');
    expect(await marker.getAttribute("r")).toBe("5");
    expect(await marker.getAttribute("fill")).not.toBe("none");
    return [await marker.getAttribute("cx"), await marker.getAttribute("cy")];
  };
  const leaving = await readDotAt(2050);
  const moving = await readDotAt(2150);
  expect(moving).not.toEqual(leaving);
  const arrived = await readDotAt(2500);
  expect(arrived).not.toEqual(moving);
  expect(await readDotAt(2744)).toEqual(arrived);
  for (const time of [10_000, 0, 6000]) {
    await progress.evaluate((element, value) => {
      (element as HTMLInputElement).value = String(value);
      element.dispatchEvent(new Event("input", { bubbles: true }));
    }, time);
    expect(Number(await progress.inputValue())).toBeCloseTo(time, 6);
    expect(await readTaskGeometry(page)).toEqual(geometry);
  }
  for (const start of [6000, null]) {
    const before = start ?? Number(await progress.inputValue());
    await page.getByRole("button", { name: "Play", exact: true }).click();
    await expect.poll(async () => Number(await progress.inputValue())).toBeGreaterThan(before);
    await page.getByRole("button", { name: "Pause", exact: true }).click();
    expect(await page.getByRole("button", { name: "Play", exact: true }).count()).toBe(1);
    expect(await readTaskGeometry(page)).toEqual(geometry);
  }
}

/** Exercise public navigation, real downloads and restored frames on any host or deployment base. */
export async function inspectCategoryStory(page: Page, address: string, story: typeof CATEGORY_STORIES[number]) {
  const diagram = await loadStoryDiagram(page, address, story.id);
  const time = sceneTime(diagram, story.scene);
  const directTime = sceneTime(diagram, story.directScene, story.directBeat);
  await page.goto(address);
  const group = page.getByRole("navigation", { name: "Examples" }).getByRole("group", { name: story.category, exact: true });
  await group.getByRole("button", { name: story.name, exact: true }).click();
  expect(await page.locator("#introduction h2").textContent()).toBe(story.name);
  expect(await page.getByRole("slider", { name: "Progress" }).inputValue()).toBe("0");
  expect(await page.getByRole("slider", { name: "Progress" }).getAttribute("max")).toBe(String(diagram.totalDuration));
  const taskGeometry = story.id === "job-lifecycle" ? await readTaskGeometry(page) : undefined;
  if (taskGeometry) {
    expect(taskGeometry).toHaveLength(6);
    expect(taskGeometry.every((attributes) => attributes[3] === "220" && attributes[4] === "141")).toBe(true);
  }
  await chooseOption(page.getByRole("combobox", { name: "Scene", exact: true }), story.scene);
  expect(Number(await page.getByRole("slider", { name: "Progress" }).inputValue())).toBeCloseTo(time, 6);
  expect(await page.locator(".flowsvg-caption").textContent()).toContain(story.text);
  if (taskGeometry) await inspectTaskPlayback(page, taskGeometry);
  const response = await page.request.get(`${address}json/${story.id}.json`);
  expect(response.status()).toBe(200);
  const document: unknown = await response.json();
  expect(document).toMatchObject({ version: 1, title: story.name });
  expect(document).not.toHaveProperty("defaults");
  const download = page.waitForEvent("download");
  await page.getByRole("link", { name: "Download diagram JSON" }).click();
  expect(JSON.parse(await readFile((await (await download).path())!, "utf8"))).toEqual(document);
  const svgs: string[] = [];
  for (const [theme, reduced] of [["light", "0"], ["dark", "0"], ["dark", "1"]]) {
    await page.goto(`${address}?example=${story.id}&time=${directTime}&theme=${theme}&reduced=${reduced}`);
    expect(Number(await page.getByRole("slider", { name: "Progress" }).inputValue())).toBeCloseTo(directTime, 6);
    expect(await page.getByRole("combobox", { name: "Theme", exact: true }).getAttribute("data-value")).toBe(theme);
    expect(await page.getByRole("checkbox", { name: "Reduce motion", exact: true }).isChecked()).toBe(reduced === "1");
    expect(await page.locator(".flowsvg-caption").textContent()).toContain(story.directText);
    if (taskGeometry) expect(await readTaskGeometry(page)).toEqual(taskGeometry);
    svgs.push(await page.locator(".flowsvg-canvas > svg").evaluate((element) => element.outerHTML));
  }
  await page.reload();
  expect(Number(await page.getByRole("slider", { name: "Progress" }).inputValue())).toBeCloseTo(directTime, 6);
  return { document, svgs };
}
