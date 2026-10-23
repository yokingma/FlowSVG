/** Author-time RAG stages serialize explicit node geometry; the SDK fits canvas height to each evaluated stage. */
import {
  measureNodeContent, type Action, type ContentBlock, type ContentTag, type DiagramDocument,
  type DiagramNode, type NodeContent, type NodeContentMeasurementInput
} from "flowsvg";
import type { ShowcaseAuthorDefinition } from "../model.js";

// Keep pills in node content so playback, reduced motion and exports share the same themed geometry.
function createPill(text: string): ContentTag {
  return { text, style: { shape: "pill", fontSize: 12 } };
}

function createPills(...texts: string[]): ContentBlock {
  return { type: "list", items: [{ tags: texts.map(createPill) }] };
}

// Semantic roles inherit SDK typography and theme colors, including participant highlights.
function createContent(title: string, stage: string, ...blocks: ContentBlock[]): NodeContent {
  return { style: { padding: 12, blockGap: 6 }, blocks: [{ type: "title", text: title }, createPills(stage), ...blocks] };
}

// Reuse these explicit replacements for measurement and scene updates.
const UPDATED_CONTENT = {
  retriever: createContent("召回 5 段", "候选结果",
    createPills("C3 年假余额", "C1 申请流程", "C5 办公地点", "C2 审批要求", "C4 费用报销"),
    { type: "paragraph", role: "auxiliary", text: "C1 §4.1 · C2 §4.2" }),
  reranker: createContent("重排与筛选", "5 段 → 2 段",
    { type: "list", style: { itemGap: 6 }, items: [
      { tags: [createPill("C1"), createPill("保留")], body: "申请流程 · §4.1" },
      { tags: [createPill("C2"), createPill("保留")], body: "审批要求 · §4.2" }
    ] },
    createPills("排除 C3 C4 C5")),
  context: createContent("上下文组装", "仅保留 2 段",
    { type: "paragraph", text: "年假如何申请？" },
    { type: "list", style: { itemGap: 6 }, items: [
      { tags: [createPill("C1 §4.1")], body: "在 OA 申请" },
      { tags: [createPill("C2 §4.2")], body: "负责人审批" }
    ] },
    { type: "paragraph", role: "auxiliary", text: "依据资料回答，并引用来源" }),
  answer: createContent("示意答案", "带引用回答",
    { type: "list", marker: "number", style: { itemGap: 6 }, items: [
      { body: "在 OA 提交年假申请" },
      { body: "直属负责人审批" }
    ] },
    createPills("C1 §4.1", "C2 §4.2"),
    { type: "paragraph", role: "auxiliary", text: "虚构内容 · 仅作流程演示" })
};

