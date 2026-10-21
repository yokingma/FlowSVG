# Changelog

## Unreleased

- Center unobstructed orthogonal bridges in node gaps; use one outside channel for matching ports and clear separate ancestor frames. Preserve obstacle search, input slots and arrow approaches.

- Extend stable same-side target positions to curved routes, preserving separate input arrows when an example changes route families.

- Separate same-side orthogonal incoming arrow tips by source position (document order breaks ties), including hidden inputs so timeline reveals keep their slots. Reserve a stroke-width-aware straight approach before each orthogonal arrow where space permits, shrink reserved segments in narrow gaps to avoid backtracking, and keep ellipse/cylinder tips on their contours.

- Add opt-in `ContentTagStyle.shape: "pill"` for capsule tags in SVG and player/export output. Derive the radius from the final aligned tag height; retain the default rounded corners, typography and theme colors. Validate supported shapes at the authored field path.

- Add opt-in `flowsvg-compact` sizing (32-pixel controls; standard remains 44 pixels). Replace scene/speed native selects with the reusable public `SelectControl` combobox, styled options, keyboard preview/commit/cancel, type-ahead and outside dismissal. Release menu listeners on player destruction.

- Refine built-in controls with compact typography, rounded neutral buttons, an accent-tinted Play/Pause action, softer borders and hover/pressed/disabled/focus feedback. Keep 44-pixel targets and native progress keyboard interaction; narrow screens give the progress slider its own row. Respect reduced-motion preferences for control transitions.

- Decoupled SDK tests and browser acceptance from example author data. Preserved parallel-flow, content, geometry and four-host contracts with SDK-owned typed fixtures; moved narrative assertions to a separate example check. Release gates no longer build example apps. Added executable SDK-only Chromium acceptance and dependency auditing.

- Reject asynchronous GIF worker startup failures even while image decoding is pending. Release task resources and permit a subsequent export after a worker error, including browser content security policy rejection.

- Extended release verification to clean-build and install the real tarball with normal dependency lifecycle scripts, strict new-entry declarations, optional Node 18 minimum-runtime checks, and Node 20 public tools. Detached assets exercise offline HTML playback/download and CLI GIF output with independent GIF decoding; package versions, licenses, inline workers and explicit browser preparation are checked.

- Added opt-in offline HTML GIF download with `renderHtml(document, { gifExport: true })` and `--gif-export`. Same-version exporter and inline worker assets join the player only when enabled; default HTML retains playback alone. File URLs need no network, additional runtime installation or sidecar assets.

- Added Node 20+ `exportGif` and GIF CLI options using the same offline browser exporter. Explicitly prepared Chromium can be selected by executable path, or functions can reuse a caller-owned Playwright browser. Runtime automation loads only for GIF tasks; HTML still needs no browser or installed dependencies when copied. Shared preflight validation, input snapshots, progress, aborts and cleanup cover each task. SIGINT/SIGTERM exit nonzero, and HTML/GIF output uses the same atomic, default-no-overwrite publication.

- Added opt-in `gifExport` player controls across native browser, React, Vue and Web Component (`gif-export`). Downloads show progress, cancellation, completion and actionable errors. Each task captures its document/resolved theme, remains independent of playback and document reloads, and is cancelled on destruction or adapter option rebuild. Ordinary ESM playback keeps a real lazy import; base portable player assets exclude the exporter and encoder.

- Completed GIF range, speed, size, frame-rate, caption, loop and motion options with strict runtime validation. Preserve inherited scene state and the representable end-left picture; retain global completion with zero extra hold and cumulative centisecond timing. Measure every effective caption before sampling, preserving newlines and reporting overflow. Reject more than 1801 final encoded frames, including long-hold splits, before resource allocation; loop counts support at most 65,536 total plays.

- Added the independent `flowsvg/export` browser GIF API and copyable `portable/export.js` asset. Inline workers quantize and encode one acknowledged frame at a time; exports snapshot inputs, report progress and support cancellation, including pending font/image preparation. Defaults preserve complete timeline evaluation, system Chinese font fallback, themed opaque captions and an accurate 15 fps timeline with a 1s final hold. Added independent GIF decoding and real offline Chromium checks.

- Added copyable, versioned offline player/CSS assets and licenses, `flowsvg/node` HTML generation (Node 20+) and the `flowsvg` HTML CLI. Generated files safely embed text and work through offline `file://`; playback defaults to paused at zero with controls/captions. CLI publication is atomic and preserves existing files unless explicitly overwritten.

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
