import { describe, expect, it } from "vitest";
import { createDiagram, type DiagramDocument, type DiagramNode } from "../index.js";

const makeNode = (id: string, x: number, y: number, width = 40, height = 40): DiagramNode => ({ id, kind: "rect", x, y, width, height });
const documentWith = (nodes: DiagramNode[], edges: DiagramDocument["edges"] = []): DiagramDocument => ({
  version: 1, viewport: { width: 600, height: 400 }, nodes, edges, scenes: []
});

const replaceNode = (document: DiagramDocument, index: number, node: DiagramNode): DiagramDocument => ({
  ...document, nodes: document.nodes.map((entry, cursor) => cursor === index ? node : entry)
});
const replaceEdge = (document: DiagramDocument, index: number, edge: DiagramDocument["edges"][number]): DiagramDocument => ({
  ...document, edges: document.edges.map((entry, cursor) => cursor === index ? edge : entry)
});

const crossingDocument = (): DiagramDocument => documentWith([
  makeNode("from", 20, 100), makeNode("to", 400, 100), makeNode("barrier", 200, 100)
], [{ id: "edge", from: "from", to: "to", route: "straight" }]);

describe("on-demand geometry diagnostics", () => {
  it("reports a crossed unrelated node with stable role and field identity, excluding endpoints and groups", () => {
    const document = crossingDocument();
    const withGroup: DiagramDocument = { ...document, nodes: [...document.nodes, { ...makeNode("group", 100, 80, 200, 100), kind: "group" }] };
    const diagram = createDiagram(withGroup);
    const warnings = diagram.diagnoseAt(0);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatchObject({ code: "edge-node-overlap", objectId: "edge", relatedObjectIds: ["barrier"], path: "edges[0]" });
    expect(JSON.parse(warnings[0]!.warningKey)).toEqual([
      "flowsvg-layout-warning", 1, "edge-node-overlap",
      ["edge", "edge", "path", "edges[0]"], ["node", "barrier", "shape", "nodes[2]"]
    ]);
    expect(diagram.diagnoseAt(0)).toEqual(warnings);
    expect(diagram.evaluateAt(0).warnings).toEqual([]);
  });
});


describe("shape-aware path paint", () => {
  it.each(["rect", "roundedRect", "ellipse", "cylinder"] as const)("checks %s filled contours rather than bounds", (kind) => {
    const document = documentWith([
      makeNode("from", 90, 92, 20, 20), makeNode("to", 190, -8, 20, 20),
      { ...makeNode("barrier", 140, 60), kind, style: { stroke: "#0000" } }
    ], [{ id: "edge", from: "from", to: "to", route: "straight", style: { strokeWidth: 0.1 } }]);
    expect(createDiagram(document).diagnoseAt(0).some(({ code }) => code === "edge-node-overlap")).toBe(kind === "rect");
    const centered = crossingDocument();
    const centeredShape: DiagramDocument = replaceNode(centered, 2, { ...centered.nodes[2]!, kind });
    expect(createDiagram(centeredShape).diagnoseAt(0).some(({ code }) => code === "edge-node-overlap")).toBe(true);
  });

  it.each([121, 121.0001])("allows a painted tangent or narrow gap at y=%s", (y) => {
    const document = crossingDocument();
    const touchingBarrier: DiagramDocument = replaceNode(document, 2, { ...document.nodes[2]!, y, style: { stroke: "#0000" } });
    expect(createDiagram(touchingBarrier).diagnoseAt(0)).toEqual([]);
  });

  it("detects a very narrow obstacle between route sample vertices", () => {
    const document = crossingDocument();
    const narrowBarrier: DiagramDocument = replaceNode(document, 2, { ...document.nodes[2]!, x: 231.123, width: 0.01 });
    expect(createDiagram(narrowBarrier).diagnoseAt(0)).toHaveLength(1);
  });

  it("keeps a transparent node hollow while retaining its painted outline", () => {
    const document = crossingDocument();
    const hollowContainer: DiagramDocument = replaceNode(document, 2, { ...makeNode("barrier", 0, 0, 500, 300), style: { fill: "#0000", stroke: "#000", strokeWidth: 2 } });
    expect(createDiagram(hollowContainer).diagnoseAt(0)).toEqual([]);
    const hollowBarrier: DiagramDocument = replaceNode(hollowContainer, 2, { ...hollowContainer.nodes[2]!, x: 200, width: 40 });
    expect(createDiagram(hollowBarrier).diagnoseAt(0)).toHaveLength(1);
    const unpaintedBarrier: DiagramDocument = replaceNode(hollowBarrier, 2, { ...hollowBarrier.nodes[2]!, style: { fill: "#00000000", stroke: "#0000" } });
    expect(createDiagram(unpaintedBarrier).diagnoseAt(0)).toEqual([]);
  });
});

