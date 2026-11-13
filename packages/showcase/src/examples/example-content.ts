/** Shared author formatting and build-time sizing; all paint comes from the SDK theme. */
import { measureNodeContent, type DiagramNode, type NodeContent, type NodeContentMeasurementInput } from "flowsvg";

/** Share four-block content styles across category stories. */
export function createExampleContent(title: string, tag: string, body: string, detail: string): NodeContent {
  return { style: { padding: 12, blockGap: 6 }, blocks: [
    { type: "title", text: title },
    { type: "list", items: [{ tags: [{ text: tag, style: { shape: "pill", fontSize: 12 } }] }] },
    { type: "paragraph", text: body },
    { type: "paragraph", role: "auxiliary", text: detail }
  ] };
}

type MeasuredExampleNode = DiagramNode & { kind: NodeContentMeasurementInput["kind"]; content: NodeContent };

/**
 * Measure the initial content and explicit replacements before serializing the author document.
 * Authored height is a minimum; callers still own placement, group bounds and route clearance.
 * @throws When content cannot fit the authored width, with the node ID and SDK diagnostics.
 */
export function measureExampleNode(node: MeasuredExampleNode, ...versions: NodeContent[]): DiagramNode {
  const measurement = measureNodeContent({ kind: node.kind, width: node.width, content: [node.content, ...versions] });
  if (measurement.diagnostics.length > 0) {
    throw new Error(`Showcase node "${node.id}" content does not fit its authored width: ${JSON.stringify(measurement.diagnostics)}`);
  }
  return { ...node, height: Math.max(node.height, measurement.height) };
}
