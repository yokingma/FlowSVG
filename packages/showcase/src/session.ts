/** Pure presentation transitions. Hosts capture SDK state on operations and own mounting, clocks and resources. */
import type { ThemeName } from "flowsvg";
import type { ShowcaseCatalog, ShowcaseDefaults } from "./model.js";
import { readAddress, writeAddress, type AddressField } from "./address.js";

/** Operation targets, in milliseconds. Null settings identify an empty catalog with no player. */
export interface ShowcaseSession {
  readonly exampleId: string | null;
  readonly settings: ShowcaseDefaults | null;
  readonly timeMs: number;
  /** Runtime preference, default false; never serialized into diagram documents or addresses. */
  readonly loop: boolean;
  /** Monotonic ownership token for mounted resources and callbacks. */
  readonly version: number;
  readonly diagnostics: readonly ParameterDiagnostic[];
}

/** Invalid fields are reported independently; diagnostics survive address normalization. */
export interface ParameterDiagnostic {
  readonly field: AddressField;
  readonly message: string;
}

/** An ordered host effect; execute replacements before pushes without reinterpreting shared rules. */
export interface AddressUpdate {
  readonly method: "replace" | "push";
  readonly address: string;
}

/** Snapshot captured at an operation, never continuously mirrored from the playback clock. */
export interface PlaybackSnapshot {
  readonly timeMs: number;
  readonly speed: number;
  readonly loop: boolean;
}

/** Navigation, visual, sharing and history operations; the host executes returned browser effects. */
export type SessionOperation =
  | { readonly type: "theme"; readonly theme: ThemeName }
  | { readonly type: "select"; readonly exampleId: string }
  | { readonly type: "reducedMotion"; readonly reducedMotion: boolean }
  /** Reconstruct the saved selection after failure or page-cache suspension. */
  | { readonly type: "retry" }
  | { readonly type: "share" }
  | { readonly type: "restore"; readonly address: string };

/** A host replacement must pause and release the old player, then mount and restore the paused target. */
export interface SessionTransition {
  readonly session: ShowcaseSession;
  readonly replacePlayer: boolean;
  readonly addressUpdates: readonly AddressUpdate[];
  /** Captured full address for an explicit share; the host owns clipboard effects. */
  readonly copyAddress?: string;
}

/** Start at the explicit default, paused at zero; empty catalogs never invent a selected ID. */
export function createSession(catalog: ShowcaseCatalog): ShowcaseSession {
  const definition = catalog.defaultId === null ? undefined : catalog.get(catalog.defaultId);
  return { exampleId: definition?.id ?? null, settings: definition?.defaults ?? null, timeMs: 0, loop: false, version: 0, diagnostics: [] };
}

/** Compute targets and ordered address effects from an operation snapshot, or the saved target without a player. */
export function transitionSession(catalog: ShowcaseCatalog, current: ShowcaseSession, operation: SessionOperation, snapshot?: PlaybackSnapshot, address = ""): SessionTransition {
  if (operation.type === "restore") {
    const restored = restoreSession(catalog, operation.address, current.version + 1);
    // History restores shareable fields; the current player's loop choice stays in this page session.
    return { ...restored, session: { ...restored.session, loop: snapshot?.loop ?? current.loop } };
  }
  if (operation.type === "share") {
    const session = saveSnapshot(current, snapshot);
    const copyAddress = serializeSession(address, session);
    return { session, replacePlayer: false, addressUpdates: [{ method: "replace", address: copyAddress }], copyAddress };
  }
  const transition = transitionPresentation(catalog, current, operation, snapshot);
  if (!transition.replacePlayer || operation.type === "retry") return transition;
  return { ...transition, addressUpdates: [
    { method: "replace", address: serializeSession(address, saveSnapshot(current, snapshot)) },
    { method: "push", address: serializeSession(address, transition.session) }
  ] };
}

function saveSnapshot(session: ShowcaseSession, snapshot?: PlaybackSnapshot): ShowcaseSession {
  return !session.settings || !snapshot ? session : {
    ...session, timeMs: snapshot.timeMs, loop: snapshot.loop, settings: { ...session.settings, speed: snapshot.speed }
  };
}

