<p align="center">
  <img src="./docs/images/flowsvg-wordmark.gif" alt="FlowSVG" width="280">
</p>

<p align="center">Declarative SVG diagrams with timeline playback and SVG/GIF export.</p>

<p align="center">English | <a href="https://cdn.jsdelivr.net/npm/flowsvg@0.2.0/README.zh-CN.md">简体中文</a></p>

<p align="center">
  <a href="#define-a-diagram">Quick&nbsp;start</a> ·
  <a href="#typical-example-background-task-lifecycle">Example</a> ·
  <a href="#control-playback">Playback&nbsp;API</a> ·
  <a href="#core-api--flowsvg">Core&nbsp;API</a> ·
  <a href="#document-and-actions">Document&nbsp;model</a> ·
  <a href="#export-api">Export&nbsp;API</a>
</p>

Define the data once and use it in native browser, Vue, React, or Web Component integrations.

```sh
npm install flowsvg
```

## Typical example: background task lifecycle

Task A retries and completes, task B exhausts its retries, and task C is cancelled before execution. These are three independent cases. Structured cards and pill tags display the current task and retry count; rounded orthogonal edges carry transition events.

![Background task lifecycle: retry, completion, failure and cancellation](./docs/images/job-lifecycle.gif)

The full document ships as `node_modules/flowsvg/examples/job-lifecycle.json`, with Chinese labels and captions. Use its contents as the `diagram` document in the integrations below. On Node 20+, generate an offline player with playback controls and GIF download:

```sh
npx flowsvg node_modules/flowsvg/examples/job-lifecycle.json --format html --output job-lifecycle.html --gif-export
```

Open `job-lifecycle.html` in a browser. HTML generation needs no Chromium installation. The example sets `flow.highlightParticipants: false` and explicitly highlights one state at a time, so moving event markers do not highlight both states. Retry limits are teaching data.

## Define a diagram

```ts
// diagram.ts
import type { DiagramDocument } from "flowsvg";

export const diagram: DiagramDocument = {
  version: 1,
  viewport: { width: 640, height: 240 },
  nodes: [
    { id: "client", kind: "roundedRect", x: 40, y: 90, width: 140, height: 64, label: "Client" },
    { id: "service", kind: "roundedRect", x: 400, y: 90, width: 180, height: 64, label: "Service" }
  ],
  edges: [{ id: "request", from: "client", to: "service", route: "orthogonal" }],
  scenes: [{
    id: "request-response",
    label: "Request and response",
    beats: [
      { durationMs: 1000, caption: "Send request", actions: [
        { type: "flow", target: "request", direction: "forward", text: "Request" }
      ] },
      { durationMs: 1000, caption: "Return response", actions: [
        { type: "flow", target: "request", direction: "reverse" }
      ] }
    ]
  }]
};
```

Nodes use explicit positions and dimensions. Routes are `straight`, `orthogonal` (rounded bends), or `curved`. Flow text produces a capsule; omitting text produces a moving dot.

## Play

```html
<div id="diagram"></div>
```

```ts
import { createPlayer } from "flowsvg/browser";
import "flowsvg/styles.css";
import { diagram } from "./diagram.js";

const player = createPlayer(document.querySelector<HTMLElement>("#diagram")!, diagram, {
  theme: "light",
  loop: true,
  gifExport: true
});

player.play();
// On disposal: player.destroy();
```

Players start paused, with playback controls enabled. Loop and GIF downloads default off. Import the CSS once. Call `destroy()` when disposing of a native player; framework components handle cleanup.

### Vue

```vue
<script setup lang="ts">
import { FlowPlayer } from "flowsvg/vue";
import "flowsvg/styles.css";
import { diagram } from "./diagram.js";
</script>

<template>
  <FlowPlayer :document="diagram" loop gif-export />
</template>
```

### React

```tsx
import { FlowPlayer } from "flowsvg/react";
import "flowsvg/styles.css";
import { diagram } from "./diagram.js";

export function Diagram() {
  return <FlowPlayer document={diagram} loop gifExport />;
}
```

## Control playback

`createPlayer(host: HTMLElement, document: DiagramDocument, options?: PlayerOptions): FlowPlayer` mounts into the host, replacing its children. Invalid initial documents throw `DiagramValidationError`.

