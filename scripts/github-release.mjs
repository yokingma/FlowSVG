/** Bind GitHub releases to the committed source and exact bytes accepted by the npm registry. */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

export const NPM_REGISTRY = "https://registry.npmjs.org/";
const STABLE_VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const COMMIT_SHA = /^[a-f0-9]{40}$/;
const SHA512_INTEGRITY = /^sha512-[A-Za-z0-9+/]{86}==$/;
const REGISTRY_ATTEMPTS = 6;
const REGISTRY_RETRY_MS = 2_000;
const REGISTRY_FETCH_TIMEOUT_MS = 10_000;

/** Resolve the versioned tarball retained by the release verifier. */
export function releaseArtifactPath(root, metadata) {
  const filename = `${metadata.name.replace(/^@/, "").replaceAll("/", "-")}-${metadata.version}.tgz`;
  return join(root, "dist", "releases", filename);
}

function artifactIntegrity(artifact) {
  return `sha512-${createHash("sha512").update(readFileSync(artifact)).digest("base64")}`;
}

function capture(root, command, args) {
  return execFileSync(command, args, {
    cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"]
  }).trim();
}

function repositoryName(metadata) {
  const url = new URL(metadata.repository.url.replace(/^git\+/, ""));
  const name = url.pathname.replace(/^\//, "").replace(/\.git$/, "");
  if (url.protocol !== "https:" || url.hostname !== "github.com" || !/^[\w.-]+\/[\w.-]+$/.test(name)) {
    throw new Error("package.json repository must identify an HTTPS GitHub repository.");
  }
  return name;
}

function releaseNotes(root, version) {
  const changelog = readFileSync(join(root, "packages", "flowsvg", "CHANGELOG.md"), "utf8").replace(/\r\n/g, "\n");
  const heading = new RegExp(`^## ${version.replaceAll(".", "\\.")} - \\d{4}-\\d{2}-\\d{2}[ \\t]*$`, "m");
  const match = heading.exec(changelog);
  if (!match) throw new Error(`Missing dated SDK CHANGELOG entry for ${version}.`);
  const notes = changelog.slice(match.index + match[0].length).split(/^## /m)[0].trim();
  if (!notes) throw new Error(`SDK CHANGELOG entry for ${version} is empty.`);
  return `${notes}\n`;
}

function assertGitHubAccess(root, repository) {
  try {
    capture(root, "gh", ["auth", "status", "--hostname", "github.com"]);
    const writable = capture(root, "gh", ["api", `repos/${repository}`, "--hostname", "github.com", "--jq", ".permissions.push"]);
    if (writable !== "true") throw new Error("Repository write permission is required.");
  } catch (cause) {
    throw new Error(`GitHub CLI authentication with write access to ${repository} is required. Run gh auth login.`, { cause });
  }
}

function assertOrigin(root, repository) {
  const remotes = capture(root, "git", ["remote", "-v"]);
  const origin = remotes.split("\n").find((line) => /^origin\s+.*\(fetch\)$/.test(line))?.split(/\s+/)[1];
  if (origin !== `https://github.com/${repository}.git`) {
    throw new Error(`origin must be https://github.com/${repository}.git before publishing.`);
  }
}

function assertSource(root, commit) {
  if (capture(root, "git", ["status", "--porcelain"])) throw new Error("Commit all source changes before publishing.");
  if (capture(root, "git", ["rev-parse", "HEAD"]) !== commit) throw new Error("HEAD changed during release verification; start again.");
}

function assertTagTarget(root, record) {
  const ref = `refs/tags/${record.tag}`;
  const refs = capture(root, "git", ["ls-remote", `https://github.com/${record.repository}.git`, ref, `${ref}^{}`])
    .split("\n").filter(Boolean).map((line) => line.split(/\s+/));
  // Annotated tags point at a tag object; compare its peeled commit instead.
  const commit = refs.find((entry) => entry[1] === `${ref}^{}`)?.[0] ?? refs.find((entry) => entry[1] === ref)?.[0];
  if (commit && commit !== record.commit) throw new Error(`${record.tag} already points to a different commit.`);
  return Boolean(commit);
}

function existingRelease(root, record) {
  try {
    return JSON.parse(capture(root, "gh", ["api", `repos/${record.repository}/releases/tags/${record.tag}`, "--hostname", "github.com"]));
  } catch (cause) {
    if (cause instanceof Error && "stderr" in cause && /\(HTTP 404\)/.test(String(cause.stderr))) return undefined;
    throw cause;
  }
}

async function confirmNpmArtifact(root, record) {
  for (let attempt = 1; attempt <= REGISTRY_ATTEMPTS; attempt += 1) {
    try {
      const output = capture(root, "npm", [
        "view", `${record.name}@${record.version}`, "dist.integrity", "--json", `--registry=${NPM_REGISTRY}`,
        "--fetch-retries=0", `--fetch-timeout=${REGISTRY_FETCH_TIMEOUT_MS}`
      ]);
      if (output) {
        if (JSON.parse(output) !== record.integrity) throw new Error("Published npm integrity does not match the verified artifact.");
        return;
      }
    } catch (cause) {
      const pending = cause instanceof Error && "stderr" in cause && /\bE404\b/.test(String(cause.stderr));
      if (!pending) throw cause;
    }
    if (attempt < REGISTRY_ATTEMPTS) {
      console.log(`Waiting for ${record.name}@${record.version} on npm (${attempt}/${REGISTRY_ATTEMPTS}).`);
      await delay(REGISTRY_RETRY_MS);
    }
  }
  throw new Error("The npm registry has not exposed the package yet. Retry with pnpm release:github once it is available.");
}

/** Preflight both publication destinations before uploading npm bytes. No remote state is changed. */
export function prepareGitHubRelease(root, metadata) {
  if (!STABLE_VERSION.test(metadata.version)) throw new Error("Formal releases require a stable major.minor.patch version.");
  if (existsSync(`${releaseArtifactPath(root, metadata)}.release.json`)) {
    throw new Error("A saved release record already exists. Use pnpm release:github instead of publishing npm again.");
  }
  const repository = repositoryName(metadata);
  const notes = releaseNotes(root, metadata.version);
  assertOrigin(root, repository);
  assertGitHubAccess(root, repository);
  const commit = capture(root, "git", ["rev-parse", "HEAD"]);
  if (!COMMIT_SHA.test(commit)) throw new Error("Cannot identify the release commit.");
  assertSource(root, commit);
  const remote = capture(root, "git", ["ls-remote", "origin", "refs/heads/main"]);
  if (remote.split(/\s+/)[0] !== commit) throw new Error("Push the release commit to origin/main before publishing.");
  const context = { repository, commit, notes, name: metadata.name, version: metadata.version, tag: `v${metadata.version}` };
  assertTagTarget(root, context);
  return context;
}

/** Persist the original commit, notes and integrity before npm upload so GitHub can be retried separately. */
export function recordGitHubRelease(root, context, artifact) {
  assertSource(root, context.commit);
  assertOrigin(root, context.repository);
  const record = { ...context, integrity: artifactIntegrity(artifact) };
  writeFileSync(`${artifact}.release.json`, `${JSON.stringify(record, null, 2)}\n`, { flag: "wx" });
  return record;
}

/** Retry the saved publication after a GitHub or registry-visibility failure, without rebuilding or publishing npm. */
export async function retryGitHubRelease(root, metadata) {
  if (!STABLE_VERSION.test(metadata.version)) throw new Error("GitHub recovery requires a stable package version.");
  const repository = repositoryName(metadata);
  const artifact = releaseArtifactPath(root, metadata);
  const record = JSON.parse(readFileSync(`${artifact}.release.json`, "utf8"));
  if (!record || record.name !== metadata.name || record.version !== metadata.version || record.repository !== repository
      || record.tag !== `v${metadata.version}` || typeof record.commit !== "string" || !COMMIT_SHA.test(record.commit)
      || typeof record.notes !== "string" || !record.notes.trim()
      || typeof record.integrity !== "string" || !SHA512_INTEGRITY.test(record.integrity)) {
    throw new Error("Saved GitHub release record does not match this package.");
  }
  assertOrigin(root, repository);
  assertGitHubAccess(root, repository);
  await createGitHubRelease(root, record, artifact);
}

/** Create a release only after the registry serves the verified artifact; never upload npm bytes here. */
export async function createGitHubRelease(root, record, artifact) {
  await confirmNpmArtifact(root, record);
  const tagExists = assertTagTarget(root, record);
  const existing = existingRelease(root, record);
  if (existing) {
    if (!tagExists || existing.tag_name !== record.tag || existing.draft !== false || existing.prerelease !== false) {
      throw new Error("Existing GitHub Release is not a published stable release on the saved commit; review it manually.");
    }
    console.log(`GitHub Release ${record.tag} already exists; leaving it unchanged.`);
    return;
  }
  const notesFile = `${artifact}.notes.md`;
  writeFileSync(notesFile, record.notes);
  execFileSync("gh", [
    "release", "create", record.tag, "--repo", `github.com/${record.repository}`,
    "--target", record.commit, "--title", `FlowSVG ${record.version}`, "--notes-file", notesFile
  ], { cwd: root, stdio: "inherit" });
}
