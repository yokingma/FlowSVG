# FlowSVG React showcase

The Vite single-page app consumes `@flowsvg/showcase/author` and the public `flowsvg/react` adapter. Navigation, diagram introduction and generated JSON come from the shared catalog. The formal catalog opens **请求与响应** (`request-response`) with SDK default styling and uniformly curved edges. Its second entry, **RAG：从资料到答案** (`rag-workflow`), is a fictional ingestion/question-answering story with question-aware reranking (5 candidates → 2 selected chunks) and cited answers, using a compact three-row layout, rounded orthogonal routes and capsule tags. The third entry, **FlowSVG：图解如何运行** (`project-architecture`), explains the project architecture: document/core evaluation, player/adapters, SVG/GIF/offline HTML and the private showcase boundary. The fourth entry, **vllm-metal：分层推理架构** (`vllm-metal-stack`), adapts the upstream figure into a four-layer stack with nested ownership panels and conditional-path explanations. All eight examples use the same shared author source and existing playback, sharing and JSON download controls. Acceptance input is separate from formal content.

The additional stories are **后台任务生命周期** (`job-lifecycle`), **订单事件：从采集到指标** (`order-event-pipeline`), **Web 服务：双副本部署** (`web-service-deployment`), and **缓存未命中：查询与回填** (`cache-aside-sequence`). They demonstrate a single current task state, conserved event counts and amounts, nested deployment boundaries, and seven ordered message rows. All eight use SDK default styling. The sequence story uses straight messages; RAG, project architecture, task states, order data flow and deployment use orthogonal routes with SDK-rounded bends; request-response and vllm-metal use curved edges. All data is self-contained teaching data.

Formal examples use compact node geometry. RAG measures each current content version and updates card heights and row positions together at content changes, retaining 50-unit row gaps. Its optional SDK `viewport.fitHeight` setting also shrinks the live canvas and standalone SVG to current content while retaining width and scale; GIF keeps the authored viewport dimensions. Other examples retain fixed playback geometry.

Example navigation now shows six populated categories in order: **业务流程**, **系统架构**, **状态转换**, **数据流**, **部署拓扑** and **交互时序**. The first two retain their two examples each; the remaining categories each have one new story. Classification is showcase metadata and does not enter diagram JSON.

Presentation selectors and download/share actions use the same rounded, neutral control style across all three hosts. The SDK toolbar supplies compact playback controls, an accent-tinted Play/Pause action, keyboard focus and a separate progress row on narrow screens.

The site enables `flowsvg-compact` for 32-pixel playback controls and uses smaller download/share actions. Theme, scene and speed use the SDK's custom `SelectControl` menu with matching option styling, keyboard navigation, confirmation/cancellation and outside dismissal.

The SDK Loop button starts off. Its choice survives example, theme, reduced-motion, retry, Back/Forward and persisted page-cache replacements in the current page session. The host captures loop with time and speed only at operations; the SDK owns the playback clock. Fresh entry or refresh starts with looping off. Loop is absent from share URLs and downloaded diagram JSON, and does not configure GIF repetition.

## Development and static output

