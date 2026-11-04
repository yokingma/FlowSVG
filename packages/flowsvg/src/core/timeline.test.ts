import { describe, expect, it } from "vitest";
import { createDiagram, validateDocument, type Action, type DiagramDocument } from "../index.js";

const narrative = (): DiagramDocument => ({
  version: 1,
  viewport: { width: 600, height: 300 },
  nodes: [
    { id: "client", kind: "rect", x: 20, y: 100, width: 100, height: 60 },
    { id: "system", kind: "group", x: 250, y: 50, width: 250, height: 180 },
    { id: "service", kind: "rect", parentId: "system", x: 40, y: 50, width: 100, height: 60, visible: false }
  ],
  edges: [{ id: "request", from: "client", to: "service" }],
  scenes: [
    { id: "request", label: "Request", beats: [
      { durationMs: 1000, transitionMs: 400, caption: "Service appears", actions: [{ type: "show", target: "service" }] }
    ] },
    { id: "response", label: "Response", beats: [
      { durationMs: 1000, transitionMs: 400, caption: "Service responds", actions: [{ type: "highlight", target: "service" }, { type: "highlight", target: "request" }] }
    ] }
  ]
});

describe("continuous narrative timeline", () => {
  it("fades a revealed endpoint and its edge together, then inherits across scenes", () => {
    const diagram = createDiagram(narrative());
    expect(diagram.totalDuration).toBe(2000);
    expect(diagram.evaluateAt(0).nodes[2]?.opacity).toBe(0);
    expect(diagram.evaluateAt(0).nodes[2]?.visible).toBe(true);
    const middle = diagram.evaluateAt(200);
    expect(middle.nodes[2]?.opacity).toBe(0.5);
    expect(middle.edges[0]?.opacity).toBe(0.5);
    expect(middle.caption).toBe("Service appears");
    expect(diagram.renderSvg(200)).toMatch(/data-id="service"[^>]*opacity="0.5"/);
    expect(diagram.renderSvg(200)).toMatch(/data-id="request"[^>]*opacity="0.5"/);
    expect(diagram.evaluateAt(400).nodes[2]?.opacity).toBe(1);
    const boundary = diagram.evaluateAt(1000);
    expect(boundary.sceneId).toBe("response");
    expect(boundary.beatId).toBe("response:0");
    expect(boundary.caption).toBe("Service responds");
    expect(boundary.nodes[2]?.opacity).toBe(1);
    expect(diagram.evaluateAt(9000).timeMs).toBe(2000);
    expect(diagram.evaluateAt(-1).timeMs).toBe(0);
    expect(diagram.evaluateAt(1200)).toEqual(diagram.evaluateAt(1200));
  });

  it("uses the fixed cubic curve and interpolates highlight colors before restoring base colors", () => {
    const document = narrative();
    document.scenes[1]!.beats.push({ durationMs: 600, transitionMs: 400, actions: [{ type: "unhighlight", target: "service" }, { type: "unhighlight", target: "request" }] });
    const diagram = createDiagram(document);
    expect(diagram.evaluateAt(100).nodes[2]?.opacity).toBe(0.0625);
    expect(diagram.renderSvg(100)).toContain('opacity="0.0625"');
    expect(diagram.evaluateAt(1200).nodes[2]?.style?.fill).toBe("#f5f8ff");
    expect(diagram.evaluateAt(1200).edges[0]?.style?.stroke).toBe("#597bb6");
    expect(diagram.evaluateAt(1400).nodes[2]?.style?.fill).toBe("#eaf1ff");
    expect(diagram.evaluateAt(2200).nodes[2]?.style?.fill).toBe("#f5f8ff");
    expect(diagram.evaluateAt(diagram.totalDuration).nodes[2]?.style?.fill).toBe("#ffffff");
    expect(diagram.evaluateAt(0, { reducedMotion: true }).nodes[2]?.opacity).toBe(1);
  });

  it("masks descendants and edges with groups, retaining each edge's own hidden state", () => {
    const document = narrative();
    document.edges.push({ id: "hidden", from: "client", to: "service", visible: false });
    document.scenes[1]!.beats = [
      { durationMs: 1000, transitionMs: 400, actions: [{ type: "hide", target: "system" }, { type: "hide", target: "service" }] },
      { durationMs: 1000, transitionMs: 400, actions: [{ type: "show", target: "system" }, { type: "show", target: "service" }] }
    ];
    const diagram = createDiagram(document);
    const fading = diagram.evaluateAt(1200);
    expect(fading.nodes[2]?.visible).toBe(true);
    expect(fading.nodes[2]?.opacity).toBe(0.5);
    expect(fading.edges[0]?.opacity).toBe(0.5);
    const hidden = diagram.evaluateAt(1400);
    expect(hidden.nodes[2]?.visible).toBe(false);
    expect(hidden.edges[0]?.visible).toBe(false);
    expect(diagram.renderSvg(1400)).not.toContain('data-id="service"');
    expect(diagram.evaluateAt(2200).edges[0]?.opacity).toBe(0.5);
    expect(diagram.evaluateAt(2400).edges[0]?.opacity).toBe(1);
    expect(diagram.evaluateAt(2400).edges[1]?.opacity).toBe(0);
  });
});


