/**
 * Deterministic global timeline: compile actions/snapshots and evaluate base styles, visibility, highlights and focus.
 * Spatial layout and SVG output belong to the core; theme defaults are supplied only during evaluation.
 */
import type { DiagramBeat, DiagramDocument, EvaluateOptions, FlowDirection, NodeVisualState, EdgeVisualState } from "./model.js";
import { mixColor } from "./color.js";
import { DiagramValidationError } from "./validation.js";

type VisualValues = NodeVisualState & EdgeVisualState;
/** Snapshot layers keep base visual values separate from visibility and highlighting. */
interface ObjectState {
  visible: boolean;
  highlighted: boolean;
  kind: "node" | "edge";
  values: VisualValues;
}

/** Evaluation-time theme defaults; unspecified snapshot colors remain unresolved so compilation does not fix a theme. */
export interface TimelinePalette {
  fill: string;
  stroke: string;
  edge: string;
}

/** Global millisecond interval and before/after snapshots; caption and focus retain inherited values. */
interface CompiledBeat extends DiagramBeat {
  transitionMs: number;
  movementMs: number;
  focusBefore: string | null;
  focusAfter: string | null;
  before: ReadonlyMap<string, ObjectState>;
  after: ReadonlyMap<string, ObjectState>;
  flows: readonly CompiledFlow[];
}

/** One beat-local transfer; single-flow movement may finish before its beat, and no flow persists in snapshots. */
export interface CompiledFlow {
  target: string;
  direction: FlowDirection;
  text?: string;
  highlightParticipants: boolean;
}

/** Object transition result; highlight is the overlay weight, while highlighted is the target logical state. */
export interface TimelineObject {
  visible: boolean;
  opacity: number;
  highlight: number;
  highlighted: boolean;
  values: VisualValues;
}

/** Timeline state/progress only; the core adds absolute geometry, text, edge routing and camera bounds. */
export interface TimelineFrame {
  timeMs: number;
  sceneId: string | null;
  beatId: string | null;
  beatProgress: number;
  /** Linear movement completion, clamped at arrival while the beat retains temporary highlights. */
  flowProgress: number;
  /** Single-flow receiver paint after arrival; independent of logical highlights and opening transitions. */
  flowArrivalProgress: number;
  /** Single-flow automatic paint removal during the last 200 ms; logical flags and marker lifetime are unchanged. */
  flowDepartureProgress: number;
  transitionProgress: number;
  focusBefore: string | null;
  focusAfter: string | null;
  caption?: string;
  objects: ReadonlyMap<string, TimelineObject>;
  flows: readonly CompiledFlow[];
}
const DEFAULT_TRANSITION_MS = 250;
const FLOW_ARRIVAL_TRANSITION_MS = 200;
const FLOW_FULL_HIGHLIGHT_HOLD_MS = 100;
const FLOW_DEPARTURE_TRANSITION_MS = 200;
const FLOW_ARRIVAL_HOLD_MS = FLOW_ARRIVAL_TRANSITION_MS + FLOW_FULL_HIGHLIGHT_HOLD_MS + FLOW_DEPARTURE_TRANSITION_MS;
const NUMERIC_VISUAL_FIELDS = ["x", "y", "width", "height", "opacity", "strokeWidth"] as const;
const DEFAULT_STROKE_WIDTH = 2;

/**
 * Flatten scenes into continuous beats and compile snapshots once; queries locate beats by binary search.
 * Each beat inherits the previous final state; evaluation is independent of query order and clocks.
 * See docs/adr/0002-continuous-global-timeline.md for time semantics.
 */
export class CompiledTimeline {
  readonly totalDuration: number;
  readonly schedule: readonly DiagramBeat[];
  private readonly beats: readonly CompiledBeat[];
  private readonly initial: ReadonlyMap<string, ObjectState>;
  private readonly title?: string;

