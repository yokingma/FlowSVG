/**
 * Web Component boundary: convert attributes/objects/URLs and manage lifecycle while reusing browser playback/rendering.
 * Imports do not register the element; DOM-free imports use a placeholder base, so real registration needs a browser load.
 */
import { createDiagram } from "../core/diagram.js";
import type {
  DiagramDocument,
  EvaluateOptions,
  ThemeName
} from "../core/model.js";
import {
  createPlayer,
  type FlowPlayer,
  type PlayerErrorDetail,
  type PlayerEventMap,
  type PlayerOptions,
  type PlayerState
} from "../browser/player.js";

/** Default custom-element name registered by {@link defineFlowPlayer}. */
export const FLOW_PLAYER_TAG = "flowsvg-player";

type PlayerEventName = keyof PlayerEventMap;
type ElementBase = typeof HTMLElement;

// typeof permits DOM-free imports, but the base is fixed at evaluation time; load this entry with a DOM to create elements.
const HTMLElementBase = (typeof HTMLElement === "undefined"
  ? class { }
  : HTMLElement) as ElementBase;

/** Declarative options; autoplay defaults to false, speed to 1 and controls to true. */
export interface FlowPlayerElementOptions extends EvaluateOptions {
  autoplay?: boolean;
  /** Defaults to false; loop is a live playback preference, independent of GIF loopCount. */
  loop?: boolean;
  controls?: boolean;
  /** Defaults to false. Enable GIF download controls; ignored when controls is false. */
  gifExport?: boolean;
  /** Defaults to false; true enables background feedback as well as borders on hover. */
  hoverFill?: boolean;
  speed?: number;
}

/** Pre-mount errors may lack player state; mounted errors include available state and the Error. */
export type FlowPlayerElementErrorDetail = Partial<PlayerErrorDetail> & {
  error: Error
};

/**
 * Custom-element adapter for attribute conversion, URL requests and playback/error events.
 * The document property may be assigned before connection; disconnect releases the player/requests but retains the document.
 * Rendering/timeline behavior delegates to createPlayer; registration requires an explicit defineFlowPlayer call.
 */
export class FlowPlayerElement extends HTMLElementBase {
  static readonly observedAttributes = [
    "document",
    "src",
    "autoplay",
    "controls",
    "speed",
    "theme",
    "reduced-motion",
    "hover-fill",
    "gif-export",
    "loop"
  ] as const;

  private player: FlowPlayer | undefined;
  private playerHost: HTMLElement | undefined;
  private sourceAbort: AbortController | undefined;
  private requestToken = 0;
  private connected = false;
  private manuallyDestroyed = false;
  private currentDocument: DiagramDocument | undefined;
  private controlsOverride: boolean | undefined;
  private readonly forwardedEvents: Array<{
    name: PlayerEventName;
    listener: EventListener
  }> = [];

  /** Current object document; assigning undefined clears it, cancels requests and unmounts the player. */
  get document(): DiagramDocument | undefined {
    return this.currentDocument;
  }
  set document(value: DiagramDocument | undefined) {
    if (value === undefined) {
      this.currentDocument = undefined;
      this.cancelSourceLoad();
      this.unmountPlayer();
      return;
    }
    this.setDocument(value);
  }

  /** Document URL resolved against ownerDocument.baseURI; changes cancel obsolete loads. */
  get src(): string | undefined {
    return this.getAttribute?.("src") ?? undefined;
  }
  set src(value: string | undefined) {
    if (value === undefined || value === "") this.removeAttribute("src");
    else this.setAttribute("src", value);
  }

  /** Whether to autoplay; false pauses a mounted player. */
  get autoplay(): boolean {
    return readBooleanAttribute(this, "autoplay", false);
  }
  set autoplay(value: boolean) {
    setBooleanAttribute(this, "autoplay", value);
    this.applyAutoplay();
  }

  /** Live loop mode, reflected by the loop attribute; changes retain time and play state. */
  get loop(): boolean {
    return readBooleanAttribute(this, "loop", false);
  }
  set loop(value: boolean) {
    setBooleanAttribute(this, "loop", value);
  }

  /** Controls default on; an explicit false is retained in HTML as controls="false". */
  get controls(): boolean {
    return this.controlsOverride ?? readBooleanAttribute(this, "controls", true);
  }
  set controls(value: boolean) {
    this.controlsOverride = value;
    // An omitted attribute enables controls, so disabling must preserve the false text rather than remove the attribute.
    if (value) this.setAttribute("controls", "");
    else this.setAttribute("controls", "false");
    this.rebuildForOptions();
  }

  /** Positive speed multiplier; invalid attribute text reads as 1, while invalid property assignments are ignored. */
  get speed(): number {
    return readPositiveNumber(this.getAttribute?.("speed"), 1);
  }
  set speed(value: number) {
    if (!Number.isFinite(value) || value <= 0) return;
    this.setAttribute("speed", String(value));
    this.player?.setSpeed(value);
  }

