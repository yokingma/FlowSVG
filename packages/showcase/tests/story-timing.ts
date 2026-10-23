/** Sample SDK-compiled timing without reconstructing the authored timeline. */
import type { createDiagram } from "flowsvg";

type Diagram = ReturnType<typeof createDiagram>;

export function beatStart(diagram: Diagram, index: number): number {
  return diagram.beats[index]!.startMs;
}

export function beatMiddle(diagram: Diagram, index: number): number {
  const beat = diagram.beats[index]!;
  return (beat.startMs + beat.endMs) / 2;
}

export function sceneStart(diagram: Diagram, sceneId: string): number {
  return diagram.beats.find((beat) => beat.sceneId === sceneId)!.startMs;
}
