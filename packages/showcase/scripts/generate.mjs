/** Generate diagram-only JSON and runtime data from one explicitly selected TypeScript build output. */
import { mkdir, rm, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { compileCatalog } from "../dist/build.js";

const packageRoot = fileURLToPath(new URL("..", import.meta.url));
const sourcePath = resolve(packageRoot, process.env.SHOWCASE_SOURCE ?? "dist/formal.js");
const { catalogSource } = await import(pathToFileURL(sourcePath).href);
const { catalog, json } = compileCatalog(catalogSource);
const outputRoot = join(packageRoot, "dist");
// Validate the complete input before replacing generated output, so failures never publish a partial catalog.
await rm(join(outputRoot, "site", "json"), { recursive: true, force: true });
await mkdir(join(outputRoot, "site", "json"), { recursive: true });
for (const [path, contents] of json) await writeFile(join(outputRoot, "site", path), contents);
await writeFile(join(outputRoot, "generated-catalog.js"), [
  'import { createCatalog } from "./catalog.js";',
  `export const catalog = createCatalog(${JSON.stringify(catalog.entries)}, ${JSON.stringify(catalog.defaultId)});`, ""
].join("\n"));
await writeFile(join(outputRoot, "generated-catalog.d.ts"), 'import type { ShowcaseCatalog } from "./model.js";\nexport declare const catalog: ShowcaseCatalog;\n');
console.log(`Generated ${catalog.entries.length} showcase definitions from ${sourcePath}`);
