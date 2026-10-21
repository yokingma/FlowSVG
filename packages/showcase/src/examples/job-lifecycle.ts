/** Task-state teaching story. Edge highlights express events without the flow marker's two-participant highlights. */
import type { Action, DiagramDocument } from "flowsvg";
import type { ShowcaseAuthorDefinition } from "../model.js";
import { createExampleContent } from "./example-content.js";

const STATES = [
  { id: "queued", title: "待执行", detail: "等待调度 · 可取消", x: 24, y: 60 },
  { id: "running", title: "执行中", detail: "执行任务 · 等待结果", x: 324, y: 60 },
  { id: "retry", title: "等待重试", detail: "暂时错误 · 定时重试", x: 624, y: 60 },
  { id: "completed", title: "已完成", detail: "终态 · 不再迁移", x: 324, y: 254 },
  { id: "failed", title: "已失败", detail: "终态 · 不再迁移", x: 624, y: 254 },
  { id: "cancelled", title: "已取消", detail: "终态 · 不再迁移", x: 24, y: 254 }
] as const;
const EVENTS = ["schedule", "temporary-error", "retry-timer", "success", "exhausted", "cancel"];

// Replace every status tag so seeking or switching to an alternative task always leaves exactly one current state.
function enterState(target: string, task: string, retries: string, event?: string): Action[] {
  return [
    ...STATES.flatMap(({ id, title, detail }): Action[] => [
      { type: id === target ? "highlight" : "unhighlight", target: id },
      { type: "updateNode", target: id, value: { content: createExampleContent(title,
        id === target ? `当前 · 任务 ${task}` : "可达状态", id === target ? retries : "事件触发迁移", detail) } }
    ]),
    ...EVENTS.map((id): Action => ({ type: id === event ? "highlight" : "unhighlight", target: id }))
  ];
}

const document: DiagramDocument = {
  version: 1, title: "后台任务生命周期", viewport: { width: 868, height: 422 },
  nodes: STATES.map(({ id, title, detail, x, y }) => ({ id, kind: "roundedRect", x, y, width: 220, height: 144,
    content: createExampleContent(title, "可达状态", "事件触发迁移", detail) })),
  edges: [
    { id: "schedule", from: "queued", to: "running", route: "orthogonal", fromPort: "right", toPort: "left", label: "调度" },
    { id: "temporary-error", from: "running", to: "retry", route: "orthogonal", fromPort: "right", toPort: "left", label: "暂时错误" },
    // Route retry above the state row so opposing event labels cannot overlap in a short gap.
    { id: "retry-timer", from: "retry", to: "running", route: "orthogonal", fromPort: "top", toPort: "top", label: "定时重试" },
    { id: "success", from: "running", to: "completed", route: "orthogonal", fromPort: "bottom", toPort: "top", label: "成功" },
    { id: "exhausted", from: "running", to: "failed", route: "orthogonal", fromPort: "bottom", toPort: "top", label: "达到上限" },
    { id: "cancel", from: "queued", to: "cancelled", route: "orthogonal", fromPort: "bottom", toPort: "top", label: "取消" }
  ],
  scenes: [
    { id: "submit", label: "提交任务 A", beats: [{ durationMs: 2000, transitionMs: 0,
      caption: "任务 A 已提交，当前为待执行。蓝色节点与“当前”标签共同标记唯一状态；箭头文字表示迁移事件。",
      actions: enterState("queued", "A", "重试 0 / 2") }] },
    { id: "execute", label: "执行与暂时错误", beats: [
      { durationMs: 2000, transitionMs: 0, caption: "任务 A 被调度，进入执行中。示例允许最多重试 2 次，这不是推荐配置。",
        actions: enterState("running", "A", "重试 0 / 2", "schedule") },
      { durationMs: 2000, transitionMs: 0, caption: "任务 A 遇到暂时错误，进入等待重试；任务没有同时处于执行中。",
        actions: enterState("retry", "A", "重试 0 / 2", "temporary-error") }
    ] },
    { id: "recover", label: "重试后完成", beats: [
      { durationMs: 2000, transitionMs: 0, caption: "任务 A 的重试定时器触发，开始第 1 次重试，重新进入执行中。",
        actions: enterState("running", "A", "重试 1 / 2", "retry-timer") },
      { durationMs: 2000, transitionMs: 0, caption: "任务 A 执行成功，进入已完成终态。终态没有出边，不会继续变成失败或取消。",
        actions: enterState("completed", "A", "重试 1 / 2", "success") }
    ] },
    { id: "exhaust", label: "另一任务 B 达到上限", beats: [
      { durationMs: 2000, transitionMs: 0, caption: "切换到另一项任务 B：它已经进入第 2 次重试的执行阶段。这是独立案例，不是任务 A 的后续。",
        actions: enterState("running", "B", "重试 2 / 2") },
      { durationMs: 2000, transitionMs: 0, caption: "任务 B 再次失败且达到示例重试上限，进入已失败终态。",
        actions: enterState("failed", "B", "重试 2 / 2", "exhausted") }
    ] },
    { id: "cancel", label: "另一任务 C 主动取消", beats: [
      { durationMs: 2000, transitionMs: 0, caption: "切换到另一项任务 C：当前待执行，用户仍可取消。此例没有演示运行中取消。",
        actions: enterState("queued", "C", "重试 0 / 2") },
      { durationMs: 2000, transitionMs: 0, caption: "用户取消任务 C，进入已取消终态。本图演示允许的状态迁移，不调用真实任务系统。",
        actions: enterState("cancelled", "C", "重试 0 / 2", "cancel") }
    ] }
  ]
};

/** A fixed-state graph with three explicitly separated task outcomes. */
export const jobLifecycleExample: ShowcaseAuthorDefinition = {
  id: "job-lifecycle", category: "state", name: "后台任务生命周期",
  introduction: "18 秒观察后台任务的事件与状态迁移：任务 A 重试后完成，独立任务 B 达到重试上限，任务 C 在待执行时取消。当前状态始终唯一；重试次数是教学设定，不执行真实任务。",
  document, defaults: { speed: 1, theme: "light", reducedMotion: false }
};