describe("visible ordinary labels", () => {
  it("reports an overflowing label against unrelated nodes, while excluding its own shape", () => {
    const document = documentWith([
      { ...makeNode("label", 100, 100, 80, 10), label: "one\ntwo\nthree" }, makeNode("barrier", 125, 75, 30, 15)
    ]);
    const diagram = createDiagram(document);
    expect(diagram.evaluateAt(0).warnings).toMatchObject([{ code: "text-overflow" }]);
    expect(diagram.diagnoseAt(0)).toMatchObject([{ code: "label-node-overlap", objectId: "label", relatedObjectIds: ["barrier"], path: "nodes[0].label" }]);
  });

  it("warns when a group title covers a child but allows child labels inside ancestor shapes", () => {
    const document = documentWith([
      { ...makeNode("group", 100, 50, 300, 200), kind: "group", label: "Group" },
      { ...makeNode("child", 125, 10, 50, 40), parentId: "group", label: "Child" }
    ]);
    const warnings = createDiagram(document).diagnoseAt(0);
    expect(warnings.some(({ code, objectId, relatedObjectIds }) => code === "label-node-overlap" && objectId === "group" && relatedObjectIds.includes("child"))).toBe(true);
    expect(warnings.some(({ code, objectId }) => code === "label-node-overlap" && objectId === "child")).toBe(false);
  });

  it("does not apply edge endpoint exclusions to edge labels", () => {
    const document = documentWith([makeNode("from", 20, 100), makeNode("to", 62, 100)],
      [{ id: "edge", from: "from", to: "to", route: "straight", label: "W" }]);
    expect(createDiagram(document).diagnoseAt(0).filter(({ code }) => code === "label-node-overlap")).toHaveLength(2);
  });
});

describe("label pair identity", () => {
  it("keeps A–B and A–C separate and canonicalizes symmetric line pairs", () => {
    const document = documentWith([
      { ...makeNode("a", 100, 100), label: "A" }, { ...makeNode("b", 100, 100), label: "B" },
      { ...makeNode("c", 100, 100), label: "C" }
    ]);
    const warnings = createDiagram(document).diagnoseAt(0).filter(({ code }) => code === "label-overlap");
    expect(warnings).toHaveLength(3);
    expect(new Set(warnings.map(({ warningKey }) => warningKey)).size).toBe(3);
    for (const warning of warnings) {
      const parts: unknown[] = JSON.parse(warning.warningKey);
      expect(JSON.stringify(parts[3]) < JSON.stringify(parts[4])).toBe(true);
    }
  });

  it("allows separated and touching labels", () => {
    const document = documentWith([
      { ...makeNode("a", 100, 100), label: "A" }, { ...makeNode("b", 108.5, 100), label: "B" }
    ]);
    expect(createDiagram(document).diagnoseAt(0).filter(({ code }) => code === "label-overlap")).toEqual([]);
    const separatedLabels: DiagramDocument = replaceNode(document, 1, { ...document.nodes[1]!, x: 108.5001 });
    expect(createDiagram(separatedLabels).diagnoseAt(0).filter(({ code }) => code === "label-overlap")).toEqual([]);
  });
});

