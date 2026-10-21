/**
 * Vue adapter for component lifecycle, props, events and imperative controls.
 * Playback/rendering reuse browser; imports do not create DOM, and the player is created only on mount.
 */
import {
  defineComponent,
  h,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
  type CSSProperties,
  type PropType
} from "vue";
import {
  createPlayer,
  type FlowPlayer as BrowserFlowPlayer,
  type PlayerErrorDetail,
  type PlayerState
} from "../browser/player.js";
import type { DiagramDocument, ThemeName } from "../core/model.js";

/** Vue document, visual options and callbacks; document reference changes trigger a reload. */
export interface FlowPlayerProps {
  document: DiagramDocument;
  /** Positive playback multiplier; omit to use the player default. */
  speed?: number;
  theme?: ThemeName;
  controls?: boolean;
  /** Defaults to false. Enable GIF downloads when controls are visible; export is independent of playback. */
  gifExport?: boolean;
  /** Defaults to false: hover marks borders only. True also highlights backgrounds, including groups. */
  hoverFill?: boolean;
  reducedMotion?: boolean;
  /** Initial position in milliseconds, applied once; use seek afterward, and document reloads reset to zero. */
  initialTimeMs?: number;
  className?: string;
  style?: CSSProperties;
  onStepChange?: (state: PlayerState) => void;
  onTimeUpdate?: (state: PlayerState) => void;
  onPlayStateChange?: (state: PlayerState) => void;
  onError?: (detail: PlayerErrorDetail) => void;
}

/** Imperative controls for a mounted component; calls before mounting or after unmounting throw a not-mounted error. */
export interface FlowPlayerHandle {
  /** Resume from the current position when playback can advance. */
  play(): void;
  /** Pause while retaining the current frame. */
  pause(): void;
  /** Seek in milliseconds, clamping to the timeline; non-finite values become zero. */
  seek(timeMs: number): void;
  /** Pause and jump to a beat boundary; backward from inside a beat goes to that beat's start. */
  step(direction: 1 | -1): void;
  /** Set a finite positive multiplier; ignore invalid values. */
  setSpeed(speed: number): void;
  /** Reset/pause at zero on success; emit an error and retain playback state if validation fails. */
  load(document: DiagramDocument): void;
  /** Read the current browser-player snapshot. */
  getState(): PlayerState;
}

/** Changes to these creation options rebuild the instance; speed is updated separately with setSpeed. */
interface PlayerOptionsSnapshot {
  theme: ThemeName | undefined;
  controls: boolean | undefined;
  gifExport: boolean | undefined;
  hoverFill: boolean | undefined;
  reducedMotion: boolean | undefined;
}

const propsOptions = {
  document: { type: Object as PropType<DiagramDocument>, required: true },
  speed: { type: Number, required: false },
  theme: { type: String as PropType<ThemeName>, required: false },
  gifExport: { type: Boolean as PropType<boolean | undefined>, default: undefined },
  controls: { type: Boolean as PropType<boolean | undefined>, default: undefined },
  hoverFill: { type: Boolean as PropType<boolean | undefined>, default: undefined },
  reducedMotion: { type: Boolean as PropType<boolean | undefined>, default: undefined },
  initialTimeMs: { type: Number, required: false },
  className: { type: String, required: false },
  style: { type: Object as PropType<CSSProperties>, required: false },
  onStepChange: { type: Function as PropType<(state: PlayerState) => void>, required: false },
  onTimeUpdate: { type: Function as PropType<(state: PlayerState) => void>, required: false },
  onPlayStateChange: { type: Function as PropType<(state: PlayerState) => void>, required: false },
  onError: { type: Function as PropType<(detail: PlayerErrorDetail) => void>, required: false }
} as const;

/**
 * SSR renders only the host; onMounted creates the player and onBeforeUnmount releases it.
 * Document reference changes call load; option changes rebuild, and exposed methods delegate to the browser instance.
 */
