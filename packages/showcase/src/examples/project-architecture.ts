/** Project architecture story. Arrows describe data/calls, while captions distinguish runtime and build-time paths. */
import type { DiagramDocument } from "flowsvg";
import type { ShowcaseAuthorDefinition } from "../model.js";
import { createExampleContent, measureExampleNode } from "./example-content.js";

const document: DiagramDocument = {
  version: 1,
  title: "FlowSVG: How diagrams run",
  // Retain authored minimum heights; 50-unit row gaps leave room for calls and transfer capsules.
  viewport: { width: 980, height: 604 },
  nodes: [
    measureExampleNode({ id: "document", kind: "roundedRect", x: 24, y: 24, width: 290, height: 144,
      content: createExampleContent("Diagram document", "Serializable", "Nodes · edges · scenes · beats", "DiagramDocument: play + export") }),
    measureExampleNode({ id: "core", kind: "roundedRect", x: 364, y: 24, width: 270, height: 144,
      content: createExampleContent("Core engine", "Pure TypeScript", "Validate · time · SVG", "No DOM · no browser clock") }),
    measureExampleNode({ id: "svg", kind: "roundedRect", x: 684, y: 24, width: 270, height: 144,
      content: createExampleContent("Static SVG", "Any time", "renderSvg(t)", "Core output · no DOM") }),
    measureExampleNode({ id: "adapters", kind: "roundedRect", x: 24, y: 218, width: 290, height: 144,
      content: createExampleContent("Host adapters", "Optional integration", "React · Vue · Web Component", "Reuse player · own lifecycle") }),
    measureExampleNode({ id: "browser", kind: "roundedRect", x: 364, y: 218, width: 270, height: 144,
      content: createExampleContent("Browser player", "DOM + clock", "Playback · controls · input", "Mount · update · release") }),
    measureExampleNode({ id: "gif", kind: "roundedRect", x: 684, y: 218, width: 270, height: 144,
      content: createExampleContent("GIF export", "On demand · Worker", "SVG → rasterize → encode", "Browser export · not a recording") }),
    measureExampleNode({ id: "showcase", kind: "roundedRect", x: 24, y: 436, width: 290, height: 144,
      content: createExampleContent("Showcase apps", "Private consumer", "Authoring · sessions · hosts", "@flowsvg/showcase · SDK consumer") }),
    measureExampleNode({ id: "node-tools", kind: "roundedRect", x: 644, y: 412, width: 310, height: 168,
      content: { style: { padding: 12, blockGap: 6 }, blocks: [
        { type: "title", text: "Node tools" },
        { type: "list", items: [{ tags: [{ text: "Node 20+", style: { shape: "pill", fontSize: 12 } }] }] },
        { type: "paragraph", text: "HTML: data + player + CSS" },
        { type: "paragraph", text: "GIF: Chromium exporter" },
        { type: "paragraph", role: "auxiliary", text: "Only GIF requires Chromium" }
      ] } })
  ],
  edges: [
    { id: "document-core", from: "document", to: "core", route: "orthogonal", fromPort: "right", toPort: "left" },
    { id: "core-svg", from: "core", to: "svg", route: "orthogonal", fromPort: "right", toPort: "left" },
    // Keep reciprocal calls so each beat can show frame results or time requests in its actual direction.
    { id: "core-browser", from: "core", to: "browser", route: "orthogonal", fromPort: "bottom", toPort: "top" },
    { id: "browser-core", from: "browser", to: "core", route: "orthogonal", fromPort: "top", toPort: "bottom" },
    { id: "adapters-browser", from: "adapters", to: "browser", route: "orthogonal", fromPort: "right", toPort: "left" },
    { id: "svg-gif", from: "svg", to: "gif", route: "orthogonal", fromPort: "bottom", toPort: "top" },
    // HTML embeds built player assets; this arrow does not mean a running browser is needed to assemble HTML.
    { id: "browser-node", from: "browser", to: "node-tools", route: "orthogonal", fromPort: "bottom", toPort: "left" },
    { id: "node-gif", from: "node-tools", to: "gif", route: "orthogonal", fromPort: "top", toPort: "bottom" },
    { id: "showcase-adapters", from: "showcase", to: "adapters", route: "orthogonal", fromPort: "top", toPort: "bottom" },
    { id: "showcase-browser", from: "showcase", to: "browser", route: "orthogonal", fromPort: "right", toPort: "bottom" }
  ],
  scenes: [
    { id: "define", label: "Define a diagram", beats: [{ durationMs: 3000,
      caption: "Authors describe nodes, edges, scenes and beats in one serializable DiagramDocument. Arrows represent data or calls, not a complete npm dependency tree.",
      actions: [{ type: "flow", target: "document-core", direction: "forward", text: "Diagram document" }]
    }] },
    { id: "evaluate", label: "Core evaluation", beats: [{ durationMs: 3000,
      caption: "The core validates the document, evaluates its timeline and geometry at the requested time, and outputs SVG. It does not read the DOM, network or browser clock.",
      actions: [{ type: "flow", target: "core-svg", direction: "forward", text: "SVG(t)" }]
    }] },
    { id: "integrate", label: "Integrate the player", beats: [
      { durationMs: 2000, caption: "React, Vue and Web Component adapters reuse the browser player and own their mount/cleanup lifecycle. Native pages can create the player directly.",
        actions: [{ type: "flow", target: "adapters-browser", direction: "forward", text: "Mount" }] },
      { durationMs: 2000, caption: "The browser player receives core frame state and updates the SVG DOM. Every integration shares the same timeline and rendering logic.",
        actions: [{ type: "flow", target: "core-browser", direction: "forward", text: "Frame state" }] }
    ] },
    { id: "operate", label: "Playback and controls", beats: [
      { durationMs: 2000, caption: "The player owns the browser clock, playback controls and interaction. Playback, seeking and visual changes pass time and settings to the core. Normal playback does not load the GIF encoder.",
        actions: [{ type: "flow", target: "browser-core", direction: "forward", text: "t + settings" }] },
      { durationMs: 2000, caption: "The core evaluates the requested time again, and the player displays the new frame. Controls do not maintain a second diagram timeline.",
        actions: [{ type: "flow", target: "core-browser", direction: "forward", text: "Update frame" }] }
    ] },
    { id: "export", label: "Exports and offline playback", beats: [
      { durationMs: 2000, caption: "The core can export static SVG directly. GIF samples SVG over time, rasterizes frames in the browser and encodes them in a Worker. It does not record live page playback.",
        actions: [{ type: "flow", target: "svg-gif", direction: "forward", text: "SVG frames" }] },
      { durationMs: 2000, caption: "Node embeds the document, built player and styles into one offline HTML file without launching Chromium. Offline HTML can optionally embed GIF export assets.",
        actions: [{ type: "flow", target: "browser-node", direction: "forward", text: "Player assets" }] },
      { durationMs: 2000, caption: "For Node GIF export, an isolated page in preinstalled Chromium runs the same browser exporter. Only this Node GIF path uses Chromium in this diagram; task resources are released after export.",
        actions: [{ type: "flow", target: "node-gif", direction: "forward", text: "Isolated page" }] },
      { durationMs: 2000, caption: "One diagram document supports playback, static SVG, GIF and offline HTML. All paths reuse the core; browser and Node tools handle their own runtime responsibilities.",
        actions: [{ type: "highlight", target: "svg" }, { type: "highlight", target: "gif" }, { type: "highlight", target: "node-tools" }] }
    ] },
    { id: "boundary", label: "SDK and showcase workspace", beats: [{ durationMs: 2000,
      caption: "The showcase workspace has the private @flowsvg/showcase author catalog, session rules and Native, React and Vue apps. They consume the public SDK; the SDK does not depend on them.",
      actions: [
        { type: "unhighlight", target: "svg" }, { type: "unhighlight", target: "gif" }, { type: "unhighlight", target: "node-tools" },
        { type: "flow", target: "showcase-adapters", direction: "forward", text: "Framework adapters" },
        { type: "flow", target: "showcase-browser", direction: "forward", text: "Native integration" }
      ]
    }] }
  ]
};

/** One complete architecture document consumed unchanged by native, React and Vue hosts. */
export const projectArchitectureExample: ShowcaseAuthorDefinition = {
  id: "project-architecture",
  category: "architecture",
  name: "FlowSVG: How diagrams run",
  introduction: "Explore FlowSVG itself: one diagram document passes through a platform-independent core, plays through browser adapters, and exports to SVG, GIF or offline HTML. Captions explain optional exports, Node requirements and the private showcase boundary. Arrows represent data or calls.",
  document,
  defaults: { speed: 1, theme: "dark", reducedMotion: false }
};
