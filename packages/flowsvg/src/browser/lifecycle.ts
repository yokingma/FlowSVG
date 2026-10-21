/** Player layout and page-visibility resources, scoped to the lifetime of one instance. */
/**
 * Set up flex/aspect-preserving SVG containment and pause on page hiding; restoring visibility does not resume.
 * The returned cleanup removes owned styles/listeners and restores the host's display/flexDirection.
 */
export function attachPlayerLifecycle(host: HTMLElement, canvas: HTMLElement, pause: () => void): () => void {
  const owner = host.ownerDocument;
  const previousDisplay = host.style.display;
  const previousDirection = host.style.flexDirection;
  host.style.display = "flex";
  host.style.flexDirection = "column";
  // Native SVG scaling and flex layout respond to container changes without allocating a ResizeObserver.
  canvas.style.flex = "1 1 auto";
  canvas.style.minHeight = "0";
  canvas.style.minWidth = "0";
  canvas.style.overflow = "hidden";
  const style = owner.createElement("style");
  style.textContent = ".flowsvg-canvas > svg { display: block; width: 100%; height: 100%; }";
  host.append(style);
  const onVisibilityChange = (): void => {
    if (owner.visibilityState === "hidden") pause();
  };
  owner.addEventListener("visibilitychange", onVisibilityChange);
  return () => {
    owner.removeEventListener("visibilitychange", onVisibilityChange);
    style.remove();
    host.style.display = previousDisplay;
    host.style.flexDirection = previousDirection;
  };
}
