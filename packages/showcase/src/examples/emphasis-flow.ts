/** A shared document palette makes three independent flow-paint policies comparable across hosts and exports. */
import type { Action, DiagramDocument, DiagramNode } from "flowsvg";
import type { ShowcaseAuthorDefinition } from "../model.js";

const ROW_HEIGHT = 140;
const CARD_WIDTH = 228;
const CARD_HEIGHT = 92;
const CARD_PADDING = 12;
const VIEWPORT_WIDTH = 920;
const VIEWPORT_HEIGHT = 420;
const OUTER_MARGIN = 24;
const READING_DURATION_MS = 4000;
const RELATIONSHIP_STROKE = "#a855f7";
const ROWS = [
  { id: "automatic", label: "Automatic highlights", highlightEdge: true, highlightParticipants: true },
  { id: "preserve-edge", label: "Keep edge color", highlightEdge: false, highlightParticipants: true },
  { id: "marker-only", label: "Marker only", highlightEdge: false, highlightParticipants: false }
] as const;

function createRowNode(row: typeof ROWS[number], index: number, side: "sender" | "receiver"): DiagramNode {
  return {
    id: `${row.id}-${side}`, kind: "roundedRect",
    x: side === "sender" ? OUTER_MARGIN : VIEWPORT_WIDTH - OUTER_MARGIN - CARD_WIDTH,
    y: OUTER_MARGIN + index * ROW_HEIGHT, width: CARD_WIDTH, height: CARD_HEIGHT,
    content: { style: { padding: CARD_PADDING, blockGap: 6 }, blocks: [
      { type: "title", text: side === "sender" ? "Sender" : "Receiver" },
      { type: "paragraph", text: side === "sender" ? row.label
        : row.highlightParticipants ? "Endpoint highlights" : "No endpoint highlight" }
    ] }
  };
}

function createTransfer(row: typeof ROWS[number]): Action {
  return { type: "flow", target: row.id, direction: "forward", text: "Payload",
    highlightEdge: row.highlightEdge, highlightParticipants: row.highlightParticipants };
}

const document: DiagramDocument = {
  version: 1, title: "Emphasis colors and flow highlighting",
  viewport: { width: VIEWPORT_WIDTH, height: VIEWPORT_HEIGHT },
  emphasis: { fill: "#ccfbf1", stroke: "#0f766e", markerText: "#ffffff" },
  nodes: ROWS.flatMap((row, index) => [createRowNode(row, index, "sender"), createRowNode(row, index, "receiver")]),
  edges: ROWS.map(({ id }) => ({ id, from: `${id}-sender`, to: `${id}-receiver`,
    route: "orthogonal", fromPort: "right", toPort: "left", label: "Data link",
    style: { stroke: RELATIONSHIP_STROKE } })),
  scenes: [
    { id: "palette", label: "Document palette", beats: [{ durationMs: READING_DURATION_MS,
      caption: "This document stores mint node fills, teal highlights and white marker text. Purple links show their ordinary relationship color. Play to compare three highlight policies.",
      actions: [] }] },
    { id: "automatic", label: "Automatic highlights", beats: [{ durationMs: READING_DURATION_MS,
      caption: "Automatic highlights: the link and participating nodes use the document's teal and mint emphasis colors. The teal Payload marker has white text.",
      actions: [createTransfer(ROWS[0])] }] },
    { id: "preserve-edge", label: "Keep edge color", beats: [{ durationMs: READING_DURATION_MS,
      caption: "Keep edge color: the link and its label stay purple while the Payload marker moves. Participating nodes still receive teal and mint highlights.",
      actions: [createTransfer(ROWS[1])] }] },
    { id: "marker-only", label: "Marker only", beats: [{ durationMs: READING_DURATION_MS,
      caption: "Marker only: the link stays purple and both nodes keep their ordinary appearance. Only the teal Payload marker moves. Reduced motion hides that marker.",
      actions: [createTransfer(ROWS[2])] }] },
    { id: "compare", label: "Compare all three", beats: [{ durationMs: READING_DURATION_MS,
      caption: "Compare all three: identical Payload transfers use different paint policies. Teal marks emphasis; purple preserves the relationship color. Change theme or reduce motion to inspect the result.",
      actions: ROWS.map(createTransfer) }] },
    { id: "complete", label: "Palette travels with JSON", beats: [{ durationMs: READING_DURATION_MS,
      caption: "The palette travels with downloaded JSON and exports. Edge and endpoint highlights are independent. With reduced motion, the marker-only row has no automatic visible cue.",
      actions: [] }] }
  ]
};

/** One portable palette and three flow policies, selected after the order data-flow story. */
export const emphasisFlowExample: ShowcaseAuthorDefinition = {
  id: "emphasis-flow", category: "data-flow", name: "Emphasis colors and flow highlighting",
  introduction: "Compare three sender-to-receiver transfers: automatic highlights, preserved relationship colors, and marker-only motion. A document palette supplies mint fills, teal highlights and white marker text across themes and exports.",
  document, defaults: { speed: 1, theme: "dark", reducedMotion: false }
};
