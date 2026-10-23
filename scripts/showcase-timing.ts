/** Read the delivered document and sample its public SDK-compiled schedule. */
import { createDiagram, type DiagramDocument } from "../packages/flowsvg/dist/index.js";
import type { Page } from "playwright-core";

type Diagram = ReturnType<typeof createDiagram>;

export async function loadStoryDiagram(page: Page, address: string, id: string): Promise<Diagram> {
  const response = await page.request.get(`${address}json/${id}.json`);
  if (!response.ok()) throw new Error(`Cannot read delivered story ${id}: HTTP ${response.status()}`);
  const document: unknown = await response.json();
  return createDiagram(document as DiagramDocument);
}

export function sceneTime(diagram: Diagram, sceneId: string, beatIndex = 0): number {
  return diagram.beats.find((beat) => beat.sceneId === sceneId && beat.beatIndex === beatIndex)!.startMs;
}

export function beatTime(diagram: Diagram, index: number): number {
  const beat = diagram.beats[index]!;
  return (beat.startMs + beat.endMs) / 2;
}
