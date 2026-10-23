import { describe, expect, it } from "vitest";
import { createDiagram, type DiagramDocument, type FlowDirection } from "../index.js";

function transferDocument(direction: FlowDirection = "forward", distance = 180, text?: string): DiagramDocument {
  return {
    version: 1, viewport: { width: 1000, height: 200 },
    nodes: [
      { id: "source", kind: "rect", x: 20, y: 70, width: 80, height: 60 },
      { id: "target", kind: "rect", x: 100 + distance, y: 70, width: 80, height: 60 }
    ],
    edges: [{ id: "transfer", from: "source", to: "target" }],
    scenes: [{ id: "send", label: "Send", beats: [{ durationMs: 2000, transitionMs: 0, actions: [
      { type: "flow", target: "transfer", direction, ...(text !== undefined ? { text } : {}) }
    ] }] }]
  };
}

const PALETTES = [
  { theme: "light", normal: { fill: "#ffffff", stroke: "#cfd8e3" }, middle: { fill: "#f5f8ff", stroke: "#7d9ed6" },
    faint: { fill: "#fefeff", stroke: "#c5d1e1" }, strong: { fill: "#ebf2ff", stroke: "#346aca" }, active: { fill: "#eaf1ff", stroke: "#2a63c8" } },
  { theme: "dark", normal: { fill: "#1d2939", stroke: "#475467" }, middle: { fill: "#20324d", stroke: "#6984b0" },
    faint: { fill: "#1d2a3b", stroke: "#4b5a70" }, strong: { fill: "#233a5e", stroke: "#86aeef" }, active: { fill: "#233b60", stroke: "#8ab4f8" } }
] as const;

const TRANSFER_CASES = PALETTES.flatMap((palette) => (["forward", "reverse"] as const).flatMap((direction) =>
  [18, 180, 540].flatMap((distance) => [undefined, "Payload"].map((text) => ({ ...palette, direction, distance, text })))
));

describe("single-flow receiver arrival paint", () => {
  it.each(TRANSFER_CASES)("fades the $direction receiver over 200ms in $theme over $distance units with text=$text", ({ theme, normal, middle, active, direction, distance, text }) => {
    const diagram = createDiagram(transferDocument(direction, distance, text));
    const arrival = Math.max(400, distance / 180 * 1000);
    const receiver = direction === "forward" ? 1 : 0;
    const sender = 1 - receiver;
    expect(diagram.totalDuration).toBe(arrival + 500);
    // Deliberately query out of order: paint must depend only on the requested time.
    for (const [time, style] of [[arrival + 200, active], [0, normal], [arrival + 100, middle], [arrival, normal], [arrival + 299, active]] as const) {
      const frame = diagram.evaluateAt(time, { theme });
      expect(frame.nodes[receiver]!.style, `${direction} ${distance} at ${time}`).toMatchObject(style);
      expect(frame.nodes[sender]!.style).toMatchObject(active);
      expect(frame.nodes.map(({ highlighted }) => highlighted)).toEqual([true, true]);
      expect(frame.edges[0]!.flow?.progress).toBe(time >= arrival ? 1 : 0);
      const svg = diagram.renderSvg(time, { theme });
      expect(svg).toContain(`fill="${style.fill}" stroke="${style.stroke}"`);
    }
    const completed = diagram.evaluateAt(diagram.totalDuration, { theme });
    expect(completed.nodes.map(({ highlighted }) => highlighted)).toEqual([false, false]);
    expect(completed.nodes[receiver]!.style).toMatchObject(normal);
    expect(completed.edges[0]!.flow).toBeUndefined();
  });

  it("uses cubic easing during arrival without changing authored content or geometry timing", () => {
    const document = transferDocument();
    const diagram = createDiagram({ ...document, scenes: [{ id: "send", label: "Send", beats: [{
      ...document.scenes[0]!.beats[0]!, actions: [
        ...document.scenes[0]!.beats[0]!.actions,
        { type: "updateNode", target: "target", value: { label: "Received", height: 80 } }
      ]
    }] }] });
    const arrival = diagram.totalDuration - 500;
    expect(diagram.evaluateAt(0).nodes[1]).toMatchObject({ label: "Received", height: 80 });
    expect(diagram.evaluateAt(arrival + 50).nodes[1]!.style).toMatchObject({ fill: "#fefeff", stroke: "#c5d1e1" });
    expect(diagram.evaluateAt(arrival + 150).nodes[1]!.style).toMatchObject({ fill: "#ebf2ff", stroke: "#346aca" });
  });

  it.each(PALETTES)("paints immediately with reduced motion in $theme without shortening the schedule", ({ theme, active }) => {
    const diagram = createDiagram(transferDocument());
    expect(diagram.totalDuration).toBe(1500);
    for (const time of [0, 1000, 1100, 1499]) {
      const frame = diagram.evaluateAt(time, { theme, reducedMotion: true });
      expect(frame.nodes[1]!.style).toMatchObject(active);
      expect(frame.edges[0]!.flow).toBeUndefined();
    }
  });

  it("preserves explicit highlights and participant opt-out", () => {
    const document = transferDocument();
    for (const highlightParticipants of [true, false]) {
      const diagram = createDiagram({ ...document, scenes: [{ id: "send", label: "Send", beats: [{
        durationMs: 2000, transitionMs: 0, actions: [
          { type: "flow", target: "transfer", direction: "forward", highlightParticipants },
          { type: "highlight", target: "target" }
        ]
      }] }] });
      for (const time of [0, 1100, 1300]) {
        expect(diagram.evaluateAt(time).nodes[1]!.style).toMatchObject(PALETTES[0].active);
      }
      expect(diagram.evaluateAt(0).nodes[0]!.style).toMatchObject(highlightParticipants ? PALETTES[0].active : PALETTES[0].normal);
    }
  });

  it("retains synchronized endpoint paint for multiple flows and shared participants", () => {
    const document = transferDocument();
    const diagram = createDiagram({ ...document,
      edges: [...document.edges, { id: "return", from: "target", to: "source" }],
      scenes: [{ id: "send", label: "Send", beats: [{ durationMs: 2000, actions: [
        { type: "flow", target: "transfer", direction: "forward" },
        { type: "flow", target: "return", direction: "forward" }
      ] }] }]
    });
    expect(diagram.totalDuration).toBe(2000);
    for (const time of [0, 1000, 1999]) {
      for (const node of diagram.evaluateAt(time).nodes) expect(node.style).toMatchObject(PALETTES[0].active);
    }
  });
});

