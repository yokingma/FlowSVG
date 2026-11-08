#!/usr/bin/env node
/** Render the full-timeline showcase GIFs used by the repository and package READMEs. */
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createDiagram } from "../packages/flowsvg/dist/index.js";
import { exportGif } from "../packages/flowsvg/dist/node.js";
import { basicShapesExample } from "../packages/showcase/dist/examples/basic-shapes.js";
import { requestResponseExample } from "../packages/showcase/dist/examples/request-response.js";
import { webServiceDeploymentExample } from "../packages/showcase/dist/examples/web-service-deployment.js";
import { llmInferenceExample } from "../packages/showcase/dist/examples/llm-inference.js";

const output = resolve("packages/flowsvg/docs/images");
const executablePath = process.env.FLOWSVG_CHROMIUM_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PREVIEW_SPEED = 1.5;
await mkdir(output, { recursive: true });

const jobs = [
  ["basic-shapes.gif", basicShapesExample.document, 700],
  ["request-response.gif", requestResponseExample.document, 700],
  ["web-service-deployment.gif", webServiceDeploymentExample.document, 700],
  ["llm-inference.gif", llmInferenceExample.document, 640]
];

for (const [name, document, width] of jobs) {
  const endMs = createDiagram(document).totalDuration;
  const bytes = await exportGif(document, {
    startMs: 0,
    endMs,
    width,
    fps: 24,
    speed: PREVIEW_SPEED,
    includeCaptions: false,
    finalHoldMs: 600,
    theme: "dark",
    executablePath
  });
  await writeFile(resolve(output, name), bytes);
  console.log(`${name}: ${bytes.byteLength} bytes (${endMs.toFixed(0)} ms at ${PREVIEW_SPEED}x)`);
}
