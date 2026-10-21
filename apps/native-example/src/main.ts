/** Native host owns versioned SDK resources. Shared session rules own operation targets, never the playback clock. */
import { catalog, type ShowcaseDefinition } from "@flowsvg/showcase/author";
import { restoreSession, transitionSession, type AddressUpdate, type PlaybackSnapshot, type SessionOperation, type SessionTransition } from "@flowsvg/showcase/session";
import { SelectControl, createPlayer, type FlowPlayer, type PlayerErrorDetail } from "flowsvg/browser";
import "flowsvg/styles.css";
import "./style.css";

const navigation = requireElement("nav");
const introduction = requireElement("#introduction");
const playerHost = requireElement("#player");
const downloadHost = requireElement("#download");
const errorHost = requireElement("#error");
const visualHost = requireElement("#visual-settings");
const themeSelect = new SelectControl(document, "Theme", (theme) => {
  if (theme === "light" || theme === "dark") applyOperation({ type: "theme", theme });
});
requireElement("#theme").append(themeSelect.element);
const THEME_CHOICES = [{ value: "light", label: "Light" }, { value: "dark", label: "Dark" }];
const reducedInput = requireElement<HTMLInputElement>("#reduced-motion");
const diagnosticsHost = requireElement("#parameter-diagnostics");
const sharingHost = requireElement("#sharing");
const shareButton = requireElement("#share");
const shareResult = requireElement("#share-result");
const manualShare = requireElement("#manual-share");
const shareUrl = requireElement<HTMLInputElement>("#share-url");
const initial = restoreSession(catalog, location.href);
let session = initial.session;
let shareRequest = 0;
let player: FlowPlayer | undefined;
let removePlayerEvents: (() => void) | undefined;
let activeVersion: number | undefined;
let suspendedSnapshot: PlaybackSnapshot | undefined;

for (const group of catalog.groups) {
  const section = document.createElement("div");
  section.className = "example-group";
  section.setAttribute("role", "group");
  section.setAttribute("aria-labelledby", `category-${group.id}`);
  const heading = document.createElement("h3");
  heading.id = `category-${group.id}`;
  heading.className = "category-title";
  heading.textContent = group.label;
  section.append(heading);
  for (const definition of group.entries) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = definition.name;
    button.dataset.example = definition.id;
    section.append(button);
  }
  navigation.append(section);
}

function applyOperation(operation: SessionOperation, snapshot?: PlaybackSnapshot): SessionTransition {
  const captured = snapshot ? { snapshot } : captureSnapshot();
  const transition = transitionSession(catalog, session, operation, captured.snapshot, location.href);
  applyAddressUpdates(transition.addressUpdates);
  session = transition.session;
  renderDiagnostics();
  if (!transition.replacePlayer) {
    if ("error" in captured) showError(captured.error);
    return transition;
  }
  // Invalidate old callbacks and clipboard results before pause/destroy can dispatch reentrant events.
  clearShareResult();
  releasePlayer();
  mountSession();
  if ("error" in captured) showError(captured.error);
  return transition;
}

/** Execute the shared ordered plan: save the previous entry before adding its target. */
function applyAddressUpdates(updates: readonly AddressUpdate[]): void {
  for (const update of updates) {
    if (update.method === "replace") history.replaceState(history.state, "", update.address);
    else history.pushState(null, "", update.address);
  }
}

function renderDiagnostics(): void {
  diagnosticsHost.textContent = session.diagnostics.map(({ message }) => message).join(" · ");
  diagnosticsHost.hidden = session.diagnostics.length === 0;
}

function clearShareResult(): void {
  shareRequest++;
  shareResult.hidden = true;
  manualShare.hidden = true;
}

/** Snapshot and update the address before awaiting the OS clipboard; only the latest request owns its result. */
async function shareCurrentView(): Promise<void> {
  clearShareResult();
  const request = shareRequest;
  const { copyAddress } = applyOperation({ type: "share" });
  if (copyAddress === undefined) return;
  shareUrl.value = copyAddress;
  try {
    if (!navigator.clipboard) throw new Error("Clipboard is unavailable in this browser context");
    await navigator.clipboard.writeText(copyAddress);
    if (request !== shareRequest) return;
    shareResult.textContent = "Share link copied.";
  } catch (error) {
    if (request !== shareRequest) return;
    shareResult.textContent = `Unable to copy the share link: ${error instanceof Error ? error.message : String(error)}. Copy the URL below.`;
    manualShare.hidden = false;
  }
  if (request === shareRequest) shareResult.hidden = false;
}

function onPopState(): void {
  applyOperation({ type: "restore", address: location.href });
}

