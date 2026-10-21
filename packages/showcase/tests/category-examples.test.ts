import { expect, it } from "vitest";
import { createDiagram, type EvaluatedEdge } from "flowsvg";
import { compileCatalog } from "../src/build.js";
import { catalogSource } from "../src/formal.js";

const NEW_EXAMPLES = [
  ["job-lifecycle", "state", "orthogonal"],
  ["order-event-pipeline", "data-flow", "orthogonal"],
  ["web-service-deployment", "deployment", "orthogonal"],
  ["cache-aside-sequence", "sequence", "straight"]
] as const;

function getExample(id: string) {
  const { catalog } = compileCatalog(catalogSource);
  const example = catalog.get(id);
  if (!example) throw new Error(`Missing formal example: ${id}`);
  return { example, diagram: createDiagram(example.document) };
}

function expectOrthogonalEdges(edges: readonly EvaluatedEdge[]): void {
  const normals = { top: [0, -1], right: [1, 0], bottom: [0, 1], left: [-1, 0] } as const;
  for (const edge of edges) {
    expect(edge.path).not.toMatch(/[CQ]/);
    const values = edge.path.match(/-?\d+(?:\.\d+)?/g)!.map(Number);
    const points = Array.from({ length: values.length / 2 }, (_, index) => [values[index * 2]!, values[index * 2 + 1]!] as const);
    expect(points.every((point, index) => index === 0 || point[0] === points[index - 1]![0] || point[1] === points[index - 1]![1])).toBe(true);
    const end = points.at(-1)!;
    const before = points.at(-2)!;
    const normal = normals[edge.toPort!];
    expect((before[0] - end[0]) * normal[0] + (before[1] - end[1]) * normal[1]).toBeGreaterThanOrEqual(24);
  }
  const arrivals = edges.map((edge) => ({ edge, end: edge.path.match(/-?\d+(?:\.\d+)?/g)!.map(Number).slice(-2) }));
  for (const first of arrivals) for (const second of arrivals) {
    if (first.edge.id >= second.edge.id || first.edge.to !== second.edge.to || first.edge.toPort !== second.edge.toPort) continue;
    expect(Math.hypot(first.end[0]! - second.end[0]!, first.end[1]! - second.end[1]!)).toBeGreaterThanOrEqual(20);
  }
}

it.each(NEW_EXAMPLES)("offers %s with readable stable geometry and consistent routes", (id, category, route) => {
  const { example, diagram } = getExample(id);
  expect(example.category).toBe(category);
  expect(example.defaults).toEqual({ speed: 1, theme: "light", reducedMotion: false });
  expect(example.document.edges.every((edge) => edge.route === route)).toBe(true);
  const starts = example.document.scenes.flatMap(({ beats }) => beats).reduce<number[]>((times, { durationMs }) =>
    [...times, times.at(-1)! + durationMs], [0]);
  const initial = diagram.evaluateAt(0);
  if (route === "orthogonal") expectOrthogonalEdges(initial.edges);
  for (const time of starts) {
    for (const theme of ["light", "dark"] as const) {
      const frame = diagram.evaluateAt(time, { theme });
      const reduced = diagram.evaluateAt(time, { theme, reducedMotion: true });
      expect(frame.warnings).toEqual([]);
      expect(frame.nodes.map(({ x, y, width, height }) => [x, y, width, height]))
        .toEqual(initial.nodes.map(({ x, y, width, height }) => [x, y, width, height]));
      expect(reduced.caption).toBe(frame.caption);
      expect(reduced.edges.every(({ flow }) => !flow)).toBe(true);
    }
  }
});

it("keeps exactly one current task state and separates successful, exhausted and cancelled tasks", () => {
  const { example, diagram } = getExample("job-lifecycle");
  for (const [time, state, task] of [[0, "queued", "A"], [2000, "running", "A"], [4000, "retry", "A"],
    [6000, "running", "A"], [8000, "completed", "A"], [10_000, "running", "B"],
    [12_000, "failed", "B"], [14_000, "queued", "C"], [16_000, "cancelled", "C"]] as const) {
    const frame = diagram.evaluateAt(time);
    expect(frame.nodes.filter(({ highlighted }) => highlighted).map(({ id }) => id)).toEqual([state]);
    expect(frame.caption).toContain(`任务 ${task}`);
  }
  expect(example.document.edges.filter(({ from }) => ["completed", "failed", "cancelled"].includes(from))).toEqual([]);
  expect(diagram.evaluateAt(12_000).caption).toContain("上限");
});

it("conserves order events through deduplication, quarantine and aggregation", () => {
  const { diagram } = getExample("order-event-pipeline");
  const textAt = (time: number, id: string) => diagram.evaluateAt(time).nodes.find((node) => node.id === id)!
    .contentLayout!.lines.map(({ text }) => text).join(" ");
  expect(textAt(0, "events")).toContain("E1 / E2 / E1 / E3");
  expect(textAt(9000, "validation")).toContain("2 有效 · 1 重复 · 1 无效");
  expect(textAt(12_000, "details")).toContain("O101 ¥120 · O102 ¥80");
  expect(textAt(12_000, "quarantine")).toContain("E3 缺少金额");
  expect(textAt(18_000, "dashboard")).toContain("2 笔 · ¥200");
  expect(diagram.evaluateAt(18_000).caption).toContain("人民币");
});