  /** Explicit light/dark theme; the player falls back to the document theme or light when unset. */
  get theme(): ThemeName | undefined {
    const value = this.getAttribute?.("theme");
    return value === "light" || value === "dark" ? value : undefined;
  }
  set theme(value: ThemeName | undefined) {
    if (value === undefined) this.removeAttribute("theme");
    else this.setAttribute("theme", value);
  }

  /** undefined follows the system preference; true/false explicitly override it via reduced-motion. */
  get reducedMotion(): boolean | undefined {
    const value = this.getAttribute?.("reduced-motion");
    if (value === null || value === undefined) return undefined;
    return parseBooleanValue(value, true);
  }
  set reducedMotion(value: boolean | undefined) {
    if (value === undefined) this.removeAttribute("reduced-motion");
    else this.setAttribute("reduced-motion", String(value));
  }

  /** Hover paints only borders by default. The hover-fill attribute enables background and content feedback. */
  get hoverFill(): boolean {
    return readBooleanAttribute(this, "hover-fill", false);
  }
  set hoverFill(value: boolean) {
    setBooleanAttribute(this, "hover-fill", value);
  }

  /** Opt-in GIF controls, reflected by the gif-export attribute; defaults to false. */
  get gifExport(): boolean {
    return readBooleanAttribute(this, "gif-export", false);
  }
  set gifExport(value: boolean) {
    setBooleanAttribute(this, "gif-export", value);
  }

  connectedCallback(): void {
    this.connected = true;
    this.manuallyDestroyed = false;
    if (this.player) return;
    if (this.currentDocument) {
      this.mountPlayer(this.currentDocument);
      return;
    }
    const documentAttribute = this.getAttribute("document");
    if (documentAttribute !== null) {
      this.loadDocumentAttribute(documentAttribute);
      return;
    }
    const source = this.getAttribute("src");
    if (source) void this.loadSource(source);
  }

  disconnectedCallback(): void {
    this.connected = false;
    this.cancelSourceLoad();
    this.unmountPlayer();
  }

  attributeChangedCallback(name: string, _oldValue: string | null, value: string | null): void {
    if (_oldValue === value || !this.connected) return;
    switch (name) {
      case "document":
        if (value === null) {
          this.currentDocument = undefined;
          this.unmountPlayer();
        } else this.loadDocumentAttribute(value);
        break;
      case "src":
        this.cancelSourceLoad();
        if (value) void this.loadSource(value);
        break;
      case "controls":
        this.controlsOverride = value === null ? undefined : parseBooleanValue(value, true);
      case "theme":
      case "reduced-motion":
      case "hover-fill":
      case "gif-export":
        this.rebuildForOptions();
        break;
      case "loop":
        this.player?.setLoop(this.loop);
        break;
      case "speed":
        this.player?.setSpeed(this.speed);
        break;
      case "autoplay":
        this.applyAutoplay();
        break;
      default:
        break;
    }
  }

  /** Forward controls to the mounted player; calls are inert when no player is mounted. */
  play(): void {
    this.player?.play();
  }
  /** Pause the mounted player, retaining its current frame; do nothing before mounting. */
  pause(): void {
    this.player?.pause();
  }
  /** Seek in milliseconds using browser-player clamping; do nothing before mounting. */
  seek(timeMs: number): void {
    this.player?.seek(timeMs);
  }
  /** Pause and jump to a beat boundary; backward from inside a beat goes to that beat's start. */
  step(direction: 1 | -1): void {
    this.player?.step(direction);
  }
  /** Set the speed property, retaining it for future mounts; ignore non-finite or non-positive values. */
  setSpeed(value: number): void {
    this.speed = value;
  }
  /** Set loop mode and retain it for future mounts. */
  setLoop(value: boolean): void {
    this.loop = value;
  }
  /** Return undefined before mounting or after destruction. */
  getState(): PlayerState | undefined {
    return this.player?.getState();
  }

  /** Explicitly release the player and requests; the manual-destruction flag resets on the next connection. */
  destroy(): void {
    this.manuallyDestroyed = true;
    this.cancelSourceLoad();
    this.unmountPlayer();
  }

  private setDocument(value: DiagramDocument): void {
    this.cancelSourceLoad();
    try {
      // Validate before replacement so an invalid document does not discard the last valid frame.
      createDiagram(value);
      this.currentDocument = value;
      if (this.connected && !this.manuallyDestroyed) {
        if (this.player) this.player.load(value);
        else this.mountPlayer(value);
        this.applyAutoplay();
      }
    } catch (error) {
      this.dispatchError(toError(error));
    }
  }

  private loadDocumentAttribute(value: string): void {
    try {
      const parsed: unknown = JSON.parse(value);
      this.setDocument(parsed as DiagramDocument);
    } catch (error) {
      this.dispatchError(toError(error));
    }
  }

