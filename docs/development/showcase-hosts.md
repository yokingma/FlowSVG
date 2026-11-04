# Shared showcase host maintenance

Read this when changing Native, React or Vue host lifecycle, presentation, addresses, or browser acceptance. Use the affected app's `PATTERNS.md` for framework-specific ordering.

## Inputs and ownership

Hosts consume the public SDK and generated `@flowsvg/showcase/author` catalog. Keep author geometry, categories and narrative in the [shared author package](../../packages/showcase/PATTERNS.md); hosts render catalog groups and introductions without maintaining their own diagram coordinates or source-image drawing.

Use the pure session interface for operation targets and ordered address effects. Defaults, loop retention, query parsing and history semantics are defined in [presentation sessions](../../packages/showcase/README.md#presentation-sessions) and [shareable addresses](../../packages/showcase/README.md#shareable-addresses-and-history). Read SDK state at explicit operations; leave the playback clock inside the SDK.

## Player replacement

When a session transition requires replacement:

1. Capture the SDK's action-time snapshot and compute the transition target.
2. Invalidate callbacks and detach subscriptions belonging to the old presentation version.
3. Pause and destroy or unmount the old player before mounting its replacement.
4. Apply the target time and speed to the replacement while paused.

Completion means one active player, no callbacks from an obsolete version, and a mounted state matching the transition target. Framework-specific unmount scheduling belongs in the app patterns.

Execute history effects in their returned order. Capture a share URL before awaiting clipboard work, and accept completion only for the current request and presentation version. Display a manual-copy URL on clipboard failure. Use page lifecycle events to release listeners and players; a persisted page-cache return restores one listener set and a fresh paused presentation.

## Presentation

- Keep the technical exhibition shell, catalog-derived metrics, category navigation and responsive header consistent across the three hosts.
- Bind playback and host controls to the committed light/dark theme class. Apply theme tokens to the entire player surface, caption, menus, downloads, sharing and manual-copy fields; retain an accent for focus and active states.
- Reuse SDK `styles.css`, `flowsvg-compact` sizing and the public `SelectControl`. Preserve `[hidden]` behavior for empty state and presentation controls. Decorative motion follows the reduced-motion preference.

## Builds and acceptance

Generate the selected author source before app development or builds. Preview serves existing artifacts. Resolve JSON downloads and lazy assets against the explicit deployment base; downloaded JSON contains only the diagram document. Use the [verification guide](../verification/showcase-verification.md) for maintained commands and the [Pages guide](github-pages.md) when changing Native deployment.

Register common scenarios from root browser helpers against real hosts. Test observable controls, error recovery, cancellation, downloads and resources through the public SDK. Copy built artifacts outside the checkout and serve each root/subpath artifact from its own origin. Compare catalog, JSON and representative time/theme/motion SVG states without importing another app's implementation.

Keep extra seek-heavy scenarios in separate pages and close each page afterward: Chromium's 50-entry history limit can evict entries needed by shared Back/Forward checks. Type-check root browser helpers as well as the app bindings.

Before completing a host change, identify affected hosts and scenarios, run their behavior and delivery checks, and record actual results. Confirm each changed story can be selected, navigated and downloaded, and cover formal generation after acceptance selection to detect stale-input leakage.
