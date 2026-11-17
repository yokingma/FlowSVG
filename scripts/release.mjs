#!/usr/bin/env node
/** Run release gates in order, then preview or publish the exact verified npm tarball. */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createGitHubRelease, NPM_REGISTRY, prepareGitHubRelease, recordGitHubRelease, releaseArtifactPath, retryGitHubRelease } from "./github-release.mjs";

const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));
const HELP = `Usage: pnpm release [--dry-run | --publish | --github-only | --help]

Default: run all checks, retain the verified tarball, and preview npm publication.
--publish  Check npm/GitHub access, run all gates, publish npm, then create a GitHub Release.
--dry-run  Explicitly select the default preview mode; no login is required.
--github-only  Retry GitHub publication from the saved release record; never upload npm.
--help     Show this help without running checks.
`;

function parseMode(args) {
  if (args.length === 0) return "--dry-run";
  if (args.length === 1 && ["--dry-run", "--publish", "--github-only", "--help"].includes(args[0])) return args[0];
  throw new Error(`Invalid arguments: ${args.join(" ")}. Use --help for usage.`);
}

function run(command, args) {
  console.log(`\n> ${command} ${args.join(" ")}`);
  execFileSync(command, args, { cwd: REPO_ROOT, stdio: "inherit" });
}

function checkAuthentication() {
  try {
    run("npm", ["whoami", `--registry=${NPM_REGISTRY}`]);
  } catch (cause) {
    throw new Error(`npm authentication failed. Run npm login --registry=${NPM_REGISTRY} and retry.`, { cause });
  }
}

function verifyArtifact(packageJson) {
  const destination = join(REPO_ROOT, "dist", "releases");
  run("pnpm", ["typecheck"]);
  run("pnpm", ["test"]);
  run(process.execPath, [join(REPO_ROOT, "scripts", "verify-release.mjs"), "--pack-destination", destination]);
  const artifact = releaseArtifactPath(REPO_ROOT, packageJson);
  const digest = createHash("sha256").update(readFileSync(artifact)).digest("hex");
  console.log(`\nVerified tarball: ${artifact}\nSHA256: ${digest}`);
  return artifact;
}

async function release() {
  const mode = parseMode(process.argv.slice(2));
  if (mode === "--help") {
    console.log(HELP);
    return;
  }
  const packageJson = JSON.parse(readFileSync(join(REPO_ROOT, "packages", "flowsvg", "package.json"), "utf8"));
  if (mode === "--github-only") {
    await retryGitHubRelease(REPO_ROOT, packageJson);
    return;
  }
  if (mode === "--publish") checkAuthentication();
  const github = mode === "--publish" ? prepareGitHubRelease(REPO_ROOT, packageJson) : undefined;
  const artifact = verifyArtifact(packageJson);
  const publishArgs = ["publish", artifact, "--access", "public", `--registry=${NPM_REGISTRY}`];
  run("npm", [...publishArgs, "--dry-run"]);
  if (mode === "--publish") {
    const record = recordGitHubRelease(REPO_ROOT, github, artifact);
    run("npm", publishArgs);
    console.log(`\nPublished ${packageJson.name}@${packageJson.version}.`);
    try {
      await createGitHubRelease(REPO_ROOT, record, artifact);
    } catch (cause) {
      throw new Error(`npm upload completed, but GitHub publication is incomplete. Run pnpm release:github; do not publish npm again. ${cause instanceof Error ? cause.message : String(cause)}`, { cause });
    }
    return;
  }
  console.log("\nRelease preview passed. To upload, run pnpm release:publish.");
}

try {
  await release();
} catch (error) {
  console.error(`\nRelease stopped: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
