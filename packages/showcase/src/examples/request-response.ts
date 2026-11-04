/** Formal order request story. Fixed geometry and default SDK paint keep simultaneous transfers readable. */
import type { DiagramDocument } from "flowsvg";
import type { ShowcaseAuthorDefinition } from "../model.js";

const document: DiagramDocument = {
  version: 1,
  title: "Request and response",
  viewport: { width: 800, height: 404 },
  nodes: [
    { id: "client", kind: "roundedRect", x: 24, y: 170, width: 140, height: 64, label: "Client" },
    { id: "gateway", kind: "roundedRect", x: 214, y: 170, width: 150, height: 64, label: "API gateway" },
    { id: "auth", kind: "ellipse", x: 414, y: 24, width: 150, height: 64, label: "Authentication" },
    { id: "inventory", kind: "cylinder", x: 414, y: 316, width: 150, height: 64, label: "Inventory service" },
    { id: "service", kind: "roundedRect", x: 614, y: 170, width: 160, height: 64, label: "Order service" }
  ],
  edges: [
    // Facing sides keep the short request curve outside the gateway after compaction.
    { id: "client-gateway", from: "client", to: "gateway", route: "curved", fromPort: "right", toPort: "left" },
    { id: "gateway-auth", from: "gateway", to: "auth", route: "curved", fromPort: "top", toPort: "left" },
    { id: "inventory-gateway", from: "inventory", to: "gateway", route: "curved", fromPort: "left", toPort: "bottom" },
    // Facing ports let the SDK keep request and response curves in separate lanes.
    { id: "gateway-service", from: "gateway", to: "service", route: "curved", fromPort: "right", toPort: "left" },
    { id: "service-inventory", from: "service", to: "inventory", route: "curved", fromPort: "bottom", toPort: "right", label: "Stock check" },
    { id: "service-gateway", from: "service", to: "gateway", route: "curved", fromPort: "left", toPort: "right" }
  ],
  scenes: [
    {
      id: "request", label: "Request and preflight", beats: [{
        durationMs: 3000,
        caption: "The request reaches the gateway while authentication and inventory preflight run in parallel. All three transfers finish together.",
        actions: [
          { type: "flow", target: "client-gateway", direction: "forward" },
          { type: "flow", target: "gateway-auth", direction: "forward", text: "Token" },
          { type: "flow", target: "inventory-gateway", direction: "reverse", text: "Preflight" }
        ]
      }]
    },
    {
      id: "processing", label: "Create order", beats: [{
        durationMs: 3000,
        caption: "Preflight passes. The gateway submits the request, and the inventory service confirms available stock to the order service.",
        actions: [
          { type: "flow", target: "gateway-service", direction: "forward", text: "Create order" },
          { type: "flow", target: "service-inventory", direction: "reverse" }
        ]
      }]
    },
    {
      id: "response", label: "Return the result", beats: [{
        durationMs: 3000,
        caption: "The order service returns success. The gateway sends the order ID back to the client.",
        actions: [
          { type: "flow", target: "service-gateway", direction: "forward", text: "201 Created" },
          { type: "flow", target: "client-gateway", direction: "reverse", text: "Order ID" }
        ]
      }]
    },
    {
      id: "complete", label: "Request complete", beats: [{
        durationMs: 1000,
        caption: "Request complete. Pause to read messages, jump between beats, change speed or hover over nodes.",
        actions: []
      }]
    }
  ]
};

/** A complete author definition consumed by every showcase host, independent of archived material. */
export const requestResponseExample: ShowcaseAuthorDefinition = {
  id: "request-response",
  category: "workflow",
  name: "Request and response",
  introduction: "The client sends a request; the gateway checks identity and inventory in parallel. The order service creates the order and returns the result through the gateway. Watch parallel transfers, reverse responses and participant highlights.",
  document,
  defaults: { speed: 1, theme: "dark", reducedMotion: false }
};
