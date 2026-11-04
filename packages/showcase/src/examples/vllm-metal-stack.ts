/**
 * Layered teaching adaptation of the upstream vllm-metal architecture figure, viewed 2026-10-21.
 * Source: https://raw.githubusercontent.com/vllm-project/vllm-metal/main/docs/assets/architecture.svg
 * Groups express ownership; layer arrows do not prescribe an execution order among the contained modules.
 */
import type { Action, DiagramDocument, NodeContent } from "flowsvg";
import type { ShowcaseAuthorDefinition } from "../model.js";
import { measureExampleNode } from "./example-content.js";

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
  title: "vllm-metal: Layered inference architecture",
  // Measure module content with authored minimum heights; keep fixed groups, layer gaps and parent-relative children.
  viewport: { width: 1280, height: 920 },
  nodes: [
    measureExampleNode({ id: "clients", kind: "roundedRect", x: 40, y: 20, width: 1200, height: 96,
      content: { style: { padding: 12, blockGap: 6 }, blocks: [
        { type: "title", text: "Client apps", style: { fontSize: 20 } },
        { type: "list", items: [{ tags: ["Coding agents", "Chat UIs", "OpenAI SDKs", "curl"]
          .map((text) => ({ text, style: { shape: "pill", fontSize: 12 } })) }] }
      ] } }),
    { id: "upstream", kind: "group", x: 40, y: 166, width: 1200, height: 156,
      label: "Upstream vLLM V1 · reused unchanged" },
    measureExampleNode({ id: "api-server", kind: "roundedRect", parentId: "upstream", x: 20, y: 44, width: 275, height: 100,
      content: createModuleContent("OpenAI API server", "Compatible API", "streaming · tool calls") }),
    measureExampleNode({ id: "scheduler", kind: "roundedRect", parentId: "upstream", x: 315, y: 44, width: 275, height: 100,
      content: createModuleContent("V1 scheduler", "Request scheduling", "admission · preemption") }),
    measureExampleNode({ id: "block-manager", kind: "roundedRect", parentId: "upstream", x: 610, y: 44, width: 275, height: 100,
      content: createModuleContent("Paged block manager", "KV block management", "prefix caching") }),
    measureExampleNode({ id: "chunked-prefill", kind: "roundedRect", parentId: "upstream", x: 905, y: 44, width: 275, height: 100,
      content: createModuleContent("Chunked prefill", "Chunked prefill", "continuous batching") }),
    { id: "runner", kind: "group", x: 40, y: 372, width: 1200, height: 322,
      label: "vllm-metal model runner · packs token IDs, builds cu_seqlens" },
    { id: "mlx-primitives", kind: "group", parentId: "runner", x: 20, y: 44, width: 610, height: 266,
      label: "Based on mlx_lm · token-wise, no request boundaries" },
    { id: "metal-owned", kind: "group", parentId: "runner", x: 650, y: 44, width: 530, height: 266,
      label: "Owned by vllm-metal · uses cu_seqlens" },
    measureExampleNode({ id: "model-definitions", kind: "roundedRect", parentId: "mlx-primitives", x: 16, y: 44, width: 280, height: 100,
      content: createModuleContent("Model definitions", "mlx_lm", "Model definitions · token-wise") }),
    measureExampleNode({ id: "weight-loading", kind: "roundedRect", parentId: "mlx-primitives", x: 314, y: 44, width: 280, height: 100,
      content: createModuleContent("Weight loading", "mlx_lm", "Weight loading") }),
    measureExampleNode({ id: "norm-linear", kind: "roundedRect", parentId: "mlx-primitives", x: 16, y: 154, width: 280, height: 100,
      content: createModuleContent("RMSNorm · linear", "mlx_lm", "Token-wise operations") }),
    measureExampleNode({ id: "mlp-moe", kind: "roundedRect", parentId: "mlx-primitives", x: 314, y: 154, width: 280, height: 100,
      content: createModuleContent("MLP · MoE", "mlx_lm", "Token-wise operations") }),
    measureExampleNode({ id: "paged-attention", kind: "roundedRect", parentId: "metal-owned", x: 16, y: 44, width: 498, height: 100,
      content: createModuleContent("Paged varlen attention", "Metal kernel", "q [total_q, H, D] · cu_seqlens") }),
    measureExampleNode({ id: "nax-prefill", kind: "roundedRect", parentId: "metal-owned", x: 16, y: 154, width: 241, height: 100,
      content: createModuleContent("M5 NAX prefill", "Metal kernel", "M5 only · cu_seqlens") }),
    measureExampleNode({ id: "mtp", kind: "roundedRect", parentId: "metal-owned", x: 273, y: 154, width: 241, height: 100,
      content: createModuleContent("MTP draft + verify", "Runtime orchestration", "Uses cu_seqlens") }),
    { id: "runtime", kind: "group", x: 40, y: 744, width: 1200, height: 156,
      label: "MLX · Metal · Apple Silicon" },
    measureExampleNode({ id: "mlx-runtime", kind: "roundedRect", parentId: "runtime", x: 20, y: 44, width: 370, height: 100,
      content: createModuleContent("MLX runtime", "Runtime", "lazy graph · GEMMs") }),
    measureExampleNode({ id: "apple-gpu", kind: "roundedRect", parentId: "runtime", x: 415, y: 44, width: 370, height: 100,
      content: createModuleContent("Apple Silicon GPU", "Hardware", "M5 adds NAX units") }),
    measureExampleNode({ id: "unified-memory", kind: "roundedRect", parentId: "runtime", x: 810, y: 44, width: 370, height: 100,
      content: createModuleContent("Unified memory", "Unified memory", "weights + paged KV") })
  ],
  // Group-boundary endpoints preserve the reference's layer relationships without crossing the module cards.
  edges: [
    { id: "http-request", from: "clients", to: "upstream", route: "curved", fromPort: "bottom", toPort: "top" },
    { id: "scheduler-output", from: "upstream", to: "runner", route: "curved", fromPort: "bottom", toPort: "top" },
    { id: "metal-operations", from: "runner", to: "runtime", route: "curved", fromPort: "bottom", toPort: "top" }
  ],
  scenes: [
    { id: "request", label: "Clients and API", beats: [{ durationMs: 3000,
      caption: "Clients reach upstream vLLM V1 over OpenAI-compatible HTTP. The API server supports streaming and tool calls. This diagram explains the official reference architecture; it does not run inference.",
      actions: [...setHighlights(true, "api-server"), { type: "flow", target: "http-request", direction: "forward", text: "HTTP" }]
    }] },
    { id: "schedule", label: "Upstream scheduling", beats: [{ durationMs: 4000,
      caption: "The upstream V1 scheduler, paged block manager and chunked prefill are reused unchanged. They support admission, preemption, prefix caching and continuous batching. SchedulerOutput carries scheduled-token counts and KV block IDs.",
      actions: [
        ...setHighlights(false, "api-server"), ...setHighlights(true, "scheduler", "block-manager", "chunked-prefill"),
        { type: "flow", target: "scheduler-output", direction: "forward", text: "SchedulerOutput" }
      ]
    }] },
    { id: "runner", label: "Runner and mlx_lm", beats: [{ durationMs: 4000,
      caption: "The vllm-metal model runner packs token IDs and builds cu_seqlens. Model definitions, weight loading, RMSNorm / linear and MLP / MoE use mlx_lm. These token-wise components do not manage request boundaries.",
      actions: [
        ...setHighlights(false, "scheduler", "block-manager", "chunked-prefill"),
        ...setHighlights(true, "runner", "mlx-primitives", "model-definitions", "weight-loading", "norm-linear", "mlp-moe")
      ]
    }] },
    { id: "attention", label: "Custom attention paths", beats: [
      { durationMs: 2500, caption: "The vllm-metal paged varlen attention path uses a custom Metal kernel. It reads cu_seqlens to distinguish requests; the query tensor is q [total_q, H, D].",
        actions: [
          ...setHighlights(false, "mlx-primitives", "model-definitions", "weight-loading", "norm-linear", "mlp-moe"),
          ...setHighlights(true, "metal-owned", "paged-attention")
        ] },
      { durationMs: 2500, caption: "M5 NAX prefill is a Metal kernel for M5 NAX units; MTP draft + verify is runtime orchestration. Both use cu_seqlens. Hardware, model and configuration determine whether they run; they are not used on every request.",
        actions: [...setHighlights(false, "paged-attention"), ...setHighlights(true, "nax-prefill", "mtp")] }
    ] },
    { id: "runtime", label: "Runtime and hardware", beats: [
      { durationMs: 3000, caption: "The runner submits MLX ops and custom Metal kernels. Arrows between layers represent calls, not the execution order of modules within a layer.",
        actions: [
          ...setHighlights(false, "runner", "metal-owned", "nax-prefill", "mtp"),
          { type: "flow", target: "metal-operations", direction: "forward", text: "MLX / Metal" }
        ] },
      { durationMs: 2000, caption: "The MLX runtime provides lazy graphs and GEMMs. Apple Silicon GPUs execute the computation; M5 adds NAX units. Unified memory holds model weights and the paged KV cache.",
        actions: setHighlights(true, "runtime", "mlx-runtime", "apple-gpu", "unified-memory") }
    ] },
    { id: "overview", label: "Layer responsibilities", beats: [{ durationMs: 3000,
      caption: "Reference overview: upstream vLLM schedules requests, mlx_lm supplies token-wise model components, and vllm-metal handles request-aware attention. MLX, Metal and Apple Silicon supply the runtime and hardware. Modules and conditions follow the reference diagram.",
      actions: setHighlights(false, "runtime", "mlx-runtime", "apple-gpu", "unified-memory")
    }] }
  ]
};

/** Self-contained author data; hosts need no source-image request or vllm/MLX dependency. */
export const vllmMetalStackExample: ShowcaseAuthorDefinition = {
  id: "vllm-metal-stack",
  category: "architecture",
  name: "vllm-metal: Layered inference architecture",
  introduction: "Explore four layers from the official vllm-metal architecture diagram: clients, upstream vLLM V1, a nested model runner, and MLX / Metal / Apple Silicon. Distinguish reused mlx_lm components, custom attention and hardware or configuration conditions. This is a teaching diagram, not a live inference run.",
  document,
  defaults: { speed: 1, theme: "dark", reducedMotion: false }
};