| Method / property | Behavior |
| --- | --- |
| `play(): void` / `pause(): void` | Resume / pause at the current position. At the end, `play()` restarts only when Loop is enabled; static diagrams cannot play. |
| `seek(timeMs: number): void` | Clamp to the timeline; retain playback except at the end. Non-finite values become zero. |
| `step(direction: 1 \| -1): void` | Pause and move to a beat boundary. Backward from inside a beat goes to that beat's start. |
| `setSpeed(speed: number): void` | Set a finite positive multiplier; ignore invalid values. Default `1`. |
| `setLoop(loop: boolean): void` | Change whole-timeline looping without changing position or playback. |
| `load(document: DiagramDocument): void` | Pause at zero on success; emit `error` and retain the old document/state on failure. |
| `getState(): PlayerState` | Read `{ timeMs, totalDuration, playing, loop, speed, frame }`. Times are milliseconds. |
| `destroy(): void` | Release DOM, listeners and animation resources. Safe to repeat. Not exposed by Vue/React refs. |
| `element: HTMLElement` | Readonly host and event target. Not exposed by Vue/React refs. |

Vue/React refs expose the eight playback/state methods above. Replace the `document` object to reload a component. Changes to `theme`, `controls`, `gifExport`, `reducedMotion`, or `hoverFill` recreate the player paused at zero.

### Options and component props

| `PlayerOptions` | Default / meaning |
| --- | --- |
| `theme?: "light" \| "dark"` | Document theme, then `"light"`. |
| `controls?: boolean` | `true`; show playback controls. |
| `loop?: boolean` | `false`; loop the entire timeline. |
| `gifExport?: boolean` | `false`; show GIF download controls when `controls` is enabled. |
| `hoverFill?: boolean` | `false`; hover marks borders only. `true` also highlights backgrounds. |
| `reducedMotion?: boolean` | Follow browser preference; `true` hides flow markers and completes visual transitions immediately without changing timing. |

Vue/React `FlowPlayerProps` also accept required `document: DiagramDocument`, `speed?: number` (default `1`), `initialTimeMs?: number` (applied once), `className`, and `style`. Both entries export `FlowPlayerHandle` and `FlowPlayerProps`. Native players start through `play()` and change speed through `setSpeed()`.

### Events

Native events are `CustomEvent`s on `player.element`; read `event.detail`. Vue handlers and React callbacks receive the detail directly.

| Native / Vue event | React callback | Detail |
| --- | --- | --- |
| `stepchange` | `onStepChange` | `PlayerState`; scene/beat selection changed. |
| `timeupdate` | `onTimeUpdate` | `PlayerState`; frame updated. |
| `playstatechange` | `onPlayStateChange` | `PlayerState`; playing state changed. |
| `loopchange` | `onLoopChange` | `PlayerState`; loop setting changed. |
| `error` | `onError` | `PlayerErrorDetail`: player state plus `error: Error`. |
| `hover`, `click` | — | Browser/Web Component: `{ id, type, point, timeMs, sceneId, beatId }`, or `null` for no hit. Aliases: `objecthover`, `objectclick`. |

Interaction `point` uses diagram coordinates; `type` is `"node"` or `"edge"`. A frame update emits `stepchange`, when needed, before `timeupdate`. Web Component errors before mounting may omit player-state fields.

## Export

```ts
import { createDiagram } from "flowsvg";
import { exportGif } from "flowsvg/export";
import { diagram } from "./diagram.js";

const compiled = createDiagram(diagram);
const frame = compiled.evaluateAt(1200);
const svg = compiled.renderSvg(1200, { theme: "dark" });
const gif = await exportGif(diagram, { width: 640, fps: 15 });
```

SVG returns a string; GIF returns `Uint8Array`. Browser GIF export supports `signal` and `onProgress`. Use `gifExport: true` for built-in download controls. Node 20+ also provides `renderHtml` and `exportGif` through `flowsvg/node`; Node GIF requires prepared Chromium.

## Core API — `flowsvg`

All times are milliseconds; positions and dimensions use diagram units. `options?: EvaluateOptions` accepts `theme?: "light" | "dark"` and `reducedMotion?: boolean` (default `false`).

