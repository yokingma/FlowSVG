// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import type { DiagramDocument } from "../core/model.js";
import type { FlowPlayer, PlayerOptions } from "../browser/player.js";
import { HostPlayerLifecycle, type HostPlayerLifecycleOptions } from "./host-lifecycle.js";

const document = {
  version: 1,
  viewport: { width: 320, height: 180 },
  nodes: [],
  edges: [],
  scenes: []
} satisfies DiagramDocument;

function createFakePlayer(log: string[], host: HTMLElement): FlowPlayer {
  let destroyed = false;
  return {
    element: host,
    play: () => undefined,
    pause: () => undefined,
    seek: () => undefined,
    step: () => undefined,
    setSpeed: () => undefined,
    setLoop: () => undefined,
    load: () => {
      if (destroyed) throw new Error("destroyed");
      throw new Error("invalid document");
    },
    getState: () => ({
      timeMs: 0,
      totalDuration: 0,
      playing: false,
      loop: false,
      speed: 1,
      frame: {} as ReturnType<FlowPlayer["getState"]>["frame"]
    }),
    destroy: () => {
      if (destroyed) return;
      destroyed = true;
      log.push("destroy");
    }
  };
}

const options: HostPlayerLifecycleOptions = {
  theme: "light",
  controls: false,
  gifExport: false,
  hoverFill: false,
  reducedMotion: false
};

describe("HostPlayerLifecycle", () => {
  it("detaches old events before destroying during replacement", () => {
    const host = window.document.createElement("div");
    const log: string[] = [];
    const lifecycle = new HostPlayerLifecycle({
      createPlayer: (_host, _document, _options) => {
        log.push("create");
        return createFakePlayer(log, host);
      },
      attachEvents: () => {
        log.push("attach");
        return () => log.push("cleanup");
      }
    });

    lifecycle.mount({ host, document, options });
    lifecycle.rebuild({ host, document, options });

    expect(log).toEqual(["create", "attach", "cleanup", "destroy", "create", "attach"]);
  });

  it("keeps the player after a failed document load and destroys idempotently", () => {
    const host = window.document.createElement("div");
    const log: string[] = [];
    const player = createFakePlayer(log, host);
    const lifecycle = new HostPlayerLifecycle({
      createPlayer: () => player,
      attachEvents: () => () => log.push("cleanup")
    });

    lifecycle.mount({ host, document, options });
    expect(() => lifecycle.load(document)).toThrow("invalid document");
    expect(lifecycle.player).toBe(player);

    lifecycle.destroy();
    lifecycle.destroy();
    expect(log).toEqual(["cleanup", "destroy"]);
  });
});
