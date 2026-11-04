/** Task-state teaching story. Event markers move without overriding the single explicit current state. */
import { measureNodeContent, type Action, type DiagramDocument } from "flowsvg";
import type { ShowcaseAuthorDefinition } from "../model.js";
import { createExampleContent } from "./example-content.js";

const CARD_WIDTH = 220;
const TOP_ROW_Y = 60;
const ROW_GAP = 50;
const BOTTOM_MARGIN = 24;
const STATES = [
  { id: "queued", title: "Queued", detail: "Queued · cancellable", x: 24, row: 0 },
  { id: "running", title: "Running", detail: "Run task · await result", x: 324, row: 0 },
  { id: "retry", title: "Awaiting retry", detail: "Temp error · retry timer", x: 624, row: 0 },
  { id: "completed", title: "Completed", detail: "Terminal · no transitions", x: 324, row: 1 },
  { id: "failed", title: "Failed", detail: "Terminal · no transitions", x: 624, row: 1 },
  { id: "cancelled", title: "Cancelled", detail: "Terminal · no transitions", x: 24, row: 1 }
] as const;
const EVENTS = ["schedule", "temporary-error", "retry-timer", "success", "exhausted", "cancel"];

// Author the versions before the document: measurement does not inspect scenes or playback state.
const CONTENT_STAGES = [
  { target: "queued", task: "A", retries: "Retries 0 / 2" },
  { target: "running", task: "A", retries: "Retries 0 / 2", event: "schedule" },
  { target: "retry", task: "A", retries: "Retries 0 / 2", event: "temporary-error" },
  { target: "running", task: "A", retries: "Retries 1 / 2", event: "retry-timer" },
  { target: "completed", task: "A", retries: "Retries 1 / 2", event: "success" },
  { target: "running", task: "B", retries: "Retries 2 / 2" },
  { target: "failed", task: "B", retries: "Retries 2 / 2", event: "exhausted" },
  { target: "queued", task: "C", retries: "Retries 0 / 2" },
  { target: "cancelled", task: "C", retries: "Retries 0 / 2", event: "cancel" }
];
const STATE_CONTENT = STATES.map((state) => ({
  ...state,
  initial: createExampleContent(state.title, "Possible state", "Event-driven changes", state.detail),
  versions: CONTENT_STAGES.map(({ target, task, retries }) => createExampleContent(state.title,
    state.id === target ? `Current · Task ${task}` : "Possible state",
    state.id === target ? retries : "Event-driven changes", state.detail))
}));
const measurement = measureNodeContent({ kind: "roundedRect", width: CARD_WIDTH,
  content: STATE_CONTENT.flatMap(({ initial, versions }) => [initial, ...versions]) });
if (measurement.diagnostics.length > 0) {
  throw new Error(`job-lifecycle content does not fit its authored width: ${JSON.stringify(measurement.diagnostics)}`);
}
const CARD_HEIGHT = measurement.height;
const BOTTOM_ROW_Y = TOP_ROW_Y + CARD_HEIGHT + ROW_GAP;

// Reuse the measured versions so every seek or alternative task leaves exactly one current state.
function enterState(stageIndex: number): Action[] {
  const stage = CONTENT_STAGES[stageIndex]!;
  return [
    ...STATE_CONTENT.flatMap(({ id, versions }): Action[] => [
      { type: id === stage.target ? "highlight" : "unhighlight", target: id },
      { type: "updateNode", target: id, value: { content: versions[stageIndex]! } }
    ]),
    ...EVENTS.map((id): Action => ({ type: id === stage.event ? "highlight" : "unhighlight", target: id })),
    ...(stage.event ? [{ type: "flow", target: stage.event, direction: "forward", highlightParticipants: false } satisfies Action] : [])
  ];
}

