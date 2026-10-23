import { expect, it } from "vitest";
import { compileCatalog } from "../src/build.js";
import { catalogSource } from "../src/acceptance.js";
import { restoreSession, serializeSession } from "../src/session.js";

const { catalog } = compileCatalog(catalogSource);

it("restores a shared address paused at its decimal time with target defaults and unchanged unrelated bytes", () => {
  const address = "https://example.test/showcase/?u=%20&phrase=one+two&slash=%2f&flag&&example=signal-motion&theme=light&reduced=1&time=00012.500#part%2f";
  const result = restoreSession(catalog, address, 7);
  expect(result.session).toEqual({ exampleId: "signal-motion", settings: { theme: "light", reducedMotion: true, speed: 1.5 }, timeMs: 12.5, loop: false, version: 7, diagnostics: [] });
  expect(result.replacePlayer).toBe(true);
  expect(result.addressUpdates).toEqual([{ method: "replace", address: "https://example.test/showcase/?u=%20&phrase=one+two&slash=%2f&flag&&example=signal-motion&theme=light&reduced=1&time=12.5#part%2f" }]);
  expect(serializeSession(address, result.session)).toBe(result.addressUpdates[0].address);
});

it.each([
  ["?example=unknown&theme=light", "example", { exampleId: "signal-motion", timeMs: 0, settings: { theme: "light", reducedMotion: false, speed: 1.5 } }],
  ["?example=signal-still&theme=bad&reduced=x&time=200", "theme", { exampleId: "signal-still", timeMs: 0, settings: { theme: "light", reducedMotion: true, speed: 0.5 } }],
  ["?example=signal-still&example=signal-still&time=12", "example", { exampleId: "signal-motion", timeMs: 12 }],
  ["?theme=light&theme=light&reduced=1&reduced=1", "theme", { settings: { theme: "dark", reducedMotion: false } }],
  ["?time=600&%74ime=600", "time", { timeMs: 0 }]
])("diagnoses invalid or duplicate fields independently in %s", (query, field, expected) => {
  const result = restoreSession(catalog, `https://example.test/base/${query}`);
  expect(result.session).toMatchObject(expected);
  expect(result.session.diagnostics.map((diagnostic) => diagnostic.field)).toContain(field);
  expect(result.addressUpdates.map((update) => update.method)).toEqual(["replace"]);
});

it.each(["", " ", "+1", "-0", "-1", "1e2", "0x10", "Infinity", "NaN", "1.", ".5", "9".repeat(400)])("rejects time token %j as a diagnosed zero", (value) => {
  const result = restoreSession(catalog, `/?time=${encodeURIComponent(value)}`);
  expect(result.session.timeMs).toBe(0);
  expect(result.session.diagnostics).toEqual([{ field: "time", message: expect.stringContaining("time") }]);
});

it("clamps finite decimal time, normalizes idempotently and retains the empty catalog", () => {
  const result = restoreSession(catalog, "/base/?time=9000&u=%2f#x%20");
  expect(result.session.timeMs).toBe(catalog.get("signal-motion")!.durationMs);
  expect(result.session.diagnostics).toEqual([]);
  const canonical = result.addressUpdates[0].address;
  expect(restoreSession(catalog, canonical).addressUpdates).toEqual([]);
  const empty = compileCatalog({ definitions: [], order: [], defaultId: null }).catalog;
  const restored = restoreSession(empty, "/base/?example=signal-motion&theme=bad&time=1&u=%20#x");
  expect(restored.session).toMatchObject({ exampleId: null, settings: null, timeMs: 0 });
  expect(restored.replacePlayer).toBe(false);
  expect(restored.addressUpdates).toEqual([{ method: "replace", address: "/base/?u=%20#x" }]);
});

it("roundtrips tiny fractional milliseconds without producing exponent links", () => {
  const result = restoreSession(catalog, "/?time=0.0000001");
  const address = serializeSession("/", result.session);
  expect(address).toContain("time=0.0000001");
  expect(restoreSession(catalog, address).session.timeMs).toBe(0.0000001);
});

it("saves the old action snapshot before pushing a selection or visual target", async () => {
  const { createSession, transitionSession } = await import("../src/session.js");
  const current = createSession(catalog);
  const result = transitionSession(catalog, current, { type: "theme", theme: "light" }, { timeMs: 600, speed: 2, loop: false }, "/showcase/?u=%20#x");
  expect(result.addressUpdates).toEqual([
    { method: "replace", address: "/showcase/?u=%20&example=signal-motion&theme=dark&reduced=0&time=600#x" },
    { method: "push", address: "/showcase/?u=%20&example=signal-motion&theme=light&reduced=0&time=600#x" }
  ]);
  expect(result.session).toMatchObject({ version: 1, timeMs: 600, settings: { speed: 2, theme: "light" } });
  const selected = transitionSession(catalog, result.session, { type: "select", exampleId: "signal-still" }, { timeMs: 700, speed: 3, loop: false }, result.addressUpdates[1].address);
  expect(selected.addressUpdates[0].address).toContain("time=700");
  expect(selected.addressUpdates[1].address).toContain("example=signal-still&theme=light&reduced=0&time=0");
  expect(selected.session.settings?.speed).toBe(0.5);
});

it("shares an operation snapshot without replacement and restores a new ownership version at default speed", async () => {
  const { createSession, transitionSession } = await import("../src/session.js");
  const current = createSession(catalog);
  const share = transitionSession(catalog, current, { type: "share" }, { timeMs: 900, speed: 2, loop: false }, "/?source=%2f#x");
  expect(share.replacePlayer).toBe(false);
  expect(share.session.version).toBe(current.version);
  expect(share.addressUpdates).toEqual([{ method: "replace", address: share.copyAddress }]);
  expect(share.copyAddress).toBe("/?source=%2f&example=signal-motion&theme=dark&reduced=0&time=900#x");
  const restored = transitionSession(catalog, share.session, { type: "restore", address: share.copyAddress! });
  expect(restored.replacePlayer).toBe(true);
  expect(restored.session).toMatchObject({ version: 1, timeMs: 900, settings: { speed: 1.5 } });
  expect(restored.addressUpdates).toEqual([]);
  const repeated = transitionSession(catalog, current, { type: "theme", theme: "dark" }, { timeMs: 900, speed: 2, loop: false }, "/");
  expect(repeated.replacePlayer).toBe(false);
  expect(repeated.addressUpdates).toEqual([]);
});
