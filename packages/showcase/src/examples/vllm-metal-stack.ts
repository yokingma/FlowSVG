/**
 * Layered teaching adaptation of the upstream vllm-metal architecture figure, viewed 2026-10-21.
 * Source: https://raw.githubusercontent.com/vllm-project/vllm-metal/main/docs/assets/architecture.svg
 * Groups express ownership; layer arrows do not prescribe an execution order among the contained modules.
 */
import type { Action, DiagramDocument, NodeContent } from "flowsvg";
import type { ShowcaseAuthorDefinition } from "../model.js";

const MODULE_TITLE_SIZE = 18;
const MODULE_PADDING = 6;
const MODULE_BLOCK_GAP = 4;

// Compact semantic roles preserve SDK theme/highlight paint across the dense layer panels.
function createModuleContent(title: string, tag: string, detail: string): NodeContent {
  return { style: { padding: MODULE_PADDING, blockGap: MODULE_BLOCK_GAP }, blocks: [
    { type: "title", text: title, style: { fontSize: MODULE_TITLE_SIZE } },
    { type: "list", items: [{ tags: [{ text: tag, style: { shape: "pill", fontSize: 12 } }] }] },
    { type: "paragraph", role: "auxiliary", text: detail }
  ] };
}

function setHighlights(enabled: boolean, ...targets: string[]): Action[] {
  return targets.map((target) => ({ type: enabled ? "highlight" : "unhighlight", target }));
}

