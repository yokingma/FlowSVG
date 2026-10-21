/**
 * Browser player: own the clock, DOM, controls and input, forwarding time and visual options to the core.
 * Importing does not access the DOM; createPlayer allocates mount resources and destroy releases them.
 */
import { GifExportControls } from "./export-controls.js";
import { paintContentHighlight } from "../core/node-content-paint.js";
import type { NodeContentLayout } from "../core/node-content.js";
import { updateSvgDom } from "./svg-dom.js";
import { attachPlayerLifecycle } from "./lifecycle.js";
import { observeKeyboard, observeReducedMotion } from "./accessibility.js";
import { PlayerControls, type SceneChoice } from "./controls.js";
import { resolveThemePalette } from "../core/theme.js";
import { createDiagram, type Diagram } from "../core/diagram.js";
import type {
  DiagramDocument,
  DiagramFrameState,
  DiagramPoint,
  EvaluateOptions,
  HitObject,
  ThemeName
} from "../core/model.js";

/** Creation options: controls default on, motion follows browser preferences, and theme falls back to the document/light. */
export interface PlayerOptions extends EvaluateOptions {
  controls?: boolean;
  /** Defaults to false. GIF controls require visible playback controls; exports use the full timeline at 1×. */
  gifExport?: boolean;
  /** Hover highlights borders by default; true also paints the background and adjusts content ink. Applies to groups too. */
  hoverFill?: boolean;
}

/** Player snapshot: times are milliseconds, speed is a positive multiplier, and frame is the core result without hover. */
export interface PlayerState {
  timeMs: number;
  totalDuration: number;
  playing: boolean;
  speed: number;
  frame: DiagramFrameState;
}

/** Object interaction detail; point uses document coordinates and time/beat IDs reflect the event-time player state. */
export interface PlayerInteractionDetail extends HitObject {
  point: DiagramPoint;
  timeMs: number;
  sceneId: string | null;
  beatId: string | null;
}

/** Imperative browser player; creation/successful load pause at zero, and controls become inert after destruction. */
export interface FlowPlayer {
  /** The supplied host, also used as the CustomEvent dispatch target. */
  readonly element: HTMLElement;
  /** Play from the current position; do not start for static diagrams, at the end, or while the page is hidden. */
  play(): void;
  /** Stop time advancement, retaining the current frame. */
  pause(): void;
  /** Seek to a clamped millisecond time; preserve playback except at the end. Non-finite times become zero. */
  seek(timeMs: number): void;
  /** Pause and jump to the adjacent start; backward goes to this beat's start from inside it, or the preceding start. */
  step(direction: 1 | -1): void;
  /** Set a finite positive speed multiplier; ignore invalid values. */
  setSpeed(speed: number): void;
  /** Compile before replacing; reset/pause at zero on success, or emit error and retain the old document/time/playback. */
  load(document: DiagramDocument): void;
  /** Read current player state; the last state remains readable after destruction. */
  getState(): PlayerState;
  /** Silently and idempotently release frames/listeners/host content; no further player events are dispatched. */
  destroy(): void;
}

/** Retained state and original load error; DiagramValidationError.issues provides field paths for validation failures. */
export interface PlayerErrorDetail extends PlayerState {
  error: Error;
}

/**
 * Host events and their detail types. Frame updates emit stepchange when needed, then timeupdate.
 * hover/click use null for no hit; objecthover/objectclick report the same interactions under alternate names.
 * Hover also changes when a frame update changes the object under a stationary pointer.
 */
export type PlayerEventMap = {
  stepchange: CustomEvent<PlayerState>;
  timeupdate: CustomEvent<PlayerState>;
  playstatechange: CustomEvent<PlayerState>;
  error: CustomEvent<PlayerErrorDetail>;
  hover: CustomEvent<PlayerInteractionDetail | null>;
  click: CustomEvent<PlayerInteractionDetail | null>;
  objecthover: CustomEvent<PlayerInteractionDetail | null>;
  objectclick: CustomEvent<PlayerInteractionDetail | null>;
};

