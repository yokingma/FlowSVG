import { describe, expect, it } from "vitest";
import { createDiagram, DiagramValidationError, renderSvg, validateDocument, type DiagramDocument, type NodeContent } from "../index.js";

const EXTREME_NODE_LABEL_SIZE = 1e307;
const CONTENT_LINE_COUNT = 40;
const documentWithContent = (content: NodeContent, nodeLabel?: number): DiagramDocument => ({
  version: 1, viewport: { width: 600, height: 400 }, ...(nodeLabel === undefined ? {} : { typography: { nodeLabel } }),
  nodes: [{ id: "content", kind: "rect", x: 0, y: 0, width: 100, height: 100, content }], edges: [], scenes: []
});

const contentCases: ReadonlyArray<{ name: string; content: NodeContent }> = [
  { name: "paragraph lines", content: { blocks: [{ type: "paragraph", text: "A\n".repeat(CONTENT_LINE_COUNT) }] } },
  { name: "list items", content: { blocks: [{ type: "list", items: Array.from({ length: CONTENT_LINE_COUNT }, () => ({ body: "A" })) }] } },
  { name: "title blocks", content: { blocks: Array.from({ length: CONTENT_LINE_COUNT }, () => ({ type: "title", text: "A" })) } }
];

const publicQueries: ReadonlyArray<{ name: string; run: (document: DiagramDocument) => unknown }> = [
  { name: "evaluateAt", run: (document) => createDiagram(document).evaluateAt(0) },
  { name: "renderSvg", run: (document) => createDiagram(document).renderSvg(0) },
  { name: "diagnoseAt", run: (document) => createDiagram(document).diagnoseAt(0) },
  { name: "hitTest", run: (document) => createDiagram(document).hitTest(0, { x: 50, y: 50 }) },
  { name: "one-shot renderSvg", run: (document) => renderSvg(document) }
];

describe("structured typography geometry range", () => {
  describe.each(contentCases)("$name", ({ content }) => {
    it.each(publicQueries)("rejects accumulated non-finite content before $name exposes geometry", ({ run }) => {
      const document = documentWithContent(content, EXTREME_NODE_LABEL_SIZE);
      const before = structuredClone(document);
      expect(validateDocument(document)).toEqual([]);
      let caught: unknown;
      try { run(document); } catch (error) { caught = error; }
      expect(caught).toBeInstanceOf(DiagramValidationError);
      if (caught instanceof DiagramValidationError) {
        expect(caught.issues).toContainEqual(expect.objectContaining({ path: "typography.nodeLabel" }));
      }
      expect(document).toEqual(before);
    });

    it("keeps default typography finite and reports ordinary content overflow", () => {
      const document = documentWithContent(content);
      const diagram = createDiagram(document);
      const frame = diagram.evaluateAt(0);
      expect(frame.nodes[0]!.contentLayout!.lines.every(({ y }) => Number.isFinite(y))).toBe(true);
      expect(frame.warnings).toContainEqual(expect.objectContaining({ code: "text-overflow", path: "nodes[0].content" }));
      expect(diagram.renderSvg()).not.toMatch(/NaN|Infinity/);
      expect(() => diagram.diagnoseAt(0)).not.toThrow();
    });
  });

  it.each([undefined, EXTREME_NODE_LABEL_SIZE])("keeps explicit font size 14 finite with nodeLabel %s", (nodeLabel) => {
    const content: NodeContent = { blocks: [{ type: "paragraph", text: "A\n".repeat(CONTENT_LINE_COUNT), style: { fontSize: 14 } }] };
    const diagram = createDiagram(documentWithContent(content, nodeLabel));
    const frame = diagram.evaluateAt(0);
    expect(frame.nodes[0]!.contentLayout!.lines.every(({ y, fontSize }) => Number.isFinite(y) && fontSize === 14)).toBe(true);
    expect(frame.warnings).toContainEqual(expect.objectContaining({ code: "text-overflow", path: "nodes[0].content" }));
    expect(diagram.renderSvg()).not.toMatch(/NaN|Infinity/);
    expect(() => diagram.diagnoseAt(0)).not.toThrow();
  });
});
