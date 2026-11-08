#!/usr/bin/env node
/** Keep the install-time executable available before the SDK is built. */
import { existsSync } from "node:fs";

const CLI_MODULE = new URL("../dist/node/cli.js", import.meta.url);

if (!existsSync(CLI_MODULE)) {
  console.error("FlowSVG: CLI build is missing. Run `pnpm build` from the repository root.");
  process.exitCode = 1;
} else {
  await import(CLI_MODULE.href);
}
