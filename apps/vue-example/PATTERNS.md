# Vue host patterns

For host changes, read [shared host maintenance](../../docs/development/showcase-hosts.md). This file owns Vue-specific constraints.

## Lifecycle

- Use the public component and handle from `flowsvg/vue`. Keep document, visual settings and ordered address effects in the shared session interface.
- Give each presentation version a keyed boundary. Clear the presented target and await `nextTick` before mounting its replacement: `initialTimeMs` applies once per component lifetime. Framework unmount owns SDK cleanup; the exposed handle has no destroy method.
- Catch descendant mount exceptions with `onErrorCaptured`, render no failed subtree, and preserve navigation. Version guards keep obsolete handles and errors from changing the current page; retry uses the saved session target.
- On `pagehide`, pause and unmount. A persisted `pageshow` remounts the saved snapshot paused; final exit removes browser listeners.

## Build and acceptance

Resolve the workspace SDK's built exports and copy generated site JSON through Vite's `publicDir`. Keep page markup/styles local to this app. The Vue-specific browser check must verify that descendant mount failure causes no unhandled page error and that retry restores the saved target.
