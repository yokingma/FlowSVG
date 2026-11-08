# Workspace patterns

## Ownership

- Keep complete Latin words in ordinary node and edge labels. Preserve authored font sizes; resolve label crowding through authored spacing rather than automatic font reduction.

- Publish formal demo text in English. Keep stable story IDs, bilingual documentation and SDK multilingual rendering coverage.

- Keep each published unit self-contained. SDK build, tests and release verification use SDK-owned inputs; shared showcase and host delivery have their own checks. Repository boundaries and independent versioning are defined in [repository boundaries](docs/development/repository-split.md).
- Keep structured-content tag text centered inside its decorative background; the shared SDK owns this geometry for every host and export.
- Keep reusable behavior regressions with the SDK and narrative assertions with the shared author package. Retire an obsolete demonstration and its dedicated checks together while retaining generic behavior coverage.
- Preserve licenses, attribution and source identity when moving ownership. Record generated output, programmatic checks, visual inspection and live deployment as distinct evidence.

## Read for the affected branch

- **SDK internals or package delivery:** follow [SDK patterns](packages/flowsvg/PATTERNS.md). Public contracts belong in the SDK guides and package README; maintainer rules retain the implementation reasons and failure cases.
- **Showcase author data or geometry:** follow [author patterns](packages/showcase/PATTERNS.md). Hosts consume generated documents; routing and rendering behavior stays in the SDK.
- **Host lifecycle, presentation or browser acceptance:** follow [shared host maintenance](docs/development/showcase-hosts.md) and the affected app's patterns. Common rules have one owner; app files retain framework-specific constraints.
- **Brand assets or README previews:** follow [brand inputs](docs/brand/README.md) and [preview maintenance](docs/assets/image-previews.md) before regenerating assets.
- **npm publication:** follow the [release guide](docs/development/releasing.md). Verify the exact tarball that will be uploaded; distinguish a prepared source version from a version published on npm.

## Build and verification boundaries

- Keep workspace CLI bin targets in checked-in launchers so a first install can link commands without generated SDK output. Verify cold installation without lifecycle scripts.

- Build selected shared author output and its consumers sequentially: source selection replaces shared generated data. Use the maintained commands in the [showcase verification guide](docs/verification/showcase-verification.md).
- Verify installed-package behavior through the [SDK gate](docs/verification/sdk-verification.md) and copied host artifacts through the showcase gate. A passing source-level test cannot substitute for either delivery boundary.
- Keep shared browser navigation expectations aligned with the complete formal catalog and its category order, including newly selected stories.
- Keep the Pages workflow scoped to deployment inputs, cancel superseded runs and bound build/deploy time so routine documentation pushes do not consume Actions minutes.
- Before completing an executable change, account for every affected owner and record the checks actually run, their results and any unverified environment.