Run from the repository root:

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm --filter flowsvg-react-example dev
```

`pnpm build` prepares the SDK. App `dev` and `build` regenerate the selected shared author output before Vite runs. Without `SHOWCASE_SOURCE`, both regenerate the formal catalog even after an acceptance build. Rebuild the SDK after SDK source changes. Restart app development after shared author changes, or rebuild the shared package and reload. Vite watches app code; these commands do not start SDK/shared-package watch processes.

```sh
pnpm --filter flowsvg-react-example build
pnpm --filter flowsvg-react-example preview
```

Serve only `apps/react-example/dist/` over HTTP/HTTPS. The output contains the scripts, styles, generated diagram JSON and on-demand GIF resources. `preview` serves an existing output without preparing data or rebuilding. Query navigation needs no nested-route fallback.

Select isolated acceptance input and a deployment base explicitly:

```sh
SHOWCASE_SOURCE=dist/acceptance.js SHOWCASE_BASE=/showcase/ pnpm --filter flowsvg-react-example build
```

Serve that output at `/showcase/`. See [shared authoring](../../packages/showcase/README.md) for source validation and generated artifacts.

## Behavior and ownership

The SDK owns rendering, layout, time evaluation, playback and GIF encoding. The app reads its public handle at user operations and delegates target-state decisions to `@flowsvg/showcase/session`. Selecting an example starts paused at zero with its default speed and preserves current visual choices. A React key based on the presentation version unmounts the old adapter before the new mount applies its target time and speed. Changing theme or reduced motion keeps the operation-time frame and speed, then pauses the replacement. Repeating the current choice does not replace the player. A versioned error boundary contains SDK mount failures; navigation and visual controls remain available. Selecting the failed example again retries its saved target.

Each presentation owns its SDK export tasks. Selection, visual rebuilds and page exit unmount the adapter, cancel an old export and prevent late downloads. Page exit also removes app listeners. A persisted page-cache return mounts the saved time and speed paused.

Built-in controls provide playback, seek, adjacent beats, scenes, speed and GIF export. Downloaded JSON contains only the selected diagram document and works with the existing CLI.

## Address and browser history

The shared rules restore `example=<stable-id>`, `theme=light|dark`, `reduced=0|1` and decimal `time=<milliseconds>`. Direct entry and refresh pause at the restored time and the target example's default speed. Missing values use target defaults; invalid or decoded duplicate fields produce diagnostics and fall back. Time clamps to the SDK-derived duration; static diagrams use zero. Canonical replacement preserves unrelated query bytes, deployment paths and fragments.

Selection or visual changes first replace the old history entry with the action-time snapshot, then push the target. Repeating a current choice adds no entry. Back/Forward restores the target's saved snapshot paused without pushing again. Playback, seek, beat/scene and speed controls do not write the address. Restoration guarantees a saved snapshot, not the unsaved last playback instant.

“Share current view” captures the current example, time and visual settings, replaces the current address and copies the complete URL. Sharing preserves the mounted adapter, playback and speed without adding a history item. Clipboard failure displays a manual-copy Share URL. Presentation replacement or page exit invalidates an older pending clipboard result. Empty catalogs show no player, visual controls, download or share action.

## Checks

Prepare the SDK first, then run:

```sh
pnpm --filter @flowsvg/showcase test
pnpm --filter flowsvg-react-example typecheck
FLOWSVG_CHROMIUM_PATH=/absolute/path/to/chromium pnpm --filter flowsvg-react-example test:showcase
```

The acceptance entry registers root-owned common browser scenarios against the real React app. The tests build independent acceptance/formal/empty outputs, serve those outputs using an ordinary static server, and exercise the public UI and browser resource boundaries. Tests never install a browser or replace the SDK/framework with a mock.

The React-specific initial-mount case fails at the real canvas boundary before the first adapter effect completes. It verifies that the error boundary retains navigation and that selecting the same example retries the saved address time paused.

## Cross-host delivery

From the repository root, `pnpm build:examples` prepares SDK, shared author output and all three sites in order. `pnpm test:examples` runs shared contracts, each host suite and copied-artifact root/subpath delivery. `pnpm test:all` explicitly adds SDK type/test/tarball verification. See [showcase verification](../../docs/verification/showcase-verification.md) for independent hosting, narrower commands and resource checks.

## Shared SDK contract

The public SDK owns rendering, effective timeline timing, playback, and GIF export. This host consumes the compiled beat schedule; see the [SDK timeline contract](../../docs/guides/sdk-guide.md#beats-and-actions) for movement, post-arrival, reduced-motion, default, and error behavior, and the [SDK export sections](../../docs/guides/sdk-guide.md#browser-png-and-svg-backgrounds) for PNG/GIF requirements and limits.

Host lifecycle, cancellation, address, and build behavior remain documented above and are maintained by this app's source and tests.