describe("visual updates", () => {
  it("interpolates geometry, numeric styles and colors while replacing text at the beat start", () => {
    const document = narrative();
    document.nodes[0]!.style = { fill: "#000", stroke: "#000" };
    document.edges[0]!.style = { stroke: "#000", strokeWidth: 2 };
    document.scenes = [{ id: "change", label: "Change", beats: [{ durationMs: 1000, transitionMs: 400, actions: [
      { type: "show", target: "service" },
      { type: "updateNode", target: "client", value: { x: 100, y: 180, width: 180, height: 100, fill: "#fff", stroke: "#fff", opacity: 0.5, label: "Updated client" } },
      { type: "updateEdge", target: "request", value: { stroke: "#fff", strokeWidth: 6, opacity: 0.75, label: "Updated request" } }
    ] }] }];
    const diagram = createDiagram(document);
    expect(diagram.evaluateAt(0).nodes[0]).toMatchObject({ x: 20, y: 100, width: 100, height: 60, label: "Updated client", opacity: 1 });
    expect(diagram.evaluateAt(0).edges[0]?.label).toBe("Updated request");
    const middle = diagram.evaluateAt(200);
    expect(middle.nodes[0]).toMatchObject({ x: 60, y: 140, width: 140, height: 80, opacity: 0.75, style: { fill: "#808080", stroke: "#808080" } });
    expect(middle.edges[0]).toMatchObject({ opacity: 0.5, style: { stroke: "#808080", strokeWidth: 4 } });
    expect(diagram.evaluateAt(100).nodes[0]?.x).toBe(25);
    expect(diagram.evaluateAt(400).nodes[0]).toMatchObject({ x: 100, y: 180, width: 180, height: 100, opacity: 0.5, style: { fill: "#fff" } });
    expect(diagram.evaluateAt(400).edges[0]).toMatchObject({ opacity: 0.5, style: { stroke: "#fff", strokeWidth: 6 } });
    expect(diagram.evaluateAt(0, { reducedMotion: true })).toEqual({ ...diagram.evaluateAt(400), timeMs: 0, beatProgress: 0 });
    expect(diagram.renderSvg(200)).toContain('x="60" y="140" width="140" height="80"');
    expect(diagram.renderSvg(200)).toContain('stroke-width="4"');
  });
});

