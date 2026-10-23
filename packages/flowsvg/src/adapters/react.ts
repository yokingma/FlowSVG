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
  createPlayer,
  type FlowPlayer as BrowserFlowPlayer,
  type PlayerErrorDetail,
  type PlayerState
} from "../browser/player.js";
import type { DiagramDocument, ThemeName } from "../core/model.js";

/** React document, visual options and callbacks; document reference changes trigger a reload. */
export interface FlowPlayerProps {
  document: DiagramDocument;
  /** Positive playback multiplier; omit to use the player default. */
  speed?: number;
  /** Defaults to false. Changes update live loop mode without rebuilding the player. */
  loop?: boolean;
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

/** Changes to these creation options rebuild the instance; speed is updated separately with setSpeed. */
interface PlayerOptionsSnapshot {
  theme: ThemeName | undefined;
  controls: boolean | undefined;
  gifExport: boolean | undefined;
  hoverFill: boolean | undefined;
  reducedMotion: boolean | undefined;
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
  const playerRef = useRef<BrowserFlowPlayer | null>(null);
  const eventCleanupRef = useRef<(() => void) | null>(null);
  const callbacksRef = useRef<CallbackRefs>({});
  const documentRef = useRef<DiagramDocument | null>(null);
  const optionsRef = useRef<PlayerOptionsSnapshot | null>(null);
  const initialTimeRef = useRef(props.initialTimeMs);
  const initialAppliedRef = useRef(false);

  // Listeners read current callbacks through a stable ref so callback identity changes do not rebuild the player.
  callbacksRef.current = {
    onStepChange: props.onStepChange,
    onTimeUpdate: props.onTimeUpdate,
    onPlayStateChange: props.onPlayStateChange,
    onLoopChange: props.onLoopChange,
    onError: props.onError
  };

  useImperativeHandle(ref, () => ({
    play: () => requirePlayer(playerRef).play(),
    pause: () => requirePlayer(playerRef).pause(),
    seek: (timeMs) => requirePlayer(playerRef).seek(timeMs),
    step: (direction) => requirePlayer(playerRef).step(direction),
    setSpeed: (speed) => requirePlayer(playerRef).setSpeed(speed),
    setLoop: (loop) => requirePlayer(playerRef).setLoop(loop),
    load: (document) => requirePlayer(playerRef).load(document),
    getState: () => requirePlayer(playerRef).getState()
  }), []);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const nextOptions: PlayerOptionsSnapshot = {
      theme: props.theme,
      controls: props.controls,
      gifExport: props.gifExport,
      hoverFill: props.hoverFill,
      reducedMotion: props.reducedMotion
    };
    const existing = playerRef.current;
    const optionsChanged = !sameOptions(optionsRef.current, nextOptions);

    if (existing && !optionsChanged && documentRef.current !== props.document) {
      existing.load(props.document);
      documentRef.current = props.document;
    } else if (!existing || optionsChanged) {
      // Detach old callbacks before replacement so old lifecycle events cannot reach the new component state.
      eventCleanupRef.current?.();
      existing?.destroy();
      const player = createPlayer(host, props.document, { ...nextOptions, loop: props.loop ?? existing?.getState().loop });
      // A new instance needs current props even when the separate speed effect has no changed dependency.
      if (props.speed !== undefined) player.setSpeed(props.speed);
      eventCleanupRef.current = attachPlayerEvents(player, callbacksRef);
      playerRef.current = player;
      documentRef.current = props.document;
      optionsRef.current = nextOptions;
      if (!initialAppliedRef.current && initialTimeRef.current !== undefined) {
        player.seek(initialTimeRef.current);
      }
      initialAppliedRef.current = true;
      return;
    }

    optionsRef.current = nextOptions;
  }, [props.document, props.theme, props.controls, props.gifExport, props.reducedMotion, props.hoverFill]);

  useEffect(() => {
    const player = playerRef.current;
    if (player && props.speed !== undefined) player.setSpeed(props.speed);
  }, [props.speed]);

  useEffect(() => {
    playerRef.current?.setLoop(props.loop ?? false);
  }, [props.loop]);

  useEffect(() => () => {
    eventCleanupRef.current?.();
    eventCleanupRef.current = null;
    playerRef.current?.destroy();
    playerRef.current = null;
    documentRef.current = null;
    optionsRef.current = null;
    initialAppliedRef.current = false;
  }, []);

  const className = props.className ? `flowsvg ${props.className}` : "flowsvg";
  return createElement("div", { ref: hostRef, className, style: props.style });
});

function requirePlayer(playerRef: {
  current: BrowserFlowPlayer | null
}): BrowserFlowPlayer {
  if (!playerRef.current) throw new Error("FlowPlayer is not mounted");
  return playerRef.current;
}

function sameOptions(previous: PlayerOptionsSnapshot | null, next: PlayerOptionsSnapshot): boolean {
  if (!previous) return false;
  return previous.theme === next.theme
    && previous.controls === next.controls
    && previous.gifExport === next.gifExport
    && previous.hoverFill === next.hoverFill
    && previous.reducedMotion === next.reducedMotion;
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