export const FlowPlayer = defineComponent({
  name: "FlowPlayer",
  inheritAttrs: false,
  props: propsOptions,
  emits: {
    stepchange: (_state: PlayerState) => true,
    timeupdate: (_state: PlayerState) => true,
    playstatechange: (_state: PlayerState) => true,
    error: (_detail: PlayerErrorDetail) => true
  },
  setup(props, { attrs, emit, expose }) {
    const hostRef = ref<HTMLElement | null>(null);
    let player: BrowserFlowPlayer | undefined;
    let cleanupEvents: (() => void) | undefined;
    let optionsSnapshot: PlayerOptionsSnapshot | undefined;
    let mounted = false;
    let initialApplied = false;

    const requirePlayer = (): BrowserFlowPlayer => {
      if (!player) throw new Error("FlowPlayer is not mounted");
      return player;
    };

    expose({
      play: () => requirePlayer().play(),
      pause: () => requirePlayer().pause(),
      seek: (timeMs: number) => requirePlayer().seek(timeMs),
      step: (direction: 1 | -1) => requirePlayer().step(direction),
      setSpeed: (speed: number) => requirePlayer().setSpeed(speed),
      load: (document: DiagramDocument) => requirePlayer().load(document),
      getState: () => requirePlayer().getState()
    } satisfies FlowPlayerHandle);

    const currentOptions = (): PlayerOptionsSnapshot => ({
      theme: props.theme,
      controls: props.controls,
      gifExport: props.gifExport,
      hoverFill: props.hoverFill,
      reducedMotion: props.reducedMotion
    });

    const attachEvents = (next: BrowserFlowPlayer): (() => void) => {
      const onStepChange = (event: Event) => {
        const state = (event as CustomEvent<PlayerState>).detail;
        emit("stepchange", state);
        props.onStepChange?.(state);
      };
      const onTimeUpdate = (event: Event) => {
        const state = (event as CustomEvent<PlayerState>).detail;
        emit("timeupdate", state);
        props.onTimeUpdate?.(state);
      };
      const onPlayStateChange = (event: Event) => {
        const state = (event as CustomEvent<PlayerState>).detail;
        emit("playstatechange", state);
        props.onPlayStateChange?.(state);
      };
      const onError = (event: Event) => {
        const detail = (event as CustomEvent<PlayerErrorDetail>).detail;
        // Vue's error event already invokes the onError prop; an explicit callback would duplicate delivery.
        emit("error", detail);
      };
      next.element.addEventListener("stepchange", onStepChange);
      next.element.addEventListener("timeupdate", onTimeUpdate);
      next.element.addEventListener("playstatechange", onPlayStateChange);
      next.element.addEventListener("error", onError);
      return () => {
        next.element.removeEventListener("stepchange", onStepChange);
        next.element.removeEventListener("timeupdate", onTimeUpdate);
        next.element.removeEventListener("playstatechange", onPlayStateChange);
        next.element.removeEventListener("error", onError);
      };
    };

    // Keep initialApplied across option rebuilds so initialTimeMs is not reapplied.
    const mount = (): void => {
      const host = hostRef.value;
      if (!host || player) return;
      const next = createPlayer(host, props.document, currentOptions());
      player = next;
      optionsSnapshot = currentOptions();
      cleanupEvents = attachEvents(next);
      if (props.speed !== undefined) next.setSpeed(props.speed);
      if (!initialApplied && props.initialTimeMs !== undefined) next.seek(props.initialTimeMs);
      initialApplied = true;
    };

    // Detach event forwarding first so destruction does not call an unmounted component.
    const unmount = (): void => {
      cleanupEvents?.();
      cleanupEvents = undefined;
      player?.destroy();
      player = undefined;
      optionsSnapshot = undefined;
    };

    const rebuild = (): void => {
      if (!mounted || !player) return;
      unmount();
      mount();
    };

    onMounted(() => {
      mounted = true;
      mount();
    });

    watch(() => props.document, (next, previous) => {
      if (!mounted || next === previous || !player) return;
      player.load(next);
    });

    watch(() => [props.theme, props.controls, props.gifExport, props.reducedMotion, props.hoverFill], () => {
      const next = currentOptions();
      if (!mounted || sameOptions(optionsSnapshot, next)) return;
      rebuild();
    });

    watch(() => props.speed, (speed) => {
      if (player && speed !== undefined) player.setSpeed(speed);
    });

    onBeforeUnmount(() => {
      mounted = false;
      unmount();
    });

    return () => h("div", {
      ref: hostRef,
      class: ["flowsvg", props.className, attrs.class],
      style: [props.style, attrs.style]
    });
  }
});

function sameOptions(previous: PlayerOptionsSnapshot | undefined, next: PlayerOptionsSnapshot): boolean {
  if (!previous) return false;
  return previous.theme === next.theme
    && previous.controls === next.controls
    && previous.gifExport === next.gifExport
    && previous.hoverFill === next.hoverFill
    && previous.reducedMotion === next.reducedMotion;
}
