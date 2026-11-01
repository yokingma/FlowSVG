# Showcase verification

The formal Native, React and Vue sites consume shared author data from `packages/showcase`. Test the built sites and their independent static artifacts. SDK publishing uses its own inputs and does not build these sites.

## Build and verify

Prepare Chromium and fonts as described in the [release guide](../development/releasing.md). Run from the repository root:

```sh
pnpm install --frozen-lockfile
pnpm test:examples
```

The command builds the SDK, selected shared catalog and three hosts in order. It then checks example types, shared author/session contracts, real-host behavior and copied-artifact delivery. Build sequentially because source selection replaces shared generated output.

To run the complete repository verification:

```sh
pnpm test:all
```

## Observable checks

- Verify all eight formal stories, catalog order, defaults, categories and generated JSON.
- Exercise selection, playback, seeking, theme, reduced motion, sharing and browser history through each real host.
- Verify lifecycle failure/retry paths and cancellation of export work when a player is replaced or disposed.
- Copy built artifacts outside the repository and serve separate root and subpath origins. Verify direct entry, refresh, downloads, SVG parity and local lazy assets.
- Check desktop and narrow layouts, keyboard controls and error states. Distinguish generated screenshots from images actually inspected.

App acceptance entry points register shared scenarios from root scripts. Shared author tests own story meaning and geometry; SDK tests own rendering and timeline behavior. Keep app bindings focused on framework lifecycle and public SDK calls.

## Development and delivery

Use `pnpm build:examples` for ordered builds. Individual app `dev` and `build` scripts prepare their selected shared author input. Preview serves existing output and does not rebuild it. Deploy only the selected host's `dist/` artifact, with its explicit deployment base.

Store per-run logs, screenshots and task acceptance reports locally. Current verification methods belong here; versioned behavior changes belong in changelogs.
