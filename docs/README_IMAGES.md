# SDK documentation previews

The PNG files in `packages/flowsvg/docs/images/` show output from the code examples in the [English](SDK-GUIDE.md) and [Chinese](SDK-GUIDE.zh-CN.md) SDK guides. They were rendered with FlowSVG 0.1.1 and captured in Chrome at one CSS pixel per diagram unit. All eight PNG files are included in the npm tarball; this maintenance note is not packaged.

The previews use the default neutral borders and blue emphasis. The quick-start shows pale blue active nodes and blue message capsules. Facts shows the corresponding light and dark palettes. Refresh all previews when the default theme or line metrics change.

## Typical SDK example

Both SDK READMEs embed `docs/images/job-lifecycle.gif`. Its complete input is shipped as `packages/flowsvg/examples/job-lifecycle.json`, a checked-in snapshot of the formal background task lifecycle document. The JSON has no showcase metadata or runtime dependency on the private showcase package. It presents three independent tasks: A retries and completes, B exhausts its retries, and C is cancelled while queued. Explicit state highlights and `flow.highlightParticipants: false` keep exactly one state current during event movement.

To refresh the snapshot after an intentional story change, build the SDK and shared showcase, then copy `packages/showcase/dist/site/json/job-lifecycle.json` to the SDK example path. SDK build and release consume the checked-in JSON without running that author build. Measure all content versions and check warnings, unique current states and terminal-state boundaries before regenerating the preview.

Generate the GIF with the current SDK's Node exporter: light theme, width 868, 20 fps, captions enabled with the default 80-pixel region, infinite repetition, and 1500 ms final hold. The authored viewport is 868 × 416; the encoded GIF is 868 × 496. Read effective timing from `createDiagram(document).beats`; the current timeline lasts about 14.610 seconds. Optimize the exported GIF without changing its decoded pixels or timing, then inspect retry, completion, failure and cancellation frames. Keep the JSON and GIF in the explicit release allowlists. Verify the installed JSON with the offline-player command in both SDK READMEs.

## SDK guide PNGs

| Image | Source and render settings |
| --- | --- |
| `quick-start.png` | Six-node order workflow at the midpoint of the compiled final beat (`response:0`), light theme, 960 × 440 viewport |
| `node-content.png` | `service` node, static light theme, 308 × 360 viewport |
| `numbered-list.png` / `numbered-list.zh-CN.png` | Corresponding `steps` block in a rectangle at (24, 24), size 300 × 180, default content style; light theme, 348 × 228 viewport |
| `record-tags.png` | `records` block in the same rectangle and viewport as the numbered list |
| `entity-graph.png` | `entities` block in a rectangle at (24, 24), size 280 × 180, default content style; light theme, 328 × 228 viewport |
| `facts-timeline.png` / `facts-timeline.zh-CN.png` | Corresponding complete Facts document at 0 ms/light and 1000 ms/dark, with reduced motion enabled; two 300 × 480 views below 40-pixel time/theme captions |

For the quick-start, read the final interval from `diagram.beats` and render at `(beat.startMs + beat.endMs) / 2`. With the current guide document, this is approximately 5877.454 ms. Recompute the midpoint when document geometry or SDK timing changes.

To refresh a preview, use the current guide code as the input to `createDiagram`. For a standalone content block, wrap the block in the rectangle specified above, with `content: { blocks: [block] }`, no edges and `scenes: []`. Confirm that `evaluateAt` reports no warnings. Render through `diagram.renderSvg`, place the SVG in an HTML document with zero body margin, and capture at the listed viewport size. Facts uses two views side by side, for a total capture size of 600 × 520. Inspect the captured images for clipping and readable text.

The repository guides use relative image paths into `packages/flowsvg/docs/images/` for local previews. The PNG files remain included in the npm artifact. The package also includes `docs/images/flowsvg-wordmark.gif`, which is used by the root and SDK READMEs as the animated brand mark and is generated from `docs/brand/flowsvg-wordmark.html`. The concise package READMEs no longer embed the detailed preview gallery. The root and SDK READMEs place the animated logo first in a centered HTML header. The release verifier converts relative Markdown image paths and HTML `<img src="./docs/images/…">` paths to versioned npm CDN URLs only in staged package README copies. Source READMEs retain relative paths. Run `pnpm release` or `pnpm release:verify` after README changes to regenerate the verified tarball.

jsDelivr serves the images from the public npm tarball, independently of GitHub repository visibility. These URLs become available after that version is published. Before publication, verify relative image paths in the source and image files in the tarball; after publication, check any CDN image links in the npm README. When example code changes, refresh its image and keep the caption's time, theme and wrapper dimensions accurate.
