# Native showcase

The Vite single-page site consumes `@flowsvg/showcase/author` through the public `flowsvg/browser` player. Navigation, introductions, categories, and downloadable diagram JSON come from the [shared author package](../../packages/showcase/README.md#formal-examples). Formal selection and ordering are defined in [src/formal.ts](../../packages/showcase/src/formal.ts); acceptance catalogs are selected explicitly for testing.

The formal catalog opens **Basic shapes: complete catalog** (`basic-shapes`), paused at zero with the dark theme, speed 1, and reduced motion off. It demonstrates all public node shapes, measured labels, groups, orthogonal connections, highlights, and label replacement. Story names, introductions, and diagram text use English.

The host provides playback, seeking, theme and motion choices, GIF export, JSON downloads, and shareable views. RAG updates measured card sizes and row positions with content changes; its live canvas and SVG fit the current height, while GIF retains authored dimensions. Other stories use fixed playback geometry.

Native, React, and Vue share a dark presentation shell with catalog metrics, category navigation, animated header artwork, and a framed player surface. Decorative motion follows reduced-motion preferences. The site uses `flowsvg-compact` playback controls; playback, presentation selectors, and download/share actions follow the selected theme.

Theme, scene, and speed menus use the SDK's `SelectControl`, including keyboard navigation, confirmation, cancellation, and outside dismissal. The progress slider takes a separate row on narrow screens.

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

The root [GitHub Pages workflow](../../.github/workflows/pages.yml) publishes this host with formal input and the repository deployment base. Enable Pages and satisfy the workflow's visibility condition before deploying. See [Pages setup and verification](../../docs/development/github-pages.md). After the build, the workflow copies four checked-in README gallery GIFs to `dist/previews/` for public hosting. Ordinary host builds omit this deployment step.

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
