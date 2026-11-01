/**
 * Exercise only installed package entries and detached runtime assets. The release verifier copies this
 * file into its clean consumer after installation; no workspace source or build tool is available here.
 * Chromium and optional Node 18/20 executables must be prepared explicitly before this check.
 */
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { parseGIF, decompressFrames } from "gifuct-js";
import { chromium } from "playwright-core";
import { renderHtml, exportGif, exportPng } from "flowsvg/node";

const ROOT = process.cwd();
const PACKAGE = join(ROOT, "node_modules/flowsvg");
const CHROMIUM = process.env.FLOWSVG_CHROMIUM_PATH;
const NODE20 = process.env.FLOWSVG_NODE20_PATH ?? process.execPath;
const NODE18 = process.env.FLOWSVG_NODE18_PATH;
const document = {
  version: 1, title: "离线交付", viewport: { width: 240, height: 120 },
  nodes: [{ id: "a", kind: "rect", x: 10, y: 20, width: 40, height: 40, label: "中文", style: { fill: "#ff0000" } }], edges: [],
  scenes: [{ id: "move", label: "移动", beats: [
    { durationMs: 1000, transitionMs: 1000, caption: "第一步", actions: [{ type: "updateNode", target: "a", value: { x: 150 } }] },
    { durationMs: 1000, caption: "第二步", actions: [] }
  ] }]
};

function run(node, args, cwd = ROOT) {
  return execFileSync(node, args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, HTTP_PROXY: "http://127.0.0.1:1", HTTPS_PROXY: "http://127.0.0.1:1", npm_config_offline: "true" } });
}

function verifyMetadata() {
  const metadata = JSON.parse(readFileSync(join(PACKAGE, "package.json"), "utf8"));
  const manifest = JSON.parse(readFileSync(join(PACKAGE, "dist/portable/manifest.json"), "utf8"));
  assert.equal(manifest.version, metadata.version); assert.equal(manifest.name, metadata.name);
  assert.equal(metadata.bin.flowsvg, "./dist/node/cli.js");
  assert.equal(metadata.dependencies.gifenc, "1.0.3"); assert.equal(metadata.dependencies["playwright-core"], "1.58.2");
  const automation = JSON.parse(readFileSync(join(ROOT, "node_modules/playwright-core/package.json"), "utf8"));
  assert.equal(automation.version, metadata.dependencies["playwright-core"]);
  assert.equal(automation.license, "Apache-2.0");
  assert.match(readFileSync(join(ROOT, "node_modules/playwright-core/LICENSE"), "utf8"), /Apache License/);
  for (const file of manifest.files) assert.ok(readFileSync(join(PACKAGE, "dist/portable", file)).length > 0);
  for (const dependency of [...manifest.thirdParty, ...manifest.buildTools]) {
    const license = readFileSync(join(PACKAGE, "dist/portable", dependency.licenseFile), "utf8");
    assert.match(license, /Permission is hereby granted/);
    assert.match(license, /copyright/i);
  }
  assert.equal(readFileSync(join(PACKAGE, "LICENSE"), "utf8"), readFileSync(join(PACKAGE, "dist/portable/LICENSE.flowsvg.txt"), "utf8"));
  assert.match(readFileSync(join(PACKAGE, "dist/export/worker-source.js"), "utf8"), /GIF89a/);
  assert.doesNotMatch(readFileSync(join(PACKAGE, "dist/portable/player.js"), "utf8"), /GIF89a/);
}