const ROW_GAP = 50;
const TOP_INSET = 16;
const BOTTOM_INSET = 24;
const ROW_IDS: readonly (readonly string[])[] = [
  ["handbook", "splitter", "embedding", "knowledge-index"],
  ["question", "retriever", "reranker"],
  ["context", "language-model", "answer"]
];
type StageNode = DiagramNode & { kind: NodeContentMeasurementInput["kind"]; content: NodeContent };
const INITIAL_NODES: Omit<StageNode, "y" | "height">[] = [
  { id: "handbook", kind: "roundedRect", x: 24, width: 200,
    content: createContent("员工手册", "资料入库",
      { type: "paragraph", text: "年假申请与审批" },
      { type: "paragraph", role: "auxiliary", text: "资料入库 · 虚构演示" }) },
  { id: "splitter", kind: "roundedRect", x: 274, width: 190,
    content: createContent("解析与切分", "保留来源",
      { type: "paragraph", text: "文档 → 文本片段" },
      { type: "paragraph", role: "auxiliary", text: "保留片段编号与章节" }) },
  { id: "embedding", kind: "roundedRect", x: 514, width: 220,
    content: createContent("共享嵌入模型", "同一模型",
      { type: "paragraph", text: "片段与问题 → 向量" },
      { type: "paragraph", role: "auxiliary", text: "两段流程使用同一模型" }) },
  { id: "knowledge-index", kind: "cylinder", x: 784, width: 200,
    content: createContent("知识索引", "入库一次",
      { type: "paragraph", text: "向量 · 文本 · 来源" },
      { type: "paragraph", role: "auxiliary", text: "入库一次，后续复用" }) },
  { id: "question", kind: "roundedRect", x: 24, width: 200,
    content: createContent("用户问题", "在线问答",
      { type: "paragraph", text: "年假如何申请？" },
      { type: "paragraph", role: "auxiliary", text: "在线问答 · 演示问题" }) },
  { id: "retriever", kind: "roundedRect", x: 604, width: 220,
    content: createContent("检索器", "问题向量",
      { type: "paragraph", text: "按问题向量查找片段" },
      { type: "paragraph", role: "auxiliary", text: "等待知识索引返回候选" }) },
  { id: "reranker", kind: "roundedRect", x: 284, width: 220,
    content: createContent("重排与筛选", "召回后优化",
      { type: "paragraph", text: "原始问题 + 候选文本" },
      { type: "paragraph", role: "auxiliary", text: "按相关性排序并筛选" }) },
  { id: "context", kind: "roundedRect", x: 24, width: 240,
    content: createContent("上下文组装", "问题 + 资料",
      { type: "paragraph", text: "问题 + 筛选后的资料" },
      { type: "paragraph", role: "auxiliary", text: "要求依据资料回答并引用" }) },
  { id: "language-model", kind: "roundedRect", x: 324, width: 220,
    content: createContent("大语言模型", "上下文生成",
      { type: "paragraph", text: "依据上下文生成回答" },
      { type: "paragraph", role: "auxiliary", text: "仅演示数据流，不调用模型" }) },
  { id: "answer", kind: "roundedRect", x: 604, width: 220,
    content: createContent("示意答案", "等待生成",
      { type: "paragraph", text: "申请步骤与手册引用" },
      { type: "paragraph", role: "auxiliary", text: "等待上下文与生成结果" }) }
];

/** Measure one current-content stage and center its cards within rows separated by exactly 50 units. */
function createStageNodes(
  nodes: readonly Omit<StageNode, "y" | "height">[], replacements: Readonly<Record<string, NodeContent>> = {}
): StageNode[] {
  const measured = nodes.map((node) => {
    const content = replacements[node.id] ?? node.content;
    const measurement = measureNodeContent({ kind: node.kind, width: node.width, content });
    if (measurement.diagnostics.length > 0) {
      throw new Error(`RAG node "${node.id}" content does not fit: ${JSON.stringify(measurement.diagnostics)}`);
    }
    return { ...node, content, height: measurement.height };
  });
  const rowHeights = ROW_IDS.map((ids) => Math.max(...measured.filter(({ id }) => ids.includes(id)).map(({ height }) => height)));
  return measured.map((node) => {
    const row = ROW_IDS.findIndex((ids) => ids.includes(node.id));
    const rowTop = TOP_INSET + rowHeights.slice(0, row).reduce((sum, height) => sum + height + ROW_GAP, 0);
    return { ...node, y: rowTop + (rowHeights[row]! - node.height) / 2 };
  });
}

const INITIAL_STAGE = createStageNodes(INITIAL_NODES);
const RETRIEVED_STAGE = createStageNodes(INITIAL_STAGE, { retriever: UPDATED_CONTENT.retriever });
const RERANKED_STAGE = createStageNodes(RETRIEVED_STAGE, { reranker: UPDATED_CONTENT.reranker });
const CONTEXT_STAGE = createStageNodes(RERANKED_STAGE, { context: UPDATED_CONTENT.context });
const ANSWER_STAGE = createStageNodes(CONTEXT_STAGE, { answer: UPDATED_CONTENT.answer });
const STAGES = [INITIAL_STAGE, RETRIEVED_STAGE, RERANKED_STAGE, CONTEXT_STAGE, ANSWER_STAGE];
const VIEWPORT_HEIGHT = Math.ceil(Math.max(...STAGES.flatMap((nodes) => nodes.map(({ y, height }) => y + height)))) + BOTTOM_INSET;

