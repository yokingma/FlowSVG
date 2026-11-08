# Vue showcase

The Vite single-page site consumes `@flowsvg/showcase/author` and `@flowsvg/showcase/session` through the public `FlowPlayer` component from `flowsvg/vue`. It displays the ordered examples, current diagram, introduction, visual settings, sharing and a standalone JSON download. The formal catalog opens **Basic shapes: complete catalog** (`basic-shapes`) with showcase dark default styling. This first example contains every public node shape, measured preset labels, group containment, orthogonal connections, highlights and label replacement. It is followed by **Request and response** (`request-response`) with uniformly curved edges. Its second entry, **RAG: From sources to answers** (`rag-workflow`), is a fictional ingestion/question-answering story with question-aware reranking (5 candidates → 2 selected chunks) and cited answers, using a compact three-row layout, rounded orthogonal routes and capsule tags. The third entry, **FlowSVG: How diagrams run** (`project-architecture`), explains the project architecture: document/core evaluation, player/adapters, SVG/GIF/offline HTML and the showcase package boundary. The fourth entry, **vllm-metal: Layered inference architecture** (`vllm-metal-stack`), adapts the upstream figure into a four-layer stack with nested ownership panels and conditional-path explanations. All ten examples use the same shared author source and existing playback, sharing and JSON download controls. Acceptance definitions are explicit test input.

The additional stories are **Background task lifecycle** (`job-lifecycle`), **Order events: From ingestion to metrics** (`order-event-pipeline`), **Web service: Two-replica deployment** (`web-service-deployment`), and **Cache miss: Read and populate** (`cache-aside-sequence`). They demonstrate a single current task state, conserved event counts and amounts, nested deployment boundaries, and seven ordered message rows. All ten use SDK default styling with the dark theme selected initially. The sequence story uses straight messages; RAG, project architecture, task states, order data flow and deployment use orthogonal routes with SDK-rounded bends; request-response and vllm-metal use curved edges. All data is self-contained teaching data. Names, categories, introductions and diagram text use English.

