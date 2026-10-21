import { describe, expect, it } from "vitest";
import { documentModel } from "../../tests/fixtures/parallel-transfers.js";
import { createDiagram, type DiagramFrameState } from "../index.js";

describe("SDK parallel transfers", () => {
  it("evaluates parallel directions, stable camera, adjacent beats and final flow cleanup", () => {
    const diagram = createDiagram(documentModel);
    const first = diagram.evaluateAt(1200);
    const second = diagram.evaluateAt(3600);
    const response = diagram.evaluateAt(6000);
    const active = (frame: DiagramFrameState) => frame.edges.filter((edge) => edge.flow);

    expect(active(first).map((edge) => edge.id)).toEqual(["ab", "bc", "db"]);
    expect(active(second).map((edge) => edge.id)).toEqual(["be", "ed"]);
    expect(active(response).map((edge) => edge.flow?.text)).toEqual(["Result", "Accepted"]);
    expect(active(first).every((edge) => edge.path.includes("C"))).toBe(true);
    expect(active(second).every((edge) => edge.path.includes("C"))).toBe(true);
    expect(active(first).map((edge) => edge.flow?.direction)).toEqual(["forward", "forward", "reverse"]);
    expect(active(first).map((edge) => edge.flow?.text)).toEqual([undefined, "Signal", "Probe"]);
    expect(first.nodes.find((node) => node.id === "b")?.highlighted).toBe(true);
    expect(second.nodes.find((node) => node.id === "e")?.highlighted).toBe(true);
    for (const timeMs of [0, 600, 2399, 2400, 4799, 4800, 7199, 7200, diagram.totalDuration]) {
      expect(diagram.evaluateAt(timeMs).camera).toEqual(first.camera);
    }
    expect(active(diagram.evaluateAt(2399))).toHaveLength(3);
    expect(active(diagram.evaluateAt(2400))).toHaveLength(2);
    expect(diagram.totalDuration).toBe(8200);
    expect(active(diagram.evaluateAt(diagram.totalDuration))).toHaveLength(0);
    expect(diagram.evaluateAt(diagram.totalDuration).nodes.every((node) => !node.highlighted)).toBe(true);
  });
});
