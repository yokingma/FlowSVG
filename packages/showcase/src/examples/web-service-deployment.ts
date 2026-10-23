/** Deployment locations and instance roles. Replication and health checks are separate from the request path. */
import type { DiagramDocument } from "flowsvg";
import type { ShowcaseAuthorDefinition } from "../model.js";
import { createExampleContent, measureExampleNode } from "./example-content.js";

// Reuse these explicit replacements for measurement and scene updates.
const UPDATED_CONTENT = {
  "app-a": createExampleContent("应用副本 A", "不健康", "停止接收后续请求", "固定教学状态 · 非真实监测")
};

const document: DiagramDocument = {
  version: 1, title: "Web 服务：双副本部署", viewport: { width: 922, height: 756 },
  nodes: [
    { id: "public-network", kind: "group", x: 64, y: 24, width: 834, height: 200, label: "公网入口 · HTTPS" },
    measureExampleNode({ id: "browser", kind: "roundedRect", parentId: "public-network", x: 556, y: 44, width: 220, height: 144,
      content: createExampleContent("浏览器", "客户端", "发起订单查询", "GET /orders/O101") }),
    measureExampleNode({ id: "entry", kind: "roundedRect", parentId: "public-network", x: 286, y: 44, width: 220, height: 144,
      content: createExampleContent("公网入口", "HTTPS 接入", "对外暴露统一地址", "入口层 · 非应用实例") }),
    measureExampleNode({ id: "load-balancer", kind: "roundedRect", parentId: "public-network", x: 16, y: 44, width: 220, height: 144,
      content: createExampleContent("负载均衡", "选择健康实例", "转发到应用副本", "持续进行健康检查") }),
    { id: "private-network", kind: "group", x: 64, y: 274, width: 834, height: 458, label: "私网 · 应用与数据服务" },
    { id: "applications", kind: "group", parentId: "private-network", x: 16, y: 44, width: 250, height: 398, label: "应用层 · 双副本" },
    measureExampleNode({ id: "app-a", kind: "roundedRect", parentId: "applications", x: 16, y: 44, width: 218, height: 144,
      content: createExampleContent("应用副本 A", "健康", "处理订单查询", "实例 A · 非独立业务服务") }, UPDATED_CONTENT["app-a"]),
    measureExampleNode({ id: "app-b", kind: "roundedRect", parentId: "applications", x: 16, y: 238, width: 218, height: 144,
      content: createExampleContent("应用副本 B", "健康", "同一应用的另一副本", "实例 B · 不代表跨可用区") }),
    { id: "data", kind: "group", parentId: "private-network", x: 316, y: 44, width: 502, height: 398, label: "数据层 · 缓存与数据库" },
    measureExampleNode({ id: "cache", kind: "roundedRect", parentId: "data", x: 16, y: 238, width: 200, height: 144,
      content: createExampleContent("缓存", "可缺失", "缓存订单查询结果", "演示本次未命中") }),
    measureExampleNode({ id: "primary", kind: "roundedRect", parentId: "data", x: 266, y: 44, width: 220, height: 144,
      content: createExampleContent("数据库主实例", "允许读写", "保存订单记录", "本次查询读取 O101") }),
    measureExampleNode({ id: "replica", kind: "roundedRect", parentId: "data", x: 266, y: 238, width: 220, height: 144,
      content: createExampleContent("数据库只读副本", "只读", "接收主实例复制", "不接受应用写入") })
  ],
  edges: [
    { id: "https", from: "browser", to: "entry", route: "orthogonal", fromPort: "left", toPort: "right" },
    { id: "entry-route", from: "entry", to: "load-balancer", route: "orthogonal", fromPort: "left", toPort: "right" },
    { id: "route-a", from: "load-balancer", to: "app-a", route: "orthogonal", fromPort: "left", toPort: "left" },
    // The left margin reserves separate health and failover paths outside both instance cards.
    { id: "route-b", from: "load-balancer", to: "app-b", route: "orthogonal", fromPort: "left", toPort: "left" },
    { id: "health-a", from: "load-balancer", to: "app-a", route: "orthogonal", fromPort: "left", toPort: "left", label: "健康检查" },
    // Cache occupies the lower data row; the database path stays above it and below group titles.
    { id: "cache-read", from: "app-a", to: "cache", route: "orthogonal", fromPort: "right", toPort: "top" },
    { id: "database-read", from: "app-a", to: "primary", route: "orthogonal", fromPort: "right", toPort: "left" },
    { id: "replication", from: "primary", to: "replica", route: "orthogonal", fromPort: "bottom", toPort: "top", label: "复制" }
  ],
  scenes: [
    { id: "entry", label: "公网请求接入", beats: [
      { durationMs: 2000, caption: "浏览器通过 HTTPS 查询订单 O101，先进入对外统一入口。分组表示运行位置与网络边界，不是任务步骤。",
        actions: [{ type: "flow", target: "https", direction: "forward", text: "HTTPS" }] },
      { durationMs: 2000, caption: "公网入口将请求交给负载均衡。两个应用副本运行同一应用，不表示两个不同的业务服务，也不宣称跨可用区。",
        actions: [{ type: "flow", target: "entry-route", direction: "forward", text: "请求" }] }
    ] },
    { id: "application", label: "请求进入副本 A", beats: [{ durationMs: 2000,
      caption: "负载均衡为本次请求选择健康的应用副本 A。私网内部包含应用层与数据层，浏览器不直接访问数据库。",
      actions: [{ type: "flow", target: "route-a", direction: "forward", text: "副本 A" }] }] },
    { id: "query", label: "缓存与数据库查询", beats: [
      { durationMs: 2000, caption: "应用副本 A 先查询缓存；本教学样本设定缓存未命中，随后由应用读取数据库主实例。",
        actions: [{ type: "flow", target: "cache-read", direction: "forward", text: "查缓存" }] },
      { durationMs: 2000, caption: "应用副本 A 向数据库主实例查询 O101；本次读取不经过只读副本，也不在只读副本执行写入。",
        actions: [{ type: "flow", target: "database-read", direction: "forward", text: "读 O101" }] },
      { durationMs: 2000, caption: "数据库主实例返回 O101。箭头区分查询与返回方向；图中关系表示服务可达性，不代表实际延迟。",
        actions: [{ type: "flow", target: "database-read", direction: "reverse", text: "订单记录" }] }
    ] },
    { id: "response", label: "沿入口返回结果", beats: [{ durationMs: 2000,
      caption: "副本 A 完成查询，响应沿负载均衡与公网入口回到浏览器；同时展示三段返回关系，仅用于说明路径。",
      actions: ["route-a", "entry-route", "https"].map((target) => ({ type: "flow", target, direction: "reverse", text: "响应" })) }] },
    { id: "replication", label: "独立的数据库复制", beats: [{ durationMs: 2000,
      caption: "独立背景关系：主实例将已有写入复制给只读副本。这不是刚才的读请求触发的写入，也不表示同步确认或自动数据库切换。",
      actions: [{ type: "flow", target: "replication", direction: "forward", text: "已有写入" }] }] },
    { id: "health", label: "健康状态变化", beats: [{ durationMs: 2000,
      caption: "演示健康检查发现副本 A 不健康。状态由固定教学动作设置，不执行真实监测；已完成的查询不受这一后续事件影响。",
      actions: [{ type: "flow", target: "health-a", direction: "forward", text: "检查失败" },
        { type: "updateNode", target: "app-a", value: { content: UPDATED_CONTENT["app-a"] } }] }] },
    { id: "reroute", label: "后续请求选择副本 B", beats: [{ durationMs: 2000,
      caption: "后续请求分发给健康的副本 B，不再选择不健康的 A。本例只说明应用流量分发，不演示数据库故障切换、自动扩缩容或跨区容灾。",
      actions: [{ type: "flow", target: "route-b", direction: "forward", text: "副本 B" }] }] }
  ]
};

/** A topology with real group boundaries and explicit limits on the availability story. */
export const webServiceDeploymentExample: ShowcaseAuthorDefinition = {
  id: "web-service-deployment", category: "deployment", name: "Web 服务：双副本部署",
  introduction: "查看公网入口、私网应用双副本与数据层：查询经过负载均衡、缓存和主实例，复制与健康检查分别说明。副本 A 不健康后，后续请求选择 B；仅教学演示，不连接基础设施。",
  document, defaults: { speed: 1, theme: "light", reducedMotion: false }
};
