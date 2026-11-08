/** Complete shape-catalog story. It keeps every public node kind visible while exercising measurement, routing, groups and playback. */
import { measureNodeLabel, type Action, type DiagramDocument, type DiagramEdge, type NodeKind } from "flowsvg";
import type { ShowcaseAuthorDefinition } from "../model.js";

const GROUP_ID = "shape-catalog";
const PRESET_LABELS = {
  input: ["Input", "Validated input"],
  decision: ["Decision?", "Continue processing?"],
  subprocess: ["Subprocess", "Call verification"],
  document: ["Document", "Generated report"]
} as const;

function measuredNode(id: string, kind: "diamond" | "document" | "predefinedProcess" | "parallelogram",
  x: number, y: number, width: number, labels: readonly string[]) {
  return {
    id,
    kind,
    parentId: GROUP_ID,
    x,
    y,
    width,
    height: measureNodeLabel({ kind, width, label: labels }).height,
    label: labels[0]
  };
}

const nodes = [
  { id: GROUP_ID, kind: "group", x: 24, y: 24, width: 1192, height: 700, label: "Basic shape catalog" },
  { id: "start", kind: "ellipse", parentId: GROUP_ID, x: 42, y: 104, width: 140, height: 64, label: "Start" },
  measuredNode("input", "parallelogram", 232, 100, 190, PRESET_LABELS.input),
  measuredNode("decision", "diamond", 482, 54, 220, PRESET_LABELS.decision),
  { id: "process", kind: "roundedRect", parentId: GROUP_ID, x: 762, y: 100, width: 184, height: 72, label: "Process" },
  measuredNode("subprocess", "predefinedProcess", 1002, 100, 164, PRESET_LABELS.subprocess),
  { id: "record", kind: "rect", parentId: GROUP_ID, x: 252, y: 356, width: 194, height: 72, label: "Record result" },
  measuredNode("document", "document", 520, 340, 226, PRESET_LABELS.document),
  { id: "store", kind: "cylinder", parentId: GROUP_ID, x: 834, y: 350, width: 210, height: 88, label: "Data store" }
] satisfies readonly {
  id: string;
  kind: NodeKind;
  parentId?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
}[];

const edges: DiagramEdge[] = [
  { id: "start-input", from: "start", to: "input", route: "orthogonal", fromPort: "right", toPort: "left" },
  { id: "input-decision", from: "input", to: "decision", route: "orthogonal", fromPort: "right", toPort: "left" },
  { id: "decision-process", from: "decision", to: "process", route: "orthogonal", fromPort: "right", toPort: "left", label: "Yes" },
  { id: "process-subprocess", from: "process", to: "subprocess", route: "orthogonal", fromPort: "right", toPort: "left" },
  { id: "decision-record", from: "decision", to: "record", route: "orthogonal", fromPort: "bottom", toPort: "top", label: "No" },
  { id: "record-document", from: "record", to: "document", route: "orthogonal", fromPort: "right", toPort: "left" },
  { id: "document-store", from: "document", to: "store", route: "orthogonal", fromPort: "right", toPort: "left" },
  { id: "store-subprocess", from: "store", to: "subprocess", route: "orthogonal", fromPort: "top", toPort: "bottom", label: "Read back" }
];

const FLOW_STAGES = [
  ["start-input", "start", "input", "The ellipse starts the flow and the parallelogram accepts input."],
  ["input-decision", "input", "decision", "The input reaches the diamond decision node."],
  ["decision-process", "decision", "process", "The approved branch continues into a rounded process node."],
  ["process-subprocess", "process", "subprocess", "The process calls a predefined subprocess."],
  ["decision-record", "decision", "record", "The alternate branch records a result in a rectangle."],
  ["record-document", "record", "document", "The recorded result becomes a document artifact."],
  ["document-store", "document", "store", "The document is written to a cylinder data store."],
  ["store-subprocess", "store", "subprocess", "The subprocess reads the stored result before completion."]
] as const;

function stageActions(edgeId: string, sourceId: string, targetId: string): Action[] {
  return [
    ...nodes.filter(({ kind }) => kind !== "group").map(({ id }): Action => ({
      type: id === sourceId || id === targetId ? "highlight" : "unhighlight", target: id
    })),
    { type: "flow", target: edgeId, direction: "forward" }
  ];
}

const document: DiagramDocument = {
  version: 1,
  title: "Basic shapes: complete catalog",
  viewport: { width: 1240, height: 748 },
  nodes,
  edges,
  scenes: [{
    id: "catalog",
    label: "Follow every shape",
    beats: [
      {
        durationMs: 1400,
        caption: "This first showcase example contains every public node shape: ellipse, parallelogram, diamond, rounded rectangle, predefined process, rectangle, document and cylinder.",
        actions: nodes.filter(({ kind }) => kind !== "group").map(({ id }): Action => ({ type: "highlight", target: id }))
      },
      ...FLOW_STAGES.map(([edgeId, sourceId, targetId, caption]) => ({
        durationMs: 1800,
        caption,
        actions: stageActions(edgeId, sourceId, targetId)
      })),
      {
        durationMs: 1800,
        transitionMs: 500,
        caption: "The same measured preset labels can change without changing their authored node heights.",
        actions: [
          { type: "updateNode", target: "input", value: { label: PRESET_LABELS.input[1] } },
          { type: "updateNode", target: "decision", value: { label: PRESET_LABELS.decision[1] } },
          { type: "updateNode", target: "subprocess", value: { label: PRESET_LABELS.subprocess[1] } },
          { type: "updateNode", target: "document", value: { label: PRESET_LABELS.document[1] } },
          { type: "highlight", target: "input" },
          { type: "highlight", target: "decision" },
          { type: "highlight", target: "subprocess" },
          { type: "highlight", target: "document" }
        ]
      },
      {
        durationMs: 1200,
        caption: "Shape catalog complete. Pause, seek, change theme or enable reduced motion to inspect the shared SDK behavior.",
        actions: nodes.filter(({ kind }) => kind !== "group").map(({ id }): Action => ({ type: "unhighlight", target: id }))
      }
    ]
  }]
};

/** The first formal story: a compact reference for every public node shape and shared playback behavior. */
export const basicShapesExample: ShowcaseAuthorDefinition = {
  id: "basic-shapes",
  category: "workflow",
  name: "Basic shapes: complete catalog",
  introduction: "Start here to see every public node shape in one executable flow. The story also demonstrates measured preset labels, a group, orthogonal connections, highlights, label replacement and playback controls.",
  document,
  defaults: { speed: 1, theme: "dark", reducedMotion: false }
};