  constructor(document: DiagramDocument, movementDurations: ReadonlyMap<string, number> = new Map()) {
    this.initial = new Map<string, ObjectState>([
      ...document.nodes.map((node) => [node.id, {
        visible: node.visible !== false, highlighted: false, kind: "node", values: {
          x: node.x, y: node.y, width: node.width, height: node.height, label: node.label, content: node.content, fill: node.style?.fill, stroke: node.style?.stroke, opacity: 1
        }
      }] as const),
      ...document.edges.map((edge) => [edge.id, {
        visible: edge.visible !== false, highlighted: false, kind: "edge", values: {
          label: edge.label, stroke: edge.style?.stroke, strokeWidth: edge.style?.strokeWidth ?? DEFAULT_STROKE_WIDTH, opacity: 1
        }
      }] as const)
    ]);
    this.title = document.title;
    const beats: CompiledBeat[] = [];
    let state = this.initial;
    let focus: string | null = null;
    let startMs = 0;
    let caption = document.title;
    for (const [sceneIndex, scene] of document.scenes.entries()) {
      scene.beats.forEach((beat, index) => {
        // Copy the index, then replace changed objects/values so earlier beat snapshots retain their original state.
        const after = new Map(state);
        const focusBefore = focus;
        const flows: CompiledFlow[] = [];
        for (const action of beat.actions) {
          if (action.type === "flow") {
            flows.push({ target: action.target, direction: action.direction, highlightParticipants: action.highlightParticipants ?? true,
              ...(action.text !== undefined ? { text: action.text } : {}) });
            continue;
          }
          if (action.type === "focus") {
            focus = action.target;
            continue;
          }
          const previous = after.get(action.target);
          if (!previous) continue;
          if (action.type === "updateNode" || action.type === "updateEdge") {
            // Content and label share one display mode. Clear the other value in the snapshot,
            // including content:null, so later beats cannot revive historical text.
            const modeReset = action.type !== "updateNode" ? {}
              : Object.hasOwn(action.value, "content") ? { label: undefined }
              : Object.hasOwn(action.value, "label") ? { content: undefined } : {};
            after.set(action.target, { ...previous, values: { ...previous.values, ...modeReset, ...action.value } });
          } else {
            after.set(action.target, action.type === "show" || action.type === "hide"
              ? { ...previous, visible: action.type === "show" }
              : { ...previous, highlighted: action.type === "highlight" });
          }
        }
        caption = beat.caption ?? caption;
        const beatId = `${scene.id}:${index}`;
        const movementMs = movementDurations.get(beatId) ?? beat.durationMs;
        // Reference compilation keeps authored timing; effective single-flow beats own a fixed arrival hold.
        const durationMs = movementDurations.has(beatId) ? movementMs + FLOW_ARRIVAL_HOLD_MS : beat.durationMs;
        const endMs = startMs + durationMs;
        // A shortened beat must finish its opening transition before the next snapshot takes over.
        const transitionMs = Math.min(durationMs, beat.transitionMs ?? Math.min(DEFAULT_TRANSITION_MS, beat.durationMs));
        if (!Number.isFinite(movementMs) || !Number.isFinite(endMs)) {
          throw new DiagramValidationError([{ path: `scenes[${sceneIndex}].beats[${index}].durationMs`, message: "effective beat timing must be finite" }]);
        }
        beats.push({ startMs, endMs, movementMs, transitionMs, sceneId: scene.id, beatId, beatIndex: index, caption, focusBefore, focusAfter: focus, before: state, after, flows });
        state = after;
        startMs = endMs;
      });
    }
    this.beats = beats;
    this.schedule = Object.freeze(beats.map(({ sceneId, beatId, beatIndex, startMs, endMs, caption }) => Object.freeze({
      sceneId, beatId, beatIndex, startMs, endMs, ...(caption !== undefined ? { caption } : {})
    })));
    this.totalDuration = startMs;
  }

