/**
 * React adapter for component lifecycle, props, events and imperative controls.
 * Playback/rendering reuse browser; imports do not create DOM, and the player is created only on mount.
 */
import {
  createElement,
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  type CSSProperties,
  type ReactElement
} from "react";
import {
  type FlowPlayer as BrowserFlowPlayer,
  type PlayerErrorDetail,
  type PlayerState
} from "../browser/player.js";
import type { DiagramDocument, EmphasisColors, ThemeName } from "../core/model.js";
import {
  HostPlayerLifecycle,
  type HostPlayerLifecycleOptions
} from "./host-lifecycle.js";

/** React document, visual options and callbacks; document reference changes trigger a reload. */
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

interface CallbackRefs {
  onStepChange?: (state: PlayerState) => void;
  onTimeUpdate?: (state: PlayerState) => void;
  onPlayStateChange?: (state: PlayerState) => void;
  onLoopChange?: (state: PlayerState) => void;
  onError?: (detail: PlayerErrorDetail) => void;
}

/**
 * SSR renders only a host container; an effect mounts the browser player and unmount cleanup releases it.
 * Document reference changes call load; visual/control options rebuild the instance, with initial positioning applied once.
 */
export const FlowPlayer = forwardRef<FlowPlayerHandle, FlowPlayerProps>(function FlowPlayer(
  props,
  ref
): ReactElement {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const callbacksRef = useRef<CallbackRefs>({});
  const initialTimeRef = useRef(props.initialTimeMs);

  // Listeners read current callbacks through a stable ref so callback identity changes do not rebuild the player.
  callbacksRef.current = {
    onStepChange: props.onStepChange,
    onTimeUpdate: props.onTimeUpdate,
    onPlayStateChange: props.onPlayStateChange,
    onLoopChange: props.onLoopChange,
    onError: props.onError
  };

  const lifecycleRef = useRef<HostPlayerLifecycle | null>(null);
  if (!lifecycleRef.current) {
    lifecycleRef.current = new HostPlayerLifecycle({
      attachEvents: (player) => attachPlayerEvents(player, callbacksRef)
    });
  }
  const lifecycle = lifecycleRef.current;

  useImperativeHandle(ref, () => ({
    play: () => requirePlayer(lifecycle.player).play(),
    pause: () => requirePlayer(lifecycle.player).pause(),
    seek: (timeMs) => requirePlayer(lifecycle.player).seek(timeMs),
    step: (direction) => requirePlayer(lifecycle.player).step(direction),
    setSpeed: (speed) => requirePlayer(lifecycle.player).setSpeed(speed),
    setLoop: (loop) => requirePlayer(lifecycle.player).setLoop(loop),
    load: (document) => requirePlayer(lifecycle.player).load(document),
    getState: () => requirePlayer(lifecycle.player).getState()
  }), [lifecycle]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const nextOptions: HostPlayerLifecycleOptions = {
      theme: props.theme,
      emphasis: props.emphasis,
      controls: props.controls,
      gifExport: props.gifExport,
      hoverFill: props.hoverFill,
      reducedMotion: props.reducedMotion
    };
    lifecycle.sync({
      host,
      document: props.document,
      options: nextOptions,
      loop: props.loop,
      speed: props.speed,
      initialTimeMs: initialTimeRef.current
    });
  }, [props.document, props.theme, props.emphasis, props.controls, props.gifExport, props.reducedMotion, props.hoverFill]);

  useEffect(() => {
    const player = lifecycle.player;
    if (player && props.speed !== undefined) player.setSpeed(props.speed);
  }, [lifecycle, props.speed]);

  useEffect(() => {
    lifecycle.player?.setLoop(props.loop ?? false);
  }, [lifecycle, props.loop]);

  useEffect(() => () => {
    lifecycle.destroy();
  }, []);

  const className = props.className ? `flowsvg ${props.className}` : "flowsvg";
  return createElement("div", { ref: hostRef, className, style: props.style });
});

function requirePlayer(player: BrowserFlowPlayer | undefined): BrowserFlowPlayer {
  if (!player) throw new Error("FlowPlayer is not mounted");
  return player;
}

/** Translate browser event details to component callbacks; share cleanup between replacement and unmount. */
function attachPlayerEvents(
  player: BrowserFlowPlayer,
  callbacksRef: {
    current: CallbackRefs
  }
): () => void {
  const onStepChange = (event: Event) => {
    callbacksRef.current.onStepChange?.((event as CustomEvent<PlayerState>).detail);
  };
  const onTimeUpdate = (event: Event) => {
    callbacksRef.current.onTimeUpdate?.((event as CustomEvent<PlayerState>).detail);
  };
  const onPlayStateChange = (event: Event) => {
    callbacksRef.current.onPlayStateChange?.((event as CustomEvent<PlayerState>).detail);
  };
  const onLoopChange = (event: Event) => {
    callbacksRef.current.onLoopChange?.((event as CustomEvent<PlayerState>).detail);
  };
  const onError = (event: Event) => {
    callbacksRef.current.onError?.((event as unknown as CustomEvent<PlayerErrorDetail>).detail);
  };
  player.element.addEventListener("stepchange", onStepChange);
  player.element.addEventListener("timeupdate", onTimeUpdate);
  player.element.addEventListener("playstatechange", onPlayStateChange);
  player.element.addEventListener("loopchange", onLoopChange);
  player.element.addEventListener("error", onError);
  return () => {
    player.element.removeEventListener("stepchange", onStepChange);
    player.element.removeEventListener("timeupdate", onTimeUpdate);
    player.element.removeEventListener("playstatechange", onPlayStateChange);
    player.element.removeEventListener("loopchange", onLoopChange);
    player.element.removeEventListener("error", onError);
  };
}