| Function | Result / behavior |
| --- | --- |
| `createDiagram(document: DiagramDocument): Diagram` | Validate, copy, freeze and compile the document for repeated queries. |
| `renderSvg(document: DiagramDocument, timeMs = 0, options?): string` | Compile and render one static SVG. |
| `validateDocument(input: unknown): ValidationIssue[]` | Check fields and references; return `{ path, message }` issues. An empty array means these checks passed; compilation can still reject non-finite derived flow timing. |
| `measureNodeContent({ kind, width, content }): NodeContentMeasurement` | Return `{ height, diagnostics }`. `kind`: `rect`, `roundedRect`, or `cylinder`; `content`: one `NodeContent` or a nonempty array of versions. Return the largest required height across versions. |
| `wrapText(label: string, maxWidth: number, typography?): string[]` | Estimate wrapping without the DOM. Optional typography supplies all three numeric fields: `fontSize`, `lineHeight`, `charWidth`; omitted uses node typography. |

| Compiled `Diagram` | Result / behavior |
| --- | --- |
| `totalDuration: number` | Readonly effective duration; `0` for static documents. |
| `beats: readonly DiagramBeat[]` | Compiled `{ sceneId, beatId, beatIndex, startMs, endMs, caption? }` intervals. |
| `evaluateAt(timeMs: number, options?): DiagramFrameState` | Return `{ timeMs, sceneId, beatId, beatProgress, nodes, edges, camera, caption?, warnings }`. |
| `renderSvg(timeMs = 0, options?): string` | Render without recompiling. |
| `hitTest(timeMs: number, point: DiagramPoint, options?): HitObject \| null` | Hit-test `{ x, y }` in diagram coordinates; return `{ id, type }` or `null`. |

Query times clamp to `[0, totalDuration]`; non-finite values become zero. `DiagramValidationError.issues` contains validation paths and messages. Measurement diagnostics contain `{ versionIndex, path, dimension, message }`; increasing height does not fix width overflow or overflow inside a fixed-height graph block.

### Document and actions

| Type | Core fields |
| --- | --- |
| `Viewport` | Required finite positive `width` and `height`; optional `fitHeight: { padding }` with finite nonnegative bottom padding. |
| `DiagramDocument` | `version: 1`, `viewport`, `nodes`, `edges`, `scenes`; optional `title`, `theme`. Empty `scenes` makes a static diagram. |
| `DiagramNode` | `id`, `kind`, `x`, `y`, `width`, `height`; optional `label` or `content` (mutually exclusive), `parentId`, `visible`, `style`. Kinds: `rect`, `roundedRect`, `ellipse`, `cylinder`, `group`. |
| `DiagramEdge` | `id`, `from`, `to`; optional `route` (default `straight`), `fromPort`, `toPort`, `label`, `visible`, `style`. Ports: `top`, `right`, `bottom`, `left`. |
| `Scene` / `Beat` | Scene: `{ id, label, beats }`. Beat: `{ durationMs, actions, transitionMs?, caption? }`. `durationMs` must be positive. `transitionMs` must be in `[0, durationMs]`, defaults to `min(250, durationMs)`, and is capped at effective beat length. |
| `Action` | `{ type, target }`; `updateNode` / `updateEdge` also require `value`. `flow` requires `direction` (`forward` / `reverse`), with optional `text` and `highlightParticipants` (default `true`). `focus` targets a node/group ID or `null` for full view. |

`updateNode.value` supports `x`, `y`, `width`, `height`, `label`, `content` (`null` clears it), `fill`, `stroke`, and `opacity`. `updateEdge.value` supports `label`, `stroke`, `strokeWidth`, and `opacity`. Node/edge IDs are globally unique; child positions are relative to their parent group. `NodeContent` and its block types are exported from `flowsvg`.

## Export API

