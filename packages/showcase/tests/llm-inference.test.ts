import { expect, it } from "vitest";
import { createDiagram } from "flowsvg";
import { llmInferenceExample } from "../src/examples/llm-inference.js";

const ANNOTATION_IDS = ["h_token", "h1", "h2", "h3", "h4", "h_output", "rule", "h_cache", "cache_note", "score_note", "footer"];
const CACHE_LAYERS = [["cache1", "L1"], ["cache2", "L2"], ["cache3", "Lk"], ["cache4", "LN"]] as const;

it("shows centered unboxed annotations without repeating the host title", () => {
  const diagram = createDiagram(llmInferenceExample.document);
  const times = [0, ...diagram.beats.map(({ endMs }) => endMs)];
  for (const theme of ["light", "dark"] as const) {
    for (const time of times) {
      const frame = diagram.evaluateAt(time, { theme });
      expect(frame.nodes.some(({ id }) => id === "title" || id === "subtitle")).toBe(false);
      for (const id of ANNOTATION_IDS) {
        const node = frame.nodes.find((node) => node.id === id)!;
        expect(node.style, id).toMatchObject({ fill: "#00000000", strokeWidth: 0 });
        expect(node.contentLayout!.lines.length, id).toBeGreaterThan(0);
        for (const line of node.contentLayout!.lines) {
          expect(line.align, id).toBe("center");
          expect(line.x, id).toBeCloseTo(node.x + node.width / 2);
        }
      }
      for (const [heading, state] of [["h_token", "t1"], ["h1", "a11"], ["h2", "a21"], ["h3", "a31"], ["h4", "a41"], ["h_output", "lm"]]) {
        const title = frame.nodes.find(({ id }) => id === heading)!;
        const column = frame.nodes.find(({ id }) => id === state)!;
        expect(title.x + title.width / 2, heading).toBeCloseTo(column.x + column.width / 2);
      }
    }
  }
});

it("keeps each cache layer and its position count on separate centered lines throughout playback", () => {
  const diagram = createDiagram(llmInferenceExample.document);
  const times = [0, ...diagram.beats.map(({ endMs }) => endMs)];
  for (const theme of ["light", "dark"] as const) {
    const counts = new Set<string>();
    for (const time of times) {
      const frame = diagram.evaluateAt(time, { theme });
      expect(frame.warnings, `${theme}/${time}`).toEqual([]);
      for (const [id, layer] of CACHE_LAYERS) {
        const node = frame.nodes.find((node) => node.id === id)!;
        expect(node.labelLines, `${id}/${time}`).toEqual([layer, expect.stringMatching(/^[034] positions$/)]);
        counts.add(node.labelLines[1]!);
        for (const line of node.labelBoxes) {
          expect(line.x, id).toBeCloseTo(node.x + node.width / 2);
          expect(line.y, id).toBeGreaterThan(node.y);
          expect(line.y, id).toBeLessThan(node.y + node.height);
        }
      }
    }
    expect([...counts].sort()).toEqual(["0 positions", "3 positions", "4 positions"]);
  }
});
