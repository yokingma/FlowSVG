/** Authoring and consumption contracts. Runtime catalog modules do not import the SDK. */
import type { DiagramDocument, ThemeName } from "flowsvg";
import type { ShowcaseCategory } from "./categories.js";

/** Complete initial presentation settings; speed is a finite positive multiplier. */
export interface ShowcaseDefaults {
  readonly speed: number;
  readonly theme: ThemeName;
  readonly reducedMotion: boolean;
}

/** One authored definition. Variants provide complete documents before compilation. */
export interface ShowcaseAuthorDefinition {
  readonly id: string;
  readonly name: string;
  /** Navigation metadata only; omitted from the standalone diagram JSON. */
  readonly category: ShowcaseCategory;
  readonly introduction: string;
  readonly document: DiagramDocument;
  readonly defaults: ShowcaseDefaults;
}

/** Explicit order and default selection. Empty catalogs require a null default. */
export interface CatalogSource {
  readonly definitions: readonly ShowcaseAuthorDefinition[];
  readonly order: readonly string[];
  readonly defaultId: string | null;
}

/** Compiled metadata remains outside the downloadable diagram document. */
export interface ShowcaseDefinition extends ShowcaseAuthorDefinition {
  readonly durationMs: number;
  /** Site-relative generated JSON path, resolved against the deployment base. */
  readonly jsonPath: string;
}

/** A populated primary category. Entries retain their relative catalog order. */
export interface ShowcaseCategoryGroup {
  readonly id: ShowcaseCategory;
  readonly label: string;
  readonly entries: readonly ShowcaseDefinition[];
}

/** Ordered, immutable definitions and lookup. Unknown IDs return undefined. */
export interface ShowcaseCatalog {
  readonly entries: readonly ShowcaseDefinition[];
  /** Nonempty groups in first-appearance order; grouping does not choose the default example. */
  readonly groups: readonly ShowcaseCategoryGroup[];
  readonly defaultId: string | null;
  get(id: string): ShowcaseDefinition | undefined;
}