/**
 * Mount a player using the host document and observe browser motion preferences unless explicitly overridden.
 * Replaces host children; destroy an existing player before replacing it on the same host.
 * @throws {DiagramValidationError} For an invalid initial document, before an instance exists to emit error.
 */
export function createPlayer(host: HTMLElement, document: DiagramDocument, options: PlayerOptions = {}): FlowPlayer {
  const initial = createDiagram(document);
  return new BrowserPlayer(host, initial, document, options);
}

/**
 * Own one compiled Diagram and advance time with RAF; core results drive the canvas, caption and controls.
 * Retain cleanup callbacks for lifecycle, media preferences and pointer listeners, releasing them on destroy.
 */
class BrowserPlayer implements FlowPlayer {
  readonly element: HTMLElement;
  private diagram: Diagram;
  private sourceDocument: DiagramDocument;
  private readonly gifControls?: GifExportControls;
  private options: PlayerOptions;
  private timeMs = 0;
  private speed = 1;
  private playing = false;
  private destroyed = false;
  private frameHandle: number | undefined;
  private lastTimestamp: number | undefined;
  private frame: DiagramFrameState;
  private readonly canvas: HTMLDivElement;
  private readonly caption: HTMLParagraphElement;
  private readonly controls?: PlayerControls;
  private scenes: SceneChoice[];
  private beatStarts: number[];
  private readonly detachLifecycle: () => void;
  private readonly stopKeyboard: () => void;
  private readonly stopMotion: () => void;
  private readonly stopPointer: () => void;
  private readonly themeOverride: ThemeName | undefined;
  private pointerPosition: PointerPosition | undefined;
  private hoveredHit: HitObject | null = null;

  constructor(host: HTMLElement, diagram: Diagram, document: DiagramDocument, options: PlayerOptions) {
    this.element = host;
    this.diagram = diagram;
    this.sourceDocument = cloneSourceDocument(document);
    this.beatStarts = collectBeatStarts(document);
    this.scenes = collectScenes(document);
    const owner = host.ownerDocument;
    const motion = observeReducedMotion(owner, options.reducedMotion, (reducedMotion) => {
      if (this.destroyed) return;
      this.options = { ...this.options, reducedMotion };
      this.updateFrame();
    });
    this.stopMotion = motion.cleanup;
    this.themeOverride = options.theme;
    this.options = { ...options, theme: options.theme ?? document.theme ?? "light", reducedMotion: motion.value };
    this.frame = diagram.evaluateAt(0, this.options);
    this.canvas = owner.createElement("div");
    this.canvas.className = "flowsvg-canvas";
    this.stopKeyboard = observeKeyboard(this.canvas, { toggle: this.togglePlayback, step: (direction) => this.step(direction) });
    this.caption = owner.createElement("p");
    this.caption.className = "flowsvg-caption";
    this.caption.setAttribute("aria-live", "polite");
    this.caption.setAttribute("aria-atomic", "true");
    if (options.controls !== false) {
      this.controls = new PlayerControls(owner, {
        toggle: this.togglePlayback,
        step: (direction) => this.step(direction),
        seek: (timeMs) => this.seek(timeMs),
        setSpeed: (speed) => this.setSpeed(speed)
      });
    }
    if (options.gifExport && this.controls) {
      this.gifControls = new GifExportControls(owner, () => ({
        document: structuredClone(this.sourceDocument), theme: this.options.theme ?? "light"
      }));
      this.controls.element.append(this.gifControls.element);
    }
    host.replaceChildren(this.canvas, this.caption, ...(this.controls ? [this.controls.element] : []));
    this.render();
    this.stopPointer = observePointer(this.canvas, {
      move: (event) => this.handlePointer("hover", event),
      leave: () => this.clearPointer(),
      click: (event) => this.handlePointer("click", event)
    });
    this.detachLifecycle = attachPlayerLifecycle(host, this.canvas, () => this.pause());
  }

