import { expect, it } from "vitest";
import { compileCatalog } from "../src/build.js";
import { catalogSource } from "../src/acceptance.js";
import { createSession, restoreSession, transitionSession } from "../src/session.js";

const { catalog } = compileCatalog(catalogSource);

it("starts without looping and preserves the player's loop choice when replacing its theme", () => {
  const initial = createSession(catalog);
  expect(initial.loop).toBe(false);
  const themed = transitionSession(catalog, initial, { type: "theme", theme: "light" }, { timeMs: 600, speed: 2, loop: true });
  expect(themed.session.loop).toBe(true);
  expect(themed.session.timeMs).toBe(600);
  expect(themed.addressUpdates.every(({ address }) => !address.includes("loop="))).toBe(true);
});

it("retains the runtime loop choice through history restoration but starts a fresh address without it", () => {
  const initial = createSession(catalog);
  const restored = transitionSession(catalog, initial, { type: "restore", address: "/?theme=light&time=1200" }, { timeMs: 600, speed: 2, loop: true });
  expect(restored.session).toMatchObject({ loop: true, timeMs: 1200, version: 1, settings: { speed: 1.5 } });
  expect(restoreSession(catalog, restored.addressUpdates[0].address).session.loop).toBe(false);
  const disabled = transitionSession(catalog, restored.session, { type: "restore", address: "/?time=0" }, { timeMs: 1200, speed: 1.5, loop: false });
  expect(disabled.session.loop).toBe(false);
});

it("saves loop for sharing, reduced motion and retries without putting it in an address", () => {
  const shared = transitionSession(catalog, createSession(catalog), { type: "share" }, { timeMs: 900, speed: 2, loop: true });
  expect(shared.session.loop).toBe(true);
  expect(shared.copyAddress).not.toContain("loop=");
  const reduced = transitionSession(catalog, shared.session, { type: "reducedMotion", reducedMotion: true });
  expect(reduced.session.loop).toBe(true);
  const retried = transitionSession(catalog, reduced.session, { type: "retry" });
  expect(retried.session.loop).toBe(true);
});

it("rebuilds visual settings at the action snapshot, paused by the host, and retains speed", () => {
  const initial = createSession(catalog);
  const result = transitionSession(catalog, initial, { type: "theme", theme: "light" }, { timeMs: 1200, speed: 2, loop: false });
  expect(result.replacePlayer).toBe(true);
  expect(result.session).toEqual({ exampleId: "signal-motion", settings: { theme: "light", reducedMotion: false, speed: 2 }, timeMs: 1200, loop: false, version: 1, diagnostics: [] });
  expect(initial).toEqual({ exampleId: "signal-motion", settings: { theme: "dark", reducedMotion: false, speed: 1.5 }, timeMs: 0, loop: false, version: 0, diagnostics: [] });
});

it("selects a new example at zero with its rate and the current visual choices", () => {
  const initial = createSession(catalog);
  const result = transitionSession(catalog, initial, { type: "select", exampleId: "signal-still" }, { timeMs: 1300, speed: 2, loop: true });
  expect(result.session).toEqual({ exampleId: "signal-still", settings: { speed: 0.5, theme: "dark", reducedMotion: false }, timeMs: 0, loop: true, version: 1, diagnostics: [] });
  expect(result.replacePlayer).toBe(true);
});

it("changes reduced motion without losing the saved target when mounting is unavailable", () => {
  const current = transitionSession(catalog, createSession(catalog), { type: "theme", theme: "light" }, { timeMs: 900, speed: 3, loop: false }).session;
  const result = transitionSession(catalog, current, { type: "reducedMotion", reducedMotion: true });
  expect(result.session).toEqual({ ...current, settings: { ...current.settings, reducedMotion: true }, version: 2 });
  expect(result.replacePlayer).toBe(true);
});

it("leaves empty, unknown and repeated choices unchanged without replacing player resources", () => {
  const emptyCatalog = compileCatalog({ definitions: [], order: [], defaultId: null }).catalog;
  const empty = createSession(emptyCatalog);
  expect(empty).toEqual({ exampleId: null, settings: null, timeMs: 0, loop: false, version: 0, diagnostics: [] });
  expect(transitionSession(emptyCatalog, empty, { type: "theme", theme: "dark" })).toEqual({ session: empty, replacePlayer: false, addressUpdates: [] });
  const current = createSession(catalog);
  for (const operation of [{ type: "theme", theme: "dark" }, { type: "reducedMotion", reducedMotion: false }, { type: "select", exampleId: "unknown" }, { type: "select", exampleId: "signal-motion" }] as const) {
    expect(transitionSession(catalog, current, operation, { timeMs: 900, speed: 2, loop: false })).toEqual({ session: current, replacePlayer: false, addressUpdates: [] });
  }
});

it("retries the saved selection with a fresh ownership version and captures a resumed snapshot", () => {
  const current = createSession(catalog);
  const result = transitionSession(catalog, current, { type: "retry" }, { timeMs: 800, speed: 2, loop: false });
  expect(result.session).toEqual({ ...current, settings: { ...current.settings, speed: 2 }, timeMs: 800, version: 1, diagnostics: [] });
  expect(result.replacePlayer).toBe(true);
});
