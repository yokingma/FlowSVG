<p align="center">
  <img src="packages/flowsvg/docs/images/flowsvg-wordmark.gif" alt="FlowSVG" width="280">
</p>

<p align="center">Executable diagrams that explain systems and processes.</p>

<p align="center">English | <a href="README.zh-CN.md">简体中文</a></p>

<p align="center">
  <a href="https://www.npmjs.com/package/flowsvg"><img src="https://img.shields.io/npm/v/flowsvg?logo=npm&label=npm" alt="npm version"></a>
  <a href="https://www.npmjs.com/package/flowsvg"><img src="https://img.shields.io/npm/dm/flowsvg?logo=npm&label=downloads" alt="monthly npm downloads"></a>
  <a href="https://github.com/yokingma/flow-diagram-skill"><img src="https://img.shields.io/badge/Agent_Skill-flow--diagram-2a63c8" alt="Flow Diagram agent Skill"></a>
</p>

<p align="center">
  <a href="https://yokingma.github.io/FlowSVG/">Live demo</a> ·
  <a href="#flow-diagram-skill">Skill</a> ·
  <a href="#quick-start">Quick&nbsp;start</a> ·
  <a href="#integrations-and-api">API</a> ·
  <a href="apps/native-example/README.md">Examples</a>
</p>

**FlowSVG SDK renders, plays, embeds, and exports executable diagrams that explain systems and processes.**

Use one editable JSON or TypeScript document to describe nodes, relationships, scenes, and beats. Explain structures with static diagrams and show process progression or state changes with animation. Reuse that document for an interactive player, standalone offline HTML, SVG, PNG, or GIF.

