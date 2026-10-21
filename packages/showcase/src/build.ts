/** Build-time catalog compiler. SDK compilation validates documents and owns duration calculation. */
import { createDiagram, DiagramValidationError, type DiagramDocument } from "flowsvg";
import { createCatalog } from "./catalog.js";
import { assertJsonData } from "./json-data.js";
import { SHOWCASE_CATEGORIES, type ShowcaseCategory } from "./categories.js";
import type { ShowcaseAuthorDefinition, ShowcaseCatalog, ShowcaseDefinition } from "./model.js";

const SAFE_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Generated JSON is diagram-only data; map keys are paths relative to each deployed site. */
export interface CompiledCatalog {
  readonly catalog: ShowcaseCatalog;
  readonly json: ReadonlyMap<string, string>;
}

/** Compile author input; errors identify the source field, before any generated files are written. */
export function compileCatalog(input: unknown): CompiledCatalog {
  const source = readRecord(input, "catalog");
  if (!Array.isArray(source.definitions)) fail("definitions", "must be an array");
  const definitions = source.definitions.map(readDefinition);
  const byId = new Map<string, ShowcaseAuthorDefinition>();
  definitions.forEach((definition, index) => {
    if (byId.has(definition.id)) fail(`definitions[${index}].id`, `duplicate ${definition.id}`);
    byId.set(definition.id, definition);
  });
  const order = readOrder(source.order, byId);
  const defaultId = source.defaultId;
  if (order.length === 0 ? defaultId !== null : typeof defaultId !== "string" || !order.includes(defaultId)) {
    fail("defaultId", "must name an ordered definition, or be null for an empty catalog");
  }
  const entries: ShowcaseDefinition[] = order.map((id) => {
    const definition = byId.get(id)!;
    return { ...definition, durationMs: compileDuration(definition), jsonPath: `json/${id}.json` };
  });
  return {
    catalog: createCatalog(entries, defaultId as string | null),
    json: new Map(entries.map((entry) => [entry.jsonPath, `${JSON.stringify(entry.document, null, 2)}\n`]))
  };
}

function readDefinition(input: unknown, index: number): ShowcaseAuthorDefinition {
  const path = `definitions[${index}]`;
  const definition = readRecord(input, path);
  const id = readText(definition.id, `${path}.id`);
  if (!SAFE_ID.test(id)) fail(`${path}.id`, "must use lowercase letters, digits and single hyphens");
  const defaults = readRecord(definition.defaults, `${path}.defaults`);
  if (typeof defaults.speed !== "number" || !Number.isFinite(defaults.speed) || defaults.speed <= 0) {
    fail(`${path}.defaults.speed`, "must be a finite positive number");
  }
  if (defaults.theme !== "light" && defaults.theme !== "dark") fail(`${path}.defaults.theme`, "must be light or dark");
  if (typeof defaults.reducedMotion !== "boolean") fail(`${path}.defaults.reducedMotion`, "must be boolean");
  assertJsonData(definition.document, `${path}.document`);
  return {
    id, name: readText(definition.name, `${path}.name`), category: readCategory(definition.category, `${path}.category`),
    introduction: readText(definition.introduction, `${path}.introduction`),
    document: definition.document as DiagramDocument,
    defaults: { speed: defaults.speed, theme: defaults.theme, reducedMotion: defaults.reducedMotion }
  };
}

function readCategory(input: unknown, path: string): ShowcaseCategory {
  if (typeof input !== "string" || !Object.hasOwn(SHOWCASE_CATEGORIES, input)) {
    fail(path, `must be one of ${Object.keys(SHOWCASE_CATEGORIES).join(", ")}`);
  }
  return input as ShowcaseCategory;
}

function readOrder(input: unknown, definitions: ReadonlyMap<string, ShowcaseAuthorDefinition>): string[] {
  if (!Array.isArray(input)) fail("order", "must be an array");
  const seen = new Set<string>();
  const order = input.map((value, index) => {
    const path = `order[${index}]`;
    const id = readText(value, path);
    if (seen.has(id)) fail(path, `duplicate ${id}`);
    if (!definitions.has(id)) fail(path, `missing definition ${id}`);
    seen.add(id);
    return id;
  });
  for (const id of definitions.keys()) if (!seen.has(id)) fail("order", `definition ${id} is not listed`);
  return order;
}

function readRecord(input: unknown, path: string): Record<string, unknown> {
  if (typeof input !== "object" || input === null || Array.isArray(input)) fail(path, "must be an object");
  return input as Record<string, unknown>;
}

function readText(input: unknown, path: string): string {
  if (typeof input !== "string" || input.trim() === "") fail(path, "must be a nonempty string");
  return input;
}

function fail(path: string, message: string): never {
  throw new Error(`${path}: ${message}`);
}

function compileDuration(definition: ShowcaseAuthorDefinition): number {
  try {
    return createDiagram(definition.document).totalDuration;
  } catch (error) {
    if (error instanceof DiagramValidationError) {
      fail(`${definition.id}.document`, error.issues.map(({ path, message }) => `${path}: ${message}`).join("; "));
    }
    throw error;
  }
}