const document: DiagramDocument = {
  version: 1,
  title: "vllm-metal：分层推理架构",
  // Fit module and group heights to their content; retain 50-unit layer gaps and parent-relative children.
  viewport: { width: 1280, height: 920 },
  nodes: [
    { id: "clients", kind: "roundedRect", x: 40, y: 20, width: 1200, height: 96,
      content: { style: { padding: 12, blockGap: 6 }, blocks: [
        { type: "title", text: "Client apps", style: { fontSize: 20 } },
        { type: "list", items: [{ tags: ["Coding agents", "Chat UIs", "OpenAI SDKs", "curl"]
          .map((text) => ({ text, style: { shape: "pill", fontSize: 12 } })) }] }
      ] } },
    { id: "upstream", kind: "group", x: 40, y: 166, width: 1200, height: 156,
      label: "Upstream vLLM V1 · 原样复用" },
    { id: "api-server", kind: "roundedRect", parentId: "upstream", x: 20, y: 44, width: 275, height: 100,
      content: createModuleContent("OpenAI API server", "兼容接口", "streaming · tool calls") },
    { id: "scheduler", kind: "roundedRect", parentId: "upstream", x: 315, y: 44, width: 275, height: 100,
      content: createModuleContent("V1 scheduler", "请求调度", "admission · preemption") },
    { id: "block-manager", kind: "roundedRect", parentId: "upstream", x: 610, y: 44, width: 275, height: 100,
      content: createModuleContent("Paged block manager", "KV block 管理", "prefix caching") },
    { id: "chunked-prefill", kind: "roundedRect", parentId: "upstream", x: 905, y: 44, width: 275, height: 100,
      content: createModuleContent("Chunked prefill", "分块预填充", "continuous batching") },
    { id: "runner", kind: "group", x: 40, y: 372, width: 1200, height: 322,
      label: "vllm-metal model runner · 打包 token IDs，构建 cu_seqlens" },
    { id: "mlx-primitives", kind: "group", parentId: "runner", x: 20, y: 44, width: 610, height: 266,
      label: "基于 mlx_lm · token-wise，无请求边界" },
    { id: "metal-owned", kind: "group", parentId: "runner", x: 650, y: 44, width: 530, height: 266,
      label: "vllm-metal 自有 · 消费 cu_seqlens" },
    { id: "model-definitions", kind: "roundedRect", parentId: "mlx-primitives", x: 16, y: 44, width: 280, height: 100,
      content: createModuleContent("Model definitions", "mlx_lm", "模型定义 · token-wise") },
    { id: "weight-loading", kind: "roundedRect", parentId: "mlx-primitives", x: 314, y: 44, width: 280, height: 100,
      content: createModuleContent("Weight loading", "mlx_lm", "权重加载") },
    { id: "norm-linear", kind: "roundedRect", parentId: "mlx-primitives", x: 16, y: 154, width: 280, height: 100,
      content: createModuleContent("RMSNorm · linear", "mlx_lm", "逐 token 运算") },
    { id: "mlp-moe", kind: "roundedRect", parentId: "mlx-primitives", x: 314, y: 154, width: 280, height: 100,
      content: createModuleContent("MLP · MoE", "mlx_lm", "逐 token 运算") },
    { id: "paged-attention", kind: "roundedRect", parentId: "metal-owned", x: 16, y: 44, width: 498, height: 100,
      content: createModuleContent("Paged varlen attention", "Metal kernel", "q [total_q, H, D] · cu_seqlens") },
    { id: "nax-prefill", kind: "roundedRect", parentId: "metal-owned", x: 16, y: 154, width: 241, height: 100,
      content: createModuleContent("M5 NAX prefill", "Metal kernel", "仅 M5 · cu_seqlens") },
    { id: "mtp", kind: "roundedRect", parentId: "metal-owned", x: 273, y: 154, width: 241, height: 100,
      content: createModuleContent("MTP draft + verify", "运行时编排", "消费 cu_seqlens") },
    { id: "runtime", kind: "group", x: 40, y: 744, width: 1200, height: 156,
      label: "MLX · Metal · Apple Silicon" },
    { id: "mlx-runtime", kind: "roundedRect", parentId: "runtime", x: 20, y: 44, width: 370, height: 100,
      content: createModuleContent("MLX runtime", "运行时", "lazy graph · GEMMs") },
    { id: "apple-gpu", kind: "roundedRect", parentId: "runtime", x: 415, y: 44, width: 370, height: 100,
      content: createModuleContent("Apple Silicon GPU", "硬件", "M5 增加 NAX units") },
    { id: "unified-memory", kind: "roundedRect", parentId: "runtime", x: 810, y: 44, width: 370, height: 100,
      content: createModuleContent("Unified memory", "统一内存", "weights + paged KV") }
  ],
  // Group-boundary endpoints preserve the reference's layer relationships without crossing the module cards.
  edges: [
    { id: "http-request", from: "clients", to: "upstream", route: "curved", fromPort: "bottom", toPort: "top" },
    { id: "scheduler-output", from: "upstream", to: "runner", route: "curved", fromPort: "bottom", toPort: "top" },
    { id: "metal-operations", from: "runner", to: "runtime", route: "curved", fromPort: "bottom", toPort: "top" }
  ],
  scenes: [
    { id: "request", label: "客户端与 API", beats: [{ durationMs: 3000,
      caption: "客户端通过 OpenAI-compatible HTTP 访问上游 vLLM V1。API server 提供流式输出和工具调用；本图按官方参考图讲解职责，不执行真实推理。",
      actions: [...setHighlights(true, "api-server"), { type: "flow", target: "http-request", direction: "forward", text: "HTTP" }]
    }] },
    { id: "schedule", label: "上游调度", beats: [{ durationMs: 4000,
      caption: "原样复用上游 V1 scheduler、paged block manager 和 chunked prefill，支持请求准入、抢占、prefix caching 与 continuous batching。SchedulerOutput 携带 scheduled-token counts 和 KV block IDs。",
      actions: [
        ...setHighlights(false, "api-server"), ...setHighlights(true, "scheduler", "block-manager", "chunked-prefill"),
        { type: "flow", target: "scheduler-output", direction: "forward", text: "SchedulerOutput" }
      ]
    }] },
    { id: "runner", label: "Runner 与 mlx_lm", beats: [{ durationMs: 4000,
      caption: "vllm-metal model runner 打包 token IDs，并构建 cu_seqlens。模型定义、权重加载、RMSNorm / linear、MLP / MoE 基于 mlx_lm；这些模块执行 token-wise 运算，不承担请求边界管理。",
      actions: [
        ...setHighlights(false, "scheduler", "block-manager", "chunked-prefill"),
        ...setHighlights(true, "runner", "mlx-primitives", "model-definitions", "weight-loading", "norm-linear", "mlp-moe")
      ]
    }] },
    { id: "attention", label: "自有注意力路径", beats: [
      { durationMs: 2500, caption: "vllm-metal 自有的 paged varlen attention 使用自定义 Metal kernel，消费 cu_seqlens 来区分请求；查询张量形状为 q [total_q, H, D]。",
        actions: [
          ...setHighlights(false, "mlx-primitives", "model-definitions", "weight-loading", "norm-linear", "mlp-moe"),
          ...setHighlights(true, "metal-owned", "paged-attention")
        ] },
      { durationMs: 2500, caption: "M5 NAX prefill 是面向 M5 NAX 单元的 Metal kernel；MTP draft + verify 是运行时编排。二者消费 cu_seqlens，是否启用取决于硬件、模型与配置，并非每次请求都会执行。",
        actions: [...setHighlights(false, "paged-attention"), ...setHighlights(true, "nax-prefill", "mtp")] }
    ] },
    { id: "runtime", label: "运行时与硬件", beats: [
      { durationMs: 3000, caption: "Runner 向底层提交 MLX ops 与自定义 Metal kernels；层间箭头描述调用关系，不表示同层模块之间的执行顺序。",
        actions: [
          ...setHighlights(false, "runner", "metal-owned", "nax-prefill", "mtp"),
          { type: "flow", target: "metal-operations", direction: "forward", text: "MLX / Metal" }
        ] },
      { durationMs: 2000, caption: "MLX runtime 提供 lazy graph 与 GEMMs；Apple Silicon GPU 执行计算，M5 增加 NAX 单元。统一内存保存模型 weights 和 paged KV cache。",
        actions: setHighlights(true, "runtime", "mlx-runtime", "apple-gpu", "unified-memory") }
    ] },
    { id: "overview", label: "分层职责总览", beats: [{ durationMs: 3000,
      caption: "参考图职责总览：上游 vLLM 负责调度，mlx_lm 提供逐 token 模型组件，vllm-metal 负责请求感知的注意力路径，MLX / Metal / Apple Silicon 提供运行时与硬件。图中模块与条件按参考图说明。",
      actions: setHighlights(false, "runtime", "mlx-runtime", "apple-gpu", "unified-memory")
    }] }
  ]
};

/** Self-contained author data; hosts need no source-image request or vllm/MLX dependency. */
export const vllmMetalStackExample: ShowcaseAuthorDefinition = {
  id: "vllm-metal-stack",
  category: "architecture",
  name: "vllm-metal：分层推理架构",
  introduction: "参考 vllm-metal 官方架构图，用 24 秒讲解客户端、上游 vLLM V1、嵌套的 model runner 与 MLX / Metal / Apple Silicon 四层结构。区分 mlx_lm 复用、自有注意力实现和硬件／配置条件；仅展示模块职责，不执行真实推理。",
  document,
  defaults: { speed: 1, theme: "light", reducedMotion: false }
};
