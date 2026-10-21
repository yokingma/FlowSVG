/** SDK-owned parallel transfers with curved ports, reverse directions and beat-local cleanup. */
import type { DiagramDocument } from "../../src/index.js";

export const documentModel: DiagramDocument = {
  version: 1, viewport: { width: 1280, height: 640 }, theme: "light",
  nodes: [
    { id: "a", kind: "roundedRect", x: 60, y: 280, width: 160, height: 80, label: "A" },
    { id: "b", kind: "roundedRect", x: 360, y: 280, width: 170, height: 80, label: "B" },
    { id: "c", kind: "ellipse", x: 650, y: 70, width: 170, height: 80, label: "C" },
    { id: "d", kind: "cylinder", x: 650, y: 470, width: 170, height: 80, label: "D" },
    { id: "e", kind: "roundedRect", x: 1000, y: 280, width: 180, height: 80, label: "E" }
  ], edges: [
    { id: "ab", from: "a", to: "b", route: "curved", fromPort: "right", toPort: "top" },
    { id: "bc", from: "b", to: "c", route: "curved", fromPort: "top", toPort: "left" },
    { id: "db", from: "d", to: "b", route: "curved", fromPort: "left", toPort: "bottom" },
    { id: "be", from: "b", to: "e", route: "curved", fromPort: "right", toPort: "top" },
    { id: "ed", from: "e", to: "d", route: "curved", fromPort: "bottom", toPort: "right" },
    { id: "eb", from: "e", to: "b", route: "curved", fromPort: "left", toPort: "right" }
  ], scenes: [
    { id: "parallel", label: "parallel", beats: [{ durationMs: 2400, actions: [
      { type: "flow", target: "ab", direction: "forward" },
      { type: "flow", target: "bc", direction: "forward", text: "Signal" },
      { type: "flow", target: "db", direction: "reverse", text: "Probe" }
    ] }] },
    { id: "next", label: "next", beats: [{ durationMs: 2400, actions: [
      { type: "flow", target: "be", direction: "forward", text: "Next" },
      { type: "flow", target: "ed", direction: "reverse" }
    ] }] },
    { id: "return", label: "return", beats: [{ durationMs: 2400, actions: [
      { type: "flow", target: "eb", direction: "forward", text: "Accepted" },
      { type: "flow", target: "ab", direction: "reverse", text: "Result" }
    ] }] },
    { id: "idle", label: "idle", beats: [{ durationMs: 1000, actions: [] }] }
  ]
};
