/** React owns versioned adapter mounts; shared session rules own operation targets, never the playback clock. */
import { Component, createRef, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { FlowPlayer, type FlowPlayerHandle } from "flowsvg/react";
import { catalog } from "@flowsvg/showcase/author";
import { restoreSession, transitionSession, type AddressUpdate, type PlaybackSnapshot, type SessionOperation, type SessionTransition, type ShowcaseSession } from "@flowsvg/showcase/session";
import { ThemeSelect } from "./ThemeSelect.js";
import { PlayerBoundary } from "./PlayerBoundary.js";

interface AppState {
  session: ShowcaseSession;
  error: string;
  suspended: boolean;
  shareMessage: string;
  manualShare: string;
}

const INITIAL = restoreSession(catalog, location.href);

/** Keep navigation outside the SDK subtree. A new presentation version always gets a fresh adapter mount. */
export class ShowcaseApp extends Component<Record<string, never>, AppState> {
  override state: AppState = { session: INITIAL.session, error: "", suspended: false, shareMessage: "", manualShare: "" };
  private readonly playerRef = createRef<FlowPlayerHandle>();
  private activeVersion: number | undefined = this.state.session.version;
  private suspendedSnapshot: PlaybackSnapshot | undefined;
  private exited = false;
  private shareRequest = 0;

  override componentDidMount(): void {
    applyAddressUpdates(INITIAL.addressUpdates);
    window.addEventListener("popstate", this.restoreAddress);
    window.addEventListener("pagehide", this.suspend);
    window.addEventListener("pageshow", this.resume);
  }

  override componentWillUnmount(): void {
    this.exited = true;
    this.shareRequest++;
    this.activeVersion = undefined;
    this.removeListeners();
  }

  private removeListeners(): void {
    window.removeEventListener("pagehide", this.suspend);
    window.removeEventListener("pageshow", this.resume);
    window.removeEventListener("popstate", this.restoreAddress);
  }

  private readonly suspend = (event: PageTransitionEvent): void => {
    const captured = this.captureSnapshot();
    this.suspendedSnapshot = captured.snapshot;
    this.activeVersion = undefined;
    this.exited = true;
    this.shareRequest++;
    window.removeEventListener("popstate", this.restoreAddress);
    let error = "error" in captured ? displayError(captured.error) : this.state.error;
    try { this.playerRef.current?.pause(); } catch (failure) { error = displayError(failure); }
    flushSync(() => this.setState({ suspended: true, error, shareMessage: "", manualShare: "" }));
    if (!event.persisted) this.removeListeners();
  };

  /** Cached pages resume without module evaluation; retry applies the saved paused target. */
  private readonly resume = (event: PageTransitionEvent): void => {
    if (!event.persisted) return;
    const transition = transitionSession(catalog, this.state.session, { type: "retry" }, this.suspendedSnapshot);
    this.suspendedSnapshot = undefined;
    this.exited = false;
    this.activeVersion = transition.session.version;
    window.addEventListener("popstate", this.restoreAddress);
    flushSync(() => this.setState({ session: transition.session, suspended: false, error: "" }));
  };

  private readonly restoreAddress = (): void => {
    this.applyOperation({ type: "restore", address: location.href });
  };

  private applyOperation(operation: SessionOperation): SessionTransition | undefined {
    if (this.exited) return;
    const captured = this.captureSnapshot();
    const transition = transitionSession(catalog, this.state.session, operation, captured.snapshot, location.href);
    applyAddressUpdates(transition.addressUpdates);
    if (!transition.replacePlayer) {
      if ("error" in captured) this.showError(captured.error, this.state.session.version);
      this.setState({ session: transition.session });
      return transition;
    }
    // Invalidate callbacks before pause can emit an event owned by the old presentation.
    this.activeVersion = undefined;
    this.shareRequest++;
    let error = "error" in captured ? displayError(captured.error) : "";
    try { this.playerRef.current?.pause(); } catch (failure) { error = displayError(failure); }
    this.activeVersion = transition.session.version;
    // Flush the old unmount before another synchronous browser selection can read a snapshot.
    flushSync(() => this.setState({ session: transition.session, error, shareMessage: "", manualShare: "" }));
    return transition;
  }

  private captureSnapshot(): { snapshot?: PlaybackSnapshot; error?: unknown } {
    if (!this.playerRef.current) return {};
    try {
      const { timeMs, speed, loop } = this.playerRef.current.getState();
      return { snapshot: { timeMs, speed, loop } };
    } catch (error) { return { error }; }
  }

  private showError(error: unknown, version: number): void {
    if (this.activeVersion === version && this.state.session.version === version) this.setState({ error: displayError(error) });
  }

  private selectExample(exampleId: string): void {
    this.applyOperation(exampleId === this.state.session.exampleId && !this.playerRef.current ? { type: "retry" } : { type: "select", exampleId });
  }

  /** Save the captured address before awaiting clipboard; an obsolete request cannot change current UI. */
  private readonly shareCurrentView = async (): Promise<void> => {
    if (this.exited) return;
    const request = ++this.shareRequest;
    this.setState({ shareMessage: "", manualShare: "" });
    const address = this.applyOperation({ type: "share" })?.copyAddress;
    if (address === undefined) return;
    try {
      if (!navigator.clipboard) throw new Error("Clipboard is unavailable in this browser context");
      await navigator.clipboard.writeText(address);
      if (request === this.shareRequest) this.setState({ shareMessage: "Share link copied." });
    } catch (error) {
      if (request !== this.shareRequest) return;
      const reason = error instanceof Error ? error.message : String(error);
      this.setState({ shareMessage: `Unable to copy the share link: ${reason}. Copy the URL below.`, manualShare: address });
    }
  };

  private renderSelected(): ReactNode {
    const { session } = this.state;
    const definition = session.exampleId === null ? undefined : catalog.get(session.exampleId);
    if (!definition || !session.settings) return null;
    return <>
      <fieldset id="visual-settings">
        <legend>Presentation</legend>
        <span id="theme-label">Theme</span>
        <ThemeSelect value={session.settings.theme} onChange={(theme) => {
          if (theme === "light" || theme === "dark") this.applyOperation({ type: "theme", theme });
        }} />
        <label><input id="reduced-motion" type="checkbox" checked={session.settings.reducedMotion}
          onChange={(event) => this.applyOperation({ type: "reducedMotion", reducedMotion: event.target.checked })} /> Reduce motion</label>
      </fieldset>
      <div id="player">{!this.state.suspended && <PlayerBoundary key={session.version} onError={(error) => this.showError(error, session.version)}>
        <FlowPlayer ref={this.playerRef} document={definition.document}
        theme={session.settings.theme} reducedMotion={session.settings.reducedMotion} speed={session.settings.speed} loop={session.loop}
        controls gifExport initialTimeMs={session.timeMs} onError={({ error }) => this.showError(error, session.version)} />
      </PlayerBoundary>}</div>
      <div id="download"><a href={`${import.meta.env.BASE_URL}${definition.jsonPath}`} download={`${definition.id}.json`}>Download diagram JSON</a></div>
      <div id="sharing">
        <button id="share" type="button" onClick={this.shareCurrentView}>Share current view</button>
        <p role="status" aria-label="Sharing" hidden={!this.state.shareMessage}>{this.state.shareMessage}</p>
        <label id="manual-share" hidden={!this.state.manualShare}>Share URL
          <input id="share-url" readOnly value={this.state.manualShare} />
        </label>
      </div>
    </>;
  }

  override render(): ReactNode {
    const { session } = this.state;
    const definition = session.exampleId === null ? undefined : catalog.get(session.exampleId);
    return <main className="showcase flowsvg-compact">
      <header className="showcase-header">
        <p className="eyebrow">FlowSVG / React</p>
        <h1>Diagram showcase</h1>
        <p>Explore a diagram, read its purpose, and take the source with you.</p>
      </header>
      <div className="showcase-layout">
        <aside><h2 className="navigation-title">Examples</h2><nav aria-label="Examples">
          {catalog.groups.map((group) => <div key={group.id} className="example-group" role="group" aria-labelledby={`category-${group.id}`}>
            <h3 id={`category-${group.id}`} className="category-title">{group.label}</h3>
            {group.entries.map((entry) => <button key={entry.id} type="button" aria-current={entry.id === session.exampleId}
              onClick={() => this.selectExample(entry.id)}>{entry.name}</button>)}
          </div>)}
        </nav></aside>
        <section className="current-example" aria-label="Current example">
          <div id="introduction">
            <h2>{definition?.name ?? "No showcase examples configured."}</h2>
            <p>{definition?.introduction ?? "The formal example catalog is awaiting content selection."}</p>
          </div>
          <p id="parameter-diagnostics" role="status" aria-label="Parameter diagnostics" hidden={session.diagnostics.length === 0}>
            {session.diagnostics.map(({ message }) => message).join(" · ")}
          </p>
          <p id="error" role="alert" hidden={!this.state.error}>{this.state.error}</p>
          {this.renderSelected()}
        </section>
      </div>
    </main>;
  }
}

function displayError(error: unknown): string {
  return `Unable to display this example: ${error instanceof Error ? error.message : String(error)}`;
}

/** Execute the shared ordered effects without reinterpreting parameter or history rules. */
function applyAddressUpdates(updates: readonly AddressUpdate[]): void {
  for (const update of updates) {
    if (update.method === "replace") history.replaceState(history.state, "", update.address);
    else history.pushState(null, "", update.address);
  }
}