/** Content switches at the beat start, so changed dimensions and row positions must switch in the same beat. */
function createStageActions(previous: readonly StageNode[], next: readonly StageNode[]): Action[] {
  return next.flatMap((node, index) => {
    const before = previous[index]!;
    if (before.y === node.y && before.height === node.height && before.content === node.content) return [];
    return [{ type: "updateNode", target: node.id, value: {
      y: node.y, height: node.height, ...(before.content === node.content ? {} : { content: node.content })
    } }];
  });
}

const document: DiagramDocument = {
  version: 1,
  title: "RAG：从资料到答案",
  // Keep the fullest authored height for GIF export; live playback and SVG fit the current stage.
  viewport: { width: 1120, height: VIEWPORT_HEIGHT, fitHeight: { padding: BOTTOM_INSET } },
  nodes: INITIAL_STAGE,
  edges: [
    { id: "parse-handbook", from: "handbook", to: "splitter", route: "orthogonal", fromPort: "right", toPort: "left" },
    { id: "embed-chunks", from: "splitter", to: "embedding", route: "orthogonal", fromPort: "right", toPort: "left" },
    { id: "store-chunks", from: "embedding", to: "knowledge-index", route: "orthogonal", fromPort: "right", toPort: "left" },
    // The upper question branch enters the shared model below the ingestion row.
    // Reranking takes the question across the middle row; context takes it directly below.
    { id: "embed-question", from: "question", to: "embedding", route: "orthogonal", fromPort: "top", toPort: "bottom" },
    { id: "query-vector", from: "embedding", to: "retriever", route: "orthogonal", fromPort: "bottom", toPort: "top" },
    // Retrieval request and results reuse one path in successive beats, so their directions remain unambiguous.
    { id: "search-index", from: "retriever", to: "knowledge-index", route: "orthogonal", fromPort: "right", toPort: "right" },
    { id: "candidate-texts", from: "retriever", to: "reranker", route: "orthogonal", fromPort: "left", toPort: "right" },
    { id: "rerank-question", from: "question", to: "reranker", route: "orthogonal", fromPort: "right", toPort: "left" },
    { id: "context-question", from: "question", to: "context", route: "orthogonal", fromPort: "bottom", toPort: "top" },
    { id: "selected-chunks", from: "reranker", to: "context", route: "orthogonal", fromPort: "bottom", toPort: "top" },
    { id: "model-context", from: "context", to: "language-model", route: "orthogonal", fromPort: "right", toPort: "left" },
    { id: "cited-answer", from: "language-model", to: "answer", route: "orthogonal", fromPort: "right", toPort: "left" }
  ],
  scenes: [
    {
      id: "parse", label: "解析与切分", beats: [{ durationMs: 3000,
        caption: "资料入库（演示一次）：将虚构员工手册切分为片段，并保留手册章节来源。C1 是申请流程，C2 是审批要求。",
        actions: [{ type: "flow", target: "parse-handbook", direction: "forward", text: "手册 §4" }]
      }]
    },
    {
      id: "ingest", label: "向量化与入库", beats: [
        { durationMs: 1500, caption: "资料入库：同一嵌入模型将片段文本转成向量；C1 对应手册 §4.1，C2 对应 §4.2。",
          actions: [{ type: "flow", target: "embed-chunks", direction: "forward", text: "C1–C5" }] },
        { durationMs: 1500, caption: "资料入库完成：知识索引保存片段文本、向量和来源。后续提问复用索引，无需重新处理全部资料。",
          actions: [{ type: "flow", target: "store-chunks", direction: "forward", text: "片段 + 来源" }] }
      ]
    },
    {
      id: "ask", label: "提交问题", beats: [{ durationMs: 2000,
        caption: "用户问答：用户提出演示问题“年假如何申请？”，复用资料入库时的嵌入模型生成问题向量；这不是模型训练。",
        actions: [{ type: "flow", target: "embed-question", direction: "forward", text: "问题" }]
      }]
    },
    {
      id: "retrieve", label: "召回候选片段", beats: [
        { durationMs: 1000, caption: "用户问答：检索器接收问题向量。",
          actions: [{ type: "flow", target: "query-vector", direction: "forward", text: "问题向量" }] },
        { durationMs: 1000, caption: "用户问答：检索器用问题向量查询已建立的知识索引。",
          actions: [{ type: "flow", target: "search-index", direction: "forward", text: "查询" }] },
        { durationMs: 1000, transitionMs: 0, caption: "召回候选 C3/C1/C5/C2/C4：余额、申请流程、地点、审批要求、报销；每段携带手册来源。",
          actions: [
            { type: "flow", target: "search-index", direction: "reverse", text: "5 段 + 来源" },
            ...createStageActions(INITIAL_STAGE, RETRIEVED_STAGE)
          ] }
      ]
    },
    {
      id: "rerank", label: "重排与筛选", beats: [{ durationMs: 3000, transitionMs: 0,
        caption: "重排同时读取原始问题与候选文本：C1/C2 优先，保留申请流程与审批要求，排除弱相关 C3/C4/C5。重排是本例选用的优化。",
        actions: [
          { type: "flow", target: "candidate-texts", direction: "forward", text: "候选文本" },
          ...createStageActions(RETRIEVED_STAGE, RERANKED_STAGE),
          { type: "flow", target: "rerank-question", direction: "forward", text: "原始问题" }
        ]
      }]
    },
    {
      id: "context", label: "组装上下文", beats: [{ durationMs: 3000, transitionMs: 0,
        caption: "组装原始问题、C1“在 OA 申请”（§4.1）、C2“负责人审批”（§4.2），要求依据资料回答并引用来源。仅这两段进入上下文。",
        actions: [
          { type: "flow", target: "selected-chunks", direction: "forward", text: "C1 + C2" },
          ...createStageActions(RERANKED_STAGE, CONTEXT_STAGE),
          { type: "flow", target: "context-question", direction: "forward", text: "原始问题" }
        ]
      }]
    },
    {
      id: "generate", label: "生成带引用的答案", beats: [
        { durationMs: 1500, caption: "将问题、筛选后的资料和回答要求交给大语言模型；引用来源随上下文传递。",
          actions: [{ type: "flow", target: "model-context", direction: "forward", text: "上下文" }] },
        { durationMs: 1500, transitionMs: 0, caption: "示意答案：在 OA 提交年假申请，由直属负责人审批。[C1：员工手册 §4.1；C2：§4.2]",
          actions: [
            { type: "flow", target: "cited-answer", direction: "forward", text: "答案 + 引用" },
            ...createStageActions(CONTEXT_STAGE, ANSWER_STAGE)
          ] }
      ]
    },
    {
      id: "complete", label: "完成", beats: [{ durationMs: 1000,
        caption: "完成：在 OA 提交年假申请，由直属负责人审批。[C1：员工手册 §4.1；C2：§4.2] 入库一次，后续问答复用索引。",
        actions: []
      }]
    }
  ]
};

/** The complete teaching document is generated once and consumed unchanged by all three showcase hosts. */
export const ragWorkflowExample: ShowcaseAuthorDefinition = {
  id: "rag-workflow",
  category: "workflow",
  name: "RAG：从资料到答案",
  introduction: "演示 RAG 的资料入库与用户问答：复用嵌入模型，召回 5 个候选片段，经可选重排保留 2 个，再生成带来源的答案。员工手册、问题和答案均为虚构教学内容，不连接真实模型或数据库；片段数量不代表推荐参数。",
  document,
  defaults: { speed: 1, theme: "light", reducedMotion: false }
};
