# SDK verification

SDK runtime, build, tests and npm package verification use SDK-owned inputs. They require no showcase or app build. Prepare Chromium, system fonts and minimum runtimes as described in the [release guide](../development/releasing.md).

## Commands

Run from the repository root:

```sh
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm --filter flowsvg test:browser
pnpm release:verify
```

`pnpm test` includes SDK behavior and browser regressions, release-script contracts, cold workspace installation and the SDK dependency audit. The installation regression runs pnpm offline without lifecycle scripts or SDK build output and checks that the CLI links without warnings. Browser checks serve SDK-owned fixtures. The dependency audit rejects imports outside the SDK boundary.

`pnpm release:verify` builds and installs an actual tarball. It checks the file allowlist, public exports, strict consumer types, Native/Web Component/React/Vue lifecycles and offline HTML/GIF tools. The verifier also checks label and content measurement, browser and Node PNG export, and the mixed-shape example through installed public entries. `pnpm release` adds type and behavior checks and an npm publication preview; uploading requires `pnpm release:publish`.

The tarball contains the small PNG previews, logo and lifecycle teaching GIF. Release tests reject the four gallery GIFs, which the Pages workflow serves separately. README rewriting preserves their absolute public URLs. Verify deployed gallery bytes through the [Pages checks](../development/github-pages.md#verify-a-deployment) before npm publication; SDK verification does not deploy or fetch the site.

## Coverage ownership

| Contract | SDK-owned coverage |
| --- | --- |
| Own visibility, explicit highlights, simultaneous base updates and exact frame/SVG output | `src/core/own-transitions.test.ts` and immutable `tests/fixtures/own-transitions.ts` |
| Parallel transfers, reverse directions and beat cleanup | Core parallel-flow tests and `tests/fixtures/parallel-transfers.ts` |
| Content replacement, clearing and inherited state | Core node-content timeline tests and `tests/fixtures/content-timeline.ts` |
| Structured text, lists, tags, clipping and SVG parity | Core/browser tests and SDK-owned node-content/list fixtures |
| Mixed preset flow, simultaneous clip isolation, decoded PNG/GIF and disconnected HTML | `examples/mixed-flow.json`, `tests/browser-mixed-flow.html`, `tests/mixed-shape-exports.test.ts` and installed mixed-flow smoke |
| Document emphasis validation, theme fallback, snapshots, hover and offline output | `src/core/emphasis-colors.test.ts`, `src/browser/browser-hover.test.ts`, PNG and offline HTML regressions |
| Host lifecycle, reload, options and disposal | Browser tests and `tests/integration/` |
| Real pointer, keyboard and browser behavior | SDK browser regression pages and `tests/sdk-browser.test.ts` |
| Package completeness and installed usage | Release-script tests and installed-tarball verification |

Keep feature-specific boundary and invalid-input cases with the corresponding SDK implementation. Preserve deterministic core tests alongside real browser and installed-package checks; each verifies a different boundary.

## Own-transition baseline

`tests/fixtures/own-transitions-baseline.json` records public `Diagram.beats`, total duration, validation results and SHA-256 digests of complete frames and SVG strings. The source is the unchanged runtime at commit `5d0715be203a505a8ff9fc7ff930a2cbb6f05757`, evaluated with the SDK-owned combination fixture before contract comments changed. Frame digests hash `JSON.stringify(frame)`; SVG digests hash the exact string. No numeric tolerance or SVG normalization is applied. Readable assertions in the test explain opacity caps, logical versus painted highlights, latest base colors, and beat-start content replacement.

Samples cover both themes and motion options. Times use this document's compiled beat starts and ends, plus opening transition midpoint, completion minus 1 ms, completion, and completion plus 1 ms. Its opening transition lengths are `0, 400, 250, 0, 400, 400` ms. The test queries the recorded samples backward and forward.

To independently verify the record, create a detached worktree at that commit. Copy only the combination fixture, baseline JSON and `own-transitions.test.ts` from the current checkout into their matching SDK paths. Install with `pnpm install --frozen-lockfile --ignore-scripts`, then run `pnpm --filter flowsvg exec vitest run src/core/own-transitions.test.ts` there. Keep its dependencies and build output separate from other worktrees. These checks must pass against the fixed baseline before runtime changes. Do not regenerate expected digests from a candidate implementation. Before changing assertions, prove sensitivity with an isolated reversible mutation, restore the runtime and confirm the test passes again. Preserve full sampled frames, SVG strings, mutation patches and run logs in local task evidence outside version control.

## Example verification

Formal showcase narratives and host sites have their own inputs and verification. Use the [showcase verification guide](showcase-verification.md) for those commands. `pnpm test:all` combines SDK and formal example verification explicitly.

Record the actual environment, executed commands, failures and skipped runtime checks for each verification run. A workflow definition or an older passing run does not establish a new platform result. Keep transient logs, screenshots and task reports outside version control.
