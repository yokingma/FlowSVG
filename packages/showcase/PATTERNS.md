# Showcase author patterns

Use the relevant sections when changing author inputs, generation or pure session behavior. Host-specific lifecycle rules belong in [shared host maintenance](../../docs/development/showcase-hosts.md).

## Author data and generation

- Write formal names, category labels, introductions and all diagram text in English. Preserve stable IDs when changing language. Use explicit currency codes such as CNY for teaching amounts. Recheck measured stages and route/capsule clearance after wording changes.

- Assign each example one primary category from `SHOWCASE_CATEGORIES`. Derive only populated groups from ordered entries, preserve relative entry order, and keep `defaultId` independent of grouping. Category metadata belongs to the private catalog, not `DiagramDocument`.
- Put complete formal definitions in `src/examples/` and select their order/default in `src/formal.ts`. Keep author definitions self-contained and consume public SDK entries. Use one route family within each example and the SDK default palette; keep complete player defaults explicit.
- For the LLM inference story, distinguish causal prefill from autoregressive decode. Keep each layer state vector tied to its matching token position, make cache reads and appends explicit, and describe circles as position state vectors rather than neurons or weights.
- Keep teaching examples self-contained: distinguish one-time ingestion from online queries, preserve source IDs through selection and answers, label fictional content and avoid presenting illustrative counts as recommended settings. Express request/result ordering as successive beats, and use scene-local node updates for readable intermediate results. Curved routes do not avoid obstacles automatically; verify long input paths against unrelated nodes.
- Use `src/acceptance-empty.ts` for empty-state checks, independently of selected formal content.
- Treat TypeScript as the only author source. Expand variants into complete documents before generation; never maintain JSON manually.
- Keep `author` browser-safe. It imports generated data and the pure immutable-catalog helper. Import SDK types with `import type`; call SDK validation/compilation only through the build-time entry.
- Validate complete author input before replacing generated data. Check JSON representation before SDK compilation so omitted/coerced values cannot pass unnoticed. Derive milliseconds from the compiled SDK duration.
- Keep catalog ordering/default selection explicit. Permit an empty catalog only with a null default. Stable IDs also name JSON files, so validate safe path segments before creating paths.
- Freeze copied data before exposing ordered entries or lookup. Consumers must not merge incomplete defaults or modify shared documents.
- Select acceptance inputs through the same compiled-source generation path as formal author inputs. Keep formal selection explicit and add content only after user selection. App preparation must regenerate the caller-selected source to avoid stale acceptance data.

## Timing and geometry

