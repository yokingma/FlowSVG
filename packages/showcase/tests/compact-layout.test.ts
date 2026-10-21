import { expect, it } from "vitest";
import { createDiagram } from "flowsvg";
import { compileCatalog } from "../src/build.js";
import { catalogSource } from "../src/formal.js";

const MAX_UNUSED_CONTENT_HEIGHT = 24;
const VIEWPORT_LIMITS = [
  ["request-response", 1000, 440],
  ["rag-workflow", 1120, 820],
  ["project-architecture", 1080, 680],
  ["vllm-metal-stack", 1280, 960],
  ["job-lifecycle", 868, 422],
  ["order-event-pipeline", 952, 580],
  ["web-service-deployment", 922, 756],
  ["cache-aside-sequence", 948, 572]
] as const;

it.each(VIEWPORT_LIMITS)("keeps %s compact without excess space below its fullest content", (id, width, height) => {
  const { catalog } = compileCatalog(catalogSource);
  const example = catalog.get(id)!;
  const diagram = createDiagram(example.document);
  const beatEnds = example.document.scenes.flatMap(({ beats }) => beats).reduce<number[]>((ends, { durationMs }) =>
    [...ends, ends.at(-1)! + durationMs], [0]);
  const frames = beatEnds.map((time) => diagram.evaluateAt(time));
  for (const node of frames[0]!.nodes.filter(({ contentLayout }) => contentLayout)) {
    const unusedHeight = Math.min(...frames.map((frame) => {
      const current = frame.nodes.find(({ id: nodeId }) => nodeId === node.id)!;
      const layout = current.contentLayout!;
      expect(layout.widthOverflow || layout.heightOverflow, `${id}/${node.id} overflows`).toBe(false);
      expect([current.x, current.y, current.width, current.height]).toEqual([node.x, node.y, node.width, node.height]);
      const contentBottom = Math.max(...layout.lines.map(({ y }) => y), ...layout.tags.map(({ y, height }) => y + height));
      return layout.safeArea.y + layout.safeArea.height - contentBottom;
    }));
    expect(unusedHeight, `${id}/${node.id} reserves excess height`).toBeLessThanOrEqual(MAX_UNUSED_CONTENT_HEIGHT);
  }
  expect(example.document.viewport.width).toBeLessThanOrEqual(width);
  expect(example.document.viewport.height).toBeLessThanOrEqual(height);
});
