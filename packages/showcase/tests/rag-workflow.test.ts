import { expect, it } from "vitest";
import { createDiagram } from "flowsvg";
import { compileCatalog } from "../src/build.js";
import { catalogSource } from "../src/formal.js";
import { beatStart, beatMiddle, sceneStart } from "./story-timing.js";

function getRagDiagram() {
  const { catalog } = compileCatalog(catalogSource);
  const example = catalog.get("rag-workflow");
  if (!example) throw new Error("The formal RAG example is missing");
  return { example, diagram: createDiagram(example.document) };
}

it("fits the full-view canvas to each current stage and restores it after backward seeking", () => {
  const { example, diagram } = getRagDiagram();
  const retrievedAt = beatStart(diagram, 6);
  const rerankedAt = beatStart(diagram, 7);
  const contextAt = beatStart(diagram, 8);
  const answerAt = beatStart(diagram, 10);
  const stages = [
    [0, 612], [retrievedAt - 1, 612], [retrievedAt, 676], [retrievedAt + 1, 676],
    [rerankedAt - 1, 676], [rerankedAt, 690], [rerankedAt + 1, 690], [contextAt - 1, 690],
    [contextAt, 790], [contextAt + 1, 790], [answerAt - 1, 790], [answerAt, 790], [diagram.totalDuration, 790]
  ] as const;
  for (const [time, height] of [...stages, ...[...stages].reverse()]) {
    for (const theme of ["light", "dark"] as const) {
      for (const reducedMotion of [false, true]) {
        const frame = diagram.evaluateAt(time, { theme, reducedMotion });
        expect(frame.camera, `canvas at ${time}`).toEqual({ x: 0, y: 0, width: 1120, height });
        expect(frame.warnings).toEqual([]);
        expect(diagram.renderSvg(time, { theme, reducedMotion })).toContain(`viewBox="0 0 1120 ${height}"`);
        for (const node of frame.nodes) expect(node.y + node.height).toBeLessThan(frame.camera.height - 24);
      }
    }
  }
  expect(example.document.viewport.height).toBe(789);
});

it("fits the initial four deferred-result cards to their current content", () => {
  const { diagram } = getRagDiagram();
  const frame = diagram.evaluateAt(0);
  for (const id of ["retriever", "reranker", "context", "answer"]) {
    expect(frame.nodes.find((node) => node.id === id)!.height, id).toBe(141);
  }
});

it("applies compact stage geometry immediately and deterministically while keeping both row gaps", () => {
  const { example, diagram } = getRagDiagram();
  const times = [0, ...[6, 7, 8, 10].flatMap((index) => {
    const start = beatStart(diagram, index);
    return [start, start + 1, start + 125];
  }), diagram.totalDuration];
  const initial = diagram.evaluateAt(0);
  for (const time of [...times, ...[...times].reverse()]) {
    for (const theme of ["light", "dark"] as const) {
      for (const reducedMotion of [false, true]) {
        const frame = diagram.evaluateAt(time, { theme, reducedMotion });
        expect(frame.warnings, `warnings at ${time}`).toEqual([]);
        expect(frame.nodes.map(({ x, width }) => [x, width])).toEqual(initial.nodes.map(({ x, width }) => [x, width]));
        const rows = [
          ["handbook", "splitter", "embedding", "knowledge-index"],
          ["question", "retriever", "reranker"],
          ["context", "language-model", "answer"]
        ].map((ids) => frame.nodes.filter(({ id }) => ids.includes(id)));
        for (let row = 1; row < rows.length; row += 1) {
          expect(Math.min(...rows[row]!.map(({ y }) => y))
            - Math.max(...rows[row - 1]!.map(({ y, height }) => y + height))).toBe(50);
        }
        for (const node of frame.nodes) {
          const layout = node.contentLayout!;
          const contentBottom = Math.max(...layout.lines.map(({ y, fontSize }) => y - fontSize + Math.max(20, fontSize * 1.35)),
            ...layout.tags.map(({ y, height }) => y + height));
          expect(layout.safeArea.y + layout.safeArea.height - contentBottom, `${node.id} at ${time}`).toBeLessThanOrEqual(4);
          expect(node.y + node.height).toBeLessThanOrEqual(frame.camera.height);
        }
        expect(frame.nodes.find(({ id }) => id === "retriever")!.height).toBe(time >= beatStart(diagram, 6) ? 205 : 141);
        expect(frame.nodes.find(({ id }) => id === "reranker")!.height).toBe(time >= beatStart(diagram, 7) ? 219 : 141);
        expect(frame.nodes.find(({ id }) => id === "context")!.height).toBe(time >= beatStart(diagram, 8) ? 241 : 141);
        expect(frame.nodes.find(({ id }) => id === "answer")!.height).toBe(time >= beatStart(diagram, 10) ? 197 : 141);
        expect(frame.nodes.map(({ x, y, width, height }) => [x, y, width, height]))
          .toEqual(createDiagram(example.document).evaluateAt(time).nodes.map(({ x, y, width, height }) => [x, y, width, height]));
      }
    }
  }
});

