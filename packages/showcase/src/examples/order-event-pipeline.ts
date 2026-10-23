/** Fixed event samples make deduplication, invalid-record isolation and aggregate counts independently readable. */
import type { DiagramDocument } from "flowsvg";
import type { ShowcaseAuthorDefinition } from "../model.js";
import { createExampleContent, measureExampleNode } from "./example-content.js";

// Reuse these explicit replacements for measurement and scene updates.
const UPDATED_CONTENT = {
  validation: createExampleContent("校验与去重", "4 = 2 + 1 + 1",
    "2 有效 · 1 重复 · 1 无效", "E1 重复丢弃 · E3 字段缺失"),
  details: createExampleContent("订单明细", "2 条有效记录", "O101 ¥120 · O102 ¥80", "来源：E1 与 E2 · 不含重复"),
  quarantine: createExampleContent("隔离记录", "1 条无效记录", "E3 缺少金额", "保留原因 · 不参与指标计算"),
  aggregate: createExampleContent("窗口聚合", "演示窗口 1 分钟", "2 笔 · ¥200", "E1 + E2 · 120 + 80"),
  dashboard: createExampleContent("指标看板", "有效订单指标", "2 笔 · ¥200", "人民币元 · 教学窗口结果")
};

const document: DiagramDocument = {
  version: 1, title: "订单事件：从采集到指标", viewport: { width: 964, height: 580 },
  nodes: [
    measureExampleNode({ id: "events", kind: "roundedRect", x: 24, y: 24, width: 240, height: 144,
      content: createExampleContent("订单事件源", "4 条原始事件", "E1 / E2 / E1 / E3", "含重复投递与缺失字段") }),
    measureExampleNode({ id: "queue", kind: "roundedRect", x: 314, y: 24, width: 240, height: 144,
      content: createExampleContent("事件队列", "缓冲与解耦", "保留 eventId 与订单数据", "教学样本 · 不连接消息服务") }),
    measureExampleNode({ id: "validation", kind: "roundedRect", x: 604, y: 24, width: 300, height: 144,
      content: createExampleContent("校验与去重", "按 eventId 去重", "检查订单号与金额", "重复事件不写入订单明细") }, UPDATED_CONTENT.validation),
    measureExampleNode({ id: "details", kind: "roundedRect", x: 604, y: 218, width: 300, height: 144,
      content: createExampleContent("订单明细", "有效记录", "等待校验后的订单", "仅接收有效且不重复的数据") }, UPDATED_CONTENT.details),
    measureExampleNode({ id: "aggregate", kind: "roundedRect", x: 314, y: 218, width: 240, height: 144,
      content: createExampleContent("窗口聚合", "演示窗口 1 分钟", "计算笔数与金额合计", "金额单位：人民币元") }, UPDATED_CONTENT.aggregate),
    measureExampleNode({ id: "dashboard", kind: "roundedRect", x: 24, y: 218, width: 240, height: 144,
      content: createExampleContent("指标看板", "窗口结果", "等待聚合指标", "仅展示教学数据") }, UPDATED_CONTENT.dashboard),
    measureExampleNode({ id: "quarantine", kind: "roundedRect", x: 604, y: 412, width: 300, height: 144,
      content: createExampleContent("隔离记录", "无效记录", "等待校验异常", "与有效明细分开保存") }, UPDATED_CONTENT.quarantine)
  ],
  edges: [
    { id: "collect", from: "events", to: "queue", route: "orthogonal", fromPort: "right", toPort: "left" },
    { id: "consume", from: "queue", to: "validation", route: "orthogonal", fromPort: "right", toPort: "left" },
    { id: "valid-orders", from: "validation", to: "details", route: "orthogonal", fromPort: "bottom", toPort: "top" },
    // The outer lane carries invalid records past the valid-detail card without entering it.
    { id: "invalid-record", from: "validation", to: "quarantine", route: "orthogonal", fromPort: "right", toPort: "right" },
    { id: "aggregate-orders", from: "details", to: "aggregate", route: "orthogonal", fromPort: "left", toPort: "right" },
    { id: "publish-metrics", from: "aggregate", to: "dashboard", route: "orthogonal", fromPort: "left", toPort: "right" }
  ],
  scenes: [
    { id: "collect", label: "采集四条事件", beats: [{ durationMs: 3000,
      caption: "固定样本 E1/E2/E1/E3 共 4 条：E1 为订单 O101、金额 ¥120；E2 为 O102、¥80；再次投递的 E1 是重复，E3 缺少金额。",
      actions: [{ type: "flow", target: "collect", direction: "forward", text: "4 条事件" }] }] },
    { id: "consume", label: "队列缓冲与消费", beats: [{ durationMs: 3000,
      caption: "事件队列缓冲后交给处理节点，保留 eventId、订单号和金额；队列本身不完成业务校验或按 eventId 去重。",
      actions: [{ type: "flow", target: "consume", direction: "forward", text: "E1 E2 E1 E3" }] }] },
    { id: "validate", label: "校验与去重", beats: [{ durationMs: 3000,
      caption: "按 eventId 去重并检查字段：2 条有效、1 条重复、1 条无效，合计仍是 4 条输入。重复 E1 不再写入，不进入无效隔离记录。",
      actions: [{ type: "updateNode", target: "validation", value: { content: UPDATED_CONTENT.validation } }, { type: "highlight", target: "validation" }] }] },
    { id: "split", label: "有效与异常分流", beats: [{ durationMs: 3000,
      caption: "两条有效记录进入订单明细：O101 ¥120、O102 ¥80。E3 因缺少金额进入隔离记录；无效和重复事件都不进入聚合。",
      actions: [
        { type: "unhighlight", target: "validation" },
        { type: "flow", target: "valid-orders", direction: "forward", text: "E1 + E2" },
        { type: "flow", target: "invalid-record", direction: "forward", text: "E3" },
        { type: "updateNode", target: "details", value: { content: UPDATED_CONTENT.details } },
        { type: "updateNode", target: "quarantine", value: { content: UPDATED_CONTENT.quarantine } }
      ] }] },
    { id: "aggregate", label: "按窗口聚合", beats: [{ durationMs: 3000,
      caption: "在演示的同一个 1 分钟窗口内，聚合两条有效明细：订单数 2，金额 120 + 80 = 200 元。时间窗是教学设定。",
      actions: [{ type: "flow", target: "aggregate-orders", direction: "forward", text: "2 条明细" },
        { type: "updateNode", target: "aggregate", value: { content: UPDATED_CONTENT.aggregate } }] }] },
    { id: "publish", label: "发布窗口指标", beats: [{ durationMs: 3000,
      caption: "看板接收窗口汇总，不再接收原始四条事件。人民币金额合计 ¥200，订单数 2；重复与无效输入没有被重复计数。",
      actions: [{ type: "flow", target: "publish-metrics", direction: "forward", text: "2 笔 / ¥200" },
        { type: "updateNode", target: "dashboard", value: { content: UPDATED_CONTENT.dashboard } }] }] },
    { id: "overview", label: "数据形态与去向", beats: [{ durationMs: 3000,
      caption: "数据流总览：4 条原始事件 → 2 条有效明细 → 2 笔、人民币 ¥200；另有 1 条重复被去重、1 条无效记录被隔离。全程不访问真实数据服务。",
      actions: [] }] }
  ]
};

/** One conserved teaching dataset, including its valid, duplicate and invalid paths. */
export const orderEventPipelineExample: ShowcaseAuthorDefinition = {
  id: "order-event-pipeline", category: "data-flow", name: "订单事件：从采集到指标",
  introduction: "跟随 4 条虚构订单事件经过队列、校验去重、有效／异常分流和窗口聚合。两条有效订单合计人民币 ¥200；事件 ID、计数和金额贯穿各阶段，不连接真实消息或数据服务。",
  document, defaults: { speed: 1, theme: "light", reducedMotion: false }
};
