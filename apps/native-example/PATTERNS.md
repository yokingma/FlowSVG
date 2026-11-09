# Native host patterns

For host changes, read [shared host maintenance](../../docs/development/showcase-hosts.md). This file owns Native-specific constraints.

## Lifecycle

- Keep one imperative browser player. Native code detaches old listeners, pauses and destroys that player before calling `createPlayer` for a replacement.
- On persisted `pageshow`, retry the saved session target and restore app listeners once. Final page exit removes app listeners and releases the player.
- Keep site code in `src/` and built-site registration in `acceptance/`. Register the Native package against the shared browser scenarios.

## Deployment

For Pages changes, follow [deployment setup and verification](../../docs/development/github-pages.md). Only this host's built artifact is deployed; verify the repository subpath for scripts, JSON downloads and lazy exports separately from a successful build.

- The Pages workflow adds the four checked-in README gallery GIFs under `dist/previews/` after the Native build. Preserve these public URLs when changing deployment; ordinary host builds do not add the gallery assets.