describe("updated geometry and routing", () => {
  it("moves nested group descendants, resizes text layout and recomputes boundary attachments", () => {
    const document = narrative();
    document.nodes.splice(2, 0, { id: "nested", kind: "group", x: 10, y: 20, width: 200, height: 130, parentId: "system" });
    document.nodes[3] = { id: "service", kind: "rect", x: 30, y: 30, width: 100, height: 60, parentId: "nested", label: "Service name" };
    document.edges[0]!.route = "orthogonal";
    document.scenes = [{ id: "move", label: "Move", beats: [
      { durationMs: 1000, transitionMs: 400, actions: [
        { type: "updateNode", target: "system", value: { x: 350, y: 130 } },
        { type: "updateNode", target: "nested", value: { x: 30 } },
        { type: "updateNode", target: "service", value: { y: 50, width: 60, height: 30 } }
      ] },
      { durationMs: 1000, actions: [] }
    ] }];
    const diagram = createDiagram(document);
    expect(diagram.evaluateAt(0).edges[0]?.path).toBe("M 120 130 L 290 130");
    expect(diagram.evaluateAt(200).nodes[3]).toMatchObject({ x: 350, y: 150, width: 80, height: 45, labelLines: ["Service", "name"] });
    const middlePath = diagram.evaluateAt(200).edges[0]!.path;
    expect(middlePath).toMatch(/^M 120 130 L /);
    expect(middlePath.match(/ Q /g)).toHaveLength(2);
    expect(middlePath).toContain("Q 235 130");
    expect(middlePath).toMatch(/ L 350 172\.5$/);
    const final = diagram.evaluateAt(400);
    expect(final.nodes[3]).toMatchObject({ x: 410, y: 200, width: 60, height: 30 });
    expect(final.edges[0]?.path).toContain("Q 265 130");
    expect(final.edges[0]?.path).toMatch(/ L 410 215$/);
    expect(final.warnings).toContainEqual(expect.objectContaining({ code: "text-overflow", objectId: "service" }));
    expect(diagram.evaluateAt(1000).nodes).toEqual(final.nodes);
    expect(diagram.renderSvg(200)).toContain(`d="${middlePath}"`);
  });

  it("includes revealed obstacles at zero opacity and removes them only after a hide transition", () => {
    const document: DiagramDocument = {
      version: 1, viewport: { width: 500, height: 280 },
      nodes: [
        { id: "source", kind: "rect", x: 20, y: 100, width: 100, height: 60 },
        { id: "obstacle", kind: "rect", x: 180, y: 90, width: 80, height: 80, visible: false },
        { id: "target", kind: "rect", x: 340, y: 100, width: 100, height: 60 }
      ], edges: [{ id: "flow", from: "source", to: "target", route: "orthogonal" }],
      scenes: [{ id: "route", label: "Route", beats: [
        { durationMs: 1000, transitionMs: 400, actions: [{ type: "show", target: "obstacle" }] },
        { durationMs: 1000, transitionMs: 400, actions: [{ type: "hide", target: "obstacle" }] }
      ] }]
    };
    const diagram = createDiagram(document);
    const detour = diagram.evaluateAt(0).edges[0]!.path;
    expect(detour).toContain(" Q ");
    expect(diagram.hitTest(0, { x: 220, y: 82 })).toEqual({ type: "edge", id: "flow" });
    expect(diagram.evaluateAt(0).nodes[1]?.opacity).toBe(0);
    expect(diagram.evaluateAt(0).edges[0]?.path).toBe(detour);
    expect(diagram.evaluateAt(200).edges[0]?.path).toBe(detour);
    expect(diagram.evaluateAt(1399).edges[0]?.path).toBe(detour);
    expect(diagram.evaluateAt(1400).edges[0]?.path).toBe("M 120 130 L 340 130");
    expect(diagram.renderSvg(1400)).not.toContain('data-id="obstacle"');
  });
});


