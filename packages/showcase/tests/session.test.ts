import { expect, it } from "vitest";
import { compileCatalog } from "../src/build.js";
import { catalogSource } from "../src/acceptance.js";
import { createSession, transitionSession } from "../src/session.js";

const { catalog } = compileCatalog(catalogSource);

it("rebuilds visual settings at the action snapshot, paused by the host, and retains speed", () => {
  const initial = createSession(catalog);
  const result = transitionSession(catalog, initial, { type: "theme", theme: "light" }, { timeMs: 1200, speed: 2 });
  expect(result.replacePlayer).toBe(true);
  expect(result.session).toEqual({ exampleId: "signal-motion", settings: { theme: "light", reducedMotion: false, speed: 2 }, timeMs: 1200, version: 1, diagnostics: [] });
  expect(initial).toEqual({ exampleId: "signal-motion", settings: { theme: "dark", reducedMotion: false, speed: 1.5 }, timeMs: 0, version: 0, diagnostics: [] });
});

it("selects a new example at zero with its rate and the current visual choices", () => {
  const initial = createSession(catalog);
  const result = transitionSession(catalog, initial, { type: "select", exampleId: "signal-still" }, { timeMs: 1300, speed: 2 });
  expect(result.session).toEqual({ exampleId: "signal-still", settings: { speed: 0.5, theme: "dark", reducedMotion: false }, timeMs: 0, version: 1, diagnostics: [] });
  expect(result.replacePlayer).toBe(true);
});

it("changes reduced motion without losing the saved target when mounting is unavailable", () => {
  const current = transitionSession(catalog, createSession(catalog), { type: "theme", theme: "light" }, { timeMs: 900, speed: 3 }).session;
  const result = transitionSession(catalog, current, { type: "reducedMotion", reducedMotion: true });
  expect(result.session).toEqual({ ...current, settings: { ...current.settings, reducedMotion: true }, version: 2 });
  expect(result.replacePlayer).toBe(true);
});

it("leaves empty, unknown and repeated choices unchanged without replacing player resources", () => {
  const emptyCatalog = compileCatalog({ definitions: [], order: [], defaultId: null }).catalog;
  const empty = createSession(emptyCatalog);
  expect(empty).toEqual({ exampleId: null, settings: null, timeMs: 0, version: 0, diagnostics: [] });
  expect(transitionSession(emptyCatalog, empty, { type: "theme", theme: "dark" })).toEqual({ session: empty, replacePlayer: false, addressUpdates: [] });
  const current = createSession(catalog);
  for (const operation of [{ type: "theme", theme: "dark" }, { type: "reducedMotion", reducedMotion: false }, { type: "select", exampleId: "unknown" }, { type: "select", exampleId: "signal-motion" }] as const) {
    expect(transitionSession(catalog, current, operation, { timeMs: 900, speed: 2 })).toEqual({ session: current, replacePlayer: false, addressUpdates: [] });
  }
});

it("retries the saved selection with a fresh ownership version and captures a resumed snapshot", () => {
  const current = createSession(catalog);
  const result = transitionSession(catalog, current, { type: "retry" }, { timeMs: 800, speed: 2 });
  expect(result.session).toEqual({ ...current, settings: { ...current.settings, speed: 2 }, timeMs: 800, version: 1, diagnostics: [] });
  expect(result.replacePlayer).toBe(true);
});
