#!/usr/bin/env node
/**
 * Verify a real npm tarball in a clean install so workspace source references cannot mask export/type problems.
 * Pack from a missing dist through prepack, then check file contents, framework-free imports, strict types and DOM behavior.
 * Prepare public README image URLs in a staged package while keeping source README paths suitable for local previews.
 */
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
if (args.length !== 0 && (args.length !== 2 || args[0] !== "--pack-destination" || !args[1] || args[1].startsWith("--"))) {
  throw new Error("Usage: node scripts/verify-release.mjs [--pack-destination DIR]");
}
const packDestination = args.length === 2 ? resolve(args[1]) : undefined;
const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const packageDir = join(repoRoot, "packages", "flowsvg");
const tempRoot = mkdtempSync(join(tmpdir(), "flowsvg-release-"));
const packageJson = JSON.parse(readFileSync(join(packageDir, "package.json"), "utf8"));

function run(command, args, cwd = repoRoot, env = process.env) {
  return execFileSync(command, args, { cwd, env, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });
}

// Rewrite only the staged README copies: local previews keep relative paths, npm readers use public images.
function packReleaseReadmes(sourceTarball, expectedFiles) {
  run("tar", ["-xzf", sourceTarball, "-C", tempRoot]);
  const stagedPackage = join(tempRoot, "package");
  const previewBaseUrl = `https://cdn.jsdelivr.net/npm/${packageJson.name}@${packageJson.version}/docs/images/`;
  for (const name of ["README.md", "README.zh-CN.md"]) {
    const path = join(stagedPackage, name);
    const source = readFileSync(path, "utf8");
    const published = source
      .replace(/(!\[[^\]]*\]\()\.\/docs\/images\//g, `$1${previewBaseUrl}`)
      .replace(/(<img\b[^>]*\bsrc=")\.\/docs\/images\//g, `$1${previewBaseUrl}`);
    writeFileSync(path, published);
  }
  // The first pack ran prepack and built dist. Repacking its contents must not run source-only hooks again.
  const [packed] = JSON.parse(run("npm", ["pack", "--ignore-scripts", "--json", "--pack-destination", tempRoot], stagedPackage));
  const files = packed.files.map(({ path }) => path);
  if (files.length !== expectedFiles.length || files.some((file) => !expectedFiles.includes(file))) {
    throw new Error("release README preparation changed the packed file set");
  }
  return join(tempRoot, packed.filename);
}

try {
  // A missing dist must be rebuilt by npm's packaging lifecycle, rather than hidden by an earlier workspace build.
  rmSync(join(packageDir, "dist"), { recursive: true, force: true });
  const packed = JSON.parse(run("npm", ["pack", "--json", "--pack-destination", tempRoot], packageDir));
  const sourceTarball = join(tempRoot, packed[0].filename);
  const packedFiles = packed[0].files.map(({ path }) => path);
  const documents = ["package.json", "README.md", "README.zh-CN.md", "CHANGELOG.md", "PATTERNS.md", "LICENSE"];
  // Public README images must travel with the package so private GitHub access is never required.
  const PREVIEW_IMAGES = [
    "docs/images/quick-start.png", "docs/images/node-content.png",
    "docs/images/numbered-list.png", "docs/images/numbered-list.zh-CN.png",
    "docs/images/record-tags.png", "docs/images/entity-graph.png",
    "docs/images/facts-timeline.png", "docs/images/facts-timeline.zh-CN.png", "docs/images/flowsvg-wordmark.gif",
    "docs/images/job-lifecycle.gif", "docs/images/request-response.gif", "docs/images/web-service-deployment.gif", "docs/images/llm-inference.gif"
  ];
  const EXAMPLE_FILES = ["examples/job-lifecycle.json", "examples/decision-branch.json", "examples/report-generation.json"];
  const portableFiles = [
    "dist/portable/export.js", "dist/portable/LICENSE.gifenc.txt", "dist/portable/player.js", "dist/portable/styles.css", "dist/portable/manifest.json",
    "dist/portable/LICENSE.flowsvg.txt", "dist/portable/LICENSE.esbuild.txt"
  ];
  const exportTargets = Object.values(packageJson.exports).flatMap((entry) => (
    typeof entry === "string" ? [entry] : Object.values(entry)
  ));
  for (const file of [...documents, ...PREVIEW_IMAGES, ...EXAMPLE_FILES, ...portableFiles, "dist/node/cli.js", "dist/node.d.ts", "dist/export.d.ts", "dist/export/worker-source.js", ...exportTargets.map((target) => target.replace(/^\.\//, ""))]) {
    if (!packedFiles.includes(file)) throw new Error(`tarball missing ${file}`);
  }
  const modules = [
    "export", "export/png-browser", "export/png-plan", "export/png-types", "export/rasterize", "export/browser", "export/types", "export/plan", "export/captions", "export/worker-source",
    "index", "browser", "react", "vue", "web-component", "node", "node/html", "node/cli", "node/gif", "node/gif-runtime", "node/png", "node/output",
    "browser/player", "browser/controls", "browser/select-control", "browser/export-controls", "browser/accessibility", "browser/lifecycle", "browser/svg-dom",
    "core/diagnostic-geometry", "core/geometry-diagnostics", "core/model", "core/typography", "core/validation", "core/diagram", "core/edge-geometry", "core/svg-number", "core/timeline", "core/theme", "core/color",
    "core/node-content", "core/node-content-measurement", "core/node-content-paint",
    "core/node-shape", "core/node-label", "core/node-label-measurement",
    "adapters/host-lifecycle", "adapters/react", "adapters/vue", "adapters/web-component"
  ];
  const allowedFiles = new Set([
    ...documents, ...PREVIEW_IMAGES, ...EXAMPLE_FILES, "dist/styles.css",
    ...portableFiles,
    ...modules.flatMap((module) => [`dist/${module}.js`, `dist/${module}.d.ts`])
  ]);
  for (const file of packedFiles) {
    if (!allowedFiles.has(file)) {
      throw new Error(`unexpected tarball file ${file}`);
    }
  }
  const tarball = packReleaseReadmes(sourceTarball, packedFiles);
  run("npm", ["init", "-y", "--silent"], tempRoot);
  const browserInstall = join(tempRoot, "no-browser-install");
  run("npm", ["install", "--no-audit", "--no-fund", tarball], tempRoot,
    { ...process.env, PLAYWRIGHT_BROWSERS_PATH: browserInstall });
  if (existsSync(browserInstall)) throw new Error("ordinary npm install unexpectedly prepared a browser");
  run(process.execPath, ["--input-type=module", "--eval", `
    import { createDiagram, measureNodeContent, measureNodeLabel } from "flowsvg";
    import { createPlayer } from "flowsvg/browser";
    import { defineFlowPlayer } from "flowsvg/web-component";
    import { defineFlowPlayer as defineElement } from "flowsvg/element";
    const diagram = createDiagram({ version: 1, viewport: { width: 100, height: 100 }, nodes: [], edges: [], scenes: [] });
    if (!diagram.renderSvg(0).includes("<svg")) throw new Error("framework-free core export failed");
    const geometry = createDiagram({ version: 1, viewport: { width: 300, height: 150 },
      nodes: [{ id: "from", kind: "rect", x: 0, y: 50, width: 20, height: 20 },
        { id: "to", kind: "rect", x: 250, y: 50, width: 20, height: 20 },
        { id: "barrier", kind: "ellipse", x: 120, y: 40, width: 40, height: 40 }],
      edges: [{ id: "edge", from: "from", to: "to" }], scenes: [] });
    const risks = geometry.diagnoseAt(0);
    if (risks.length !== 1 || risks[0].code !== "edge-node-overlap" || risks[0].relatedObjectIds[0] !== "barrier"
      || JSON.parse(risks[0].warningKey)[1] !== 1 || geometry.evaluateAt(0).warnings.length) {
      throw new Error("DOM-free public geometry diagnostics failed");
    }
    const labelMeasurement = measureNodeLabel({ kind: "diamond", width: 200, label: ["A", "A\\nB"] });
    if (labelMeasurement.height !== 128 || labelMeasurement.diagnostics.length) throw new Error("installed label measurement failed");
    const decision = createDiagram({ version: 1, viewport: { width: 300, height: 300 }, nodes: [{ id: "decision", kind: "diamond", x: 0, y: 0, width: 200, height: labelMeasurement.height, label: "A\\nB" }], edges: [], scenes: [] });
    if (decision.evaluateAt(0).warnings.length || !decision.renderSvg().includes("<polygon")) throw new Error("installed decision rendering failed");
    const reportSize = measureNodeLabel({ kind: "document", width: 200, label: "A\\nB\\nC" });
    const report = createDiagram({ version: 1, viewport: { width: 300, height: 300 },
      nodes: [{ id: "report", kind: "document", x: 0, y: 0, width: 200, height: reportSize.height, label: "A\\nB\\nC" }], edges: [], scenes: [] });
    if (reportSize.height !== 108 || report.evaluateAt(0).warnings.length || !report.renderSvg().includes("<polygon")) {
      throw new Error("installed document measurement or rendering failed");
    }
    const content = { blocks: [{ type: "paragraph", text: "A" }] };
    const taller = { blocks: [{ type: "paragraph", text: "A\\nB\\nC" }] };
    const measured = measureNodeContent({ kind: "rect", width: 240, content: Object.freeze([content, taller]) });
    if (measured.height !== 92 || measured.diagnostics.length) throw new Error("DOM-free content measurement failed");
    const measuredDiagram = createDiagram({ version: 1, viewport: { width: 300, height: 300 },
      nodes: [{ id: "measured", kind: "rect", x: 0, y: 0, width: 240, height: measured.height, content: taller }], edges: [], scenes: [] });
    if (measuredDiagram.evaluateAt(0).warnings.length || !measuredDiagram.renderSvg().includes("<clipPath")) {
      throw new Error("measured package dimensions do not fit evaluated SVG content");
    }
    if (typeof createPlayer !== "function" || defineFlowPlayer() !== undefined || defineElement !== defineFlowPlayer) {
      throw new Error("DOM-free browser/element imports failed");
    }
  `], tempRoot);
  run("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund", "react", "react-dom", "@types/react", "@types/react-dom", "vue", "jsdom@26.1.0", "typescript", "gifuct-js@2.1.2", "@types/node@22.19.1"], tempRoot);
  writeFileSync(join(tempRoot, "types-smoke.ts"), `
    import { createDiagram, renderSvg, measureNodeContent, type DiagramDocument, type DiagramTypography, type DiagramBeat, type NodeContent, type NodeContentMeasurementInput, type NodeContentMeasurement, type NodeContentMeasurementDiagnostic, measureNodeLabel, type NodeLabelMeasurementInput, type NodeLabelMeasurement, type NodeLabelMeasurementDiagnostic } from "flowsvg";
    import type { ContentBlock, ContentListItem, ContentListStyle, ContentTag, ContentTagStyle, ContentTagBackground, ContentGraphBlock, ContentGraphNode, ContentGraphEdge, ContentGraphLayout, ContentText, ContentTextSpan, ContentSpanStyle, ContentSpan, ContentTextStyle, ContentAlignment, ContentSafeArea, ContentLine, NodeContentLayout, NodeKind, EdgeRoute, PortDirection, FlowDirection, ThemeName, Viewport, NodeStyle, EdgeStyle, DiagramNode, DiagramEdge, Scene, Beat, NodeVisualState, EdgeVisualState, Action, ValidationIssue, EvaluateOptions, SvgRenderOptions, TextLine, EvaluatedNode, EvaluatedEdge, EdgeFlowMarker, LayoutWarning, GeometryWarning, GeometryWarningCode, TextOverflowWarning, CameraState, HitObjectType, HitObject, DiagramPoint, DiagramFrameState, DiagramValidationError, Diagram } from "flowsvg";
    import type { FlowPlayer, PlayerOptions } from "flowsvg/browser";
    import { renderHtml, exportGif as exportNodeGif, type HtmlRenderOptions, type NodeGifExportOptions, exportPng as exportNodePng, type NodePngExportOptions } from "flowsvg/node";
    import { exportPng, PngExportError, type PngExportOptions, type PngExportErrorCode, exportGif, GifExportError, type GifExportOptions, type GifExportProgress, type GifExportErrorCode } from "flowsvg/export";
    const pngOptions: PngExportOptions = { timeMs: 0, width: 640, background: "transparent", reducedMotion: false, theme: "dark", signal: new AbortController().signal };
    const pngCode: PngExportErrorCode = "rasterization";
    const svgOptions: SvgRenderOptions = { background: "transparent" };
    void [exportPng, PngExportError, pngOptions, pngCode, svgOptions];
    const progress = (value: GifExportProgress): void => { const phase: string = value.phase; void phase; };
    const options: GifExportOptions = { startMs: 0, endMs: 1000, width: 320, fps: 15, speed: 2,
      includeCaptions: true, captionHeight: 80, loopCount: 65536, finalHoldMs: 0, reducedMotion: false,
      theme: "dark", signal: new AbortController().signal, onProgress: progress };
    const nodeOptions: NodeGifExportOptions = { ...options, executablePath: "/prepared/chromium" };
    const nodePngOptions: NodePngExportOptions = { timeMs: 0, width: 1280, background: "transparent", executablePath: "/prepared/chromium" };
    void [exportNodePng, nodePngOptions];
    const htmlOptions: HtmlRenderOptions = { gifExport: true };
    const playerOptions: PlayerOptions = { gifExport: true };
    const code: GifExportErrorCode = "limit";
    void [renderHtml, exportNodeGif, exportGif, GifExportError, nodeOptions, htmlOptions, playerOptions, code];
    import { defineFlowPlayer } from "flowsvg/element";
    import { FlowPlayer as ReactPlayer } from "flowsvg/react";
    import { FlowPlayer as VuePlayer } from "flowsvg/vue";
    const values: unknown[] = [renderSvg, defineFlowPlayer, ReactPlayer, VuePlayer];
    const playerType: FlowPlayer | undefined = undefined;
    const content: NodeContent = { blocks: [
      { type: "title", text: "Facts" },
      { type: "list", marker: "none", items: [{ tags: [{ text: "verified" }], status: "new",
        body: [{ text: "Confirmed", style: { fontSize: 14, fontWeight: 700 } }], auxiliary: "2026-10-18" }] }
    ] };
    const typography: DiagramTypography = { nodeLabel: 20, edgeLabel: 18, flowLabel: 16 };
    const measurementInput: NodeContentMeasurementInput = { typography, kind: "cylinder", width: 240, content: Object.freeze([content]) };
    const measurement: NodeContentMeasurement = measureNodeContent(measurementInput);
    const labelInput: NodeLabelMeasurementInput = { kind: "diamond", width: 200, label: Object.freeze(["A", "B"]) };
    const labelMeasurement: NodeLabelMeasurement = measureNodeLabel(labelInput);
    const labelDiagnostic: NodeLabelMeasurementDiagnostic | undefined = labelMeasurement.diagnostics[0];
    void labelDiagnostic;
    const reportInput: NodeLabelMeasurementInput = { kind: "document", width: 200, label: "Report" };
    measureNodeLabel(reportInput);
    const diagnostic: NodeContentMeasurementDiagnostic | undefined = measurement.diagnostics[0];
    const diagnosticDimension: "width" | "height" | undefined = diagnostic?.dimension;
    void diagnosticDimension;
    const authored: DiagramDocument = { version: 1, typography, viewport: { width: 320, height: 260 },
      nodes: [{ id: "facts", kind: "cylinder", x: 20, y: 20, width: 240, height: measurement.height, content }], edges: [],
      scenes: [{ id: "modes", label: "Modes", beats: [
        { durationMs: 500, actions: [{ type: "updateNode", target: "facts", value: { content } }] },
        { durationMs: 500, actions: [{ type: "updateNode", target: "facts", value: { content: null } }] }
      ] }] };
    const geometryWarnings: GeometryWarning[] = createDiagram(authored).diagnoseAt(0, { theme: "dark", reducedMotion: false });
    const geometryCode: GeometryWarningCode | undefined = geometryWarnings[0]?.code;
    const textWarning: TextOverflowWarning = { code: "text-overflow", objectId: "facts", path: "nodes[0].content", message: "example" };
    const layoutWarnings: LayoutWarning[] = [textWarning, ...geometryWarnings];
    for (const warning of layoutWarnings) {
      if (warning.code !== "text-overflow") { const key: string = warning.warningKey; void key; }
    }
    void [geometryCode, textWarning];
    const schedule: readonly DiagramBeat[] = createDiagram(authored).beats;
    const firstBeat: DiagramBeat | undefined = schedule[0];
    const timing: number | undefined = firstBeat?.endMs;
    const caption: string | undefined = firstBeat?.caption;
    void [timing, caption];
    renderSvg(authored, 500); void values; void playerType;
  `);
  run("npx", ["--no-install", "tsc", "--noEmit", "--strict", "--module", "NodeNext", "--moduleResolution", "NodeNext", "--target", "ES2022", "--types", "node,react,react-dom", "types-smoke.ts"], tempRoot);

  // A separate process imports core/browser without a DOM, then prepares JSDOM for mounting.
  // Import adapters dynamically after DOM setup; this smoke check does not replace real-browser interaction tests.
  const fixture = `
    import { JSDOM } from "jsdom";
    import { createDiagram, renderSvg } from "flowsvg";
    import { createPlayer } from "flowsvg/browser";
    import { readFileSync } from "node:fs";

    const model = { version: 1, title: "Release smoke", viewport: { width: 320, height: 320 },
      nodes: [{ id: "node", kind: "cylinder", x: 20, y: 20, width: 240, height: 260, content: { blocks: [
        { type: "title", text: "Facts" }, { type: "list", marker: "none", items: [
          { tags: [{ text: "verified" }], status: "new", body: [{ text: "Confirmed", style: { fontSize: 14, fontWeight: 700 } }], auxiliary: "2026-10-18" }
        ] }
      ] } }], edges: [],
      scenes: [{ id: "release", label: "Release", beats: [
        { durationMs: 250, actions: [] },
        { durationMs: 250, actions: [{ type: "updateNode", target: "node", value: { content: { blocks: [
          { type: "title", text: "Updated Facts" }, { type: "list", items: [{ tags: [{ text: "paid" }], status: "done", body: "Replacement", auxiliary: "2026-10-19" }] }
        ] } } }] },
        { durationMs: 500, actions: [{ type: "updateNode", target: "node", value: { content: null } }] }
      ] }] };
    if (!createDiagram(model).evaluateAt(0).nodes.length || !renderSvg(model, 0).includes("<svg")) throw new Error("core export failed");
    if (!readFileSync(new URL("./node_modules/flowsvg/dist/styles.css", import.meta.url), "utf8").includes("flowsvg")) throw new Error("styles export failed");
    const dom = new JSDOM("<!doctype html><body><div id=host></div></body>", { url: "http://localhost/" });
    Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement,
      Element: dom.window.Element, SVGElement: dom.window.SVGElement, Node: dom.window.Node,
      CustomEvent: dom.window.CustomEvent, PointerEvent: dom.window.PointerEvent, customElements: dom.window.customElements,
      requestAnimationFrame: (cb) => setTimeout(() => cb(Date.now()), 0),
      cancelAnimationFrame: clearTimeout });
    dom.window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
    const { defineFlowPlayer } = await import("flowsvg/element");
    const { createApp, h, ref } = await import("vue");
    const { FlowPlayer: VuePlayer } = await import("flowsvg/vue");
    const React = (await import("react")).default;
    const { FlowPlayer: ReactPlayer } = await import("flowsvg/react");
    const { createRoot } = await import("react-dom/client");
    function assertContent(handle, host, name) {
      handle.seek(0);
      if (!host.querySelector("[data-content-id=node]")?.textContent.includes("verified")) throw new Error(name + " content did not mount");
      handle.seek(250);
      const replacement = host.querySelector("[data-content-id=node]")?.textContent;
      if (!replacement?.includes("paid") || !replacement.includes("Replacement") || replacement.includes("verified")) throw new Error(name + " content did not replace");
      handle.seek(500);
      if (host.querySelector("[data-content-id=node]") || host.querySelector("clipPath")) throw new Error(name + " content did not clear");
      if (handle.getState().frame.nodes[0].labelLines.length) throw new Error(name + " restored a historical label");
      handle.seek(0);
    }
    const host = document.querySelector("#host");
    const player = createPlayer(host, model, { controls: false, reducedMotion: true });
    if (player.getState().timeMs !== 0 || player.getState().totalDuration !== 1_000) throw new Error("native player did not initialize");
    assertContent(player, host, "native");
    player.play();
    if (!player.getState().playing) throw new Error("native player did not play");
    player.load(model);
    if (player.getState().playing || player.getState().timeMs !== 0) throw new Error("native player did not load");
    player.destroy();
    if (host.childElementCount !== 0) throw new Error("native player did not clean up");
    defineFlowPlayer();
    const element = document.createElement("flowsvg-player");
    document.body.append(element);
    element.document = model;
    const elementState = element.getState();
    if (!elementState || elementState.timeMs !== 0 || elementState.totalDuration !== 1_000) throw new Error("web component did not mount");
    assertContent(element, element, "element");
    element.play();
    if (!element.getState()?.playing) throw new Error("web component did not play");
    element.document = model;
    if (element.getState()?.playing || element.getState()?.timeMs !== 0) throw new Error("web component did not load");
    element.remove();
    if (element.getState() !== undefined || element.childElementCount !== 0) throw new Error("web component did not clean up");
    const vueHost = document.createElement("div"); document.body.append(vueHost);
    const vueRef = ref(null);
    const vueApp = createApp({ render: () => h(VuePlayer, { ref: vueRef, document: model, controls: false }) });
    vueApp.mount(vueHost);
    if (!vueRef.value || !vueHost.querySelector("svg")) throw new Error("Vue player did not mount");
    assertContent(vueRef.value, vueHost, "Vue");
    vueApp.unmount();
    if (vueHost.childElementCount || vueRef.value !== null) throw new Error("Vue player did not clean up");
    const reactHost = document.createElement("div"); document.body.append(reactHost);
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    const reactRoot = createRoot(reactHost);
    const reactRef = React.createRef();
    // Flush the commit and mount effects; rendering and immediately unmounting can cancel the mount entirely.
    await React.act(async () => {
      reactRoot.render(React.createElement(ReactPlayer, {
        ref: reactRef, document: model, initialTimeMs: 250, speed: 1.5, controls: false
      }));
    });
    const reactHandle = reactRef.current;
    if (!reactHost.querySelector("svg") || !reactHandle || reactHandle.getState().timeMs !== 250 || reactHandle.getState().speed !== 1.5) throw new Error("React player did not mount with its props");
    assertContent(reactHandle, reactHost, "React");
    reactHandle.play();
    if (!reactHandle.getState().playing) throw new Error("React player did not play");
    reactHandle.load(model);
    if (reactHandle.getState().playing || reactHandle.getState().timeMs !== 0) throw new Error("React player did not load");
    await React.act(async () => { reactRoot.unmount(); });
    if (reactHost.childElementCount !== 0 || reactRef.current !== null) throw new Error("React player did not clean up");
    let reactReleased = false;
    try { reactHandle.getState(); } catch (error) {
      if (!(error instanceof Error) || error.message !== "FlowPlayer is not mounted") throw error;
      reactReleased = true;
    }
    if (!reactReleased) throw new Error("React player retained its instance after unmount");
    console.log("release smoke passed");
  `;
  const fixturePath = join(tempRoot, "smoke.mjs");
  writeFileSync(fixturePath, fixture);
  run(process.execPath, [fixturePath], tempRoot);

  // Check the documented lower bounds too; current framework types can hide incompatible declaration output.
  run("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund", "react@18.0.0", "react-dom@18.0.0", "@types/react@18", "@types/react-dom@18", "vue@3.5.0"], tempRoot);
  run("npx", ["--no-install", "tsc", "--noEmit", "--strict", "--module", "NodeNext", "--moduleResolution", "NodeNext", "--target", "ES2022", "--types", "node,react,react-dom", "types-smoke.ts"], tempRoot);
  run(process.execPath, ["--input-type=module", "--eval", `
    import { createElement } from "react";
    import { renderToString as renderReact } from "react-dom/server";
    import { createSSRApp } from "vue";
    import { renderToString as renderVue } from "vue/server-renderer";
    import { FlowPlayer as ReactPlayer } from "flowsvg/react";
    import { FlowPlayer as VuePlayer } from "flowsvg/vue";
    const document = { version: 1, viewport: { width: 100, height: 100 }, nodes: [], edges: [], scenes: [] };
    if (!renderReact(createElement(ReactPlayer, { document })).includes("flowsvg")) throw new Error("minimum React SSR failed");
    if (!(await renderVue(createSSRApp(VuePlayer, { document }))).includes("flowsvg")) throw new Error("minimum Vue SSR failed");
  `], tempRoot);

  // Run the copied verifier beside the installed package, never against workspace modules.
  const consumerPath = join(tempRoot, "portable-consumer.mjs");
  copyFileSync(join(repoRoot, "scripts", "verify-portable-consumer.mjs"), consumerPath);
  console.log(run(process.env.FLOWSVG_NODE20_PATH ?? process.execPath, [consumerPath], tempRoot));

  for (const subpath of ["./node", "./export", ".", "./browser", "./element", "./web-component", "./react", "./vue"]) if (!packageJson.exports[subpath]) throw new Error(`missing export ${subpath}`);
  console.log(`release verification passed for ${packageJson.name}@${packageJson.version}`);
  // Retain only the bytes that passed every consumer check; never repack for publication.
  if (packDestination) {
    mkdirSync(packDestination, { recursive: true });
    const artifact = join(packDestination, packed[0].filename);
    copyFileSync(tarball, artifact);
    console.log(`verified tarball: ${artifact}`);
  }
  if (process.env.KEEP_RELEASE_TEMP === "1") console.log(`tarball: ${tarball}`);
} finally {
  // Clean temporary installs by default; opt in to retaining the directory for tarball/smoke debugging.
  if (process.env.KEEP_RELEASE_TEMP !== "1") rmSync(tempRoot, { recursive: true, force: true });
}
