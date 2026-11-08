import type { DiagramDocument } from "../../src/index.js";

function freezeDocument<T>(value: T): T {
  if (typeof value === "object" && value !== null) {
    Object.values(value).forEach(freezeDocument);
    Object.freeze(value);
  }
  return value;
}

/** SDK-owned composition input covering nested visibility, inherited styles and mixed flow actions. */
export function createInheritedTransitionCompositionDocument(): DiagramDocument {
  return freezeDocument<DiagramDocument>({
    version: 1,
    title: "Inherited transition composition",
    viewport: { width: 760, height: 460 },
    nodes: [
      { id: "frame", kind: "group", x: 40, y: 40, width: 390, height: 300, label: "Pipeline" },
      { id: "lane", kind: "group", parentId: "frame", x: 30, y: 70, width: 300, height: 200, label: "Internal lane" },
      { id: "source", kind: "rect", parentId: "lane", x: 20, y: 55, width: 100, height: 70, label: "Source", visible: false },
      { id: "worker", kind: "roundedRect", parentId: "lane", x: 170, y: 75, width: 100, height: 70, label: "Worker" },
      { id: "sink", kind: "rect", x: 560, y: 140, width: 140, height: 80, label: "Sink" }
    ],
    edges: [
      { id: "inside", from: "source", to: "worker", route: "curved", visible: false, label: "Internal" },
      { id: "outbound", from: "worker", to: "sink", route: "orthogonal", label: "Request" },
      { id: "inbound", from: "sink", to: "lane", route: "curved", label: "Response" }
    ],
    scenes: [
      { id: "composition", label: "Composition", beats: [
        { durationMs: 200, transitionMs: 0, caption: "Inherited base", actions: [
          { type: "updateNode", target: "frame", value: { opacity: 0.8 } },
          { type: "updateNode", target: "lane", value: { opacity: 0.6 } },
          { type: "updateNode", target: "source", value: { opacity: 0.5, content: { blocks: [{ type: "title", text: "Source" }, { type: "paragraph", text: "Inherited payload" }] } } },
          { type: "updateNode", target: "worker", value: { opacity: 0 } },
          { type: "updateEdge", target: "inside", value: { opacity: 0.7 } },
          { type: "updateEdge", target: "outbound", value: { opacity: 0.9 } }
        ] },
        { durationMs: 600, transitionMs: 300, caption: "Reveal and transfer", actions: [
          { type: "show", target: "source" }, { type: "show", target: "inside" },
          { type: "updateNode", target: "worker", value: { opacity: 0.75 } },
          { type: "highlight", target: "source" }, { type: "highlight", target: "inside" },
          { type: "focus", target: "lane" },
          { type: "flow", target: "outbound", direction: "forward", text: "Request" },
          { type: "flow", target: "inbound", direction: "reverse", highlightParticipants: false }
        ] },
        { durationMs: 500, transitionMs: 400, caption: "Hide child", actions: [
          { type: "hide", target: "source" }, { type: "hide", target: "inside" },
          { type: "unhighlight", target: "source" }, { type: "unhighlight", target: "inside" },
          { type: "focus", target: null }
        ] }
      ] },
      { id: "inherit", label: "Inherited visibility", beats: [
        { durationMs: 400, transitionMs: 0, caption: "Hide ancestor", actions: [{ type: "hide", target: "lane" }] },
        { durationMs: 500, transitionMs: 400, caption: "Restore inherited base", actions: [
          { type: "show", target: "lane" }, { type: "show", target: "source" }, { type: "show", target: "inside" },
          { type: "highlight", target: "lane" }, { type: "flow", target: "inside", direction: "reverse" }
        ] },
        { durationMs: 500, transitionMs: 0, caption: "Hide all", actions: [
          { type: "hide", target: "lane" }, { type: "hide", target: "source" }, { type: "hide", target: "inside" },
          { type: "unhighlight", target: "lane" }, { type: "updateNode", target: "source", value: { opacity: 0 } }
        ] }
      ] }
    ]
  });
}
