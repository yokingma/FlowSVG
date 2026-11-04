/** Deployment locations and instance roles. Replication and health checks are separate from the request path. */
import type { DiagramDocument } from "flowsvg";
import type { ShowcaseAuthorDefinition } from "../model.js";
import { createExampleContent, measureExampleNode } from "./example-content.js";

// Reuse these explicit replacements for measurement and scene updates.
const UPDATED_CONTENT = {
  "app-a": createExampleContent("App replica A", "Unhealthy", "Stop new requests", "Scripted · not live")
};

const document: DiagramDocument = {
  version: 1, title: "Web service: Two-replica deployment", viewport: { width: 922, height: 756 },
  nodes: [
    { id: "public-network", kind: "group", x: 64, y: 24, width: 834, height: 200, label: "Public entry · HTTPS" },
    measureExampleNode({ id: "browser", kind: "roundedRect", parentId: "public-network", x: 556, y: 44, width: 220, height: 144,
      content: createExampleContent("Browser", "Client", "Request an order", "GET /orders/O101") }),
    measureExampleNode({ id: "entry", kind: "roundedRect", parentId: "public-network", x: 286, y: 44, width: 220, height: 144,
      content: createExampleContent("Public entry", "HTTPS endpoint", "One public address", "Entry layer · not an app") }),
    measureExampleNode({ id: "load-balancer", kind: "roundedRect", parentId: "public-network", x: 16, y: 44, width: 220, height: 144,
      content: createExampleContent("Load balancer", "Choose healthy instances", "Route to a replica", "Run ongoing health checks") }),
    { id: "private-network", kind: "group", x: 64, y: 274, width: 834, height: 458, label: "Private network · app and data services" },
    { id: "applications", kind: "group", parentId: "private-network", x: 16, y: 44, width: 250, height: 398, label: "Application tier · two replicas" },
    measureExampleNode({ id: "app-a", kind: "roundedRect", parentId: "applications", x: 16, y: 44, width: 218, height: 144,
      content: createExampleContent("App replica A", "Healthy", "Handle order queries", "A · same application") }, UPDATED_CONTENT["app-a"]),
    measureExampleNode({ id: "app-b", kind: "roundedRect", parentId: "applications", x: 16, y: 238, width: 218, height: 144,
      content: createExampleContent("App replica B", "Healthy", "Same app, second copy", "B · no zone guarantee") }),
    { id: "data", kind: "group", parentId: "private-network", x: 316, y: 44, width: 502, height: 398, label: "Data tier · cache and database" },
    measureExampleNode({ id: "cache", kind: "roundedRect", parentId: "data", x: 16, y: 238, width: 200, height: 144,
      content: createExampleContent("Cache", "May be empty", "Cache order results", "Assume a cache miss") }),
    measureExampleNode({ id: "primary", kind: "roundedRect", parentId: "data", x: 266, y: 44, width: 220, height: 144,
      content: createExampleContent("DB primary", "Read and write", "Store order records", "Read O101 for this query") }),
    measureExampleNode({ id: "replica", kind: "roundedRect", parentId: "data", x: 266, y: 238, width: 220, height: 144,
      content: createExampleContent("DB read replica", "Read only", "Copy primary data", "Reject application writes") })
  ],
  edges: [
    { id: "https", from: "browser", to: "entry", route: "orthogonal", fromPort: "left", toPort: "right" },
    { id: "entry-route", from: "entry", to: "load-balancer", route: "orthogonal", fromPort: "left", toPort: "right" },
    { id: "route-a", from: "load-balancer", to: "app-a", route: "orthogonal", fromPort: "left", toPort: "left" },
    // The left margin reserves separate health and failover paths outside both instance cards.
    { id: "route-b", from: "load-balancer", to: "app-b", route: "orthogonal", fromPort: "left", toPort: "left" },
    { id: "health-a", from: "load-balancer", to: "app-a", route: "orthogonal", fromPort: "left", toPort: "left", label: "Health check" },
    // Cache occupies the lower data row; the database path stays above it and below group titles.
    { id: "cache-read", from: "app-a", to: "cache", route: "orthogonal", fromPort: "right", toPort: "top" },
    { id: "database-read", from: "app-a", to: "primary", route: "orthogonal", fromPort: "right", toPort: "left" },
    { id: "replication", from: "primary", to: "replica", route: "orthogonal", fromPort: "bottom", toPort: "top", label: "Replication" }
  ],
  scenes: [
    { id: "entry", label: "Public request entry", beats: [
      { durationMs: 2000, caption: "The browser requests O101 over HTTPS through one public entry. Groups represent runtime locations and network boundaries, not task steps.",
        actions: [{ type: "flow", target: "https", direction: "forward", text: "HTTPS" }] },
      { durationMs: 2000, caption: "The public entry forwards to the load balancer. Both app replicas run the same application; they are not distinct business services. No availability-zone placement is promised.",
        actions: [{ type: "flow", target: "entry-route", direction: "forward", text: "Request" }] }
    ] },
    { id: "application", label: "Request reaches replica A", beats: [{ durationMs: 2000,
      caption: "The load balancer selects healthy app replica A for this request. The private network contains application and data tiers; the browser cannot access the database directly.",
      actions: [{ type: "flow", target: "route-a", direction: "forward", text: "A" }] }] },
    { id: "query", label: "Cache and database reads", beats: [
      { durationMs: 2000, caption: "App replica A checks the cache first. This teaching sample assumes a miss, so the app then reads the database primary.",
        actions: [{ type: "flow", target: "cache-read", direction: "forward", text: "Cache read" }] },
      { durationMs: 2000, caption: "App replica A queries O101 from the primary. This read does not use the read replica, and the application does not write to that replica.",
        actions: [{ type: "flow", target: "database-read", direction: "forward", text: "Read O101" }] },
      { durationMs: 2000, caption: "The primary returns O101. Arrows distinguish query and response directions. Connections indicate reachability, not actual latency.",
        actions: [{ type: "flow", target: "database-read", direction: "reverse", text: "Order record" }] }
    ] },
    { id: "response", label: "Return through the entry", beats: [{ durationMs: 2000,
      caption: "Replica A finishes the query. The response travels through the load balancer and public entry to the browser. Three simultaneous return transfers illustrate the path.",
      actions: ["route-a", "entry-route", "https"].map((target) => ({ type: "flow", target, direction: "reverse", text: "Response" })) }] },
    { id: "replication", label: "Independent database replication", beats: [{ durationMs: 2000,
      caption: "An independent background relationship copies existing writes from the primary to its read replica. The preceding read did not trigger these writes. This does not promise synchronous acknowledgement or automatic database failover.",
      actions: [{ type: "flow", target: "replication", direction: "forward", text: "Existing writes" }] }] },
    { id: "health", label: "Health status changes", beats: [{ durationMs: 2000,
      caption: "A scripted health check marks replica A unhealthy. This is a fixed teaching action, not live monitoring; the completed query is unaffected by this later event.",
      actions: [{ type: "flow", target: "health-a", direction: "forward", text: "Failed" },
        { type: "updateNode", target: "app-a", value: { content: UPDATED_CONTENT["app-a"] } }] }] },
    { id: "reroute", label: "Route later requests to B", beats: [{ durationMs: 2000,
      caption: "Later requests go to healthy replica B instead of unhealthy A. This illustrates app traffic routing, not database failover, autoscaling or cross-region disaster recovery.",
      actions: [{ type: "flow", target: "route-b", direction: "forward", text: "B" }] }] }
  ]
};

/** A topology with real group boundaries and explicit limits on the availability story. */
export const webServiceDeploymentExample: ShowcaseAuthorDefinition = {
  id: "web-service-deployment", category: "deployment", name: "Web service: Two-replica deployment",
  introduction: "Explore the public entry, two private app replicas and the data tier. Queries use the load balancer, cache and primary; replication and health checks are separate. After A becomes unhealthy, later requests go to B. No live infrastructure is used.",
  document, defaults: { speed: 1, theme: "dark", reducedMotion: false }
};
