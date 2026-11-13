/**
 * Verify emphasis through an installed SDK, real framework hosts and offline image/CLI delivery.
 * The release gate copies this file beside its tarball install; no workspace source is available.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { JSDOM } from "jsdom";
import { parseGIF, decompressFrames } from "gifuct-js";
import { chromium } from "playwright-core";
import { createDiagram } from "flowsvg";
import { createPlayer } from "flowsvg/browser";
import { renderHtml, exportPng, exportGif } from "flowsvg/node";

const ROOT = process.cwd();
const PACKAGE = join(ROOT, "node_modules/flowsvg");
const EVIDENCE = join(ROOT, "emphasis-evidence");
const CHROMIUM = process.env.FLOWSVG_CHROMIUM_PATH;
const ORANGE = "#c2410a";
const TEAL = "#0f766e";
const DOCUMENT_STROKE = "#b45309";
const model = {
  version: 1, title: "Emphasis delivery", viewport: { width: 640, height: 360 },
  emphasis: { fill: "#fff4db", stroke: DOCUMENT_STROKE, markerText: "#ffffff" },
  nodes: [
    { id: "a", kind: "roundedRect", x: 30, y: 40, width: 120, height: 70, label: "Sender" },
    { id: "b", kind: "roundedRect", x: 490, y: 40, width: 120, height: 70, label: "Receiver" },
    { id: "c", kind: "roundedRect", x: 30, y: 245, width: 120, height: 70, label: "Source" },
    { id: "d", kind: "roundedRect", x: 490, y: 245, width: 120, height: 70, label: "Target" },
    { id: "idle", kind: "roundedRect", x: 270, y: 145, width: 100, height: 70, label: "Hover" }
  ],
  edges: [
    { id: "request", from: "a", to: "b", label: "Request", style: { stroke: ORANGE, dashed: true } },
    { id: "response", from: "c", to: "d" }
  ],
  scenes: [{ id: "colors", label: "Colors", beats: [
    { durationMs: 1000, transitionMs: 0, actions: [
      { type: "flow", target: "request", direction: "forward", text: "Send", highlightEdge: false, highlightParticipants: false }
    ] },
    { durationMs: 1000, transitionMs: 0, actions: [
      { type: "flow", target: "request", direction: "reverse", text: "Return", highlightEdge: false }
    ] },
    { durationMs: 800, transitionMs: 0, actions: [
      { type: "highlight", target: "request" },
      { type: "flow", target: "request", direction: "forward", text: "Send", highlightEdge: false, highlightParticipants: false },
      { type: "flow", target: "response", direction: "reverse", text: "Return", highlightParticipants: false }
    ] },
    { durationMs: 1000, transitionMs: 0, actions: [
      { type: "unhighlight", target: "request" },
      { type: "updateEdge", target: "request", value: { stroke: "#7c3aed" } },
      { type: "flow", target: "request", direction: "forward", highlightEdge: false, highlightParticipants: false }
    ] },
    { durationMs: 200, transitionMs: 0, actions: [] }
  ] }]
};
const imageModel = {
  ...model,
  scenes: [{ id: "delivery", label: "Delivery", beats: [
    { durationMs: 800, transitionMs: 0, caption: "Retain relation color", actions: [
      { type: "highlight", target: "a" },
      { type: "flow", target: "request", direction: "forward", text: "Send", highlightEdge: false, highlightParticipants: false },
      { type: "flow", target: "response", direction: "reverse", text: "Return", highlightParticipants: false }
    ] },
    { durationMs: 200, transitionMs: 0, actions: [{ type: "unhighlight", target: "a" }] }
  ] }]
};

function verifyCore() {
  const diagram = createDiagram(model);
  const ordinary = createDiagram({ ...model, scenes: model.scenes.map(scene => ({ ...scene, beats: scene.beats.map(beat => ({
    ...beat, actions: beat.actions.map(action => action.type === "flow" ? { ...action, highlightEdge: true } : action)
  })) })) });
  assert.deepEqual(diagram.beats, ordinary.beats, "paint policy must not change compiled timing");
  for (const theme of ["light", "dark"]) for (const reducedMotion of [false, true]) {
    const options = { theme, reducedMotion, emphasis: { stroke: TEAL } };
    const forward = diagram.evaluateAt(200, options);
    assert.equal(forward.edges[0].style.stroke, ORANGE); assert.equal(forward.edges[0].highlighted, true);
    assert.equal(forward.nodes[0].highlighted, false);
    assert.equal(Boolean(forward.edges[0].flow), !reducedMotion);
    const reverse = diagram.evaluateAt(diagram.beats[1].startMs + 200, options);
    assert.equal(reverse.edges[0].style.stroke, ORANGE); assert.equal(reverse.nodes[1].style.stroke, TEAL);
    const multi = diagram.evaluateAt(diagram.beats[2].startMs + 200, options);
    assert.deepEqual(multi.edges.map(edge => edge.style.stroke), [TEAL, TEAL], "explicit emphasis survives disabled flow paint");
    assert.equal(diagram.evaluateAt(diagram.beats[3].startMs + 200, options).edges[0].style.stroke, "#7c3aed");
    const completed = diagram.evaluateAt(diagram.totalDuration, options);
    assert.equal(completed.edges[0].style.stroke, "#7c3aed"); assert.equal(completed.edges[0].highlighted, false);
    const svg = diagram.renderSvg(200, options);
    assert.equal(svg.includes('data-flow-id="request"'), !reducedMotion);
    if (!reducedMotion) assert.match(svg, /fill="#ffffff"[^>]*font-size="12"/);
  }
}

function normalizedSvg(svg) {
  const holder = document.createElement("div"); holder.innerHTML = svg;
  return holder.querySelector("svg").outerHTML;
}
function assertHost(handle, host, name, options) {
  handle.seek(200);
  const expected = createDiagram(imageModel);
  assert.deepEqual(handle.getState().frame, expected.evaluateAt(200, options), `${name} frame`);
  assert.equal(host.querySelector("svg").outerHTML, normalizedSvg(expected.renderSvg(200, options)), `${name} SVG`);
  assert.equal(host.querySelector('[data-id="request"]').getAttribute("stroke"), ORANGE);
  assert.equal(host.querySelector('[data-id="a"]').getAttribute("fill"), "#fff4db");
  assert.equal(host.querySelector('[data-flow-id="request"]').getAttribute("fill"), options.emphasis?.stroke ?? DOCUMENT_STROKE);
}
async function verifyHosts() {
  const dom = new JSDOM("<!doctype html><body></body>", { url: "http://localhost/" });
  Object.assign(globalThis, {
    window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement,
    Element: dom.window.Element, SVGElement: dom.window.SVGElement, Node: dom.window.Node,
    CustomEvent: dom.window.CustomEvent, customElements: dom.window.customElements,
    requestAnimationFrame: callback => setTimeout(() => callback(Date.now()), 0), cancelAnimationFrame: clearTimeout
  });
  Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true });
  dom.window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  const { defineFlowPlayer } = await import("flowsvg/element");
  const React = await import("react");
  const { createRoot } = await import("react-dom/client");
  const { FlowPlayer: ReactPlayer } = await import("flowsvg/react");
  const { createApp, h, nextTick, shallowRef } = await import("vue");
  const { FlowPlayer: VuePlayer } = await import("flowsvg/vue");
  defineFlowPlayer(); globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  for (const theme of ["light", "dark"]) {
    const options = { theme, reducedMotion: false, controls: false, emphasis: { stroke: TEAL } };
    const nativeHost = document.createElement("div"); document.body.append(nativeHost);
    const player = createPlayer(nativeHost, imageModel, options);
    assertHost(player, nativeHost, "native", options); player.destroy();
    assert.equal(nativeHost.childElementCount, 0);

    const element = document.createElement("flowsvg-player");
    element.document = imageModel; element.emphasis = options.emphasis;
    element.setAttribute("theme", theme); element.setAttribute("controls", "false");
    document.body.append(element); assertHost(element, element, "element", options);
    element.remove(); document.body.append(element); assertHost(element, element, "reconnected element", options);
    element.emphasis = undefined; assertHost(element, element, "cleared element", { ...options, emphasis: undefined });
    element.remove(); assert.equal(element.getState(), undefined);

    const vueHost = document.createElement("div"); document.body.append(vueHost);
    const vueHandle = shallowRef(); const vueEmphasis = shallowRef(options.emphasis);
    const app = createApp({ render: () => h(VuePlayer, { ...options, emphasis: vueEmphasis.value, document: imageModel, ref: vueHandle }) });
    app.mount(vueHost); assertHost(vueHandle.value, vueHost, "Vue", options);
    vueEmphasis.value = { stroke: "#7c3aed" }; await nextTick();
    assertHost(vueHandle.value, vueHost, "updated Vue", { ...options, emphasis: vueEmphasis.value });
    vueEmphasis.value = undefined; await nextTick();
    assertHost(vueHandle.value, vueHost, "cleared Vue", { ...options, emphasis: undefined });
    app.unmount(); assert.equal(vueHost.childElementCount, 0);

    const reactHost = document.createElement("div"); document.body.append(reactHost);
    const reactHandle = React.createRef(); const root = createRoot(reactHost);
    const render = emphasis => React.act(async () => root.render(React.createElement(ReactPlayer, { ...options, emphasis, document: imageModel, ref: reactHandle })));
    await render(options.emphasis); assertHost(reactHandle.current, reactHost, "React", options);
    await render({ stroke: "#7c3aed" }); assertHost(reactHandle.current, reactHost, "updated React", { ...options, emphasis: { stroke: "#7c3aed" } });
    await render(undefined); assertHost(reactHandle.current, reactHost, "cleared React", { ...options, emphasis: undefined });
    await React.act(async () => root.unmount()); assert.equal(reactHost.childElementCount, 0);
  }
  dom.window.close();
}

function decodeGif(bytes) { return decompressFrames(parseGIF(Uint8Array.from(bytes).buffer), true); }
function assertPixels(pixels, width, stroke) {
  const rgb = hex => hex.slice(1).match(/../g).map(part => Number.parseInt(part, 16));
  const count = color => {
    const expected = rgb(color); let matches = 0;
    for (let offset = 0; offset < pixels.length; offset += 4) {
      if (expected.every((value, channel) => Math.abs(pixels[offset + channel] - value) < 8)) matches += 1;
    }
    return matches;
  };
  assert.ok(count(ORANGE) > 50, "orange relation must survive flow");
  assert.ok(count(stroke) > 50, "resolved emphasis must reach encoded pixels");
  const fillOffset = (60 * width + 60) * 4;
  assert.deepEqual(Array.from(pixels.slice(fillOffset, fillOffset + 3)), [255, 244, 219], "document fill survives runtime stroke override");
  const emphasisRgb = rgb(stroke);
  for (let y = 143; y < 218; y += 1) for (let x = 268; x < 373; x += 1) {
    const offset = (y * width + x) * 4;
    assert.ok(!emphasisRgb.every((value, channel) => Math.abs(pixels[offset + channel] - value) < 8), "hover paint must stay outside exports");
  }
}
async function pngPixels(page, bytes, filename) {
  const result = await page.evaluate(async bytes => {
    const bitmap = await createImageBitmap(new Blob([Uint8Array.from(bytes)], { type: "image/png" }));
    const canvas = document.createElement("canvas"); canvas.width = bitmap.width; canvas.height = bitmap.height;
    const context = canvas.getContext("2d"); context.drawImage(bitmap, 0, 0); bitmap.close();
    return { pixels: Array.from(context.getImageData(0, 0, canvas.width, canvas.height).data), width: canvas.width, height: canvas.height };
  }, Array.from(bytes));
  writeFileSync(join(EVIDENCE, filename), bytes);
  return result;
}
async function saveGifFrame(page, frame, filename) {
  const encoded = await page.evaluate(({ pixels, width, height }) => {
    const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height;
    canvas.getContext("2d").putImageData(new ImageData(Uint8ClampedArray.from(pixels), width, height), 0, 0);
    return canvas.toDataURL("image/png").split(",")[1];
  }, { pixels: Array.from(frame.patch), width: frame.dims.width, height: frame.dims.height });
  writeFileSync(join(EVIDENCE, filename), Buffer.from(encoded, "base64"));
}
async function verifyDelivery(browser, theme) {
  const options = { theme, emphasis: { stroke: TEAL }, gifExport: true };
  const htmlTask = renderHtml(imageModel, options);
  options.emphasis.stroke = "#ff0000";
  const htmlPath = join(EVIDENCE, `${theme}.html`); writeFileSync(htmlPath, await htmlTask);
  const context = await browser.newContext({ offline: true, acceptDownloads: true });
  const requests = []; context.on("request", request => requests.push(request.url()));
  const page = await context.newPage(); const errors = []; page.on("pageerror", error => errors.push(error.message));
  try {
    const htmlUrl = pathToFileURL(htmlPath).href; await page.goto(htmlUrl);
    const slider = page.getByRole("slider", { name: "Progress" });
    await slider.fill("200"); await slider.dispatchEvent("input");
    const expectedSvg = createDiagram(imageModel).renderSvg(200, { theme, emphasis: { stroke: TEAL } });
    const normalized = await page.evaluate(svg => { const root = document.createElement("div"); root.innerHTML = svg; return root.querySelector("svg").outerHTML; }, expectedSvg);
    assert.equal(await page.locator(".flowsvg-canvas svg").evaluate(svg => svg.outerHTML), normalized);
    await page.locator(".flowsvg-canvas").screenshot({ path: join(EVIDENCE, `${theme}-playback.png`) });
    const idle = page.locator('[data-id="idle"]'); const box = await idle.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    assert.equal(await idle.getAttribute("stroke"), TEAL);
    assert.equal(await idle.getAttribute("fill"), theme === "dark" ? "#1d2939" : "#ffffff");
    await page.locator(".flowsvg-canvas").screenshot({ path: join(EVIDENCE, `${theme}-hover.png`) });
    const downloadTask = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export GIF", exact: true }).evaluate(button => button.click());
    const download = await downloadTask; const playerGif = readFileSync(await download.path());
    writeFileSync(join(EVIDENCE, `${theme}-player.gif`), playerGif);
    const playerFrame = decodeGif(playerGif)[0]; assertPixels(playerFrame.patch, 640, TEAL);
    await saveGifFrame(page, playerFrame, `${theme}-player-frame.png`);
    await page.mouse.move(0, 0);
    assert.equal(await idle.getAttribute("stroke"), theme === "dark" ? "#475467" : "#cfd8e3");
    await page.locator(".flowsvg-canvas").screenshot({ path: join(EVIDENCE, `${theme}-restored.png`) });

    const nodeOptions = { theme, browser, timeMs: 200, emphasis: { stroke: TEAL } };
    const nodePngTask = exportPng(imageModel, nodeOptions); nodeOptions.emphasis.stroke = "#ff0000";
    const nodePixels = await pngPixels(page, await nodePngTask, `${theme}-node.png`); assertPixels(nodePixels.pixels, 640, TEAL);
    const gifOptions = { theme, browser, fps: 2, endMs: 500, finalHoldMs: 0, includeCaptions: false, emphasis: { stroke: TEAL } };
    const nodeGifTask = exportGif(imageModel, gifOptions); gifOptions.emphasis.stroke = "#ff0000";
    const nodeGif = await nodeGifTask; writeFileSync(join(EVIDENCE, `${theme}-node.gif`), nodeGif);
    const nodeFrame = decodeGif(nodeGif)[0]; assertPixels(nodeFrame.patch, 640, TEAL);
    await saveGifFrame(page, nodeFrame, `${theme}-node-frame.png`);

    const browserBytes = await page.evaluate(async ({ model, theme, stroke }) => {
      const options = { theme, timeMs: 200, emphasis: { stroke } };
      const pngTask = globalThis.FlowSVGExport.exportPng(model, options); options.emphasis.stroke = "#ff0000";
      const gifOptions = { theme, fps: 2, endMs: 500, finalHoldMs: 0, includeCaptions: false, emphasis: { stroke } };
      const gifTask = globalThis.FlowSVGExport.exportGif(model, gifOptions); gifOptions.emphasis.stroke = "#ff0000";
      return { png: Array.from(await pngTask), gif: Array.from(await gifTask) };
    }, { model: imageModel, theme, stroke: TEAL });
    const browserPixels = await pngPixels(page, Uint8Array.from(browserBytes.png), `${theme}-browser.png`); assertPixels(browserPixels.pixels, 640, TEAL);
    assertPixels(decodeGif(browserBytes.gif)[0].patch, 640, TEAL);
    assert.deepEqual(errors, []); assert.ok(requests.every(url => url === htmlUrl || url.startsWith("blob:")));
  } finally { await context.close(); }
}
async function verifyCli(browser) {
  const jsonPath = join(EVIDENCE, "cli.json"); writeFileSync(jsonPath, JSON.stringify(imageModel));
  const cli = join(PACKAGE, "bin/flowsvg.mjs");
  const node = process.env.FLOWSVG_NODE20_PATH ?? process.execPath;
  execFileSync(node, [cli, jsonPath, "--overwrite", "--format", "html", "--output", join(EVIDENCE, "cli.html")], { cwd: ROOT });
  execFileSync(node, [cli, jsonPath, "--overwrite", "--format", "gif", "--output", join(EVIDENCE, "cli.gif"), "--executable-path", CHROMIUM,
    "--fps", "2", "--end-ms", "500", "--no-captions", "--final-hold-ms", "0"], { cwd: ROOT });
  assertPixels(decodeGif(readFileSync(join(EVIDENCE, "cli.gif")))[0].patch, 640, DOCUMENT_STROKE);
  const context = await browser.newContext({ offline: true });
  try {
    const page = await context.newPage(); await page.goto(pathToFileURL(join(EVIDENCE, "cli.html")).href);
    assert.equal(await page.locator('[data-id="request"]').getAttribute("stroke"), ORANGE);
    assert.equal(await page.locator('[data-flow-id="request"]').getAttribute("fill"), DOCUMENT_STROKE);
  } finally { await context.close(); }
}

mkdirSync(EVIDENCE, { recursive: true });
verifyCore(); await verifyHosts();
assert.ok(CHROMIUM, "Prepare FLOWSVG_CHROMIUM_PATH for installed emphasis delivery checks.");
const browser = await chromium.launch({ executablePath: CHROMIUM });
try { for (const theme of ["light", "dark"]) await verifyDelivery(browser, theme); await verifyCli(browser); }
finally { await browser.close(); }
console.log(`packed emphasis: core, Native/React/Vue/element, browser/Node PNG/GIF, offline HTML, player GIF and CLI passed; evidence: ${EVIDENCE}`);
