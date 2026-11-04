/** Visible message rows express time with existing groups and small endpoint nodes; no sequence-specific SDK API is needed. */
import type { DiagramDocument, DiagramEdge, DiagramNode, Scene } from "flowsvg";
import type { ShowcaseAuthorDefinition } from "../model.js";

const PARTICIPANTS = [
  { id: "client", label: "Client · requester", x: 24 },
  { id: "api", label: "API · order service", x: 264 },
  { id: "cache", label: "Cache · optional value", x: 504 },
  { id: "database", label: "Database · source", x: 744 }
] as const;
const MESSAGE_ROW_START = 80;
const MESSAGE_ROW_GAP = 70;
const MESSAGE_DURATION_MS = 2500;
const ENDPOINT_OFFSET = 86;
const ENDPOINT_SIZE = 8;
const MESSAGES = [
  { id: "request", from: "client", to: "api", label: "① GET O101", scene: "Request reaches the API",
    caption: "Read from top to bottom. The client requests order O101; the API uses cache-aside reads. This is one fixed teaching request." },
  { id: "cache-get", from: "api", to: "cache", label: "② GET order:O101", scene: "Read the cache",
    caption: "The API sends GET order:O101 to the cache. The request points right; the next row shows the cache response separately." },
  { id: "cache-miss", from: "cache", to: "api", label: "③ MISS", scene: "Cache returns MISS",
    caption: "The cache returns MISS to the API. A missing cache value does not mean the database record is absent, so the API queries the database next." },
  { id: "database-get", from: "api", to: "database", label: "④ SELECT O101", scene: "Read the database",
    caption: "The API queries order O101 in the database. The arrow crosses the cache lane; the cache does not forward this request." },
  { id: "database-result", from: "database", to: "api", label: "⑤ O101 / CNY 120", scene: "Database returns the record",
    caption: "Assume the database contains the record. It returns O101 for CNY 120 to the API, pointing left, opposite to the SELECT request." },
  { id: "cache-set", from: "api", to: "cache", label: "⑥ SET O101 / CNY 120", scene: "Populate the cache",
    caption: "The API writes the retrieved record to the cache. Assume SET succeeds; its acknowledgement is omitted for brevity. Timeouts, consistency and concurrent misses are outside this example." },
  { id: "response", from: "api", to: "client", label: "⑦ 200 / O101", scene: "Return the result",
    caption: "The API returns O101 for CNY 120 to the client. Seven message rows show a cache miss, database read and cache fill. No live cache or database is called." }
] as const;

// Each message gets its own two anchors, so request and return arrows stay on distinct time rows.
const anchors: DiagramNode[] = MESSAGES.flatMap((message, index) => [message.from, message.to].map((participant, endpoint) => ({
  id: `${message.id}-${endpoint}`, kind: "ellipse", parentId: participant,
  x: ENDPOINT_OFFSET, y: MESSAGE_ROW_START + index * MESSAGE_ROW_GAP, width: ENDPOINT_SIZE, height: ENDPOINT_SIZE
})));
const edges: DiagramEdge[] = MESSAGES.map(({ id, from, to, label }) => {
  const forward = PARTICIPANTS.findIndex((participant) => participant.id === from)
    < PARTICIPANTS.findIndex((participant) => participant.id === to);
  return { id, from: `${id}-0`, to: `${id}-1`, route: "straight", label,
    fromPort: forward ? "right" : "left", toPort: forward ? "left" : "right" };
});
const scenes: Scene[] = MESSAGES.map(({ id, scene, caption }) => ({ id, label: scene, beats: [{
  durationMs: MESSAGE_DURATION_MS, caption,
  actions: [{ type: "flow", target: id, direction: "forward" }]
}] }));

const document: DiagramDocument = {
  version: 1, title: "Cache miss: Read and populate", viewport: { width: 948, height: 572 },
  nodes: [...PARTICIPANTS.map(({ id, label, x }): DiagramNode => ({ id, kind: "group", label,
    x, y: 24, width: 180, height: 524 })), ...anchors],
  edges,
  scenes: [...scenes, { id: "overview", label: "Complete sequence", beats: [{ durationMs: 1500,
    caption: "Sequence: request, cache read, MISS, database read, record, cache fill, client response. Participants stay fixed. Vertical spacing indicates order, not elapsed time.",
    actions: [] }] }]
};

/** One cache-aside read, with all seven messages visible at stable increasing time positions. */
export const cacheAsideSequenceExample: ShowcaseAuthorDefinition = {
  id: "cache-aside-sequence", category: "sequence", name: "Cache miss: Read and populate",
  introduction: "Follow seven message rows between the client, API, cache and database: request, miss, record and cache fill. Lanes identify participants; vertical position indicates message order. Straight arrows and default styling keep this teaching sequence simple.",
  document, defaults: { speed: 1, theme: "dark", reducedMotion: false }
};
