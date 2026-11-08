import { describe, expect, it } from "vitest";
import { createInheritedTransitionCompositionDocument } from "../../tests/fixtures/inherited-transition-composition.js";
import { createDiagram, validateDocument } from "../index.js";

describe("inherited transition composition at public diagram seams", () => {
  it("keeps nested opacity layers independent and masks internal and external edges", () => {
    const diagram = createDiagram(createInheritedTransitionCompositionDocument());
    expect(validateDocument(createInheritedTransitionCompositionDocument())).toEqual([]);
    const initial = diagram.evaluateAt(0);
    expect(initial.nodes.find(({ id }) => id === "source")).toMatchObject({ visible: false, opacity: 0 });
    expect(initial.nodes.find(({ id }) => id === "worker")).toMatchObject({ visible: true, opacity: 0 });
    expect(initial.edges.find(({ id }) => id === "inside")).toMatchObject({ visible: false, opacity: 0 });
    expect(initial.edges.find(({ id }) => id === "outbound")).toMatchObject({ visible: true, opacity: 0 });

    const revealed = diagram.evaluateAt(350);
    expect(revealed.nodes.find(({ id }) => id === "frame")).toMatchObject({ opacity: 0.8 });
    expect(revealed.nodes.find(({ id }) => id === "lane")).toMatchObject({ opacity: 0.6 });
    expect(revealed.nodes.find(({ id }) => id === "source")).toMatchObject({ visible: true, opacity: 0.5 });
    expect(revealed.nodes.find(({ id }) => id === "worker")).toMatchObject({ opacity: 0.375 });
    expect(revealed.edges.find(({ id }) => id === "inside")).toMatchObject({ visible: true, opacity: 0.375 });
    expect(revealed.edges.find(({ id }) => id === "outbound")).toMatchObject({ visible: true, opacity: 0.375 });
    expect(diagram.hitTest(350, { x: 100, y: 200 })).toEqual({ id: "source", type: "node" });
  });

  it("inherits highlights, content, focus and routes across beat and scene boundaries", () => {
    const diagram = createDiagram(createInheritedTransitionCompositionDocument());
    const mid = diagram.evaluateAt(500);
    expect(mid.nodes.find(({ id }) => id === "source")).toMatchObject({ highlighted: true });
    expect(mid.nodes.find(({ id }) => id === "source")?.contentLayout?.lines[0]?.text).toBe("Sourc");
    expect(mid.camera.width).toBeLessThan(760);
    expect(mid.edges.find(({ id }) => id === "outbound")?.flow).toMatchObject({ direction: "forward", progress: 0.5 });
    expect(mid.edges.find(({ id }) => id === "inbound")?.flow).toMatchObject({ direction: "reverse", progress: 0.5 });
    expect(mid.edges.find(({ id }) => id === "inside")?.path).toContain("C");
    expect(diagram.renderSvg(500)).toContain('data-flow-id="outbound"');

    const nextStart = diagram.beats[2]!.startMs;
    const next = diagram.evaluateAt(nextStart);
    expect(next.sceneId).toBe("composition");
    expect(next.nodes.find(({ id }) => id === "source")).toMatchObject({ visible: true, highlighted: false });
    expect(next.camera.width).toBe(538);
    expect(diagram.evaluateAt(diagram.beats[3]!.startMs).nodes.find(({ id }) => id === "lane")).toMatchObject({ visible: false, opacity: 0 });
    expect(diagram.evaluateAt(diagram.totalDuration).nodes.find(({ id }) => id === "lane")).toMatchObject({ visible: false, opacity: 0 });
  });

  it("keeps flow timing, reduced motion, hit testing and diagnostics deterministic under query order", () => {
    const diagram = createDiagram(createInheritedTransitionCompositionDocument());
    expect(diagram.totalDuration).toBe(3100);
    expect(diagram.beats.map(({ startMs, endMs }) => [startMs, endMs])).toEqual([[0, 200], [200, 800], [800, 1300], [1300, 1700], [1700, 2600], [2600, 3100]]);
    const reduced = diagram.evaluateAt(500, { reducedMotion: true });
    expect(reduced.edges.find(({ id }) => id === "outbound")?.flow).toBeUndefined();
    expect(reduced.nodes.find(({ id }) => id === "source")?.highlighted).toBe(true);
    expect(diagram.diagnoseAt(500)).toEqual(expect.arrayContaining([expect.objectContaining({ code: "label-node-overlap" })]));
    const first = diagram.evaluateAt(350);
    diagram.evaluateAt(2100);
    expect(diagram.evaluateAt(350)).toEqual(first);
    expect(diagram.evaluateAt(350, { theme: "dark" }).nodes.find(({ id }) => id === "source")?.style?.fill).toBe("#20324d");
    expect(diagram.hitTest(diagram.totalDuration, { x: 100, y: 200 })).toEqual({ id: "frame", type: "node" });
  });
});
