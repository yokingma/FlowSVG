import { expect, it } from "vitest";
import { compileCatalog } from "../src/build.js";
import { catalogSource } from "../src/formal.js";

it("groups the formal examples by their primary purpose", () => {
  const { catalog, json } = compileCatalog(catalogSource);
  expect(catalog.groups?.map(({ id, label, entries }) => ({ id, label, ids: entries.map((entry) => entry.id) }))).toEqual([
    { id: "workflow", label: "Workflow", ids: ["basic-shapes", "request-response", "rag-workflow", "llm-inference"] },
    { id: "architecture", label: "Architecture", ids: ["project-architecture", "vllm-metal-stack"] },
    { id: "state", label: "State transitions", ids: ["job-lifecycle"] },
    { id: "data-flow", label: "Data flow", ids: ["order-event-pipeline"] },
    { id: "deployment", label: "Deployment", ids: ["web-service-deployment"] },
    { id: "sequence", label: "Sequence", ids: ["cache-aside-sequence"] }
  ]);
  expect(catalog.defaultId).toBe("basic-shapes");
  for (const entry of catalog.entries) {
    expect(entry.category).toBe(catalog.groups!.find((group) => group.entries.some(({ id }) => id === entry.id))!.id);
    expect(JSON.parse(json.get(entry.jsonPath)!)).not.toHaveProperty("category");
  }
});

it("supports six broad categories in first-appearance order and keeps each group's author order", () => {
  const template = catalogSource.definitions[0]!;
  const categories = ["deployment", "state", "data-flow", "sequence", "architecture", "workflow"];
  const definitions = categories.map((category) => ({ ...template, id: category, category }));
  const repeat = { ...template, id: "second-deployment", category: "deployment" };
  const order = [...categories, repeat.id];
  const { catalog } = compileCatalog({ definitions: [...definitions, repeat], order, defaultId: "sequence" });
  expect(catalog.groups?.map(({ id, label }) => [id, label])).toEqual([
    ["deployment", "Deployment"], ["state", "State transitions"], ["data-flow", "Data flow"],
    ["sequence", "Sequence"], ["architecture", "Architecture"], ["workflow", "Workflow"]
  ]);
  expect(catalog.groups?.[0]?.entries.map(({ id }) => id)).toEqual(["deployment", "second-deployment"]);
  expect(catalog.entries.map(({ id }) => id)).toEqual(order);
  expect(catalog.defaultId).toBe("sequence");
  expect(Object.isFrozen(catalog.groups)).toBe(true);
  expect(Object.isFrozen(catalog.groups?.[0]?.entries)).toBe(true);
});

it("does not invent groups for an empty catalog", () => {
  expect(compileCatalog({ definitions: [], order: [], defaultId: null }).catalog.groups).toEqual([]);
});

it.each([undefined, "", "unknown", "toString", 1, null])("rejects invalid or missing category %j with author location", (category) => {
  const definition = { ...catalogSource.definitions[0], category };
  expect(() => compileCatalog({ definitions: [definition], order: [definition.id], defaultId: definition.id }))
    .toThrow(/definitions\[0\]\.category/);
});
