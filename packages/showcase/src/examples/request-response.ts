/** Formal order request story. Fixed geometry and default SDK paint keep simultaneous transfers readable. */
import type { DiagramDocument } from "flowsvg";
import type { ShowcaseAuthorDefinition } from "../model.js";

const document: DiagramDocument = {
  version: 1,
  title: "请求与响应",
  viewport: { width: 800, height: 404 },
  nodes: [
    { id: "client", kind: "roundedRect", x: 24, y: 170, width: 140, height: 64, label: "客户端" },
    { id: "gateway", kind: "roundedRect", x: 214, y: 170, width: 150, height: 64, label: "API 网关" },
    { id: "auth", kind: "ellipse", x: 414, y: 24, width: 150, height: 64, label: "身份认证" },
    { id: "inventory", kind: "cylinder", x: 414, y: 316, width: 150, height: 64, label: "库存服务" },
    { id: "service", kind: "roundedRect", x: 614, y: 170, width: 160, height: 64, label: "订单服务" }
  ],
  edges: [
    // Facing sides keep the short request curve outside the gateway after compaction.
    { id: "client-gateway", from: "client", to: "gateway", route: "curved", fromPort: "right", toPort: "left" },
    { id: "gateway-auth", from: "gateway", to: "auth", route: "curved", fromPort: "top", toPort: "left" },
    { id: "inventory-gateway", from: "inventory", to: "gateway", route: "curved", fromPort: "left", toPort: "bottom" },
    // Facing ports let the SDK keep request and response curves in separate lanes.
    { id: "gateway-service", from: "gateway", to: "service", route: "curved", fromPort: "right", toPort: "left" },
    { id: "service-inventory", from: "service", to: "inventory", route: "curved", fromPort: "bottom", toPort: "right", label: "库存确认" },
    { id: "service-gateway", from: "service", to: "gateway", route: "curved", fromPort: "left", toPort: "right" }
  ],
  scenes: [
    {
      id: "request", label: "请求与预检", beats: [{
        durationMs: 3000,
        caption: "请求进入网关，同时进行身份认证和库存预检；三条路径同步完成。",
        actions: [
          { type: "flow", target: "client-gateway", direction: "forward" },
          { type: "flow", target: "gateway-auth", direction: "forward", text: "Token" },
          { type: "flow", target: "inventory-gateway", direction: "reverse", text: "预检" }
        ]
      }]
    },
    {
      id: "processing", label: "创建订单", beats: [{
        durationMs: 3000,
        caption: "预检通过：网关提交请求，库存服务向订单服务确认可用库存。",
        actions: [
          { type: "flow", target: "gateway-service", direction: "forward", text: "创建订单" },
          { type: "flow", target: "service-inventory", direction: "reverse" }
        ]
      }]
    },
    {
      id: "response", label: "返回结果", beats: [{
        durationMs: 3000,
        caption: "订单服务返回成功响应，网关向客户端传回订单号。",
        actions: [
          { type: "flow", target: "service-gateway", direction: "forward", text: "201 Created" },
          { type: "flow", target: "client-gateway", direction: "reverse", text: "订单号" }
        ]
      }]
    },
    {
      id: "complete", label: "请求完成", beats: [{
        durationMs: 1000,
        caption: "请求完成。可暂停阅读消息、跳转节拍、调整倍速或悬停查看节点。",
        actions: []
      }]
    }
  ]
};

/** A complete author definition consumed by every showcase host, independent of archived material. */
export const requestResponseExample: ShowcaseAuthorDefinition = {
  id: "request-response",
  category: "workflow",
  name: "请求与响应",
  introduction: "客户端发起请求，网关并行检查身份与库存；订单服务创建订单后逐级返回结果。播放 10 秒流程，观察并行传递、反向响应和参与节点高亮。",
  document,
  defaults: { speed: 1, theme: "light", reducedMotion: false }
};
