#!/usr/bin/env node
/** Node CLI: render completely, then atomically publish HTML/GIF; cancellation never publishes partial bytes. */
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { renderHtml, assertNodeRuntime } from "./html.js";
import { exportGif, type NodeGifExportOptions } from "./gif.js";
import { publishOutput } from "./output.js";
import type { DiagramDocument, ThemeName } from "../core/model.js";

const USAGE = `Usage: flowsvg INPUT.json --output OUTPUT --format html|gif [options]
Common: --theme light|dark --overwrite
HTML: --autoplay --no-controls --gif-export
GIF: --executable-path PATH --start-ms N --end-ms N --speed N --width N --fps N
     --no-captions --caption-height N --loop-count N --final-hold-ms N --reduced-motion
GIF requires Node 20+ and preinstalled Chromium; browsers are never downloaded automatically.`;
const CLI_OPTIONS = {
  output: { type: "string", short: "o" }, format: { type: "string" }, theme: { type: "string" },
  autoplay: { type: "boolean" }, "gif-export": { type: "boolean" }, "no-controls": { type: "boolean" }, overwrite: { type: "boolean" },
  "executable-path": { type: "string" }, "start-ms": { type: "string" }, "end-ms": { type: "string" },
  speed: { type: "string" }, width: { type: "string" }, fps: { type: "string" },
  "no-captions": { type: "boolean" }, "caption-height": { type: "string" }, "loop-count": { type: "string" },
  "final-hold-ms": { type: "string" }, "reduced-motion": { type: "boolean" }, help: { type: "boolean", short: "h" }
} as const;
type CliValues = ReturnType<typeof parseCli>["values"];
function parseCli() { return parseArgs({ allowPositionals: true, options: CLI_OPTIONS }); }

async function main(signal: AbortSignal): Promise<void> {
  assertNodeRuntime();
  const { values, positionals } = parseCli();
  if (values.help) { console.log(USAGE); return; }
  if (positionals.length !== 1 || !values.output || !["html", "gif"].includes(values.format ?? "")) throw new Error(USAGE);
  if (values.theme !== undefined && values.theme !== "light" && values.theme !== "dark") throw new Error("Theme must be light or dark.");
  const input: DiagramDocument = JSON.parse(await readFile(resolve(positionals[0]), "utf8"));
  signal.throwIfAborted();
  const theme = values.theme as ThemeName | undefined;
  const content = values.format === "gif"
    ? await exportGif(input, gifOptions(values, theme, signal))
    : await renderHtml(input, { theme, autoplay: values.autoplay, controls: !values["no-controls"], gifExport: values["gif-export"] });
  await publishOutput(resolve(values.output), content, values.overwrite === true, signal);
}

function gifOptions(values: CliValues, theme: ThemeName | undefined, signal: AbortSignal): NodeGifExportOptions {
  return {
    theme, signal, executablePath: values["executable-path"],
    startMs: numericOption(values["start-ms"], "start-ms"), endMs: numericOption(values["end-ms"], "end-ms"),
    speed: numericOption(values.speed, "speed"), width: numericOption(values.width, "width"), fps: numericOption(values.fps, "fps"),
    includeCaptions: !values["no-captions"], captionHeight: numericOption(values["caption-height"], "caption-height"),
    loopCount: numericOption(values["loop-count"], "loop-count"), finalHoldMs: numericOption(values["final-hold-ms"], "final-hold-ms"),
    reducedMotion: values["reduced-motion"],
    onProgress: (progress) => { console.error(`FlowSVG: ${progress.phase} ${progress.completed}/${progress.total}`); }
  };
}
function numericOption(value: string | undefined, name: string): number | undefined {
  if (value === undefined) return undefined;
  const number = Number(value);
  if (value.trim() === "" || !Number.isFinite(number)) throw new Error(`--${name} requires a finite number.`);
  return number;
}

const controller = new AbortController();
const cancel = (): void => controller.abort(new Error("Export cancelled by signal."));
process.on("SIGINT", cancel);
process.on("SIGTERM", cancel);
main(controller.signal).catch((error: unknown) => {
  console.error(`FlowSVG: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}).finally(() => {
  process.off("SIGINT", cancel);
  process.off("SIGTERM", cancel);
});