it("expresses deployment boundaries, read-only replication and traffic after an unhealthy replica", () => {
  const { example, diagram } = getExample("web-service-deployment");
  const nodes = new Map(example.document.nodes.map((node) => [node.id, node]));
  expect(nodes.get("applications")?.parentId).toBe("private-network");
  expect(nodes.get("data")?.parentId).toBe("private-network");
  expect(nodes.get("app-a")?.parentId).toBe("applications");
  expect(nodes.get("app-b")?.parentId).toBe("applications");
  expect(nodes.get("replica")?.parentId).toBe("data");
  expect(example.document.edges.find(({ id }) => id === "replication")).toMatchObject({ from: "primary", to: "replica" });
  const final = diagram.evaluateAt(18_000);
  expect(final.caption).toContain("副本 B");
  expect(final.edges.filter(({ flow }) => flow).map(({ id }) => id)).toEqual(["route-b"]);
  expect(final.nodes.find(({ id }) => id === "app-a")!.contentLayout!.lines.map(({ text }) => text).join(" ")).toContain("不健康");
});

it("places cache-aside messages on increasing time rows and preserves response directions", () => {
  const { diagram } = getExample("cache-aside-sequence");
  const messages = ["request", "cache-get", "cache-miss", "database-get", "database-result", "cache-set", "response"];
  const rows = messages.map((id, index) => {
    const frame = diagram.evaluateAt(index * 2500 + 1250);
    const flows = frame.edges.filter(({ flow }) => flow);
    expect(flows.map((edge) => edge.id)).toEqual([id]);
    const edge = flows[0]!;
    const from = frame.nodes.find((node) => node.id === edge.from)!;
    const to = frame.nodes.find((node) => node.id === edge.to)!;
    expect(from.y).toBe(to.y);
    expect(to.x < from.x).toBe(["cache-miss", "database-result", "response"].includes(id));
    return from.y;
  });
  expect(rows.every((row, index) => index === 0 || row > rows[index - 1]!)).toBe(true);
  expect(diagram.evaluateAt(6250).caption).toContain("未命中");
  expect(diagram.evaluateAt(11_250).caption).toContain("存在记录");
});

it("separates the task error and retry event labels", () => {
  const { diagram } = getExample("job-lifecycle");
  const frame = diagram.evaluateAt(6000);
  const [error, retry] = ["temporary-error", "retry-timer"].map((id) => frame.edges.find((edge) => edge.id === id)!.labelBoxes[0]!);
  // Distinct rows keep both four-character labels readable at the same time.
  expect(Math.abs(error!.y - retry!.y)).toBeGreaterThanOrEqual(24);
});

it("keeps deployment transfers clear of component cards and the application header", () => {
  const { diagram } = getExample("web-service-deployment");
  for (let time = 0; time < diagram.totalDuration; time += 40) {
    const frame = diagram.evaluateAt(time);
    const header = frame.nodes.find(({ id }) => id === "applications")!.labelBoxes[0]!;
    for (const edge of frame.edges.filter(({ flow }) => flow)) {
      const point = edge.flow!.point;
      for (const node of frame.nodes.filter(({ kind }) => kind !== "group")) {
        const inside = point.x > node.x + 2 && point.x < node.x + node.width - 2
          && point.y > node.y + 2 && point.y < node.y + node.height - 2;
        expect(inside, `${edge.id} enters ${node.id} at ${time} ms`).toBe(false);
      }
      const crossesHeader = Math.abs(point.x - header.x) < 56 && point.y > header.y - 16 && point.y < header.y + 2;
      expect(crossesHeader, `${edge.id} enters the application header at ${time} ms`).toBe(false);
    }
  }
});

it("uses clear outer channels and centers state transitions between rows", () => {
  const deployment = getExample("web-service-deployment").diagram.evaluateAt(0);
  for (const id of ["route-a", "route-b", "health-a"]) {
    const edge = deployment.edges.find((edge) => edge.id === id)!;
    const values = edge.path.match(/-?\d+(?:\.\d+)?/g)!.map(Number);
    expect(values).toHaveLength(8);
    expect(values[2]).toBe(40);
    expect(values[4]).toBe(40);
  }
  const order = getExample("order-event-pipeline").diagram.evaluateAt(0);
  expect(order.edges.find(({ id }) => id === "invalid-record")!.path).toBe("M 904 96 L 928 96 L 928 484 L 904 484");
  const state = getExample("job-lifecycle").diagram.evaluateAt(0);
  const exhausted = state.edges.find(({ from, to }) => from === "running" && to === "failed")!;
  const values = exhausted.path.match(/-?\d+(?:\.\d+)?/g)!.map(Number);
  expect(values[3]).toBe(229);
  expect(values[5]).toBe(229);
});
