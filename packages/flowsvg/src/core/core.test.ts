import { describe, expect, it } from "vitest";
import { createDiagram, renderSvg, DiagramValidationError, validateDocument, type DiagramDocument } from "../index.js";

const staticDocument: DiagramDocument = {
  version: 1,
  title: "Request flow <demo>",
  viewport: { width: 640, height: 320 },
  nodes: [
    { id: "client", kind: "rect", x: 60, y: 120, width: 160, height: 80, label: "Client & caller" },
    { id: "service", kind: "rect", x: 420, y: 120, width: 160, height: 80, label: "Service" }
  ],
  edges: [{ id: "request", from: "client", to: "service", route: "straight", label: "request" }],
  scenes: []
};

describe("static diagram core", () => {
  it("resolves explicit visual options and exports an independently readable accessible SVG", () => {
    const document: DiagramDocument = { ...staticDocument, theme: "dark" };
    const diagram = createDiagram(document);
    expect(createDiagram({ ...document, theme: undefined }).evaluateAt(0).nodes[0]?.style?.fill).toBe("#ffffff");
    expect(diagram.evaluateAt(0).nodes[0]?.style?.fill).toBe("#1d2939");
    const frame = diagram.evaluateAt(0, { theme: "light" });
    expect(frame.nodes[0]?.style).toEqual({ fill: "#ffffff", stroke: "#cfd8e3", strokeWidth: 1.2, textColor: "#1d2939" });
    expect(frame.edges[0]?.style).toEqual({ stroke: "#8892a4", strokeWidth: 2, dashed: false });
    const svg = diagram.renderSvg(0, { theme: "light" });
    expect(svg).toContain('aria-label="Request flow &lt;demo&gt;"');
    expect(svg).toContain('font-family="system-ui,');
    expect(svg).toContain('fill="#ffffff"');
    expect(svg).not.toContain("var(");
    expect(svg).not.toContain("<style");
  });

  it("evaluates a static document into stable frame state and SVG", () => {
    const diagram = createDiagram(staticDocument);
    const frame = diagram.evaluateAt(42);

    expect(diagram.totalDuration).toBe(0);
    expect(frame.timeMs).toBe(0);
    expect(frame.nodes).toHaveLength(2);
    expect(frame.edges[0]?.path).toBe("M 220 160 L 420 160");
    expect(diagram.renderSvg(999)).toContain('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 320"');
    expect(diagram.renderSvg(0)).toContain("Client &amp; caller");
    expect(renderSvg(staticDocument, 0)).toBe(diagram.renderSvg(0));
  });

  it("copies the source document during compilation", () => {
    const diagram = createDiagram(staticDocument);
    staticDocument.nodes[0]!.label = "mutated";
    staticDocument.nodes[0]!.x = 999;

    const frame = diagram.evaluateAt(0);
    expect(frame.nodes[0]?.label).toBe("Client & caller");
    expect(frame.nodes[0]?.x).toBe(60);
  });
});

