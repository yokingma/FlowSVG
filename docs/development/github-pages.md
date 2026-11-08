# GitHub Pages showcase

> **Document status:** Current entry. The workflow file and app build configuration are the source of truth for deployment behavior. The [showcase verification guide](../verification/showcase-verification.md) describes reproducible checks. Verify the deployed site separately from local build results.

The deployment workflow publishes the Native showcase with the formal catalog selected by [src/formal.ts](../../packages/showcase/src/formal.ts). The default site address is <https://yokingma.github.io/FlowSVG/>; the deployment job reports the resulting URL.

## Enable deployment

The [Pages workflow](../../.github/workflows/pages.yml) builds the Native showcase on relevant pushes to `main` and manual runs. Changes limited to documentation or other files outside the deployment inputs do not start an automatic build. Superseded runs are cancelled, and build/deploy jobs have bounded runtimes. Deployment is enabled for public repositories; private repositories build and upload the artifact but skip deployment.

1. Confirm that GitHub Pages is available for the repository and that the workflow's visibility condition permits deployment.
2. Open **Settings → Pages**.
3. Set **Build and deployment → Source** to **GitHub Actions**.
4. Open **Actions → Deploy showcase to GitHub Pages**.
5. Select **Run workflow** on `main`.
6. After deployment succeeds, open the URL reported by the deployment job.

Later pushes to `main` deploy automatically. Use a manual run to redeploy an existing commit. Repository visibility changes do not trigger the workflow.

The workflow builds the SDK and shared examples, then uploads only `apps/native-example/dist/`. React/Vue sites are built separately. SDK npm publication is independent of site deployment.

`SHOWCASE_BASE` follows the repository name: `/FlowSVG/` for this repository. For a fork, use its repository name; for a custom domain served at the origin root, use `/` and rebuild. Navigation uses query parameters, so shared example links need no server route fallback.

## Reproduce the site locally

Run from the repository root:

```sh
pnpm install --frozen-lockfile
pnpm build
SHOWCASE_SOURCE=dist/formal.js SHOWCASE_BASE=/FlowSVG/ pnpm --filter flowsvg-native-example build
pnpm --filter flowsvg-native-example preview --host 127.0.0.1
```

Open the preview URL with `/FlowSVG/` appended. The preview command serves existing output; it does not rebuild. Deploy only the resulting `apps/native-example/dist/` directory through HTTP or HTTPS.

## Verify a deployment

1. Open the site and compare its available examples and default selection with [src/formal.ts](../../packages/showcase/src/formal.ts).
2. Select RAG, seek, play and pause. Toggle Loop and switch examples.
3. Open a shared example/time link in a new tab, then refresh it. Confirm paused restoration.
4. Download diagram JSON and confirm that its URL remains under `/FlowSVG/json/`.
5. Export a GIF. Check that lazy modules load from the site and the export completes.
6. Check browser errors and failed resource requests. Check a narrow viewport for horizontal overflow.

If deployment fails, inspect the failed Actions job and repository Pages settings. Verify the deployed URL separately from the local build.