function verifyImportsAndRuntimes() {
  const loader = join(ROOT, "deny-export-dependencies.mjs");
  writeFileSync(loader, `export async function resolve(specifier, context, next) {
    if (specifier === "gifenc" || specifier.startsWith("gifenc/") || specifier.startsWith("playwright")) throw new Error("Unexpected eager dependency: " + specifier);
    return next(specifier, context);
  }`);
  const smoke = `import { createDiagram } from "flowsvg";
    import { createPlayer } from "flowsvg/browser"; import { defineFlowPlayer } from "flowsvg/element";
    const doc = ${JSON.stringify(document)};
    if (!createDiagram(doc).renderSvg(0).includes("<svg") || typeof createPlayer !== "function" || defineFlowPlayer() !== undefined) throw Error("legacy SDK import failed");`;
  for (const node of new Set([NODE20, ...(NODE18 ? [NODE18] : [])])) run(node, ["--experimental-loader", loader, "--input-type=module", "--eval", smoke]);
  run(NODE20, ["--experimental-loader", loader, "--input-type=module", "--eval", `
    import { renderHtml } from "flowsvg/node"; import { exportGif, exportPng } from "flowsvg/export";
    if (typeof exportPng !== "function" || typeof exportGif !== "function" || !(await renderHtml(${JSON.stringify(document)})).includes("<!doctype html>")) throw Error("lazy export boundary failed");
  `]);
  if (!NODE18) console.log("Node 18 executable not provided; set FLOWSVG_NODE18_PATH for the minimum-runtime gate.");
  if (!NODE18) return;
  run(NODE18, ["--input-type=module", "--eval", `import { renderHtml, exportGif, exportPng } from "flowsvg/node";
    for (const operation of [renderHtml, exportGif, exportPng]) {
      try { await operation(${JSON.stringify(document)}); throw Error("unexpected success"); }
      catch (error) { if (!/Node 20/.test(error.message)) throw error; }
    }`]);
  const low = spawnSync(NODE18, [join(PACKAGE, "dist/node/cli.js"), "input.json", "--output", "unused.html"], { cwd: ROOT, encoding: "utf8" });
  assert.equal(low.status, 1); assert.match(low.stderr, /Node 20/);
}

function decode(bytes) {
  const buffer = Uint8Array.from(bytes).buffer;
  const parsed = parseGIF(buffer);
  const images = parsed.frames.filter((frame) => "image" in frame);
  const loop = parsed.frames.find((frame) => "application" in frame && frame.application.id === "NETSCAPE2.0");
  return { parsed, frames: decompressFrames(parsed, true), ticks: images.reduce((sum, frame) => sum + frame.gce.delay, 0),
    loop: loop ? loop.application.blocks[1] | (loop.application.blocks[2] << 8) : undefined };
}

function pixel(frame, width, x, y) {
  return Array.from(frame.patch.slice((y * width + x) * 4, (y * width + x) * 4 + 4));
}

async function verifyNode(browser) {
  const phases = [];
  const bytes = await exportGif(document, { browser, startMs: 500, endMs: 1000, speed: 2, fps: 4,
    width: 240, loopCount: 3, finalHoldMs: 250, theme: "dark", onProgress: ({ phase }) => phases.push(phase) });
  const result = decode(bytes);
  assert.deepEqual([result.parsed.lsd.width, result.parsed.lsd.height, result.ticks, result.loop], [240, 200, 50, 2]);
  assert.equal(result.frames.length, 2);
  assert.deepEqual(pixel(result.frames[0], 240, 0, 0), [16, 24, 40, 255]);
  assert.deepEqual(pixel(result.frames[0], 240, 90, 50), [255, 0, 0, 255]);
  assert.deepEqual(pixel(result.frames.at(-1), 240, 160, 50), [255, 0, 0, 255]);
  assert.ok(phases.includes("sampling") && phases.includes("encoding") && phases.at(-1) === "complete");
  const reduced = decode(await exportGif(document, { browser, fps: 2, endMs: 1000, includeCaptions: false, reducedMotion: true, finalHoldMs: 0, loopCount: 1 }));
  assert.equal(reduced.parsed.lsd.height, 120); assert.equal(reduced.ticks, 100); assert.equal(reduced.loop, undefined);
  assert.deepEqual(pixel(reduced.frames[1], 240, 160, 50), [255, 0, 0, 255]);
  for (const [options, code] of [[{ fps: 31 }, "options"], [{ width: 1921 }, "limit"], [{ loopCount: 65537 }, "options"], [{ finalHoldMs: 655350 * 1802 }, "limit"]]) {
    await assert.rejects(exportGif(document, { browser, ...options }), (error) => error.code === code);
  }
  const initialContexts = browser.contexts().length;
  const controller = new AbortController();
  await assert.rejects(exportGif(document, { browser, signal: controller.signal, onProgress: ({ phase }) => { if (phase === "encoding") controller.abort(); } }), (error) => error.code === "cancelled");
  assert.equal(browser.contexts().length, initialContexts); assert.ok(browser.isConnected());
  await assert.rejects(exportGif(document, { executablePath: "/missing/Chromium" }), (error) => error.code === "environment" && /install|executablePath/.test(error.message));
  console.log("packed Node GIF: range, speed, fps, captions, pixels, loops, limits, motion, cancellation and environment errors passed");
}

