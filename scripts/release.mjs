#!/usr/bin/env node
/** Run release gates in order, then preview or publish the exact verified npm tarball. */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));
const REGISTRY = "https://registry.npmjs.org/";
const HELP = `Usage: pnpm release [--dry-run | --publish | --help]

Default: run all checks, retain the verified tarball, and preview npm publication.
--publish  Check npm authentication, run all gates, preview, then upload to npm.
--dry-run  Explicitly select the default preview mode; no login is required.
--help     Show this help without running checks.
`;

function parseMode(args) {
  if (args.length === 0) return "--dry-run";
  if (args.length === 1 && ["--dry-run", "--publish", "--help"].includes(args[0])) return args[0];
  throw new Error(`Invalid arguments: ${args.join(" ")}. Use --help for usage.`);
}

function run(command, args) {
  console.log(`\n> ${command} ${args.join(" ")}`);
  execFileSync(command, args, { cwd: REPO_ROOT, stdio: "inherit" });
}

function checkAuthentication() {
  try {
    run("npm", ["whoami", `--registry=${REGISTRY}`]);
  } catch (cause) {
    throw new Error(`npm authentication failed. Run npm login --registry=${REGISTRY} and retry.`, { cause });
  }
}

function verifyArtifact(packageJson) {
  const destination = join(REPO_ROOT, "dist", "releases");
  run("pnpm", ["typecheck"]);
  run("pnpm", ["test"]);
  run(process.execPath, [join(REPO_ROOT, "scripts", "verify-release.mjs"), "--pack-destination", destination]);
  const filename = `${packageJson.name.replace(/^@/, "").replaceAll("/", "-")}-${packageJson.version}.tgz`;
  const artifact = join(destination, filename);
  const digest = createHash("sha256").update(readFileSync(artifact)).digest("hex");
  console.log(`\nVerified tarball: ${artifact}\nSHA256: ${digest}`);
  return artifact;
}

function release() {
  const mode = parseMode(process.argv.slice(2));
  if (mode === "--help") {
    console.log(HELP);
    return;
  }
  const packageJson = JSON.parse(readFileSync(join(REPO_ROOT, "packages", "flowsvg", "package.json"), "utf8"));
  if (mode === "--publish") checkAuthentication();
  const artifact = verifyArtifact(packageJson);
  const publishArgs = ["publish", artifact, "--access", "public", `--registry=${REGISTRY}`];
  run("npm", [...publishArgs, "--dry-run"]);
  if (mode === "--publish") {
    run("npm", publishArgs);
    console.log(`\nPublished ${packageJson.name}@${packageJson.version}.`);
    return;
  }
  console.log("\nRelease preview passed. To upload, run pnpm release:publish.");
}

try {
  release();
} catch (error) {
  console.error(`\nRelease stopped: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