describe("structured visible text", () => {
  it("collects one logical label per line across differently styled spans", () => {
    const document = documentWith([
      { ...makeNode("content", 100, 100, 160, 80), content: { style: { padding: 0 }, blocks: [{ type: "paragraph", text: [
        { text: "A", style: { fontSize: 20 } }, { text: "B", style: { fontSize: 10 } }
      ] }] } }, makeNode("barrier", 100, 100, 40, 25)
    ]);
    const warnings = createDiagram(document).diagnoseAt(0);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatchObject({ code: "label-node-overlap", objectId: "content", path: "nodes[0].content.blocks[0].text" });
  });

  it("clips structured text to safeArea while preserving the visible portion", () => {
    const document = documentWith([
      { ...makeNode("content", 100, 100, 80, 10), content: { style: { padding: 0 }, blocks: [{ type: "paragraph", text: "ABC" }] } },
      makeNode("barrier", 100, 111, 30, 10)
    ]);
    expect(createDiagram(document).diagnoseAt(0)).toEqual([]);
    const visiblePortion: DiagramDocument = replaceNode(document, 1, { ...document.nodes[1]!, y: 105 });
    expect(createDiagram(visiblePortion).diagnoseAt(0)).toHaveLength(1);
  });

  it("does not invent paint in a transparent span gap", () => {
    const document = documentWith([
      { ...makeNode("content", 100, 100, 200, 60), content: { style: { padding: 0 }, blocks: [{ type: "paragraph", text: [
        { text: "A" }, { text: "MMMM", style: { color: "#0000" } }, { text: "B" }
      ] }] } }, makeNode("barrier", 120, 102, 20, 8)
    ]);
    expect(createDiagram(document).diagnoseAt(0)).toEqual([]);
  });

  it("preserves distinct same-node graph label pairs and each line's identity", () => {
    const document = documentWith([{ ...makeNode("content", 100, 100, 200, 150), content: { blocks: [{ type: "graph", height: 100,
      nodes: [{ id: "a", label: "A", x: 50, y: 50 }, { id: "b", label: "B", x: 50, y: 50 }, { id: "c", label: "C", x: 50, y: 50 }], edges: [] }] } }]);
    const warnings = createDiagram(document).diagnoseAt(0);
    expect(warnings).toHaveLength(3);
    expect(warnings.every(({ code, objectId, relatedObjectIds }) => code === "label-overlap" && objectId === "content" && relatedObjectIds[0] === "content")).toBe(true);
    expect(new Set(warnings.map(({ warningKey }) => warningKey)).size).toBe(3);
    expect(warnings.map(({ warningKey }) => warningKey).join(" ")).toContain("nodes[0].content.blocks[0]");
  });
});

describe("paint and camera boundaries", () => {
  it("keeps the square miter at a transparent rectangle's painted corner", () => {
    const document = documentWith([
      { ...makeNode("label", 98.2, 98.2, 2, 2), label: "A" },
      { ...makeNode("barrier", 100, 100), style: { fill: "#0000", stroke: "#000", strokeWidth: 2 } }
    ]);
    const smallTypography: DiagramDocument = { ...document, typography: { nodeLabel: 0.2 } };
    expect(createDiagram(smallTypography).diagnoseAt(0)).toHaveLength(1);
  });
});

