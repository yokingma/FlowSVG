import { describe, expect, it } from "vitest";
import { createDiagram, validateDocument, type DiagramDocument, type ContentGraphBlock } from "../index.js";

const graph: ContentGraphBlock = {
  type: "graph", height: 130,
  nodes: [
    { id: "alice", label: "Alice <&>", x: 120, y: 30, highlighted: true },
    { id: "google", label: "Google", x: 50, y: 110, highlighted: true },
    { id: "ml", label: "ML project", x: 190, y: 110 }
  ],
  edges: [{ from: "alice", to: "google" }, { from: "alice", to: "ml" }]
};
const graphDocument = (): DiagramDocument => ({
  version: 1, viewport: { width: 500, height: 450 },
  nodes: [{ id: "entities", kind: "cylinder", x: 40, y: 30, width: 280, height: 300,
    content: { style: { padding: 20, blockGap: 10 }, blocks: [{ type: "title", text: "Entity graph" }, graph] } }],
  edges: [], scenes: []
});

describe("node-local entity graphs", () => {
  it("evaluates absolute geometry in the content clip and keeps the parent as the hit target", () => {
    const doc = graphDocument();
    expect(validateDocument(doc)).toEqual([]);
    const diagram = createDiagram(doc);
    const node = diagram.evaluateAt(0).nodes[0]!;
    const layout = node.contentLayout!;
    expect(layout.graphs?.[0]?.nodes[0]).toMatchObject({ x: 180, y: 145 });
    expect(layout.graphs?.[0]?.edges).toHaveLength(2);
    expect(layout.lines.map(({ text }) => text)).toContain("Alice <&>");
    expect(diagram.evaluateAt(0).warnings).toEqual([]);
    expect(diagram.hitTest(0, { x: 180, y: 145 })).toEqual({ id: "entities", type: "node" });
    const svg = diagram.renderSvg();
    expect(svg).toContain("Alice &lt;&amp;&gt;");
    expect(svg).toContain("<circle");
    expect(svg).toContain("<line");
    expect(svg).not.toContain('data-id="alice"');
  });

  it("replaces the graph at beat start and reports fixed-node overflow", () => {
    const doc = graphDocument();
    doc.scenes = [{ id: "change", label: "Change", beats: [
      { durationMs: 1000, actions: [] },
      { durationMs: 1000, actions: [{ type: "updateNode", target: "entities", value: {
        content: { blocks: [{ ...graph, height: 400 }] }
      } }] },
      { durationMs: 1000, actions: [{ type: "updateNode", target: "entities", value: { label: "Cleared" } }] }
    ] }];
    const diagram = createDiagram(doc);
    expect(diagram.evaluateAt(999).warnings).toEqual([]);
    expect(diagram.evaluateAt(1000).warnings).toContainEqual(expect.objectContaining({ objectId: "entities" }));
    expect(diagram.evaluateAt(2000).nodes[0]?.contentLayout).toBeUndefined();
  });

  it("keeps the next block at the authored graph height when graph primitives overflow", () => {
    const doc = graphDocument();
    doc.nodes[0]!.content!.blocks = [{ ...graph, height: 60 }, { type: "paragraph", text: "After" }];
    const frame = createDiagram(doc).evaluateAt(0);
    expect(frame.nodes[0]?.contentLayout?.lines.find(({ text }) => text === "After")?.y).toBe(162);
    expect(frame.warnings).toContainEqual(expect.objectContaining({ objectId: "entities", message: expect.stringContaining("height") }));
  });

  it("preserves the distinction between selected and ordinary entities when the parent is highlighted", () => {
    const doc = graphDocument();
    doc.scenes = [{ id: "highlight", label: "Highlight", beats: [{ durationMs: 1000, transitionMs: 0,
      actions: [{ type: "highlight", target: "entities" }] }] }];
    for (const theme of ["light", "dark"] as const) {
      const graphLayout = createDiagram(doc).evaluateAt(500, { theme }).nodes[0]?.contentLayout?.graphs?.[0];
      expect(graphLayout?.nodes[0]?.fill).not.toBe(graphLayout?.nodes[2]?.fill);
      expect(graphLayout?.edges[0]?.color).not.toBe(graphLayout?.edges[1]?.color);
    }
  });

  it.each([
    { ...graph, nodes: [{ ...graph.nodes[0], x: NaN }] },
    { ...graph, nodes: [graph.nodes[0], graph.nodes[0]] },
    { ...graph, edges: [{ from: "missing", to: "alice" }] },
    { ...graph, nodes: [{ ...graph.nodes[0], html: "unsafe" }] },
    { ...graph, height: 0 }
  ])("rejects invalid local geometry and references", (invalid) => {
    const doc = graphDocument();
    expect(validateDocument({ ...doc, nodes: [{ ...doc.nodes[0], content: { blocks: [invalid] } }] }).length).toBeGreaterThan(0);
  });
});
