# Package README previews

The PNG files in `packages/flowsvg/docs/images/` show output from the code examples in the [English](../packages/flowsvg/README.md) and [Chinese](../packages/flowsvg/README.zh-CN.md) package READMEs. They were rendered with FlowSVG 0.1.1 and captured in Chrome at one CSS pixel per diagram unit. All eight PNG files are included in the npm tarball; this maintenance note is not packaged.

The previews use the default neutral borders and blue emphasis. The quick-start shows pale blue active nodes and blue message capsules. Facts shows the corresponding light and dark palettes. Refresh all previews when the default theme or line metrics change.

| Image | Source and render settings |
| --- | --- |
| `quick-start.png` | Six-node order workflow, 4400 ms in the response scene, light theme, 960 × 440 viewport |
| `node-content.png` | `service` node, static light theme, 308 × 360 viewport |
| `numbered-list.png` / `numbered-list.zh-CN.png` | Corresponding `steps` block in a rectangle at (24, 24), size 300 × 180, default content style; light theme, 348 × 228 viewport |
| `record-tags.png` | `records` block in the same rectangle and viewport as the numbered list |
| `entity-graph.png` | `entities` block in a rectangle at (24, 24), size 280 × 180, default content style; light theme, 328 × 228 viewport |
| `facts-timeline.png` / `facts-timeline.zh-CN.png` | Corresponding complete Facts document at 0 ms/light and 1000 ms/dark, with reduced motion enabled; two 300 × 480 views below 40-pixel time/theme captions |

To refresh a preview, use the current README code as the input to `createDiagram`. For a standalone content block, wrap the block in the rectangle specified above, with `content: { blocks: [block] }`, no edges and `scenes: []`. Confirm that `evaluateAt` reports no warnings. Render through `diagram.renderSvg`, place the SVG in an HTML document with zero body margin, and capture at the listed viewport size. Facts uses two views side by side, for a total capture size of 600 × 520. Inspect the captured images for clipping and readable text.

Source READMEs use relative paths such as `./docs/images/quick-start.png`, so local Markdown previews can load the PNG files before publication. The release verifier builds and packs the SDK, unpacks that package into a temporary directory, and converts only the staged README copies to URLs such as `https://cdn.jsdelivr.net/npm/flowsvg@0.1.1/docs/images/quick-start.png`. It reads the version from package metadata and repacks without running lifecycle scripts again. The verified release tarball contains these public URLs; source READMEs retain their relative paths. Use `pnpm release` or `pnpm release:verify` to prepare this tarball.

jsDelivr serves the images from the public npm tarball, independently of GitHub repository visibility. These URLs become available after that version is published. Before publication, verify relative image paths in the source and image files in the tarball; after publication, check the CDN images and the npm README. When example code changes, refresh its image and keep the caption's time, theme and wrapper dimensions accurate.
