/** Vue owns page effects and versioned component lifetimes; shared sessions own targets and address rules. */
import {
  createApp,
  defineComponent,
  h,
  nextTick,
  onBeforeUnmount,
  onErrorCaptured,
  onMounted,
  ref,
  shallowRef,
  type PropType,
} from "vue";
import { FlowPlayer, type FlowPlayerHandle } from "flowsvg/vue";
import { catalog, type ShowcaseDefinition } from "@flowsvg/showcase/author";
import {
  restoreSession,
  transitionSession,
  type AddressUpdate,
  type PlaybackSnapshot,
  type SessionOperation,
  type ShowcaseSession,
} from "@flowsvg/showcase/session";
import { ThemeSelect } from "./theme-select.js";
import "flowsvg/styles.css";
import "./style.css";

/** Capture mount-time adapter errors below navigation. A failed version renders no player until replaced. */
const PlayerBoundary = defineComponent({
  props: {
    target: { type: Object as PropType<ShowcaseSession>, required: true },
    onHandle: {
      type: Function as PropType<(handle: FlowPlayerHandle | null) => void>,
      required: true,
    },
    onFailure: {
      type: Function as PropType<(error: unknown) => void>,
      required: true,
    },
  },
  setup(props) {
    const handle = shallowRef<FlowPlayerHandle | null>(null);
    const failed = ref(false);
    onErrorCaptured((error: unknown) => {
      failed.value = true;
      props.onHandle(null);
      props.onFailure(error);
      return false;
    });
    onMounted(() => {
      if (!failed.value) props.onHandle(handle.value);
    });
    onBeforeUnmount(() => props.onHandle(null));
    return () => {
      const target = props.target;
      const definition =
        target.exampleId === null ? undefined : catalog.get(target.exampleId);
      if (failed.value || !definition || !target.settings) return null;
      return h(FlowPlayer, {
        ref: (instance: unknown) => {
          // Vue exposes these methods at runtime; its component declaration does not encode expose().
          handle.value = instance as FlowPlayerHandle | null;
        },
        document: definition.document,
        ...target.settings,
        loop: target.loop,
        initialTimeMs: target.timeMs,
        controls: true,
        gifExport: true,
        onError: ({ error }) => props.onFailure(error),
      });
    };
  },
});