describe("shapes, groups, and deterministic text layout", () => {
  it.each([
    { label: "😀", lines: ["😀"] },
    { label: "A😀B", lines: ["A", "😀", "B"] },
    { label: "😀 😀\n", lines: ["😀", "😀", ""] }
  ])("preserves Unicode characters when wrapping a narrow label: $label", ({ label, lines }) => {
    const diagram = createDiagram({
      version: 1,
      viewport: { width: 100, height: 100 },
      nodes: [{ id: "emoji", kind: "rect", x: 0, y: 0, width: 30, height: 90, label }],
      edges: [],
      scenes: []
    });

    expect(diagram.evaluateAt(0).nodes[0]?.labelLines).toEqual(lines);
    expect(diagram.renderSvg()).toContain(">😀</tspan>");
  });

  const documentWithShapes: DiagramDocument = {
    version: 1,
    viewport: { width: 800, height: 500 },
    nodes: [
      { id: "group", kind: "group", x: 100, y: 80, width: 500, height: 300, label: "Outer group", style: { dashed: true } },
      { id: "nested", kind: "group", x: 40, y: 50, width: 300, height: 180, parentId: "group", label: "Nested group" },
      { id: "rounded", kind: "roundedRect", x: 20, y: 20, width: 120, height: 70, parentId: "nested", label: "Rounded" },
      { id: "ellipse", kind: "ellipse", x: 190, y: 20, width: 120, height: 70, parentId: "nested", label: "Ellipse" },
      { id: "cylinder", kind: "cylinder", x: 40, y: 160, width: 140, height: 90, parentId: "group", label: "Database" },
      { id: "long", kind: "rect", x: 400, y: 100, width: 180, height: 30, label: "A very long label that wraps\nwith an explicit line" }
    ],
    edges: [{ id: "link", from: "rounded", to: "ellipse", label: "a long edge label" }],
    scenes: []
  };

  it("resolves nested child coordinates and renders every shape consistently", () => {
    const diagram = createDiagram(documentWithShapes);
    const frame = diagram.evaluateAt(0);
    expect(frame.nodes.find((node) => node.id === "rounded")?.x).toBe(160);
    expect(frame.nodes.find((node) => node.id === "rounded")?.y).toBe(150);
    expect(frame.nodes.find((node) => node.id === "cylinder")?.x).toBe(140);
    const svg = diagram.renderSvg(0);
    expect(svg).toContain('rx="8"');
    expect(svg).toContain("<ellipse");
    expect(svg).toContain("cylinder");
    expect(svg.indexOf('id="group"')).toBeGreaterThanOrEqual(0);
    expect(svg).toContain("A very long");
    expect(svg).toContain("with an explicit");
    expect(svg).toContain("<tspan");
    expect(svg).toContain('stroke-dasharray="10 7"');
    expect(frame.warnings.some((warning) => warning.objectId === "long" && warning.code === "text-overflow")).toBe(true);
  });

  it("keeps the cylinder cap filled while preserving one node interaction identity", () => {
    const document = {
      ...documentWithShapes,
      nodes: documentWithShapes.nodes.map((node) => node.id === "cylinder" ? { ...node, style: { fill: "#123456" } } : node)
    } satisfies DiagramDocument;
    const diagram = createDiagram(document);
    const svg = diagram.renderSvg(0);
    const cylinder = svg.match(/<g [^>]*data-id="cylinder"[^>]*>[\s\S]*?<\/g>/)?.[0];

    expect(cylinder).toBeDefined();
    expect(cylinder).toContain('fill="#123456"');
    expect(cylinder).toContain('<ellipse cx="210" cy="254" rx="70" ry="14"');
    expect(svg.match(/data-id="cylinder"/g)).toHaveLength(1);
  });

  it("uses identical wrapped lines for evaluation and SVG export", () => {
    const diagram = createDiagram(documentWithShapes);
    const frame = diagram.evaluateAt(0);
    const longNode = frame.nodes.find((node) => node.id === "long");
    expect(longNode?.labelLines).toEqual(["A very long label", "that wraps", "with an explicit", "line"]);
    const svg = diagram.renderSvg(0);
    for (const line of longNode?.labelLines ?? []) expect(svg).toContain(line);
  });
});

