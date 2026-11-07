# Changelog

## Unreleased

- Reject distant pointer hits when a tiny preset contour collapses at a large finite origin.

- Add label-only predefined-process nodes with a rectangular contour and capped decorative side lines.

- Add document report nodes with labels centered above a bounded bottom wave.

- Add diamond decision nodes with safe-area plain-text labels. Existing node kinds retain their label behavior.
- Wrap long decision labels without splitting graphemes; report width and height overflow while clipping visible text to the inner rectangle.
- Export `measureNodeLabel` to reserve a common explicit height for one or more decision labels using the same safe-area layout as playback.
- Attach decision-node edges and pointer hits to the real diamond contour instead of its bounding rectangle.
- Reuse diamond contours and clipped visible label paint for diagnostics; invisible label overflow no longer enlarges fitted height for decision nodes.

## 0.2.3 - 2026-11-06

- Add full-timeline request-response, web-service-deployment and LLM inference showcase GIFs to the package README and npm tarball, rendered at 1.5x speed and 24 fps.

- Forward browser hover, click, and their compatibility aliases from the Web Component so the documented interaction events reach `<flowsvg-player>` listeners.

- Preserve complete Latin words when wrapping ordinary labels. Allow overwide words to exceed the estimated width and use endpoint column widths for purely vertical edge labels without reducing font size. Keep complete Latin words in GIF captions and reject captions when an intact word exceeds the available width.

- Ship the background task lifecycle example and README GIF with English labels and captions. Keep the standalone document and existing task transitions.
- Center decorative tag text inside its rounded or pill background while preserving authored tag rows and dimensions.
- Keep centered text in one SVG text chunk, including mixed-style tag spans. Use actual font advances for horizontal centering instead of estimated span positions.

## 0.2.2 - 2026-10-28

- Add `flowsvg/node.exportPng` with preflight, offline Chromium rasterization, caller browser ownership and late-resource cleanup.

- Reject non-finite accumulated structured-content geometry before evaluation, SVG or on-demand diagnostics expose it. Report `DiagramValidationError` at `typography.nodeLabel`, including overflow from many scaled lines or blocks; keep finite overflow warnings and explicit font-size inheritance.

- Exclude halo-only intersections between normally spaced lines of one ordinary edge label. Retain foreground text conflicts, independent line identities and full halo risks against other labels or nodes.

- Add on-demand `Diagram.diagnoseAt` for edge–node, label–node and label–label risks. Reuse effective camera, typography, content clips and route samples. Match filled contours analytically, retain transparent-fill outlines and provide canonical role/field/line warning identities without adding pair checks to playback.

- Add browser PNG bytes through `flowsvg/export` and portable exports, with exact selected-camera dimensions, optional transparency, cancellation and separate preflight limits. Preserve opaque GIF output while sharing SVG image resource cleanup.
- Add transparent static SVG backgrounds while preserving node fills, edge-label halos and selected camera geometry.
- Add document-level `typography.nodeLabel`, `edgeLabel` and `flowLabel` in diagram units. Resolve omitted roles to 16/14/12 and share text metrics across evaluation, SVG, hit testing and height fitting. Scale omitted structured-content role sizes and `measureNodeContent` by the effective node size while retaining explicit sizes, authored geometry and compiled duration. Capsules follow the flow size, stay decorative and participate in fitted height. Reject invalid or unrepresentable derived metrics with typography field paths.

- Round group borders by default, using the same 8-unit radius as rounded rectangles and reducing it for small groups. Nested and dashed groups share this rendering across players, SVG and GIF exports.

## 0.2.1 - 2026-10-23

- Isolate Node GIF browser execution behind an internal runtime seam. The production path still uses the pinned Playwright Chromium exporter, while task-owned context/page and temporary files are released on success, failure, and cancellation without closing caller-owned browsers. Add deterministic runtime coverage for launch, page-load, encoding, progress-callback, and late resource-acquisition cancellation paths. Contexts, pages, browser launches and temporary directories that finish after cancellation are released even if task disposal already returned.

