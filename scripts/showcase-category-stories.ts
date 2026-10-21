/** Explicit acceptance cases for the four additional diagram purposes. */
import { readFile } from "node:fs/promises";
import type { Page } from "playwright-core";
import { expect } from "vitest";
import { chooseOption } from "./showcase-choice.js";

export const CATEGORY_STORIES = [
  { id: "job-lifecycle", name: "后台任务生命周期", category: "状态转换", duration: 18000,
    scene: "recover", time: 6000, directTime: 12000, text: "第 1 次重试", directText: "已失败终态" },
  { id: "order-event-pipeline", name: "订单事件：从采集到指标", category: "数据流", duration: 21000,
    scene: "split", time: 9000, directTime: 18000, text: "两条有效记录", directText: "人民币 ¥200" },
  { id: "web-service-deployment", name: "Web 服务：双副本部署", category: "部署拓扑", duration: 20000,
    scene: "health", time: 16000, directTime: 18000, text: "副本 A 不健康", directText: "健康的副本 B" },
  { id: "cache-aside-sequence", name: "缓存未命中：查询与回填", category: "交互时序", duration: 19000,
    scene: "cache-miss", time: 5000, directTime: 15000, text: "未命中 MISS", directText: "向客户端返回" }
] as const;

export const FORMAL_NAMES = ["请求与响应", "RAG：从资料到答案", "FlowSVG：图解如何运行",
  "vllm-metal：分层推理架构", ...CATEGORY_STORIES.map(({ name }) => name)];
export const FORMAL_CATEGORIES = ["业务流程", "系统架构", ...CATEGORY_STORIES.map(({ category }) => category)];

/** Exercise public navigation, real downloads and restored frames on any host or deployment base. */
export async function inspectCategoryStory(page: Page, address: string, story: typeof CATEGORY_STORIES[number]) {
  await page.goto(address);
  const group = page.getByRole("navigation", { name: "Examples" }).getByRole("group", { name: story.category, exact: true });
  await group.getByRole("button", { name: story.name, exact: true }).click();
  expect(await page.locator("#introduction h2").textContent()).toBe(story.name);
  expect(await page.getByRole("slider", { name: "Progress" }).inputValue()).toBe("0");
  expect(await page.getByRole("slider", { name: "Progress" }).getAttribute("max")).toBe(String(story.duration));
  await chooseOption(page.getByRole("combobox", { name: "Scene", exact: true }), story.scene);
  expect(await page.getByRole("slider", { name: "Progress" }).inputValue()).toBe(String(story.time));
  expect(await page.locator(".flowsvg-caption").textContent()).toContain(story.text);
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
    await page.goto(`${address}?example=${story.id}&time=${story.directTime}&theme=${theme}&reduced=${reduced}`);
    expect(await page.getByRole("slider", { name: "Progress" }).inputValue()).toBe(String(story.directTime));
    expect(await page.getByRole("combobox", { name: "Theme", exact: true }).getAttribute("data-value")).toBe(theme);
    expect(await page.getByRole("checkbox", { name: "Reduce motion", exact: true }).isChecked()).toBe(reduced === "1");
    expect(await page.locator(".flowsvg-caption").textContent()).toContain(story.directText);
    svgs.push(await page.locator(".flowsvg-canvas > svg").evaluate((element) => element.outerHTML));
  }
  await page.reload();
  expect(await page.getByRole("slider", { name: "Progress" }).inputValue()).toBe(String(story.directTime));
  return { document, svgs };
}
