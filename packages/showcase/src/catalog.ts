/** Rehydrate generated catalog data without a DOM, framework, player or SDK runtime dependency. */
import type { ShowcaseCatalog, ShowcaseDefinition } from "./model.js";
import { SHOWCASE_CATEGORIES } from "./categories.js";

/** Freeze generated definitions and derive populated groups in first-appearance order. */
export function createCatalog(entries: readonly ShowcaseDefinition[], defaultId: string | null): ShowcaseCatalog {
  // Generated input has already passed lossless JSON validation; copy it before freezing caller-visible data.
  const frozenEntries = deepFreeze(JSON.parse(JSON.stringify(entries)) as ShowcaseDefinition[]);
  const byId = new Map(frozenEntries.map((entry) => [entry.id, entry]));
  const groups = deepFreeze([...new Set(frozenEntries.map(({ category }) => category))].map((category) => ({
    id: category,
    label: SHOWCASE_CATEGORIES[category],
    entries: frozenEntries.filter((entry) => entry.category === category)
  })));
  return Object.freeze({ entries: frozenEntries, groups, defaultId, get: (id: string) => byId.get(id) });
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}
