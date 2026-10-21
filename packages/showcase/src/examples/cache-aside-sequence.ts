/** Visible message rows express time with existing groups and small endpoint nodes; no sequence-specific SDK API is needed. */
import type { DiagramDocument, DiagramEdge, DiagramNode, Scene } from "flowsvg";
import type { ShowcaseAuthorDefinition } from "../model.js";

const PARTICIPANTS = [
  { id: "client", label: "客户端 · 请求方", x: 24 },
  { id: "api", label: "API · 业务服务", x: 264 },
  { id: "cache", label: "缓存 · 可缺失", x: 504 },
  { id: "database", label: "数据库 · 记录来源", x: 744 }
] as const;
const MESSAGE_ROW_START = 80;
const MESSAGE_ROW_GAP = 70;
const MESSAGE_DURATION_MS = 2500;
const ENDPOINT_OFFSET = 86;
const ENDPOINT_SIZE = 8;
const MESSAGES = [
  { id: "request", from: "client", to: "api", label: "① GET O101", scene: "请求到达 API",
    caption: "时间从上往下推进。客户端请求订单 O101，API 按 cache-aside 模式读取；这是一次固定教学请求。" },
  { id: "cache-get", from: "api", to: "cache", label: "② GET order:O101", scene: "查询缓存",
    caption: "API 先向缓存发送 GET order:O101。请求消息向右，下一行将单独展示缓存返回。" },
  { id: "cache-miss", from: "cache", to: "api", label: "③ MISS", scene: "缓存返回未命中",
    caption: "缓存向 API 返回未命中 MISS。缓存没有这条值，不代表数据库不存在记录；API 需要继续查询数据库。" },
  { id: "database-get", from: "api", to: "database", label: "④ SELECT O101", scene: "查询数据库",
    caption: "API 向数据库查询订单 O101。这条消息只穿过缓存泳道，不表示请求经过缓存转发。" },
  { id: "database-result", from: "database", to: "api", label: "⑤ O101 / ¥120", scene: "数据库返回记录",
    caption: "本例假设数据库存在记录，向 API 返回订单 O101、金额人民币 ¥120。返回方向向左，与 SELECT 请求相反。" },
  { id: "cache-set", from: "api", to: "cache", label: "⑥ SET O101 / ¥120", scene: "API 回填缓存",
    caption: "API 用查到的记录回填缓存。本例假设回填成功，为简洁省略 SET 确认消息；不展开超时、一致性或并发穿透。" },
  { id: "response", from: "api", to: "client", label: "⑦ 200 / O101", scene: "返回查询结果",
    caption: "API 最后向客户端返回 O101 与金额 ¥120。七行消息组成一次缓存未命中的查询与回填，不调用真实缓存或数据库。" }
] as const;

// Each message gets its own two anchors, so request and return arrows stay on distinct time rows.
const anchors: DiagramNode[] = MESSAGES.flatMap((message, index) => [message.from, message.to].map((participant, endpoint) => ({
  id: `${message.id}-${endpoint}`, kind: "ellipse", parentId: participant,
  x: ENDPOINT_OFFSET, y: MESSAGE_ROW_START + index * MESSAGE_ROW_GAP, width: ENDPOINT_SIZE, height: ENDPOINT_SIZE
})));
const edges: DiagramEdge[] = MESSAGES.map(({ id, from, to, label }) => {
  const forward = PARTICIPANTS.findIndex((participant) => participant.id === from)
    < PARTICIPANTS.findIndex((participant) => participant.id === to);
  return { id, from: `${id}-0`, to: `${id}-1`, route: "straight", label,
    fromPort: forward ? "right" : "left", toPort: forward ? "left" : "right" };
});
const scenes: Scene[] = MESSAGES.map(({ id, scene, caption }) => ({ id, label: scene, beats: [{
  durationMs: MESSAGE_DURATION_MS, caption,
  actions: [{ type: "flow", target: id, direction: "forward" }]
}] }));

const document: DiagramDocument = {
  version: 1, title: "缓存未命中：查询与回填", viewport: { width: 948, height: 572 },
  nodes: [...PARTICIPANTS.map(({ id, label, x }): DiagramNode => ({ id, kind: "group", label,
    x, y: 24, width: 180, height: 524 })), ...anchors],
  edges,
  scenes: [...scenes, { id: "overview", label: "完整时序总览", beats: [{ durationMs: 1500,
    caption: "时序总览：请求 → 查缓存 → MISS → 查数据库 → 返回记录 → 回填缓存 → 返回客户端。参与者位置固定，纵向只表示先后，不代表实际耗时。",
    actions: [] }] }]
};

/** One cache-aside read, with all seven messages visible at stable increasing time positions. */
export const cacheAsideSequenceExample: ShowcaseAuthorDefinition = {
  id: "cache-aside-sequence", category: "sequence", name: "缓存未命中：查询与回填",
  introduction: "19 秒按从上到下的七行消息，观察客户端、API、缓存、数据库之间的查询、未命中、记录返回和回填。泳道表示参与者，纵向表示消息先后；沿用直线箭头与默认主题，仅教学演示。",
  document, defaults: { speed: 1, theme: "light", reducedMotion: false }
};
