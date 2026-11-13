/** SDK responsibility layers and public consumers; arrows point from consumers to providers. */
import type { Action, DiagramDocument, NodeContent } from "flowsvg";
import type { ShowcaseAuthorDefinition } from "../model.js";
import { measureExampleNode } from "./example-content.js";

const READING_DURATION_MS = 6000;
const CORE_MODULE_IDS = ["core-validation", "core-timeline", "core-geometry", "core-svg"] as const;
const SHOWCASE_APP_IDS = ["native-app", "react-app", "vue-app"] as const;

// Three blocks keep ownership panels compact without shrinking the SDK's default typography.
function createModuleContent(title: string, tag: string, detail: string): NodeContent {
  return { style: { padding: 12, blockGap: 6 }, blocks: [
    { type: "title", text: title },
    { type: "list", items: [{ tags: [{ text: tag, style: { shape: "pill", fontSize: 12 } }] }] },
    { type: "paragraph", text: detail }
  ] };
}

function setHighlights(enabled: boolean, ...targets: string[]): Action[] {
  return targets.map((target) => ({ type: enabled ? "highlight" : "unhighlight", target }));
}

const document: DiagramDocument = {
  version: 1,
  title: "FlowSVG: SDK architecture",
  viewport: { width: 1080, height: 736 },
  nodes: [
    { id: "showcase", kind: "group", x: 24, y: 24, width: 1032, height: 172,
      label: "Showcase apps · private consumers · @flowsvg/showcase catalog + sessions" },
    measureExampleNode({ id: "native-app", kind: "roundedRect", parentId: "showcase", x: 16, y: 40, width: 316, height: 100,
      content: createModuleContent("Native browser", "flowsvg/browser", "Direct player integration") }),
    measureExampleNode({ id: "react-app", kind: "roundedRect", parentId: "showcase", x: 358, y: 40, width: 316, height: 100,
      content: createModuleContent("React app", "flowsvg/react", "React adapter lifecycle") }),
    measureExampleNode({ id: "vue-app", kind: "roundedRect", parentId: "showcase", x: 700, y: 40, width: 316, height: 100,
      content: createModuleContent("Vue app", "flowsvg/vue", "Vue adapter lifecycle") }),
    { id: "sdk", kind: "group", x: 24, y: 236, width: 1032, height: 476,
      label: "FlowSVG SDK · public entries" },
    { id: "browser-layer", kind: "group", parentId: "sdk", x: 20, y: 44, width: 608, height: 190,
      label: "Browser integration · DOM + clock" },
    measureExampleNode({ id: "adapters", kind: "roundedRect", parentId: "browser-layer", x: 16, y: 40, width: 232, height: 100,
      content: createModuleContent("Host adapters", "Lifecycle", "React · Vue\nWeb Component") }),
    measureExampleNode({ id: "browser", kind: "roundedRect", parentId: "browser-layer", x: 324, y: 40, width: 268, height: 100,
      content: createModuleContent("Browser player", "DOM + clock", "Playback · controls\nGIF: optional Worker") }),
    { id: "node-layer", kind: "group", parentId: "sdk", x: 716, y: 44, width: 296, height: 190,
      label: "Node tools · Node 20+" },
    measureExampleNode({ id: "node-tools", kind: "roundedRect", parentId: "node-layer", x: 16, y: 40, width: 264, height: 100,
      content: createModuleContent("Node tools", "flowsvg/node", "HTML: embedded player\nPNG/GIF: Chromium") }),
    { id: "core-layer", kind: "group", parentId: "sdk", x: 20, y: 284, width: 992, height: 172,
      label: "Platform-independent core · no DOM / network / browser clock" },
    // Parallel capability cards describe core responsibilities, not an execution sequence.
    measureExampleNode({ id: "core-validation", kind: "roundedRect", parentId: "core-layer", x: 16, y: 40, width: 224, height: 100,
      content: createModuleContent("Validation", "DiagramDocument", "Schema + references") }),
    measureExampleNode({ id: "core-timeline", kind: "roundedRect", parentId: "core-layer", x: 260, y: 40, width: 224, height: 100,
      content: createModuleContent("Timeline", "Beats + actions", "Scenes → frame state") }),
    measureExampleNode({ id: "core-geometry", kind: "roundedRect", parentId: "core-layer", x: 504, y: 40, width: 224, height: 100,
      content: createModuleContent("Geometry", "Positions + routes", "Layout · routes · hits") }),
    measureExampleNode({ id: "core-svg", kind: "roundedRect", parentId: "core-layer", x: 748, y: 40, width: 224, height: 100,
      content: createModuleContent("SVG rendering", "Static output", "SVG at any time") })
  ],
  // Use group boundaries for collective relationships and module cards for specific dependencies.
  edges: [
    { id: "showcase-sdk", from: "showcase", to: "sdk", label: "Public SDK", route: "orthogonal", fromPort: "bottom", toPort: "top" },
    { id: "adapters-browser", from: "adapters", to: "browser", label: "Wraps", route: "orthogonal", fromPort: "right", toPort: "left" },
    { id: "browser-core", from: "browser", to: "core-layer", route: "orthogonal", fromPort: "bottom", toPort: "top" },
    { id: "node-core", from: "node-tools", to: "core-layer", route: "orthogonal", fromPort: "bottom", toPort: "top" },
    { id: "node-browser", from: "node-layer", to: "browser-layer", label: "PNG/GIF", route: "orthogonal", fromPort: "left", toPort: "right" }
  ],
  // Persistent structure answers the architecture question; emphasis changes topics without implying execution order.
  scenes: [
    { id: "overview", label: "SDK overview", beats: [{ durationMs: READING_DURATION_MS,
      caption: "FlowSVG separates a platform-independent core from browser integration and Node tools. The showcase sits outside the SDK. Arrows point from consumers to providers; groups describe responsibilities.",
      actions: []
    }] },
    { id: "core", label: "Platform-independent core", beats: [{ durationMs: READING_DURATION_MS,
      caption: "The core validates DiagramDocument, evaluates timeline and geometry, and renders static SVG. It has no DOM, network or browser clock. Browser and Node entries reuse this core.",
      actions: setHighlights(true, "core-layer", ...CORE_MODULE_IDS)
    }] },
    { id: "browser", label: "Browser integration", beats: [{ durationMs: READING_DURATION_MS,
      caption: "Adapters wrap the browser player and own their host lifecycle. The player owns playback, controls and SVG DOM updates. Ordinary playback does not load the GIF encoder; optional GIF export samples SVG and encodes in a Worker.",
      actions: [...setHighlights(false, "core-layer", ...CORE_MODULE_IDS), ...setHighlights(true, "browser-layer", "adapters", "browser")]
    }] },
    { id: "node", label: "Node tools", beats: [{ durationMs: READING_DURATION_MS,
      caption: "Node assembles offline HTML from the document, built player and CSS without launching Chromium. PNG/GIF tools use preinstalled Chromium to run the same browser exporter in an isolated page; the PNG/GIF dependency applies only to image export.",
      actions: [...setHighlights(false, "browser-layer", "adapters", "browser"), ...setHighlights(true, "node-layer", "node-tools")]
    }] },
    { id: "boundary", label: "Public SDK consumers", beats: [{ durationMs: READING_DURATION_MS,
      caption: "Native, React and Vue showcase apps consume public SDK entries. The private @flowsvg/showcase package owns author data and presentation sessions; the SDK does not depend on them.",
      actions: [...setHighlights(false, "node-layer", "node-tools"), ...setHighlights(true, "showcase", ...SHOWCASE_APP_IDS)]
    }] },
    { id: "summary", label: "Architecture overview", beats: [{ durationMs: READING_DURATION_MS,
      caption: "The core owns diagram meaning and rendering. Browser integration owns interactive playback; Node tools own offline packaging and automated image export. These are responsibility boundaries, with dependencies always visible.",
      actions: setHighlights(false, "showcase", ...SHOWCASE_APP_IDS)
    }] }
  ]
};

/** One complete architecture document consumed unchanged by native, React and Vue hosts. */
export const projectArchitectureExample: ShowcaseAuthorDefinition = {
  id: "project-architecture",
  category: "architecture",
  name: "FlowSVG: SDK architecture",
  introduction: "Explore FlowSVG's responsibility layers: a platform-independent core, browser integration and Node tools inside the public SDK, with showcase apps outside it. Arrows point from consumers to providers. Playback highlights each layer while keeping the complete architecture visible.",
  document,
  defaults: { speed: 1, theme: "dark", reducedMotion: false }
};