  /** Clamp finite times globally; reduced motion skips interpolation but preserves beat selection and total duration. */
  evaluateAt(timeMs: number, options: EvaluateOptions, palette: TimelinePalette): TimelineFrame {
    const time = Number.isFinite(timeMs) ? Math.max(0, Math.min(timeMs, this.totalDuration)) : 0;
    const beat = this.findBeat(time);
    const progress = !beat || options.reducedMotion || beat.transitionMs === 0 ? 1 : easeInOutCubic(Math.min(1, (time - beat.startMs) / beat.transitionMs));
    const before = beat?.before ?? this.initial;
    const after = beat?.after ?? this.initial;
    const objects = new Map([...after].map(([id, target]) => {
      const source = before.get(id) ?? target;
      const values = interpolateValues(source, target, progress, palette);
      const visibilityOpacity = Number(source.visible) + (Number(target.visible) - Number(source.visible)) * progress;
      return [id, {
        values,
        // Reveals block routing from their start; hides remain obstacles until complete. Hit tests also check opacity.
        visible: target.visible || (source.visible && progress < 1),
        opacity: Math.min(values.opacity ?? 1, visibilityOpacity),
        highlighted: target.highlighted,
        highlight: Number(source.highlighted) + (Number(target.highlighted) - Number(source.highlighted)) * progress
      }] as const;
    }));
    return {
      timeMs: time,
      sceneId: beat?.sceneId ?? null,
      beatId: beat?.beatId ?? null,
      beatProgress: beat ? (time - beat.startMs) / (beat.endMs - beat.startMs) : 0,
      flowProgress: beat ? Math.min(1, (time - beat.startMs) / beat.movementMs) : 0,
      flowArrivalProgress: !beat || options.reducedMotion || beat.flows.length !== 1 ? 1
        : easeInOutCubic(Math.max(0, Math.min(1, (time - beat.startMs - beat.movementMs) / FLOW_ARRIVAL_TRANSITION_MS))),
      flowDepartureProgress: !beat || options.reducedMotion || beat.flows.length !== 1 ? 0
        : easeInOutCubic(Math.max(0, Math.min(1, (time - beat.endMs + FLOW_DEPARTURE_TRANSITION_MS) / FLOW_DEPARTURE_TRANSITION_MS))),
      transitionProgress: progress,
      focusBefore: beat?.focusBefore ?? null,
      focusAfter: beat?.focusAfter ?? null,
      caption: beat?.caption ?? this.title,
      objects,
      flows: beat && time < beat.endMs ? beat.flows : []
    };
  }

  /** Select the next beat at endMs, retaining the last beat at total duration; static documents return undefined. */
  private findBeat(timeMs: number): CompiledBeat | undefined {
    let low = 0;
    let high = this.beats.length - 1;
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      if (timeMs < this.beats[middle]!.endMs) high = middle;
      else low = middle + 1;
    }
    return this.beats[low];
  }
}

function easeInOutCubic(progress: number): number {
  return progress < 0.5 ? 4 * progress ** 3 : 1 - (-2 * progress + 2) ** 3 / 2;
}

/**
 * Labels and whole node content take target values immediately; numbers/colors interpolate, returning exact values at endpoints.
 * Interpolate base colors here; the core applies the highlight overlay afterward.
 */
function interpolateValues(source: ObjectState, target: ObjectState, progress: number, palette: TimelinePalette): VisualValues {
  if (progress === 0) return { ...source.values, label: target.values.label, content: target.values.content };
  if (progress === 1) return { ...target.values };
  const numericValues = Object.fromEntries(NUMERIC_VISUAL_FIELDS.flatMap((key) => {
    const from = source.values[key];
    const to = target.values[key];
    // Weighted sums avoid overflow from subtracting widely separated finite endpoints first.
    return from === undefined || to === undefined ? [] : [[key, from * (1 - progress) + to * progress]];
  }));
  const strokeFallback = target.kind === "node" ? palette.stroke : palette.edge;
  return {
    ...target.values,
    ...numericValues,
    fill: mixColor(source.values.fill ?? palette.fill, target.values.fill ?? palette.fill, progress),
    stroke: mixColor(source.values.stroke ?? strokeFallback, target.values.stroke ?? strokeFallback, progress)
  };
}
