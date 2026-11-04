/** Task-state teaching story. Event markers move without overriding the single explicit current state. */
import { measureNodeContent, type Action, type DiagramDocument } from "flowsvg";
import type { ShowcaseAuthorDefinition } from "../model.js";
import { createExampleContent } from "./example-content.js";

const CARD_WIDTH = 220;
const TOP_ROW_Y = 60;
const ROW_GAP = 50;
const BOTTOM_MARGIN = 24;
const STATES = [
  { id: "queued", title: "待执行", detail: "等待调度 · 可取消", x: 24, row: 0 },
  { id: "running", title: "执行中", detail: "执行任务 · 等待结果", x: 324, row: 0 },
  { id: "retry", title: "等待重试", detail: "暂时错误 · 定时重试", x: 624, row: 0 },
  { id: "completed", title: "已完成", detail: "终态 · 不再迁移", x: 324, row: 1 },
  { id: "failed", title: "已失败", detail: "终态 · 不再迁移", x: 624, row: 1 },
  { id: "cancelled", title: "已取消", detail: "终态 · 不再迁移", x: 24, row: 1 }
] as const;
const EVENTS = ["schedule", "temporary-error", "retry-timer", "success", "exhausted", "cancel"];

// Author the versions before the document: measurement does not inspect scenes or playback state.
const CONTENT_STAGES = [
  { target: "queued", task: "A", retries: "重试 0 / 2" },
  { target: "running", task: "A", retries: "重试 0 / 2", event: "schedule" },
  { target: "retry", task: "A", retries: "重试 0 / 2", event: "temporary-error" },
  { target: "running", task: "A", retries: "重试 1 / 2", event: "retry-timer" },
  { target: "completed", task: "A", retries: "重试 1 / 2", event: "success" },
  { target: "running", task: "B", retries: "重试 2 / 2" },
  { target: "failed", task: "B", retries: "重试 2 / 2", event: "exhausted" },
  { target: "queued", task: "C", retries: "重试 0 / 2" },
  { target: "cancelled", task: "C", retries: "重试 0 / 2", event: "cancel" }
];
const STATE_CONTENT = STATES.map((state) => ({
  ...state,
  initial: createExampleContent(state.title, "可达状态", "事件触发迁移", state.detail),
  versions: CONTENT_STAGES.map(({ target, task, retries }) => createExampleContent(state.title,
    state.id === target ? `当前 · 任务 ${task}` : "可达状态",
    state.id === target ? retries : "事件触发迁移", state.detail))
}));
const measurement = measureNodeContent({ kind: "roundedRect", width: CARD_WIDTH,
  content: STATE_CONTENT.flatMap(({ initial, versions }) => [initial, ...versions]) });
if (measurement.diagnostics.length > 0) {
  throw new Error(`job-lifecycle content does not fit its authored width: ${JSON.stringify(measurement.diagnostics)}`);
}
const CARD_HEIGHT = measurement.height;
const BOTTOM_ROW_Y = TOP_ROW_Y + CARD_HEIGHT + ROW_GAP;

// Reuse the measured versions so every seek or alternative task leaves exactly one current state.
function enterState(stageIndex: number): Action[] {
  const stage = CONTENT_STAGES[stageIndex]!;
  return [
    ...STATE_CONTENT.flatMap(({ id, versions }): Action[] => [
      { type: id === stage.target ? "highlight" : "unhighlight", target: id },
      { type: "updateNode", target: id, value: { content: versions[stageIndex]! } }
    ]),
    ...EVENTS.map((id): Action => ({ type: id === stage.event ? "highlight" : "unhighlight", target: id })),
    ...(stage.event ? [{ type: "flow", target: stage.event, direction: "forward", highlightParticipants: false } satisfies Action] : [])
  ];
}

const document: DiagramDocument = {
  version: 1, title: "后台任务生命周期", viewport: { width: 868, height: BOTTOM_ROW_Y + CARD_HEIGHT + BOTTOM_MARGIN },
  nodes: STATE_CONTENT.map(({ id, x, row, initial }) => ({ id, kind: "roundedRect", x,
    y: row === 0 ? TOP_ROW_Y : BOTTOM_ROW_Y, width: CARD_WIDTH, height: CARD_HEIGHT, content: initial })),
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
      actions: enterState(0) }] },
    { id: "execute", label: "执行与暂时错误", beats: [
      { durationMs: 2000, transitionMs: 0, caption: "任务 A 被调度，进入执行中。示例允许最多重试 2 次，这不是推荐配置。",
        actions: enterState(1) },
      { durationMs: 2000, transitionMs: 0, caption: "任务 A 遇到暂时错误，进入等待重试；任务没有同时处于执行中。",
        actions: enterState(2) }
    ] },
    { id: "recover", label: "重试后完成", beats: [
      { durationMs: 2000, transitionMs: 0, caption: "任务 A 的重试定时器触发，开始第 1 次重试，重新进入执行中。",
        actions: enterState(3) },
      { durationMs: 2000, transitionMs: 0, caption: "任务 A 执行成功，进入已完成终态。终态没有出边，不会继续变成失败或取消。",
        actions: enterState(4) }
    ] },
    { id: "exhaust", label: "另一任务 B 达到上限", beats: [
      { durationMs: 2000, transitionMs: 0, caption: "切换到另一项任务 B：它已经进入第 2 次重试的执行阶段。这是独立案例，不是任务 A 的后续。",
        actions: enterState(5) },
      { durationMs: 2000, transitionMs: 0, caption: "任务 B 再次失败且达到示例重试上限，进入已失败终态。",
        actions: enterState(6) }
    ] },
    { id: "cancel", label: "另一任务 C 主动取消", beats: [
      { durationMs: 2000, transitionMs: 0, caption: "切换到另一项任务 C：当前待执行，用户仍可取消。此例没有演示运行中取消。",
        actions: enterState(7) },
      { durationMs: 2000, transitionMs: 0, caption: "用户取消任务 C，进入已取消终态。本图演示允许的状态迁移，不调用真实任务系统。",
        actions: enterState(8) }
    ] }
  ]
};

/** A fixed-state graph with three explicitly separated task outcomes. */
export const jobLifecycleExample: ShowcaseAuthorDefinition = {
  id: "job-lifecycle", category: "state", name: "后台任务生命周期",
  introduction: "观察后台任务的事件与状态迁移：任务 A 重试后完成，独立任务 B 达到重试上限，任务 C 在待执行时取消。当前状态始终唯一；重试次数是教学设定，不执行真实任务。",
  document, defaults: { speed: 1, theme: "dark", reducedMotion: false }
};
