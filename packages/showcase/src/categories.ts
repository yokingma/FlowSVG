/** Primary purposes for private showcase navigation; these labels are not part of the SDK document format. */
export const SHOWCASE_CATEGORIES = Object.freeze({
  architecture: "系统架构",
  workflow: "业务流程",
  sequence: "交互时序",
  "data-flow": "数据流",
  state: "状态转换",
  deployment: "部署拓扑"
});

/** Each example selects one primary purpose, even when its diagram combines several techniques. */
export type ShowcaseCategory = keyof typeof SHOWCASE_CATEGORIES;
