/** Opt-in author input for mechanism acceptance; this is not the formal showcase catalog. */
import type { DiagramDocument } from "flowsvg";
import type { CatalogSource } from "./model.js";

const motionDocument: DiagramDocument = {
  version: 1,
  title: "Signal in motion",
  viewport: { width: 640, height: 280 },
  nodes: [
    { id: "source", kind: "roundedRect", x: 60, y: 90, width: 160, height: 90, label: "Source" },
    { id: "destination", kind: "roundedRect", x: 420, y: 90, width: 160, height: 90, label: "Destination" }
  ],
  edges: [{ id: "signal", from: "source", to: "destination", route: "straight" }],
  scenes: [
    { id: "send", label: "Send", beats: [{ durationMs: 1600, caption: "Send the signal.", actions: [{ type: "flow", target: "signal", direction: "forward" }] }] },
    { id: "finish", label: "Finish", beats: [{ durationMs: 800, caption: "The signal has arrived.", actions: [] }] }
  ]
};

// A variant is a complete document before generation; JSON consumers never execute this composition.
const stillDocument: DiagramDocument = { ...motionDocument, title: "Signal at rest", scenes: [] };

export const catalogSource: CatalogSource = {
  definitions: [
    { id: "signal-motion", name: "Signal in motion", category: "data-flow", introduction: "An acceptance diagram with two scenes and one directed transfer.", document: motionDocument, defaults: { speed: 1.5, theme: "dark", reducedMotion: false } },
    { id: "signal-still", name: "Signal at rest", category: "data-flow", introduction: "A complete static variant for zero-duration and JSON acceptance.", document: stillDocument, defaults: { speed: 0.5, theme: "light", reducedMotion: true } }
  ],
  order: ["signal-still", "signal-motion"],
  defaultId: "signal-motion"
};