describe("strict document validation", () => {
  const validNarrativeDocument = (): DiagramDocument => ({
    version: 1,
    viewport: { width: 640, height: 320 },
    nodes: [
      { id: "group", kind: "group", x: 20, y: 20, width: 300, height: 240 },
      { id: "client", kind: "rect", x: 40, y: 80, width: 100, height: 60, parentId: "group" },
      { id: "service", kind: "rect", x: 180, y: 80, width: 100, height: 60, parentId: "group" }
    ],
    edges: [{ id: "request", from: "client", to: "service" }],
    scenes: [{
      id: "flow",
      label: "Flow",
      beats: [{ durationMs: 100, actions: [{ type: "show", target: "service" }] }]
    }]
  });

  it("reports unknown fields, actions, and duplicate beat assignments", async () => {
    const document = validNarrativeDocument() as unknown as Record<string, unknown>;
    (document as Record<string, unknown>).extra = true;
    const scene = (document.scenes as Array<Record<string, unknown>>)[0]!;
    const beat = (scene.beats as Array<Record<string, unknown>>)[0]!;
    beat.extra = "nope";
    beat.actions = [
      { type: "show", target: "service" },
      { type: "show", target: "service" },
      { type: "explode", target: "service", value: "bad" }
    ];
    const issues = validateDocument(document);

    expect(issues.map((issue) => issue.path)).toEqual(expect.arrayContaining([
      "extra",
      "scenes[0].beats[0].extra",
      "scenes[0].beats[0].actions[2].type",
      "scenes[0].beats[0].actions[1]"
    ]));
  });

  it("reports inherited property names as unknown actions instead of throwing", () => {
    const document = validNarrativeDocument();
    document.scenes[0]!.beats[0]!.actions = [{ type: "toString", target: "service" }] as unknown as DiagramDocument["scenes"][number]["beats"][number]["actions"];

    expect(validateDocument(document)).toContainEqual({
      path: "scenes[0].beats[0].actions[0].type",
      message: "unknown action"
    });
  });

  it("rejects invalid references and group cycles", () => {
    const document = validNarrativeDocument();
    document.nodes[2]!.kind = "group";
    document.nodes[0]!.parentId = "service";
    document.nodes[2]!.parentId = "group";
    document.edges[0]!.from = "missing";
    document.scenes[0]!.beats[0]!.actions = [{ type: "focus", target: "missing" }];

    const issues = validateDocument(document);
    expect(issues.map((issue) => issue.path)).toEqual(expect.arrayContaining([
      "nodes[0].parentId",
      "nodes[1].parentId",
      "edges[0].from",
      "scenes[0].beats[0].actions[0].target"
    ]));
  });

  it("rejects invalid colors, dimensions, and durations", () => {
    const document = validNarrativeDocument() as unknown as Record<string, unknown>;
    const nodes = document.nodes as Array<Record<string, unknown>>;
    nodes[1]!.width = Number.POSITIVE_INFINITY;
    nodes[1]!.style = { fill: "red;stroke:url(javascript:alert(1))" };
    const beat = ((document.scenes as Array<Record<string, unknown>>)[0]!.beats as Array<Record<string, unknown>>)[0]!;
    beat.durationMs = 0;
    beat.transitionMs = -1;

    const issues = validateDocument(document);
    expect(issues.map((issue) => issue.path)).toEqual(expect.arrayContaining([
      "nodes[1].width",
      "nodes[1].style.fill",
      "scenes[0].beats[0].durationMs",
      "scenes[0].beats[0].transitionMs"
    ]));
  });

  it("collects errors from valid collections even when another collection is malformed", () => {
    const document = validNarrativeDocument();
    const invalid = { ...document, nodes: null, edges: [{ ...document.edges[0], style: { strokeWidth: -2 } }] };

    expect(validateDocument(invalid).map((issue) => issue.path)).toEqual(expect.arrayContaining([
      "nodes", "edges[0].style.strokeWidth"
    ]));
  });

  it("rejects non-data objects before cloning can change their meaning", () => {
    const document = validNarrativeDocument();
    const invalid = { ...document, nodes: [{ ...document.nodes[0], style: new Date(0) }] };

    expect(validateDocument(invalid).map((issue) => issue.path)).toContain("nodes[0].style");
  });

  it("throws a typed error containing every issue and escapes hostile text", () => {
    const document = validNarrativeDocument();
    document.title = "</title><script>alert(1)</script>";
    document.nodes[1]!.label = "<img src=x onerror=alert(1)>";
    const diagram = createDiagram(document);
    const svg = diagram.renderSvg();

    expect(svg).not.toContain("<script>");
    expect(svg).not.toContain("<img");
    expect(svg).toContain("&lt;img");
    expect(svg).toContain("&gt;");

    const invalid = validNarrativeDocument() as unknown as Record<string, unknown>;
    (invalid as Record<string, unknown>).unknown = true;
    expect(() => createDiagram(invalid as unknown as DiagramDocument)).toThrow(DiagramValidationError);
    try {
      createDiagram(invalid as unknown as DiagramDocument);
    } catch (error) {
      expect(error).toBeInstanceOf(DiagramValidationError);
      expect((error as DiagramValidationError).issues.length).toBeGreaterThan(0);
    }
  });
});