describe("current visible state", () => {
  it("clips both participants before deciding an overlap near an ellipse", () => {
    const document = documentWith([
      { ...makeNode("label", 180, 65.4), label: "A", style: { fill: "#0000", stroke: "#0000" } },
      { ...makeNode("barrier", 190, 90, 60, 60), kind: "ellipse", style: { stroke: "#0000" } }
    ]);
    const clippedViewport: DiagramDocument = { ...document, viewport: { width: 200, height: 200 } };
    expect(createDiagram(clippedViewport).diagnoseAt(0)).toEqual([]);
    const widerViewport: DiagramDocument = { ...clippedViewport, viewport: { ...clippedViewport.viewport, width: 230 } };
    expect(createDiagram(widerViewport).diagnoseAt(0)).toHaveLength(1);
  });

  it("clips all three risk classes at the current camera and focus", () => {
    const document = crossingDocument();
    const overlappingLabels: DiagramDocument = { ...document, nodes: [...document.nodes, { ...makeNode("a", 200, 100), label: "A" }, { ...makeNode("b", 200, 100), label: "B" }] };
    const withFocusTarget: DiagramDocument = { ...overlappingLabels, nodes: [...overlappingLabels.nodes, makeNode("focus", 10, 300, 10, 10)] };
    const diagram = createDiagram({ ...withFocusTarget, scenes: [{ id: "s", label: "Focus", beats: [{ durationMs: 1000, transitionMs: 0,
      actions: [{ type: "focus", target: "focus" }] }] }] });
    expect(createDiagram(withFocusTarget).diagnoseAt(0).map(({ code }) => code)).toEqual(expect.arrayContaining(["edge-node-overlap", "label-node-overlap", "label-overlap"]));
    expect(diagram.diagnoseAt(0)).toEqual([]);
  });

  it("uses effective opacity independently from transparent paint and hidden state", () => {
    const document = crossingDocument();
    const labelledBarrier: DiagramDocument = replaceNode(document, 2, { ...document.nodes[2]!, label: "Barrier" });
    const diagram = createDiagram({ ...labelledBarrier, scenes: [{ id: "s", label: "Fade", beats: [{ durationMs: 1000, transitionMs: 1000,
      actions: [{ type: "updateNode", target: "barrier", value: { opacity: 0 } }] }] }] });
    expect(diagram.diagnoseAt(0).length).toBeGreaterThan(0);
    expect(diagram.diagnoseAt(500).length).toBeGreaterThan(0);
    expect(diagram.diagnoseAt(1000)).toEqual([]);
    const hidden = createDiagram({ ...labelledBarrier, nodes: labelledBarrier.nodes.map((node) => node.id === "barrier" ? { ...node, visible: false } : node) });
    expect(hidden.diagnoseAt(0)).toEqual([]);
  });

  it("excludes reveal-start and ancestor zero opacity, including child text", () => {
    const document = crossingDocument();
    const hiddenBarrier: DiagramDocument = replaceNode(document, 2, { ...document.nodes[2]!, visible: false, label: "Barrier" });
    const reveal = createDiagram({ ...hiddenBarrier, scenes: [{ id: "s", label: "Reveal", beats: [{ durationMs: 1000, transitionMs: 1000,
      actions: [{ type: "show", target: "barrier" }] }] }] });
    expect(reveal.evaluateAt(0).nodes[2]).toMatchObject({ visible: true, opacity: 0 });
    expect(reveal.diagnoseAt(0)).toEqual([]);
    expect(reveal.diagnoseAt(500).length).toBeGreaterThan(0);
    const parent = documentWith([{ ...makeNode("group", 0, 0, 600, 400), kind: "group" },
      { ...makeNode("a", 100, 100), parentId: "group", label: "A" }, { ...makeNode("b", 100, 100), label: "B" }]);
    const faded = createDiagram({ ...parent, scenes: [{ id: "s", label: "Fade", beats: [{ durationMs: 1000, transitionMs: 0,
      actions: [{ type: "updateNode", target: "group", value: { opacity: 0 } }] }] }] });
    expect(faded.diagnoseAt(0)).toEqual([]);
  });

  it("keeps edge-label halos visible when the edge stroke is transparent", () => {
    const document = documentWith([makeNode("from", 20, 100), makeNode("to", 62, 100)],
      [{ id: "edge", from: "from", to: "to", route: "straight", label: "W", style: { stroke: "#0000" } }]);
    expect(createDiagram(document).diagnoseAt(0)).toHaveLength(2);
    const withoutLabel: DiagramDocument = replaceEdge(document, 0, { ...document.edges[0]!, label: undefined });
    expect(createDiagram(withoutLabel).diagnoseAt(0)).toEqual([]);
  });

  it("checks visible text even when its owner shape has no paint", () => {
    const document = documentWith([
      { ...makeNode("label", 100, 100), label: "A", style: { fill: "#0000", stroke: "#00000000" } }, makeNode("barrier", 110, 110)
    ]);
    expect(createDiagram(document).diagnoseAt(0)).toHaveLength(1);
    const transparentText: DiagramDocument = replaceNode(document, 0, { ...document.nodes[0]!, style: { ...document.nodes[0]!.style, textColor: "#1230" } });
    expect(createDiagram(transparentText).diagnoseAt(0)).toEqual([]);
  });

  it.each(["roundedRect", "ellipse", "cylinder"] as const)("excludes label paint outside a %s's true corner", (kind) => {
    const document = documentWith([
      { ...makeNode("label", 139.5, 59.5, 2, 2), label: "A" },
      { ...makeNode("barrier", 140, 60), kind, style: { stroke: "#0000" } }
    ]);
    const cornerLabel: DiagramDocument = { ...document, typography: { nodeLabel: 0.2 } };
    expect(createDiagram(cornerLabel).diagnoseAt(0)).toEqual([]);
    const centeredLabel: DiagramDocument = replaceNode(cornerLabel, 0, { ...cornerLabel.nodes[0]!, x: 159, y: 79 });
    expect(createDiagram(centeredLabel).diagnoseAt(0)).toHaveLength(1);
  });
});

