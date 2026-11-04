/** Project architecture story. Arrows describe data/calls, while captions distinguish runtime and build-time paths. */
import type { DiagramDocument } from "flowsvg";
import type { ShowcaseAuthorDefinition } from "../model.js";
import { createExampleContent, measureExampleNode } from "./example-content.js";

const document: DiagramDocument = {
  version: 1,
  title: "FlowSVG：图解如何运行",
  // Retain authored minimum heights; 50-unit row gaps leave room for calls and transfer capsules.
  viewport: { width: 980, height: 604 },
  nodes: [
    measureExampleNode({ id: "document", kind: "roundedRect", x: 24, y: 24, width: 290, height: 144,
      content: createExampleContent("图解文档", "可序列化", "节点 · 连线 · 场景 · 节拍", "同一 DiagramDocument 供播放和导出") }),
    measureExampleNode({ id: "core", kind: "roundedRect", x: 364, y: 24, width: 270, height: 144,
      content: createExampleContent("平台无关核心", "纯 TypeScript", "校验 · 时间求值 · 几何 · SVG", "无 DOM、网络或浏览器时钟") }),
    measureExampleNode({ id: "svg", kind: "roundedRect", x: 684, y: 24, width: 270, height: 144,
      content: createExampleContent("静态 SVG", "任意时刻", "renderSvg(t)", "核心输出；无需 DOM") }),
    measureExampleNode({ id: "adapters", kind: "roundedRect", x: 24, y: 218, width: 290, height: 144,
      content: createExampleContent("接入适配器", "可选接入", "React · Vue · Web Component", "复用浏览器播放器；管理组件生命周期") }),
    measureExampleNode({ id: "browser", kind: "roundedRect", x: 364, y: 218, width: 270, height: 144,
      content: createExampleContent("浏览器播放器", "DOM + 时钟", "播放 · 控件 · 交互", "创建、更新、销毁挂载资源") }),
    measureExampleNode({ id: "gif", kind: "roundedRect", x: 684, y: 218, width: 270, height: 144,
      content: createExampleContent("GIF 导出", "按需 · Worker", "SVG → 栅格化 → 编码", "在浏览器执行，不录制实时播放") }),
    measureExampleNode({ id: "showcase", kind: "roundedRect", x: 24, y: 436, width: 290, height: 144,
      content: createExampleContent("展示工程", "私有消费方", "作者与会话 · 三端页面", "@flowsvg/showcase；不被 SDK 依赖") }),
    measureExampleNode({ id: "node-tools", kind: "roundedRect", x: 644, y: 412, width: 310, height: 168,
      content: { style: { padding: 12, blockGap: 6 }, blocks: [
        { type: "title", text: "Node 工具" },
        { type: "list", items: [{ tags: [{ text: "Node 20+", style: { shape: "pill", fontSize: 12 } }] }] },
        { type: "paragraph", text: "HTML：内嵌文档、播放器和样式" },
        { type: "paragraph", text: "GIF：Chromium 调用浏览器导出器" },
        { type: "paragraph", role: "auxiliary", text: "仅 GIF 需要 Chromium" }
      ] } })
  ],
  edges: [
    { id: "document-core", from: "document", to: "core", route: "orthogonal", fromPort: "right", toPort: "left" },
    { id: "core-svg", from: "core", to: "svg", route: "orthogonal", fromPort: "right", toPort: "left" },
    // Keep reciprocal calls so each beat can show frame results or time requests in its actual direction.
    { id: "core-browser", from: "core", to: "browser", route: "orthogonal", fromPort: "bottom", toPort: "top" },
    { id: "browser-core", from: "browser", to: "core", route: "orthogonal", fromPort: "top", toPort: "bottom" },
    { id: "adapters-browser", from: "adapters", to: "browser", route: "orthogonal", fromPort: "right", toPort: "left" },
    { id: "svg-gif", from: "svg", to: "gif", route: "orthogonal", fromPort: "bottom", toPort: "top" },
    // HTML embeds built player assets; this arrow does not mean a running browser is needed to assemble HTML.
    { id: "browser-node", from: "browser", to: "node-tools", route: "orthogonal", fromPort: "bottom", toPort: "left" },
    { id: "node-gif", from: "node-tools", to: "gif", route: "orthogonal", fromPort: "top", toPort: "bottom" },
    { id: "showcase-adapters", from: "showcase", to: "adapters", route: "orthogonal", fromPort: "top", toPort: "bottom" },
    { id: "showcase-browser", from: "showcase", to: "browser", route: "orthogonal", fromPort: "right", toPort: "bottom" }
  ],
  scenes: [
    { id: "define", label: "定义图解", beats: [{ durationMs: 3000,
      caption: "作者用同一份可序列化 DiagramDocument 描述节点、连线、场景和节拍。连线表示数据传递或调用，不是完整的 npm 依赖树。",
      actions: [{ type: "flow", target: "document-core", direction: "forward", text: "图解文档" }]
    }] },
    { id: "evaluate", label: "核心求值", beats: [{ durationMs: 3000,
      caption: "核心校验文档，按指定时刻计算时间线和几何，并输出 SVG。核心不读取 DOM、网络或浏览器时钟。",
      actions: [{ type: "flow", target: "core-svg", direction: "forward", text: "SVG(t)" }]
    }] },
    { id: "integrate", label: "接入播放器", beats: [
      { durationMs: 2000, caption: "React、Vue 和 Web Component 适配器复用浏览器播放器，管理各自的挂载与销毁；原生网页可直接创建播放器。",
        actions: [{ type: "flow", target: "adapters-browser", direction: "forward", text: "挂载" }] },
      { durationMs: 2000, caption: "浏览器播放器接收核心画面状态并更新 SVG DOM；各接入方式共享时间线与绘图逻辑。",
        actions: [{ type: "flow", target: "core-browser", direction: "forward", text: "画面状态" }] }
    ] },
    { id: "operate", label: "播放与控件", beats: [
      { durationMs: 2000, caption: "播放器拥有浏览器时钟、播放控件和交互。播放、跳转或更换视觉设置时，播放器把时刻和设置交给核心；普通播放不加载 GIF 编码器。",
        actions: [{ type: "flow", target: "browser-core", direction: "forward", text: "t + 设置" }] },
      { durationMs: 2000, caption: "核心按指定时刻重新求值，播放器显示新画面；控件不维护另一套图解时间线。",
        actions: [{ type: "flow", target: "core-browser", direction: "forward", text: "更新画面" }] }
    ] },
    { id: "export", label: "导出与离线", beats: [
      { durationMs: 2000, caption: "静态 SVG 可直接由核心导出。GIF 则按时间采样 SVG，在浏览器栅格化并交给 Worker 编码，不录制网页的实时播放状态。",
        actions: [{ type: "flow", target: "svg-gif", direction: "forward", text: "逐帧 SVG" }] },
      { durationMs: 2000, caption: "Node 将图解文档、构建好的播放器和样式内嵌为单文件离线 HTML；生成 HTML 不启动 Chromium。离线 HTML 可按需内嵌 GIF 导出资产。",
        actions: [{ type: "flow", target: "browser-node", direction: "forward", text: "播放器资产" }] },
      { durationMs: 2000, caption: "Node 导出 GIF 时，通过预装 Chromium 的隔离页面调用同一浏览器导出器。Chromium 只用于这条 Node GIF 路径；导出结束后释放任务资源。",
        actions: [{ type: "flow", target: "node-gif", direction: "forward", text: "隔离页面" }] },
      { durationMs: 2000, caption: "同一份图解文档支持播放、静态 SVG、GIF 和离线 HTML。各路径复用核心，浏览器与 Node 工具承担各自的运行环境工作。",
        actions: [{ type: "highlight", target: "svg" }, { type: "highlight", target: "gif" }, { type: "highlight", target: "node-tools" }] }
    ] },
    { id: "boundary", label: "SDK 与展示工程", beats: [{ durationMs: 2000,
      caption: "展示工程包含私有 @flowsvg/showcase 作者目录、会话规则和原生、React、Vue 三端 apps。它们消费公开 SDK；SDK 不依赖展示工程。",
      actions: [
        { type: "unhighlight", target: "svg" }, { type: "unhighlight", target: "gif" }, { type: "unhighlight", target: "node-tools" },
        { type: "flow", target: "showcase-adapters", direction: "forward", text: "框架接入" },
        { type: "flow", target: "showcase-browser", direction: "forward", text: "原生接入" }
      ]
    }] }
  ]
};

/** One complete architecture document consumed unchanged by native, React and Vue hosts. */
export const projectArchitectureExample: ShowcaseAuthorDefinition = {
  id: "project-architecture",
  category: "architecture",
  name: "FlowSVG：图解如何运行",
  introduction: "了解 FlowSVG 自身架构：同一份图解文档经过平台无关核心求值，由浏览器播放器及适配器展示，并导出 SVG、GIF 或离线 HTML。区分可选导出、Node 运行条件与私有展示工程边界；箭头表示数据或调用。",
  document,
  defaults: { speed: 1, theme: "dark", reducedMotion: false }
};
