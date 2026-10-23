import { expect, it } from "vitest";
import { createDiagram, type DiagramFrameState } from "flowsvg";
import { compileCatalog } from "../src/build.js";
import { catalogSource } from "../src/formal.js";
import { beatStart, beatMiddle } from "./story-timing.js";

const MIN_LINE_HEIGHT = 20;
const LINE_HEIGHT_RATIO = 1.35;
const EVENT_TRANSITIONS = [
  [1, "schedule", "running"],
  [2, "temporary-error", "retry"],
  [3, "retry-timer", "running"],
  [4, "success", "completed"],
  [6, "exhausted", "failed"],
  [8, "cancel", "cancelled"]
] as const;

function expectCompleteContent(frame: DiagramFrameState): void {
  expect(frame.warnings).toEqual([]);
  for (const node of frame.nodes) {
    const layout = node.contentLayout!;
    expect(layout.widthOverflow || layout.heightOverflow).toBe(false);
    // The public line baseline and largest effective font size describe the complete line box.
    const occupiedBottom = Math.max(...layout.lines.map(({ y, fontSize }) =>
      y - fontSize + Math.max(MIN_LINE_HEIGHT, fontSize * LINE_HEIGHT_RATIO)),
    ...layout.tags.map(({ y, height }) => y + height));
    expect(occupiedBottom).toBeCloseTo(layout.safeArea.y + layout.safeArea.height);
  }
}

it("fits the task cards to their complete one-line content", () => {
  const { catalog } = compileCatalog(catalogSource);
  const example = catalog.get("job-lifecycle")!;
  // Four blocks occupy 27 + 24 + 20 + 20, gaps add 18, and safe insets add 32.
  for (const node of example.document.nodes) expect(node.height).toBe(141);
});

it("fits initial inactive content and every task stage through seeks and visual options", () => {
  const { catalog } = compileCatalog(catalogSource);
  const example = catalog.get("job-lifecycle")!;
  const { document } = example;
  // evaluateAt(0) applies the first beat, so a static document separately checks the initial versions.
  const inactive = createDiagram({ ...document, scenes: [] }).evaluateAt(0);
  expectCompleteContent(inactive);
  const geometry = inactive.nodes.map(({ id, x, y, width, height }) => [id, x, y, width, height]);
  const diagram = createDiagram(document);
  expect(example.durationMs).toBe(diagram.totalDuration);
  expect(diagram.totalDuration).toBeCloseTo(14_609.837, 3);
  expect(document.scenes.map(({ id }) => id)).toEqual(["submit", "execute", "recover", "exhaust", "cancel"]);
  expect(document.scenes.flatMap(({ beats }) => beats)).toHaveLength(9);
  const times = [...diagram.beats.flatMap(({ startMs, endMs }) => [startMs, (startMs + endMs) / 2]),
    diagram.totalDuration, beatStart(diagram, 6), 0, beatStart(diagram, 8), 3000, beatStart(diagram, 3)];
  for (const theme of ["light", "dark"] as const) for (const reducedMotion of [false, true]) {
    for (const time of times) {
      const frame = diagram.evaluateAt(time, { theme, reducedMotion });
      expectCompleteContent(frame);
      expect(frame.nodes.map(({ id, x, y, width, height }) => [id, x, y, width, height])).toEqual(geometry);
      expect(diagram.renderSvg(time, { theme, reducedMotion })).not.toContain("NaN");
    }
  }
});

it("animates each task event with a solid moving dot and exactly one current state", () => {
  const { catalog } = compileCatalog(catalogSource);
  const diagram = createDiagram(catalog.get("job-lifecycle")!.document);
  for (const theme of ["light", "dark"] as const) for (const [index, edgeId, stateId] of EVENT_TRANSITIONS) {
    const start = beatStart(diagram, index);
    const midpoint = beatMiddle(diagram, index);
    const frame = diagram.evaluateAt(midpoint, { theme });
    expect(frame.edges.filter(({ flow }) => flow).map(({ id }) => id)).toEqual([edgeId]);
    expect(frame.edges.find(({ id }) => id === edgeId)?.flow).toMatchObject({ direction: "forward" });
    expect(frame.edges.find(({ id }) => id === edgeId)?.flow?.text).toBeUndefined();
    expect(frame.nodes.filter(({ highlighted }) => highlighted).map(({ id }) => id)).toEqual([stateId]);
    const earlier = diagram.evaluateAt(start + 50).edges.find(({ id }) => id === edgeId)?.flow?.point;
    const later = diagram.evaluateAt(start + 150).edges.find(({ id }) => id === edgeId)?.flow?.point;
    expect(earlier).toBeDefined();
    expect(later).toBeDefined();
    expect(later).not.toEqual(earlier);
    expect(diagram.renderSvg(midpoint, { theme })).toMatch(new RegExp(`<circle[^>]*r="5"[^>]*data-flow-id="${edgeId}"`));
    const reduced = diagram.evaluateAt(midpoint, { theme, reducedMotion: true });
    expect(reduced.edges.every(({ flow }) => !flow)).toBe(true);
    expect(reduced.nodes.filter(({ highlighted }) => highlighted).map(({ id }) => id)).toEqual([stateId]);
    expect(diagram.renderSvg(midpoint, { theme, reducedMotion: true })).not.toContain("data-flow-id");
  }
  for (const time of [0, 1000, beatStart(diagram, 5), beatMiddle(diagram, 5), beatStart(diagram, 7), beatMiddle(diagram, 7), diagram.totalDuration]) {
    expect(diagram.evaluateAt(time).edges.every(({ flow }) => !flow)).toBe(true);
  }
});

it("holds a short task transfer for 500 ms before switching current state", () => {
  const { catalog } = compileCatalog(catalogSource);
  const diagram = createDiagram(catalog.get("job-lifecycle")!.document);
  // The 80-unit schedule edge arrives after about 444 ms, then holds for 500 ms.
  const arrived = diagram.evaluateAt(2500).edges.find(({ id }) => id === "schedule")!.flow!;
  const held = diagram.evaluateAt(2944).edges.find(({ id }) => id === "schedule")!.flow!;
  expect(arrived.progress).toBe(1);
  expect(held.point).toEqual(arrived.point);
  expect(diagram.evaluateAt(2944).nodes.filter(({ highlighted }) => highlighted).map(({ id }) => id)).toEqual(["running"]);
});

it("extends the retry transfer instead of switching state before its dot arrives", () => {
  const { catalog } = compileCatalog(catalogSource);
  const diagram = createDiagram(catalog.get("job-lifecycle")!.document);
  // The routed retry edge needs slightly more than the authored two-second beat.
  const retryBeat = diagram.beats[3]!;
  const frame = diagram.evaluateAt(retryBeat.endMs - 600);
  const retry = frame.edges.find(({ id }) => id === "retry-timer")!.flow!;
  expect(retry.progress).toBeGreaterThan(0.9);
  expect(retry.progress).toBeLessThan(1);
  expect(frame.nodes.filter(({ highlighted }) => highlighted).map(({ id }) => id)).toEqual(["running"]);
  expect(diagram.evaluateAt(diagram.beats[4]!.startMs).nodes.filter(({ highlighted }) => highlighted).map(({ id }) => id))
    .toEqual(["completed"]);
});