describe("shared path and frame contracts", () => {
  it("follows sampled curved routes rather than the straight endpoint chord", () => {
    const document = documentWith([makeNode("from", 20, 100), makeNode("to", 400, 100), makeNode("barrier", 210, 0, 40, 20)],
      [{ id: "edge", from: "from", to: "to", route: "curved", fromPort: "top", toPort: "top" }]);
    expect(createDiagram(document).diagnoseAt(0)).toHaveLength(1);
    const straightRoute: DiagramDocument = replaceEdge(document, 0, { ...document.edges[0]!, route: "straight" });
    expect(createDiagram(straightRoute).diagnoseAt(0)).toEqual([]);
    const orthogonalRoute: DiagramDocument = replaceEdge(straightRoute, 0, { ...straightRoute.edges[0]!, route: "orthogonal" });
    expect(createDiagram(orthogonalRoute).diagnoseAt(0)).toEqual([]);
  });

  it("uses effective typography and position without changing the source, frame or compiled timing", () => {
    const document = crossingDocument();
    const movingBarrier: DiagramDocument = { ...document, scenes: [{ id: "s", label: "Move", beats: [{ durationMs: 1000, transitionMs: 1000,
      actions: [{ type: "updateNode", target: "barrier", value: { y: 200 } }] }] }] };
    const before = structuredClone(movingBarrier);
    const diagram = createDiagram(movingBarrier);
    const frame = diagram.evaluateAt(500);
    const svg = diagram.renderSvg(500);
    const beats = diagram.beats;
    expect(diagram.diagnoseAt(0)).toHaveLength(1);
    expect(diagram.diagnoseAt(1000)).toEqual([]);
    expect(diagram.diagnoseAt(Number.NaN)).toEqual(diagram.diagnoseAt(0));
    expect(diagram.diagnoseAt(-1)).toEqual(diagram.diagnoseAt(0));
    expect(diagram.diagnoseAt(2000)).toEqual(diagram.diagnoseAt(1000));
    expect(diagram.evaluateAt(500)).toEqual(frame);
    expect(diagram.renderSvg(500)).toBe(svg);
    expect(diagram.totalDuration).toBe(1000);
    expect(diagram.beats).toBe(beats);
    expect(movingBarrier).toEqual(before);
    const labels = documentWith([{ ...makeNode("a", 100, 100), label: "A" }, { ...makeNode("b", 112, 100), label: "B" }]);
    expect(createDiagram(labels).diagnoseAt(0).filter(({ code }) => code === "label-overlap")).toEqual([]);
    expect(createDiagram({ ...labels, typography: { nodeLabel: 32 } }).diagnoseAt(0).filter(({ code }) => code === "label-overlap")).toHaveLength(1);
  });

  it("keeps content fields and line positions distinct within one owner", () => {
    const document = documentWith([{ ...makeNode("content", 100, 100, 200, 150), content: { style: { padding: 0, blockGap: 0 }, blocks: [
      { type: "paragraph", text: "A", style: { align: "center" } },
      { type: "graph", height: 100, nodes: [{ id: "b", label: "B", x: 100, y: 0 }, { id: "c", label: "C", x: 100, y: 0 }], edges: [] }
    ] } }]);
    const warnings = createDiagram(document).diagnoseAt(0).filter(({ code }) => code === "label-overlap");
    expect(warnings).toHaveLength(3);
    expect(new Set(warnings.map(({ warningKey }) => warningKey)).size).toBe(3);
    expect(warnings.some(({ warningKey }) => warningKey.includes("blocks[0].text") && warningKey.includes("blocks[1].nodes"))).toBe(true);
  });

  it("keeps visible cylinder cap seams and semi-transparent fills eligible", () => {
    const document = documentWith([
      { ...makeNode("label", 205, 99, 10, 10), label: "A" },
      { ...makeNode("barrier", 100, 90, 300, 150), kind: "cylinder", style: { fill: "#0000", stroke: "#0008", strokeWidth: 2 } }
    ]);
    const seamLabel: DiagramDocument = { ...document, typography: { nodeLabel: 1 } };
    expect(createDiagram(seamLabel).diagnoseAt(0)).toHaveLength(1);
    const translucentFill: DiagramDocument = replaceNode(seamLabel, 1, { ...seamLabel.nodes[1]!, style: { fill: "#00000080", stroke: "#0000" } });
    expect(createDiagram(translucentFill).diagnoseAt(0)).toHaveLength(1);
  });

  it("returns stable theme/reduced-motion results without including flow capsules as labels", () => {
    const document = documentWith([makeNode("from", 20, 100), makeNode("to", 400, 100)], [{ id: "edge", from: "from", to: "to" }]);
    const withFlow: DiagramDocument = { ...document, scenes: [{ id: "s", label: "Flow", beats: [{ durationMs: 1000, actions: [{ type: "flow", target: "edge", direction: "forward", text: "Message" }] }] }] };
    const diagram = createDiagram(withFlow);
    expect(diagram.diagnoseAt(500, { theme: "dark" })).toEqual([]);
    expect(diagram.diagnoseAt(500, { theme: "light", reducedMotion: true })).toEqual([]);
  });
});