- Verify full SVG capsule bounds on outside channels after routing changes. Reserve viewport space for both the route and the horizontal capsule width, while keeping authored node geometry stable.
- Measure structured-content nodes at author time with `measureExampleNode`, passing each explicitly authored replacement and reusing that object in scene updates. Keep authored heights as minimums and reject width diagnostics with node context. Write only final geometry into documents; authors remain responsible for placement, group bounds and route clearance when future content increases a height. Keep the task-state story's shared-height policy for its uniform cards.
- For measured task-state cards, author initial and all stage content versions before creating the document. Pass those versions to public `measureNodeContent`, reject unresolved diagnostics, and reuse them for beat updates. Keep measurement metadata outside `DiagramDocument`; write only final dimensions and coordinates. Check complete line boxes and tag backgrounds, then preserve row gaps for event labels and cardinal approaches.
- Assert centered gap bridges when arrow and bend space permit, clear outside channels and reserved straight arrow runs at the evaluated diagram boundary; keep these routing decisions in the SDK rather than author geometry workarounds.
- Use orthogonal routes for state transitions, order data transformations and deployment topology; keep event labels and group titles clear, with cardinal arrow approaches.
- Size each fixed content node for its fullest beat, leaving at most 24 units below the final text baseline/tag inside the safe area. Use compact padding/block gaps, fit group bounds around their children, then place rows/columns. Keep geometry stable during playback for these fixed-size stories; RAG instead updates explicit measured stages. Sample complete routes after compaction.
- Verify shared-input arrow tips and endpoint directions at the evaluated diagram boundary. Let SDK curved/orthogonal routing allocate same-side input positions. Check orthogonal straight approaches separately from cubic tangents; keep story data free of routing workarounds.
- Use semantic node `content` roles for title/body/source hierarchy and lists for intermediate results. Replace the complete content at scene boundaries. Let roles inherit theme/highlight colors; size fixed nodes for the densest state, check overflow and keep paths outside expanded content. Use pill tags for compact stages, record IDs and citations; preserve their reading order when they wrap.
- Use the compiled `Diagram.beats` schedule for author sampling and navigation. The [SDK timeline contract](../../docs/guides/sdk-guide.md#beats-and-actions) owns effective timing; keep extra reading time in separate no-flow beats.

## RAG stages

- For RAG, measure each explicit current-content stage and derive centered row positions with 50-unit gaps between row bounds. Reuse measured stages for initial nodes and update actions. Set content-change beats to `transitionMs: 0`: content switches immediately, so height and position must switch with it. Enable `viewport.fitHeight` with 24-unit bottom padding so playback and SVG follow the current stage. Retain the fullest authored viewport height for fixed GIF dimensions; keep measurement and stage data outside the diagram document.
- Use a compact four/three/three arrangement for RAG: retrieval at middle-right, reranking in the middle, and context/model/answer from left to right on the bottom row. Feed reranking from both sides, keep context below the question, and route index roundtrips outside the rows. Reserve right padding for horizontal capsules. Check complete orthogonal paths, cardinal arrival tangents and moving capsules at every measured stage.

## Formal story semantics

- For task-state event transitions, add an unlabeled `flow` with `highlightParticipants: false` alongside explicit current-state and event highlights. The SDK moves a solid dot without highlighting both endpoint nodes. Do not add flows when switching to an independent task scenario; reduced motion hides dots while preserving the unique current state.
- Keep category stories distinct: one current state with event edges; conserved IDs/counts for data transformations; real nested deployment boundaries; vertically ordered message rows for sequences. Share compact content formatting and retain the original formal default. Keep state-event labels on distinct lanes, and keep topology transfers clear of group titles as well as component bodies.
- Keep 50-unit gaps between the vllm-metal layer boundaries; fit header and bottom insets around compact module cards. Model architecture bands and ownership panels with actual `group` / `parentId` nesting. Connect layer boundaries when the reference describes a stack, rather than inventing an internal execution sequence. Keep source attribution and hardware/configuration conditions in the narrative; use compact semantic content and inherited theme colors inside each panel.
- In architecture stories, label arrows as data or calls and explain runtime/build conditions in captions. Keep platform-independent evaluation separate from DOM playback, optional GIF encoding and Node tools. Show private showcase code as a consumer of public SDK entries.
- Use rounded orthogonal routes for the FlowSVG project architecture. Preserve directed runtime/build-time calls and verify active transfers against every node body when changing route families.

## Presentation sessions and addresses

- Keep loop as session runtime state, separate from authored visual/speed defaults. Capture the SDK loop choice with time/speed at operations and pass it to each replacement player. History restores address fields but retains the current loop choice; fresh entry defaults off. Let the SDK clock wrap playback.
- Export presentation sessions separately from author/build consumption. Session operations consume catalog, current target and an optional action-time snapshot, returning the next version and a replacement decision. Never import DOM, framework, player or global-location code, and never mirror playback frames. Keep null settings for the empty catalog; no-op choices retain resource identity. Hosts own release order, errors and asynchronous task cancellation.
- Keep entry parsing, address serialization and history decisions in the pure session interface. Pass address strings in and return ordered replace/push effects; browser hosts execute history and clipboard services.
- Treat unrelated query tokens and fragments as opaque raw text. Decode only for known-field classification/values; never reserialize the whole query with URLSearchParams. Duplicate decoded known names invalidate that field. Emit decimal-only milliseconds, including tiny fractions, so the parser accepts generated links.
- Capture time/speed at explicit operations. Save the old snapshot before pushing a new target, share with replacement only, and restore with a fresh resource version/default speed. Keep parameter diagnostics after canonical replacement. No playback-driven address writes.

## Delivery checks

- Verify observable author/build contracts and generated documents. Do not add test-only exports or tests that mirror internal module forwarding.
- Generate selected author output once before the three sequential root Vite builds. Keep app-local dev/build preparation for direct commands. Cross-host tests compare observable catalog/default/JSON/SVG results from copied independent artifacts, with formal generation after acceptance to detect stale data.
