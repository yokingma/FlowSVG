// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { createPlayer, type FlowPlayer } from "../browser.js";
import { createDiagram, type DiagramDocument } from "../index.js";

const document: DiagramDocument = {
  version: 1, theme: "dark", viewport: { width: 400, height: 400 },
  nodes: [{ id: "facts", kind: "rect", x: 20, y: 20, width: 240, height: 300,
    content: { blocks: [{ type: "title", text: "Facts" }, { type: "list", items: [{ tags: [{ text: "world" },
      { text: "custom", style: { color: "#fedcba", fill: "#123456" } }], status: "new", body: "Record", auxiliary: "Date" }] }] } }],
  edges: [], scenes: []
};
const players: FlowPlayer[] = [];
afterEach(() => {
  players.splice(0).forEach((player) => player.destroy());
  window.document.body.replaceChildren();
});
function mount(input = document) {
  const host = window.document.createElement("div");
  window.document.body.append(host);
  const player = createPlayer(host, input, { controls: false, reducedMotion: false, hoverFill: true });
  players.push(player);
  const canvas = host.querySelector<HTMLElement>(".flowsvg-canvas")!;
  host.querySelector("svg")!.getBoundingClientRect = () => ({ x: 0, y: 0, left: 0, top: 0, right: 400, bottom: 400, width: 400, height: 400, toJSON: () => ({}) });
  return { host, canvas, player };
}
function move(canvas: HTMLElement, x = 50, y = 50) {
  canvas.dispatchEvent(new MouseEvent("pointermove", { bubbles: true, clientX: x, clientY: y }));
}
function textColor(host: HTMLElement, text: string) {
  return [...host.querySelectorAll("tspan")].find((span) => span.textContent === text)?.getAttribute("fill");
}
function expectCoreSvg(host: HTMLElement, input: DiagramDocument, time = 0) {
  const expected = window.document.createElement("div");
  expected.innerHTML = createDiagram(input).renderSvg(time);
  expect(host.querySelector("svg")?.outerHTML).toBe(expected.querySelector("svg")?.outerHTML);
}

describe("node content hover paint", () => {
  it("paints every semantic role together, preserves author colors and keeps hover out of core frames/exports", () => {
    const { host, canvas, player } = mount();
    expectCoreSvg(host, document);
    move(canvas);
    expect(textColor(host, "Facts")).toBe("#f2f4f7");
    expect(textColor(host, "Record")).toBe("#f2f4f7");
    expect(textColor(host, "Date")).toBe("#b8c2d1");
    expect(textColor(host, "world")).toBe("#caddff");
    expect(textColor(host, "new")).toBe("#9bbfff");
    expect(textColor(host, "custom")).toBe("#fedcba");
    expect([...host.querySelectorAll('[data-content-id="facts"] rect')].map((tag) => tag.getAttribute("fill"))).toEqual(["#253b5c", "#123456"]);
    expect(player.getState().frame).toEqual(createDiagram(document).evaluateAt(0));
    canvas.dispatchEvent(new MouseEvent("pointerleave"));
    expectCoreSvg(host, document);
  });
  it("keeps current content and paint through hover, flow expiry, replacements, text modes and stationary geometry changes", () => {
    const input: DiagramDocument = { ...document,
      nodes: [...document.nodes, { id: "service", kind: "rect", x: 300, y: 30, width: 80, height: 80, label: "Service" }],
      edges: [{ id: "request", from: "facts", to: "service" }],
      scenes: [{ id: "lifecycle", label: "Lifecycle", beats: [
        { durationMs: 100, transitionMs: 0, actions: [] },
        { durationMs: 100, transitionMs: 0, actions: [{ type: "flow", target: "request", direction: "forward" }] },
        { durationMs: 100, transitionMs: 0, actions: [{ type: "updateNode", target: "facts", value: { content: { blocks: [
          { type: "title", text: "Current" }, { type: "paragraph", text: "Custom", style: { color: "#abcdef" } }
        ] } } }] },
        { durationMs: 100, transitionMs: 0, actions: [{ type: "updateNode", target: "facts", value: { label: "Simple" } }] },
        { durationMs: 100, transitionMs: 0, actions: [{ type: "updateNode", target: "facts", value: { content: null } }] },
        { durationMs: 100, transitionMs: 0, actions: [{ type: "updateNode", target: "facts", value: { width: 25, height: 25 } }] }
      ] }]
    };
    const beats = createDiagram(input).beats;
    const timeAt = (index: number): number => beats[index]!.startMs + 50;
    const { host, canvas, player } = mount(input);
    move(canvas);
    player.seek(timeAt(1));
    canvas.dispatchEvent(new MouseEvent("pointerleave"));
    expectCoreSvg(host, input, timeAt(1));
    expect(textColor(host, "Facts")).toBe("#f2f4f7");
    move(canvas);
    player.seek(timeAt(2));
    expect(textColor(host, "Current")).toBe("#f2f4f7");
    expect(textColor(host, "Custom")).toBe("#abcdef");
    expect(textColor(host, "Facts")).toBeUndefined();
    canvas.dispatchEvent(new MouseEvent("pointerleave"));
    expectCoreSvg(host, input, timeAt(2));
    expect(textColor(host, "Current")).toBe("#f2f4f7");
    move(canvas);
    player.seek(timeAt(3));
    expect(host.querySelector("[data-content-id]")).toBeNull();
    expect(host.querySelector("svg text")?.textContent).toBe("Simple");
    player.seek(timeAt(4));
    expect([...host.querySelectorAll("svg text")].map((text) => text.textContent)).toEqual(["Service"]);
    expect(host.querySelector('[data-id="facts"]')?.getAttribute("fill")).toBe("#233b60");
    player.seek(timeAt(5));
    expectCoreSvg(host, input, timeAt(5));
    player.seek(timeAt(2));
    expect(textColor(host, "Current")).toBe("#f2f4f7");
    player.load({ ...document, theme: "light" });
    expectCoreSvg(host, { ...document, theme: "light" });
    move(canvas);
    expect(textColor(host, "Facts")).toBe("#1d2939");
    let interactions = 0;
    host.addEventListener("hover", () => { interactions += 1; });
    player.destroy();
    move(canvas);
    expect(interactions).toBe(0);
    expect(host.children).toHaveLength(0);
  });

  it("returns only the node identity for decorative content and clips overflow out of hit bounds", () => {
    const input: DiagramDocument = { ...document, nodes: [{ ...document.nodes[0]!, height: 100 }] };
    const { host, canvas } = mount(input);
    const hits: unknown[] = [];
    host.addEventListener("click", (event) => hits.push((event as CustomEvent<unknown>).detail));
    for (const element of [host.querySelector("tspan")!, host.querySelector("[data-content-id] rect")!]) {
      element.dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: 50, clientY: 70 }));
      expect(hits.at(-1)).toMatchObject({ id: "facts", type: "node" });
    }
    expect(host.querySelector('[data-content-id] [data-id], [data-content-id] [id], [data-content-id] [tabindex], [data-content-id] a, [data-content-id] button')).toBeNull();
    canvas.dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: 50, clientY: 160 }));
    expect(hits.at(-1)).toBeNull();
    expect(createDiagram(input).hitTest(0, { x: 50, y: 160 })).toBeNull();
  });

});
