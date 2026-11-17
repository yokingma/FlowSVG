import { spawnSync } from "node:child_process";
import { copyFileSync, mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const FIXTURE_PREFIX = "flowsvg release test ";
const FIXTURE_VERSION = "0.1.0";
const FIXTURE_COMMIT = "a".repeat(40);
const FIXTURE_REPOSITORY = "example/flowsvg";
const FIXTURE_RELEASE_NOTES = "- Publish the verified SDK artifact.\n";
const PREVIEW_IMAGES = [
  "docs/images/quick-start.png", "docs/images/node-content.png",
  "docs/images/numbered-list.png", "docs/images/numbered-list.zh-CN.png",
  "docs/images/record-tags.png", "docs/images/entity-graph.png",
  "docs/images/facts-timeline.png", "docs/images/facts-timeline.zh-CN.png", "docs/images/flowsvg-wordmark.gif",
  "docs/images/job-lifecycle.gif"
];
const GALLERY_GIFS = ["basic-shapes.gif", "request-response.gif", "web-service-deployment.gif", "llm-inference.gif"];
const GALLERY_URL = "https://yokingma.github.io/FlowSVG/previews/";
const EXAMPLE_FILES = ["examples/job-lifecycle.json", "examples/decision-branch.json", "examples/report-generation.json", "examples/subprocess-call.json", "examples/input-output.json", "examples/mixed-flow.json", "examples/create-mixed-flow.mjs"];
const fixtures: string[] = [];

interface Invocation {
  command: string;
  args: string[];
}

function writeGitFixture(binaries: string, record: string): void {
  writeFileSync(join(binaries, "git"), `#!${process.execPath}\n${record}
    const failure = process.env.TEST_RELEASE_FAILURE;
    const commit = ${JSON.stringify(FIXTURE_COMMIT)};
    if (args[0] === "remote") {
      const origin = failure === "wrong-origin" ? "https://gitlab.com/example/flowsvg.git" : "https://github.com/${FIXTURE_REPOSITORY}.git";
      console.log("origin\\t" + origin + " (fetch)\\norigin\\t" + origin + " (push)");
    }
    if (args[0] === "status" && failure === "dirty") console.log(" M changed.ts");
    if (args[0] === "rev-parse") console.log(failure === "head-moved" ? "b".repeat(40) : commit);
    if (args[0] === "ls-remote" && args.includes("refs/heads/main")) {
      console.log((["unpushed", "head-moved"].includes(failure) ? "b".repeat(40) : commit) + "\\trefs/heads/main");
    }
    if (args[0] === "ls-remote" && args.includes("refs/tags/v${FIXTURE_VERSION}") && process.env.TEST_GITHUB_STATE) {
      console.log((process.env.TEST_GITHUB_STATE === "wrong-tag" ? "b".repeat(40) : commit) + "\\trefs/tags/v${FIXTURE_VERSION}");
    }
  `, { mode: 0o755 });
}

function writeGitHubFixture(binaries: string, record: string): void {
  writeFileSync(join(binaries, "gh"), `#!${process.execPath}\n${record}
    const failure = process.env.TEST_RELEASE_FAILURE;
    if (args[0] === "auth" && failure === "github-auth") process.exit(9);
    if (args[0] === "api" && args[1].includes("/releases/tags/")) {
      if (failure === "github-query") { console.error("Forbidden (HTTP 403)"); process.exit(1); }
      if (!process.env.TEST_GITHUB_STATE || process.env.TEST_GITHUB_STATE === "wrong-tag") {
        console.error("Not Found (HTTP 404)"); process.exit(1);
      }
      console.log(JSON.stringify({ tag_name: "v${FIXTURE_VERSION}", draft: process.env.TEST_GITHUB_STATE === "draft", prerelease: false }));
    } else if (args[0] === "api") console.log(failure === "github-permission" ? "false" : "true");
    if (args[0] === "release" && args[1] === "create") {
      if (failure === "github-create") process.exit(9);
      fs.copyFileSync(args[args.indexOf("--notes-file") + 1], path.join(path.dirname(__dirname), "github-notes.md"));
      console.log("https://github.com/${FIXTURE_REPOSITORY}/releases/tag/v${FIXTURE_VERSION}");
    }
  `, { mode: 0o755 });
}

function writePackageManagerFixture(binaries: string, record: string): void {
  for (const command of ["pnpm", "npm"]) {
    writeFileSync(join(binaries, command), `#!${process.execPath}\n${record}
      const failure = process.env.TEST_RELEASE_FAILURE;
      if (args.includes(failure) || (failure === "example" && args.includes("build")) ||
          (failure === "preview" && args.includes("--dry-run"))) process.exit(9);
      if (args[0] === "whoami") console.log("release-user");
      if (args[0] === "publish" && !fs.existsSync(args[1])) process.exit(10);
      if (failure === "upload" && args[0] === "publish" && !args.includes("--dry-run")) process.exit(9);
      if (args[0] === "view") {
        if (failure === "registry-pending") {
          const pending = path.join(path.dirname(__dirname), "registry-pending");
          if (!fs.existsSync(pending)) { fs.writeFileSync(pending, "pending"); console.error("npm error code E404"); process.exit(1); }
        }
        const integrity = require("node:crypto").createHash("sha512").update("verified artifact").digest("base64");
        console.log(JSON.stringify(failure === "registry-mismatch" ? "sha512-mismatch" : "sha512-" + integrity));
      }
    `, { mode: 0o755 });
  }
}

function createFixture() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), FIXTURE_PREFIX)));
  fixtures.push(root);
  const scripts = join(root, "scripts");
  const binaries = join(root, "bin");
  const packageDir = join(root, "packages", "flowsvg");
  const log = join(root, "commands.jsonl");
  for (const path of [scripts, binaries, packageDir]) mkdirSync(path, { recursive: true });
  copyFileSync(new URL("./release.mjs", import.meta.url), join(scripts, "release.mjs"));
  copyFileSync(new URL("./github-release.mjs", import.meta.url), join(scripts, "github-release.mjs"));
  writeFileSync(join(packageDir, "package.json"), JSON.stringify({
    name: "flowsvg", version: FIXTURE_VERSION,
    repository: { type: "git", url: `git+https://github.com/${FIXTURE_REPOSITORY}.git` }
  }));
  writeFileSync(join(packageDir, "CHANGELOG.md"), `# Changelog\n\n## ${FIXTURE_VERSION} - 2026-11-17\n\n${FIXTURE_RELEASE_NOTES}\n## 0.0.9 - 2026-11-01\n\n- Earlier changes.\n`);
  const record = `
    const fs = require("node:fs");
    const path = require("node:path");
    const args = process.argv.slice(2);
    const command = path.basename(process.argv[1]);
    fs.appendFileSync(${JSON.stringify(log)}, JSON.stringify({ command, args }) + "\\n");
  `;
  writePackageManagerFixture(binaries, record);
  writeGitFixture(binaries, record);
  writeGitHubFixture(binaries, record);
  writeFileSync(join(scripts, "verify-release.mjs"), `
    import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
    import { join } from "node:path";
    const args = process.argv.slice(2);
    appendFileSync(${JSON.stringify(log)}, JSON.stringify({ command: "verify", args }) + "\\n");
    if (process.env.TEST_RELEASE_FAILURE === "verify") process.exit(9);
    const output = args[args.indexOf("--pack-destination") + 1];
    mkdirSync(output, { recursive: true });
    writeFileSync(join(output, "flowsvg-${FIXTURE_VERSION}.tgz"), "verified artifact");
  `);
  return { root, binaries, log };
}

