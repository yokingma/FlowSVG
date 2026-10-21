import { describe, expect, it } from "vitest";
import { createDiagram, validateDocument, type DiagramDocument } from "../index.js";

const timelineDocument = (): DiagramDocument => ({
  version: 1,
  viewport: { width: 400, height: 300 },
  nodes: [{ id: "service", kind: "rect", x: 20, y: 30, width: 240, height: 220,
    content: { blocks: [{ type: "title", text: "Initial" }] } }],
  edges: [],
  scenes: [{ id: "explain", label: "Explain", beats: [
    { durationMs: 100, actions: [] },
    { durationMs: 100, transitionMs: 100, actions: [{ type: "updateNode", target: "service", value: {
      content: { blocks: [{ type: "title", text: "Replacement" }, { type: "paragraph", text: "Complete body" }] }
    } }] },
    { durationMs: 100, actions: [] }
  ] }, { id: "inherit", label: "Inherit", beats: [{ durationMs: 100, actions: [] }] }]
});

describe("node content timeline", () => {
  it.each(["rect", "roundedRect", "cylinder"] as const)("replaces and clears content on supported %s nodes", (kind) => {
    const document = timelineDocument();
    document.nodes = [{ ...document.nodes[0]!, kind, content: undefined, label: "Initial label" }];
    document.scenes[1]!.beats[0]!.actions = [{ type: "updateNode", target: "service", value: { content: null } }];
    const diagram = createDiagram(document);
    expect(diagram.evaluateAt(99).nodes[0]!.labelLines).toEqual(["Initial label"]);
    expect(diagram.evaluateAt(100).nodes[0]!.contentLayout?.lines.map(({ text }) => text)).toEqual(["Replacement", "Complete body"]);
    expect(diagram.renderSvg(100)).toContain('data-content-id="service"');
    expect(diagram.evaluateAt(300).nodes[0]!.contentLayout).toBeUndefined();
    expect(diagram.evaluateAt(400).nodes[0]!.labelLines).toEqual([]);
  });

  it("permits explicit clearing on a simple-label shape without enabling structured content", () => {
    const document = timelineDocument();
    document.nodes = [{ ...document.nodes[0]!, kind: "ellipse", content: undefined, label: "Old label" }];
    document.scenes = [{ id: "clear", label: "Clear", beats: [
      { durationMs: 100, actions: [{ type: "updateNode", target: "service", value: { content: null } }] }
    ] }];
    const node = createDiagram(document).evaluateAt(0).nodes[0]!;
    expect(node.labelLines).toEqual([]);
    expect(node.contentLayout).toBeUndefined();
    expect(node).toMatchObject({ width: 240, height: 220 });
  });
  it.each([
    { content: undefined, suffix: "content" },
    { content: "text", suffix: "content" },
    { content: { blocks: "text" }, suffix: "content.blocks" },
    { content: { blocks: [{ type: "paragraph", text: 7 }] }, suffix: "content.blocks[0].text" },
    { content: { blocks: [], unexpected: true }, suffix: "content.unexpected" },
    { content: { blocks: [{ type: "title", text: "Title", style: { color: "red" } }] }, suffix: "content.blocks[0].style.color" },
    { content: { blocks: [], style: { padding: Infinity } }, suffix: "content.style.padding" }
  ])("validates replacement content with an exact action path: $suffix", ({ content, suffix }) => {
    const document = timelineDocument();
    const malformed = { ...document, scenes: [{ id: "invalid", label: "Invalid", beats: [
      { durationMs: 100, actions: [{ type: "updateNode", target: "service", value: { content } }] }
    ] }] };
    expect(validateDocument(malformed)).toContainEqual(expect.objectContaining({ path: `scenes[0].beats[0].actions[0].value.${suffix}` }));
  });
  it("rejects content updates on unsupported shapes at the action field path", () => {
    for (const kind of ["ellipse", "group"] as const) {
      const document = timelineDocument();
      document.nodes = [{ ...document.nodes[0]!, kind, content: undefined }];
      expect(validateDocument(document)).toContainEqual(expect.objectContaining({
        path: "scenes[0].beats[1].actions[0].value.content",
        message: expect.stringContaining("requires")
      }));
    }
  });
  it("rejects dual-mode declarations and all repeated or conflicting display assignments", () => {
    const content = { blocks: [{ type: "title", text: "New" }] };
    const cases = [
      [{ content, label: "" }],
      [{ content: null, label: "Simple" }],
      [{ content }, { content }],
      [{ content: null }, { content }],
      [{ content }, { label: "Simple" }],
      [{ label: "Simple" }, { content: null }]
    ];
    for (const values of cases) {
      const document = timelineDocument();
      const actions = values.map((value) => ({ type: "updateNode", target: "service", value }));
      const malformed = { ...document, scenes: [{ id: "invalid", label: "Invalid", beats: [{ durationMs: 100, actions }] }] };
      const issues = validateDocument(malformed);
      expect(issues).toEqual(expect.arrayContaining([expect.objectContaining({
        path: expect.stringMatching(/^scenes\[0\]\.beats\[0\]\.actions\[\d\]\.value\.(content|label)$/),
        message: expect.stringMatching(/label|duplicate/)
      })]));
    }
  });
  it("switches label/content modes and clears without restoring a historical label or changing dimensions", () => {
    const document = timelineDocument();
    document.nodes = [{ ...document.nodes[0]!, content: undefined, label: "Original label" }];
    document.scenes = [{ id: "modes", label: "Modes", beats: [
      { durationMs: 100, transitionMs: 100, actions: [{ type: "updateNode", target: "service", value: { content: { blocks: [{ type: "title", text: "Content mode" }] } } }] },
      { durationMs: 100, transitionMs: 100, actions: [{ type: "updateNode", target: "service", value: { label: "New label" } }] },
      { durationMs: 100, transitionMs: 100, actions: [{ type: "updateNode", target: "service", value: { content: { blocks: [{ type: "paragraph", text: "New body" }] } } }] },
      { durationMs: 100, transitionMs: 100, actions: [{ type: "updateNode", target: "service", value: { content: null } }] },
      { durationMs: 100, actions: [] }
    ] }];
    const diagram = createDiagram(document);
    expect(diagram.evaluateAt(0).nodes[0]!.labelLines).toEqual([]);
    expect(diagram.renderSvg(0)).not.toContain("Original label");
    for (const time of [100, 150, 199]) {
      const node = diagram.evaluateAt(time).nodes[0]!;
      expect(node.labelLines).toEqual(["New label"]);
      expect(node.contentLayout).toBeUndefined();
      expect(diagram.renderSvg(time)).not.toContain("Content mode");
    }
    expect(diagram.evaluateAt(200).nodes[0]!.labelLines).toEqual([]);
    expect(diagram.evaluateAt(200).nodes[0]!.contentLayout?.lines.map(({ text }) => text)).toEqual(["New body"]);
    for (const time of [300, 399, 400, 500]) {
      const node = diagram.evaluateAt(time).nodes[0]!;
      expect(node.labelLines).toEqual([]);
      expect(node.contentLayout).toBeUndefined();
      expect(node).toMatchObject({ width: 240, height: 220 });
      expect(diagram.renderSvg(time)).not.toMatch(/Original label|New label|New body|data-content-id/);
    }
    expect(diagram.evaluateAt(0).nodes[0]!.contentLayout?.lines[0]!.text).toBe("Content mode");
  });
  it("replaces all content exactly at the beat start and inherits across beats and scenes", () => {
    const diagram = createDiagram(timelineDocument());
    expect(diagram.evaluateAt(99).nodes[0]!.contentLayout?.lines.map(({ text }) => text)).toEqual(["Initial"]);
    for (const time of [100, 101, 150, 199, 200, 299, 300, 400]) {
      const node = diagram.evaluateAt(time).nodes[0]!;
      expect(node.contentLayout?.lines.map(({ text }) => text)).toEqual(["Replacement", "Complete body"]);
      expect(node).toMatchObject({ width: 240, height: 220 });
      expect(diagram.renderSvg(time)).toContain("Replacement");
      expect(diagram.renderSvg(time)).not.toContain("Initial");
      expect(diagram.evaluateAt(time, { reducedMotion: true }).nodes).toEqual(diagram.evaluateAt(time).nodes);
    }
    const forward = [0, 99, 100, 150, 200, 300, 400].map((time) => diagram.evaluateAt(time));
    const reverse = [400, 300, 200, 150, 100, 99, 0].map((time) => diagram.evaluateAt(time));
    expect(reverse.reverse()).toEqual(forward);
  });
});
