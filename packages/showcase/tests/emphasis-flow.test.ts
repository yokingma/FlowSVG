import { expect, it } from "vitest";
import { createDiagram } from "flowsvg";
import { compileCatalog } from "../src/build.js";
import { catalogSource } from "../src/formal.js";
import { sceneStart } from "./story-timing.js";

function getEmphasisExample() {
  const compiled = compileCatalog(catalogSource);
  const example = compiled.catalog.get("emphasis-flow");
  if (!example) throw new Error("The formal emphasis-flow example is missing");
  return { ...compiled, example, diagram: createDiagram(example.document) };
}

it("publishes a standalone emphasis comparison after the order data-flow story", () => {
  const { catalog, json, example } = getEmphasisExample();
  expect(catalog.groups.find(({ id }) => id === "data-flow")?.entries.map(({ id }) => id))
    .toEqual(["order-event-pipeline", "emphasis-flow"]);
  expect(catalog.defaultId).toBe("basic-shapes");
  expect(example.name).toBe("Emphasis colors and flow highlighting");
  const downloaded = JSON.parse(json.get(example.jsonPath)!);
  expect(downloaded).toEqual(example.document);
  expect(downloaded.emphasis).toEqual({ fill: "#ccfbf1", stroke: "#0f766e", markerText: "#ffffff" });
  expect(downloaded).not.toHaveProperty("category");
});

it.each(["light", "dark"] as const)("makes the three paint policies visibly different in %s mode", (theme) => {
  const { diagram } = getEmphasisExample();
  const time = sceneStart(diagram, "compare") + 1500;
  const frame = diagram.evaluateAt(time, { theme });
  expect(frame.edges.map(({ id, style, flow }) => [id, style.stroke, flow?.text])).toEqual([
    ["automatic", "#0f766e", "Payload"],
    ["preserve-edge", "#a855f7", "Payload"],
    ["marker-only", "#a855f7", "Payload"]
  ]);
  for (const id of ["automatic", "preserve-edge"]) {
    for (const side of ["sender", "receiver"]) {
      expect(frame.nodes.find((node) => node.id === `${id}-${side}`))
        .toMatchObject({ highlighted: true, style: { fill: "#ccfbf1", stroke: "#0f766e" } });
    }
  }
  expect(frame.nodes.filter(({ id }) => id.startsWith("marker-only")).every(({ highlighted }) => !highlighted)).toBe(true);
  const svg = diagram.renderSvg(time, { theme });
  expect(svg).toContain('fill="#0f766e"');
  expect(svg).toMatch(/<text[^>]*fill="#ffffff"[^>]*>Payload<\/text>/);
});

it("keeps all rows readable and stable through seeking, reduced motion and cleanup", () => {
  const { diagram } = getEmphasisExample();
  for (const theme of ["light", "dark"] as const) {
    const initial = diagram.evaluateAt(0, { theme });
    for (const time of [diagram.totalDuration, ...diagram.beats.flatMap(({ startMs, endMs }) => [startMs, (startMs + endMs) / 2])]) {
      const frame = diagram.evaluateAt(time, { theme });
      expect(frame.warnings).toEqual([]);
      expect(frame.nodes.map(({ x, y, width, height }) => [x, y, width, height]))
        .toEqual(initial.nodes.map(({ x, y, width, height }) => [x, y, width, height]));
    }
    const reduced = diagram.evaluateAt(sceneStart(diagram, "compare") + 1500, { theme, reducedMotion: true });
    expect(reduced.edges.map(({ style, flow }) => [style.stroke, flow])).toEqual([
      ["#0f766e", undefined], ["#a855f7", undefined], ["#a855f7", undefined]
    ]);
    expect(reduced.nodes.filter(({ id }) => id.startsWith("marker-only")).every(({ highlighted }) => !highlighted)).toBe(true);
    const final = diagram.evaluateAt(diagram.totalDuration, { theme });
    expect(final.nodes.map(({ style }) => style)).toEqual(initial.nodes.map(({ style }) => style));
    expect(final.edges.every(({ highlighted, flow }) => !highlighted && !flow)).toBe(true);
  }
});