  play(): void {
    if (this.destroyed || this.playing || this.element.ownerDocument.visibilityState === "hidden" || this.diagram.totalDuration <= this.timeMs) return;
    this.playing = true;
    this.lastTimestamp = undefined;
    this.renderControls();
    this.emit("playstatechange");
    this.scheduleFrame();
  }

  pause(): void {
    if (this.destroyed || !this.playing) return;
    this.playing = false;
    if (this.frameHandle !== undefined) cancelAnimationFrame(this.frameHandle);
    this.frameHandle = undefined;
    this.renderControls();
    this.emit("playstatechange");
  }

  seek(timeMs: number): void {
    if (this.destroyed) return;
    this.timeMs = clamp(timeMs, 0, this.diagram.totalDuration);
    this.lastTimestamp = undefined;
    this.updateFrame();
    if (this.timeMs >= this.diagram.totalDuration) this.pause();
  }

  step(direction: 1 | -1): void {
    if (this.destroyed) return;
    this.pause();
    const starts = direction > 0 ? this.beatStarts : [...this.beatStarts].reverse();
    const target = starts.find((start) => direction > 0 ? start > this.timeMs : start < this.timeMs);
    this.seek(target ?? (direction > 0 ? this.diagram.totalDuration : 0));
  }

  setSpeed(speed: number): void {
    if (this.destroyed || !Number.isFinite(speed) || speed <= 0) return;
    this.speed = speed;
    this.renderControls();
  }

  load(document: DiagramDocument): void {
    if (this.destroyed) return;
    try {
      // Keep the old player intact until compilation succeeds so invalid loads do not interrupt valid playback.
      const diagram = createDiagram(document);
      this.pause();
      if (this.destroyed) return;
      this.diagram = diagram;
      this.sourceDocument = cloneSourceDocument(document);
      this.options = { ...this.options, theme: this.themeOverride ?? document.theme ?? "light" };
      this.beatStarts = collectBeatStarts(document);
      this.scenes = collectScenes(document);
      this.timeMs = 0;
      // A replacement document owns new interaction targets, even when it reuses the same node IDs.
      this.pointerPosition = undefined;
      this.updateFrame();
    } catch (error) {
      this.emit("error", { ...this.state(), error: error instanceof Error ? error : new Error(String(error)) });
    }
  }

  getState(): PlayerState {
    return this.state();
  }

  destroy(): void {
    if (this.destroyed) return;
    // Block dispatch/rescheduling before releasing resources; do not call pause, which would emit an event.
    this.destroyed = true;
    this.gifControls?.destroy();
    this.controls?.destroy();
    this.playing = false;
    if (this.frameHandle !== undefined) cancelAnimationFrame(this.frameHandle);
    this.frameHandle = undefined;
    this.lastTimestamp = undefined;
    this.detachLifecycle();
    this.stopKeyboard();
    this.stopMotion();
    this.stopPointer();
    this.pointerPosition = undefined;
    this.hoveredHit = null;
    this.element.replaceChildren();
  }

  /** The first RAF establishes a baseline; seek clears it so elapsed time from the old position is not reused. */
  private tick = (timestamp: number): void => {
    if (!this.playing || this.destroyed) return;
    this.frameHandle = undefined;
    const previous = this.lastTimestamp ?? timestamp;
    this.lastTimestamp = timestamp;
    this.timeMs += (timestamp - previous) * this.speed;
    if (this.timeMs >= this.diagram.totalDuration) {
      this.timeMs = this.diagram.totalDuration;
      this.updateFrame();
      this.pause();
      return;
    }
    this.updateFrame();
    this.scheduleFrame();
  };

  /** Event listeners may restart playback synchronously; never queue a second frame owned by the same player. */
  private scheduleFrame(): void {
    if (this.destroyed || !this.playing || this.frameHandle !== undefined) return;
    this.frameHandle = requestAnimationFrame(this.tick);
  }

