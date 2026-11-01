// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { createDiagram, type DiagramDocument } from "../index.js";

const document: DiagramDocument = {
  version: 1, viewport: { width: 500, height: 240 },
  nodes: [
    { id: "source", kind: "roundedRect", x: 20, y: 80, width: 140, height: 80, label: "Source" },
    { id: "target", kind: "cylinder", x: 340, y: 80, width: 140, height: 80, label: "Target" }
  ],
  edges: [{ id: "request", from: "source", to: "target", label: "Request" }],
  scenes: [{ id: "scene", label: "Scene", beats: [
    { durationMs: 1000, actions: [] },
    { durationMs: 1000, transitionMs: 1000, actions: [{ type: "highlight", target: "source" }, { type: "highlight", target: "request" }] },
    { durationMs: 1000, transitionMs: 0, actions: [
      { type: "unhighlight", target: "source" }, { type: "unhighlight", target: "request" },
      { type: "flow", target: "request", direction: "forward", text: "Payload" }
    ] },
    { durationMs: 1000, actions: [] }
  ] }]
};

describe("default visual style", () => {
  it.each(["light", "dark"] as const)("rounds group borders by default in %s, including small nested groups", (theme) => {
    const diagram = createDiagram({
      version: 1, viewport: { width: 320, height: 240 },
      nodes: [
        { id: "outer", kind: "group", x: 20, y: 20, width: 280, height: 200, style: { dashed: true } },
        { id: "inner", kind: "group", parentId: "outer", x: 20, y: 40, width: 16, height: 12 },
        { id: "plain", kind: "rect", x: 100, y: 100, width: 80, height: 60 }
      ],
      edges: [], scenes: []
    });
    const svg = new DOMParser().parseFromString(diagram.renderSvg(0, { theme }), "image/svg+xml");
    const outer = svg.querySelector('[data-id="outer"]')!;
    const inner = svg.querySelector('[data-id="inner"]')!;
    expect(outer.getAttribute("rx")).toBe("8");
    expect(outer.getAttribute("stroke-dasharray")).toBe("10 7");
    expect(inner.getAttribute("rx")).toBe("3");
    expect(inner.getAttribute("x")).toBe("40");
    expect(inner.getAttribute("y")).toBe("60");
    expect(svg.querySelector('[data-id="plain"]')!.getAttribute("rx")).toBeNull();
  });

  it.each(["light", "dark"] as const)("keeps %s node labels plain and edge labels isolated while preserving authored styles", (theme) => {
    const styled: DiagramDocument = { ...document, scenes: [], nodes: document.nodes.map((node) => node.id === "source"
      ? { ...node, style: { fill: "#abc123", stroke: "#456789", strokeWidth: 3, textColor: "#123456" } } : node) };
    const diagram = createDiagram(styled);
    expect(diagram.evaluateAt(0, { theme }).nodes[0]!.style).toEqual({ fill: "#abc123", stroke: "#456789", strokeWidth: 3, textColor: "#123456" });
    const svg = new DOMParser().parseFromString(diagram.renderSvg(0, { theme }), "image/svg+xml");
    const labels = [...svg.querySelectorAll("text")];
    const nodeLabel = labels.find((label) => label.textContent === "Source")!;
    expect(nodeLabel.getAttribute("stroke")).toBeNull();
    expect(nodeLabel.getAttribute("fill")).toBe("#123456");
    expect(labels.find((label) => label.textContent === "Request")?.getAttribute("stroke"))
      .toBe(theme === "dark" ? "#101828" : "#ffffff");
  });

  it.each([
    { theme: "light", fill: "#eaf1ff", stroke: "#2a63c8", ink: "#ffffff", normalFill: "#ffffff" },
    { theme: "dark", fill: "#233b60", stroke: "#8ab4f8", ink: "#101828", normalFill: "#1d2939" }
  ] as const)("uses distinct highlight fill and stroke with readable flow text in $theme", ({ theme, fill, stroke, ink, normalFill }) => {
    const diagram = createDiagram(document);
    const settledTime = diagram.beats[2]!.endMs - 300;
    for (const reducedMotion of [false, true]) {
      const frame = diagram.evaluateAt(settledTime, { theme, reducedMotion });
      for (const node of frame.nodes) expect(node.style).toMatchObject({ fill, stroke, strokeWidth: 1.2 });
      expect(frame.edges[0]!.style.stroke).toBe(stroke);
      const svg = new DOMParser().parseFromString(diagram.renderSvg(settledTime, { theme, reducedMotion }), "image/svg+xml");
      const marker = svg.querySelector('[data-flow-id="request"]');
      if (reducedMotion) expect(marker).toBeNull();
      else {
        expect(marker?.getAttribute("fill")).toBe(stroke);
        expect(marker?.querySelector("text")?.getAttribute("fill")).toBe(ink);
      }
    }
    const middle = diagram.evaluateAt(1500, { theme }).nodes[0]!.style;
    expect(middle.fill).not.toBe(normalFill);
    expect(middle.fill).not.toBe(fill);
    expect(middle.fill).not.toBe(middle.stroke);
    expect(diagram.evaluateAt(diagram.beats[3]!.startMs, { theme }).nodes[0]!.style.fill).toBe(normalFill);
  });
});