describe("source field locations", () => {
  it("locates list markers at their authored marker field", () => {
    const document = documentWith([
      { ...makeNode("content", 100, 100, 150, 100), content: { style: { padding: 0 }, blocks: [
        { type: "list", marker: "bullet", items: [{ body: "A" }] }
      ] } }, makeNode("barrier", 100, 100, 8, 20)
    ]);
    const warnings = createDiagram(document).diagnoseAt(0);
    expect(warnings).toMatchObject([{ code: "label-node-overlap", path: "nodes[0].content.blocks[0].marker" }]);
  });
});


describe("ordinary multiline edge label halos", () => {
  const multiline = (edgeLabel?: number): DiagramDocument => ({
    ...documentWith([makeNode("from", 20, 100), makeNode("to", 500, 100)],
      [{ id: "edge", from: "from", to: "to", label: "A\nB" }]),
    ...(edgeLabel === undefined ? {} : { typography: { edgeLabel } })
  });

  it.each([undefined, 18, 20, 24, 32, 64])("allows normally spaced lines at edge font %s when only their own halos meet", (edgeLabel) => {
    const warnings = createDiagram(multiline(edgeLabel)).diagnoseAt(0);
    expect(warnings.filter(({ code }) => code === "label-overlap")).toEqual([]);
  });
});


describe("independent edge label halo risks", () => {
  const parallelLabels = (offset: number): DiagramDocument => documentWith([
    makeNode("fromA", 20, 100), makeNode("toA", 500, 100),
    makeNode("fromB", 20, 100 + offset), makeNode("toB", 500, 100 + offset)
  ], [{ id: "edgeA", from: "fromA", to: "toA", label: "A" },
    { id: "edgeB", from: "fromB", to: "toB", label: "B" }]);

  it("retains halo-only overlap between different original edge labels", () => {
    const warnings = createDiagram(parallelLabels(19)).diagnoseAt(0).filter(({ code }) => code === "label-overlap");
    expect(warnings).toMatchObject([{ objectId: "edgeA", relatedObjectIds: ["edgeB"] }]);
  });

  it("retains actual foreground overlap between different original edge labels", () => {
    const warnings = createDiagram(parallelLabels(10)).diagnoseAt(0).filter(({ code }) => code === "label-overlap");
    expect(warnings).toMatchObject([{ objectId: "edgeA", relatedObjectIds: ["edgeB"] }]);
  });
});
