/** Exercise pnpm's real workspace bin linking without generated SDK output. */
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const SDK_ROOT = fileURLToPath(new URL("../packages/flowsvg/", import.meta.url));
const fixtures: string[] = [];

function createWorkspace() {
  const root = mkdtempSync(join(tmpdir(), "flowsvg workspace install "));
  fixtures.push(root);
  const sdk = join(root, "packages", "flowsvg");
  const consumer = join(root, "packages", "consumer");
  mkdirSync(sdk, { recursive: true });
  mkdirSync(consumer, { recursive: true });
  const metadata = JSON.parse(readFileSync(join(SDK_ROOT, "package.json"), "utf8")) as {
    name: string; version: string; bin: Record<string, string>;
  };
  writeFileSync(join(root, "package.json"), JSON.stringify({ private: true }));
  writeFileSync(join(root, "pnpm-workspace.yaml"), 'packages:\n  - "packages/*"\n');
  writeFileSync(join(sdk, "package.json"), JSON.stringify({ name: metadata.name, version: metadata.version, bin: metadata.bin, type: "module" }));
  writeFileSync(join(consumer, "package.json"), JSON.stringify({ name: "consumer", dependencies: { flowsvg: "workspace:*" } }));
  const entry = metadata.bin.flowsvg!;
  if (existsSync(join(SDK_ROOT, entry)) && !entry.startsWith("./dist/")) {
    mkdirSync(dirname(join(sdk, entry)), { recursive: true });
    copyFileSync(join(SDK_ROOT, entry), join(sdk, entry));
  }
  return { root, sdk, consumer, entry };
}

afterEach(() => {
  for (const fixture of fixtures.splice(0)) rmSync(fixture, { recursive: true, force: true });
});

describe("workspace CLI installation", () => {
  it("links the CLI on the first install without dist or build scripts", () => {
    const { root, sdk, consumer } = createWorkspace();
    const installed = spawnSync("pnpm", ["install", "--offline", "--ignore-scripts", "--reporter=append-only"], { cwd: root, encoding: "utf8" });
    const output = installed.stdout + installed.stderr;
    expect(installed.status, output).toBe(0);
    expect(output).not.toContain("Failed to create bin");
    expect(existsSync(join(consumer, "node_modules", ".bin", "flowsvg"))).toBe(true);
    expect(existsSync(join(sdk, "dist"))).toBe(false);
  });

  it("explains how to build when the CLI output is missing", () => {
    const { root, sdk, entry } = createWorkspace();
    const result = spawnSync(process.execPath, [join(sdk, entry), "--help"], { cwd: root, encoding: "utf8" });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("pnpm build");
    expect(result.stderr).not.toContain("MODULE_NOT_FOUND");
    expect(existsSync(join(sdk, "dist"))).toBe(false);
  });

  it("forwards arguments and the built CLI's exit status from another directory", () => {
    const { root, sdk, entry } = createWorkspace();
    const output = join(sdk, "dist", "node");
    mkdirSync(output, { recursive: true });
    writeFileSync(join(output, "cli.js"), 'console.log(JSON.stringify(process.argv.slice(2))); process.exitCode = 7;');
    const args = ["input with spaces.json", "--output", "diagram.html"];
    const result = spawnSync(process.execPath, [join(sdk, entry), ...args], { cwd: root, encoding: "utf8" });
    expect(result.status, result.stderr).toBe(7);
    expect(JSON.parse(result.stdout)).toEqual(args);
  });

  it("preserves failures inside the built CLI instead of reporting a missing build", () => {
    const { root, sdk, entry } = createWorkspace();
    const output = join(sdk, "dist", "node");
    mkdirSync(output, { recursive: true });
    writeFileSync(join(output, "cli.js"), 'import "./missing-runtime.js";');
    const result = spawnSync(process.execPath, [join(sdk, entry)], { cwd: root, encoding: "utf8" });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("missing-runtime.js");
    expect(result.stderr).not.toContain("pnpm build");
  });
});