describe("orthogonal edge routing", () => {
  it.each([
    { width: 100, height: 100, x: 200, y: 200, path: "M 85.355 85.355 L 214.645 214.645" },
    { width: 200, height: 100, x: 200, y: 100, path: "M 170.711 85.355 L 229.289 114.645" },
    { width: 200, height: 100, x: 300, y: 0, path: "M 200 50 L 300 50" }
  ])("attaches straight edges to ellipse contours ($width × $height, target $x/$y)", ({ width, height, x, y, path }) => {
    const diagram = createDiagram({
      version: 1,
      viewport: { width: 600, height: 400 },
      nodes: [
        { id: "source", kind: "ellipse", x: 0, y: 0, width, height },
        { id: "target", kind: "ellipse", x, y, width, height }
      ],
      edges: [{ id: "flow", from: "source", to: "target", route: "straight" }],
      scenes: []
    });

    expect(diagram.evaluateAt(0).edges[0]?.path).toBe(path);
    expect(diagram.renderSvg()).toContain(`d="${path}"`);
  });

  it("attaches orthogonal edges to boundaries and uses only horizontal/vertical segments", () => {
    const document: DiagramDocument = {
      version: 1,
      viewport: { width: 500, height: 360 },
      nodes: [
        { id: "source", kind: "rect", x: 20, y: 100, width: 100, height: 60 },
        { id: "target", kind: "rect", x: 300, y: 220, width: 100, height: 60 },
        { id: "container", kind: "group", x: 0, y: 0, width: 500, height: 360 }
      ],
      edges: [{ id: "flow", from: "source", to: "target", route: "orthogonal" }],
      scenes: []
    };

    const path = createDiagram(document).evaluateAt(0).edges[0]?.path;
    expect(path).toBe("M 120 130 L 210 130 L 210 250 L 300 250");
    expect(path).not.toContain("container");
  });

  it("routes around visible ordinary node obstacles deterministically", () => {
    const document: DiagramDocument = {
      version: 1,
      viewport: { width: 500, height: 280 },
      nodes: [
        { id: "source", kind: "rect", x: 20, y: 100, width: 100, height: 60 },
        { id: "obstacle", kind: "rect", x: 180, y: 90, width: 80, height: 80 },
        { id: "target", kind: "rect", x: 340, y: 100, width: 100, height: 60 }
      ],
      edges: [{ id: "flow", from: "source", to: "target", route: "orthogonal" }],
      scenes: []
    };

    const diagram = createDiagram(document);
    const first = diagram.evaluateAt(0).edges[0]?.path;
    const second = diagram.evaluateAt(0).edges[0]?.path;
    expect(first).toBe("M 120 130 L 172 130 L 172 82 L 316 82 L 316 130 L 340 130");
    expect(second).toBe(first);
    expect(first).not.toContain("M 120 130 L 340 130");
  });

  it("falls back to a stable orthogonal path and exports a directional arrow", () => {
    const document: DiagramDocument = {
      version: 1,
      viewport: { width: 360, height: 200 },
      nodes: [
        { id: "source", kind: "rect", x: 20, y: 70, width: 80, height: 60 },
        { id: "obstacle", kind: "rect", x: 100, y: 0, width: 160, height: 200 },
        { id: "target", kind: "rect", x: 280, y: 70, width: 60, height: 60 }
      ],
      edges: [{ id: "flow", from: "source", to: "target", route: "orthogonal" }],
      scenes: []
    };

    const diagram = createDiagram(document);
    const frame = diagram.evaluateAt(0);
    expect(frame.edges[0]?.path).toBe("M 100 100 L 280 100");
    const svg = diagram.renderSvg(0);
    expect(svg).toContain('<marker id="diagram-arrow"');
    expect(svg).toContain('marker-end="url(#diagram-arrow)"');
    expect(svg).toContain(`d="${frame.edges[0]?.path}"`);
  });
});

