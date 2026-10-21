/** Real-browser host harness; use public SDK entries and component options, never implementation internals. */
import { createPlayer, type FlowPlayer, type PlayerOptions } from "../../dist/browser.js";
import type { DiagramDocument } from "../../dist/index.js";
import { FlowPlayer as ReactPlayer, type FlowPlayerHandle as ReactHandle } from "../../dist/react.js";
import { FlowPlayer as VuePlayer, type FlowPlayerHandle as VueHandle } from "../../dist/vue.js";
import { defineFlowPlayer, type FlowPlayerElement } from "../../dist/web-component.js";
import { createElement, createRef } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { createApp, h, nextTick, ref, shallowRef } from "vue";

defineFlowPlayer();
export type Host = "browser" | "react" | "vue" | "element";
export interface MountedPlayer {
  play(): void;
  setSpeed(speed: number): void;
  seek(time: number): void;
  getState(): ReturnType<FlowPlayer["getState"]>;
  load(document: DiagramDocument): Promise<void>;
  options(options: PlayerOptions): Promise<void>;
  destroy(): void;
}

export function mountPlayer(host: HTMLElement, entry: Host, document: DiagramDocument, options: PlayerOptions): MountedPlayer {
  if (entry === "browser") {
    let player = createPlayer(host, document, options);
    return { play: () => player.play(), seek: (time) => player.seek(time), setSpeed: (speed) => player.setSpeed(speed),
      getState: () => player.getState(), load: async (next) => { document = next; player.load(next); },
      options: async (next) => { player.destroy(); player = createPlayer(host, document, next); }, destroy: () => player.destroy() };
  }
  if (entry === "react") {
    const root = createRoot(host);
    const handle = createRef<ReactHandle>();
    const render = (): void => { flushSync(() => root.render(createElement(ReactPlayer, { document, ...options, ref: handle }))); };
    render();
    return { play: () => handle.current!.play(), seek: (time) => handle.current!.seek(time), setSpeed: (speed) => handle.current!.setSpeed(speed),
      getState: () => handle.current!.getState(), load: async (next) => { document = next; render(); },
      options: async (next) => { options = next; render(); }, destroy: () => flushSync(() => root.unmount()) };
  }
  if (entry === "vue") {
    const current = ref(document);
    const settings = shallowRef(options);
    const handle = shallowRef<VueHandle>();
    const app = createApp({ render: () => h(VuePlayer, { document: current.value, ...settings.value, ref: handle }) });
    app.mount(host);
    return { play: () => handle.value!.play(), seek: (time) => handle.value!.seek(time), setSpeed: (speed) => handle.value!.setSpeed(speed),
      getState: () => handle.value!.getState(), load: async (next) => { current.value = next; await nextTick(); },
      options: async (next) => { settings.value = next; await nextTick(); }, destroy: () => app.unmount() };
  }
  const element = host.ownerDocument.createElement("flowsvg-player") as FlowPlayerElement;
  Object.assign(element, { document, ...options }); host.append(element);
  return { play: () => element.play(), seek: (time) => element.seek(time), setSpeed: (speed) => element.setSpeed(speed),
    getState: () => element.getState()!, load: async (next) => { element.document = next; },
    options: async (next) => { Object.assign(element, next); }, destroy: () => element.remove() };
}
