/** Audit the SDK's local module graph, including browser acceptance inputs. */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SDK_ROOT = fileURLToPath(new URL("../packages/flowsvg", import.meta.url));
const INPUT_DIRECTORIES = ["src", "tests", "scripts"];
const MODULE_REFERENCE = /(?:\bfrom\s*|\bimport\s*\(?\s*|\bsrc\s*=\s*)["']([^"']+)["']/g;

function filesIn(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? filesIn(path) : /\.(?:ts|js|mjs|html)$/.test(path) ? [path] : [];
  });
}

describe("SDK dependency boundary", () => {
  it("owns every local module used by runtime, build, tests and browser acceptance", () => {
    const externalInputs = INPUT_DIRECTORIES.flatMap((directory) => filesIn(join(SDK_ROOT, directory)))
      .flatMap((file) => [...readFileSync(file, "utf8").matchAll(MODULE_REFERENCE)]
        .map((match) => match[1]!)
        .filter((specifier) => specifier.startsWith(".") && relative(SDK_ROOT, resolve(dirname(file), specifier)).startsWith(".."))
        .map((specifier) => `${relative(SDK_ROOT, file)} -> ${specifier}`));
    expect(externalInputs).toEqual([]);
  });
});
