import { expect, it } from "vitest";
import { createDiagram } from "flowsvg";
import { compileCatalog } from "../src/build.js";
import { catalogSource } from "../src/formal.js";
import { beatMiddle, sceneStart } from "./story-timing.js";

function getArchitecture() {
  const compiled = compileCatalog(catalogSource);
  const example = compiled.catalog.get("project-architecture");
  if (!example) throw new Error("The formal project architecture example is missing");
  return { ...compiled, example, diagram: createDiagram(example.document) };
}

it("offers the architecture as a standalone third example with the original default", () => {
  const { catalog, json, example } = getArchitecture();
  expect(catalog.entries.map(({ id }) => id)).toEqual(["request-response", "rag-workflow", "project-architecture", "vllm-metal-stack", "job-lifecycle", "order-event-pipeline", "web-service-deployment", "cache-aside-sequence", "llm-inference"]);
  expect(catalog.defaultId).toBe("request-response");
  expect(example.name).toBe("FlowSVG: How diagrams run");
  expect(example.durationMs).toBe(createDiagram(example.document).totalDuration);
  expect(example.defaults).toEqual({ speed: 1, theme: "dark", reducedMotion: false });
  expect(JSON.parse(json.get(example.jsonPath)!)).toEqual(example.document);
});

it("explains the core, shared player, optional exports and private consumer boundary", () => {
  const { diagram } = getArchitecture();
  const textFor = (id: string) => diagram.evaluateAt(diagram.totalDuration).nodes.find((node) => node.id === id)!
    .contentLayout!.lines.map(({ text }) => text).join("");
  expect(textFor("document")).toContain("DiagramDocument");
  expect(textFor("core")).toContain("No DOM");
  expect(textFor("core")).toContain("browser clock");
  expect(textFor("adapters")).toContain("React · Vue · Web Component");
  expect(textFor("browser")).toContain("controls");
  expect(textFor("svg")).toContain("renderSvg(t)");
  expect(textFor("gif")).toContain("On demand");
  expect(textFor("gif")).toContain("Worker");
  expect(textFor("node-tools")).toContain("HTML");
  expect(textFor("node-tools")).toContain("Only GIF requires Chromium");
  expect(textFor("showcase")).toContain("Private consumer");
  expect(textFor("showcase")).toContain("SDK consumer");
  expect(diagram.evaluateAt(beatMiddle(diagram, 7)).caption).toContain("without launching Chromium");
  expect(diagram.evaluateAt(beatMiddle(diagram, 8)).caption).toContain("the same browser exporter");
  expect(diagram.evaluateAt(beatMiddle(diagram, 10)).caption).toContain("the SDK does not depend on them");
});

it("shows evaluation, playback, export and consumer calls in their actual directions", () => {
  const { diagram } = getArchitecture();
  const transfersAt = (time: number) => diagram.evaluateAt(time).edges.filter(({ flow }) => flow)
    .map(({ from, to }) => [from, to]);
  expect(transfersAt(beatMiddle(diagram, 0))).toEqual([["document", "core"]]);
  expect(transfersAt(beatMiddle(diagram, 1))).toEqual([["core", "svg"]]);
  expect(transfersAt(beatMiddle(diagram, 2))).toEqual([["adapters", "browser"]]);
  expect(transfersAt(beatMiddle(diagram, 3))).toEqual([["core", "browser"]]);
  expect(transfersAt(beatMiddle(diagram, 4))).toEqual([["browser", "core"]]);
  expect(transfersAt(beatMiddle(diagram, 5))).toEqual([["core", "browser"]]);
  expect(transfersAt(beatMiddle(diagram, 6))).toEqual([["svg", "gif"]]);
  expect(transfersAt(beatMiddle(diagram, 7))).toEqual([["browser", "node-tools"]]);
  expect(transfersAt(beatMiddle(diagram, 8))).toEqual([["node-tools", "gif"]]);
  expect(transfersAt(beatMiddle(diagram, 10))).toEqual([["showcase", "adapters"], ["showcase", "browser"]]);
});

it("keeps six stages readable in both themes and retains meaning with reduced motion", () => {
  const { example, diagram } = getArchitecture();
  expect(example.document.nodes).toHaveLength(8);
  expect(example.document.nodes.every(({ style }) => style === undefined)).toBe(true);
  expect(example.document.edges.every(({ style, route }) => style === undefined && route === "orthogonal")).toBe(true);
  const paths = diagram.evaluateAt(0).edges.map(({ path }) => path);
  expect(paths.some((path) => path.includes("Q"))).toBe(true);
  expect(paths.every((path) => !path.includes("C"))).toBe(true);
  const stages = ["define", "evaluate", "integrate", "operate", "export", "boundary"];
  for (const sceneId of stages) {
    const time = sceneStart(diagram, sceneId);
    expect(diagram.evaluateAt(time).sceneId).toBe(sceneId);
    if (time > 0) expect(diagram.evaluateAt(time - 1).sceneId).not.toBe(sceneId);
    for (const theme of ["light", "dark"] as const) {
      const frame = diagram.evaluateAt(time + 500, { theme });
      const reduced = diagram.evaluateAt(time + 500, { theme, reducedMotion: true });
      expect(frame.warnings).toEqual([]);
      expect(reduced.warnings).toEqual([]);
      expect(reduced.caption).toBe(frame.caption);
      expect(reduced.edges.every(({ flow }) => flow === undefined)).toBe(true);
      expect(reduced.nodes.filter(({ highlighted }) => highlighted).map(({ id }) => id))
        .toEqual(frame.nodes.filter(({ highlighted }) => highlighted).map(({ id }) => id));
      for (const node of frame.nodes) {
        expect(node.contentLayout!.lines.some(({ role }) => role === "title")).toBe(true);
        expect(node.contentLayout!.tags.length).toBeGreaterThan(0);
        expect(node.contentLayout!.tags.every(({ shape }) => shape === "pill")).toBe(true);
      }
    }
  }
});

it("keeps every active transfer inside the viewport and outside all node interiors", () => {
  const { diagram, example } = getArchitecture();
  for (let time = 0; time < diagram.totalDuration; time += 50) {
    const frame = diagram.evaluateAt(time);
    for (const edge of frame.edges.filter(({ flow }) => flow)) {
      const point = edge.flow!.point;
      expect(point.x).toBeGreaterThanOrEqual(0);
      expect(point.y).toBeGreaterThanOrEqual(0);
      expect(point.x).toBeLessThanOrEqual(example.document.viewport.width);
      expect(point.y).toBeLessThanOrEqual(example.document.viewport.height);
      for (const node of frame.nodes) {
        const inside = point.x > node.x + 2 && point.x < node.x + node.width - 2
          && point.y > node.y + 2 && point.y < node.y + node.height - 2;
        expect(inside, `${edge.id} enters ${node.id} at ${time} ms`).toBe(false);
      }
    }
  }
});