FlowSVG includes the SDK, a shared showcase, and native browser, React, and Vue integration examples. [Flow Diagram Skill](#flow-diagram-skill) provides diagram authoring and review.

The TypeScript core runs without a DOM, network access, or browser clock. Native browser, Vue, React, and Web Component integrations share the same timeline and rendering results.

Try the [live demo](https://yokingma.github.io/FlowSVG/) to browse the example catalog, play diagrams, and inspect shareable demonstrations in the browser.

## Featured examples

FlowSVG includes a complete public shape catalog, a simple request and response flow, a two-replica web service deployment, and an LLM inference walkthrough that makes Transformer layers and KV-cache reuse visible.

The shape catalog puts every public node shape into one executable flow and demonstrates measured labels, orthogonal connections, highlights, and playback.

<p align="center"><img src="https://yokingma.github.io/FlowSVG/previews/basic-shapes.gif" alt="Animated catalog of FlowSVG node shapes" width="700"></p>

<p align="center"><img src="https://yokingma.github.io/FlowSVG/previews/request-response.gif" alt="Request and response flow" width="700"></p>

<p align="center"><img src="https://yokingma.github.io/FlowSVG/previews/web-service-deployment.gif" alt="Two-replica web service deployment" width="700"></p>

<p align="center"><img src="https://yokingma.github.io/FlowSVG/previews/llm-inference.gif" alt="LLM inference with Transformer layers and KV cache" width="700"></p>

## Use cases

The formal demo catalog uses English for navigation, introductions and diagram text. Stable example IDs keep shared links valid.

| Use case | Typical output |
| --- | --- |
| Presentation materials | SVG/PNG diagrams or GIF animations for architecture, processes and state changes |
| Web documentation and product explanations | An embedded player with playback and seeking controls |
| Technical teaching and onboarding | Step-by-step explanations of requests, data flow and task lifecycles |
| Design reviews and incident walkthroughs | A structural overview followed by the relevant interactions or failure sequence |

Reuse one diagram document for static SVG/PNG, animated GIF and interactive or offline HTML. Slide materials are exported assets; FlowSVG does not generate PPTX files or native PowerPoint shapes. SVG/PNG/GIF support depends on the presentation software.

## Features

- Use measured `diamond` decision labels with safe-area clipping and contour-aware connections. See the [decision example](packages/flowsvg/examples/decision-branch.json).
- Measured `parallelogram` input/output nodes share safe-area labels and contour-aware connections. See the [input/output example](packages/flowsvg/examples/input-output.json).
- Use `predefinedProcess` for a subprocess call, with measured plain labels and decorative side lines. See the [subprocess example](packages/flowsvg/examples/subprocess-call.json).
- Use measured `document` report labels above a bounded wave, with contour-aware hits. See the [report generation example](packages/flowsvg/examples/report-generation.json).

- Draw nodes, nested groups and directed straight, orthogonal or curved edges.
- Compose titles, paragraphs, lists, tags and inline styled text inside nodes; measure content before choosing dimensions.
- Configure document-level node, edge and flow-marker font sizes across players and exports.
- Animate visibility, emphasis, geometry, content and camera focus through scenes and beats.
- Play, pause, seek, step, change speed and loop with built-in controls.
- Evaluate frames, hit-test objects and export SVG/PNG at a specified time.
- Generate standalone offline HTML and export GIFs with progress and cancellation.
- Use light/dark themes, keyboard controls and reduced motion.
- Save highlight and flow-marker colors in document `emphasis`; playback, hover and exports share those colors.
- Validate documents with field-level errors and text-overflow warnings; query geometric overlap risks on demand.

Node positions and sizes are authored explicitly. FlowSVG focuses on presentation and playback; drag-and-drop editing and semantic automatic layout are outside its scope. For diagram authoring and deterministic layout plans, use [Flow Diagram Skill](#flow-diagram-skill).

The [mixed approval flow](packages/flowsvg/examples/mixed-flow.json) combines all four presets, an ordinary node, a group and three route families. It includes label replacement, size and style changes, and one deliberately clipped label. Its [generator](packages/flowsvg/examples/create-mixed-flow.mjs) reserves a shared height for label versions through public `measureNodeLabel`.

After installing `flowsvg`, place the script in a writable directory and run `node create-mixed-flow.mjs`, then `npx flowsvg mixed-flow.json --format html --output mixed-flow.html` to generate offline playback.

In this repository, first run `pnpm --filter flowsvg build`, then `node packages/flowsvg/examples/create-mixed-flow.mjs`; serve `packages/flowsvg` and open `/tests/browser-mixed-flow.html`.

## Installation

Install from [npm](https://www.npmjs.com/package/flowsvg):

```sh
pnpm add flowsvg
```

The package includes ESM entries and TypeScript declarations. Core and native browser usage need no framework; see the [SDK guide](docs/guides/sdk-guide.md).

## Quick start

### 1. Define a diagram

Save this as `diagram.ts` for playback and export:

```ts
import type { DiagramDocument } from "flowsvg";

export const diagramDocument: DiagramDocument = {
  version: 1,
  title: "Request flow",
  viewport: { width: 640, height: 280 },
  nodes: [
    { id: "client", kind: "roundedRect", x: 40, y: 100, width: 140, height: 80, label: "Client" },
    { id: "service", kind: "rect", x: 420, y: 100, width: 160, height: 80, label: "Service", visible: false }
  ],
  edges: [{ id: "request", from: "client", to: "service", label: "HTTP", route: "straight" }],
  scenes: [{
    id: "request-flow",
    label: "Request reaches the service",
    beats: [
      { durationMs: 1000, transitionMs: 250, caption: "Show the service", actions: [{ type: "show", target: "service" }] },
      { durationMs: 1000, caption: "The service handles the request", actions: [{ type: "highlight", target: "service" }] }
    ]
  }]
};
```

### 2. Play in a browser

Add a container to your page:

```html
<div id="diagram" style="width: 100%; height: 360px;"></div>
```

Create the player in a client-side application module:

```ts
import { createPlayer } from "flowsvg/browser";
import "flowsvg/styles.css";
import { diagramDocument } from "./diagram.js";

const host = document.querySelector<HTMLElement>("#diagram");
if (!host) throw new Error("Diagram host is missing");

const player = createPlayer(host, diagramDocument);
player.play();
```

Built-in controls support pausing, speed changes, and seeking. Call `player.seek(1000)` to jump to a time in milliseconds, and `player.destroy()` on disposal. Plain HTML requires an import map or build tooling for package imports.

### 3. Export a static SVG

The core entry runs without a DOM:

```ts
import { createDiagram } from "flowsvg";
import { diagramDocument } from "./diagram.js";

const diagram = createDiagram(diagramDocument);
const svg = diagram.renderSvg(1000);
console.log(svg);
```

`svg` is a complete SVG string for saving or previewing. Reuse the compiled `diagram` for repeated evaluation or export.

For GIF export, see the [browser API](docs/guides/sdk-guide.md#browser-gif-export) or [Node API](docs/guides/sdk-guide.md#node-gif-export-node-20).

The browser SDK also exports PNG at controlled pixel dimensions, with transparent SVG/PNG backgrounds. See [Browser PNG and SVG backgrounds](docs/guides/sdk-guide.md#browser-png-and-svg-backgrounds).

## Offline HTML

Node 20+ tools generate a single HTML file with data, player and styles. The file opens through `file://` without a network connection. It starts paused with controls and captions, using the document theme or light when no theme is specified. This example reuses `diagramDocument` from the quick start. Compile `diagram.ts` to `diagram.js` before running it in Node.

```js
import { renderHtml } from "flowsvg/node";
import { diagramDocument } from "./diagram.js";
import { writeFile } from "node:fs/promises";
await writeFile("diagram.html", await renderHtml(diagramDocument, { theme: "dark" }));
```

For CLI usage, optional GIF downloads and portable tools, see [offline HTML](docs/guides/sdk-guide.md#offline-html-node-20). Node GIF export additionally requires a prepared Chromium browser; see [Node GIF export](docs/guides/sdk-guide.md#node-gif-export-node-20).

## Integrations and API

For documentation by reader and task, see the [documentation map](docs/README.md).

The [SDK guide](docs/guides/sdk-guide.md) covers integrations, the document model and public APIs.

| Goal | Documentation |
| --- | --- |
| Create documents, evaluate frames, or export SVG | [Quick start](docs/guides/sdk-guide.md#quick-start), [Core API](docs/guides/sdk-guide.md#core-api) |
| Measure node content at a fixed width | [Content measurement](docs/guides/sdk-guide.md#measure-content-before-creating-a-document) |
| Use a Vue component | [Vue integration](docs/guides/sdk-guide.md#vue-integration) |
| Use a React component | [React integration](docs/guides/sdk-guide.md#react-integration) |
| Integrate with a plain webpage or custom controls | [Native browser](docs/guides/sdk-guide.md#native-browser), [Player API](docs/guides/sdk-guide.md#player-api) |
| Use a custom element or load a document URL | [Web Component](docs/guides/sdk-guide.md#web-component) |
| Export PNG images | [Browser PNG and SVG backgrounds](docs/guides/sdk-guide.md#browser-png-and-svg-backgrounds), [Node PNG](docs/guides/sdk-guide.md#node-png-export) |
| Export GIF bytes or enable player downloads | [Browser GIF export](docs/guides/sdk-guide.md#browser-gif-export), [Built-in GIF downloads](docs/guides/sdk-guide.md#built-in-gif-downloads) |
| Generate offline HTML or export GIFs from Node | [Offline HTML](docs/guides/sdk-guide.md#offline-html-node-20), [Node GIF export](docs/guides/sdk-guide.md#node-gif-export-node-20) |
| Write scenes and actions | [Documents and timelines](docs/guides/sdk-guide.md#documents-and-timelines) |
| Handle events, errors, and themes | [Events](docs/guides/sdk-guide.md#events), [Themes and accessibility](docs/guides/sdk-guide.md#themes-and-accessibility), [Validation and errors](docs/guides/sdk-guide.md#validation-and-errors) |

## Requirements

| Use case | Requirements |
| --- | --- |
| Develop this repository | Node.js 22.12+ and pnpm 10.12.1 |
| Run the SDK core independently | Node.js 18+, or an environment supporting ES2022 ESM |
| Browser player | A modern browser supporting SVG, ES Modules, and `requestAnimationFrame` |
| Browser PNG export | Canvas 2D, image decoding and local system fonts |
| Browser GIF export | Canvas 2D, image decoding, Blob workers and a content security policy that permits them |
| Node HTML generation / CLI | Node.js 20+; HTML generation needs no browser |
| Node PNG/GIF export | Node.js 20+, preinstalled Chromium, system libraries and fonts |
| Vue / React integration | Vue 3.5+ / React 18+; install only the framework you use |

The Vue/React examples use Vite 7, so repository development requires a newer Node.js version than the SDK core alone. The package provides ESM entries only.

## Development

Run from the repository root with Node.js 22.12+ and pnpm 10.12.1:

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm --filter flowsvg-native-example dev
```

Open the URL printed in the terminal. For React or Vue, replace `flowsvg-native-example` with `flowsvg-react-example` or `flowsvg-vue-example`. Rebuild the SDK after changing its source.

Installation links the CLI through a checked-in launcher and does not build the SDK. Before the first build, invoking the CLI exits with a `pnpm build` instruction.

The shared catalog includes request/response, RAG, architecture, task lifecycle, data flow, deployment and sequence diagrams. Examples use self-contained teaching data. See the [native](apps/native-example/README.md), [React](apps/react-example/README.md) and [Vue](apps/vue-example/README.md) guides for controls and build options. A [background task example](packages/flowsvg/README.md#example-background-task-lifecycle) is also included in the npm package.

Build all three example sites with `pnpm build:examples`. For static hosting and GitHub Pages, see [showcase delivery](docs/verification/showcase-verification.md) and [Pages deployment](docs/development/github-pages.md).

### Verification

```sh
pnpm typecheck
pnpm test
```

Additional checks:

| Scope | Command | Details |
| --- | --- | --- |
| SDK browser behavior | `pnpm --filter flowsvg test:browser` | [SDK verification](docs/verification/sdk-verification.md) |
| Built examples and static delivery | `pnpm test:examples` | [Showcase verification](docs/verification/showcase-verification.md) |
| Package and installed consumers | `pnpm release` | [Release guide](docs/development/releasing.md) |

Browser checks require a prepared Chromium browser and fonts. Follow the [browser setup instructions](docs/development/releasing.md#浏览器与最低运行时准备). `pnpm release` verifies and previews publication; uploading requires the separate `pnpm release:publish` command.

For project conventions, see the [glossary](GLOSSARY.md), [architecture decisions](docs/adr/) and [implementation patterns](PATTERNS.md). SDK release notes are in the [package changelog](packages/flowsvg/CHANGELOG.md).

## Flow Diagram Skill

[**Flow Diagram**](https://github.com/yokingma/flow-diagram-skill) is an executable diagram Skill for explaining systems and processes: author once, then play, embed, inspect, and export. It provides authoring, layout plans, validation workflows, reviews, and delivery reports through the published `flowsvg` package.

Install it in the project where you want to author diagrams:

```sh
npx skills add https://github.com/yokingma/flow-diagram-skill --skill flow-diagram
```

Ask with `$flow-diagram` in Codex or `/flow-diagram` in Claude Code. Host requirements, supported assistants, and known limits are documented in that repository.

See [authoring-tool integration](docs/development/authoring-tools.md) for SDK version selection and verification responsibilities.

## License

[MIT](packages/flowsvg/LICENSE). Retain the license and copyright notice when using, modifying, or distributing the project.
