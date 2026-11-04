# React host patterns

For host changes, read [shared host maintenance](../../docs/development/showcase-hosts.md). This file owns React-specific constraints.

## Lifecycle

- Use the public `flowsvg/react` adapter. A presentation version is the component key, so React unmount releases the old SDK player before the replacement applies its target time and speed.
- Keep navigation and controls outside the player error boundary. Reset the boundary with the presentation key, guard callbacks by version, and use the saved session target if the public handle cannot be read.
- On `pagehide`, capture the public snapshot, invalidate the version, pause and synchronously unmount. Resume a persisted page with a fresh version and the saved snapshot paused; final exit removes app listeners.
- Keep playback updates inside the adapter; read the public handle at user or lifecycle operations rather than copying the clock into React state.

## Build and acceptance

Preserve the React Vite plugin when changing shared build preparation. Register browser scenarios against real React and the actual SDK. The mount-failure check must verify error-boundary recovery and retry at the saved address time, not only component mounting.
