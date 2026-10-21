/** Compact semantic content shared by the three card-based category examples; all paint comes from the SDK theme. */
import type { NodeContent } from "flowsvg";

/** Four short blocks fit a 144-unit rounded card at its authored width; longer text still needs overflow checks. */
export function createExampleContent(title: string, tag: string, body: string, detail: string): NodeContent {
  return { style: { padding: 12, blockGap: 6 }, blocks: [
    { type: "title", text: title },
    { type: "list", items: [{ tags: [{ text: tag, style: { shape: "pill", fontSize: 12 } }] }] },
    { type: "paragraph", text: body },
    { type: "paragraph", role: "auxiliary", text: detail }
  ] };
}
