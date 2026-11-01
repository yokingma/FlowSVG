# Patterns

- GitHub Pages consumes only this host’s static `dist/`. Select formal input explicitly and build with the repository subpath so scripts, JSON downloads and lazy GIF resources share the same base. Private-repository runs skip deployment. See [Pages deployment](../../docs/development/github-pages.md) for public-repository setup and verification.

- Follow the SDK 500 ms single-flow post-arrival interval: 200 ms receiver fade-in, 100 ms full paint and 200 ms automatic node/edge fade-out. Consume compiled intervals for navigation and sampling; preserve explicit unique-state highlights.

- Follow SDK single-flow movement plus a fixed 500 ms post-arrival interval. Sample compiled intervals for stage checks and navigation; keep longer reading in separate no-flow beats.

- Keep loop as session runtime state, separate from authored visual/speed defaults. Capture the SDK loop choice with time/speed at operations and pass it to each replacement player. History restores address fields but retains the current loop choice; fresh entry defaults off. Let the SDK clock wrap playback.

- Use orthogonal routes for state transitions, order data transformations and deployment topology; keep event labels and group titles clear, with cardinal arrow approaches.

- New category stories enter through the shared catalog only. Verify category membership, scene choices, direct addresses and downloads through the real host, including straight message rows in sequence stories.

- Consume RAG spacing and route changes from shared author data. Regenerate shared output after author edits; preview serves existing artifacts. Check compact content heights and the 50-unit row gaps in desktop/mobile states without introducing host-specific diagram coordinates.

- Render `catalog.groups` with accessible category headings and existing example buttons. Let shared metadata determine grouping and keep navigation selection outside the SDK player.

- Render layered architecture from shared group/parentId author data. Verify the shared 50-unit layer gaps, real nested panels and conditional-path captions without introducing app-specific drawing or source-image loading.

- Consume the architecture story from the shared catalog. Keep SDK/runtime explanations in author data and run the common real-host architecture scenario through each public adapter.

- Add formal stories in the shared author package, then verify selected metadata, scene navigation, direct addresses and downloaded JSON through the real host. Keep narrative data out of app-specific UI; all hosts consume the same generated document.

- Enable `flowsvg-compact` on the showcase ancestor and reuse public `SelectControl` for theme choices. Keep framework bindings limited to mount/render/destroy; keep interaction behavior in the SDK. Route committed theme values through the existing session operation.

- Keep showcase controls visually aligned across native, React and Vue: soft neutral borders, rounded actions, visible focus and reduced-motion-aware feedback. Use SDK `styles.css` for playback controls. Preserve `[hidden]` when assigning layout to presentation and sharing containers.

- The formal single-page entry consumes only the shared author catalog and public browser SDK. Use Vite for app code and copy generated `dist/site` data into the standalone site. Regenerate the selected source before dev/build so a prior acceptance build cannot select formal content.
- Keep one active browser player. Capture current time and speed at the operation, compute a shared session transition, invalidate old callbacks, detach listeners, pause and destroy before mounting the next version. Apply its saved time and speed while paused. Selection resets time/rate but retains visuals; visual updates retain time/rate. Let the SDK own playback, rendering and export cancellation on destroy. A persisted pageshow retries the saved snapshot and restores app listeners; final page exit removes app listeners.
- Resolve generated JSON paths against the explicit Vite deployment base. Download diagram data without showcase metadata; validate the real download with the existing CLI.

- Execute shared address effects in their returned order. Initial and history restoration mount paused and canonicalize with replace only; selection/visual operations save the previous snapshot before push. Do not attach address updates to SDK time/control events.
- Capture the share URL before awaiting clipboard service. Guard completion by the latest request; invalidate it on presentation replacement and page exit. Render clipboard failure text and the manual-copy address as text/input data.
- Attach and detach popstate/share listeners with the page lifecycle. A persisted pageshow restores one set of app listeners and the suspended session; a popstate uses the shared restore operation and the existing versioned cleanup path.

- Share browser acceptance infrastructure under `scripts/showcase-browser-*.ts`. Register the app package name from its acceptance entry; test real static output and SDK DOM boundaries without importing another app.

- Use root `build:examples` for ordered shared preparation across all hosts, and `test:examples` for the complete example flow. Keep individual host scenarios and independent copied-artifact delivery checks complementary; SDK release checks remain separate.

- Consume SDK `Diagram.beats` for effective scene/beat boundaries. Never reconstruct a timeline by summing authored `durationMs`; single-flow movement plus 500 ms replaces authored beat timing. Keep reading time and unique task-state highlights independent of marker arrival.

- Keep the formal site in `src/` and browser acceptance in `acceptance/`. SDK behavior uses independent SDK fixtures; shared author tests own the formal narratives.
