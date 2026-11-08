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

`pnpm release:verify` builds and installs an actual tarball. It checks the file allowlist, public exports, strict consumer types, Native/Web Component/React/Vue lifecycles and offline HTML/GIF tools. The verifier also checks additional exports present in that package version. `pnpm release` adds type and behavior checks and an npm publication preview; uploading requires `pnpm release:publish`.

## Coverage ownership

| Contract | SDK-owned coverage |
| --- | --- |
| Parallel transfers, reverse directions and beat cleanup | Core parallel-flow tests and `tests/fixtures/parallel-transfers.ts` |
| Content replacement, clearing and inherited state | Core node-content timeline tests and `tests/fixtures/content-timeline.ts` |
| Structured text, lists, tags, clipping and SVG parity | Core/browser tests and SDK-owned node-content/list fixtures |
| Mixed preset flow, simultaneous clip isolation, decoded PNG/GIF and disconnected HTML | `examples/mixed-flow.json`, `tests/browser-mixed-flow.html`, `tests/mixed-shape-exports.test.ts` and installed mixed-flow smoke |
| Host lifecycle, reload, options and disposal | Browser tests and `tests/integration/` |
| Real pointer, keyboard and browser behavior | SDK browser regression pages and `tests/sdk-browser.test.ts` |
| Package completeness and installed usage | Release-script tests and installed-tarball verification |

Keep feature-specific boundary and invalid-input cases with the corresponding SDK implementation. Preserve deterministic core tests alongside real browser and installed-package checks; each verifies a different boundary.

## Example verification

Formal showcase narratives and host sites have their own inputs and verification. Use the [showcase verification guide](showcase-verification.md) for those commands. `pnpm test:all` combines SDK and formal example verification explicitly.

Record the actual environment, executed commands, failures and skipped runtime checks for each verification run. A workflow definition or an older passing run does not establish a new platform result. Keep transient logs, screenshots and task reports outside version control.
