/** SDK-owned combination input. Each caller receives a fresh, deeply frozen document. */
import type { DiagramDocument } from "../../src/index.js";

function freezeDocument<T>(value: T): T {
  if (typeof value === "object" && value !== null) {
    Object.values(value).forEach(freezeDocument);
    Object.freeze(value);
  }
  return value;
}

/** Own visibility, explicit highlights and base updates; later checks can derive documents with spreads. */
export function createOwnTransitionDocument(): DiagramDocument {
  return freezeDocument<DiagramDocument>({
    version: 1,
    title: "Own transition contract",
    viewport: { width: 560, height: 240 },
    nodes: [
      { id: "source", kind: "rect", x: 30, y: 70, width: 180, height: 100, visible: false,
        label: "Original label", style: { fill: "#000", stroke: "#000" } },
      { id: "target", kind: "rect", x: 350, y: 80, width: 150, height: 80, label: "Original target" }
    ],
    edges: [{ id: "link", from: "source", to: "target", visible: false, label: "Original link", style: { stroke: "#000" } }],
    scenes: [{ id: "own", label: "Own transitions", beats: [
      { durationMs: 100, transitionMs: 0, caption: "Store base opacity", actions: [
        { type: "updateNode", target: "source", value: { opacity: 0.4 } },
        { type: "updateEdge", target: "link", value: { opacity: 0.6 } }
      ] },
      { durationMs: 600, transitionMs: 400, caption: "Reveal and highlight", actions: [
        { type: "show", target: "source" }, { type: "show", target: "link" },
        { type: "highlight", target: "source" }, { type: "highlight", target: "link" },
        { type: "updateNode", target: "source", value: { fill: "#204060", stroke: "#406080", opacity: 0.4,
          content: { blocks: [{ type: "title", text: "Replacement" },
            { type: "paragraph", text: "Fixed content remains clipped inside the authored node without a text transition." }] } } },
        { type: "updateNode", target: "target", value: { label: "Updated target" } },
        { type: "updateEdge", target: "link", value: { stroke: "#804020", opacity: 0.6, label: "Updated link" } }
      ] },
      { durationMs: 600, caption: "Restore latest base", actions: [
        { type: "show", target: "source" }, { type: "show", target: "link" },
        { type: "unhighlight", target: "source" }, { type: "unhighlight", target: "link" },
        { type: "updateNode", target: "source", value: { fill: "#00aa44", stroke: "#aa4400", opacity: 0.8 } },
        { type: "updateEdge", target: "link", value: { stroke: "#8844aa", opacity: 0.7 } }
      ] }
    ] }, { id: "inherit", label: "Inherited state", beats: [
      { durationMs: 400, transitionMs: 0, caption: "Hide immediately", actions: [
        { type: "hide", target: "source" }, { type: "hide", target: "link" },
        { type: "unhighlight", target: "source" }, { type: "unhighlight", target: "link" }
      ] },
      { durationMs: 500, transitionMs: 400, caption: "Reveal inherited base", actions: [
        { type: "show", target: "source" }, { type: "show", target: "link" },
        { type: "highlight", target: "source" }, { type: "highlight", target: "link" }
      ] },
      { durationMs: 500, transitionMs: 400, caption: "Hide and remove highlight", actions: [
        { type: "hide", target: "source" }, { type: "hide", target: "link" },
        { type: "unhighlight", target: "source" }, { type: "unhighlight", target: "link" },
        { type: "updateNode", target: "source", value: { opacity: 0 } }
      ] }
    ] }]
  });
}
