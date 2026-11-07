import { spawnSync } from "node:child_process";
import { copyFileSync, mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const FIXTURE_PREFIX = "flowsvg release test ";
const FIXTURE_VERSION = "0.1.0";
const PREVIEW_IMAGES = [
  "docs/images/quick-start.png", "docs/images/node-content.png",
  "docs/images/numbered-list.png", "docs/images/numbered-list.zh-CN.png",
  "docs/images/record-tags.png", "docs/images/entity-graph.png",
  "docs/images/facts-timeline.png", "docs/images/facts-timeline.zh-CN.png", "docs/images/flowsvg-wordmark.gif",
  "docs/images/job-lifecycle.gif", "docs/images/request-response.gif", "docs/images/web-service-deployment.gif", "docs/images/llm-inference.gif"
];
const EXAMPLE_FILES = ["examples/job-lifecycle.json", "examples/decision-branch.json", "examples/report-generation.json", "examples/subprocess-call.json", "examples/input-output.json"];
const fixtures: string[] = [];

interface Invocation {
  command: string;
  args: string[];
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
  writeFileSync(join(packageDir, "package.json"), JSON.stringify({ name: "flowsvg", version: FIXTURE_VERSION }));
  const record = `
    const fs = require("node:fs");
    const path = require("node:path");
    const args = process.argv.slice(2);
    const command = path.basename(process.argv[1]);
    fs.appendFileSync(${JSON.stringify(log)}, JSON.stringify({ command, args }) + "\\n");
  `;
  for (const command of ["pnpm", "npm"]) {
    writeFileSync(join(binaries, command), `#!${process.execPath}\n${record}
      const failure = process.env.TEST_RELEASE_FAILURE;
      if (args.includes(failure) || (failure === "example" && args.includes("build")) ||
          (failure === "preview" && args.includes("--dry-run"))) process.exit(9);
      if (args[0] === "whoami") console.log("release-user");
      if (args[0] === "publish" && !fs.existsSync(args[1])) process.exit(10);
    `, { mode: 0o755 });
  }
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

function runFixture(args: string[] = [], failure?: string) {
  const fixture = createFixture();
  const result = spawnSync(process.execPath, [join(fixture.root, "scripts", "release.mjs"), ...args], {
    cwd: tmpdir(),
    encoding: "utf8",
    env: { ...process.env, PATH: `${fixture.binaries}:${process.env.PATH}`, TEST_RELEASE_FAILURE: failure }
  });
  let calls: Invocation[] = [];
  try {
    calls = readFileSync(fixture.log, "utf8").trim().split("\n").filter(Boolean).map((line) => JSON.parse(line) as Invocation);
  } catch (error) {
    if (!(error instanceof Error) || !("code" in error) || error.code !== "ENOENT") throw error;
  }
  return { ...fixture, ...result, calls };
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
  const packedFiles = [...documents, ...PREVIEW_IMAGES, ...EXAMPLE_FILES, ...portableFiles, "dist/node/cli.js", "dist/node.d.ts", "dist/export.d.ts", "dist/export/worker-source.js", ...extraFiles].filter((file) => !omittedFiles.includes(file));
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
          fs.writeFileSync(path.join(packageDir, name), '![Preview](./docs/images/quick-start.png)\\n<p align="center"><img src="./docs/images/flowsvg-wordmark.gif" alt="FlowSVG" width="360"></p>');
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
  it("accepts the runnable lifecycle example and its preview before installing the consumer", () => {
    const result = verifyPackedFiles([]);
    expect(result.stderr).toContain("TEST_CONSUMER_INSTALL_REACHED");
    expect(result.stderr).not.toContain("unexpected tarball file");
  });

  it.each([...EXAMPLE_FILES, "docs/images/job-lifecycle.gif"])(
    "rejects a missing lifecycle example artifact %s before installing the consumer", (file) => {
      const result = verifyPackedFiles([], [file]);
      expect(result.stderr).toContain(`tarball missing ${file}`);
      expect(result.stderr).not.toContain("TEST_CONSUMER_INSTALL_REACHED");
    }
  );

  it("verifies a normal consumer installation with dependency lifecycle scripts enabled", () => {
    const result = verifyPackedFiles([]);
    expect(result.stderr).toContain("TEST_INSTALL_SCRIPTS_ENABLED: true");
  });

  it.each(["dist/portable/manifest.json", "dist/portable/LICENSE.esbuild.txt", "dist/portable/export.js", "dist/portable/LICENSE.gifenc.txt", "dist/node/cli.js", "dist/node.d.ts", "dist/export.d.ts", "dist/export/worker-source.js"])(
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
    "docs/images/unrelated.png", "docs/images/README.md"
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
