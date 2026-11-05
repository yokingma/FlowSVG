import { expect, it } from "vitest";
import { createDiagram } from "flowsvg";
import { compileCatalog } from "../src/build.js";
import { catalogSource } from "../src/formal.js";

function getRequestResponse() {
  const compiled = compileCatalog(catalogSource);
  const example = compiled.catalog.get("request-response");
  if (!example) throw new Error("The formal request-response example is missing");
  return { ...compiled, example };
}

it("publishes English formal navigation, story text and standalone downloads", () => {
  const { catalog, json } = compileCatalog(catalogSource);
  for (const group of catalog.groups) {
    expect(group.label).not.toMatch(/\p{Script=Han}/u);
  }
  for (const example of catalog.entries) {
    expect(`${example.name}\n${example.introduction}`, example.id).not.toMatch(/\p{Script=Han}/u);
    expect(json.get(example.jsonPath), `${example.id} download`).not.toMatch(/\p{Script=Han}/u);
  }
});

it("opens the selected formal story with SDK defaults and downloadable standalone data", () => {
  const { catalog, json, example } = getRequestResponse();
  expect(catalog.entries.map(({ id }) => id)).toEqual(["request-response", "rag-workflow", "project-architecture", "vllm-metal-stack", "job-lifecycle", "order-event-pipeline", "web-service-deployment", "cache-aside-sequence", "llm-inference"]);
  expect(catalog.defaultId).toBe("request-response");
  expect(example.name).toBe("Request and response");
  expect(example.introduction).toContain("parallel");
  expect(example.defaults).toEqual({ speed: 1, theme: "dark", reducedMotion: false });
  expect(JSON.parse(json.get(example.jsonPath)!)).toEqual(example.document);
  expect(example.durationMs).toBe(10_000);
});

it("uses one curved route family and the SDK palette throughout the story", () => {
  const { example } = getRequestResponse();
  const { document } = example;
  expect(document.edges.length).toBeGreaterThan(0);
  expect(new Set(document.edges.map(({ route }) => route))).toEqual(new Set(["curved"]));
  expect(document.nodes.every(({ style }) => style === undefined)).toBe(true);
  expect(document.edges.every(({ style }) => style === undefined)).toBe(true);
  const diagram = createDiagram(document);
  const initial = diagram.evaluateAt(0);
  for (const theme of ["light", "dark"] as const) {
    for (const time of [0, 1500, 2999, 3000, 4500, 5999, 6000, 7500, 8999, 9000, 10_000]) {
      const frame = diagram.evaluateAt(time, { theme });
      expect(frame.warnings).toEqual([]);
      expect(frame.camera).toEqual(initial.camera);
      expect(frame.nodes).toEqual(expect.arrayContaining(document.nodes.map(({ id, x, y, width, height }) =>
        expect.objectContaining({ id, x, y, width, height }))));
      expect(frame.edges.every(({ path }) => path.includes("C"))).toBe(true);
    }
  }
});

it("shows parallel checks, order processing and reverse responses before clearing highlights", () => {
  const { example } = getRequestResponse();
  const diagram = createDiagram(example.document);
  const flowsAt = (time: number) => diagram.evaluateAt(time).edges.flatMap(({ flow }) => flow ? [flow] : []);
  expect(flowsAt(1500).map(({ direction, text }) => ({ direction, text }))).toEqual([
    { direction: "forward", text: undefined },
    { direction: "forward", text: "Token" },
    { direction: "reverse", text: "Preflight" }
  ]);
  expect(flowsAt(3000)).toHaveLength(2);
  expect(flowsAt(4500).map(({ text }) => text)).toEqual(["Create order", undefined]);
  expect(flowsAt(7500).map(({ text }) => text)).toEqual(["Order ID", "201 Created"]);
  expect(diagram.evaluateAt(7500).nodes.some(({ highlighted }) => highlighted)).toBe(true);
  const reduced = diagram.evaluateAt(1500, { reducedMotion: true });
  expect(reduced.edges.every(({ flow }) => flow === undefined)).toBe(true);
  expect(reduced.nodes.filter(({ highlighted }) => highlighted).map(({ id }) => id))
    .toEqual(diagram.evaluateAt(1500).nodes.filter(({ highlighted }) => highlighted).map(({ id }) => id));
  for (const time of [9000, diagram.totalDuration]) {
    expect(flowsAt(time)).toEqual([]);
    expect(diagram.evaluateAt(time).nodes.every(({ highlighted }) => !highlighted)).toBe(true);
  }
});

it("keeps request and response curves in separate lanes between gateway and order service", () => {
  const { example } = getRequestResponse();
  const diagram = createDiagram(example.document);
  const gateway = example.document.nodes.find(({ id }) => id === "gateway")!;
  const centerY = gateway.y + gateway.height / 2;
  for (const elapsed of [150, 450, 750, 1500, 2250, 2550, 2850]) {
    const request = diagram.evaluateAt(3000 + elapsed).edges.find(({ id }) => id === "gateway-service");
    const response = diagram.evaluateAt(6000 + elapsed).edges.find(({ id }) => id === "service-gateway");
    expect(request?.flow?.point.y).toBeGreaterThan(centerY);
    expect(response?.flow?.point.y).toBeLessThan(centerY);
  }
});

it("keeps compact request transfers outside their source, target and other node interiors", () => {
  const { example } = getRequestResponse();
  const diagram = createDiagram(example.document);
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


it("offers a standalone RAG story with SDK-compiled timing after the default request-response example", () => {
  const { catalog, json } = compileCatalog(catalogSource);
  const example = catalog.get("rag-workflow");
  expect(example, "RAG must be a selectable formal example").toBeDefined();
  expect(example?.name).toBe("RAG: From sources to answers");
  expect(example?.durationMs).toBeCloseTo(22_543.151, 3);
  expect(example?.defaults).toEqual({ speed: 1, theme: "dark", reducedMotion: false });
  expect(JSON.parse(json.get(example!.jsonPath)!)).toEqual(example?.document);
  expect(example?.document.scenes.map(({ label }) => label)).toEqual([
    "Parse and split", "Embed and index", "Submit a question", "Retrieve candidate chunks",
    "Rerank and filter", "Assemble context", "Generate a cited answer", "Complete"
  ]);
});

it("holds every formal single-flow transfer for exactly 500 ms before its compiled boundary", () => {
  const { catalog } = compileCatalog(catalogSource);
  for (const example of catalog.entries) {
    const diagram = createDiagram(example.document);
    const authored = example.document.scenes.flatMap(({ beats }) => beats);
    diagram.beats.forEach((beat, index) => {
      const flows = authored[index]!.actions.filter((action) => action.type === "flow");
      if (flows.length !== 1) return;
      const edgeId = flows[0]!.target;
      const markerAt = (time: number) => diagram.evaluateAt(time).edges.find(({ id }) => id === edgeId)!.flow!;
      expect(markerAt(beat.endMs - 501).progress, `${example.id}/${beat.beatId}`).toBeLessThan(1);
      expect(markerAt(beat.endMs - 500).progress).toBeCloseTo(1);
      expect(markerAt(beat.endMs - 1).point).toEqual(markerAt(beat.endMs - 499).point);
      expect(diagram.evaluateAt(beat.endMs - 1, { reducedMotion: true }).beatId).toBe(beat.beatId);
    });
  }
});
