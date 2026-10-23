/** Explicit acceptance cases for the four additional diagram purposes. */
import { readFile } from "node:fs/promises";
import type { Page } from "playwright-core";
import { expect } from "vitest";
import { chooseOption } from "./showcase-choice.js";
import { loadStoryDiagram, sceneTime } from "./showcase-timing.js";

export const CATEGORY_STORIES = [
  { id: "job-lifecycle", name: "后台任务生命周期", category: "状态转换", scene: "recover", directScene: "exhaust", directBeat: 1, text: "第 1 次重试", directText: "已失败终态" },
  { id: "order-event-pipeline", name: "订单事件：从采集到指标", category: "数据流", scene: "split", directScene: "overview", directBeat: 0, text: "两条有效记录", directText: "人民币 ¥200" },
  { id: "web-service-deployment", name: "Web 服务：双副本部署", category: "部署拓扑", scene: "health", directScene: "reroute", directBeat: 0, text: "副本 A 不健康", directText: "健康的副本 B" },
  { id: "cache-aside-sequence", name: "缓存未命中：查询与回填", category: "交互时序", scene: "cache-miss", directScene: "response", directBeat: 0, text: "未命中 MISS", directText: "向客户端返回" }
] as const;

export const FORMAL_NAMES = ["请求与响应", "RAG：从资料到答案", "FlowSVG：图解如何运行",
  "vllm-metal：分层推理架构", ...CATEGORY_STORIES.map(({ name }) => name)];
export const FORMAL_CATEGORIES = ["业务流程", "系统架构", ...CATEGORY_STORIES.map(({ category }) => category)];

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
