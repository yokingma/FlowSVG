# Vue showcase

The Vite single-page app consumes `@flowsvg/showcase/author` and the public `flowsvg/vue` adapter. Navigation, introductions, categories, and downloadable diagram JSON come from the [shared author package](../../packages/showcase/README.md#formal-examples). Formal selection and ordering are defined in [src/formal.ts](../../packages/showcase/src/formal.ts); acceptance catalogs are selected explicitly for testing.

The formal catalog opens **Basic shapes: complete catalog** (`basic-shapes`), paused at zero with the dark theme, speed 1, and reduced motion off. It demonstrates all public node shapes, measured labels, groups, orthogonal connections, highlights, and label replacement. Story names, introductions, and diagram text use English.

The host provides playback, seeking, theme and motion choices, GIF export, JSON downloads, and shareable views. RAG updates measured card sizes and row positions with content changes; its live canvas and SVG fit the current height, while GIF retains authored dimensions. Other stories use fixed playback geometry.

Native, React, and Vue share a dark presentation shell with catalog metrics, category navigation, animated header artwork, and a framed player surface. Decorative motion follows reduced-motion preferences. The site uses `flowsvg-compact` playback controls; playback, presentation selectors, and download/share actions follow the selected theme.

Theme, scene, and speed menus use the SDK's `SelectControl`, including keyboard navigation, confirmation, cancellation, and outside dismissal. The progress slider takes a separate row on narrow screens.

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