const App = defineComponent({
  setup() {
    const initial = restoreSession(catalog, location.href);
    const session = shallowRef(initial.session);
    const presented = shallowRef<ShowcaseSession | null>(initial.session);
    const error = ref("");
    const sharing = ref("");
    const manualUrl = ref("");
    let player: FlowPlayerHandle | null = null;
    let activeVersion = session.value.version;
    let clipboardRequest = 0;
    let suspended = false;
    let stopped = false;
    let savedSnapshot: PlaybackSnapshot | undefined;
    applyAddresses(initial.addressUpdates);

    function showError(cause: unknown): void {
      error.value = `Unable to display this example: ${cause instanceof Error ? cause.message : String(cause)}`;
    }
    function capture(): { snapshot?: PlaybackSnapshot; error?: unknown } {
      if (!player) return {};
      try {
        const { timeMs, speed, loop } = player.getState();
        return { snapshot: { timeMs, speed, loop } };
      } catch (cause) {
        return { error: cause };
      }
    }
    function clearSharing(): void {
      clipboardRequest++;
      sharing.value = "";
      manualUrl.value = "";
    }
    function pausePlayer(): void {
      try {
        player?.pause();
      } catch (cause) {
        showError(cause);
      }
      player = null;
    }
    function applyOperation(
      operation: SessionOperation,
      snapshot?: PlaybackSnapshot,
    ): string | undefined {
      if (stopped || suspended) return undefined;
      const captured = snapshot ? { snapshot } : capture();
      const transition = transitionSession(
        catalog,
        session.value,
        operation,
        captured.snapshot,
        location.href,
      );
      applyAddresses(transition.addressUpdates);
      session.value = transition.session;
      if (transition.replacePlayer) {
        clearSharing();
        activeVersion = transition.session.version;
        error.value = "";
        pausePlayer();
        presented.value = null;
        // Flush the actual adapter unmount before mounting its new initialTimeMs target.
        const version = activeVersion;
        void nextTick().then(() => {
          if (!stopped && !suspended && activeVersion === version)
            presented.value = transition.session;
        });
      }
      if ("error" in captured) showError(captured.error);
      return transition.copyAddress;
    }
    async function shareView(): Promise<void> {
      clearSharing();
      const request = clipboardRequest;
      const address = applyOperation({ type: "share" });
      if (address === undefined) return;
      try {
        if (!navigator.clipboard)
          throw new Error("Clipboard is unavailable in this browser context");
        await navigator.clipboard.writeText(address);
        if (request === clipboardRequest) sharing.value = "Share link copied.";
      } catch (cause) {
        if (request !== clipboardRequest) return;
        sharing.value = `Unable to copy the share link: ${cause instanceof Error ? cause.message : String(cause)}. Copy the URL below.`;
        manualUrl.value = address;
      }
    }
    function onPopState(): void {
      applyOperation({ type: "restore", address: location.href });
    }
    function onPageHide(event: PageTransitionEvent): void {
      savedSnapshot = capture().snapshot;
      suspended = true;
      activeVersion++;
      clearSharing();
      pausePlayer();
      presented.value = null;
      window.removeEventListener("popstate", onPopState);
      if (event.persisted) return;
      stopped = true;
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("pageshow", onPageShow);
    }
    function onPageShow(event: PageTransitionEvent): void {
      if (!event.persisted || stopped) return;
      suspended = false;
      window.addEventListener("popstate", onPopState);
      applyOperation({ type: "retry" }, savedSnapshot);
      savedSnapshot = undefined;
    }
    window.addEventListener("popstate", onPopState);
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("pageshow", onPageShow);
    onBeforeUnmount(() => {
      stopped = true;
      activeVersion++;
      clearSharing();
      pausePlayer();
      window.removeEventListener("popstate", onPopState);
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("pageshow", onPageShow);
    });

    function renderNavigation(target: ShowcaseSession) {
      return h("aside", [
        h("h2", { class: "navigation-title" }, "Examples"),
        h(
          "nav",
          { "aria-label": "Examples" },
          catalog.groups.map((group) => h("div", {
            key: group.id, class: "example-group", role: "group", "aria-labelledby": `category-${group.id}`,
          }, [
            h("h3", { id: `category-${group.id}`, class: "category-title" }, group.label),
            ...group.entries.map((entry) =>
              h(
                "button",
                {
                  type: "button",
                  "aria-current": String(entry.id === target.exampleId),
                  onClick: () =>
                    applyOperation(
                      entry.id === target.exampleId && !player
                        ? { type: "retry" }
                        : { type: "select", exampleId: entry.id },
                    ),
                },
                entry.name,
              ),
            ),
          ])),
        ),
      ]);
    }

    function renderVisualSettings(target: ShowcaseSession) {
      const settings = target.settings;
      if (!settings) return null;
      return h("fieldset", { id: "visual-settings" }, [
        h("legend", "Presentation"),
        h("span", { id: "theme-label" }, "Theme"),
        h(ThemeSelect, {
          value: settings.theme,
          onChange: (value: string) => {
            if (value === "light" || value === "dark") applyOperation({ type: "theme", theme: value });
          },
        }),
        h("label", [
          h("input", {
            type: "checkbox",
            checked: settings.reducedMotion,
            onChange: (event: Event) =>
              applyOperation({
                type: "reducedMotion",
                reducedMotion: (event.target as HTMLInputElement).checked,
              }),
          }),
          " Reduce motion",
        ]),
      ]);
    }

    function renderPlayer() {
      const visible = presented.value;
      return h(
        "div",
        { id: "player" },
        visible?.exampleId
          ? h(PlayerBoundary, {
              key: visible.version,
              target: visible,
              onHandle: (handle) => {
                if (activeVersion === visible.version) player = handle;
              },
              onFailure: (cause) => {
                if (activeVersion === visible.version) showError(cause);
              },
            })
          : undefined,
      );
    }

    function renderSharing() {
      return h("div", { id: "sharing" }, [
        h(
          "button",
          { id: "share", type: "button", onClick: shareView },
          "Share current view",
        ),
        h(
          "p",
          { role: "status", "aria-label": "Sharing", hidden: !sharing.value },
          sharing.value,
        ),
        manualUrl.value
          ? h("label", { id: "manual-share" }, [
              "Share URL ",
              h("input", {
                id: "share-url",
                readonly: true,
                value: manualUrl.value,
              }),
            ])
          : null,
      ]);
    }

    return () => {
      const target = session.value;
      const definition =
        target.exampleId === null ? undefined : catalog.get(target.exampleId);
      return h("main", { class: "showcase flowsvg-compact" }, [
        h("header", { class: "showcase-header" }, [
          h("p", { class: "eyebrow" }, "FlowSVG / Vue"),
          h("h1", "Diagram showcase"),
          h(
            "p",
            "Explore a diagram, read its purpose, and take the source with you.",
          ),
        ]),
        h("div", { class: "showcase-layout" }, [
          renderNavigation(target),
          h(
            "section",
            { class: "current-example", "aria-label": "Current example" },
            [
              renderIntroduction(definition),
              h(
                "p",
                {
                  role: "status",
                  "aria-label": "Parameter diagnostics",
                  id: "parameter-diagnostics",
                  hidden: target.diagnostics.length === 0,
                },
                target.diagnostics.map(({ message }) => message).join(" · "),
              ),
              h(
                "p",
                { id: "error", role: "alert", hidden: !error.value },
                error.value,
              ),
              renderVisualSettings(target),
              renderPlayer(),
              definition ? renderDownload(definition) : null,
              definition ? renderSharing() : null,
            ],
          ),
        ]),
      ]);
    };
  },
});

function renderIntroduction(definition: ShowcaseDefinition | undefined) {
  return h(
    "div",
    { id: "introduction" },
    definition
      ? [h("h2", definition.name), h("p", definition.introduction)]
      : [
          h("h2", "No showcase examples configured."),
          h("p", "The formal example catalog is awaiting content selection."),
        ],
  );
}

function renderDownload(definition: ShowcaseDefinition) {
  return h(
    "div",
    { id: "download" },
    h(
      "a",
      {
        href: new URL(
          definition.jsonPath,
          new URL(import.meta.env.BASE_URL, location.href),
        ).href,
        download: `${definition.id}.json`,
      },
      "Download diagram JSON",
    ),
  );
}

function applyAddresses(updates: readonly AddressUpdate[]): void {
  for (const update of updates) {
    if (update.method === "replace")
      history.replaceState(history.state, "", update.address);
    else history.pushState(null, "", update.address);
  }
}

const host = document.getElementById("app");
if (!host) throw new Error("Missing Vue showcase app element");
createApp(App).mount(host);
