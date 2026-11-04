/** Primary purposes for private showcase navigation; these labels are not part of the SDK document format. */
export const SHOWCASE_CATEGORIES = Object.freeze({
  architecture: "Architecture",
  workflow: "Workflow",
  sequence: "Sequence",
  "data-flow": "Data flow",
  state: "State transitions",
  deployment: "Deployment"
});

/** Each example selects one primary purpose, even when its diagram combines several techniques. */
export type ShowcaseCategory = keyof typeof SHOWCASE_CATEGORIES;