  /** AbortController cancels network work; the token also rejects obsolete results already received but not yet applied. */
  private async loadSource(source: string): Promise<void> {
    const token = ++this.requestToken;
    const controller = new AbortController();
    this.sourceAbort?.abort();
    this.sourceAbort = controller;
    try {
      const owner = this.ownerDocument;
      const url = new URL(source, owner.baseURI).href;
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) throw new Error(`Failed to load diagram source (${response.status})`);
      const parsed: unknown = await response.json();
      // Recheck connection and request ownership after parsing so stale responses cannot replace a newer document/src.
      if (!this.connected || token !== this.requestToken || controller.signal.aborted) return;
      this.setDocument(parsed as DiagramDocument);
    } catch (error) {
      if (controller.signal.aborted || token !== this.requestToken) return;
      this.dispatchError(toError(error));
    } finally {
      if (this.sourceAbort === controller) this.sourceAbort = undefined;
    }
  }

  /** Restore an existing playback state during option rebuilds; autoplay applies only to a fresh mount. */
  private mountPlayer(document: DiagramDocument, previous?: PlayerState): void {
    if (!this.connected || this.manuallyDestroyed || this.player) return;
    const owner = this.ownerDocument;
    const host = owner.createElement("div");
    host.className = "flowsvg-element-host";
    this.playerHost = host;
    this.append(host);
    try {
      this.player = createPlayer(host, document, this.playerOptions());
      this.forwardPlayerEvents(host);
      this.player.setSpeed(this.speed);
      if (previous) {
        this.player.seek(previous.timeMs);
        if (previous.playing) this.player.play();
      } else this.applyAutoplay();
    } catch (error) {
      this.unmountPlayer();
      this.dispatchError(toError(error));
    }
  }

  /** Rebuild for option changes and restore time/playback; document replacement instead follows load's reset-to-zero rule. */
  private rebuildForOptions(): void {
    if (!this.connected || !this.currentDocument || this.manuallyDestroyed) return;
    const previous = this.player?.getState();
    this.unmountPlayer();
    this.mountPlayer(this.currentDocument, previous);
  }

  /** Detach forwarding before destruction so teardown cannot forward events from the old instance. */
  private unmountPlayer(): void {
    this.removeForwardedEvents();
    this.player?.destroy();
    this.player = undefined;
    this.playerHost?.remove();
    this.playerHost = undefined;
  }

  private forwardPlayerEvents(host: HTMLElement): void {
    this.removeForwardedEvents();
    for (const name of ["stepchange", "timeupdate", "playstatechange", "loopchange", "error"] as const) {
      const listener: EventListener = (event) => {
        const source = event as CustomEvent<PlayerEventMap[typeof name]["detail"]>;
        if (name === "loopchange") {
          setBooleanAttribute(this, "loop", (source.detail as PlayerState).loop);
        }
        this.dispatchEvent(new CustomEvent(name, {
          detail: source.detail,
          bubbles: true,
          composed: true
        }));
      };
      host.addEventListener(name, listener);
      this.forwardedEvents.push({ name, listener });
    }
  }

  private removeForwardedEvents(): void {
    if (!this.playerHost) {
      this.forwardedEvents.length = 0;
      return;
    }
    for (const { name, listener } of this.forwardedEvents) this.playerHost.removeEventListener(name, listener);
    this.forwardedEvents.length = 0;
  }

  private playerOptions(): PlayerOptions {
    return {
      controls: this.controls,
      loop: this.loop,
      gifExport: this.gifExport,
      hoverFill: this.hoverFill,
      ...(this.theme ? { theme: this.theme } : {}),
      ...(this.reducedMotion === undefined ? {} : { reducedMotion: this.reducedMotion })
    };
  }

  private applyAutoplay(): void {
    if (!this.player) return;
    if (this.autoplay) this.player.play();
    else this.player.pause();
  }

  private cancelSourceLoad(): void {
    this.requestToken += 1;
    this.sourceAbort?.abort();
    this.sourceAbort = undefined;
  }

  private dispatchError(error: Error): void {
    const detail: FlowPlayerElementErrorDetail = { error, ...(this.player ? this.player.getState() : {}) };
    this.dispatchEvent(new CustomEvent("error", { detail, bubbles: true, composed: true }));
  }
}

/**
 * Register explicitly; repeated calls for the default name return the existing constructor, or undefined without customElements.
 * Load the module with a DOM for real registration, since the HTMLElement base is fixed at module evaluation.
 * @throws {DOMException} From the registry for invalid names or reusing the constructor under another name.
 */
export function defineFlowPlayer(tagName = FLOW_PLAYER_TAG): CustomElementConstructor | undefined {
  if (typeof customElements === "undefined") return undefined;
  const existing = customElements.get(tagName);
  if (existing) return existing;
  customElements.define(tagName, FlowPlayerElement as unknown as CustomElementConstructor);
  return FlowPlayerElement as unknown as CustomElementConstructor;
}

function readBooleanAttribute(element: Element, name: string, fallback: boolean): boolean {
  const value = element.getAttribute(name);
  return value === null ? fallback : parseBooleanValue(value, true);
}

function parseBooleanValue(value: string, fallback: boolean): boolean {
  const normalized = value.trim().toLowerCase();
  if (normalized === "false" || normalized === "0" || normalized === "no") return false;
  if (normalized === "true" || normalized === "1" || normalized === "yes" || normalized === "") return true;
  return fallback;
}

function setBooleanAttribute(element: Element, name: string, value: boolean): void {
  if (value) element.setAttribute(name, "");
  else element.removeAttribute(name);
}

function readPositiveNumber(value: string | null | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
