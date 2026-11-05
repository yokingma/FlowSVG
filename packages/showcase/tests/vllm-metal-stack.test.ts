import { expect, it } from "vitest";
import { createDiagram } from "flowsvg";
import { compileCatalog } from "../src/build.js";
import { catalogSource } from "../src/formal.js";
import { beatMiddle, sceneStart } from "./story-timing.js";

function getMetalStack() {
  const compiled = compileCatalog(catalogSource);
  const example = compiled.catalog.get("vllm-metal-stack");
  if (!example) throw new Error("The formal vllm-metal stack example is missing");
  return { ...compiled, example, diagram: createDiagram(example.document) };
}

it("offers the layered stack as a fourth standalone example with the original default", () => {
  const { catalog, example, json } = getMetalStack();
  expect(catalog.entries.map(({ id }) => id)).toEqual([
    "request-response", "rag-workflow", "project-architecture", "vllm-metal-stack", "job-lifecycle", "order-event-pipeline", "web-service-deployment", "cache-aside-sequence", "llm-inference"
  ]);
  expect(catalog.defaultId).toBe("request-response");
  expect(example.name).toBe("vllm-metal: Layered inference architecture");
  expect(example.durationMs).toBe(createDiagram(example.document).totalDuration);
  expect(example.defaults).toEqual({ speed: 1, theme: "dark", reducedMotion: false });
  expect(JSON.parse(json.get(example.jsonPath)!)).toEqual(example.document);
  expect(example.introduction).toContain("official");
  expect(example.introduction).toContain("not a live inference run");
});

it("keeps 50-unit layer gaps and two real nested ownership panels inside the runner", () => {
  const { diagram } = getMetalStack();
  const frame = diagram.evaluateAt(0);
  const nodeById = new Map(frame.nodes.map((node) => [node.id, node]));
  const layers = ["clients", "upstream", "runner", "runtime"].map((id) => nodeById.get(id)!);
  for (let index = 1; index < layers.length; index += 1) {
    expect(layers[index]!.y - layers[index - 1]!.y - layers[index - 1]!.height).toBe(50);
  }
  for (const node of frame.nodes.filter(({ parentId }) => parentId)) {
    const parent = nodeById.get(node.parentId!)!;
    expect(parent.kind).toBe("group");
    expect(node.x).toBeGreaterThan(parent.x);
    expect(node.y).toBeGreaterThanOrEqual(parent.y + 44);
    expect(node.x + node.width).toBeLessThan(parent.x + parent.width);
    expect(node.y + node.height).toBeLessThan(parent.y + parent.height);
  }
  for (const id of ["mlx-primitives", "metal-owned"]) expect(nodeById.get(id)?.parentId).toBe("runner");
  for (const id of ["model-definitions", "weight-loading", "norm-linear", "mlp-moe"]) {
    expect(nodeById.get(id)?.parentId).toBe("mlx-primitives");
  }
  for (const id of ["paged-attention", "nax-prefill", "mtp"]) expect(nodeById.get(id)?.parentId).toBe("metal-owned");
});

it("preserves the reference responsibilities and states optional execution conditions", () => {
  const { diagram } = getMetalStack();
  const frame = diagram.evaluateAt(beatMiddle(diagram, 3));
  const textFor = (id: string) => frame.nodes.find((node) => node.id === id)!
    .contentLayout!.lines.map(({ text }) => text).join("");
  expect(textFor("api-server")).toContain("OpenAI API server");
  expect(textFor("block-manager")).toContain("prefix caching");
  expect(textFor("chunked-prefill")).toContain("continuous batching");
  expect(textFor("paged-attention")).toContain("q [total_q, H, D]");
  expect(textFor("paged-attention")).toContain("cu_seqlens");
  expect(textFor("nax-prefill")).toContain("Metal kernel");
  expect(textFor("mtp")).toContain("Runtime orchestration");
  expect(textFor("unified-memory")).toContain("paged KV");
  expect(diagram.evaluateAt(beatMiddle(diagram, 1)).caption).toContain("KV block IDs");
  expect(diagram.evaluateAt(beatMiddle(diagram, 2)).caption).toContain("builds cu_seqlens");
  expect(diagram.evaluateAt(beatMiddle(diagram, 4)).caption).toContain("M5");
  expect(diagram.evaluateAt(beatMiddle(diagram, 4)).caption).toContain("configuration");
  expect(diagram.evaluateAt(beatMiddle(diagram, 4)).caption).toContain("not used on every request");
  expect(diagram.evaluateAt(beatMiddle(diagram, 7)).caption).toContain("Reference");
});