The **LLM inference: Prefill, decode and KV cache** (`llm-inference`) story uses straight causal connections, centered unboxed annotations and two-line cache cards. The page supplies the title and introduction; the diagram omits duplicate title nodes. All hosts consume the same [shared author layout](../../packages/showcase/README.md#formal-examples).

Formal examples use compact node geometry. RAG measures each current content version and updates card heights and row positions together at content changes, retaining 50-unit row gaps. Its optional SDK `viewport.fitHeight` setting also shrinks the live canvas and standalone SVG to current content while retaining width and scale; GIF keeps the authored viewport dimensions. Other examples retain fixed playback geometry.

Example navigation now shows six populated categories in order: **Workflow**, **Architecture**, **State transitions**, **Data flow**, **Deployment** and **Sequence**. Workflow contains four examples, Architecture contains two, and each remaining category contains one. Classification is showcase metadata and does not enter diagram JSON.

The outer showcase now uses a shared dark technical exhibition shell across Native, React and Vue: a live-canvas status cue, catalog-driven story metrics, animated flow header artwork, stronger navigation states and a framed player surface. Decorative motion stops under reduced-motion preferences; SDK playback, sharing and download contracts remain unchanged.

Presentation selectors and download/share actions use the same rounded, neutral control style across all three hosts. The SDK toolbar supplies compact playback controls, an accent-tinted Play/Pause action, keyboard focus and a separate progress row on narrow screens.

The site enables `flowsvg-compact` for 32-pixel playback controls and uses smaller download/share actions. Control tokens follow the committed theme: formal dark defaults render dark controls, and selecting Light switches playback and custom menus to the light palette. Theme, scene and speed use the SDK's custom `SelectControl` menu with matching option styling, keyboard navigation, confirmation/cancellation and outside dismissal.

The SDK Loop button starts off. Its choice survives example, theme, reduced-motion, retry, Back/Forward and persisted page-cache replacements in the current page session. The host captures loop with time and speed only at operations; the SDK owns the playback clock. Fresh entry or refresh starts with looping off. Loop is absent from share URLs and downloaded diagram JSON, and does not configure GIF repetition.

## Prepare and develop

Run from the repository root:

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm --filter flowsvg-vue-example dev
```

`pnpm build` prepares the SDK. Vue `dev` and `build` compile and generate the selected shared author source before starting Vite. Without `SHOWCASE_SOURCE`, both commands regenerate the formal catalog. A previous acceptance build cannot silently supply formal content. Rebuild the SDK after SDK changes. Restart development, or rebuild the shared package and reload, after author changes. No SDK or shared-package watch process is implied.

## Static output

```sh
pnpm --filter flowsvg-vue-example build
pnpm --filter flowsvg-vue-example preview
```

The resulting `dist/` contains every script, stylesheet and selected diagram JSON needed for HTTP/HTTPS hosting. Navigation needs no server route fallback. Preview serves an existing build without changing its content. To select isolated acceptance input and a deployment base:

```sh
SHOWCASE_BASE=/showcase/ SHOWCASE_SOURCE=dist/acceptance.js pnpm --filter flowsvg-vue-example build
```

Serve this output at `/showcase/`. JSON downloads resolve beneath the base. See [shared authoring](../../packages/showcase/README.md) for selection and validation.

## Sessions and lifecycle

First entry starts paused at zero with complete example defaults. Selecting another example resets time and speed while retaining theme and reduced motion. Visual changes preserve the SDK's operation-time position and speed and pause playback. Vue unmounts the previous presentation version before mounting the next version with `initialTimeMs`; prop changes within one adapter lifetime do not provide time restoration. The SDK owns playback, seeking, beats, scenes, speed and GIF export. The app does not mirror playback on every frame.

The shared session module computes targets and ordered address effects. Vue owns browser effects, errors and component lifetime. Framework unmount releases the SDK player and cancels its GIF work, including delayed imports and active encoding. Old callbacks and clipboard completions cannot overwrite a later presentation. Leaving the page releases the player and listeners. A persisted page-cache return remounts its saved position and speed paused. A descendant mount error stays below navigation; selecting the failed example again retries its saved target.

“Share current view” captures the current example, time and visual choices without pausing or replacing the player. Clipboard failure shows a selectable manual Share URL. Addresses use `example`, `theme=light|dark`, `reduced=0|1` and decimal `time` in milliseconds. Invalid or duplicate fields display diagnostics; time clamps to the diagram duration. Unrelated query bytes, the fragment and deployment base remain unchanged. Direct entry, refresh and Back/Forward restore paused with the target example's default speed. Example and visual changes save the previous history snapshot before pushing their target. Playback, seek and speed changes alone do not write addresses. See [shared address rules](../../packages/showcase/README.md#shareable-addresses-and-history).

“Download diagram JSON” uses the current definition's same-origin generated document. It contains no showcase metadata and works with the existing CLI. Empty state mounts no player and provides no presentation, share or download controls.

## Checks

After installing dependencies, run from the repository root. Build the SDK and shared author output before type checking the host:

```sh
pnpm build
pnpm --filter @flowsvg/showcase build
pnpm --filter flowsvg-vue-example typecheck
FLOWSVG_CHROMIUM_PATH=/absolute/path/to/chromium pnpm --filter flowsvg-vue-example test:showcase
```

The browser tests run the root-owned common scenarios against the real Vue adapter. They build acceptance, formal and explicit empty output into temporary directories, serve only static artifacts and verify defaults, actual controls, visual/time restoration, sharing, history, mount failures, rapid changes, downloads and GIF resource cancellation. An additional Vue test checks that a descendant mount exception produces no unhandled page error and that retry restores the saved target. Tests never install a browser.

## Cross-host delivery

From the repository root, `pnpm build:examples` prepares SDK, shared author output and all three sites in order. `pnpm test:examples` runs shared contracts, each host suite and copied-artifact root/subpath delivery. `pnpm test:all` explicitly adds SDK type/test/tarball verification. See [showcase verification](../../docs/verification/showcase-verification.md) for independent hosting, narrower commands and resource checks.

## Shared SDK contract

The public SDK owns rendering, effective timeline timing, playback, and GIF export. This host consumes the compiled beat schedule; see the [SDK timeline contract](../../docs/guides/sdk-guide.md#beats-and-actions) for movement, post-arrival, reduced-motion, default, and error behavior, and the [SDK export sections](../../docs/guides/sdk-guide.md#browser-png-and-svg-backgrounds) for PNG/GIF requirements and limits.

Host lifecycle, cancellation, address, and build behavior remain documented above and are maintained by this app's source and tests.