  /** Update the frame before notifying consumers so listeners observe the rendered position. */
  private updateFrame(): void {
    const previousBeat = this.frame.beatId;
    const previousScene = this.frame.sceneId;
    this.frame = this.diagram.evaluateAt(this.timeMs, this.options);
    this.render();
    if (previousBeat !== this.frame.beatId || previousScene !== this.frame.sceneId) this.emit("stepchange");
    this.emit("timeupdate");
  }

  private togglePlayback = (): void => {
    if (this.playing) this.pause(); else this.play();
  };
  private render(): void {
    updateSvgDom(this.canvas, this.diagram.renderSvg(this.timeMs, this.options));
    this.canvas.style.aspectRatio = `${this.frame.camera.width} / ${this.frame.camera.height}`;
    this.updateHover();
    this.caption.textContent = this.frame.caption ?? "";
    this.renderControls();
  }
  private renderControls(): void {
    this.controls?.render({ ...this.state(), sceneId: this.frame.sceneId, scenes: this.scenes });
  }
  private state(): PlayerState {
    return { timeMs: this.timeMs, totalDuration: this.diagram.totalDuration, playing: this.playing, speed: this.speed, frame: this.frame };
  }
  private handlePointer(type: "hover" | "click", event: PointerEvent): void {
    if (this.destroyed) return;
    if (type === "hover") {
      this.pointerPosition = { clientX: event.clientX, clientY: event.clientY };
      updateSvgDom(this.canvas, this.diagram.renderSvg(this.timeMs, this.options));
      this.updateHover(true);
      return;
    }
    if (type === "click") event.stopPropagation();
    const point = pointerToDiagramPoint(this.canvas, this.frame.camera, event);
    const hit = this.diagram.hitTest(this.timeMs, point, this.options);
    const detail = hit ? { ...hit, point, timeMs: this.timeMs, sceneId: this.frame.sceneId, beatId: this.frame.beatId } : null;
    this.emit("click", detail);
    this.emit("objectclick", detail);
  }
  /** Re-hit the saved screen position after camera/geometry updates; hover never changes the core hit geometry. */
  private updateHover(emitAlways = false): void {
    const point = this.pointerPosition ? pointerToDiagramPoint(this.canvas, this.frame.camera, this.pointerPosition) : undefined;
    const hit = point ? this.diagram.hitTest(this.timeMs, point, this.options) : null;
    if (hit?.type === "node") {
      const shape = Array.from(this.canvas.querySelectorAll("[data-id]")).find((element) => element.getAttribute("data-id") === hit.id);
      const palette = resolveThemePalette(this.options.theme);
      const node = this.frame.nodes.find((candidate) => candidate.id === hit.id);
      // Border-only hover preserves all current timeline and content paint unless fill feedback is explicitly enabled.
      if (this.options.hoverFill) shape?.setAttribute("fill", palette.highlightFill);
      shape?.setAttribute("stroke", palette.highlight);
      const layout = node?.contentLayout;
      const content = Array.from(this.canvas.querySelectorAll("[data-content-id]")).find((element) => element.getAttribute("data-content-id") === hit.id);
      if (this.options.hoverFill && content && layout) paintHoveredContent(content, paintContentHighlight(layout, 1, palette.highlightFill));
    }
    const changed = hit?.id !== this.hoveredHit?.id || hit?.type !== this.hoveredHit?.type;
    this.hoveredHit = hit;
    if (!emitAlways && !changed) return;
    const detail = hit && point ? { ...hit, point, timeMs: this.timeMs, sceneId: this.frame.sceneId, beatId: this.frame.beatId } : null;
    this.emit("hover", detail);
    this.emit("objecthover", detail);
  }
  private clearPointer(): void {
    if (this.destroyed) return;
    this.pointerPosition = undefined;
    updateSvgDom(this.canvas, this.diagram.renderSvg(this.timeMs, this.options));
    this.updateHover(true);
  }
  private emit<K extends keyof PlayerEventMap>(type: K, detail?: PlayerEventMap[K]["detail"]): void {
    if (!this.destroyed) this.element.dispatchEvent(new CustomEvent(type, { detail: detail === undefined ? this.state() : detail }));
  }
}