it("keeps both row gaps at 50 units while keeping retrieval near the index and context near the question", () => {
  const { example, diagram } = getRagDiagram();
  const frame = diagram.evaluateAt(0);
  const nodeById = new Map(frame.nodes.map((node) => [node.id, node]));
  const question = nodeById.get("question")!;
  const retriever = nodeById.get("retriever")!;
  const reranker = nodeById.get("reranker")!;
  const context = nodeById.get("context")!;
  const model = nodeById.get("language-model")!;
  const answer = nodeById.get("answer")!;
  const rows = [
    ["handbook", "splitter", "embedding", "knowledge-index"],
    ["question", "retriever", "reranker"],
    ["context", "language-model", "answer"]
  ].map((ids) => ids.map((id) => nodeById.get(id)!));
  const gaps = rows.slice(1).map((row, index) => Math.min(...row.map(({ y }) => y))
    - Math.max(...rows[index]!.map(({ y, height }) => y + height)));
  expect(gaps).toEqual([50, 50]);
  expect(question.x + question.width).toBeLessThan(reranker.x);
  expect(reranker.x + reranker.width).toBeLessThan(retriever.x);
  expect(context.x + context.width).toBeLessThan(model.x);
  expect(model.x + model.width).toBeLessThan(answer.x);
  expect(reranker.y + reranker.height).toBeLessThan(context.y);
  expect(example.document.viewport.width).toBeLessThanOrEqual(1200);
});

it("keeps shared inputs distinct and aligns each arrival with its target side", () => {
  const { diagram } = getRagDiagram();
  const frame = diagram.evaluateAt(beatMiddle(diagram, 7));
  const pointsFor = (id: string) => {
    const path = frame.edges.find((edge) => edge.id === id)!.path;
    const values = path.match(/-?\d+(?:\.\d+)?/g)!.map(Number);
    return Array.from({ length: values.length / 2 }, (_, index) => ({ x: values[index * 2]!, y: values[index * 2 + 1]! }));
  };
  for (const ids of [["embed-chunks", "embed-question"], ["rerank-question", "candidate-texts"], ["context-question", "selected-chunks"]]) {
    const [first, second] = ids.map((id) => pointsFor(id).at(-1)!);
    expect(Math.hypot(first!.x - second!.x, first!.y - second!.y)).toBeGreaterThanOrEqual(20);
  }
  const normals = { top: { x: 0, y: -1 }, right: { x: 1, y: 0 }, bottom: { x: 0, y: 1 }, left: { x: -1, y: 0 } };
  for (const edge of frame.edges) {
    expect(edge.path).toMatch(/^M/);
    const points = pointsFor(edge.id);
    const end = points.at(-1)!;
    const before = points.at(-2)!;
    const normal = normals[edge.toPort!];
    expect((before.x - end.x) * normal.x + (before.y - end.y) * normal.y).toBeGreaterThan(0);
    expect((before.x - end.x) * normal.y - (before.y - end.y) * normal.x).toBeCloseTo(0);
  }
});

