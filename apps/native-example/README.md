# Native showcase

The Vite single-page site consumes `@flowsvg/showcase/author` through the public `flowsvg/browser` player. It displays example navigation, the current diagram and its introduction. The formal catalog opens **Request and response** (`request-response`) with showcase dark default styling and uniformly curved edges. Its second entry, **RAG: From sources to answers** (`rag-workflow`), is a fictional ingestion/question-answering story with question-aware reranking (5 candidates → 2 selected chunks) and cited answers, using a compact three-row layout, rounded orthogonal routes and capsule tags. The third entry, **FlowSVG: How diagrams run** (`project-architecture`), explains the project architecture: document/core evaluation, player/adapters, SVG/GIF/offline HTML and the private showcase boundary. The fourth entry, **vllm-metal: Layered inference architecture** (`vllm-metal-stack`), adapts the upstream figure into a four-layer stack with nested ownership panels and conditional-path explanations. All nine examples use the same shared author source and existing playback, sharing and JSON download controls. The isolated acceptance catalog is not formal content.

The additional stories are **Background task lifecycle** (`job-lifecycle`), **Order events: From ingestion to metrics** (`order-event-pipeline`), **Web service: Two-replica deployment** (`web-service-deployment`), and **Cache miss: Read and populate** (`cache-aside-sequence`). They demonstrate a single current task state, conserved event counts and amounts, nested deployment boundaries, and seven ordered message rows. All nine use SDK default styling with the dark theme selected initially. The sequence story uses straight messages; RAG, project architecture, task states, order data flow and deployment use orthogonal routes with SDK-rounded bends; request-response and vllm-metal use curved edges. All data is self-contained teaching data. Names, categories, introductions and diagram text use English.