it("connects evaluated layer boundaries with correctly directed curved transfers", () => {
  const { diagram } = getMetalStack();
  for (const [index, from, to] of [[0, "clients", "upstream"], [1, "upstream", "runner"], [5, "runner", "runtime"]] as const) {
    const frame = diagram.evaluateAt(diagram.beats[index]!.startMs + 200);
    const transfers = frame.edges.filter(({ flow }) => flow);
    expect(transfers).toHaveLength(1);
    const edge = transfers[0]!;
    expect([edge.from, edge.to, edge.flow!.direction]).toEqual([from, to, "forward"]);
    const source = frame.nodes.find(({ id }) => id === from)!;
    const target = frame.nodes.find(({ id }) => id === to)!;
    const numbers = edge.path.match(/-?\d+(?:\.\d+)?/g)!.map(Number);
    expect(edge.path).toContain("C");
    expect(numbers[1]).toBe(source.y + source.height);
    expect(numbers.at(-1)).toBe(target.y);
    expect(edge.flow!.point.y).toBeGreaterThan(source.y + source.height);
    expect(edge.flow!.point.y).toBeLessThan(target.y);
  }
});

it("keeps all six scenes readable and themed with reduced-motion meaning intact", () => {
  const { diagram, example } = getMetalStack();
  expect(example.document.nodes.every(({ style }) => style === undefined)).toBe(true);
  expect(example.document.edges.every(({ route, style }) => route === "curved" && style === undefined)).toBe(true);
  const stages = ["request", "schedule", "runner", "attention", "runtime", "overview"];
  for (const sceneId of stages) {
    const time = sceneStart(diagram, sceneId);
    expect(diagram.evaluateAt(time).sceneId).toBe(sceneId);
    if (time > 0) expect(diagram.evaluateAt(time - 1).sceneId).not.toBe(sceneId);
    for (const theme of ["light", "dark"] as const) {
      for (const sample of [time, time + 500]) {
        const frame = diagram.evaluateAt(sample, { theme });
        const reduced = diagram.evaluateAt(sample, { theme, reducedMotion: true });
        expect(frame.warnings).toEqual([]);
        expect(reduced.warnings).toEqual([]);
        expect(reduced.caption).toBe(frame.caption);
        expect(reduced.edges.every(({ flow }) => flow === undefined)).toBe(true);
        expect(reduced.nodes.filter(({ highlighted }) => highlighted).map(({ id }) => id))
          .toEqual(frame.nodes.filter(({ highlighted }) => highlighted).map(({ id }) => id));
        for (const node of frame.nodes.filter(({ kind }) => kind !== "group")) {
          expect(node.contentLayout!.lines.some(({ role }) => role === "title")).toBe(true);
          expect(node.contentLayout!.tags.length).toBeGreaterThan(0);
          expect(node.contentLayout!.tags.every(({ shape }) => shape === "pill")).toBe(true);
        }
      }
    }
  }
  expect(diagram.evaluateAt(diagram.totalDuration).nodes.every(({ highlighted }) => !highlighted)).toBe(true);
});

it("keeps layer transfers inside the viewport and outside every module interior", () => {
  const { diagram, example } = getMetalStack();
  for (let time = 0; time < diagram.totalDuration; time += 50) {
    const frame = diagram.evaluateAt(time);
    for (const edge of frame.edges.filter(({ flow }) => flow)) {
      const point = edge.flow!.point;
      expect(point.x).toBeGreaterThanOrEqual(0);
      expect(point.x).toBeLessThanOrEqual(example.document.viewport.width);
      expect(point.y).toBeGreaterThanOrEqual(0);
      expect(point.y).toBeLessThanOrEqual(example.document.viewport.height);
      for (const node of frame.nodes) {
        const inside = point.x > node.x + 2 && point.x < node.x + node.width - 2
          && point.y > node.y + 2 && point.y < node.y + node.height - 2;
        expect(inside, `${edge.id} enters ${node.id} at ${time} ms`).toBe(false);
      }
    }
  }
});
