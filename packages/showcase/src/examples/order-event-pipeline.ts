/** Fixed event samples make deduplication, invalid-record isolation and aggregate counts independently readable. */
import type { DiagramDocument } from "flowsvg";
import type { ShowcaseAuthorDefinition } from "../model.js";
import { createExampleContent, measureExampleNode } from "./example-content.js";

// Reuse these explicit replacements for measurement and scene updates.
const UPDATED_CONTENT = {
  validation: createExampleContent("Validate + dedup", "4 = 2 + 1 + 1",
    "2 valid · 1 dup · 1 invalid", "Drop E1 copy · E3 lacks amount"),
  details: createExampleContent("Order records", "2 valid records", "O101 CNY 120 · O102 CNY 80", "Sources: E1 and E2 · no duplicates"),
  quarantine: createExampleContent("Quarantined records", "1 invalid record", "E3 has no amount", "Keep reason · exclude from metrics"),
  aggregate: createExampleContent("Aggregate", "Demo window: 1 minute", "2 orders · CNY 200", "E1 + E2 · 120 + 80"),
  dashboard: createExampleContent("Dashboard", "Valid order metrics", "2 orders · CNY 200", "CNY · demo window result")
};

const document: DiagramDocument = {
  version: 1, title: "Order events: From ingestion to metrics", viewport: { width: 964, height: 580 },
  nodes: [
    measureExampleNode({ id: "events", kind: "roundedRect", x: 24, y: 24, width: 240, height: 144,
      content: createExampleContent("Order events", "4 raw events", "E1 / E2 / E1 / E3", "Duplicates · missing fields") }),
    measureExampleNode({ id: "queue", kind: "roundedRect", x: 314, y: 24, width: 240, height: 144,
      content: createExampleContent("Event queue", "Buffer and decouple", "eventId + order data", "Demo · no message service") }),
    measureExampleNode({ id: "validation", kind: "roundedRect", x: 604, y: 24, width: 300, height: 144,
      content: createExampleContent("Validate + dedup", "Deduplicate by eventId", "Check order ID and amount", "Keep duplicate events out of records") }, UPDATED_CONTENT.validation),
    measureExampleNode({ id: "details", kind: "roundedRect", x: 604, y: 218, width: 300, height: 144,
      content: createExampleContent("Order records", "Valid records", "Await validated orders", "Accept valid, unique records only") }, UPDATED_CONTENT.details),
    measureExampleNode({ id: "aggregate", kind: "roundedRect", x: 314, y: 218, width: 240, height: 144,
      content: createExampleContent("Aggregate", "Demo window: 1 minute", "Order count + total", "Currency: CNY") }, UPDATED_CONTENT.aggregate),
    measureExampleNode({ id: "dashboard", kind: "roundedRect", x: 24, y: 218, width: 240, height: 144,
      content: createExampleContent("Dashboard", "Window result", "Await aggregate metrics", "Teaching data only") }, UPDATED_CONTENT.dashboard),
    measureExampleNode({ id: "quarantine", kind: "roundedRect", x: 604, y: 412, width: 300, height: 144,
      content: createExampleContent("Quarantined records", "Invalid records", "Await validation errors", "Store separately from valid records") }, UPDATED_CONTENT.quarantine)
  ],
  edges: [
    { id: "collect", from: "events", to: "queue", route: "orthogonal", fromPort: "right", toPort: "left" },
    { id: "consume", from: "queue", to: "validation", route: "orthogonal", fromPort: "right", toPort: "left" },
    { id: "valid-orders", from: "validation", to: "details", route: "orthogonal", fromPort: "bottom", toPort: "top" },
    // The outer lane carries invalid records past the valid-detail card without entering it.
    { id: "invalid-record", from: "validation", to: "quarantine", route: "orthogonal", fromPort: "right", toPort: "right" },
    { id: "aggregate-orders", from: "details", to: "aggregate", route: "orthogonal", fromPort: "left", toPort: "right" },
    { id: "publish-metrics", from: "aggregate", to: "dashboard", route: "orthogonal", fromPort: "left", toPort: "right" }
  ],
  scenes: [
    { id: "collect", label: "Ingest four events", beats: [{ durationMs: 3000,
      caption: "The fixed sample E1/E2/E1/E3 has four events: E1 is order O101 for CNY 120; E2 is O102 for CNY 80. The second E1 is a duplicate; E3 has no amount.",
      actions: [{ type: "flow", target: "collect", direction: "forward", text: "4 events" }] }] },
    { id: "consume", label: "Buffer and consume", beats: [{ durationMs: 3000,
      caption: "The queue buffers events for processing, preserving eventId, order ID and amount. The queue itself does not validate business fields or deduplicate by eventId.",
      actions: [{ type: "flow", target: "consume", direction: "forward", text: "E1 E2 E1 E3" }] }] },
    { id: "validate", label: "Validate + dedup", beats: [{ durationMs: 3000,
      caption: "Deduplicate by eventId and check fields: 2 valid, 1 duplicate and 1 invalid still account for all 4 inputs. Drop duplicate E1; do not write it to order records or quarantine.",
      actions: [{ type: "updateNode", target: "validation", value: { content: UPDATED_CONTENT.validation } }, { type: "highlight", target: "validation" }] }] },
    { id: "split", label: "Split valid and invalid", beats: [{ durationMs: 3000,
      caption: "Two valid records enter order storage: O101 for CNY 120 and O102 for CNY 80. Quarantine E3 because its amount is missing. Exclude both invalid and duplicate inputs from aggregation.",
      actions: [
        { type: "unhighlight", target: "validation" },
        { type: "flow", target: "valid-orders", direction: "forward", text: "E1 + E2" },
        { type: "flow", target: "invalid-record", direction: "forward", text: "E3" },
        { type: "updateNode", target: "details", value: { content: UPDATED_CONTENT.details } },
        { type: "updateNode", target: "quarantine", value: { content: UPDATED_CONTENT.quarantine } }
      ] }] },
    { id: "aggregate", label: "Aggregate a window", beats: [{ durationMs: 3000,
      caption: "Aggregate the two valid records in the same demo one-minute window: 2 orders, with amounts 120 + 80 = CNY 200. The window is a teaching choice.",
      actions: [{ type: "flow", target: "aggregate-orders", direction: "forward", text: "2 records" },
        { type: "updateNode", target: "aggregate", value: { content: UPDATED_CONTENT.aggregate } }] }] },
    { id: "publish", label: "Publish window metrics", beats: [{ durationMs: 3000,
      caption: "The dashboard receives the window summary, not the four raw events: CNY 200 across 2 orders. Duplicate and invalid inputs are excluded.",
      actions: [{ type: "flow", target: "publish-metrics", direction: "forward", text: "2 orders / CNY 200" },
        { type: "updateNode", target: "dashboard", value: { content: UPDATED_CONTENT.dashboard } }] }] },
    { id: "overview", label: "Data shapes and destinations", beats: [{ durationMs: 3000,
      caption: "Overview: 4 raw events become 2 valid records, totaling 2 orders and CNY 200. Drop 1 duplicate and quarantine 1 invalid record. No live data service is accessed.",
      actions: [] }] }
  ]
};

/** One conserved teaching dataset, including its valid, duplicate and invalid paths. */
export const orderEventPipelineExample: ShowcaseAuthorDefinition = {
  id: "order-event-pipeline", category: "data-flow", name: "Order events: From ingestion to metrics",
  introduction: "Follow four fictional order events through a queue, validation, deduplication, valid/invalid routing and window aggregation. Two valid orders total CNY 200. IDs, counts and amounts remain traceable; no live message or data service is used.",
  document, defaults: { speed: 1, theme: "dark", reducedMotion: false }
};
