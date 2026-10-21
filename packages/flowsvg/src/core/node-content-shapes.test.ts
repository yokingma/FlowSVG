import { describe, expect, it } from "vitest";
import { createDiagram, validateDocument, type DiagramDocument, type DiagramNode } from "../index.js";

const shapeDocument = (overrides: Partial<DiagramNode> = {}): DiagramDocument => ({
  version: 1,
  viewport: { width: 800, height: 600 },
  nodes: [{ id: "service", kind: "roundedRect", x: 20, y: 30, width: 240, height: 260,
    content: { blocks: [{ type: "title", text: "Service" }, { type: "paragraph", text: "Fixed-size description" }] },
    ...overrides }],
  edges: [], scenes: []

});

describe("node content shape safe areas", () => {
  it("reserves rounded corners before applying authored padding and exports the same clip", () => {
    const document = shapeDocument({ content: { style: { padding: 10 }, blocks: [{ type: "title", text: "Service" }] } });
    expect(validateDocument(document)).toEqual([]);
    const diagram = createDiagram(document);
    const node = diagram.evaluateAt(0).nodes[0]!;
    expect(node).toMatchObject({ width: 240, height: 260 });
    expect(node.contentLayout?.safeArea).toEqual({ x: 34, y: 44, width: 212, height: 232 });
    expect(node.contentLayout?.lines[0]).toMatchObject({ x: 34, y: 64 });
    expect(diagram.renderSvg()).toContain('<rect x="34" y="44" width="212" height="232"');
  });
  it("reserves twice the current cap radius above and below cylinder content", () => {
    const diagram = createDiagram(shapeDocument({ kind: "cylinder" }));
    const node = diagram.evaluateAt(0).nodes[0]!;
    expect(node.contentLayout?.safeArea).toEqual({ x: 36, y: 74, width: 208, height: 172 });
    expect(node.contentLayout?.lines[0]).toMatchObject({ x: 36, y: 94 });
    expect(diagram.renderSvg()).toContain('<rect x="36" y="74" width="208" height="172"');
    expect(diagram.evaluateAt(0).warnings).toEqual([]);
  });
  it.each(["rect", "roundedRect", "cylinder"] as const)("clips an empty %s safe area without invalid geometry", (kind) => {
    const diagram = createDiagram(shapeDocument({ kind, width: 1, height: 1, content: { blocks: [{ type: "title", text: "W" }] } }));
    const frame = diagram.evaluateAt(0);
    expect(frame.nodes[0]!.contentLayout).toMatchObject({ safeArea: { width: 0, height: 0 }, widthOverflow: true, heightOverflow: true });
    expect(frame.warnings.map(({ message }) => message)).toEqual(['content for node "service" exceeds its width', 'content for node "service" exceeds its height']);
    expect(diagram.renderSvg()).not.toMatch(/NaN|Infinity|(?:width|height)="-/);
    expect(diagram.hitTest(0, { x: 40, y: 80 })).toBeNull();
  });

  it("recalculates cylinder cap clearance from the current height rather than a fixed radius", () => {
    const diagram = createDiagram(shapeDocument({ kind: "cylinder", height: 40,
      content: { style: { padding: 0 }, blocks: [{ type: "paragraph", text: "Body" }] }
    }));
    expect(diagram.evaluateAt(0).nodes[0]!.contentLayout?.safeArea).toEqual({ x: 20, y: 50, width: 240, height: 0 });
    expect(diagram.renderSvg()).toContain('<rect x="20" y="50" width="240" height="0"');
    expect(diagram.evaluateAt(0).warnings).toEqual([expect.objectContaining({ message: 'content for node "service" exceeds its height' })]);
  });

  it("tracks interpolated node dimensions and parent movement in absolute layout and clips", () => {
    const initial = shapeDocument({ kind: "cylinder", parentId: "group" });
    const document: DiagramDocument = { ...initial,
      nodes: [{ id: "group", kind: "group", x: 10, y: 20, width: 500, height: 500 }, ...initial.nodes],
      scenes: [{ id: "move", label: "Move", beats: [{ durationMs: 1000, transitionMs: 1000, actions: [
        { type: "updateNode", target: "group", value: { x: 110, y: 120 } },
        { type: "updateNode", target: "service", value: { x: 40, y: 50, width: 120, height: 100 } }
      ] }] }]
    };
    const diagram = createDiagram(document);
    const middle = diagram.evaluateAt(500).nodes[1]!;
    expect(middle).toMatchObject({ x: 90, y: 110, width: 180, height: 180 });
    expect(middle.contentLayout?.safeArea).toEqual({ x: 106, y: 154, width: 148, height: 92 });
    expect(middle.contentLayout?.lines[0]).toMatchObject({ x: 106, y: 174 });
    expect(diagram.renderSvg(500)).toContain('<rect x="106" y="154" width="148" height="92"');
    expect(diagram.evaluateAt(1000).nodes[1]!.contentLayout?.safeArea).toEqual({ x: 166, y: 214, width: 88, height: 12 });
    expect(diagram.evaluateAt(0).nodes[1]!.contentLayout?.safeArea).toEqual({ x: 46, y: 94, width: 208, height: 172 });
    expect(diagram.evaluateAt(500)).toEqual(diagram.evaluateAt(500));
  });

  it.each(["straight", "orthogonal", "curved"] as const)("preserves %s ports, focus and transfer geometry when content is present", (route) => {
    const initial = shapeDocument({ kind: "cylinder", x: 40, y: 80, width: 240, height: 260 });
    const document: DiagramDocument = { ...initial,
      nodes: [...initial.nodes, { id: "target", kind: "roundedRect", x: 500, y: 80, width: 240, height: 260,
        content: { blocks: [{ type: "paragraph", text: "Target" }] } }],
      edges: [{ id: "message", from: "service", to: "target", fromPort: "right", toPort: "left", route }],
      scenes: [{ id: "send", label: "Send", beats: [{ durationMs: 1000, transitionMs: 0, actions: [
        { type: "flow", target: "message", direction: "forward" }, { type: "focus", target: "service" }
      ] }] }]
    };
    const diagram = createDiagram(document);
    const frame = diagram.evaluateAt(500);
    const withoutContent = createDiagram({ ...document, nodes: document.nodes.map(({ content: _content, ...node }) => node) }).evaluateAt(500);
    expect(frame.edges).toEqual(withoutContent.edges);
    expect(frame.camera).toEqual(withoutContent.camera);
    expect(frame.edges[0]?.path).toMatch(/^M 280 210 /);
    expect(frame.edges[0]?.path).toMatch(/500 210$/);
    expect(frame.edges[0]?.flow?.point).toEqual({ x: 390, y: 210 });
    expect(diagram.hitTest(500, { x: 56, y: 124 })).toEqual({ id: "service", type: "node" });
  });

  it("does not let content turn an ordinary node into a parent group", () => {
    const document = shapeDocument();
    expect(validateDocument({ ...document, nodes: [...document.nodes,
      { id: "child", kind: "rect", parentId: "service", x: 0, y: 0, width: 20, height: 20 }
    ] })).toContainEqual(expect.objectContaining({ path: "nodes[1].parentId", message: expect.stringContaining("group") }));
  });

});
