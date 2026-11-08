/** Run with Node 20+ after installing flowsvg; writes the SDK-owned mixed-flow snapshot. */
import { writeFile } from "node:fs/promises";
import { measureNodeLabel } from "flowsvg";

const LABELS = {
  decision: ["Policy passed?", "Is the request approved?"],
  input: ["Read request", "Read validated request"],
  report: ["Approval report", "Signed approval report"],
  call: ["Verify identity", "Call identity verification"]
};
const measured = (id, kind, x, y, width) => ({ id, kind, parentId: "group", x, y, width,
  height: measureNodeLabel({ kind, width, label: LABELS[id] }).height, label: LABELS[id][0] });
const document = {
  version: 1, title: "Request approval: shared preset shapes", viewport: { width: 1000, height: 620 },
  nodes: [
    { id: "group", kind: "group", x: 20, y: 20, width: 940, height: 560, label: "Approval workflow" },
    measured("input", "parallelogram", 30, 70, 220),
    measured("decision", "diamond", 330, 30, 260),
    measured("call", "predefinedProcess", 660, 70, 240),
    measured("report", "document", 660, 330, 240),
    { id: "review", kind: "rect", parentId: "group", x: 350, y: 330, width: 220, height: 72, label: "Manual review" },
    { id: "overflow", kind: "document", parentId: "group", x: 30, y: 330, width: 220, height: 56,
      label: "", visible: false }
  ],
  edges: [
    { id: "read", from: "input", to: "decision", route: "straight", fromPort: "right", toPort: "left" },
    { id: "approve", from: "decision", to: "call", route: "orthogonal", fromPort: "right", toPort: "left", label: "Approved" },
    { id: "review-edge", from: "decision", to: "review", route: "curved", fromPort: "bottom", toPort: "top", label: "Review" },
    { id: "write", from: "call", to: "report", route: "straight", fromPort: "bottom", toPort: "top" }
  ],
  scenes: [{ id: "approval", label: "Approval", beats: [
    { durationMs: 1000, caption: "Read input, decide, call a subprocess, and produce a report.", actions: [] },
    { durationMs: 1000, transitionMs: 1000, caption: "Label versions share measured heights as the workflow moves.", actions: [
      ...Object.entries(LABELS).map(([target, labels]) => ({ type: "updateNode", target, value: { label: labels[1] } })),
      { type: "updateNode", target: "decision", value: { width: 300 } },
      { type: "updateNode", target: "group", value: { x: 40, y: 32 } },
      { type: "highlight", target: "decision" }
    ] },
    { durationMs: 1000, transitionMs: 300, caption: "An undersized document clips its label and reports overflow.", actions: [
      { type: "show", target: "overflow" },
      { type: "updateNode", target: "overflow", value: { label: "This explanation is deliberately longer than the safe area can display.\nKeep the complete source label." } }, { type: "unhighlight", target: "decision" },
      { type: "updateNode", target: "report", value: { stroke: "#059669" } }
    ] },
    { durationMs: 1000, caption: "The complete source text remains available in the document.", actions: [] }
  ] }]
};
await writeFile(new URL("./mixed-flow.json", import.meta.url), `${JSON.stringify(document, null, 2)}\n`);