- Reuse one internal frame-state evaluation for each browser player update and GIF sample. SVG serialization, captions, hover hit testing and edge geometry now consume the same evaluated result without changing the public `Diagram` interface or output behavior. Static GIF documents without titles reuse their empty caption without a second evaluation.

- Share browser-player lifecycle ownership between the React and Vue host adapters. A single internal coordinator now snapshots rebuild options, removes old event listeners before replacing an instance, preserves initial-time and loop semantics, and performs idempotent teardown without changing public adapter contracts.

- Present the background task lifecycle in both SDK READMEs with a brief scenario description and an SDK-exported GIF. Demonstrate structured state cards, pill tags, retries, completion, failure and cancellation.

- Place the animated FlowSVG wordmark first in centered headers in both SDK READMEs. Use larger text inside a compact frame, a closely cropped 50 fps GIF, and a closed signal loop at the upper-right corner. Ship the shared GIF under `docs/images/` and rewrite relative Markdown and HTML image paths to the versioned npm CDN URL during release verification.

## 0.2.0 - 2026-10-22

### Timing and rendering changes

- A beat with one flow now lasts for distance-based movement plus a 500 ms post-arrival interval, replacing authored `durationMs`. Movement targets 180 diagram units/second with a 400 ms minimum. Receiver paint fades in for 200 ms, holds for 100 ms, then automatic node/edge highlights fade out for 200 ms. Explicit highlights retain authored timing; reduced motion skips fades. Multi-flow and no-flow beats retain authored timing. Use the frozen public `Diagram.beats` schedule for effective boundaries and separate no-flow beats for longer reading.
- Orthogonal routes use rounded bends, centered clear bridges, separate stable incoming tips and stroke-aware arrow approaches. Curved inputs also retain stable separate tips. SVG paths, markers, labels, bounds and hit testing share the same geometry.

### Added

- Browser GIF export through `flowsvg/export`, with snapshot inputs, range/speed/dimensions/captions, progress, cancellation, frame limits and an inline encoding worker. Optional player download controls work across Native, React, Vue and Web Component integrations; ordinary playback loads no encoder.
- Node 20+ `flowsvg/node` and CLI for standalone offline HTML and Chromium-based GIF export. HTML can embed optional GIF controls. GIF tasks use explicitly prepared Chromium or a caller-owned browser. Exports clean up task resources; CLI publication is atomic and preserves existing files unless overwrite is explicit. Copyable versioned portable assets include licenses.
- Opt-in live Loop playback and accessible Loop controls across integrations and portable HTML. Preserve elapsed remainder and speed at automatic wraps. GIF repetition remains independent.
- Deterministic DOM-free `measureNodeContent` and public measurement types for fixed-width authoring across explicit content versions. Preserve diagnostics and caller inputs; reject unrepresentable heights with field-path `DiagramValidationError`.
- Optional `viewport.fitHeight: { padding }` fits current painted geometry while retaining authored width and origin. Full-view SVG and playback fit height; GIF retains authored fixed dimensions and scale. Explicit focus retains authored viewport semantics.
- Optional `flow.highlightParticipants: false` suppresses automatic endpoint paint while retaining explicit highlights, edge paint and moving dots/capsules.
- Pill-shaped structured-content tags, reusable public `SelectControl`, opt-in compact controls, keyboard menus, refined control styles and responsive progress layout.

### Fixed and verified

- Reject asynchronous GIF worker startup errors during pending rasterization. Release export resources on errors, cancellation and player destruction, and permit subsequent exports.
- Validate GIF options, effective captions and final encoded-frame limits before resource allocation. Preserve inherited state, range-end pictures and cumulative centisecond timing.
- Preserve content diagnostics for large block collections and avoid fractional-origin false positives in graph-label height checks.
- Keep SDK tests and release gates independent of showcase data. Verify cold packaging, file allowlists, DOM-free imports, strict consumer types, minimum framework versions, all four integrations and real offline HTML/GIF output through the installed tarball.

