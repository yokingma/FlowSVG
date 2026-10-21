/** Translate keyboard input and reduced-motion preferences to player actions without changing core timeline semantics. */
interface KeyboardActions {
  toggle(): void;
  step(direction: 1 | -1): void;
}

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

/** Explicit values need no subscription; otherwise return the system preference with change notifications and cleanup. */
export function observeReducedMotion(owner: Document, explicit: boolean | undefined, onChange: (reducedMotion: boolean) => void): {
  value: boolean;
  cleanup(): void
} {
  if (explicit !== undefined) return { value: explicit, cleanup: () => { } };
  const query = owner.defaultView?.matchMedia(REDUCED_MOTION_QUERY);
  const handleChange = (event: MediaQueryListEvent): void => onChange(event.matches);
  query?.addEventListener("change", handleChange);
  return { value: query?.matches ?? false, cleanup: () => query?.removeEventListener("change", handleChange) };
}

/**
 * Make the canvas focusable and handle Space/Arrow keys, returning a listener cleanup callback.
 * Leave editable areas, native controls, modifier chords and repeated keys to their existing handlers.
 */
export function observeKeyboard(canvas: HTMLElement, actions: KeyboardActions): () => void {
  canvas.tabIndex = 0;
  canvas.setAttribute("aria-label", "Diagram playback");
  canvas.setAttribute("aria-keyshortcuts", "Space ArrowLeft ArrowRight");
  const handleKey = (event: KeyboardEvent): void => {
    if (event.defaultPrevented || event.repeat || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    const target = event.target;
    if (target instanceof HTMLElement && (target.isContentEditable || target.closest("button,input,select,textarea,a[href]"))) return;
    if (event.key === " ") {
      event.preventDefault();
      actions.toggle();
    } else if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      actions.step(event.key === "ArrowLeft" ? -1 : 1);
    }
  };
  canvas.addEventListener("keydown", handleKey);
  return () => canvas.removeEventListener("keydown", handleKey);
}
