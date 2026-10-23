import { describe, expect, it } from "vitest";
import { createDiagram, validateDocument, type DiagramDocument } from "../index.js";

function transferDocument(highlightParticipants?: boolean): DiagramDocument {
  return {
    version: 1,
    viewport: { width: 500, height: 200 },
    nodes: [
      { id: "source", kind: "rect", x: 20, y: 70, width: 80, height: 60 },
      { id: "target", kind: "rect", x: 400, y: 70, width: 80, height: 60 }
    ],
    edges: [{ id: "transfer", from: "source", to: "target" }],
    scenes: [{ id: "send", label: "Send", beats: [{ durationMs: 1000, transitionMs: 0, actions: [
      { type: "highlight", target: "source" },
      { type: "flow", target: "transfer", direction: "forward",
        ...(highlightParticipants !== undefined ? { highlightParticipants } : {}) }
    ] }] }]
  };
}

describe("flow participant highlights", () => {
  it.each([undefined, true])("retains endpoint highlights with highlightParticipants %s", (highlightParticipants) => {
    const diagram = createDiagram(transferDocument(highlightParticipants));
    expect(diagram.evaluateAt(500).nodes.map(({ highlighted }) => highlighted)).toEqual([true, true]);
    expect(diagram.evaluateAt(diagram.totalDuration).nodes.map(({ highlighted }) => highlighted)).toEqual([true, false]);
  });

  it("moves a solid dot without changing explicit node highlights when opted out", () => {
    const diagram = createDiagram(transferDocument(false));
    for (const reducedMotion of [false, true]) {
      const frame = diagram.evaluateAt(500, { reducedMotion });
      expect(frame.nodes.filter(({ highlighted }) => highlighted).map(({ id }) => id)).toEqual(["source"]);
      expect(frame.edges[0]?.highlighted).toBe(true);
      expect(frame.edges[0]?.flow).toEqual(reducedMotion ? undefined : {
        direction: "forward", progress: 0.3, point: { x: 190, y: 100 }
      });
    }
    expect(diagram.renderSvg(500)).toMatch(/<circle[^>]*r="5"[^>]*data-flow-id="transfer"/);
    expect(diagram.renderSvg(500, { reducedMotion: true })).not.toContain("data-flow-id");
    expect(diagram.evaluateAt(diagram.totalDuration).nodes.filter(({ highlighted }) => highlighted).map(({ id }) => id)).toEqual(["source"]);
    expect(diagram.evaluateAt(diagram.totalDuration).edges[0]?.highlighted).toBe(false);
  });

  it.each(["false", 0, null, {}])("rejects non-boolean participant policy %j", (highlightParticipants) => {
    const document = transferDocument();
    const flow = document.scenes[0]!.beats[0]!.actions[1]!;
    const malformed: unknown = { ...document, scenes: [{ id: "send", label: "Send", beats: [{
      durationMs: 1000, actions: [{ ...flow, highlightParticipants }]
    }] }] };
    expect(validateDocument(malformed)).toEqual([{
      path: "scenes[0].beats[0].actions[0].highlightParticipants", message: "must be a boolean"
    }]);
  });
});
