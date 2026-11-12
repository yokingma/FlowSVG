/**
 * Shared lifecycle coordinator for framework host adapters.
 *
 * React and Vue still own their own reactive scheduling and public event mapping. This
 * module owns the browser player's replacement order, option snapshot, event cleanup,
 * initial positioning and resource teardown so those rules cannot drift between hosts.
 */
import {
  createPlayer,
  type FlowPlayer as BrowserFlowPlayer,
  type PlayerOptions
} from "../browser/player.js";
import type { DiagramDocument, EmphasisColors, ThemeName } from "../core/model.js";

/** Visual options that determine whether a browser player must be rebuilt. */
export interface HostPlayerLifecycleOptions {
  theme: ThemeName | undefined;
  emphasis?: EmphasisColors;
  controls: boolean | undefined;
  gifExport: boolean | undefined;
  hoverFill: boolean | undefined;
  reducedMotion: boolean | undefined;
}

/** Inputs used when creating or rebuilding a framework-hosted browser player. */
export interface HostPlayerLifecycleMount {
  host: HTMLElement;
  document: DiagramDocument;
  options: HostPlayerLifecycleOptions;
  loop?: boolean;
  speed?: number;
  initialTimeMs?: number;
}

interface HostPlayerLifecycleDependencies {
  createPlayer?: (
    host: HTMLElement,
    document: DiagramDocument,
    options: PlayerOptions
  ) => BrowserFlowPlayer;
  attachEvents: (player: BrowserFlowPlayer) => () => void;
}

/**
 * Coordinate browser-player ownership for framework adapters.
 *
 * Replacement detaches listeners before destroying the old instance. `destroy` is
 * idempotent, while `rebuild` preserves the once-per-mounted-component initial-time
 * rule across option changes.
 */
export class HostPlayerLifecycle {
  private readonly createPlayer: NonNullable<HostPlayerLifecycleDependencies["createPlayer"]>;
  private readonly attachEvents: HostPlayerLifecycleDependencies["attachEvents"];
  private currentPlayer: BrowserFlowPlayer | undefined;
  private cleanupEvents: (() => void) | undefined;
  private currentDocument: DiagramDocument | undefined;
  private currentOptions: HostPlayerLifecycleOptions | undefined;
  private initialApplied = false;

  constructor(dependencies: HostPlayerLifecycleDependencies) {
    this.createPlayer = dependencies.createPlayer ?? createPlayer;
    this.attachEvents = dependencies.attachEvents;
  }

  get player(): BrowserFlowPlayer | undefined {
    return this.currentPlayer;
  }

  get options(): HostPlayerLifecycleOptions | undefined {
    return this.currentOptions;
  }

  /** Mount a player once. Reactive adapters call this from their mount effect/hook. */
  mount(input: HostPlayerLifecycleMount): void {
    if (this.currentPlayer) return;

    const player = this.createPlayer(input.host, input.document, {
      ...input.options,
      loop: input.loop
    });
    this.currentPlayer = player;
    this.currentDocument = input.document;
    this.currentOptions = input.options;

    try {
      if (input.speed !== undefined) player.setSpeed(input.speed);
      this.cleanupEvents = this.attachEvents(player);
      if (!this.initialApplied && input.initialTimeMs !== undefined) {
        player.seek(input.initialTimeMs);
      }
      this.initialApplied = true;
    } catch (error) {
      this.cleanupEvents?.();
      this.cleanupEvents = undefined;
      this.currentPlayer = undefined;
      this.currentDocument = undefined;
      this.currentOptions = undefined;
      player.destroy();
      throw error;
    }
  }

  /**
   * Synchronize a React-style effect: rebuild when visual options change and load when
   * the document reference changes. The current loop state survives a rebuild unless
   * the adapter supplied an explicit loop prop.
   */
  sync(input: HostPlayerLifecycleMount): void {
    if (!this.currentPlayer) {
      this.mount(input);
      return;
    }

    if (!sameHostPlayerOptions(this.currentOptions, input.options)) {
      this.rebuild(input);
      return;
    }

    if (this.currentDocument !== input.document) {
      this.currentPlayer.load(input.document);
      this.currentDocument = input.document;
    }
    this.currentOptions = input.options;
  }

  /** Load a document while retaining the current player and its event subscriptions. */
  load(document: DiagramDocument): void {
    const player = this.currentPlayer;
    if (!player) return;
    player.load(document);
    this.currentDocument = document;
  }

  /** Replace the player while preserving initial-time application across option rebuilds. */
  rebuild(input: HostPlayerLifecycleMount): void {
    const previousLoop = this.currentPlayer?.getState().loop;
    const wasInitialApplied = this.initialApplied;
    this.teardown();
    this.initialApplied = wasInitialApplied;
    this.mount({ ...input, loop: input.loop ?? previousLoop });
  }

  /** Detach listeners and release the current browser player. Safe to call repeatedly. */
  destroy(): void {
    this.teardown();
    this.initialApplied = false;
  }

  private teardown(): void {
    this.cleanupEvents?.();
    this.cleanupEvents = undefined;
    this.currentPlayer?.destroy();
    this.currentPlayer = undefined;
    this.currentDocument = undefined;
    this.currentOptions = undefined;
  }
}

/** Compare only options that change the browser player's creation contract. */
export function sameHostPlayerOptions(
  previous: HostPlayerLifecycleOptions | undefined,
  next: HostPlayerLifecycleOptions
): boolean {
  if (!previous) return false;
  return previous.theme === next.theme
    && previous.emphasis === next.emphasis
    && previous.controls === next.controls
    && previous.gifExport === next.gifExport
    && previous.hoverFill === next.hoverFill
    && previous.reducedMotion === next.reducedMotion;
}