/** Apply the shared paint result to current decorative children; no child receives a separate interaction identity. */
function paintHoveredContent(content: Element, layout: NodeContentLayout): void {
  const tags = content.querySelectorAll("rect");
  layout.tags.forEach((tag, index) => tags[index]?.setAttribute("fill", tag.fill));
  const texts = content.querySelectorAll("text");
  layout.lines.forEach((line, index) => {
    const text = texts[index];
    text?.setAttribute("fill", line.color);
    const spans = text?.querySelectorAll("tspan");
    line.spans.forEach((span, spanIndex) => spans?.[spanIndex]?.setAttribute("fill", span.color));
  });
  const graphs = content.querySelectorAll("[data-content-graph]");
  layout.graphs?.forEach((graph, index) => {
    const circles = graphs[index]?.querySelectorAll("circle");
    const edges = graphs[index]?.querySelectorAll("line");
    graph.nodes.forEach((node, nodeIndex) => circles?.[nodeIndex]?.setAttribute("fill", node.fill));
    graph.edges.forEach((edge, edgeIndex) => edges?.[edgeIndex]?.setAttribute("stroke", edge.color));
  });
}

function clamp(value: number, min: number, max: number): number {
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : min;
}

export type { ThemeName };

function collectBeatStarts(document: DiagramDocument): number[] {
  let startMs = 0;
  return document.scenes.flatMap((scene) => scene.beats.map((beat) => {
    const start = startMs;
    startMs += beat.durationMs;
    return start;
  }));
}

function collectScenes(document: DiagramDocument): SceneChoice[] {
  let startMs = 0;
  return document.scenes.map((scene) => {
    const choice = { id: scene.id, label: scene.label, startMs };
    startMs += scene.beats.reduce((duration, beat) => duration + beat.durationMs, 0);
    return choice;
  });
}

interface PointerHandlers {
  move(event: PointerEvent): void;
  leave(): void;
  click(event: PointerEvent): void;
}

type PointerPosition = Pick<PointerEvent, "clientX" | "clientY">;

function observePointer(canvas: HTMLElement, handlers: PointerHandlers): () => void {
  const onMove = (event: Event): void => handlers.move(event as PointerEvent);
  const onLeave = (): void => handlers.leave();
  const onClick = (event: Event): void => handlers.click(event as PointerEvent);
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerleave", onLeave);
  canvas.addEventListener("pointercancel", onLeave);
  canvas.addEventListener("click", onClick);
  return () => {
    canvas.removeEventListener("pointermove", onMove);
    canvas.removeEventListener("pointerleave", onLeave);
    canvas.removeEventListener("pointercancel", onLeave);
    canvas.removeEventListener("click", onClick);
  };
}

/**
 * Prefer the inverse SVG screen transform for scaling/letterboxing; otherwise map the element rectangle to the camera.
 * The rectangle fallback lacks full SVG transform information and is only an approximation.
 */
function pointerToDiagramPoint(canvas: HTMLElement, camera: DiagramFrameState["camera"], event: PointerPosition): DiagramPoint {
  const svg = canvas.querySelector("svg");
  const matrix = svg?.getScreenCTM?.();
  if (matrix) {
    const inverse = matrix.inverse();
    return {
      x: event.clientX * inverse.a + event.clientY * inverse.c + inverse.e,
      y: event.clientX * inverse.b + event.clientY * inverse.d + inverse.f
    };
  }
  const bounds = svg?.getBoundingClientRect() ?? canvas.getBoundingClientRect();
  const width = bounds.width || 1;
  const height = bounds.height || 1;
  return {
    x: camera.x + ((event.clientX - bounds.left) / width) * camera.width,
    y: camera.y + ((event.clientY - bounds.top) / height) * camera.height
  };
}

/** Validation admits JSON documents; the same serialization as the core also handles reactive host document objects. */
function cloneSourceDocument(document: DiagramDocument): DiagramDocument {
  return JSON.parse(JSON.stringify(document)) as DiagramDocument;
}