async function verifyNodePng(browser) {
  const contexts = browser.contexts().length;
  const source = structuredClone(document);
  const options = { browser, timeMs: 500, width: 480, background: "transparent" };
  const pending = exportPng(source, options);
  source.viewport.width = 12; source.nodes[0].style.fill = "#00ff00";
  options.width = 12; options.timeMs = 0; options.background = "theme";
  const bytes = await pending;
  assert.deepEqual(Array.from(bytes.slice(0, 8)), [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.equal(browser.contexts().length, contexts); assert.ok(browser.isConnected());
  const context = await browser.newContext({ offline: true });
  try {
    const page = await context.newPage();
    const pixels = await page.evaluate(async (bytes) => {
      const bitmap = await createImageBitmap(new Blob([Uint8Array.from(bytes)], { type: "image/png" }));
      const canvas = document.createElement("canvas"); canvas.width = bitmap.width; canvas.height = bitmap.height;
      const ctx = canvas.getContext("2d"); ctx.drawImage(bitmap, 0, 0); bitmap.close();
      return { size: [canvas.width, canvas.height], corner: Array.from(ctx.getImageData(0, 0, 1, 1).data), node: Array.from(ctx.getImageData(180, 100, 1, 1).data) };
    }, Array.from(bytes));
    assert.deepEqual(pixels, { size: [480, 240], corner: [0, 0, 0, 0], node: [255, 0, 0, 255] });
  } finally { await context.close(); }
  const owned = await exportPng(document, { executablePath: CHROMIUM, width: 120 });
  assert.ok(owned.length > 100);
  await assert.rejects(exportPng(document, { executablePath: "/missing/Chromium" }), (error) => error.code === "environment");
  for (const options of [{ width: 9000 }, { timeMs: Infinity }, { browser, executablePath: CHROMIUM }]) {
    await assert.rejects(exportPng(document, { browser, ...options }), (error) => ["limit", "options"].includes(error.code));
  }
  const controller = new AbortController();
  const cancelled = exportPng(document, { browser, signal: controller.signal }); controller.abort();
  await assert.rejects(cancelled, (error) => error.code === "cancelled");
  assert.equal(browser.contexts().length, contexts); assert.ok(browser.isConnected());
  console.log("packed Node PNG: offline pixels, snapshot, external browser ownership, owned browser, preflight, missing browser and cancellation passed");
}

function prepareDetachedTools() {
  const detached = join(ROOT, "detached"); mkdirSync(detached);
  cpSync(join(PACKAGE, "dist"), join(detached, "dist"), { recursive: true });
  writeFileSync(join(detached, "package.json"), '{"type":"module"}');
  writeFileSync(join(detached, "input.json"), JSON.stringify(document));
  const cli = join(detached, "dist/node/cli.js");
  // HTML needs neither node_modules nor browser preparation.
  run(NODE20, [cli, "input.json", "--output", "playback.html", "--format", "html", "--gif-export"], detached);
  assert.equal(existsSync(join(detached, "node_modules")), false);
  mkdirSync(join(detached, "node_modules"));
  cpSync(join(ROOT, "node_modules/playwright-core"), join(detached, "node_modules/playwright-core"), { recursive: true });
  run(NODE20, [cli, "input.json", "--format", "gif", "--output", "cli.gif", "--executable-path", CHROMIUM,
    "--fps", "2", "--speed", "2", "--start-ms", "500", "--end-ms", "1000", "--no-captions", "--loop-count", "1", "--final-hold-ms", "0", "--reduced-motion"], detached);
  const result = decode(readFileSync(join(detached, "cli.gif")));
  assert.deepEqual([result.parsed.lsd.width, result.parsed.lsd.height, result.ticks, result.loop], [240, 120, 25, undefined]);
  return detached;
}

async function verifyBrowserPng(browser) {
  const context = await browser.newContext({ offline: true });
  const page = await context.newPage();
  try {
    await page.addScriptTag({ content: readFileSync(join(PACKAGE, "dist/portable/export.js"), "utf8") });
    const result = await page.evaluate(async (document) => {
      const bytes = await globalThis.FlowSVGExport.exportPng(document, { timeMs: 500, width: 480, background: "transparent" });
      const bitmap = await createImageBitmap(new Blob([bytes], { type: "image/png" }));
      const canvas = globalThis.document.createElement("canvas"); canvas.width = bitmap.width; canvas.height = bitmap.height;
      const context = canvas.getContext("2d"); context.drawImage(bitmap, 0, 0); bitmap.close();
      return { dimensions: [canvas.width, canvas.height], corner: Array.from(context.getImageData(0, 0, 1, 1).data), node: Array.from(context.getImageData(180, 100, 1, 1).data), header: Array.from(bytes.slice(0, 8)) };
    }, document);
    assert.deepEqual(result.dimensions, [480, 240]);
    assert.deepEqual(result.corner, [0, 0, 0, 0]);
    assert.deepEqual(result.node, [255, 0, 0, 255]);
    assert.deepEqual(result.header, [137, 80, 78, 71, 13, 10, 26, 10]);
    console.log("packed portable browser PNG: complete bytes, selected time, dimensions and alpha passed");
  } finally { await context.close(); }
}

async function verifyHtml(browser, detached) {
  const context = await browser.newContext({ offline: true, acceptDownloads: true });
  const requests = []; context.on("request", (request) => requests.push(request.url()));
  const page = await context.newPage(); const errors = []; page.on("pageerror", (error) => errors.push(error.message));
  try {
    const htmlUrl = pathToFileURL(join(detached, "playback.html")).href;
    await page.goto(htmlUrl);
    assert.equal(await page.locator(".flowsvg-caption").textContent(), "第一步");
    await page.getByRole("button", { name: "Play", exact: true }).click();
    await page.waitForFunction(() => Number(document.querySelector('[aria-label="Progress"]').value) > 0);
    await page.getByRole("button", { name: "Pause", exact: true }).click();
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export GIF", exact: true }).click();
    const download = await downloadPromise;
    const result = decode(readFileSync(await download.path()));
    assert.equal(result.ticks, 300); assert.equal(result.frames.length, 31); assert.equal(result.loop, 0);
    assert.deepEqual([result.parsed.lsd.width, result.parsed.lsd.height], [240, 200]);
    assert.ok(result.frames[0].patch.some((value, index) => index >= 240 * 120 * 4 && index % 4 !== 3 && value < 150));
    assert.ok(requests.every((url) => url === htmlUrl || url.startsWith("blob:"))); assert.deepEqual(errors, []);
    console.log("detached offline file:// HTML playback and GIF download with inline worker passed");
  } finally { await context.close(); }
}

verifyMetadata(); verifyImportsAndRuntimes();
assert.ok(CHROMIUM, "Set FLOWSVG_CHROMIUM_PATH to prepared Chromium; release checks never install a browser.");
const basic = await renderHtml(document);
assert.doesNotMatch(basic, /GIF89a/);
const browser = await chromium.launch({ executablePath: CHROMIUM });
try { await verifyNode(browser);
  await verifyNodePng(browser); await verifyBrowserPng(browser); await verifyHtml(browser, prepareDetachedTools()); }
finally { await browser.close(); }
console.log("packed portable consumer passed");
