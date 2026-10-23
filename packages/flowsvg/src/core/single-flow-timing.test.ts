import { describe, expect, it } from "vitest";
import { createDiagram, DiagramValidationError, type DiagramDocument } from "../index.js";

function transferDocument(distance = 180, durationMs = 2000): DiagramDocument {
  return {
    version: 1, title: "Transfer", viewport: { width: 1000, height: 400 },
    nodes: [
      { id: "source", kind: "rect", x: 20, y: 70, width: 80, height: 60 },
      { id: "target", kind: "rect", x: 100 + distance, y: 70, width: 80, height: 60 }
    ],
    edges: [{ id: "transfer", from: "source", to: "target" }],
    scenes: [{ id: "send", label: "Send", beats: [{ durationMs, transitionMs: 0, actions: [
      { type: "flow", target: "transfer", direction: "forward" }
    ] }] }]
  };
}

describe("single-flow reference speed", () => {
  it.each([100, 2000, 4000])("holds for exactly 500 ms after a 180-unit transfer regardless of authored %i ms", (durationMs) => {
    const diagram = createDiagram(transferDocument(180, durationMs));
    expect(diagram.totalDuration).toBe(1500);
    expect(diagram.evaluateAt(500).beatProgress).toBeCloseTo(1 / 3);
    expect(diagram.evaluateAt(500).edges[0]?.flow).toMatchObject({ progress: 0.5, point: { x: 190, y: 100 } });
    for (const time of [1000, 1150, 1499]) {
      expect(diagram.evaluateAt(time).edges[0]?.flow).toMatchObject({ progress: 1, point: { x: 280, y: 100 } });
      expect(diagram.renderSvg(time)).toMatch(/<circle[^>]*cx="280"[^>]*data-flow-id="transfer"/);
    }
    expect(diagram.evaluateAt(1500).edges[0]?.flow).toBeUndefined();
    expect(diagram.evaluateAt(1500).edges[0]?.highlighted).toBe(false);
  });

  it("finishes a long opening transition before a shortened transfer beat ends", () => {
    const document = transferDocument(18, 4000);
    document.scenes[0]!.beats[0] = { durationMs: 4000, transitionMs: 4000, actions: [
      { type: "updateNode", target: "source", value: { fill: "#000000" } },
      { type: "flow", target: "transfer", direction: "forward", highlightParticipants: false }
    ] };
    document.scenes[0]!.beats.push({ durationMs: 1000, actions: [] });
    const diagram = createDiagram(document);
    expect(diagram.beats[0]?.endMs).toBe(900);
    expect(diagram.evaluateAt(450).nodes[0]?.style?.fill).not.toBe("#000000");
    expect(diagram.evaluateAt(899).nodes[0]?.style?.fill).toBe("#000000");
    expect(diagram.evaluateAt(900).nodes[0]?.style?.fill).toBe("#000000");
    expect(diagram.evaluateAt(900).beatId).toBe("send:1");
  });

  it("extends long transfers and exposes frozen effective intervals with inherited captions", () => {
    const document = transferDocument(540, 1000);
    document.scenes.push({ id: "finish", label: "Finish", beats: [
      { durationMs: 500, caption: "Complete", actions: [] },
      { durationMs: 500, actions: [] }
    ] });
    const original = JSON.stringify(document);
    const diagram = createDiagram(document);
    expect(diagram.totalDuration).toBe(4500);
    expect(diagram.beats).toEqual([
      { sceneId: "send", beatId: "send:0", beatIndex: 0, startMs: 0, endMs: 3500, caption: "Transfer" },
      { sceneId: "finish", beatId: "finish:0", beatIndex: 0, startMs: 3500, endMs: 4000, caption: "Complete" },
      { sceneId: "finish", beatId: "finish:1", beatIndex: 1, startMs: 4000, endMs: 4500, caption: "Complete" }
    ]);
    expect(Object.isFrozen(diagram.beats)).toBe(true);
    expect(diagram.beats.every(Object.isFrozen)).toBe(true);
    expect(diagram.evaluateAt(3499).beatId).toBe("send:0");
    expect(diagram.evaluateAt(3500).beatId).toBe("finish:0");
    expect(diagram.evaluateAt(4000).beatId).toBe("finish:1");
    expect(JSON.stringify(document)).toBe(original);
  });

  it.each(["movement", "accumulation"])("rejects non-finite derived %s with the affected duration path", (kind) => {
    const document = transferDocument(kind === "movement" ? 1e308 : 2.88e307, 1000);
    if (kind === "accumulation") document.scenes[0]!.beats.push({ durationMs: 2e307, actions: [] });
    try {
      createDiagram(document);
      expect.fail("non-finite effective timeline must be rejected");
    } catch (error) {
      expect(error).toBeInstanceOf(DiagramValidationError);
      if (!(error instanceof DiagramValidationError)) throw error;
      expect(error.issues).toContainEqual({
        path: `scenes[0].beats[${kind === "movement" ? 0 : 1}].durationMs`,
        message: "effective beat timing must be finite"
      });
    }
  });

  it.each(["forward", "reverse"] as const)("gives a tiny %s transfer 400 ms before arrival and hold", (direction) => {
    const document = transferDocument(18, 1000);
    document.scenes[0]!.beats[0]!.actions = [{ type: "flow", target: "transfer", direction, text: "A" }];
    const diagram = createDiagram(document);
    expect(diagram.evaluateAt(200).edges[0]?.flow).toMatchObject({ progress: 0.5, point: { x: 109, y: 100 }, text: "A" });
    expect(diagram.evaluateAt(400).edges[0]?.flow).toMatchObject({ progress: 1, point: { x: direction === "forward" ? 118 : 100, y: 100 } });
    expect(diagram.evaluateAt(899).edges[0]?.flow?.progress).toBe(1);
    expect(diagram.renderSvg(899)).toContain('data-flow-id="transfer"');
    expect(diagram.evaluateAt(900).edges[0]?.flow).toBeUndefined();
  });

  it("adds a 500 ms arrival hold after the 400 ms minimum movement", () => {
    const diagram = createDiagram(transferDocument(18, 100));
    expect(diagram.totalDuration).toBe(900);
    expect(diagram.evaluateAt(200).edges[0]?.flow?.progress).toBe(0.5);
    expect(diagram.evaluateAt(899).edges[0]?.flow).toBeDefined();
    expect(diagram.evaluateAt(900).edges[0]?.flow).toBeUndefined();
  });

  it("measures target parent and node geometry but follows the current path during the authored transition", () => {
    const document = transferDocument(180, 1000);
    document.nodes = [
      { id: "group", kind: "group", x: 40, y: 0, width: 800, height: 200 },
      ...document.nodes.map((node) => ({ ...node, parentId: "group" }))
    ];
    document.scenes[0]!.beats[0] = { durationMs: 1000, transitionMs: 1000, actions: [
      { type: "updateNode", target: "group", value: { x: 100 } },
      { type: "updateNode", target: "source", value: { width: 100 } },
      { type: "updateNode", target: "target", value: { x: 480 } },
      { type: "flow", target: "transfer", direction: "forward" }
    ] };
    const diagram = createDiagram(document);
    expect(diagram.totalDuration).toBe(2500);
    expect(diagram.evaluateAt(500).edges[0]?.flow).toMatchObject({ progress: 0.25, point: { x: 247.5, y: 100 } });
    expect(diagram.evaluateAt(1000).edges[0]?.flow).toMatchObject({ progress: 0.5, point: { x: 400, y: 100 } });
    expect(diagram.evaluateAt(1000).nodes[1]?.x).toBe(120);
    const reduced = diagram.evaluateAt(500, { reducedMotion: true });
    expect(reduced.beatProgress).toBeCloseTo(1 / 5);
    expect(reduced.nodes[1]?.x).toBe(120);
    expect(reduced.edges[0]?.flow).toBeUndefined();
    expect(reduced.edges[0]?.highlighted).toBe(true);
    for (const timeMs of [2000, 0, 500, 1500, 500]) {
      expect(diagram.evaluateAt(timeMs)).toEqual(createDiagram(document).evaluateAt(timeMs));
    }
  });

  it("keeps the default transition based on authored duration when movement extends a beat", () => {
    const document = transferDocument(360, 100);
    document.scenes[0]!.beats[0] = { durationMs: 100, actions: [
      { type: "updateNode", target: "source", value: { fill: "#000000" } },
      { type: "flow", target: "transfer", direction: "forward", highlightParticipants: false }
    ] };
    const diagram = createDiagram(document);
    expect(diagram.totalDuration).toBe(2500);
    expect(diagram.evaluateAt(100).nodes[0]?.style?.fill).toBe("#000000");
    expect(diagram.evaluateAt(100).edges[0]?.flow?.progress).toBe(0.05);
  });

  it.each([
    { route: "curved", duration: 2222.646, blockerY: 130, command: " C " },
    { route: "orthogonal", duration: 3114.185, blockerY: 80, command: " Q " }
  ] as const)("measures the $route route with inherited obstacle and stroke updates for a reverse capsule", ({ route, duration, blockerY, command }) => {
    const document = transferDocument(360, 100);
    document.nodes[1] = { ...document.nodes[1]!, y: 230 };
    document.nodes.push({ id: "blocker", kind: "rect", x: 250, y: 130, width: 80, height: 200 });
    document.edges[0] = { ...document.edges[0]!, route, fromPort: "right", toPort: "left" };
    document.scenes[0]!.beats = [
      { durationMs: 100, actions: [
        { type: "updateNode", target: "blocker", value: { y: blockerY } },
        { type: "updateEdge", target: "transfer", value: { strokeWidth: 6 } }
      ] },
      { durationMs: 100, actions: [{ type: "flow", target: "transfer", direction: "reverse", text: "done" }] }
    ];
    const diagram = createDiagram(document);
    // Independent dense integration of the exported C/Q commands gives these movement durations.
    // Core distance sampling may differ by less than half a millisecond.
    expect(diagram.totalDuration - 600).toBeCloseTo(duration, 0);
    const frame = diagram.evaluateAt(100);
    expect(frame.edges[0]?.path).toContain(command);
    expect(frame.edges[0]?.style?.strokeWidth).toBe(6);
    expect(frame.edges[0]?.flow).toMatchObject({ direction: "reverse", progress: 0, point: { x: 460, y: 260 }, text: "done" });
    expect(diagram.evaluateAt(100 + (diagram.totalDuration - 600) / 2).edges[0]?.flow?.progress).toBeCloseTo(0.5);
    expect(diagram.renderSvg(200)).toContain('>done</text>');
    expect(diagram.evaluateAt(200, { reducedMotion: true }).beatId).toBe("send:1");
    expect(diagram.evaluateAt(diagram.totalDuration).edges[0]?.flow).toBeUndefined();
  });

  it("rejects a non-finite reference path instead of treating invalid segment distances as zero", () => {
    const document = transferDocument();
    document.nodes[0] = { ...document.nodes[0]!, x: -1e308 };
    document.nodes[1] = { ...document.nodes[1]!, x: 1e308 };
    expect(() => createDiagram(document)).toThrow(DiagramValidationError);
    try {
      createDiagram(document);
    } catch (error) {
      if (!(error instanceof DiagramValidationError)) throw error;
      expect(error.issues[0]?.path).toBe("scenes[0].beats[0].durationMs");
    }
  });
});