The **LLM inference: Prefill, decode and KV cache** (`llm-inference`) story uses straight causal connections, centered unboxed annotations and two-line cache cards. The page supplies the title and introduction; the diagram omits duplicate title nodes. All hosts consume the same [shared author layout](../../packages/showcase/README.md#formal-examples).

Formal examples use compact node geometry. RAG measures each current content version and updates card heights and row positions together at content changes, retaining 50-unit row gaps. Its optional SDK `viewport.fitHeight` setting also shrinks the live canvas and standalone SVG to current content while retaining width and scale; GIF keeps the authored viewport dimensions. Other examples retain fixed playback geometry.

Example navigation now shows six populated categories in order: **Workflow**, **Architecture**, **State transitions**, **Data flow**, **Deployment** and **Sequence**. Workflow contains three examples, Architecture contains two, and each remaining category contains one. Classification is showcase metadata and does not enter diagram JSON.

The outer showcase now uses a shared dark technical exhibition shell across Native, React and Vue: a live-canvas status cue, catalog-driven story metrics, animated flow header artwork, stronger navigation states and a framed player surface. Decorative motion stops under reduced-motion preferences; SDK playback, sharing and download contracts remain unchanged.

Presentation selectors and download/share actions use the same rounded, neutral control style across all three hosts. The SDK toolbar supplies compact playback controls, an accent-tinted Play/Pause action, keyboard focus and a separate progress row on narrow screens.

The site enables `flowsvg-compact` for 32-pixel playback controls and uses smaller download/share actions. Control tokens follow the committed theme: formal dark defaults render dark controls, and selecting Light switches playback and custom menus to the light palette. Theme, scene and speed use the SDK's custom `SelectControl` menu with matching option styling, keyboard navigation, confirmation/cancellation and outside dismissal.

The SDK Loop button starts off. Its choice survives example, theme, reduced-motion, retry, Back/Forward and persisted page-cache replacements in the current page session. The host captures loop with time and speed only at operations; the SDK owns the playback clock. Fresh entry or refresh starts with looping off. Loop is absent from share URLs and downloaded diagram JSON, and does not configure GIF repetition.

## Development

Run from the repository root:

```sh
pnpm install
pnpm build
pnpm --filter flowsvg-native-example dev
```

`pnpm build` prepares the SDK. Native `dev` and `build` compile and generate the selected shared author source before starting Vite. Without `SHOWCASE_SOURCE`, both commands explicitly regenerate the formal catalog; a previous acceptance build cannot leak into a normal build. Rebuild the SDK after SDK source changes. Restart `dev`, or rebuild the shared package then reload, after author changes. Vite watches app code; these commands do not start an SDK/shared-package watch process.

## Static build and acceptance input

The root [GitHub Pages workflow](../../.github/workflows/pages.yml) publishes this host with formal input and the repository deployment base. Enable Pages and satisfy the workflow's visibility condition before deploying. See [Pages setup and verification](../../docs/development/github-pages.md).

```sh
pnpm --filter flowsvg-native-example build
pnpm --filter flowsvg-native-example preview
```

Only `dist/` is required for HTTP/HTTPS hosting. It contains scripts, styles and selected diagram JSON. Navigation does not require server route fallback. `preview` serves an existing build and does not prepare or change its content.

Use the same author mechanism with isolated acceptance input:

```sh
SHOWCASE_SOURCE=dist/acceptance.js pnpm --filter flowsvg-native-example build
pnpm --filter flowsvg-native-example preview
```

Set the deployment base explicitly when building a subpath site:

```sh
SHOWCASE_BASE=/showcase/ SHOWCASE_SOURCE=dist/acceptance.js pnpm --filter flowsvg-native-example build
```

Serve the resulting directory at `/showcase/`; downloads resolve beneath that base. [Shared authoring](../../packages/showcase/README.md) describes source selection, generation and validation.

## Behavior

The catalog supplies order and the default example. First entry starts paused at zero with that example's complete default visual settings and speed. Selecting another example resets time to zero and takes its default speed while retaining the current theme and reduced-motion choice. Changing either visual option captures the current SDK time and speed, replaces the player and restores that time paused. Repeated choices preserve the current player. Visual preferences are saved in the current address; no independent preference store is used.

The pure `@flowsvg/showcase/session` interface computes these operation targets. The native host reads SDK state only at operations, pauses and releases the old instance, then creates the new instance and applies its speed and time. Each presentation version owns its callbacks and export tasks. The SDK controls provide playback, progress, adjacent beats, scenes, speed and GIF export. Changing examples or visual options cancels an old GIF export, including a pending module import. A completed export downloads only for the current player.

Parameter diagnostics appear separately from player errors. Mount or snapshot errors display a message while navigation and visual controls remain available. Without a player, later operations use the saved session target; selecting the failed example again retries it. Only one player exists at a time. Leaving the page releases it and app listeners. A persisted page-cache return restores the saved time and speed paused and restores app listeners.

“Download diagram JSON” downloads the current definition's same-origin generated document. It contains no showcase metadata and works with the existing FlowSVG CLI. An explicitly empty catalog creates no player and offers no visual controls or download. “Share current view” saves the current example, time and visual choices in the address and copies the complete link. Sharing retains playback and speed and does not replace the player. Direct entry and refresh restore the link paused with the target example's default speed. Clipboard failure shows an error and a selectable Share URL for manual copying. Empty state has no share control.

## Checks

After installing dependencies, run from the repository root. Build the SDK and shared author output before type checking the host:

```sh
pnpm build
pnpm --filter @flowsvg/showcase build
pnpm --filter @flowsvg/showcase test
pnpm --filter flowsvg-native-example typecheck
FLOWSVG_CHROMIUM_PATH=/absolute/path/to/chromium pnpm --filter flowsvg-native-example test:showcase
```

The browser suite registers root-owned common scenarios through `acceptance/native-browser.test.ts`. The same scenarios can run against each real host. It builds acceptance, formal and explicit empty sites into independent temporary directories, serves only their outputs with a plain static server, exercises real playback/visual controls, mount failure recovery, rapid selections, page lifecycle and downloads, and passes downloaded JSON to the existing CLI. It builds formal after acceptance to detect stale selection, then checks empty state with `SHOWCASE_SOURCE=dist/acceptance-empty.js`. It also delays the actual SDK exporter module/font preparation and interrupts active encoding to verify cancellation, no late downloads and worker/object-URL cleanup. Tests never install a browser. See [verification](VERIFICATION.md).

## Address and browser history

The address fields are `example=<stable-id>`, `theme=light|dark`, `reduced=0|1` and `time=<milliseconds>`. Time accepts decimal digits with an optional fractional part containing digits on both sides of the decimal point. It rejects signs, spaces, exponents, hex, empty and nonfinite values. Leading zeros are normalized. Unknown examples fall back to the catalog default; invalid or duplicate fields report diagnostics and use target defaults (time uses zero). Values beyond SDK-derived duration clamp to the final frame; a static diagram uses zero. Unrelated query tokens, raw encodings, fragments and deployment base paths remain unchanged.

On example or visual changes, the app first replaces the previous history entry with its action-time snapshot, then pushes the target. Repeating the current value adds no history item. Share replaces only the current entry. Back/Forward restores the target entry's most recently saved time and visual choices paused, using that example's default speed, and never pushes recursively. Continuous playback, seeking, beat/scene controls and speed changes do not update the address. A history entry guarantees its saved snapshot, not an unsaved final playback instant. Persisted page-cache returns retain the page's suspended session snapshot; history-address restores still use target default speed.

The built-site suite exercises query normalization, direct entry/refresh, actual Back/Forward, unchanged playback addresses, clipboard success/failure and obsolete clipboard completion. The shared suite covers encoded duplicates, field fallbacks, decimal-only time and very small fractional round-trips. The SDK release workflow remains independent of showcase generation and browser history.

## Cross-host delivery

From the repository root, `pnpm build:examples` prepares SDK, shared author output and all three sites in order. `pnpm test:examples` runs shared contracts, each host suite and copied-artifact root/subpath delivery. `pnpm test:all` explicitly adds SDK type/test/tarball verification. See [showcase verification](../../docs/verification/showcase-verification.md) for independent hosting, narrower commands and resource checks.

## Shared SDK contract

The public SDK owns rendering, effective timeline timing, playback, and GIF export. This host consumes the compiled beat schedule; see the [SDK timeline contract](../../docs/guides/sdk-guide.md#beats-and-actions) for movement, post-arrival, reduced-motion, default, and error behavior, and the [SDK export sections](../../docs/guides/sdk-guide.md#browser-png-and-svg-backgrounds) for PNG/GIF requirements and limits.

Host lifecycle, cancellation, address, and build behavior remain documented above and are maintained by this app's source and tests.