function executeFixture(fixture: ReturnType<typeof createFixture>, args: string[] = [], failure?: string, githubState?: string) {
  const result = spawnSync(process.execPath, [join(fixture.root, "scripts", "release.mjs"), ...args], {
    cwd: tmpdir(),
    encoding: "utf8",
    env: { ...process.env, PATH: `${fixture.binaries}:${process.env.PATH}`, TEST_RELEASE_FAILURE: failure, TEST_GITHUB_STATE: githubState }
  });
  let calls: Invocation[] = [];
  try {
    calls = readFileSync(fixture.log, "utf8").trim().split("\n").filter(Boolean).map((line) => JSON.parse(line) as Invocation);
  } catch (error) {
    if (!(error instanceof Error) || !("code" in error) || error.code !== "ENOENT") throw error;
  }
  return { ...fixture, ...result, calls };
}

function runFixture(args: string[] = [], failure?: string, githubState?: string) {
  return executeFixture(createFixture(), args, failure, githubState);
}

afterEach(() => {
  for (const fixture of fixtures.splice(0)) rmSync(fixture, { recursive: true, force: true });
});

describe("release CLI", () => {
  it("defaults to a preview without authentication and retains the verified artifact in a path with spaces", () => {
    const result = runFixture([], "whoami");
    expect(result.status, result.stderr).toBe(0);
    const publishes = result.calls.filter(({ args }) => args[0] === "publish");
    expect(publishes).toHaveLength(1);
    expect(publishes[0]?.args).toContain("--dry-run");
    expect(result.calls.some(({ args }) => args[0] === "whoami")).toBe(false);
    expect(result.calls.filter(({ command }) => command === "gh" || command === "git")).toEqual([]);
    const artifact = join(result.root, "dist", "releases", "flowsvg-0.1.0.tgz");
    expect(publishes[0]?.args[1]).toBe(artifact);
    expect(readFileSync(artifact, "utf8")).toBe("verified artifact");
  });

  it("verifies the SDK without invoking showcase builds", () => {
    const result = runFixture([], "example");
    expect(result.status, result.stderr).toBe(0);
    expect(result.calls.filter(({ args }) => args.includes("build"))).toEqual([]);
  });

  it("uploads the same verified tarball only when --publish is explicit", () => {
    const result = runFixture(["--publish"]);
    expect(result.status, result.stderr).toBe(0);
    expect(result.calls[0]?.args[0]).toBe("whoami");
    const publishes = result.calls.filter(({ args }) => args[0] === "publish");
    expect(publishes).toHaveLength(2);
    expect(publishes[0]?.args).toContain("--dry-run");
    expect(publishes[1]?.args).not.toContain("--dry-run");
    expect(publishes[1]?.args[1]).toBe(publishes[0]?.args[1]);
    expect(publishes[1]?.args).toContain("--registry=https://registry.npmjs.org/");
  });

  it("creates a GitHub Release for the exact commit only after confirming the published npm artifact", () => {
    const result = runFixture(["--publish"]);
    expect(result.status, result.stderr).toBe(0);
    const created = result.calls.find(({ command, args }) => command === "gh" && args[0] === "release" && args[1] === "create");
    expect(created?.args).toEqual(expect.arrayContaining([
      `v${FIXTURE_VERSION}`, FIXTURE_COMMIT, `github.com/${FIXTURE_REPOSITORY}`
    ]));
    expect(created?.args).not.toContain(join(result.root, "dist", "releases", "flowsvg-0.1.0.tgz"));
    const uploadedIndex = result.calls.findIndex(({ command, args }) => command === "npm" && args[0] === "publish" && !args.includes("--dry-run"));
    const confirmedIndex = result.calls.findIndex(({ command, args }) => command === "npm" && args[0] === "view");
    const createdIndex = result.calls.findIndex((call) => call === created);
    expect(confirmedIndex).toBeGreaterThan(uploadedIndex);
    expect(createdIndex).toBeGreaterThan(confirmedIndex);
    expect(readFileSync(join(result.root, "github-notes.md"), "utf8")).toBe(FIXTURE_RELEASE_NOTES);
  });

  it("retries GitHub publication from saved source and notes without uploading npm again", () => {
    const failed = runFixture(["--publish"], "github-create");
    expect(failed.status).not.toBe(0);
    expect(failed.stderr).toContain("pnpm release:github");
    writeFileSync(join(failed.root, "packages", "flowsvg", "CHANGELOG.md"), "# Later source changes\n");
    const retried = executeFixture(failed, ["--github-only"], "head-moved");
    expect(retried.status, retried.stderr).toBe(0);
    const calls = retried.calls.slice(failed.calls.length);
    expect(calls.filter(({ command, args }) => command === "npm" && args[0] === "publish")).toEqual([]);
    expect(calls.filter(({ command }) => command === "pnpm" || command === "verify")).toEqual([]);
    const created = calls.find(({ command, args }) => command === "gh" && args[0] === "release" && args[1] === "create");
    expect(created?.args).toContain(FIXTURE_COMMIT);
    expect(readFileSync(join(retried.root, "github-notes.md"), "utf8")).toBe(FIXTURE_RELEASE_NOTES);
  });

  it("rejects a version tag on a different commit before uploading npm", () => {
    const result = runFixture(["--publish"], undefined, "wrong-tag");
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("different commit");
    expect(result.calls.filter(({ command, args }) => command === "npm" && args[0] === "publish")).toEqual([]);
    expect(result.calls.filter(({ command, args }) => command === "gh" && args[0] === "release")).toEqual([]);
  });

  it("keeps an already published GitHub Release unchanged when retrying", () => {
    const published = runFixture(["--publish"]);
    expect(published.status, published.stderr).toBe(0);
    const retried = executeFixture(published, ["--github-only"], undefined, "existing");
    expect(retried.status, retried.stderr).toBe(0);
    const calls = retried.calls.slice(published.calls.length);
    expect(calls.filter(({ command, args }) => command === "gh" && args[0] === "release")).toEqual([]);
    expect(calls.filter(({ command, args }) => command === "npm" && args[0] === "publish")).toEqual([]);
    expect(retried.stdout).toContain("already exists");
  });

  it("waits for the npm registry to expose a newly accepted package before creating the GitHub Release", () => {
    const result = runFixture(["--publish"], "registry-pending");
    expect(result.status, result.stderr).toBe(0);
    expect(result.calls.filter(({ command, args }) => command === "npm" && args[0] === "view")).toHaveLength(2);
    expect(result.calls.filter(({ command, args }) => command === "gh" && args[0] === "release" && args[1] === "create")).toHaveLength(1);
  });

  it("preserves the first release record if publication is attempted again", () => {
    const first = runFixture(["--publish"], "github-create");
    expect(first.status).not.toBe(0);
    const recordPath = join(first.root, "dist", "releases", "flowsvg-0.1.0.tgz.release.json");
    const original = readFileSync(recordPath, "utf8");
    writeFileSync(join(first.root, "packages", "flowsvg", "CHANGELOG.md"), `## ${FIXTURE_VERSION} - 2026-11-17\n\n- Later changes.\n`);
    const repeated = executeFixture(first, ["--publish"], "head-moved");
    expect(repeated.status).not.toBe(0);
    expect(repeated.stderr).toContain("pnpm release:github");
    expect(readFileSync(recordPath, "utf8")).toBe(original);
    const calls = repeated.calls.slice(first.calls.length);
    expect(calls.filter(({ command, args }) => command === "npm" && args[0] === "publish" && !args.includes("--dry-run"))).toEqual([]);
    expect(calls.filter(({ command }) => command === "verify" || command === "pnpm")).toEqual([]);
  });

  it("recovers from the saved npm integrity even if a later preview replaced the local tarball", () => {
    const failed = runFixture(["--publish"], "github-create");
    expect(failed.status).not.toBe(0);
    writeFileSync(join(failed.root, "dist", "releases", "flowsvg-0.1.0.tgz"), "a later preview artifact");
    const retried = executeFixture(failed, ["--github-only"]);
    expect(retried.status, retried.stderr).toBe(0);
    const calls = retried.calls.slice(failed.calls.length);
    expect(calls.filter(({ command, args }) => command === "npm" && args[0] === "publish")).toEqual([]);
    expect(calls.filter(({ command, args }) => command === "gh" && args[0] === "release" && args[1] === "create")).toHaveLength(1);
  });

  it.each(["github-auth", "github-permission", "dirty", "unpushed"])(
    "rejects a failed %s precondition before verifying or publishing the package", (failure) => {
      const result = runFixture(["--publish"], failure);
      expect(result.status).not.toBe(0);
      expect(result.calls.filter(({ command }) => command === "pnpm" || command === "verify")).toEqual([]);
      expect(result.calls.filter(({ command, args }) => command === "npm" && args[0] === "publish")).toEqual([]);
      expect(result.calls.filter(({ command, args }) => command === "gh" && args[0] === "release")).toEqual([]);
    }
  );

  it.each([
    ["registry-mismatch", undefined], ["github-query", undefined], [undefined, "draft"]
  ])("does not create a Release after a registry or GitHub conflict: %s %s", (failure, githubState) => {
    const result = runFixture(["--publish"], failure, githubState);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("pnpm release:github");
    expect(result.calls.filter(({ command, args }) => command === "npm" && args[0] === "publish" && !args.includes("--dry-run"))).toHaveLength(1);
    expect(result.calls.filter(({ command, args }) => command === "gh" && args[0] === "release")).toEqual([]);
  });

  it.each([
    ["0.2.0-rc.1", `## 0.2.0-rc.1 - 2026-11-17\n\n- Preview.\n`],
    [FIXTURE_VERSION, "## Unreleased\n\n- Undated changes.\n"],
    [FIXTURE_VERSION, `## ${FIXTURE_VERSION} - 2026-11-17\n\n## 0.0.9 - 2026-11-01\n\n- Earlier changes.\n`]
  ])("requires a stable version and matching nonempty dated notes: %s %s", (version, notes) => {
    const fixture = createFixture();
    const metadataPath = join(fixture.root, "packages", "flowsvg", "package.json");
    const metadata = JSON.parse(readFileSync(metadataPath, "utf8")) as Record<string, unknown>;
    writeFileSync(metadataPath, JSON.stringify({ ...metadata, version }));
    writeFileSync(join(fixture.root, "packages", "flowsvg", "CHANGELOG.md"), notes);
    const result = executeFixture(fixture, ["--publish"]);
    expect(result.status).not.toBe(0);
    expect(result.calls.filter(({ command }) => command === "verify" || command === "pnpm")).toEqual([]);
    expect(result.calls.filter(({ command, args }) => command === "npm" && args[0] === "publish")).toEqual([]);
    expect(result.calls.filter(({ command, args }) => command === "gh" && args[0] === "release")).toEqual([]);
  });

  it("rejects a saved release record for another repository without remote operations", () => {
    const failed = runFixture(["--publish"], "github-create");
    expect(failed.status).not.toBe(0);
    const recordPath = join(failed.root, "dist", "releases", "flowsvg-0.1.0.tgz.release.json");
    const record = JSON.parse(readFileSync(recordPath, "utf8")) as Record<string, unknown>;
    writeFileSync(recordPath, JSON.stringify({ ...record, repository: "another/repository" }));
    const retried = executeFixture(failed, ["--github-only"]);
    expect(retried.status).not.toBe(0);
    expect(retried.stderr).toContain("does not match this package");
    expect(retried.calls.slice(failed.calls.length)).toEqual([]);
  });

  it("checks origin before GitHub queries during publication and recovery", () => {
    const result = runFixture(["--publish"], "wrong-origin");
    expect(result.status).not.toBe(0);
    expect(result.calls.filter(({ command }) => command === "gh")).toEqual([]);
    const failed = runFixture(["--publish"], "github-create");
    expect(failed.status).not.toBe(0);
    const retried = executeFixture(failed, ["--github-only"], "wrong-origin");
    expect(retried.status).not.toBe(0);
    expect(retried.calls.slice(failed.calls.length).filter(({ command }) => command === "gh")).toEqual([]);
  });

  it("does not query npm or create a Release if the npm upload fails", () => {
    const result = runFixture(["--publish"], "upload");
    expect(result.status).not.toBe(0);
    expect(result.stderr).not.toContain("npm upload completed");
    expect(result.calls.filter(({ command, args }) => command === "npm" && args[0] === "view")).toEqual([]);
    expect(result.calls.filter(({ command, args }) => command === "gh" && args[0] === "release")).toEqual([]);
    const recordPath = join(result.root, "dist", "releases", "flowsvg-0.1.0.tgz.release.json");
    expect(JSON.parse(readFileSync(recordPath, "utf8"))).toMatchObject({ commit: FIXTURE_COMMIT });
  });

  it.each(["whoami", "typecheck", "test", "verify", "preview"])(
    "does not upload after a failed %s check",
    (failure) => {
      const result = runFixture(["--publish"], failure);
      expect(result.status).not.toBe(0);
      expect(result.calls.filter(({ args }) => args[0] === "publish" && !args.includes("--dry-run"))).toEqual([]);
    }
  );

  it.each([["--unknown"], ["--publish", "--dry-run"], ["--publish", "--publish"]])(
    "rejects invalid arguments before running commands: %j",
    (...args) => {
      const result = runFixture(args);
      expect(result.status).not.toBe(0);
      expect(result.calls).toEqual([]);
    }
  );

  it("shows help without running release commands", () => {
    const result = runFixture(["--help"]);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("--publish");
    expect(result.calls).toEqual([]);
  });
});

