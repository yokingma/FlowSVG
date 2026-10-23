# GitHub Pages showcase

The deployment workflow publishes the Native showcase and its eight formal examples. The intended URL is <https://yokingma.github.io/FlowSVG/>. This URL becomes available after GitHub Pages is enabled and the first deployment succeeds.

## Repository prerequisite

GitHub Pages must be available for the repository. On 2026-10-22, `yokingma/FlowSVG` is private and its owner uses GitHub Free. GitHub rejected Pages setup with HTTP 422: “Your current plan does not support GitHub Pages for this repository.” Publication is pending this prerequisite.

The owner chose to prepare the workflow now and make the repository public later. While the repository remains private, pushes to `main` build and upload the static artifact but skip the deployment job. Changing repository visibility exposes the repository source and history. Publishing the site itself makes the built examples and diagram JSON accessible to site visitors.

## Enable deployment

1. Make `yokingma/FlowSVG` public when ready to publish.
2. Open the repository's **Settings → Pages**.
3. Set **Build and deployment → Source** to **GitHub Actions**.
4. Open **Actions → Deploy showcase to GitHub Pages**.
5. Select **Run workflow**, choose `main`, and start the workflow.
6. Wait for the deployment job to succeed, then open the intended URL above.

The workflow is stored on `main`. Changing repository visibility alone does not trigger it. After setup, later pushes to `main` deploy automatically. Use **Run workflow** on `main` to redeploy without a new commit. A manual run while the repository is private also skips deployment.

The workflow uses Node.js 22 and the pnpm version from `package.json`. It installs the frozen lockfile, builds the SDK, generates the formal author source, builds the Native site, and uploads only `apps/native-example/dist/`. React, Vue, acceptance inputs and historical pages are outside this site. SDK npm publication remains separate.

The workflow sets `SHOWCASE_BASE` from the repository name, producing `/FlowSVG/` here. The site uses query parameters for navigation, so a direct example link needs no server route fallback. Scripts, styles, diagram downloads and lazy GIF resources resolve under that base. A future custom domain at the origin root requires changing the base to `/` before rebuilding.

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

1. Open the site and confirm that all eight example buttons are available.
2. Select RAG, seek, play and pause. Toggle Loop and switch examples.
3. Open a shared example/time link in a new tab, then refresh it. Confirm paused restoration.
4. Download diagram JSON and confirm that its URL remains under `/FlowSVG/json/`.
5. Export a GIF. Check that lazy modules load from the site and the export completes.
6. Check browser errors and failed resource requests. Check a narrow viewport for horizontal overflow.

If deployment fails, inspect the failed Actions job. A Pages configuration or plan error must be resolved in repository/account settings; a local Vite preview does not establish that Pages deployment succeeded.
