/**
 * SVG DOM synchronization: apply core-generated static SVG to existing elements and paint order.
 * This layer stores no animation state and does not recalculate time, geometry or colors.
 */
/** Apply core serialization while retaining reusable SVG elements; accept only markup produced by the core. */
export function updateSvgDom(host: HTMLElement, markup: string): void {
  const template = host.ownerDocument.createElement("template");
  template.innerHTML = markup;
  const next = template.content.firstElementChild;
  if (!next) throw new Error("Core SVG output is empty");
  const current = host.firstElementChild;
  if (!current || current.tagName !== next.tagName) {
    host.replaceChildren(next);
    return;
  }
  synchronizeElement(current, next);
}

/** Remove obsolete attributes before applying new ones so visibility/style changes leave no stale paint. */
function synchronizeElement(current: Element, next: Element): void {
  for (const attribute of Array.from(current.attributes)) {
    if (!next.hasAttribute(attribute.name)) current.removeAttribute(attribute.name);
  }
  for (const attribute of Array.from(next.attributes)) {
    if (current.getAttribute(attribute.name) !== attribute.value) current.setAttribute(attribute.name, attribute.value);
  }
  if (next.children.length === 0) {
    if (current.textContent !== next.textContent) current.textContent = next.textContent;
    return;
  }
  synchronizeChildren(current, next);
}

/**
 * Match object keys first, reuse unkeyed elements by tag, and synchronize paint order.
 * Retain matching elements so per-frame updates preserve interactions attached by the host.
 */
function synchronizeChildren(current: Element, next: Element): void {
  const existing = Array.from(current.children);
  const keyed = new Map<string, Element>();
  for (const child of existing) {
    const key = elementKey(child);
    if (key !== undefined) keyed.set(key, child);
  }
  const used = new Set<Element>();
  let cursor = current.firstElementChild;
  for (const child of Array.from(next.children)) {
    const key = elementKey(child);
    const match = key === undefined
      ? existing.find((candidate) => !used.has(candidate) && elementKey(candidate) === undefined && candidate.tagName === child.tagName)
      : keyed.get(key);
    const target = match?.tagName === child.tagName ? match : child;
    used.add(target);
    if (target !== cursor) current.insertBefore(target, cursor);
    if (target === match) synchronizeElement(target, child);
    cursor = target.nextElementSibling;
  }
  for (const child of existing) {
    if (!used.has(child)) child.remove();
  }
}

function elementKey(element: Element): string | undefined {
  const objectId = element.getAttribute("data-id");
  if (objectId !== null) return `object:${objectId}`;
  const id = element.getAttribute("id");
  return id === null ? undefined : `id:${id}`;
}