describe("focus camera and hit testing", () => {
  it("hits foreground nodes and edges before group backgrounds regardless of declaration order", () => {
    const diagram = createDiagram({
      version: 1,
      viewport: { width: 400, height: 300 },
      nodes: [
        { id: "child", kind: "rect", x: 20, y: 20, width: 50, height: 50, parentId: "group" },
        { id: "from", kind: "rect", x: 0, y: 100, width: 20, height: 20 },
        { id: "to", kind: "rect", x: 320, y: 100, width: 20, height: 20 },
        { id: "group", kind: "group", x: 100, y: 50, width: 200, height: 200 }
      ],
      edges: [{ id: "link", from: "from", to: "to" }],
      scenes: []
    });

    expect(diagram.hitTest(0, { x: 130, y: 80 })).toEqual({ id: "child", type: "node" });
    expect(diagram.hitTest(0, { x: 200, y: 110 })).toEqual({ id: "link", type: "edge" });
    expect(diagram.hitTest(0, { x: 200, y: 200 })).toEqual({ id: "group", type: "node" });
  });

  it("keeps the dark background over an offset focus camera", () => {
    const diagram = createDiagram({
      version: 1,
      viewport: { width: 640, height: 320 },
      nodes: [{ id: "right", kind: "rect", x: 500, y: 120, width: 60, height: 60 }],
      edges: [],
      scenes: [{ id: "focus", label: "Focus", beats: [{
        durationMs: 1000, transitionMs: 0, actions: [{ type: "focus", target: "right" }]
      }] }]
    });

    expect(diagram.evaluateAt(0).camera).toEqual({ x: 422, y: 96, width: 216, height: 108 });
    expect(diagram.renderSvg(0, { theme: "dark" })).toContain(
      '<rect x="422" y="96" width="216" height="108" fill="#101828"/>'
    );
  });

  const focusedDocument: DiagramDocument = {
    version: 1,
    viewport: { width: 640, height: 320 },
    nodes: [
      { id: "client", kind: "rect", x: 40, y: 120, width: 120, height: 80 },
      { id: "service", kind: "rect", x: 460, y: 120, width: 120, height: 80 },
      { id: "group", kind: "group", x: 220, y: 40, width: 180, height: 240 },
      { id: "child", kind: "ellipse", x: 30, y: 80, width: 120, height: 80, parentId: "group" },
      { id: "hidden", kind: "rect", x: 20, y: 20, width: 80, height: 50, visible: false }
    ],
    edges: [
      { id: "request", from: "client", to: "service", route: "straight" },
      { id: "inside", from: "client", to: "child", route: "straight" }
    ],
    scenes: [{ id: "flow", label: "Flow", beats: [
      { durationMs: 1000, transitionMs: 200, actions: [{ type: "focus", target: "child" }] },
      { durationMs: 1000, transitionMs: 200, actions: [{ type: "focus", target: null }] }
    ] }]
  };

  it("focuses a node with aspect-preserving camera interpolation and restores the full viewport", () => {
    const diagram = createDiagram(focusedDocument);
    const full = diagram.evaluateAt(0).camera;
    const middle = diagram.evaluateAt(1100).camera;
    const focused = diagram.evaluateAt(1000).camera;
    const restored = diagram.evaluateAt(2000).camera;

    expect(full).toEqual({ x: 0, y: 0, width: 640, height: 320 });
    expect(middle.width).toBeLessThan(full.width);
    expect(middle.width / middle.height).toBeCloseTo(2);
    expect(focused.width / focused.height).toBeCloseTo(2);
    expect(focused.x).toBeLessThan(260);
    expect(focused.x + focused.width).toBeGreaterThan(370);
    expect(restored).toEqual(full);
    expect(diagram.renderSvg(1000)).toContain(`viewBox="${focused.x} ${focused.y} ${focused.width} ${focused.height}"`);
  });

  it("hits visible nodes and edges in document coordinates and ignores hidden objects", () => {
    const diagram = createDiagram(focusedDocument);
    expect(diagram.hitTest(0, { x: 80, y: 150 })).toEqual({ id: "client", type: "node" });
    expect(diagram.hitTest(0, { x: 205, y: 160 })).toEqual({ id: "inside", type: "edge" });
    expect(diagram.hitTest(0, { x: 40, y: 40 })).toBeNull();
    expect(diagram.hitTest(0, { x: 700, y: 50 })).toBeNull();
  });
});

