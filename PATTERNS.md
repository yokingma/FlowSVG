# Workspace patterns

## SDK and repository boundaries

- Keep SDK validation, rendering, playback, exports, release inputs, and host examples in this repository. The independently versioned Flow SVG Diagram Skill consumes public npm entries; SDK commands never require the Skill checkout. See [repository boundaries](docs/development/repository-split.md).
- Change the Skill SDK baseline only in the Skill repository after independent acceptance. Do not add sibling-directory imports, old-path fallbacks, or floating runtime resolution here.
- Preserve source identity and historical evidence when moving ownership. Run the independent Skill acceptance before cutover, then run SDK, package-consumer, showcase, and host checks. File generation, programmatic checks, actual visual inspection, and unexecuted CI are distinct evidence.

## SDK and showcase maintenance

- Keep runnable SDK README examples self-contained in the npm package. Verify the JSON and preview through the explicit release allowlist; refresh checked-in teaching snapshots at authoring time so SDK release remains independent of the showcase build.

- Keep brand wordmark geometry in `docs/brand/flowsvg-wordmark.html`. Use the same closed path for the frame and SMIL motion, with the loop seam at the open corner marker. Center rendered glyph bounds before generating light/dark static SVGs and the shared package GIF. Use a cropped viewport around the frame and sample paused SVG times at exact 20 ms intervals (50 fps) with 2× pixel density, preserving the 4.8-second cycle without a duplicate endpoint frame. Set the same compact display width in all four READMEs.

- Record prepared SDK versions separately from npm latest. Verify the exact versioned tarball through `pnpm release`; only the explicit publish command uploads it. Keep version changes, final release notes and timing migration guidance together.

- Publish the formal Native showcase through `.github/workflows/pages.yml`. Build the SDK before the host, select `dist/formal.js` explicitly, set the repository-name deployment base, and upload only the host artifact. Skip deployment for private repositories. Keep Pages permissions in the deployment job and keep SDK npm releases independent. Enable Pages before the first deployment and use a manual run when needed; visibility changes alone do not trigger deployment. Confirm live deployment separately from build success.

- Fit optional canvas height in the SDK camera, retaining authored width and origin. Include painted geometry and labels, reject unrepresentable bounds, and keep explicit focus semantics. GIF uses the authored fixed viewport for stable dimensions and scale; never stretch each fitted SVG into a fixed GIF frame.

- Round orthogonal bends in SDK geometry so serialization, flow placement, hit testing and bounds agree. Keep endpoint/arrow runs and obstacle clearance. For RAG, measure each current content version and explicitly update card height and affected row positions together; switch content and geometry immediately so new content never occupies old dimensions. Test exact boundaries and nonmonotonic seeks.

- For fixed-geometry showcase migrations, retain authored heights as minimums and measure explicit initial/replacement content before document creation. Reuse the measured content in playback actions; keep measurement helpers in build-time author modules. Verify group, viewport and route clearance after future content growth.

- Measure node content at authoring time through the public SDK API. Supply all required content versions explicitly, check unresolved diagnostics, and store the resulting fixed dimensions in the diagram document. Reject unrepresentable required heights with version-specific validation errors. Verify complete line boxes and tag backgrounds when checking compact content.

- Keep gap centering and outside-channel clearance in SDK routing. Verify actual example geometry through shared contracts and static/browser previews; do not encode routing offsets in author data.

- Use orthogonal routes for state transitions, order data transformations and deployment topology; keep event labels and group titles clear, with cardinal arrow approaches.

- Cover each formal category through a complete shared author story and the common host/delivery checks. Keep narrative contracts in the author tests, and leave SDK capabilities independent of teaching data.

- For author-only spacing changes, state gaps in SVG units (the rendered pixels scale with the viewport), check actual row/layer bounds, curve clearance and real page states before delivery. Keep narrative stable. When compacting node sizes, validate the fullest content of every beat and keep the new dimensions stable during playback.

- Keep example categories in private showcase metadata. Hosts render shared nonempty groups; SDK documents and playback state do not carry navigation classification.

- Include layered formal stories in the same real-host and copied-artifact checks as other stories; validate nested ownership through generated documents and rendered panels.

- Verify formal stories through real host selection, scene navigation and standalone downloads. Compare representative time/theme/motion SVG states from every root/subpath artifact; keep narrative contracts in the shared author tests.

- SDK commands operate on `packages/flowsvg` and SDK-owned regression inputs. Keep example delivery out of SDK test and release prerequisites. Use `test:all` to combine the independent flows explicitly.
- Build examples sequentially: SDK, selected shared author output, native, React, then Vue. Root orchestration invokes Vite after shared generation; individual app dev/build commands prepare shared output themselves. Concurrent source selections in one checkout can overwrite shared generated data.
- Run additional seek-heavy scenarios in a separate page and close it after the scenario. Chromium caps page history at 50 entries; shared navigation must leave room for Back/Forward assertions.
- Keep common browser scenarios in root scripts and register them against real hosts. Delivery acceptance copies each built artifact outside the repository and serves only that artifact from its own origin and explicit base. Test user-visible controls, actual downloads and resource responses; do not create application test-only exports or duplicate SDK rendering/encoding.
- Type-check showcase browser infrastructure through `tsconfig.showcase.json`. Shared modules and app source retain their own strict type-check commands. New checks supplement existing host, story and SDK contracts.

- Use rounded orthogonal routes for the FlowSVG project architecture. Preserve directed runtime/build-time calls and verify active transfers against every node body when changing route families.

## Public repository inputs

- Keep SDK behavior fixtures in the SDK and formal example data in the shared showcase. Verify SDK and example flows independently, then combine them through `test:all`.
- Keep temporary plans, task logs and screenshots under the ignored `.scratch/` directory. Public documentation must explain current behavior without requiring local task records.
- Keep source provenance, licenses and reproducible verification methods with maintained inputs. Retire obsolete demonstration pages and their dedicated narrative checks together.
