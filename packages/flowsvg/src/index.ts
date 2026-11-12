export { createDiagram, renderSvg, wrapText } from "./core/diagram.js";
export type { Diagram } from "./core/diagram.js";
export { validateDocument, DiagramValidationError } from "./core/validation.js";
export type {
  NodeKind,
  EdgeRoute,
  PortDirection,
  FlowDirection,
  ThemeName,
  EmphasisColors,
  Viewport,
  NodeStyle,
  EdgeStyle,
  DiagramNode,
  DiagramEdge,
  DiagramDocument,
  DiagramTypography,
  Scene,
  Beat,
  DiagramBeat,
  NodeVisualState,
  EdgeVisualState,
  Action,
  ValidationIssue,
  EvaluateOptions,
  SvgRenderOptions,
  TextLine,
  EvaluatedNode,
  EvaluatedEdge,
  EdgeFlowMarker,
  LayoutWarning,
  TextOverflowWarning,
  GeometryWarning,
  GeometryWarningCode,
  CameraState,
  HitObjectType,
  HitObject,
  DiagramPoint,
  DiagramFrameState
} from "./core/model.js";
export type {
  NodeContent,
  ContentBlock,
  ContentListItem,
  ContentListStyle,
  ContentTag,
  ContentTagStyle,
  ContentTagBackground,
  ContentGraphBlock,
  ContentGraphNode,
  ContentGraphEdge,
  ContentGraphLayout,
  ContentText,
  ContentTextSpan,
  ContentSpanStyle,
  ContentSpan,
  ContentTextStyle,
  ContentAlignment,
  ContentSafeArea,
  ContentLine,
  NodeContentLayout
} from "./core/node-content.js";

export { measureNodeContent } from "./core/node-content-measurement.js";
export { measureNodeLabel } from "./core/node-label-measurement.js";
export type { NodeLabelMeasurementInput, NodeLabelMeasurement, NodeLabelMeasurementDiagnostic } from "./core/node-label-measurement.js";
export type {
  NodeContentMeasurementInput,
  NodeContentMeasurement,
  NodeContentMeasurementDiagnostic
} from "./core/node-content-measurement.js";