const document: DiagramDocument = {
  version: 1, title: "Background task lifecycle", viewport: { width: 868, height: BOTTOM_ROW_Y + CARD_HEIGHT + BOTTOM_MARGIN },
  nodes: STATE_CONTENT.map(({ id, x, row, initial }) => ({ id, kind: "roundedRect", x,
    y: row === 0 ? TOP_ROW_Y : BOTTOM_ROW_Y, width: CARD_WIDTH, height: CARD_HEIGHT, content: initial })),
  edges: [
    { id: "schedule", from: "queued", to: "running", route: "orthogonal", fromPort: "right", toPort: "left", label: "Schedule" },
    { id: "temporary-error", from: "running", to: "retry", route: "orthogonal", fromPort: "right", toPort: "left", label: "Temp error" },
    // Route retry above the state row so opposing event labels cannot overlap in a short gap.
    { id: "retry-timer", from: "retry", to: "running", route: "orthogonal", fromPort: "top", toPort: "top", label: "Retry timer" },
    { id: "success", from: "running", to: "completed", route: "orthogonal", fromPort: "bottom", toPort: "top", label: "Success" },
    { id: "exhausted", from: "running", to: "failed", route: "orthogonal", fromPort: "bottom", toPort: "top", label: "Retry limit" },
    { id: "cancel", from: "queued", to: "cancelled", route: "orthogonal", fromPort: "bottom", toPort: "top", label: "Cancel" }
  ],
  scenes: [
    { id: "submit", label: "Submit task A", beats: [{ durationMs: 2000, transitionMs: 0,
      caption: "Task A is queued. The blue node and Current tag identify the only active state. Arrow labels identify transition events.",
      actions: enterState(0) }] },
    { id: "execute", label: "Execution and temporary error", beats: [
      { durationMs: 2000, transitionMs: 0, caption: "Task A is scheduled and starts running. This example allows two retries; that limit is a teaching choice, not a recommendation.",
        actions: enterState(1) },
      { durationMs: 2000, transitionMs: 0, caption: "Task A encounters a temporary error and waits for retry. It is no longer in the Running state.",
        actions: enterState(2) }
    ] },
    { id: "recover", label: "Complete after retry", beats: [
      { durationMs: 2000, transitionMs: 0, caption: "Task A starts its first retry when the retry timer fires, returning to Running.",
        actions: enterState(3) },
      { durationMs: 2000, transitionMs: 0, caption: "Task A succeeds and enters the Completed terminal state. Terminal states have no outgoing edges, so this task cannot later become failed or cancelled.",
        actions: enterState(4) }
    ] },
    { id: "exhaust", label: "Independent task B hits its limit", beats: [
      { durationMs: 2000, transitionMs: 0, caption: "Task B is independent, already running its second retry. This is a separate case, not a continuation of task A.",
        actions: enterState(5) },
      { durationMs: 2000, transitionMs: 0, caption: "Task B fails again at the example retry limit and enters the Failed terminal state.",
        actions: enterState(6) }
    ] },
    { id: "cancel", label: "Independent task C is cancelled", beats: [
      { durationMs: 2000, transitionMs: 0, caption: "Task C is independent, currently queued and still cancellable. This case does not demonstrate cancellation during execution.",
        actions: enterState(7) },
      { durationMs: 2000, transitionMs: 0, caption: "Task C is cancelled by the user and enters the Cancelled terminal state. This diagram illustrates allowed transitions without calling a live task system.",
        actions: enterState(8) }
    ] }
  ]
};

/** A fixed-state graph with three explicitly separated task outcomes. */
export const jobLifecycleExample: ShowcaseAuthorDefinition = {
  id: "job-lifecycle", category: "state", name: "Background task lifecycle",
  introduction: "Watch task events and state transitions: A completes after retry, independent B reaches its retry limit, and C is cancelled while queued. Exactly one state is current. Retry counts are teaching choices; no live tasks run.",
  document, defaults: { speed: 1, theme: "dark", reducedMotion: false }
};