## 0.1.1 - 2026-10-20

- Adopted thin neutral node borders, gray edges and blue emphasis in both themes. Separate highlight fills from borders and flow markers, remove the node-label halo, and refresh README previews.

- Expanded the quick-start document to a six-node order workflow with authorization, persistence, asynchronous events and reverse responses.

- Added SDK-rendered previews beside the quick-start, structured-content, list, entity-graph and Facts timeline examples in both package READMEs.

- Include the eight README preview images in the npm tarball. Source READMEs use relative image paths for local previews; the release verifier prepares staged README copies with versioned npm CDN URLs for public readers. Release verification requires every preview and rejects undeclared documentation assets.

- Removed local build, source-layout and release instructions from the package READMEs; repository documentation retains the contributor workflow.

- Completed bilingual module navigation, updated migrated test links, and consolidated architecture implementation and verification records.

- Grouped React, Vue, and Web Component implementations under `src/adapters/` while keeping explicit root entries, shared Web Component registration identity, SSR-safe imports, lifecycle behavior, and cross-host integration tests. Updated nested release artifacts and consumer references.

- Grouped the browser player implementation and its controls, accessibility, lifecycle, and SVG DOM modules under `src/browser/` while preserving the `flowsvg/browser` entry, lifecycle behavior, DOM-free imports, and public player contract. Updated browser tests and release allowlists for nested build output.

- Moved shared hexadecimal color interpolation to the pure `src/core/color.ts` module. Timeline evaluation and diagram paint share the same runtime helper; content painting checks contrast without a timeline dependency.

- Centralized edge routing, path sampling, distance queries, label anchors, hit testing, and SVG number formatting in `src/core/edge-geometry.ts` and `src/core/svg-number.ts` while preserving the existing public frames and SVG output.

- Organized the platform-independent core into shared model, document validation and diagram orchestration modules. Preserved all public values/types, error identity and evaluation behavior; grouped core tests with their implementation.
- Preserved nested JavaScript and declaration build output and replaced the release file pattern with an explicit module allowlist that rejects source, tests and unrelated files.

## 0.1.0 - 2026-10-17

- Added a release CLI that runs type checks, SDK and release-script tests, tarball consumer verification, example builds and npm publication preview. Default to preview; require `--publish` for upload, and publish the exact verified tarball retained in `dist/releases/`.

- Require Vue 3.5+ and build its declarations against Vue 3.5.0. Verify strict consumer types and server rendering with minimum supported React 18.0.0 / Vue 3.5.0 as well as current framework releases.

- Prepared the first npm release with repository metadata, public registry settings, bilingual package documentation, automatic prepack builds and prepublish type/test checks.
- Verify packaging from a missing `dist`, every exported JavaScript/type/CSS target, the file allowlist, framework-free imports, strict consumer types and all four host lifecycles.

- Renamed the package and SDK directory to `flowsvg`. Player exports now use the `Flow` prefix: `FlowPlayer`, `FlowPlayerProps`, `FlowPlayerHandle`, `FlowPlayerElement`, `defineFlowPlayer()` and `FLOW_PLAYER_TAG`. The default element is `<flowsvg-player>`; CSS classes and control variables use `flowsvg-` and `--flowsvg-`. Imports, selectors and public API references must use the new names.

- Fixed cylinder SVG fills by rendering the top cap as a separate filled ellipse inside the same node interaction group, so the cap no longer appears hollow.

- Default hover now highlights only borders for all nodes and groups, preserving timeline fill and content paint. Enable background hover with `hoverFill: true` in native/React/Vue integrations or `hover-fill` on the Web Component.

- Added group-boundary edge endpoints and decorative, fixed-coordinate entity graphs inside structured node content.
- Preserve graph selection during parent highlights and report local graph overflow without shifting following content blocks.

- Added shared content-story acceptance through all four hosts, complete bilingual Facts authoring examples and packed NodeContent replacement/clear checks, including Vue handle and cleanup assertions.

