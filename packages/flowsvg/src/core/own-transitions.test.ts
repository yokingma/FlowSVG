import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createOwnTransitionDocument } from "../../tests/fixtures/own-transitions.js";
import { createDiagram, validateDocument, type EvaluateOptions } from "../index.js";

interface BaselineSample {
  options: EvaluateOptions;
  timeMs: number;
  frameSha256: string;
  svgSha256: string;
}

// Captured from the fixed, unmodified runtime before contract comments were edited.
// See docs/verification/sdk-verification.md for provenance and reproduction rules.
const baseline: { totalDuration: number; beats: unknown; validation: unknown; samples: BaselineSample[] } = JSON.parse(
  readFileSync(new URL("../../tests/fixtures/own-transitions-baseline.json", import.meta.url), "utf8")
);
const digest = (value: unknown): string => createHash("sha256")
  .update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex");

describe("own transitions at the public diagram boundary", () => {
  it("preserves exact baseline frames, SVG and compiled boundaries across options and query order", () => {
    const document = createOwnTransitionDocument();
    const diagram = createDiagram(document);
    expect(validateDocument(document)).toEqual(baseline.validation);
    expect(diagram.totalDuration).toBe(baseline.totalDuration);
    expect(diagram.beats).toEqual(baseline.beats);
    // Reverse and repeat queries so a stateful evaluator cannot pass only through forward playback.
    for (const sample of [...baseline.samples].reverse().concat(baseline.samples)) {
      const { timeMs, options } = sample;
      expect(digest(diagram.evaluateAt(timeMs, options)), `frame at ${timeMs}, ${JSON.stringify(options)}`).toBe(sample.frameSha256);
      expect(digest(diagram.renderSvg(timeMs, options)), `SVG at ${timeMs}, ${JSON.stringify(options)}`).toBe(sample.svgSha256);
    }
  });

  it("caps a reveal by stored base opacity and masks its edge without multiplying fades", () => {
    const diagram = createDiagram(createOwnTransitionDocument());
    const start = diagram.evaluateAt(100);
    expect(start.nodes[0]).toMatchObject({ visible: true, opacity: 0 });
    expect(diagram.hitTest(100, { x: 100, y: 100 })).toBeNull();
    const middle = diagram.evaluateAt(300);
    expect(middle.nodes[0]?.opacity).toBe(0.4);
    expect(middle.edges[0]?.opacity).toBe(0.4);
    expect(diagram.renderSvg(300)).toMatch(/data-id="source" opacity="0.4"/);
    expect(diagram.renderSvg(300)).toMatch(/data-id="link" opacity="0.4"/);
    expect(diagram.evaluateAt(1300).nodes[0]).toMatchObject({ visible: false, opacity: 0 });
    expect(diagram.evaluateAt(2400).nodes[0]).toMatchObject({ visible: true, opacity: 0.4 });
    expect(diagram.evaluateAt(2600).nodes[0]).toMatchObject({ visible: false, opacity: 0 });
  });

  it.each([
    { theme: "light", middleFill: "#7d8998", middleStroke: "#254a84", middleEdge: "#35426c", highlightFill: "#eaf1ff" },
    { theme: "dark", middleFill: "#1a2e48", middleStroke: "#55729c", middleEdge: "#656a84", highlightFill: "#233b60" }
  ] as const)("keeps logical highlight separate from paint and restores current base styles in $theme", (colors) => {
    const diagram = createDiagram(createOwnTransitionDocument());
    const options = { theme: colors.theme };
    expect(diagram.evaluateAt(100, options).nodes[0]).toMatchObject({ highlighted: true, style: { fill: "#000" } });
    expect(diagram.evaluateAt(300, options).nodes[0]).toMatchObject({
      highlighted: true, style: { fill: colors.middleFill, stroke: colors.middleStroke }
    });
    expect(diagram.evaluateAt(300, options).edges[0]?.style?.stroke).toBe(colors.middleEdge);
    expect(diagram.evaluateAt(700, options).nodes[0]).toMatchObject({ highlighted: false, style: { fill: colors.highlightFill } });
    for (const reducedMotion of [false, true]) {
      const restored = diagram.evaluateAt(950, { ...options, reducedMotion });
      expect(restored.nodes[0]).toMatchObject({ highlighted: false, opacity: 0.8, style: { fill: "#00aa44", stroke: "#aa4400" } });
      expect(restored.edges[0]).toMatchObject({ highlighted: false, opacity: 0.7, style: { stroke: "#8844aa" } });
    }
    expect(diagram.evaluateAt(700, { ...options, reducedMotion: true }).nodes[0]?.style?.fill).toBe("#00aa44");
  });

  it("switches labels and whole clipped content at beat start without changing content geometry during paint", () => {
    const diagram = createDiagram(createOwnTransitionDocument());
    expect(diagram.evaluateAt(99).nodes[0]?.labelLines).toEqual(["Original label"]);
    const start = diagram.evaluateAt(100);
    expect(start.nodes[0]?.labelLines).toEqual([]);
    expect(start.nodes[0]?.contentLayout?.lines[0]?.text).toBe("Replacement");
    expect(start.nodes[1]?.labelLines).toEqual(["Updated target"]);
    expect(start.edges[0]?.labelLines).toEqual(["Updated link"]);
    const geometry = (timeMs: number) => {
      const layout = diagram.evaluateAt(timeMs).nodes[0]!.contentLayout!;
      return { safeArea: layout.safeArea, lines: layout.lines.map(({ text, x, y }) => ({ text, x, y })) };
    };
    expect(geometry(100)).toEqual(geometry(300));
    expect(geometry(300)).toEqual(geometry(950));
    expect(diagram.renderSvg(300)).toMatch(/data-content-id="source" clip-path="url\(#diagram-content-clip-[^"]+\)"/);
  });
});