// Exercise the real verifier CLI up to installation; fixtures never invoke npm or the network.
function verifyPackedFiles(extraFiles: string[], omittedFiles: string[] = []) {
  const fixture = createFixture();
  copyFileSync(new URL("./verify-release.mjs", import.meta.url), join(fixture.root, "scripts", "verify-release.mjs"));
  writeFileSync(join(fixture.root, "packages", "flowsvg", "package.json"), JSON.stringify({ name: "flowsvg", version: FIXTURE_VERSION, exports: {} }));
  const documents = ["package.json", "README.md", "README.zh-CN.md", "CHANGELOG.md", "PATTERNS.md", "LICENSE"];
  const portableFiles = [
    "dist/portable/export.js", "dist/portable/LICENSE.gifenc.txt", "dist/portable/player.js", "dist/portable/styles.css", "dist/portable/manifest.json",
    "dist/portable/LICENSE.flowsvg.txt", "dist/portable/LICENSE.esbuild.txt"
  ];
  const packedFiles = [...documents, ...PREVIEW_IMAGES, ...EXAMPLE_FILES, ...portableFiles, "bin/flowsvg.mjs", "dist/node/cli.js", "dist/node.d.ts", "dist/export.d.ts", "dist/export/worker-source.js", ...extraFiles].filter((file) => !omittedFiles.includes(file));
  writeFileSync(join(fixture.binaries, "npm"), `#!${process.execPath}
    const fs = require("node:fs");
    const path = require("node:path");
    const { execFileSync } = require("node:child_process");
    const args = process.argv.slice(2);
    if (args[0] === "pack") {
      const destination = args[args.indexOf("--pack-destination") + 1];
      if (args.includes("--ignore-scripts")) {
        console.error("TEST_PACKED_README: " + fs.readFileSync("README.md", "utf8"));
        console.error("TEST_PACKED_ZH_README: " + fs.readFileSync("README.zh-CN.md", "utf8"));
      } else {
        const source = path.join(destination, "fixture-source");
        const packageDir = path.join(source, "package");
        fs.mkdirSync(packageDir, { recursive: true });
        for (const name of ["README.md", "README.zh-CN.md"]) {
          fs.writeFileSync(path.join(packageDir, name), '![Preview](./docs/images/quick-start.png)\\n<p align="center"><img src="./docs/images/flowsvg-wordmark.gif" alt="FlowSVG" width="360"></p><img src="${GALLERY_URL}basic-shapes.gif" alt="Shapes">');
        }
        execFileSync("tar", ["-czf", path.join(destination, "fixture.tgz"), "-C", source, "package"]);
      }
      console.log(JSON.stringify([{ filename: "fixture.tgz", files: ${JSON.stringify(packedFiles)}.map(path => ({ path })) }]));
    } else if (args[0] === "install") {
      console.error("TEST_CONSUMER_INSTALL_REACHED");
      console.error("TEST_INSTALL_SCRIPTS_ENABLED: " + !args.includes("--ignore-scripts"));
      process.exit(9);
    }
  `, { mode: 0o755 });
  return spawnSync(process.execPath, [join(fixture.root, "scripts", "verify-release.mjs")], {
    cwd: tmpdir(), encoding: "utf8", env: { ...process.env, PATH: `${fixture.binaries}:${process.env.PATH}` }
  });
}