function captureSnapshot(): { snapshot?: PlaybackSnapshot; error?: unknown } {
  if (!player) return {};
  try {
    const { timeMs, speed } = player.getState();
    return { snapshot: { timeMs, speed } };
  } catch (error) {
    return { error };
  }
}

function mountSession(): void {
  const definition = session.exampleId === null ? undefined : catalog.get(session.exampleId);
  if (!definition || !session.settings) return;
  const version = session.version;
  errorHost.hidden = true;
  visualHost.hidden = false;
  sharingHost.hidden = false;
  themeSelect.render(THEME_CHOICES, session.settings.theme);
  reducedInput.checked = session.settings.reducedMotion;
  for (const button of navigation.querySelectorAll("button")) button.setAttribute("aria-current", String(button.dataset.example === definition.id));
  renderIntroduction(definition);
  try {
    const mounted = createPlayer(playerHost, definition.document, { theme: session.settings.theme, reducedMotion: session.settings.reducedMotion, controls: true, gifExport: true });
    player = mounted;
    activeVersion = version;
    const onError = (event: Event): void => {
      if (activeVersion === version && session.version === version) showError((event as CustomEvent<PlayerErrorDetail>).detail.error);
    };
    playerHost.addEventListener("error", onError);
    removePlayerEvents = () => playerHost.removeEventListener("error", onError);
    mounted.setSpeed(session.settings.speed);
    mounted.seek(session.timeMs);
  } catch (error) {
    releasePlayer();
    if (session.version === version) showError(error);
  }
}

function renderIntroduction(definition: ShowcaseDefinition): void {
  const title = document.createElement("h2");
  title.textContent = definition.name;
  const copy = document.createElement("p");
  copy.textContent = definition.introduction;
  introduction.replaceChildren(title, copy);
  const link = document.createElement("a");
  link.textContent = "Download diagram JSON";
  link.href = new URL(definition.jsonPath, new URL(import.meta.env.BASE_URL, location.href)).href;
  link.download = `${definition.id}.json`;
  downloadHost.replaceChildren(link);
}

function releasePlayer(): void {
  activeVersion = undefined;
  removePlayerEvents?.();
  removePlayerEvents = undefined;
  const previous = player;
  player = undefined;
  if (!previous) return;
  try { previous.pause(); } catch (error) { showError(error); }
  try { previous.destroy(); } catch (error) { showError(error); }
}

function showError(error: unknown): void {
  errorHost.textContent = `Unable to display this example: ${error instanceof Error ? error.message : String(error)}`;
  errorHost.hidden = false;
}

function onSelect(event: Event): void {
  const target = event.target;
  if (!(target instanceof HTMLButtonElement) || !target.dataset.example) return;
  if (target.dataset.example === session.exampleId && !player) { applyOperation({ type: "retry" }); return; }
  applyOperation({ type: "select", exampleId: target.dataset.example });
}

function onVisualChange(event: Event): void {
  if (event.target === reducedInput) {
    applyOperation({ type: "reducedMotion", reducedMotion: reducedInput.checked });
    return;
  }
}

function attachListeners(): void {
  navigation.addEventListener("click", onSelect);
  visualHost.addEventListener("change", onVisualChange);
  shareButton.addEventListener("click", shareCurrentView);
  window.addEventListener("popstate", onPopState);
}

function dispose(event: PageTransitionEvent): void {
  const captured = captureSnapshot();
  suspendedSnapshot = captured.snapshot;
  if ("error" in captured) showError(captured.error);
  clearShareResult();
  navigation.removeEventListener("click", onSelect);
  visualHost.removeEventListener("change", onVisualChange);
  shareButton.removeEventListener("click", shareCurrentView);
  window.removeEventListener("popstate", onPopState);
  releasePlayer();
  if (event.persisted) return;
  themeSelect.destroy();
  window.removeEventListener("pagehide", dispose);
  window.removeEventListener("pageshow", resume);
}

/** A cached page resumes without module evaluation; restore its saved operation target and app listeners. */
function resume(event: PageTransitionEvent): void {
  if (!event.persisted) return;
  attachListeners();
  applyOperation({ type: "retry" }, suspendedSnapshot);
  suspendedSnapshot = undefined;
}

function requireElement<T extends HTMLElement = HTMLElement>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing showcase element: ${selector}`);
  return element;
}

applyAddressUpdates(initial.addressUpdates);
renderDiagnostics();
attachListeners();
window.addEventListener("pagehide", dispose);
window.addEventListener("pageshow", resume);
if (session.exampleId !== null) mountSession();
else {
  const empty = document.createElement("h2");
  empty.textContent = "No showcase examples configured.";
  const copy = document.createElement("p");
  copy.textContent = "The formal example catalog is awaiting content selection.";
  introduction.replaceChildren(empty, copy);
}