it("uses a clear title hierarchy and structured retrieval, selection and cited answer content", () => {
  const { diagram } = getRagDiagram();
  const layoutAt = (time: number, id: string) => diagram.evaluateAt(time).nodes.find((node) => node.id === id)?.contentLayout;
  for (const node of diagram.evaluateAt(0).nodes) {
    const lines = node.contentLayout?.lines ?? [];
    const title = lines.find(({ role }) => role === "title");
    const detail = lines.find(({ role }) => role !== "title");
    expect(title, `${node.id} needs a visible title`).toBeDefined();
    expect(detail, `${node.id} needs explanatory detail`).toBeDefined();
    expect(title!.fontSize).toBeGreaterThan(detail!.fontSize);
    expect(title!.fontWeight).toBeGreaterThan(detail!.fontWeight);
    expect(node.contentLayout!.tags.length, `${node.id} needs a stage pill`).toBeGreaterThan(0);
    expect(node.contentLayout!.tags.every(({ shape }) => shape === "pill")).toBe(true);
  }
  const recalled = layoutAt(beatMiddle(diagram, 6), "retriever")!;
  expect(recalled.lines.filter(({ role }) => role === "tag").map(({ text }) => text).slice(1)).toEqual([
    "C3 年假余额", "C1 申请流程", "C5 办公地点", "C2 审批要求", "C4 费用报销"
  ]);
  const reranked = layoutAt(beatMiddle(diagram, 7), "reranker")!;
  expect(reranked.lines.filter(({ role }) => role === "tag").map(({ text }) => text))
    .toEqual(["5 段 → 2 段", "C1", "保留", "C2", "保留", "排除 C3 C4 C5"]);
  expect(reranked.tags.every(({ shape }) => shape === "pill")).toBe(true);
  expect(reranked.lines.map(({ text }) => text)).toEqual(expect.arrayContaining([
    "保留", "申请流程 · §4.1", "审批要求 · §4.2", "排除 C3 C4 C5"
  ]));
  const context = layoutAt(beatMiddle(diagram, 8), "context")!;
  expect(context.lines.map(({ text }) => text)).toEqual(expect.arrayContaining([
    "年假如何申请？", "在 OA 申请", "负责人审批", "C1 §4.1", "C2 §4.2"
  ]));
  const answer = layoutAt(diagram.totalDuration, "answer")!;
  expect(answer.lines.filter(({ role }) => role === "marker").map(({ text }) => text)).toEqual(["1.", "2."]);
  expect(answer.lines.map(({ text }) => text).join("")).toContain("在 OA 提交年假申请");
  expect(answer.lines.map(({ text }) => text).join("")).toContain("直属负责人审批");
  expect(answer.lines.filter(({ role }) => role === "tag").map(({ text }) => text))
    .toEqual(["带引用回答", "C1 §4.1", "C2 §4.2"]);
});

it("keeps ingestion separate and supplies the question and candidate texts to reranking before context", () => {
  const { diagram } = getRagDiagram();
  const flowsAt = (time: number) => diagram.evaluateAt(time).edges
    .filter(({ flow }) => flow).map(({ id, from, to, flow }) => ({ id, from, to, direction: flow!.direction, text: flow!.text }));
  expect(flowsAt(beatMiddle(diagram, 1))).toEqual([expect.objectContaining({ from: "splitter", to: "embedding" })]);
  expect(flowsAt(beatMiddle(diagram, 3))).toEqual([expect.objectContaining({ from: "question", to: "embedding" })]);
  expect(flowsAt(beatMiddle(diagram, 4))).toEqual([expect.objectContaining({ from: "embedding", to: "retriever", text: "问题向量" })]);
  expect(flowsAt(beatMiddle(diagram, 5))).toEqual([expect.objectContaining({ from: "retriever", to: "knowledge-index", direction: "forward" })]);
  expect(flowsAt(beatMiddle(diagram, 6))).toEqual([expect.objectContaining({ from: "retriever", to: "knowledge-index", direction: "reverse" })]);
  expect(flowsAt(beatMiddle(diagram, 7))).toEqual([
    expect.objectContaining({ from: "retriever", to: "reranker", text: "候选文本" }),
    expect.objectContaining({ from: "question", to: "reranker", text: "原始问题" })
  ]);
  expect(flowsAt(beatMiddle(diagram, 8))).toEqual([
    expect.objectContaining({ from: "question", to: "context", text: "原始问题" }),
    expect.objectContaining({ from: "reranker", to: "context", text: "C1 + C2" })
  ]);
  expect(flowsAt(beatMiddle(diagram, 9))).toEqual([expect.objectContaining({ from: "context", to: "language-model" })]);
  expect(flowsAt(beatMiddle(diagram, 10))).toEqual([expect.objectContaining({ from: "language-model", to: "answer", text: "答案 + 引用" })]);
});

