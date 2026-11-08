import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { createDiagram, measureNodeLabel, validateDocument, type DiagramDocument } from "../../src/index.js";

it("ships a measured mixed flow with stable label versions and intentional overflow", () => {
  const model: DiagramDocument = JSON.parse(readFileSync(new URL("../../examples/mixed-flow.json", import.meta.url), "utf8"));
  expect(validateDocument(model)).toEqual([]);
  const diagram = createDiagram(model);
  expect(new Set(model.nodes.map(({ kind }) => kind))).toEqual(new Set(["group", "rect", "diamond", "parallelogram", "document", "predefinedProcess"]));
  for (const [id, versions] of [["decision", ["Policy passed?", "Is the request approved?"]], ["input", ["Read request", "Read validated request"]], ["report", ["Approval report", "Signed approval report"]], ["call", ["Verify identity", "Call identity verification"]]] as const) {
    const node = model.nodes.find((node) => node.id === id)!;
    if (node.kind !== "diamond" && node.kind !== "parallelogram" && node.kind !== "document" && node.kind !== "predefinedProcess") throw new Error("Expected label shape");
    expect(node.height).toBe(measureNodeLabel({ kind: node.kind, width: node.width, label: versions }).height);
  }
  expect(diagram.evaluateAt(0).warnings).toEqual([]);
  expect(diagram.evaluateAt(1000).nodes.find(({ id }) => id === "decision")?.label).toBe("Is the request approved?");
  expect(diagram.evaluateAt(1500).nodes.find(({ id }) => id === "group")?.x).toBe(30);
  expect(diagram.evaluateAt(3000).warnings.map(({ objectId }) => objectId)).toEqual(["overflow"]);
  expect(diagram.evaluateAt(4000).nodes.find(({ id }) => id === "report")?.label).toBe("Signed approval report");
});

it("registers the runnable mixed example in the published resource list", () => {
  const metadata = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8"));
  expect(metadata.files).toContain("examples/mixed-flow.json");
  expect(metadata.files).toContain("examples/create-mixed-flow.mjs");
});
