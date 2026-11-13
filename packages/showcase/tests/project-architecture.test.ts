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

it("publishes the SDK architecture with the stable address and original catalog default", () => {
  const { catalog, json, example, diagram } = getArchitecture();
  expect(catalog.entries.map(({ id }) => id)).toEqual(["basic-shapes", "request-response", "rag-workflow", "project-architecture", "vllm-metal-stack", "job-lifecycle", "order-event-pipeline", "web-service-deployment", "cache-aside-sequence", "llm-inference"]);
  expect(catalog.defaultId).toBe("basic-shapes");
  expect(example.name).toBe("FlowSVG: SDK architecture");
  expect(example.durationMs).toBe(diagram.totalDuration);
  expect(example.defaults).toEqual({ speed: 1, theme: "dark", reducedMotion: false });
  expect(JSON.parse(json.get(example.jsonPath)!)).toEqual(example.document);
});

it("shows real SDK layers and keeps the showcase consumer outside the SDK boundary", () => {
  const { diagram } = getArchitecture();
  const frame = diagram.evaluateAt(0);
  const nodes = new Map(frame.nodes.map((node) => [node.id, node]));
  expect(nodes.get("sdk")?.kind).toBe("group");
  for (const id of ["browser-layer", "node-layer", "core-layer"]) {
    expect(nodes.get(id)).toMatchObject({ kind: "group", parentId: "sdk" });
  }
  for (const [id, parentId] of [["adapters", "browser-layer"], ["browser", "browser-layer"], ["node-tools", "node-layer"], ["core-validation", "core-layer"], ["core-timeline", "core-layer"], ["core-geometry", "core-layer"], ["core-svg", "core-layer"], ["native-app", "showcase"], ["react-app", "showcase"], ["vue-app", "showcase"]]) {
    expect(nodes.get(id)?.parentId).toBe(parentId);
  }
  for (const node of frame.nodes.filter(({ parentId }) => parentId)) {
    const parent = nodes.get(node.parentId!)!;
    expect(node.x).toBeGreaterThan(parent.x);
    expect(node.y).toBeGreaterThanOrEqual(parent.y + 40);
    expect(node.x + node.width).toBeLessThan(parent.x + parent.width);
    expect(node.y + node.height).toBeLessThan(parent.y + parent.height);
  }
  const sdk = nodes.get("sdk")!;
  const showcase = nodes.get("showcase")!;
  expect(showcase.parentId).toBeUndefined();
  expect(showcase.y + showcase.height).toBeLessThan(sdk.y);
  expect(nodes.get("core-layer")!.y).toBeGreaterThan(nodes.get("browser-layer")!.y + nodes.get("browser-layer")!.height);
  expect(nodes.get("core-layer")!.y).toBeGreaterThan(nodes.get("node-layer")!.y + nodes.get("node-layer")!.height);
});

it("details core responsibilities and individual apps as sibling cards instead of workflow stages", () => {
  const { diagram } = getArchitecture();
  const frame = diagram.evaluateAt(0);
  const core = frame.nodes.filter(({ parentId }) => parentId === "core-layer");
  const apps = frame.nodes.filter(({ parentId }) => parentId === "showcase");
  expect(core.map(({ id }) => id)).toEqual(["core-validation", "core-timeline", "core-geometry", "core-svg"]);
  expect(apps.map(({ id }) => id)).toEqual(["native-app", "react-app", "vue-app"]);
  for (const row of [core, apps]) {
    for (const [index, node] of row.entries()) {
      expect(node.kind).toBe("roundedRect");
      expect(node.contentLayout?.lines.some(({ role }) => role === "title")).toBe(true);
      expect(node.y).toBe(row[0]!.y);
      if (index > 0) expect(node.x).toBeGreaterThan(row[index - 1]!.x + row[index - 1]!.width);
      expect(frame.edges.some(({ from, to }) => from === node.id || to === node.id)).toBe(false);
    }
  }
  const textFor = (id: string) => frame.nodes.find((node) => node.id === id)!
    .contentLayout!.lines.map(({ text }) => text).join(" ");
  expect(textFor("core-validation")).toContain("Schema + references");
  expect(textFor("core-timeline")).toContain("Beats + actions");
  expect(textFor("core-timeline")).toContain("Scenes → frame state");
  expect(textFor("core-geometry")).toContain("Layout · routes · hits");
  expect(textFor("core-svg")).toContain("SVG at any time");
  for (const [id, entry] of [["native-app", "flowsvg/browser"], ["react-app", "flowsvg/react"], ["vue-app", "flowsvg/vue"]]) {
    expect(textFor(id!)).toContain(entry);
  }
});