- Kept structured-content role colors readable under explicit, flow and browser hover highlights, including intermediate fill transitions. Shared paint preserves authored colors/fills and all text/clip geometry. Added core and DOM regression coverage plus a real-pointer fixture for content/tag hits, clipped bounds, stationary content/mode/size updates, theme reload and destruction.

- Added Facts text tags, multiple tag rows and right-aligned status, shared mixed-font baselines, theme defaults, explicit fill/text provenance, strict nested validation, padded tag geometry and escaped SVG backgrounds. Narrow metadata wraps before body/auxiliary text without resizing nodes.

- Added fixed-node unmarked, bulleted and numbered lists with shared marker columns, wrapped body indentation, optional muted auxiliary text, controlled item styles/spacing, exact nested validation paths and public list indices. Width warnings include reduced body columns, even for right-aligned oversized glyphs. Browser and static SVG reuse the same evaluated lines.

- Added whole `updateNode.value.content` replacement at the beat start, inherited across beats and scenes. Label/content updates switch display modes; `content: null` clears text without restoring historical labels or resizing nodes. Strict validation rejects dual-mode and conflicting beat assignments.

- Added inline text spans with controlled font size, weight and color, shared baselines, per-line heights, public evaluated span geometry, and escaped SVG tspans. Wrapping preserves full Unicode graphemes across source spans, explicit blank lines, English word boundaries, CJK and long URLs without DOM font measurement.

- Added fixed-size content on rounded rectangles and cylinders, with contour clearance before authored padding, current-geometry safe areas during node/group movement and resize, and nonnegative clipping for tiny shapes. Verified that ports, straight/orthogonal/curved routes, focus, and transfers keep their geometry.

- Added initial fixed-size rectangle `content` with ordered titles, paragraphs, auxiliary text, controlled typography/spacing, strict nested validation, evaluated content geometry, safe-area clipping, and directional overflow warnings. Preserved simple-label behavior and added a standalone native example for both themes.

- Preserved collinear cubic reversals in shared geometry so flow distance, hit tests, focus bounds, and labels follow the visible curve. Explicit orthogonal ports now reserve outward endpoint segments and route around endpoint bodies without changing automatic routes. Refreshed public geometry, inherited-state, and reduced-motion JSDoc contracts.

- Replaced the native story with a fixed-view request/response example using curved ports, three-then-two synchronized transfers, dots, text capsules, reverse messages, shared participants, and hover. Added a shared-document integration check through native, Web Component, React, and Vue public controls for both themes and reduced motion.

- Added browser node hover highlights across shapes and nonempty labels, including overflowing wide Unicode glyphs. Hover combines with flow and explicit highlights, follows stationary pointers across frame updates, and clears on leave, cancellation, document replacement, and destruction without changing core frames or SVG exports.
- Rendered optional `flow.text` messages as horizontal text capsules with deterministic Unicode width estimates, escaped SVG text, and decorative pointer behavior. Message text stays local to its beat; omitted text retains the solid dot. Added browser export and theme checks for request/response capsules.

- Verified parallel transfer groups across beats and scenes, including mixed directions, unequal path lengths, shared-node highlights, seeking, playback speed, reduced motion, and final cleanup. Duplicate flow targets are now reported even when another field on the first flow is invalid.

- Added beat-local `flow` actions for deterministic forward or reverse transfer markers on existing edges. Active transfers highlight the edge and both endpoint nodes, respect visibility and reduced-motion options, and are included in static SVG exports.
- Added curved edge routing with automatic or explicit cardinal ports. Curved path geometry is shared by SVG output, labels, focus bounds, hit testing, and deterministic opposite-direction separation; endpoint tangents follow the selected port normals.

- Unified evaluated straight and orthogonal edge geometry for SVG paths, labels, focus bounds, hit testing, and distance-based sampling while preserving the existing public path output.

- Improved SVG readability: edge labels use the longest route segment with a background halo, micro-detour turns are widened when safe, and group borders can render as dashed lines. Refined the native example layout to avoid overlapping nodes and response edges.

