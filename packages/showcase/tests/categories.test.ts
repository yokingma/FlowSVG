import { expect, it } from "vitest";
import { compileCatalog } from "../src/build.js";
import { catalogSource } from "../src/formal.js";

it("groups the eight formal examples by their primary purpose", () => {
  const { catalog, json } = compileCatalog(catalogSource);
  expect(catalog.groups?.map(({ id, label, entries }) => ({ id, label, ids: entries.map((entry) => entry.id) }))).toEqual([
    { id: "workflow", label: "业务流程", ids: ["request-response", "rag-workflow"] },
    { id: "architecture", label: "系统架构", ids: ["project-architecture", "vllm-metal-stack"] },
    { id: "state", label: "状态转换", ids: ["job-lifecycle"] },
    { id: "data-flow", label: "数据流", ids: ["order-event-pipeline"] },
    { id: "deployment", label: "部署拓扑", ids: ["web-service-deployment"] },
    { id: "sequence", label: "交互时序", ids: ["cache-aside-sequence"] }
  ]);
  expect(catalog.defaultId).toBe("request-response");
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
    ["deployment", "部署拓扑"], ["state", "状态转换"], ["data-flow", "数据流"],
    ["sequence", "交互时序"], ["architecture", "系统架构"], ["workflow", "业务流程"]
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