it("labels persistent dependencies from consumers to providers without output pipeline nodes", () => {
  const { diagram } = getArchitecture();
  const frame = diagram.evaluateAt(0);
  expect(frame.edges.map(({ from, to, label }) => [from, to, label])).toEqual([
    ["showcase", "sdk", "Public SDK"],
    ["adapters", "browser", "Wraps"],
    ["browser", "core-layer", undefined],
    ["node-tools", "core-layer", undefined],
    ["node-layer", "browser-layer", "PNG/GIF"]
  ]);
  expect(frame.nodes.some(({ id }) => id === "svg" || id === "gif" || id === "document")).toBe(false);
  for (const edge of frame.edges) expect(edge.labelLines).toEqual(edge.label ? [edge.label] : []);
});

it("anchors core dependencies at the actual module cards and the shared core boundary", () => {
  const { diagram } = getArchitecture();
  const frame = diagram.evaluateAt(0);
  const core = frame.nodes.find(({ id }) => id === "core-layer")!;
  for (const [edgeId, sourceId] of [["browser-core", "browser"], ["node-core", "node-tools"]]) {
    const edge = frame.edges.find(({ id }) => id === edgeId)!;
    const source = frame.nodes.find(({ id }) => id === sourceId)!;
    const coordinates = edge.path.match(/-?\d+(?:\.\d+)?/g)!.map(Number);
    expect([edge.from, edge.to]).toEqual([sourceId, core.id]);
    expect(coordinates.slice(0, 2)).toEqual([source.x + source.width / 2, source.y + source.height]);
    expect(coordinates.at(-1)).toBe(core.y);
  }
});

it("explains environment constraints and the optional browser exporter", () => {
  const { diagram } = getArchitecture();
  const textFor = (id: string) => diagram.evaluateAt(0).nodes.find((node) => node.id === id)!
    .contentLayout!.lines.map(({ text }) => text).join("");
  expect(textFor("core-validation")).toContain("DiagramDocument");
  expect(textFor("core-svg")).toContain("SVG");
  expect(textFor("adapters")).toContain("Web Component");
  expect(textFor("browser")).toContain("controls");
  expect(textFor("node-tools")).toContain("HTML");
  expect(diagram.evaluateAt(0).nodes.find(({ id }) => id === "showcase")?.label).toContain("private consumers");
  expect(diagram.evaluateAt(beatMiddle(diagram, 1)).caption).toContain("no DOM, network or browser clock");
  expect(diagram.evaluateAt(beatMiddle(diagram, 2)).caption).toContain("does not load the GIF encoder");
  expect(diagram.evaluateAt(beatMiddle(diagram, 3)).caption).toContain("without launching Chromium");
  expect(diagram.evaluateAt(beatMiddle(diagram, 3)).caption).toContain("the same browser exporter");
  expect(diagram.evaluateAt(beatMiddle(diagram, 4)).caption).toContain("the SDK does not depend on them");
});

it("guides attention across stable visible layers, including backward seeks and reduced motion", () => {
  const { example, diagram } = getArchitecture();
  expect(example.document.nodes.every(({ style }) => style === undefined)).toBe(true);
  expect(example.document.edges.every(({ style, route }) => style === undefined && route === "orthogonal")).toBe(true);
  const initial = diagram.evaluateAt(0);
  const geometry = (frame: typeof initial) => frame.nodes.map(({ id, x, y, width, height, visible }) => [id, x, y, width, height, visible]);
  const stages = ["overview", "core", "browser", "node", "boundary", "summary"];
  for (const sceneId of [...stages, ...[...stages].reverse()]) {
    const time = sceneStart(diagram, sceneId);
    expect(diagram.evaluateAt(time).sceneId).toBe(sceneId);
    if (time > 0) expect(diagram.evaluateAt(time - 1).sceneId).not.toBe(sceneId);
    for (const theme of ["light", "dark"] as const) {
      for (const reducedMotion of [false, true]) {
        const frame = diagram.evaluateAt(time + 500, { theme, reducedMotion });
        expect(frame.warnings).toEqual([]);
        expect(frame.nodes.every(({ visible }) => visible)).toBe(true);
        expect(geometry(frame)).toEqual(geometry(initial));
        expect(frame.edges.map(({ path, visible }) => [path, visible])).toEqual(initial.edges.map(({ path, visible }) => [path, visible]));
        expect(frame.edges.every(({ flow }) => flow === undefined)).toBe(true);
        const highlighted = frame.nodes.filter(({ highlighted }) => highlighted).map(({ id }) => id);
        expect(highlighted).toEqual(sceneId === "core" ? ["core-layer", "core-validation", "core-timeline", "core-geometry", "core-svg"]
          : sceneId === "browser" ? ["browser-layer", "adapters", "browser"]
          : sceneId === "node" ? ["node-layer", "node-tools"]
          : sceneId === "boundary" ? ["showcase", "native-app", "react-app", "vue-app"] : []);
      }
    }
  }
  expect(diagram.evaluateAt(diagram.totalDuration).nodes.every(({ highlighted }) => !highlighted)).toBe(true);
});
