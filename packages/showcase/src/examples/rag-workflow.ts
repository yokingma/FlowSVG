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
  retriever: createContent("5 candidates", "Candidates",
    createPills("C3 Balance", "C1 Apply", "C5 Office", "C2 Approve", "C4 Expenses"),
    { type: "paragraph", role: "auxiliary", text: "C1 §4.1 · C2 §4.2" }),
  reranker: createContent("Reranker", "5 chunks → 2 chunks",
    { type: "list", style: { itemGap: 6 }, items: [
      { tags: [createPill("C1"), createPill("Keep")], body: "Application · §4.1" },
      { tags: [createPill("C2"), createPill("Keep")], body: "Approval · §4.2" }
    ] },
    createPills("Exclude C3 C4 C5")),
  context: createContent("Build context", "Keep 2 chunks",
    { type: "paragraph", text: "How to apply?" },
    { type: "list", style: { itemGap: 6 }, items: [
      { tags: [createPill("C1 §4.1")], body: "Use HR portal" },
      { tags: [createPill("C2 §4.2")], body: "Manager approval" }
    ] },
    { type: "paragraph", role: "auxiliary", text: "Use sources · cite them" }),
  answer: createContent("Example answer", "Cited answer",
    { type: "list", marker: "number", style: { itemGap: 6 }, items: [
      { body: "Apply in HR portal" },
      { body: "Manager approval" }
    ] },
    createPills("C1 §4.1", "C2 §4.2"),
    { type: "paragraph", role: "auxiliary", text: "Fictional example" })
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
    content: createContent("Handbook", "Ingestion",
      { type: "paragraph", text: "Leave and approval" },
      { type: "paragraph", role: "auxiliary", text: "Fictional demo" }) },
  { id: "splitter", kind: "roundedRect", x: 274, width: 190,
    content: createContent("Split text", "Keep sources",
      { type: "paragraph", text: "Document → chunks" },
      { type: "paragraph", role: "auxiliary", text: "Keep IDs and sections" }) },
  { id: "embedding", kind: "roundedRect", x: 514, width: 220,
    content: createContent("Embedder", "Shared model",
      { type: "paragraph", text: "Text → vectors" },
      { type: "paragraph", role: "auxiliary", text: "One model for both paths" }) },
  { id: "knowledge-index", kind: "cylinder", x: 784, width: 200,
    content: createContent("Index", "Ingest once",
      { type: "paragraph", text: "Text · vectors" },
      { type: "paragraph", role: "auxiliary", text: "Reuse stored data" }) },
  { id: "question", kind: "roundedRect", x: 24, width: 200,
    content: createContent("User question", "Online queries",
      { type: "paragraph", text: "How to apply?" },
      { type: "paragraph", role: "auxiliary", text: "Demo question" }) },
  { id: "retriever", kind: "roundedRect", x: 604, width: 220,
    content: createContent("Retriever", "Question vector",
      { type: "paragraph", text: "Search by vector" },
      { type: "paragraph", role: "auxiliary", text: "Await candidates" }) },
  { id: "reranker", kind: "roundedRect", x: 284, width: 220,
    content: createContent("Reranker", "After retrieval",
      { type: "paragraph", text: "Question + candidates" },
      { type: "paragraph", role: "auxiliary", text: "Rank by relevance" }) },
  { id: "context", kind: "roundedRect", x: 4, width: 240,
    content: createContent("Build context", "Question + sources",
      { type: "paragraph", text: "Question + sources" },
      { type: "paragraph", role: "auxiliary", text: "Answer with sources" }) },
  { id: "language-model", kind: "roundedRect", x: 324, width: 220,
    content: createContent("Language model", "From context",
      { type: "paragraph", text: "Generate an answer" },
      { type: "paragraph", role: "auxiliary", text: "Demo · no model call" }) },
  { id: "answer", kind: "roundedRect", x: 604, width: 220,
    content: createContent("Example answer", "Await generation",
      { type: "paragraph", text: "Steps + citations" },
      { type: "paragraph", role: "auxiliary", text: "Await generated answer" }) }
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
  title: "RAG: From sources to answers",
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
    // Keep the direct question-to-context relationship as one straight segment for a cleaner arrow.
    { id: "context-question", from: "question", to: "context", route: "straight", fromPort: "bottom", toPort: "top" },
    { id: "selected-chunks", from: "reranker", to: "context", route: "orthogonal", fromPort: "bottom", toPort: "top" },
    { id: "model-context", from: "context", to: "language-model", route: "orthogonal", fromPort: "right", toPort: "left" },
    { id: "cited-answer", from: "language-model", to: "answer", route: "orthogonal", fromPort: "right", toPort: "left" }
  ],
  scenes: [
    {
      id: "parse", label: "Parse and split", beats: [{ durationMs: 3000,
        caption: "Ingestion, shown once: split a fictional employee handbook into chunks and retain section sources. C1 describes applications; C2 describes approval.",
        actions: [{ type: "flow", target: "parse-handbook", direction: "forward", text: "Handbook §4" }]
      }]
    },
    {
      id: "ingest", label: "Embed and index", beats: [
        { durationMs: 1500, caption: "Ingestion: the shared embedding model converts chunk text to vectors. C1 refers to handbook §4.1; C2 refers to §4.2.",
          actions: [{ type: "flow", target: "embed-chunks", direction: "forward", text: "C1–C5" }] },
        { durationMs: 1500, caption: "Ingestion complete: the index stores chunk text, vectors and sources. Later questions reuse it without processing the entire handbook again.",
          actions: [{ type: "flow", target: "store-chunks", direction: "forward", text: "Chunks + sources" }] }
      ]
    },
    {
      id: "ask", label: "Submit a question", beats: [{ durationMs: 2000,
        caption: "The user asks the demo question, How do I request leave? The same embedding model used for ingestion produces the question vector. This is not model training.",
        actions: [{ type: "flow", target: "embed-question", direction: "forward", text: "Question" }]
      }]
    },
    {
      id: "retrieve", label: "Retrieve candidate chunks", beats: [
        { durationMs: 1000, caption: "Online query: the retriever receives the question vector.",
          actions: [{ type: "flow", target: "query-vector", direction: "forward", text: "Question vector" }] },
        { durationMs: 1000, caption: "Online query: the retriever searches the existing knowledge index with the question vector.",
          actions: [{ type: "flow", target: "search-index", direction: "forward", text: "Search" }] },
        { durationMs: 1000, transitionMs: 0, caption: "Retrieve C3/C1/C5/C2/C4: leave balance, application, location, approval and expenses. Each candidate retains its handbook source.",
          actions: [
            { type: "flow", target: "search-index", direction: "reverse", text: "5 chunks + sources" },
            ...createStageActions(INITIAL_STAGE, RETRIEVED_STAGE)
          ] }
      ]
    },
    {
      id: "rerank", label: "Rerank and filter", beats: [{ durationMs: 3000, transitionMs: 0,
        caption: "Reranking reads the original question and candidates. Keep C1/C2 for application and approval; exclude weaker matches C3/C4/C5. Reranking is an optional optimization in this example.",
        actions: [
          { type: "flow", target: "candidate-texts", direction: "forward", text: "Candidate text" },
          ...createStageActions(RETRIEVED_STAGE, RERANKED_STAGE),
          { type: "flow", target: "rerank-question", direction: "forward", text: "Original question" }
        ]
      }]
    },
    {
      id: "context", label: "Assemble context", beats: [{ durationMs: 3000, transitionMs: 0,
        caption: "Combine the question, C1 Apply in the HR portal (§4.1), and C2 Manager approval (§4.2). Require a grounded answer with citations. Only these two chunks enter the context.",
        actions: [
          { type: "flow", target: "selected-chunks", direction: "forward", text: "C1 + C2" },
          ...createStageActions(RERANKED_STAGE, CONTEXT_STAGE),
          { type: "flow", target: "context-question", direction: "forward", text: "Original question" }
        ]
      }]
    },
    {
      id: "generate", label: "Generate a cited answer", beats: [
        { durationMs: 1500, caption: "Send the question, selected sources and answer instructions to the language model. Source references travel with the context.",
          actions: [{ type: "flow", target: "model-context", direction: "forward", text: "Context" }] },
        { durationMs: 1500, transitionMs: 0, caption: "Example answer: request leave in the HR portal for direct manager approval. [C1: Employee handbook §4.1; C2: §4.2]",
          actions: [
            { type: "flow", target: "cited-answer", direction: "forward", text: "Answer + citations" },
            ...createStageActions(CONTEXT_STAGE, ANSWER_STAGE)
          ] }
      ]
    },
    {
      id: "complete", label: "Complete", beats: [{ durationMs: 1000,
        caption: "Complete: request leave in the HR portal for direct manager approval. [C1: Employee handbook §4.1; C2: §4.2] Ingest once; reuse the index for later questions.",
        actions: []
      }]
    }
  ]
};

/** The complete teaching document is generated once and consumed unchanged by all three showcase hosts. */
export const ragWorkflowExample: ShowcaseAuthorDefinition = {
  id: "rag-workflow",
  category: "workflow",
  name: "RAG: From sources to answers",
  introduction: "Explore RAG ingestion and online queries: share an embedding model, retrieve five candidates, optionally rerank to keep two, and generate a cited answer. The handbook, question and answer are fictional. No live model or database is used; chunk counts are teaching choices.",
  document,
  defaults: { speed: 1, theme: "dark", reducedMotion: false }
};
