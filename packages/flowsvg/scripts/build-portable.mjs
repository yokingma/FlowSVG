/** Produce copyable offline runtime assets from the same package version as the ESM and Node entries. */
import { build, version as esbuildVersion } from "esbuild";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = fileURLToPath(new URL("..", import.meta.url));
const outputRoot = join(packageRoot, "dist", "portable");
const require = createRequire(import.meta.url);
const metadata = JSON.parse(await readFile(join(packageRoot, "package.json"), "utf8"));
await mkdir(outputRoot, { recursive: true });
const worker = await build({
  absWorkingDir: packageRoot,
  entryPoints: ["src/export/worker.ts"],
  bundle: true,
  format: "iife",
  platform: "browser",
  target: "es2022",
  minify: true,
  write: false
});
const workerSource = worker.outputFiles[0].text;
await writeFile(join(packageRoot, "dist/export/worker-source.js"), `export const GIF_WORKER_SOURCE = ${JSON.stringify(workerSource)};\n`);
await build({
  absWorkingDir: packageRoot,
  entryPoints: ["src/portable/export.ts"],
  outfile: join(outputRoot, "export.js"),
  bundle: true,
  format: "iife",
  globalName: "FlowSVGExport",
  platform: "browser",
  target: "es2022",
  minify: true,
  charset: "ascii",
  define: { __FLOW_GIF_WORKER__: JSON.stringify(workerSource) }
});
await build({
  absWorkingDir: packageRoot,
  entryPoints: ["src/portable/player.ts"],
  outfile: join(outputRoot, "player.js"),
  bundle: true,
  format: "iife",
  platform: "browser",
  target: "es2022",
  minify: true,
  charset: "ascii",
  legalComments: "inline",
  // IIFE bundling normally inlines dynamic imports. Substitute only the player's optional exporter import
  // so basic offline playback excludes encoder code; GIF-enabled HTML supplies the separate exporter global.
  plugins: [{
    name: "portable-player-export-bridge",
    setup(builder) {
      builder.onResolve({ filter: /^\.\.\/export\.js$/ }, (args) => {
        if (resolve(args.importer) !== join(packageRoot, "src/browser/export-controls.ts")) return;
        return { path: "inline-gif-export", namespace: "flowsvg-portable" };
      });
      builder.onLoad({ filter: /^inline-gif-export$/, namespace: "flowsvg-portable" }, () => ({
        contents: `export async function exportGif(...args) {
          const api = globalThis.FlowSVGExport;
          if (!api) throw new Error("GIF export is not embedded. Generate this HTML with gifExport: true.");
          return api.exportGif(...args);
        }`,
        loader: "js"
      }));
    }
  }]
});
await Promise.all([
  copyFile(join(packageRoot, "src/styles.css"), join(outputRoot, "styles.css")),
  copyFile(join(dirname(require.resolve("gifenc/package.json")), "LICENSE.md"), join(outputRoot, "LICENSE.gifenc.txt")),
  copyFile(join(packageRoot, "LICENSE"), join(outputRoot, "LICENSE.flowsvg.txt")),
  copyFile(join(dirname(require.resolve("esbuild/package.json")), "LICENSE.md"), join(outputRoot, "LICENSE.esbuild.txt"))
]);
await writeFile(join(outputRoot, "manifest.json"), JSON.stringify({
  name: metadata.name,
  version: metadata.version,
  modules: ["core", "browser", "export"],
  files: ["export.js", "LICENSE.gifenc.txt", "player.js", "styles.css", "LICENSE.flowsvg.txt", "LICENSE.esbuild.txt"],
  thirdParty: [{ name: "gifenc", version: "1.0.3", license: "MIT", licenseFile: "LICENSE.gifenc.txt", modules: ["export"] }],
  buildTools: [{ name: "esbuild", version: esbuildVersion, license: "MIT", licenseFile: "LICENSE.esbuild.txt" }]
}, null, 2) + "\n");
