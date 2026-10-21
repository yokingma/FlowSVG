// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { createPlayer, type FlowPlayer } from "../browser.js";
import { createDiagram, type DiagramDocument } from "../index.js";

const document: DiagramDocument = {
  version: 1,
  viewport: { width: 400, height: 200 },
  nodes: [
    { id: "source", kind: "rect", x: 20, y: 60, width: 80, height: 60, label: "Source" },
    { id: "target", kind: "rect", x: 280, y: 60, width: 100, height: 60, label: "Target" }
  ],
  edges: [{ id: "request", from: "source", to: "target" }],
  scenes: [{ id: "scene", label: "Scene", beats: [
    { durationMs: 1000, transitionMs: 0, actions: [] },
    { durationMs: 1000, transitionMs: 0, actions: [{ type: "flow", target: "request", direction: "forward" }] },
    { durationMs: 1000, transitionMs: 0, actions: [{ type: "updateNode", target: "source", value: { fill: "#123456" } }] }
  ] }]
};

const players: FlowPlayer[] = [];
afterEach(() => {
  players.splice(0).forEach((player) => player.destroy());
  window.document.body.replaceChildren();
});

function mountPlayer(input = document, hoverFill = true): { host: HTMLElement; canvas: HTMLElement; player: FlowPlayer } {
  const host = window.document.createElement("div");
  window.document.body.append(host);
  const player = createPlayer(host, input, { controls: false, reducedMotion: false, hoverFill });
  players.push(player);
  const canvas = host.querySelector<HTMLElement>(".flowsvg-canvas")!;
  const svg = host.querySelector("svg")!;
  svg.getBoundingClientRect = () => ({ x: 0, y: 0, left: 0, top: 0, right: 400, bottom: 200, width: 400, height: 200, toJSON: () => ({}) });
  return { host, canvas, player };
}

function movePointer(canvas: HTMLElement, clientX: number, clientY: number): void {
  canvas.dispatchEvent(new MouseEvent("pointermove", { bubbles: true, clientX, clientY }));
}

function fill(host: HTMLElement, id: string): string | null {
  return host.querySelector(`[data-id="${id}"]`)?.getAttribute("fill") ?? null;
}