- Expanded the native browser example into a five-scene order request story covering authentication, cache/database persistence, asynchronous queue processing, analytics, and response handling. Added focus, dynamic label/style updates, and live playback status.

- Fixed focused SVG backgrounds so they cover offset cameras in both the browser and static exports.
- Matched hit-test priority to SVG paint layers so group backgrounds cannot intercept foreground nodes or edges.
- Attached straight edges to ellipse contours instead of their rectangular bounds.
- Preserved Unicode surrogate pairs when wrapping narrow node and edge labels.
- Kept the React speed prop applied when theme, controls or motion options recreate the player.
- Removed duplicate Vue onError notifications for a single failed document load.
- Prevented duplicate animation loops when playback restarts synchronously from player event listeners.
- Preserved paused and playing Web Component states across visual-option rebuilds instead of reapplying autoplay.
- Gave each exported or mounted SVG its own accessible name without duplicate title ID references.
- Added real React mount, props, playback, reload and unmount assertions to tarball release verification.

- 补充核心、时间线、播放器及框架接入的职责和契约注释，展开密集声明与语句，便于源码阅读及编辑器类型提示。

- Strengthened tarball release verification with a real `<flowsvg-player>` lifecycle smoke test that mounts an object document, plays, reloads, inspects state, removes the element, and confirms cleanup.
- Prepared the public npm package with root, browser, element, Web Component, React, Vue and stylesheet exports, MIT metadata, Node/browser support guidance, performance guidance, and a clean tarball release verification command.
- Added the SSR-safe `flowsvg/vue` entry with typed props, player events, exposed controls, client lifecycle cleanup, document reloads, and optional Vue peer dependency metadata. Added a built-artifact Vue example.

- Added the SSR-safe `flowsvg/react` entry with typed props, event callbacks, an imperative ref handle, client lifecycle cleanup, document reloads, and optional React peer dependency metadata.

- Added interpolated focus cameras with aspect-preserving viewBox snapshots, document-coordinate hit testing, and browser hover/click interaction events that exclude hidden objects.
- Added the explicit `flowsvg` Web Component entry. `defineFlowPlayer()` is SSR-safe and idempotent; the element accepts object or JSON documents, URL sources with stale-request cancellation, autoplay, controls, speed, theme and reduced-motion attributes, forwards typed player events, and tears down on disconnect.
- Added explicit light/dark visual options, fully resolved evaluated styles, self-contained accessible SVG titles and the `flowsvg/styles.css` control stylesheet.
- Added canvas keyboard playback/stepping, visible focus styles, and automatic reduced-motion preference updates with explicit overrides and listener cleanup.

- Added deterministic node and edge visual updates with cubic geometry, numeric style and RGBA color interpolation, immediate label changes, and exact numeric transition endpoints.
- Preserve ordinary styles beneath highlights, recompute nested group geometry and orthogonal routes for every frame, and verify dynamic SVG equality in a real browser.

- Added transactional document reloads, visibility-driven pause, silent idempotent teardown, and responsive aspect-preserving container sizing.
- Verified repeated creation/reloads/destruction, disabled controls, error field paths and event consistency in Chromium.

- Added progress, adjacent beat stepping, scene selection and playback speed controls with synchronized typed timeline events.
- Preserve rendered SVG object elements across frame updates and verify seek/playback/static-export equality in a real browser.

- Added a compiled continuous narrative timeline, inherited scene state, synchronized visibility fades, highlight transitions, and browser play/pause captions.

- Added the platform-independent static diagram compiler, evaluator, and SVG exporter.
- Added the browser `createPlayer` entry and native static example.
- Added nested group coordinate resolution, all first-release node shapes, deterministic label wrapping, and layout overflow warnings.
- Added strict document validation for schema fields, references, timeline values, styles, and actions.
- Restored deterministic orthogonal edge routing with boundary attachments, obstacle avoidance, stable fallback paths, and SVG direction markers after integrating shape and text layout.
