import { expect, it } from "vitest";
import { createDiagram } from "flowsvg";
import { compileCatalog } from "../src/build.js";
import { catalogSource } from "../src/formal.js";

function getBasicShapes() {
  const { catalog, json } = compileCatalog(catalogSource);
  const example = catalog.get("basic-shapes");
  if (!example) throw new Error("The basic-shapes example is missing");
  return { catalog, json, example, diagram: createDiagram(example.document) };
}

it("is the first and default formal showcase example", () => {
  const { catalog, json, example } = getBasicShapes();
  expect(catalog.entries[0]?.id).toBe("basic-shapes");
  expect(catalog.defaultId).toBe("basic-shapes");
  expect(example.category).toBe("workflow");
  expect(example.name).toBe("Basic shapes: complete catalog");
  expect(JSON.parse(json.get(example.jsonPath)!)).toEqual(example.document);
});

it("contains every public node shape and a grouped flow", () => {
  const { example } = getBasicShapes();
  const kinds = new Set(example.document.nodes.map(({ kind }) => kind));
  expect(kinds).toEqual(new Set([
    "group", "ellipse", "parallelogram", "diamond", "roundedRect",
    "predefinedProcess", "rect", "document", "cylinder"
  ]));
  expect(example.document.nodes.filter(({ parentId }) => parentId === "shape-catalog")).toHaveLength(8);
  expect(example.document.edges).toHaveLength(8);
  expect(new Set(example.document.edges.map(({ route }) => route))).toEqual(new Set(["orthogonal"]));
});

it("keeps measured preset labels stable and plays every flow stage", () => {
  const { example, diagram } = getBasicShapes();
  expect(example.document.nodes.filter(({ kind }) => ["diamond", "document", "predefinedProcess", "parallelogram"].includes(kind))
    .every(({ height }) => height > 0)).toBe(true);
  expect(diagram.beats).toHaveLength(11);
  for (const time of [0, ...diagram.beats.map(({ startMs }) => startMs), diagram.totalDuration]) {
    for (const theme of ["light", "dark"] as const) {
      const frame = diagram.evaluateAt(time, { theme });
      expect(frame.warnings, `${theme} at ${time}`).toEqual([]);
      expect(frame.nodes).toHaveLength(example.document.nodes.length);
      expect(diagram.evaluateAt(time, { theme, reducedMotion: true }).edges.every(({ flow }) => flow === undefined)).toBe(true);
    }
  }
});

it("replaces all four preset labels during the final teaching beat", () => {
  const { diagram } = getBasicShapes();
  const beat = diagram.beats.at(-2)!;
  const frame = diagram.evaluateAt(beat.startMs);
  expect(frame.nodes.find(({ id }) => id === "input")?.label).toBe("Validated input");
  expect(frame.nodes.find(({ id }) => id === "decision")?.label).toBe("Continue processing?");
  expect(frame.nodes.find(({ id }) => id === "subprocess")?.label).toBe("Call verification");
  expect(frame.nodes.find(({ id }) => id === "document")?.label).toBe("Generated report");
});

it("keeps same-row connections horizontal throughout playback", () => {
  const { diagram } = getBasicShapes();
  const horizontalEdges = [
    "start-input", "input-decision", "decision-process", "process-subprocess",
    "record-document", "document-store"
  ];
  for (const time of [0, ...diagram.beats.map(({ startMs }) => startMs), diagram.totalDuration]) {
    const frame = diagram.evaluateAt(time);
    for (const id of horizontalEdges) {
      const edge = frame.edges.find((candidate) => candidate.id === id)!;
      const coordinates = /^M ([\d.]+) ([\d.]+) L ([\d.]+) ([\d.]+)$/.exec(edge.path);
      expect(coordinates, `${id} at ${time}: ${edge.path}`).not.toBeNull();
      expect(Number(coordinates![2])).toBe(Number(coordinates![4]));
      expect(Number(coordinates![3])).toBeGreaterThan(Number(coordinates![1]));
    }
  }
});

it("fits the group and viewport around the lowest nodes with 24-unit bottom insets", () => {
  const { diagram } = getBasicShapes();
  const times = [0, ...diagram.beats.flatMap(({ startMs, durationMs }) => [startMs, startMs + durationMs / 2]), diagram.totalDuration];
  for (const time of times) {
    const frame = diagram.evaluateAt(time);
    const group = frame.nodes.find(({ id }) => id === "shape-catalog")!;
    const contentBottom = Math.max(...frame.nodes.filter(({ parentId }) => parentId === group.id)
      .map(({ y, height }) => y + height));
    const groupBottom = group.y + group.height;
    expect(groupBottom - contentBottom, `group inset at ${time}`).toBe(24);
    expect(frame.camera.y + frame.camera.height - groupBottom, `viewport inset at ${time}`).toBe(24);
    expect(diagram.renderSvg(time)).toContain(`viewBox="0 0 ${frame.camera.width} ${frame.camera.height}"`);
  }
});
