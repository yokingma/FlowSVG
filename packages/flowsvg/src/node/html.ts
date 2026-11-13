/** Node-only HTML assembly. Read versioned built assets; never start a browser or import automation/encoding dependencies. */
import { readFile } from "node:fs/promises";
import { createDiagram } from "../core/diagram.js";
import { snapshotRuntimeEmphasis } from "../core/validation.js";
import { DIAGRAM_FONT_FAMILY, resolveThemePalette } from "../core/theme.js";
import type { DiagramDocument, EmphasisColors, ThemeName } from "../core/model.js";

/** Offline playback options. Default to document/light theme, paused at zero, with controls and caption. */
export interface HtmlRenderOptions {
  theme?: ThemeName;
  /** Per-field document/theme emphasis overrides, captured before reading offline assets. */
  emphasis?: EmphasisColors;
  autoplay?: boolean;
  /** Defaults to false. Loop live playback; GIF loopCount remains an independent export option. */
  loop?: boolean;
  controls?: boolean;
  /** Embed offline GIF export assets and show GIF controls when controls are visible. Defaults to false. */
  gifExport?: boolean;
}

/**
 * Return one offline HTML file containing validated data, the player, CSS and optional GIF assets. Requires Node 20+.
 * Text remains data, including HTML delimiters and Unicode separators. No browser is required.
 * @throws For invalid documents/options, an unsupported Node runtime, or missing built assets.
 */
export async function renderHtml(document: DiagramDocument, options: HtmlRenderOptions = {}): Promise<string> {
  assertNodeRuntime();
  validateOptions(options);
  const snapshot = structuredClone(document);
  const playbackOptions = structuredClone(options);
  createDiagram(snapshot);
  const [script, styles, exporter] = await Promise.all([
    readFile(new URL("../portable/player.js", import.meta.url), "utf8"),
    readFile(new URL("../portable/styles.css", import.meta.url), "utf8"),
    playbackOptions.gifExport ? readFile(new URL("../portable/export.js", import.meta.url), "utf8") : ""
  ]);
  const data = escapeJson({ document: snapshot, options: playbackOptions });
  const title = escapeHtml(snapshot.title ?? "FlowSVG");
  const palette = resolveThemePalette(playbackOptions.theme ?? snapshot.theme);
  const pageStyles = `body{margin:0;background:${palette.background};color:${palette.text};font-family:${DIAGRAM_FONT_FAMILY}}
#flowsvg-player{max-width:1280px;margin:auto}.flowsvg-canvas svg{display:block;width:100%}
.flowsvg-caption{padding:0 16px;white-space:pre-wrap}
.flowsvg-controls{--flowsvg-control-background:${palette.background};--flowsvg-control-color:${palette.text}}`;
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title><style>${styles}\n${pageStyles}</style></head>
<body><main id="flowsvg-player"></main>
<script id="flowsvg-data" type="application/json">${data}</script>
${exporter ? `<script>${exporter}</script>\n` : ""}<script>${script}</script></body></html>`;
}

/** Fail before reading files or allocating browser resources on the Node-only path. */
export function assertNodeRuntime(): void {
  const MIN_NODE_MAJOR = 20;
  if (Number(process.versions.node.split(".")[0]) < MIN_NODE_MAJOR) {
    throw new Error("FlowSVG Node tools require Node 20 or newer. Upgrade Node and retry.");
  }
}

function validateOptions(options: HtmlRenderOptions): void {
  snapshotRuntimeEmphasis(options.emphasis);
  if (options.theme !== undefined && options.theme !== "light" && options.theme !== "dark") {
    throw new Error("HTML theme must be light or dark.");
  }
  for (const key of ["autoplay", "controls", "gifExport", "loop"] as const) {
    if (options[key] !== undefined && typeof options[key] !== "boolean") {
      throw new Error(`HTML ${key} must be a boolean.`);
    }
  }
}

function escapeJson(value: unknown): string {
  const ESCAPES: Record<string, string> = {
    "<": "\\u003c", ">": "\\u003e", "&": "\\u0026", "\u2028": "\\u2028", "\u2029": "\\u2029"
  };
  return JSON.stringify(value).replace(/[<>&\u2028\u2029]/g, (character) => ESCAPES[character]);
}

function escapeHtml(value: string): string {
  const ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  return value.replace(/[&<>"']/g, (character) => ESCAPES[character]);
}