describe("curved routing and cardinal ports", () => {
  it("accepts curved routes and validates port directions strictly", () => {
    const document: DiagramDocument = {
      version: 1,
      viewport: { width: 600, height: 300 },
      nodes: [
        { id: "source", kind: "rect", x: 40, y: 100, width: 100, height: 60 },
        { id: "target", kind: "ellipse", x: 420, y: 100, width: 120, height: 80 }
      ],
      edges: [{ id: "flow", from: "source", to: "target", route: "curved", fromPort: "right", toPort: "left" }],
      scenes: []
    };

    expect(validateDocument(document)).toEqual([]);
    const invalid = { ...document, edges: [{ ...document.edges[0], fromPort: "diagonal" }] } as unknown as DiagramDocument;
    expect(validateDocument(invalid)).toContainEqual({ path: "edges[0].fromPort", message: "must be top, right, bottom or left" });
  });

  it("uses explicit rectangle midpoints and ellipse contour points for curved paths", () => {
    const diagram = createDiagram({
      version: 1,
      viewport: { width: 600, height: 300 },
      nodes: [
        { id: "source", kind: "rect", x: 40, y: 100, width: 100, height: 60 },
        { id: "target", kind: "ellipse", x: 420, y: 100, width: 120, height: 80 }
      ],
      edges: [{ id: "flow", from: "source", to: "target", route: "curved", fromPort: "right", toPort: "left" }],
      scenes: []
    });
    const path = diagram.evaluateAt(0).edges[0]?.path ?? "";

    expect(path).toMatch(/^M 140 130 C /);
    expect(path).toMatch(/ 420 140$/);
    expect(path).toContain("C");
    const values = path.match(/-?\d+(?:\.\d+)?/g)!.map(Number);
    expect(values[3]).toBe(130);
    expect(values[4]).toBeLessThan(420);
    expect(values[5]).toBe(140);
    expect(diagram.renderSvg()).toContain(`d="${path}"`);
    expect(diagram.hitTest(0, { x: 280, y: 135 })).toEqual({ id: "flow", type: "edge" });
  });

  it("separates opposite curved relationships deterministically", () => {
    const document: DiagramDocument = {
      version: 1,
      viewport: { width: 600, height: 300 },
      nodes: [
        { id: "a", kind: "rect", x: 60, y: 110, width: 100, height: 60 },
        { id: "b", kind: "rect", x: 440, y: 110, width: 100, height: 60 }
      ],
      edges: [
        { id: "request", from: "a", to: "b", route: "curved" },
        { id: "response", from: "b", to: "a", route: "curved" }
      ],
      scenes: []
    };
    const diagram = createDiagram(document);
    const first = diagram.evaluateAt(0).edges.map((edge) => edge.path);
    const second = diagram.evaluateAt(0).edges.map((edge) => edge.path);

    expect(first[0]).not.toBe(first[1]);
    expect(first).toEqual(second);
    expect(first[0]).toContain("C");
    expect(first[1]).toContain("C");
    expect(diagram.hitTest(0, { x: 300, y: 185 })).toEqual({ id: "request", type: "edge" });
    expect(diagram.hitTest(0, { x: 300, y: 95 })).toEqual({ id: "response", type: "edge" });
  });
});
