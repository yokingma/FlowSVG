/** Built-in controls consume state and forward actions; the browser player owns evaluation and scheduling. */
import { SelectControl } from "./select-control.js";

/** Scene selection metadata with its global start time in milliseconds. */
interface SceneChoice {
  id: string;
  label: string;
  startMs: number;
}

/** Controls forward user intent; the player remains the owner of time state. */
interface ControlActions {
  toggle(): void;
  step(direction: 1 | -1): void;
  seek(timeMs: number): void;
  setSpeed(speed: number): void;
  toggleLoop(): void;
}

/** Player-state projection for controls; the scene list is replaced on document load. */
interface ControlState {
  timeMs: number;
  totalDuration: number;
  playing: boolean;
  loop: boolean;
  speed: number;
  sceneId: string | null;
  scenes: readonly SceneChoice[];
}
const DEFAULT_SPEEDS = [0.5, 1, 1.5, 2];

/**
 * Persistent control DOM translates input to commands; render synchronizes labels, progress and disabled states.
 * Own no clock or independent position; Time-related controls are disabled for static documents.
 */
export class PlayerControls {
  readonly element: HTMLDivElement;
  private readonly play: HTMLButtonElement;
  private readonly loop: HTMLButtonElement;
  private readonly previous: HTMLButtonElement;
  private readonly next: HTMLButtonElement;
  private readonly progress: HTMLInputElement;
  private readonly scene: SelectControl;
  private readonly speed: SelectControl;
  private sceneChoices: readonly SceneChoice[] | undefined;

  constructor(owner: Document, actions: ControlActions) {
    this.element = owner.createElement("div");
    this.element.className = "flowsvg-controls";
    this.play = createButton(owner, "Play", actions.toggle);
    this.play.className = "flowsvg-play-toggle";
    this.loop = createButton(owner, "Loop", actions.toggleLoop);
    this.loop.className = "flowsvg-loop-toggle";
    this.previous = createButton(owner, "Previous step", () => actions.step(-1));
    this.next = createButton(owner, "Next step", () => actions.step(1));
    this.progress = owner.createElement("input");
    this.progress.type = "range";
    this.progress.min = "0";
    this.progress.step = "any";
    this.progress.setAttribute("aria-label", "Progress");
    this.progress.addEventListener("input", () => actions.seek(Number(this.progress.value)));
    this.scene = new SelectControl(owner, "Scene", (value) => {
      const choice = this.sceneChoices?.find((scene) => scene.id === value);
      if (choice) actions.seek(choice.startMs);
    });
    this.speed = new SelectControl(owner, "Speed", (value) => actions.setSpeed(Number(value)));
    this.element.append(this.previous, this.play, this.next, this.progress, this.scene.element, this.speed.element, this.loop);
  }

  /** Update existing controls; custom speeds join the default choices without changing committed state. */
  render(state: ControlState): void {
    const isStatic = state.totalDuration === 0;
    this.play.textContent = state.playing ? "Pause" : "Play";
    this.play.setAttribute("aria-label", this.play.textContent);
    this.play.disabled = isStatic || (!state.playing && !state.loop && state.timeMs >= state.totalDuration);
    this.loop.setAttribute("aria-pressed", String(state.loop));
    this.loop.disabled = isStatic;
    this.previous.disabled = isStatic || state.timeMs <= 0;
    this.next.disabled = isStatic || state.timeMs >= state.totalDuration;
    this.progress.disabled = isStatic;
    this.progress.max = String(state.totalDuration);
    this.progress.value = String(state.timeMs);
    this.sceneChoices = state.scenes;
    this.scene.render(state.scenes.map((scene) => ({ value: scene.id, label: scene.label })), state.sceneId ?? "", isStatic);
    const speeds = [...new Set([...DEFAULT_SPEEDS, state.speed])].sort((left, right) => left - right);
    this.speed.render(speeds.map((speed) => ({ value: String(speed), label: `${speed}×` })), String(state.speed), isStatic);
  }

  /** Release menu listeners before the player removes its DOM. */
  destroy(): void {
    this.scene.destroy();
    this.speed.destroy();
  }
}

function createButton(owner: Document, label: string, click: () => void): HTMLButtonElement {
  const button = owner.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.setAttribute("aria-label", label);
  button.addEventListener("click", click);
  return button;
}
export type { SceneChoice };
