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

it("highlights state vectors while prefill and decode transfers are active", () => {
  const diagram = createDiagram(llmInferenceExample.document);
  const prefill = diagram.beats.find(({ caption }) => caption?.startsWith("Layer 1: position"))!;
  const prefillFrame = diagram.evaluateAt((prefill.startMs + prefill.endMs) / 2);
  const activePrefillNodes = prefillFrame.nodes.filter(({ id }) => ["a11", "a12", "a13"].includes(id));
  expect(activePrefillNodes.every(({ highlighted, opacity }) => highlighted && opacity === 1)).toBe(true);

  const storedLayer1 = diagram.beats.find(({ caption }) => caption?.startsWith("Layer 1 stores"))!;
  const trailFrame = diagram.evaluateAt((storedLayer1.startMs + storedLayer1.endMs) / 2);
  expect(trailFrame.nodes.find(({ id }) => id === "a11")).toMatchObject({ highlighted: true, opacity: 0.58 });

  const layer2 = diagram.beats.find(({ caption }) => caption?.startsWith("Layer 2: position"))!;
  const nextLayerFrame = diagram.evaluateAt((layer2.startMs + layer2.endMs) / 2);
  expect(nextLayerFrame.nodes.find(({ id }) => id === "a11")).toMatchObject({ highlighted: true, opacity: 1 });
  expect(nextLayerFrame.nodes.find(({ id }) => id === "a21")).toMatchObject({ highlighted: true, opacity: 1 });

  const prefillComplete = diagram.beats.find(({ caption }) => caption?.startsWith("Prefill complete"))!;
  const completeFrame = diagram.evaluateAt((prefillComplete.startMs + prefillComplete.endMs) / 2);
  expect(completeFrame.nodes.find(({ id }) => id === "a11")).toMatchObject({ highlighted: true, opacity: 0.58 });
  expect(completeFrame.nodes.find(({ id }) => id === "a21")).toMatchObject({ highlighted: true, opacity: 0.58 });
  expect(completeFrame.nodes.find(({ id }) => id === "a41")).toMatchObject({ highlighted: true, opacity: 1 });

  const decode = diagram.beats.find(({ caption }) => caption?.startsWith("Layer 1: the new position"))!;
  const decodeFrame = diagram.evaluateAt((decode.startMs + decode.endMs) / 2);
  expect(decodeFrame.nodes.find(({ id }) => id === "a14")?.highlighted).toBe(true);
  expect(decodeFrame.nodes.find(({ id }) => id === "t4")?.highlighted).toBe(true);
});