describe("packed release files", () => {
  it("excludes showcase GIFs from the actual npm package", () => {
    const result = spawnSync("npm", ["pack", "--dry-run", "--ignore-scripts", "--json"], {
      cwd: new URL("../packages/flowsvg", import.meta.url), encoding: "utf8"
    });
    expect(result.status, result.stderr).toBe(0);
    const [packed] = JSON.parse(result.stdout) as { files: { path: string }[] }[];
    const files = packed!.files.map(({ path }) => path);
    for (const name of GALLERY_GIFS) expect(files).not.toContain(`docs/images/${name}`);
    expect(files).toContain("docs/images/job-lifecycle.gif");
    expect(files).toContain("docs/images/flowsvg-wordmark.gif");
  });

  it("accepts a package without externally hosted showcase GIFs", () => {
    const result = verifyPackedFiles([]);
    expect(result.stderr).toContain("TEST_CONSUMER_INSTALL_REACHED");
    expect(result.stderr).not.toContain("tarball missing");
  });

  it("accepts the runnable lifecycle example and its preview before installing the consumer", () => {
    const result = verifyPackedFiles([]);
    expect(result.stderr).toContain("TEST_CONSUMER_INSTALL_REACHED");
    expect(result.stderr).not.toContain("unexpected tarball file");
  });

  it.each([...EXAMPLE_FILES, "docs/images/job-lifecycle.gif"])(
    "rejects a missing required example artifact %s before installing the consumer", (file) => {
      const result = verifyPackedFiles([], [file]);
      expect(result.stderr).toContain(`tarball missing ${file}`);
      expect(result.stderr).not.toContain("TEST_CONSUMER_INSTALL_REACHED");
    }
  );

  it("verifies a normal consumer installation with dependency lifecycle scripts enabled", () => {
    const result = verifyPackedFiles([]);
    expect(result.stderr).toContain("TEST_INSTALL_SCRIPTS_ENABLED: true");
  });

  it.each(["bin/flowsvg.mjs", "dist/portable/manifest.json", "dist/portable/LICENSE.esbuild.txt", "dist/portable/export.js", "dist/portable/LICENSE.gifenc.txt", "dist/node/cli.js", "dist/node.d.ts", "dist/export.d.ts", "dist/export/worker-source.js"])(
    "rejects a missing portable artifact %s before installing the consumer", (file) => {
      const result = verifyPackedFiles([], [file]);
      expect(result.stderr).toContain(`tarball missing ${file}`);
      expect(result.stderr).not.toContain("TEST_CONSUMER_INSTALL_REACHED");
    }
  );

  it("converts local README previews to versioned public URLs when packing the release", () => {
    const result = verifyPackedFiles([]);
    const image = `![Preview](https://cdn.jsdelivr.net/npm/flowsvg@${FIXTURE_VERSION}/docs/images/quick-start.png)`;
    expect(result.stderr).toContain(`TEST_PACKED_README: ${image}`);
    expect(result.stderr).toContain(`TEST_PACKED_ZH_README: ${image}`);
    expect(result.stderr).toContain("TEST_CONSUMER_INSTALL_REACHED");
  });

  it("converts centered HTML logos to versioned public URLs in both README languages", () => {
    const result = verifyPackedFiles([]);
    const logo = `<p align="center"><img src="https://cdn.jsdelivr.net/npm/flowsvg@${FIXTURE_VERSION}/docs/images/flowsvg-wordmark.gif" alt="FlowSVG" width="360"></p>`;
    expect(result.stderr.split(logo)).toHaveLength(3);
    expect(result.stderr).not.toContain('src="./docs/images/');
    expect(result.stderr).toContain("TEST_CONSUMER_INSTALL_REACHED");
  });

  it("preserves external showcase URLs in both published README languages", () => {
    const result = verifyPackedFiles([]);
    expect(result.stderr.split(`<img src="${GALLERY_URL}basic-shapes.gif" alt="Shapes">`)).toHaveLength(3);
    expect(result.stderr).toContain("TEST_CONSUMER_INSTALL_REACHED");
  });

  it("accepts all README preview images before installing the consumer", () => {
    const result = verifyPackedFiles([]);
    expect(result.stderr).toContain("TEST_CONSUMER_INSTALL_REACHED");
    expect(result.stderr).not.toContain("unexpected tarball file");
  });

  it("rejects a missing README preview image before installing the consumer", () => {
    const missingImage = "docs/images/quick-start.png";
    const result = verifyPackedFiles([], [missingImage]);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(`tarball missing ${missingImage}`);
    expect(result.stderr).not.toContain("TEST_CONSUMER_INSTALL_REACHED");
  });

  it.each([
    "dist/unrelated.js", "dist/unrelated.d.ts", "dist/fixture.css",
    "dist/core/diagram.ts", "dist/core/diagram.test.js", "dist/core/diagram.test.d.ts",
    "dist/core/fixture.json", "dist/core/unrelated.js", "dist/adapters/react.test.js", "dist/other/diagram.js", "src/index.ts",
    "docs/images/unrelated.png", "docs/images/README.md", ...GALLERY_GIFS.map((name) => `docs/images/${name}`)
  ])("rejects unexpected packed file %s before installing a consumer", (file) => {
    const result = verifyPackedFiles([file]);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(`unexpected tarball file ${file}`);
    expect(result.stderr).not.toContain("TEST_CONSUMER_INSTALL_REACHED");
  });
  it("accepts declared nested runtime and declaration files before installing the consumer", () => {
    const result = verifyPackedFiles(["dist/core/diagram.js", "dist/core/edge-geometry.js", "dist/core/edge-geometry.d.ts", "dist/core/svg-number.js", "dist/core/svg-number.d.ts", "dist/core/model.d.ts", "dist/browser/player.js", "dist/browser/export-controls.js", "dist/browser/export-controls.d.ts", "dist/browser/accessibility.d.ts", "dist/adapters/react.js", "dist/adapters/vue.d.ts", "dist/adapters/web-component.js", "dist/styles.css"]);
    expect(result.stderr).toContain("TEST_CONSUMER_INSTALL_REACHED");
    expect(result.stderr).not.toContain("unexpected tarball file");
  });
  it("accepts preset label runtime, declarations and the decision example in the installed package", () => {
    const result = verifyPackedFiles(["dist/core/node-shape.js", "dist/core/node-shape.d.ts", "dist/core/node-label.js",
      "dist/core/node-label.d.ts", "dist/core/node-label-measurement.js", "dist/core/node-label-measurement.d.ts"]);
    expect(result.stderr).toContain("TEST_CONSUMER_INSTALL_REACHED");
    expect(result.stderr).not.toContain("unexpected tarball file");
  });
});