it("keeps all eight stage boundaries readable with orthogonal rendering in both themes and reduced motion", () => {
  const { example, diagram } = getRagDiagram();
  expect(new Set(example.document.edges.map(({ route }) => route))).toEqual(new Set(["orthogonal"]));
  expect(example.document.nodes.every(({ style }) => style === undefined)).toBe(true);
  expect(example.document.edges.every(({ style }) => style === undefined)).toBe(true);
  expect(example.introduction).toMatch(/虚构.*不连接真实模型或数据库/);
  expect(example.introduction).toContain("可选重排");
  expect(example.introduction).toContain("不代表推荐参数");
  const scenes = ["parse", "ingest", "ask", "retrieve", "rerank", "context", "generate", "complete"];
  for (const sceneId of scenes) {
    const time = sceneStart(diagram, sceneId);
    expect(diagram.evaluateAt(time).sceneId).toBe(sceneId);
    if (time > 0) expect(diagram.evaluateAt(time - 1).sceneId).not.toBe(sceneId);
    for (const theme of ["light", "dark"] as const) {
      for (const sample of [time, time + 500]) {
        const frame = diagram.evaluateAt(sample, { theme });
        const reduced = diagram.evaluateAt(sample, { theme, reducedMotion: true });
        expect(frame.warnings).toEqual([]);
        expect(reduced.warnings).toEqual([]);
        expect(frame.edges.every(({ path }) => path.startsWith("M") && !path.includes("C"))).toBe(true);
        expect(reduced.caption).toBe(frame.caption);
        expect(reduced.edges.every(({ flow }) => flow === undefined)).toBe(true);
        expect(reduced.nodes.filter(({ highlighted }) => highlighted).map(({ id }) => id))
          .toEqual(frame.nodes.filter(({ highlighted }) => highlighted).map(({ id }) => id));
      }
    }
  }
  const final = diagram.evaluateAt(diagram.totalDuration);
  expect(final.sceneId).toBe("complete");
  expect(final.edges.every(({ flow }) => !flow)).toBe(true);
  expect(final.nodes.every(({ highlighted }) => !highlighted)).toBe(true);
  expect(final.caption).toContain("§4.1");
  expect(final.caption).toContain("§4.2");
});

it("routes the original question into reranking without crossing unrelated nodes", () => {
  const { diagram } = getRagDiagram();
  for (let time = sceneStart(diagram, "rerank"); time < sceneStart(diagram, "context"); time += 30) {
    const frame = diagram.evaluateAt(time);
    const edge = frame.edges.find(({ id }) => id === "rerank-question")!;
    const point = edge.flow!.point;
    for (const node of frame.nodes.filter(({ id }) => id !== edge.from && id !== edge.to)) {
      const inside = point.x > node.x && point.x < node.x + node.width
        && point.y > node.y && point.y < node.y + node.height;
      expect(inside, `Question path crosses ${node.id} at ${time} ms`).toBe(false);
    }
  }
});

it("keeps every transfer outside node interiors, including its own endpoints", () => {
  const { diagram } = getRagDiagram();
  for (let time = 0; time < diagram.totalDuration; time += 50) {
    const frame = diagram.evaluateAt(time);
    for (const edge of frame.edges.filter(({ flow }) => flow)) {
      const point = edge.flow!.point;
      for (const node of frame.nodes) {
        const inside = point.x > node.x + 2 && point.x < node.x + node.width - 2
          && point.y > node.y + 2 && point.y < node.y + node.height - 2;
        expect(inside, `${edge.id} enters ${node.id} at ${time} ms`).toBe(false);
      }
    }
  }
});
