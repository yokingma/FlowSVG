import { describe, expect, it } from "vitest";
import { createDiagram, measureNodeLabel, DiagramValidationError } from "../index.js";

describe("node label measurement", () => {
  it("provides one diamond height that contains every frozen label version", () => {
    const versions = Object.freeze(["Ready?", "One\nTwo"]);
    const input = Object.freeze({ kind: "diamond", width: 200, label: versions });
    const result = measureNodeLabel(input);
    expect(result).toEqual({ height: 128, diagnostics: [] });
    expect(measureNodeLabel(input)).toEqual(result);
    for (const label of versions) {
      const diagram = createDiagram({ version: 1, viewport: { width: 300, height: 300 },
        nodes: [{ id: "decision", kind: "diamond", x: 0, y: 0, width: 200, height: result.height, label }], edges: [], scenes: [] });
      expect(diagram.evaluateAt(0).warnings).toEqual([]);
      expect(diagram.evaluateAt(0).nodes[0]!.labelLines).toEqual(label.split("\n"));
    }
    expect(versions).toEqual(["Ready?", "One\nTwo"]);
  });

  it.each([
    null, [], { kind: "rect", width: 200, label: "No" },
    { kind: "diamond", width: 0, label: "No" }, { kind: "diamond", width: Infinity, label: "No" },
    { kind: "diamond", width: 200, label: [] }, { kind: "diamond", width: 200, label: ["A", 1] },
    { kind: "diamond", width: 200, label: Array(2) },
    { kind: "diamond", width: 200, label: "A", typography: { nodeLabel: -1 } },
    { kind: "diamond", width: 200, label: "A", unsupported: true }
  ])("rejects invalid runtime measurement input with the shared validation error: %j", (input) => {
    expect(() => Reflect.apply(measureNodeLabel, undefined, [input])).toThrow(DiagramValidationError);
  });

  it("rejects a non-finite required height with the affected label version path", () => {
    const input = { kind: "diamond", width: 1e308, label: ["A", "A\nA\nA\nA\nA\nA\nA\nA"], typography: { nodeLabel: 1e307 } };
    try {
      Reflect.apply(measureNodeLabel, undefined, [input]);
      expect.fail("Expected a non-finite height validation error");
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(DiagramValidationError);
      if (!(error instanceof DiagramValidationError)) throw error;
      expect(error.issues).toContainEqual({ path: "label[1]", message: "required node height must be finite" });
    }
  });

  it("preserves unsatisfiable widths per version and handles empty and scaled labels", () => {
    expect(measureNodeLabel({ kind: "diamond", width: 1, label: ["👩‍💻", "", "é"] })).toEqual({ height: 88, diagnostics: [
      expect.objectContaining({ versionIndex: 0, path: "label[0]", dimension: "width" }),
      expect.objectContaining({ versionIndex: 2, path: "label[2]", dimension: "width" })
    ] });
    expect(measureNodeLabel({ kind: "diamond", width: 200, label: "" })).toEqual({ height: 48, diagnostics: [] });
    const result = measureNodeLabel({ kind: "diamond", width: 400, label: "中文\n\nEnglish", typography: { nodeLabel: 24 } });
    expect(result).toEqual({ height: 228, diagnostics: [] });
    const diagram = createDiagram({ version: 1, typography: { nodeLabel: 24 }, viewport: { width: 500, height: 500 },
      nodes: [{ id: "decision", kind: "diamond", x: 0, y: 0, width: 400, height: result.height, label: "中文\n\nEnglish" }], edges: [], scenes: [] });
    expect(diagram.evaluateAt(0).nodes[0]!.labelLines).toEqual(["中文", "", "English"]);
    expect(diagram.evaluateAt(0).warnings).toEqual([]);
  });
});