function transitionPresentation(catalog: ShowcaseCatalog, current: ShowcaseSession, operation: Exclude<SessionOperation, { type: "share" | "restore" }>, snapshot?: PlaybackSnapshot): SessionTransition {
  if (!current.settings || current.exampleId === null || !catalog.get(current.exampleId)) return { session: current, replacePlayer: false, addressUpdates: [] };
  if (operation.type === "select") {
    const definition = catalog.get(operation.exampleId);
    if (!definition || definition.id === current.exampleId) return { session: current, replacePlayer: false, addressUpdates: [] };
    return { replacePlayer: true, addressUpdates: [], session: {
      exampleId: definition.id, timeMs: 0, loop: snapshot?.loop ?? current.loop, version: current.version + 1, diagnostics: [],
      settings: { ...current.settings, speed: definition.defaults.speed }
    } };
  }
  const visualUpdate = operation.type === "theme" ? { theme: operation.theme } : operation.type === "reducedMotion" ? { reducedMotion: operation.reducedMotion } : {};
  if (operation.type === "theme" && current.settings.theme === operation.theme || operation.type === "reducedMotion" && current.settings.reducedMotion === operation.reducedMotion) return { session: current, replacePlayer: false, addressUpdates: [] };
  return { replacePlayer: true, addressUpdates: [], session: {
    ...current, diagnostics: [], version: current.version + 1, timeMs: snapshot?.timeMs ?? current.timeMs, loop: snapshot?.loop ?? current.loop,
    settings: { ...current.settings, ...visualUpdate, speed: snapshot?.speed ?? current.settings.speed }
  } };
}

/** Serialize a shareable selected snapshot; speed, loop and playing state never enter the address. */
export function serializeSession(address: string, session: ShowcaseSession): string {
  return writeAddress(address, session);
}

/** Parse entry/history state. The host mounts paused and performs canonical replacement without pushing. */
export function restoreSession(catalog: ShowcaseCatalog, address: string, version = 0): SessionTransition {
  const fields = readAddress(address);
  const diagnostics: ParameterDiagnostic[] = [];
  const readField = (field: AddressField): string | undefined => {
    const values = fields.get(field);
    if (!values) return undefined;
    if (values.length !== 1) { diagnose(field, "duplicate parameter"); return undefined; }
    return values[0];
  };
  const diagnose = (field: AddressField, reason: string): void => { diagnostics.push({ field, message: `${field}: ${reason}` }); };
  const fallback = createSession(catalog);
  const example = readField("example");
  const selected = example === undefined ? undefined : catalog.get(example);
  if (example !== undefined && !selected) diagnose("example", "unknown example; using the default");
  const definition = selected ?? (fallback.exampleId === null ? undefined : catalog.get(fallback.exampleId));
  const theme = readField("theme");
  if (theme !== undefined && theme !== "light" && theme !== "dark") diagnose("theme", "expected light or dark; using the example default");
  const reduced = readField("reduced");
  if (reduced !== undefined && reduced !== "0" && reduced !== "1") diagnose("reduced", "expected 0 or 1; using the example default");
  const time = readField("time");
  const validTime = time === undefined || /^\d+(?:\.\d+)?$/.test(time) && Number.isFinite(Number(time));
  if (!validTime) diagnose("time", "expected finite nonnegative decimal milliseconds; using zero");
  const session: ShowcaseSession = {
    exampleId: definition?.id ?? null,
    settings: definition ? { ...definition.defaults,
      theme: theme === "light" || theme === "dark" ? theme : definition.defaults.theme,
      reducedMotion: reduced === "0" || reduced === "1" ? reduced === "1" : definition.defaults.reducedMotion
    } : null,
    timeMs: Math.min(definition?.durationMs ?? 0, validTime ? Number(time ?? 0) : 0),
    loop: false, version, diagnostics
  };
  const canonical = serializeSession(address, session);
  return { session, replacePlayer: session.exampleId !== null, addressUpdates: canonical === address ? [] : [{ method: "replace", address: canonical }] };
}
