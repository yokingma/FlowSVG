// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createPlayer } from "../browser.js";
import type { DiagramDocument } from "../index.js";

const narrative: DiagramDocument = {
  version: 1, viewport: { width: 320, height: 180 }, nodes: [], edges: [],
  scenes: [{ id: "scene", label: "Scene", beats: [{ durationMs: 1000, actions: [] }] }]
};

afterEach(() => vi.unstubAllGlobals());

function createClock() {
  const callbacks = new Map<number, FrameRequestCallback>();
  let nextId = 0;
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    const id = ++nextId;
    callbacks.set(id, callback);
    return id;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => callbacks.delete(id));
  return {
    advance(timestamp: number) {
      for (const [id, callback] of [...callbacks]) if (callbacks.delete(id)) callback(timestamp);
    },
    pending: () => callbacks.size
  };
}

describe("live loop playback", () => {
  it("retains elapsed remainder and speed across multiple loops without a pause event", () => {
    const clock = createClock();
    const host = window.document.createElement("div");
    const player = createPlayer(host, narrative, { loop: true, reducedMotion: false });
    const transitions = vi.fn();
    host.addEventListener("playstatechange", transitions);
    try {
      player.setSpeed(2);
      player.play();
      clock.advance(100);
      clock.advance(1850);
      expect(player.getState()).toMatchObject({ timeMs: 500, playing: true, loop: true, speed: 2 });
      expect(transitions).toHaveBeenCalledTimes(1);
      expect(clock.pending()).toBe(1);
    } finally { player.destroy(); }
    expect(clock.pending()).toBe(0);
  });
  it("honors a reentrant seek to the end while play restarts a loop", () => {
    const clock = createClock();
    const host = window.document.createElement("div");
    const player = createPlayer(host, narrative, { loop: true, reducedMotion: false });
    try {
      player.seek(1000);
      host.addEventListener("timeupdate", () => player.seek(1000), { once: true });
      player.play();
      expect(player.getState()).toMatchObject({ timeMs: 1000, playing: false });
      expect(clock.pending()).toBe(0);
    } finally { player.destroy(); }
  });

  it("defaults off, toggles accessibly, and reports only actual mode changes", () => {
    const host = window.document.createElement("div");
    const player = createPlayer(host, narrative, { reducedMotion: false });
    const changes = vi.fn();
    const playback = vi.fn();
    host.addEventListener("loopchange", changes);
    host.addEventListener("playstatechange", playback);
    try {
      const button = host.querySelector<HTMLButtonElement>('button[aria-label="Loop"]');
      expect(player.getState().loop).toBe(false);
      expect(button?.getAttribute("aria-pressed")).toBe("false");
      button?.click();
      expect(player.getState().loop).toBe(true);
      expect(button?.getAttribute("aria-pressed")).toBe("true");
      player.setLoop(true);
      expect(changes).toHaveBeenCalledTimes(1);
      player.setLoop(false);
      expect(changes).toHaveBeenCalledTimes(2);
      expect(playback).not.toHaveBeenCalled();
    } finally { player.destroy(); }
  });

  it("keeps manual end seeks paused, restarts on play only in loop mode, and preserves mode on load", () => {
    const clock = createClock();
    const host = window.document.createElement("div");
    const player = createPlayer(host, narrative, { loop: true, reducedMotion: false });
    try {
      player.play();
      player.seek(1000);
      expect(player.getState()).toMatchObject({ timeMs: 1000, playing: false });
      expect(clock.pending()).toBe(0);
      expect(host.querySelector<HTMLButtonElement>('button[aria-label="Play"]')?.disabled).toBe(false);
      player.play();
      expect(player.getState()).toMatchObject({ timeMs: 0, playing: true });
      clock.advance(0);
      clock.advance(1000);
      expect(player.getState()).toMatchObject({ timeMs: 0, playing: true });
      player.step(1);
      expect(player.getState()).toMatchObject({ timeMs: 1000, playing: false });
      player.setLoop(false);
      player.play();
      expect(player.getState().playing).toBe(false);
      player.setLoop(true);
      player.load({ ...narrative, scenes: [] });
      player.play();
      expect(player.getState()).toMatchObject({ timeMs: 0, playing: false, loop: true });
      expect(clock.pending()).toBe(0);
      expect(host.querySelector<HTMLButtonElement>('button[aria-label="Loop"]')?.disabled).toBe(true);
      player.load(narrative);
      expect(player.getState()).toMatchObject({ loop: true, timeMs: 0, playing: false });
    } finally { player.destroy(); }
  });

  it("stops at the end after loop is disabled while playing", () => {
    const clock = createClock();
    const host = window.document.createElement("div");
    const player = createPlayer(host, narrative, { loop: true, reducedMotion: false });
    try {
      player.play();
      clock.advance(0);
      clock.advance(800);
      player.setLoop(false);
      expect(player.getState()).toMatchObject({ playing: true, timeMs: 800 });
      clock.advance(1200);
      expect(player.getState()).toMatchObject({ playing: false, timeMs: 1000, loop: false });
      expect(clock.pending()).toBe(0);
    } finally { player.destroy(); }
  });

  it.each(["pause", "destroy", "hidden"])("keeps loop RAF ownership safe after a reentrant %s at wrap", (action) => {
    const clock = createClock();
    const host = window.document.createElement("div");
    const player = createPlayer(host, narrative, { loop: true, reducedMotion: false });
    try {
      player.play();
      clock.advance(0);
      clock.advance(900);
      host.addEventListener("timeupdate", () => {
        if (action === "destroy") player.destroy();
        else if (action === "pause") player.pause();
        else {
          vi.spyOn(window.document, "visibilityState", "get").mockReturnValue("hidden");
          window.document.dispatchEvent(new Event("visibilitychange"));
        }
      }, { once: true });
      clock.advance(1100);
      expect(player.getState().playing).toBe(false);
      expect(clock.pending()).toBe(0);
    } finally { player.destroy(); vi.restoreAllMocks(); }
  });

  it("keeps a finite wrapped position when finite speed overflows elapsed multiplication", () => {
    const clock = createClock();
    const host = window.document.createElement("div");
    const player = createPlayer(host, narrative, { loop: true, reducedMotion: false });
    try {
      player.setSpeed(Number.MAX_VALUE);
      player.play();
      clock.advance(0);
      clock.advance(16);
      // The exact IEEE-754 value of MAX_VALUE times 16 has remainder 888 modulo 1000.
      expect(player.getState()).toMatchObject({ timeMs: 888, playing: true });
      expect(clock.pending()).toBe(1);
    } finally { player.destroy(); }
  });

});