| Entry / function | Return / requirements |
| --- | --- |
| `flowsvg/export` → `exportGif(document, options?: GifExportOptions)` | `Promise<Uint8Array>`; browser canvas and worker support. |
| `flowsvg/node` → `renderHtml(document, options?: HtmlRenderOptions)` | `Promise<string>`; standalone offline player HTML. Node 20+, no browser required. |
| `flowsvg/node` → `exportGif(document, options?: NodeGifExportOptions)` | `Promise<Uint8Array>`; Node 20+ and prepared Chromium. Set `executablePath` or supply a Playwright `browser`, never both. A supplied browser remains caller-owned. |

| `GifExportOptions` | Default / meaning |
| --- | --- |
| `theme`, `reducedMotion` | Document theme then `light`; reduced motion defaults to `false`. |
| `startMs`, `endMs`, `speed` | Full timeline at `1×`; range start is inclusive and end exclusive, except the global end includes the completed state. |
| `width`, `fps` | `min(viewport.width, 1280)` pixels; `15` samples/second (`1`–`30`, integer). |
| `includeCaptions`, `captionHeight` | `true`; fixed caption region of `80` pixels. |
| `loopCount`, `finalHoldMs` | `0` means infinite GIF looping; `1`–`65536` means total plays. Add `1000` ms of final hold by default. Independent of live player looping. |
| `signal`, `onProgress` | `AbortSignal`; callback receives `{ phase, completed, total }`. Phases: `preparing`, `sampling`, `encoding`, `complete`. |

GIF limits: 120 effective seconds, 1800 samples, 1801 encoded frames, final long edge ≤1920 pixels including captions. `GifExportError.code` is `options`, `limit`, `document`, `caption-overflow`, `environment`, `rasterization`, `encoding`, or `cancelled`. Both export entries expose `GifExportError` and their option/progress types.

`HtmlRenderOptions`: `theme`, `autoplay` (default `false`), `loop` (`false`), `controls` (`true`), `gifExport` (`false`). Built-in GIF downloads export the full timeline at `1×`, using the current theme.

## Other browser APIs

- `flowsvg/web-component` (alias `flowsvg/element`): call `defineFlowPlayer(tagName = "flowsvg-player")` in the browser; returns the registered constructor, or `undefined` without a custom-element registry. Set `element.document` to an object, use the `document` JSON attribute, or load a URL through `src`. Playback options use attributes such as `loop`, `gif-export`, and `reduced-motion`; `autoplay` defaults to `false`, `speed` to `1`. Use playback methods except `load()`; assign `.document` to reload. `getState()` can return `undefined` before mounting or after destruction. Events bubble and cross shadow boundaries.
- `flowsvg/browser`: `new SelectControl(owner: Document, label: string, onChange: (value: string) => void)`. Append `.element`, synchronize with `render(choices: readonly SelectChoice[], value: string, disabled = false)`, and call `destroy()` on disposal. Each choice is `{ value, label }`; the caller owns the committed value.

## Authoring rules

- `show`, `hide`, `highlight`, `unhighlight`, `updateNode`, `updateEdge`, and `focus` persist across beats. `flow` lasts for its beat only.
- A single flow moves at a reference 180 diagram units/second (minimum 400 ms), then uses a 500 ms arrival interval including highlight fades. This replaces authored `durationMs`. Multiple flows and no-flow beats retain authored timing. Read effective boundaries from `compiled.beats`; use separate no-flow beats for reading time.
- Structured `content` supports titles, paragraphs, lists, tags, and entity graphs in rectangles, rounded rectangles, and cylinders. Use `measureNodeContent({ kind, width, content })` before authoring fixed dimensions; inspect its `diagnostics`. It does not resize nodes during playback.
- `viewport.fitHeight: { padding: 24 }` fits current full-view height. GIF keeps the authored viewport dimensions and scale.
- Invalid documents throw `DiagramValidationError` with field paths. Text overflow appears in `frame.warnings`. `validateDocument(input)` checks external JSON before use.

ESM with TypeScript declarations. Core runs without DOM on Node 18+; Node tools require Node 20+. Vue 3.5+ / React 18+.

[Full SDK guide](https://github.com/yokingma/FlowSVG/blob/main/docs/SDK-GUIDE.md) · [Changelog](https://cdn.jsdelivr.net/npm/flowsvg@0.2.0/CHANGELOG.md) · [MIT](https://cdn.jsdelivr.net/npm/flowsvg@0.2.0/LICENSE)
