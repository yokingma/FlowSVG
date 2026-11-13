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
  type FlowPlayer as BrowserFlowPlayer,
  type PlayerErrorDetail,
  type PlayerState
} from "../browser/player.js";
import type { DiagramDocument, EmphasisColors, ThemeName } from "../core/model.js";
import {
  HostPlayerLifecycle,
  type HostPlayerLifecycleOptions,
  sameHostPlayerOptions
} from "./host-lifecycle.js";

/** Vue document, visual options and callbacks; document reference changes trigger a reload. */
export interface FlowPlayerProps {
  document: DiagramDocument;
  /** Positive playback multiplier; omit to use the player default. */
  speed?: number;
  /** Defaults to false. Changes update live loop mode without rebuilding the player. */
  loop?: boolean;
  theme?: ThemeName;
  /** Field-by-field runtime emphasis overrides; replace the object to rebuild the player. */
  emphasis?: EmphasisColors;
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
  onLoopChange?: (state: PlayerState) => void;
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
  /** Toggle whole-timeline playback without changing the current position or play state. */
  setLoop(loop: boolean): void;
  /** Reset/pause at zero on success; emit an error and retain playback state if validation fails. */
  load(document: DiagramDocument): void;
  /** Read the current browser-player snapshot. */
  getState(): PlayerState;
}

const propsOptions = {
  document: { type: Object as PropType<DiagramDocument>, required: true },
  speed: { type: Number, required: false },
  loop: { type: Boolean as PropType<boolean | undefined>, default: undefined },
  theme: { type: String as PropType<ThemeName>, required: false },
  emphasis: { type: Object as PropType<EmphasisColors>, required: false },
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
  onLoopChange: { type: Function as PropType<(state: PlayerState) => void>, required: false },
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
    loopchange: (_state: PlayerState) => true,
    error: (_detail: PlayerErrorDetail) => true
  },
  setup(props, { attrs, emit, expose }) {
    const hostRef = ref<HTMLElement | null>(null);
    let mounted = false;

    const lifecycle = new HostPlayerLifecycle({
      attachEvents: (next) => {
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
        const onLoopChange = (event: Event) => {
          const state = (event as CustomEvent<PlayerState>).detail;
          emit("loopchange", state);
          props.onLoopChange?.(state);
        };
        const onError = (event: Event) => {
          const detail = (event as CustomEvent<PlayerErrorDetail>).detail;
          // Vue's error event already invokes the onError prop; an explicit callback would duplicate delivery.
          emit("error", detail);
        };
        next.element.addEventListener("stepchange", onStepChange);
        next.element.addEventListener("timeupdate", onTimeUpdate);
        next.element.addEventListener("playstatechange", onPlayStateChange);
        next.element.addEventListener("loopchange", onLoopChange);
        next.element.addEventListener("error", onError);
        return () => {
          next.element.removeEventListener("stepchange", onStepChange);
          next.element.removeEventListener("timeupdate", onTimeUpdate);
          next.element.removeEventListener("playstatechange", onPlayStateChange);
          next.element.removeEventListener("loopchange", onLoopChange);
          next.element.removeEventListener("error", onError);
        };
      }
    });

    const requirePlayer = (): BrowserFlowPlayer => {
      if (!lifecycle.player) throw new Error("FlowPlayer is not mounted");
      return lifecycle.player;
    };

    expose({
      play: () => requirePlayer().play(),
      pause: () => requirePlayer().pause(),
      seek: (timeMs: number) => requirePlayer().seek(timeMs),
      step: (direction: 1 | -1) => requirePlayer().step(direction),
      setSpeed: (speed: number) => requirePlayer().setSpeed(speed),
      setLoop: (loop: boolean) => requirePlayer().setLoop(loop),
      load: (document: DiagramDocument) => requirePlayer().load(document),
      getState: () => requirePlayer().getState()
    } satisfies FlowPlayerHandle);

    const currentOptions = (): HostPlayerLifecycleOptions => ({
      theme: props.theme,
      emphasis: props.emphasis,
      controls: props.controls,
      gifExport: props.gifExport,
      hoverFill: props.hoverFill,
      reducedMotion: props.reducedMotion
    });

    // Keep initialApplied across option rebuilds so initialTimeMs is not reapplied.
    const mount = (previousLoop?: boolean): void => {
      const host = hostRef.value;
      if (!host || lifecycle.player) return;
      lifecycle.mount({
        host,
        document: props.document,
        options: currentOptions(),
        loop: props.loop ?? previousLoop,
        speed: props.speed,
        initialTimeMs: props.initialTimeMs
      });
    };

    const unmount = (): void => {
      lifecycle.destroy();
    };

    const rebuild = (): void => {
      const host = hostRef.value;
      if (!mounted || !host || !lifecycle.player) return;
      lifecycle.rebuild({
        host,
        document: props.document,
        options: currentOptions(),
        loop: props.loop,
        speed: props.speed,
        initialTimeMs: props.initialTimeMs
      });
    };

    onMounted(() => {
      mounted = true;
      mount();
    });

    watch(() => props.document, (next, previous) => {
      if (!mounted || next === previous || !lifecycle.player) return;
      lifecycle.load(next);
    });

    watch(() => [props.theme, props.emphasis, props.controls, props.gifExport, props.reducedMotion, props.hoverFill], () => {
      const next = currentOptions();
      if (!mounted || sameHostPlayerOptions(lifecycle.options, next)) return;
      rebuild();
    });

    watch(() => props.speed, (speed) => {
      if (lifecycle.player && speed !== undefined) lifecycle.player.setSpeed(speed);
    });

    watch(() => props.loop, (loop) => lifecycle.player?.setLoop(loop ?? false));

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