describe("browser node hover highlights", () => {
  it.each(["light", "dark"] as const)("highlights only nested group borders on hover in %s while retaining current timeline fill", (theme) => {
    const input: DiagramDocument = { ...document, theme,
      nodes: [
        { id: "outer", kind: "group", x: 110, y: 10, width: 160, height: 180 },
        { id: "group", kind: "group", parentId: "outer", x: 10, y: 10, width: 140, height: 160, style: { fill: "#123456" } },
        ...document.nodes,
        { id: "child", kind: "rect", parentId: "group", x: 20, y: 40, width: 50, height: 50 }
      ],
      edges: [{ id: "request", from: "source", to: "group" }],
      scenes: [{ id: "scene", label: "Scene", beats: [
        { durationMs: 1000, transitionMs: 0, actions: [] },
        { durationMs: 1000, transitionMs: 0, actions: [{ type: "flow", target: "request", direction: "forward" }] },
        { durationMs: 1000, transitionMs: 0, actions: [{ type: "updateNode", target: "group", value: { fill: "#345678" } }] }
      ] }]
    };
    const { host, canvas, player } = mountPlayer(input, false);
    const diagram = createDiagram(input);
    const highlight = theme === "dark" ? "#8ab4f8" : "#2a63c8";
    movePointer(canvas, 250, 150);
    expect(fill(host, "group")).toBe("#123456");
    expect(host.querySelector('[data-id="group"]')?.getAttribute("stroke")).toBe(highlight);
    movePointer(canvas, 160, 80);
    expect(fill(host, "child")).toBe(theme === "dark" ? "#1d2939" : "#ffffff");
    expect(host.querySelector('[data-id="child"]')?.getAttribute("stroke")).toBe(highlight);
    expect(fill(host, "group")).toBe("#123456");
    movePointer(canvas, 250, 150);
    for (const time of [1500, 2500]) {
      player.seek(time);
      const frame = diagram.evaluateAt(time);
      expect(fill(host, "group")).toBe(frame.nodes.find(({ id }) => id === "group")?.style?.fill);
      expect(host.querySelector('[data-id="group"]')?.getAttribute("stroke")).toBe(highlight);
      expect(player.getState().frame).toEqual(frame);
    }
    canvas.dispatchEvent(new MouseEvent("pointerleave"));
    expect(fill(host, "group")).toBe("#345678");
    const expected = window.document.createElement("div");
    expected.innerHTML = diagram.renderSvg(2500);
    expect(host.querySelector("svg")?.outerHTML).toBe(expected.querySelector("svg")?.outerHTML);
  });

  it("highlights only the hovered node while leaving core frames and exports unchanged", () => {
    const { host, canvas, player } = mountPlayer();
    const diagram = createDiagram(document);
    movePointer(canvas, 50, 80);
    expect(fill(host, "source")).toBe("#eaf1ff");
    expect(fill(host, "target")).toBe("#ffffff");
    expect(host.querySelector('[data-id="request"]')?.getAttribute("stroke")).toBe("#8892a4");
    expect(player.getState().frame).toEqual(diagram.evaluateAt(0));
    expect(diagram.renderSvg()).toContain('fill="#ffffff"');
    canvas.dispatchEvent(new MouseEvent("pointerleave"));
    expect(fill(host, "source")).toBe("#ffffff");
  });

  it("treats an overflowing node label and its shape as one hover target", () => {
    const { host, canvas } = mountPlayer({ ...document, nodes: [
      { id: "source", kind: "ellipse", x: 20, y: 60, width: 80, height: 20, label: "First\nSecond\nThird" }
    ], edges: [], scenes: [] });
    movePointer(canvas, 60, 50);
    expect(fill(host, "source")).toBe("#eaf1ff");
    movePointer(canvas, 60, 58);
    expect(fill(host, "source")).toBe("#eaf1ff");
  });

  it.each(["汉", "W", "😀"])("covers wide label glyphs outside a narrow shape: %s", (label) => {
    const { host, canvas } = mountPlayer({ ...document, nodes: [
      { id: "source", kind: "rect", x: 50, y: 60, width: 4, height: 20, label }
    ], edges: [], scenes: [] });
    movePointer(canvas, 59, 70);
    expect(fill(host, "source")).toBe("#eaf1ff");
  });

  it("does not create a hover target for an empty overflowing label line", () => {
    const { host, canvas } = mountPlayer({ ...document, nodes: [
      { id: "source", kind: "rect", x: 20, y: 60, width: 80, height: 20, label: "\n" }
    ], edges: [], scenes: [] });
    movePointer(canvas, 60, 52);
    expect(fill(host, "source")).toBe("#ffffff");
  });

  it("clears the previous document's hover cause on successful replacement", () => {
    const { host, canvas, player } = mountPlayer();
    movePointer(canvas, 50, 80);
    player.load({ ...document, title: "Replacement" });
    expect(fill(host, "source")).toBe("#ffffff");
    movePointer(canvas, 50, 80);
    expect(fill(host, "source")).toBe("#eaf1ff");
  });

  it("clears hover when the pointer is cancelled", () => {
    const { host, canvas } = mountPlayer();
    movePointer(canvas, 50, 80);
    canvas.dispatchEvent(new MouseEvent("pointercancel"));
    expect(fill(host, "source")).toBe("#ffffff");
  });

  it("keeps independent flow, hover and explicit causes through beat boundaries and leave", () => {
    const { host, canvas, player } = mountPlayer();
    player.seek(1500);
    movePointer(canvas, 50, 80);
    canvas.dispatchEvent(new MouseEvent("pointerleave"));
    expect(fill(host, "source")).toBe("#eaf1ff");
    movePointer(canvas, 50, 80);
    player.seek(2500);
    expect(fill(host, "source")).toBe("#eaf1ff");
    expect(fill(host, "target")).toBe("#ffffff");
    canvas.dispatchEvent(new MouseEvent("pointerleave"));
    expect(fill(host, "source")).toBe("#123456");
    player.load({ ...document, scenes: [{ id: "explicit", label: "Explicit", beats: [{
      durationMs: 1000, transitionMs: 0, actions: [{ type: "highlight", target: "source" }]
    }] }] });
    movePointer(canvas, 50, 80);
    canvas.dispatchEvent(new MouseEvent("pointerleave"));
    expect(fill(host, "source")).toBe("#eaf1ff");
  });

  it("re-hits a stationary pointer as nodes move or disappear and updates hover events", () => {
    const { host, canvas, player } = mountPlayer({ ...document, scenes: [{ id: "movement", label: "Movement", beats: [
      { durationMs: 1000, transitionMs: 0, actions: [] },
      { durationMs: 1000, transitionMs: 0, actions: [{ type: "updateNode", target: "source", value: { x: 150 } }] },
      { durationMs: 1000, transitionMs: 0, actions: [{ type: "updateNode", target: "source", value: { x: 20 } }] },
      { durationMs: 1000, transitionMs: 0, actions: [{ type: "hide", target: "source" }] }
    ] }] });
    const hits: unknown[] = [];
    host.addEventListener("hover", (event) => hits.push((event as CustomEvent<unknown>).detail));
    movePointer(canvas, 50, 80);
    player.seek(1000);
    expect(fill(host, "source")).toBe("#ffffff");
    expect(hits.at(-1)).toBeNull();
    player.seek(2000);
    expect(fill(host, "source")).toBe("#eaf1ff");
    player.seek(3000);
    expect(fill(host, "source")).toBeNull();
    expect(hits.at(-1)).toBeNull();
  });

  it("uses the current theme, preserves hover after rejected load, and detaches on destroy", () => {
    const { host, canvas, player } = mountPlayer({ ...document, theme: "dark" });
    let events = 0;
    host.addEventListener("hover", () => { events += 1; });
    movePointer(canvas, 50, 80);
    expect(fill(host, "source")).toBe("#233b60");
    player.load({ ...document, version: 2 } as unknown as DiagramDocument);
    player.seek(100);
    expect(fill(host, "source")).toBe("#233b60");
    const eventsBeforeDestroy = events;
    player.destroy();
    movePointer(canvas, 50, 80);
    canvas.dispatchEvent(new MouseEvent("pointerleave"));
    expect(host.children).toHaveLength(0);
    expect(events).toBe(eventsBeforeDestroy);
  });
});