describe("ordinary styles under highlights", () => {
  it.each([false, true])("keeps updated base colors beneath highlights regardless of action order (reverse: %s)", (reverse) => {
    const document = narrative();
    document.nodes[0]!.style = { fill: "#000", stroke: "#000" };
    document.nodes[2]!.visible = true;
    document.edges[0]!.style = { stroke: "#000" };
    const recolor = (color: string): Action[] => [
      { type: "updateNode", target: "client", value: { fill: color, stroke: color } },
      { type: "updateEdge", target: "request", value: { stroke: color } }
    ];
    const combine = (color: string, type: "highlight" | "unhighlight"): Action[] => {
      const actions: Action[] = [...recolor(color), { type, target: "client" }, { type, target: "request" }];
      return reverse ? actions.reverse() : actions;
    };
    document.scenes = [
      { id: "highlight", label: "Highlight", beats: [
        { durationMs: 1000, transitionMs: 400, actions: combine("#f00", "highlight") },
        { durationMs: 1000, transitionMs: 400, actions: recolor("#00f") }
      ] },
      { id: "restore", label: "Restore", beats: [
        { durationMs: 1000, transitionMs: 400, actions: combine("#0f0", "unhighlight") }
      ] }
    ];
    const diagram = createDiagram(document);
    expect(diagram.evaluateAt(200).nodes[0]?.style?.fill).toBe("#b57980");
    expect(diagram.evaluateAt(200).edges[0]?.style?.stroke).toBe("#553264");
    for (const time of [400, 1000, 1200, 1400, 2000]) {
      expect(diagram.evaluateAt(time).nodes[0]?.style?.fill).toBe("#eaf1ff");
      expect(diagram.evaluateAt(time).edges[0]?.style?.stroke).toBe("#2a63c8");
    }
    expect(diagram.evaluateAt(2200).nodes[0]?.style?.fill).toBe("#75b9c0");
    expect(diagram.evaluateAt(2200).edges[0]?.style?.stroke).toBe("#1572a4");
    expect(diagram.evaluateAt(2400).nodes[0]?.style?.fill).toBe("#0f0");
    expect(diagram.evaluateAt(2400).edges[0]?.style?.stroke).toBe("#0f0");
    expect(diagram.evaluateAt(3000).nodes[0]?.style?.stroke).toBe("#0f0");
  });

  it("interpolates alpha colors and resolves unspecified source colors from the evaluation theme", () => {
    const document = narrative();
    document.nodes[0]!.style = { stroke: "#0000" };
    document.scenes[0]!.beats[0]!.actions.push({ type: "updateNode", target: "client", value: { fill: "#fff", stroke: "#ffff" } });
    const diagram = createDiagram(document);
    expect(diagram.evaluateAt(200).nodes[0]?.style?.stroke).toBe("#80808080");
    expect(diagram.evaluateAt(200).nodes[0]?.style?.fill).toBe("#ffffff");
    expect(diagram.evaluateAt(200, { theme: "dark" }).nodes[0]?.style?.fill).toBe("#8e949c");
  });

  it("rejects unknown update targets and duplicate fields with precise document paths", () => {
    const document = narrative();
    document.scenes[0]!.beats[0]!.actions = [
      { type: "updateNode", target: "missing", value: { x: 20 } },
      { type: "updateEdge", target: "client", value: { stroke: "#fff" } },
      { type: "updateNode", target: "client", value: { x: 20 } },
      { type: "updateNode", target: "client", value: { x: 30 } },
      { type: "updateEdge", target: "request", value: { stroke: "#fff" } },
      { type: "updateEdge", target: "request", value: { stroke: "#000" } }
    ];
    expect(validateDocument(document).map((issue) => issue.path)).toEqual([
      "scenes[0].beats[0].actions[0].target", "scenes[0].beats[0].actions[1].target",
      "scenes[0].beats[0].actions[3].value.x", "scenes[0].beats[0].actions[5].value.stroke"
    ]);
  });
});

describe("finite interpolation boundaries", () => {
  it("preserves exact endpoints and finite midpoints for supported numeric update values", () => {
    const diagram = createDiagram({
      version: 1, viewport: { width: 600, height: 300 },
      nodes: [{ id: "node", kind: "rect", x: 20, y: 1e308, width: 100, height: 60 }], edges: [],
      scenes: [{ id: "move", label: "Move", beats: [{ durationMs: 400, transitionMs: 400, actions: [
        { type: "updateNode", target: "node", value: { x: 0.1, y: -1e308 } }
      ] }] }]
    });
    expect(diagram.evaluateAt(0).nodes[0]?.y).toBe(1e308);
    expect(diagram.evaluateAt(200).nodes[0]?.y).toBe(0);
    expect(diagram.evaluateAt(400).nodes[0]?.x).toBe(0.1);
    expect(diagram.evaluateAt(400).nodes[0]?.y).toBe(-1e308);
  });
});

