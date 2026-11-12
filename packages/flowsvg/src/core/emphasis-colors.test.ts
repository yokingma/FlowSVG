// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { createDiagram, validateDocument, DiagramValidationError, type DiagramDocument, type EmphasisColors } from "../index.js";

const document: DiagramDocument = {
  version: 1, viewport: { width: 500, height: 240 },
  nodes: [
    { id: "source", kind: "rect", x: 20, y: 80, width: 140, height: 80, label: "Source" },
    { id: "target", kind: "rect", x: 340, y: 80, width: 140, height: 80, label: "Target" }
  ],
  edges: [{ id: "request", from: "source", to: "target", label: "Request" }],
  scenes: [{ id: "scene", label: "Scene", beats: [
    { durationMs: 1000, transitionMs: 0, actions: [{ type: "highlight", target: "source" }, { type: "highlight", target: "request" }] },
    { durationMs: 1000, transitionMs: 0, actions: [
      { type: "unhighlight", target: "source" }, { type: "unhighlight", target: "request" },
      { type: "flow", target: "request", direction: "forward", text: "Payload" }
    ] },
    { durationMs: 1000, actions: [] }
  ] }]
};

describe("document emphasis colors", () => {
  it.each(["light", "dark"] as const)("falls back field by field in %s without changing normal paint or geometry", (theme) => {
    const base = createDiagram(document);
    for (const emphasis of [undefined, {}, { fill: undefined, stroke: undefined, markerText: undefined }]) {
      expect(createDiagram({ ...document, emphasis }).renderSvg(500, { theme })).toBe(base.renderSvg(500, { theme }));
    }
    const diagram = createDiagram({ ...document, emphasis: { stroke: "#b45309" } });
    const frame = diagram.evaluateAt(0, { theme });
    expect(frame.nodes[0]!.style.fill).toBe(theme === "dark" ? "#233b60" : "#eaf1ff");
    expect(frame.nodes[0]!.style.stroke).toBe("#b45309");
    expect(frame.nodes[1]!.style.fill).toBe(theme === "dark" ? "#1d2939" : "#ffffff");
    expect(diagram.beats).toEqual(base.beats);
    expect(diagram.hitTest(0, { x: 50, y: 100 }, { theme })).toEqual(base.hitTest(0, { x: 50, y: 100 }, { theme }));
    expect(diagram.diagnoseAt(0, { theme })).toEqual(base.diagnoseAt(0, { theme }));
  });

  it.each(["#aBc", "#aBcD", "#AaBbCc", "#AaBbCcDd"])("accepts hexadecimal emphasis %s including alpha", (color) => {
    const emphasis: EmphasisColors = { fill: color, stroke: color, markerText: color };
    const diagram = createDiagram({ ...document, emphasis });
    expect(diagram.evaluateAt(0).nodes[0]!.style.fill).toBe(color);
    const svg = diagram.renderSvg(diagram.beats[1]!.endMs - 300);
    expect(svg).toContain(`fill="${color}"`);
  });

  it.each([
    [null, "emphasis"], [[], "emphasis"], ["#abc", "emphasis"],
    [{ fill: null }, "emphasis.fill"], [{ fill: "red" }, "emphasis.fill"],
    [{ stroke: "var(--color)" }, "emphasis.stroke"], [{ markerText: "#12" }, "emphasis.markerText"],
    [{ unknown: "#abc" }, "emphasis.unknown"]
  ])("reports invalid unused emphasis %# with its document path", (emphasis, path) => {
    const input = { ...document, scenes: [], emphasis };
    expect(validateDocument(input)).toContainEqual(expect.objectContaining({ path }));
    expect(() => createDiagram(input as unknown as DiagramDocument)).toThrow(DiagramValidationError);
  });

  it("snapshots authored emphasis at compilation", () => {
    const input = { ...document, emphasis: { fill: "#fff4db", stroke: "#b45309", markerText: "#112233" } };
    const diagram = createDiagram(input);
    const before = diagram.renderSvg(diagram.beats[1]!.endMs - 300);
    input.emphasis.fill = "#000000";
    input.emphasis.stroke = "#ffffff";
    input.emphasis.markerText = "#ff0000";
    expect(diagram.renderSvg(diagram.beats[1]!.endMs - 300)).toBe(before);
  });

  it.each(["light", "dark"] as const)("shares authored %s colors across explicit highlights, flow and SVG", (theme) => {
    const diagram = createDiagram({ ...document, emphasis: { fill: "#fff4db", stroke: "#b45309", markerText: "#112233" } });
    const explicit = diagram.evaluateAt(0, { theme });
    expect(explicit.nodes[0]!.style).toMatchObject({ fill: "#fff4db", stroke: "#b45309" });
    expect(explicit.edges[0]!.style.stroke).toBe("#b45309");
    const time = diagram.beats[1]!.endMs - 300;
    const flow = diagram.evaluateAt(time, { theme });
    for (const node of flow.nodes) expect(node.style).toMatchObject({ fill: "#fff4db", stroke: "#b45309" });
    const svg = new DOMParser().parseFromString(diagram.renderSvg(time, { theme }), "image/svg+xml");
    expect(svg.querySelector('[data-flow-id="request"]')?.getAttribute("fill")).toBe("#b45309");
    expect(svg.querySelector('[data-flow-id="request"] text')?.getAttribute("fill")).toBe("#112233");
    expect(flow.nodes[0]!.style.textColor).toBe(theme === "dark" ? "#f2f4f7" : "#1d2939");
  });
});
