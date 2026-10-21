import { expect, it } from "vitest";
import { compileCatalog } from "../src/build.js";

const animated = {
  version: 1, title: "Acceptance motion", viewport: { width: 400, height: 200 },
  nodes: [{ id: "a", kind: "rect", x: 20, y: 20, width: 80, height: 60 }], edges: [],
  scenes: [{ id: "s", label: "Movement", beats: [{ durationMs: 1200, actions: [] }, { durationMs: 800, actions: [] }] }]
};
const source = {
  definitions: [
    { id: "motion", name: "Motion", category: "data-flow", introduction: "Two beats", document: animated, defaults: { speed: 1.5, theme: "dark", reducedMotion: false } },
    { id: "static", name: "Static", category: "data-flow", introduction: "A complete variant", document: { ...animated, title: "Still", scenes: [] }, defaults: { speed: 0.5, theme: "light", reducedMotion: true } }
  ],
  order: ["static", "motion"], defaultId: "motion"
};

it("consumes an ordered catalog with complete defaults and lossless standalone diagrams", () => {
  const result = compileCatalog(source);
  expect(result.catalog.entries.map(({ id }) => id)).toEqual(["static", "motion"]);
  expect(result.catalog.defaultId).toBe("motion");
  expect(result.catalog.get("motion")).toMatchObject({ durationMs: 2000, defaults: { speed: 1.5, theme: "dark", reducedMotion: false } });
  expect(result.catalog.get("static")?.durationMs).toBe(0);
  expect(result.catalog.get("unknown")).toBeUndefined();
  expect(JSON.parse(result.json.get("json/motion.json")!)).toEqual(animated);
  expect(JSON.parse(result.json.get("json/static.json")!)).toEqual({ ...animated, title: "Still", scenes: [] });
  expect(Object.isFrozen(result.catalog.entries)).toBe(true);
  expect(Object.isFrozen(result.catalog.get("motion")?.document.nodes)).toBe(true);
});

it("builds a formal empty catalog without inventing a default or JSON", () => {
  const result = compileCatalog({ definitions: [], order: [], defaultId: null });
  expect(result.catalog.entries).toEqual([]);
  expect(result.catalog.defaultId).toBeNull();
  expect(result.json.size).toBe(0);
});

it.each([
  ["duplicate definition", { ...source, definitions: [source.definitions[0], source.definitions[0]] }, /definitions\[1\]\.id.*duplicate/],
  ["duplicate order", { ...source, order: ["motion", "motion"] }, /order\[1\].*duplicate/],
  ["missing definition", { ...source, order: ["missing"] }, /order\[0\].*missing/],
  ["unlisted definition", { ...source, order: ["motion"] }, /order.*static/],
  ["missing default", { ...source, defaultId: "missing" }, /defaultId/],
  ["null nonempty default", { ...source, defaultId: null }, /defaultId/],
  ["invented empty default", { definitions: [], order: [], defaultId: "motion" }, /defaultId/],
  ["unsafe ID", { ...source, definitions: [{ ...source.definitions[0], id: "../outside" }] }, /definitions\[0\]\.id/],
  ["zero speed", { ...source, definitions: [{ ...source.definitions[0], defaults: { speed: 0, theme: "dark", reducedMotion: false } }] }, /defaults.speed/],
  ["nonfinite speed", { ...source, definitions: [{ ...source.definitions[0], defaults: { speed: Infinity, theme: "dark", reducedMotion: false } }] }, /defaults.speed/],
  ["invalid theme", { ...source, definitions: [{ ...source.definitions[0], defaults: { speed: 1, theme: "auto", reducedMotion: false } }] }, /defaults.theme/],
  ["missing motion default", { ...source, definitions: [{ ...source.definitions[0], defaults: { speed: 1, theme: "dark" } }] }, /defaults.reducedMotion/]
])("rejects %s with author location", (_name, input, message) => {
  expect(() => compileCatalog(input)).toThrow(message);
});

it.each([
  ["undefined", { ...animated, title: undefined }, /document.title.*JSON/],
  ["function", { ...animated, title: () => "Lost" }, /document.title.*JSON/],
  ["nonfinite number", { ...animated, viewport: { width: NaN, height: 200 } }, /document.viewport.width.*JSON/],
  ["sparse array", { ...animated, nodes: Array(1) }, /document.nodes\[0\].*JSON/],
  ["custom object", { ...animated, title: new Date() }, /document.title.*JSON/],
  ["SDK document error", { ...animated, nodes: [{ ...animated.nodes[0], width: -1 }] }, /motion.*nodes\[0\].width/]
])("rejects %s before publishing JSON", (_name, document, message) => {
  const definition = { ...source.definitions[0], document };
  expect(() => compileCatalog({ definitions: [definition], order: ["motion"], defaultId: "motion" })).toThrow(message);
});

it("rejects circular author data before SDK compilation", () => {
  const document = { ...animated, recursive: {} };
  document.recursive = document;
  expect(() => compileCatalog({ ...source, definitions: [{ ...source.definitions[0], document }, source.definitions[1]] })).toThrow(/document.recursive.*JSON/);
});

it("rejects numeric array properties omitted by JSON.stringify", () => {
  const nodes = [...animated.nodes];
  Object.defineProperty(nodes, "4294967295", { value: animated.nodes[0], enumerable: true });
  const document = { ...animated, nodes };
  expect(() => compileCatalog({ definitions: [{ ...source.definitions[0], document }], order: ["motion"], defaultId: "motion" })).toThrow(/document.nodes\[4294967295\].*JSON/);
});

it("rejects custom array prototypes before inherited JSON conversion can change data", () => {
  const nodes = Object.setPrototypeOf([...animated.nodes], { toJSON: () => [] });
  const document = { ...animated, nodes };
  expect(() => compileCatalog({ definitions: [{ ...source.definitions[0], document }], order: ["motion"], defaultId: "motion" })).toThrow(/document.nodes.*JSON/);
});