describe("edge flow markers", () => {
  const document = (action: unknown) => ({
    version: 1 as const,
    viewport: { width: 500, height: 200 },
    nodes: [
      { id: "source", kind: "rect" as const, x: 20, y: 70, width: 80, height: 60 },
      { id: "target", kind: "rect" as const, x: 400, y: 70, width: 80, height: 60 }
    ],
    edges: [{ id: "request", from: "source", to: "target", label: "" }],
    scenes: [{ id: "request", label: "Request", beats: [{ durationMs: 1000, actions: [action] }] }]
  });

  it("validates a directional flow action and evaluates a reference-speed marker across the extended beat", () => {
    const input = document({ type: "flow", target: "request", direction: "forward" });
    expect(validateDocument(input)).toEqual([]);
    const diagram = createDiagram(input as Parameters<typeof createDiagram>[0]);
    const start = diagram.evaluateAt(0).edges[0]!;
    const middle = diagram.evaluateAt(500).edges[0]!;
    const end = diagram.evaluateAt(diagram.totalDuration).edges[0]!;
    expect(start.flow).toMatchObject({ direction: "forward", progress: 0, point: { x: 100, y: 100 } });
    expect(middle.flow).toMatchObject({ direction: "forward", progress: 0.3, point: { x: 190, y: 100 } });
    expect(end.flow).toBeUndefined();
    expect(start.highlighted).toBe(true);
  });

  it("moves a reverse flow while retaining the static arrow and exports its marker", () => {
    const input = document({ type: "flow", target: "request", direction: "reverse", text: "ok" });
    const diagram = createDiagram(input as Parameters<typeof createDiagram>[0]);
    const frame = diagram.evaluateAt(250);
    expect(frame.edges[0]?.flow).toMatchObject({ direction: "reverse", progress: 0.15, point: { x: 355, y: 100 } });
    const svg = diagram.renderSvg(250);
    expect(svg).toContain('marker-end="url(#diagram-arrow)"');
    expect(svg).toContain('data-flow-id="request"');
  });

  it("exports each beat's text as a horizontal capsule without replacing the static edge label", () => {
    const input = document({ type: "flow", target: "request", direction: "forward", text: "请求" });
    input.edges[0]!.label = "API";
    input.scenes[0]!.beats.push({ durationMs: 1000, actions: [
      { type: "flow", target: "request", direction: "reverse", text: "Response" }
    ] });
    const diagram = createDiagram(input as Parameters<typeof createDiagram>[0]);

    expect(diagram.evaluateAt(500).edges[0]?.flow?.text).toBe("请求");
    expect(diagram.evaluateAt(diagram.beats[1]!.startMs + 500).edges[0]?.flow?.text).toBe("Response");
    expect(diagram.evaluateAt(500).edges[0]?.labelLines).toEqual(["API"]);
    const requestSvg = diagram.renderSvg(500);
    const responseSvg = diagram.renderSvg(diagram.beats[1]!.startMs + 500);
    expect(requestSvg).toMatch(/<g[^>]*data-flow-id="request"[^>]*><rect[^>]*rx="12"/);
    expect(requestSvg).toContain(">请求</text>");
    expect(responseSvg).toContain(">Response</text>");
    expect(requestSvg).not.toMatch(/rotate|textPath|tabindex/);
    expect(requestSvg).toContain('pointer-events="none"');
    expect(diagram.renderSvg(diagram.totalDuration)).not.toContain("data-flow-id");
    expect(diagram.renderSvg(500, { reducedMotion: true })).not.toContain("data-flow-id");
  });

  it("sizes Unicode and wide Latin messages deterministically and escapes message markup", () => {
    const markerSvg = (text: string) => createDiagram(document({
      type: "flow", target: "request", direction: "forward", text
    }) as Parameters<typeof createDiagram>[0]).renderSvg(500);
    const capsuleWidth = (svg: string) => Number(svg.match(/data-flow-id="request"[^>]*><rect[^>]*width="([^"]+)"/)?.[1]);

    expect(capsuleWidth(markerSvg("请求"))).toBeGreaterThan(capsuleWidth(markerSvg("ok")));
    expect(capsuleWidth(markerSvg("😀"))).toBe(capsuleWidth(markerSvg("请")));
    expect(capsuleWidth(markerSvg("mmmmmmmmmmmm"))).toBeGreaterThanOrEqual(140);
    expect(capsuleWidth(markerSvg(""))).toBeGreaterThan(0);
    expect(markerSvg("请求😀")).toBe(markerSvg("请求😀"));
    const escaped = markerSvg(`<script>&"'😀`);
    expect(escaped).toContain("&lt;script&gt;&amp;&quot;&apos;😀</text>");
    expect(escaped).not.toContain("<script>");
    const dotSvg = createDiagram(document({ type: "flow", target: "request", direction: "forward" }) as Parameters<typeof createDiagram>[0]).renderSvg(500);
    expect(dotSvg).toMatch(/<circle[^>]*r="5"[^>]*data-flow-id="request"/);
  });

  it("rejects invalid direction and targets at their action fields", () => {
    const input = {
      ...document({ type: "flow", target: "request", direction: "forward" }),
      scenes: [{ id: "bad", label: "Bad", beats: [{ durationMs: 1000, actions: [
        { type: "flow", target: "source", direction: "sideways" },
        { type: "flow", target: "request", direction: "forward" },
        { type: "flow", target: "request", direction: "forward" }
      ] }] }]
    } as unknown;
    expect(validateDocument(input)).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: "scenes[0].beats[0].actions[0].target" }),
      expect.objectContaining({ path: "scenes[0].beats[0].actions[0].direction" }),
      expect.objectContaining({ path: "scenes[0].beats[0].actions[2].target" })
    ]));
  });

  it("keeps transfer highlighting layered over explicit highlighting and hides only the marker for reduced motion", () => {
    const input = document({ type: "flow", target: "request", direction: "forward" });
    input.scenes[0]!.beats = [
      { durationMs: 1000, actions: [
        { type: "highlight", target: "source" },
        { type: "flow", target: "request", direction: "forward" }
      ] },
      { durationMs: 1000, actions: [{ type: "updateNode", target: "source", value: { fill: "#00ff00" } }] },
      { durationMs: 1000, actions: [{ type: "unhighlight", target: "source" }] }
    ];
    const diagram = createDiagram(input as Parameters<typeof createDiagram>[0]);
    const reduced = diagram.evaluateAt(500, { reducedMotion: true });
    expect(reduced.edges[0]?.flow).toBeUndefined();
    expect(reduced.edges[0]?.highlighted).toBe(true);
    expect(reduced.nodes[0]?.highlighted).toBe(true);
    expect(diagram.evaluateAt(diagram.beats[1]!.startMs).edges[0]?.flow).toBeUndefined();
    expect(diagram.evaluateAt(diagram.beats[1]!.startMs).nodes[0]?.highlighted).toBe(true);
    expect(diagram.evaluateAt(diagram.beats[1]!.startMs + 500).nodes[0]?.style?.fill).toBe("#eaf1ff");
    expect(diagram.evaluateAt(diagram.beats[2]!.startMs + 500).nodes[0]?.style?.fill).toBe("#00ff00");
    expect(diagram.renderSvg(500, { reducedMotion: true })).not.toContain("data-flow-id");
  });

  it("does not reveal a marker when an endpoint is hidden by its own or ancestor visibility", () => {
    const input = document({ type: "flow", target: "request", direction: "forward" });
    input.nodes[1]!.visible = false;
    const diagram = createDiagram(input as Parameters<typeof createDiagram>[0]);
    const frame = diagram.evaluateAt(500);
    expect(frame.edges[0]?.flow).toBeUndefined();
    expect(diagram.renderSvg(500)).not.toContain("data-flow-id");
  });
});


describe("parallel beat flows", () => {
  it("rejects repeated edge transfers even when an earlier transfer has an invalid direction", () => {
    const document: unknown = {
      version: 1,
      viewport: { width: 500, height: 200 },
      nodes: [
        { id: "source", kind: "rect", x: 20, y: 70, width: 80, height: 60 },
        { id: "target", kind: "rect", x: 400, y: 70, width: 80, height: 60 }
      ],
      edges: [{ id: "request", from: "source", to: "target" }],
      scenes: [{ id: "transfer", label: "Transfer", beats: [{ durationMs: 1000, actions: [
        { type: "flow", target: "request", direction: "sideways" },
        { type: "flow", target: "request", direction: "reverse" }
      ] }] }]
    };
    expect(validateDocument(document)).toEqual([
      { path: "scenes[0].beats[0].actions[0].direction", message: "must be forward or reverse" },
      { path: "scenes[0].beats[0].actions[1].target", message: "duplicate beat assignment" }
    ]);
  });
});