describe("single-flow departure paint", () => {
  it.each(TRANSFER_CASES)("fades $direction node and edge highlights out in $theme over $distance units with text=$text", ({ theme, normal, middle, faint, strong, active, direction, distance, text }) => {
    const diagram = createDiagram(transferDocument(direction, distance, text));
    const departure = diagram.totalDuration - 200;
    const normalEdge = theme === "light" ? "#8892a4" : "#98a2b3";
    const middleEdge = theme === "light" ? "#597bb6" : "#91abd6";
    for (const [time, nodePaint, edgeStroke] of [
      [departure + 100, middle, middleEdge], [departure, active, active.stroke],
      [departure + 50, strong, theme === "light" ? "#3066c6" : "#8bb3f4"],
      [departure + 150, faint, theme === "light" ? "#828fa6" : "#97a3b7"],
      [departure + 199.99, normal, normalEdge]
    ] as const) {
      const frame = diagram.evaluateAt(time, { theme });
      for (const node of frame.nodes) {
        expect(node.style).toMatchObject(nodePaint);
        expect(node.highlighted).toBe(true);
      }
      expect(frame.edges[0]).toMatchObject({ highlighted: true, style: { stroke: edgeStroke }, flow: { progress: 1 } });
      expect(diagram.renderSvg(time, { theme })).toContain(`stroke="${edgeStroke}"`);
    }
    expect(diagram.totalDuration).toBe(Math.max(400, distance / 180 * 1000) + 500);
    const completed = diagram.evaluateAt(diagram.totalDuration, { theme });
    expect(completed.nodes.every(node => !node.highlighted)).toBe(true);
    expect(completed.edges[0]).toMatchObject({ highlighted: false, style: { stroke: normalEdge } });
    expect(completed.edges[0]!.flow).toBeUndefined();
  });

  it("retains explicit node/edge paint while opted-out automatic edge paint fades", () => {
    const document = transferDocument();
    for (const explicitEdge of [false, true]) {
      const diagram = createDiagram({ ...document, scenes: [{ id: "send", label: "Send", beats: [{
        durationMs: 2000, transitionMs: 0, actions: [
          { type: "flow", target: "transfer", direction: "forward", highlightParticipants: false },
          { type: "highlight", target: "target" },
          ...(explicitEdge ? [{ type: "highlight" as const, target: "transfer" }] : [])
        ]
      }] }] });
      const frame = diagram.evaluateAt(diagram.totalDuration - 100);
      expect(frame.nodes[0]!.style).toMatchObject(PALETTES[0].normal);
      expect(frame.nodes[1]!.style).toMatchObject(PALETTES[0].active);
      expect(frame.nodes.map(node => node.highlighted)).toEqual([false, true]);
      expect(frame.edges[0]!.style.stroke).toBe(explicitEdge ? "#2a63c8" : "#597bb6");
    }
  });

  it("hands off a fully cleared single flow to the next beat and keeps reduced motion immediate", () => {
    const document = transferDocument();
    const diagram = createDiagram({ ...document, scenes: [...document.scenes, { id: "next", label: "Next", beats: [
      { durationMs: 1000, transitionMs: 0, actions: [{ type: "highlight", target: "source" }] }
    ] }] });
    const end = diagram.beats[0]!.endMs;
    const before = diagram.evaluateAt(end - 0.01);
    expect(before.nodes[0]!.style).toMatchObject(PALETTES[0].normal);
    const after = diagram.evaluateAt(end);
    expect(after).toMatchObject({ beatId: "next:0", sceneId: "next" });
    expect(after.nodes[0]!.style).toMatchObject(PALETTES[0].active);
    expect(after.nodes[1]!.style).toMatchObject(PALETTES[0].normal);
    const reduced = diagram.evaluateAt(end - 100, { reducedMotion: true });
    expect(reduced.nodes.every(node => node.style.fill === PALETTES[0].active.fill)).toBe(true);
    expect(reduced.edges[0]!.style.stroke).toBe(PALETTES[0].active.stroke);
    expect(reduced.edges[0]!.flow).toBeUndefined();
  });
});
