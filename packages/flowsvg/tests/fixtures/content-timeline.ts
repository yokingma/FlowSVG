/** SDK-owned boundary, inherited display modes, nested geometry and parallel route input. */
import type { Action, DiagramDocument, NodeContent } from "../../src/index.js";
import { listContentDocument } from "./list-content.js";
const REPLACEMENT: NodeContent = { blocks: [
  { type: "title", text: "Replacement" },
  { type: "list", marker: "none", items: [
    { tags: [{ text: "verified" }], body: "Replacement record", auxiliary: "2030-01-02" }
  ] }
] };
export const contentStoryDocument: DiagramDocument = {
  ...listContentDocument, viewport: { width: 1100, height: 740 },
  nodes: [
    { id: "system", kind: "group", x: 24, y: 24, width: 928, height: 560, label: "Outer" },
    { id: "details", kind: "group", parentId: "system", x: 16, y: 32, width: 880, height: 500, label: "Inner" },
    ...listContentDocument.nodes.map((node) => ({ ...node, parentId: "details", y: 36 }))
  ], edges: [
    { id: "facts-service", from: "facts", to: "service", route: "straight", fromPort: "right", toPort: "left" },
    { id: "service-steps", from: "service", to: "steps", route: "orthogonal", fromPort: "right", toPort: "left" },
    { id: "steps-facts", from: "steps", to: "facts", route: "curved", fromPort: "bottom", toPort: "bottom" }
  ], scenes: [
    { id: "content", label: "content", beats: [
      { durationMs: 1000, caption: "Inherited caption", actions: [] },
      { durationMs: 1000, transitionMs: 1000, actions: [{ type: "updateNode", target: "facts", value: { content: REPLACEMENT } }, { type: "highlight", target: "facts" }] },
      { durationMs: 1000, transitionMs: 1000, actions: [
        { type: "focus", target: "system" },
        { type: "updateNode", target: "system", value: { x: 40, y: 32 } },
        { type: "updateNode", target: "details", value: { x: 24, y: 40 } },
        { type: "updateNode", target: "facts", value: { width: 260 } },
        ...["facts-service", "service-steps", "steps-facts"].map<Action>((target) => ({ type: "flow", target, direction: "forward" }))
      ] }
    ] },
    { id: "modes", label: "modes", beats: [
      { durationMs: 1000, actions: [{ type: "updateNode", target: "facts", value: { label: "Plain replacement" } }] },
      { durationMs: 1000, actions: [{ type: "updateNode", target: "facts", value: { content: REPLACEMENT } }] },
      { durationMs: 1000, actions: [{ type: "updateNode", target: "facts", value: { content: null } }] }
    ] },
    { id: "inherited", label: "inherited", beats: [{ durationMs: 1000, actions: [] }] }
  ]
};
