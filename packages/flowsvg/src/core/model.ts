/** Shared serializable document and evaluated-frame types; no runtime or platform dependencies. */
import type { NodeContent, NodeContentLayout } from "./node-content.js";

/** Supported shapes; a group also supplies the origin and visibility constraints for its children. */
export type NodeKind = "rect" | "roundedRect" | "ellipse" | "cylinder" | "group" | "diamond";
/** Route families generated from node geometry; orthogonal routes avoid obstacles with rounded bends, and curved routes use cubic Bézier controls. */
export type EdgeRoute = "straight" | "orthogonal" | "curved";
/** Cardinal node sides used for explicit edge attachments. */
export type PortDirection = "top" | "right" | "bottom" | "left";
/** Direction used by a beat-local transfer marker; it does not change the static edge arrow. */
export type FlowDirection = "forward" | "reverse";
/** Explicit diagram palette; the core does not read the system theme. */
export type ThemeName = "light" | "dark";

/** Initial viewport in diagram units; width and height must be finite positive numbers. */
export interface Viewport {
  width: number;
  height: number;
  /**
   * Fit full-view height to current painted geometry plus finite nonnegative bottom padding, in diagram units.
   * Round height outward to whole units. Keep origin and authored width; empty frames use authored height. Explicit focus keeps authored viewport semantics.
   * GIF export uses authored fixed dimensions for every frame to preserve diagram scale.
   */
  fitHeight?: { padding: number };
}

/** Initial base style; colors accept hexadecimal RGB/RGBA only, and dashed is used for group borders. */
export interface NodeStyle {
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  textColor?: string;
  dashed?: boolean;
}

/** Initial edge style; omitted values use the evaluation theme and default stroke width. */
export interface EdgeStyle {
  stroke?: string;
  strokeWidth?: number;
  dashed?: boolean;
}

/**
 * Initial node authored in parent-group coordinates, or document coordinates when parentId is absent.
 * Dimensions are explicit; groups have rounded borders and do not clip children, and visible defaults to true.
 */
export interface DiagramNode {
  id: string;
  kind: NodeKind;
  x: number;
  y: number;
  width: number;
  height: number;
  label?: string;
  /** Ordered content for rect, roundedRect or cylinder nodes; mutually exclusive with label and never resizes the node. */
  content?: NodeContent;
  /** Parent group ID; x/y are offsets from that group's current origin. */
  parentId?: string;
  /** Initial logical visibility, defaulting to true; ancestor visibility can still mask this node. */
  visible?: boolean;
  style?: NodeStyle;
}

/** Directed relation between two nodes or group boundaries; route defaults to straight, and hidden endpoints mask the edge. */
export interface DiagramEdge {
  id: string;
  from: string;
  to: string;
  label?: string;
  route?: EdgeRoute;
  /** Optional cardinal side for the source attachment; omitted values use geometry-aware automatic routing. */
  fromPort?: PortDirection;
  /** Optional target side, otherwise selected automatically. Same-side curved and orthogonal inputs receive separate positions, including hidden inputs. */
  toPort?: PortDirection;
  visible?: boolean;
  style?: EdgeStyle;
}

/** Positive finite font sizes in diagram units; omitted roles retain their individual defaults. */
export interface DiagramTypography {
  /** Ordinary node labels and group headings; defaults to 16. */
  nodeLabel?: number;
  /** Ordinary edge labels; defaults to 14. */
  edgeLabel?: number;
  /** Single-line decorative flow capsules; defaults to 12. */
  flowLabel?: number;
}

/**
 * Serializable version-1 document. Node and edge IDs are globally unique; an empty scenes array defines a static diagram.
 * Nodes and edges define the initial state; each scene inherits the preceding scene's final persistent state.
 * Flow markers and their temporary highlights belong only to their active beat.
 */
export interface DiagramDocument {
  version: 1;
  title?: string;
  viewport: Viewport;
  theme?: ThemeName;
  /** Shared text metrics; structured-content role defaults follow nodeLabel / 16, while explicit sizes remain unchanged. */
  typography?: DiagramTypography;
  nodes: DiagramNode[];
  edges: DiagramEdge[];
  scenes: Scene[];
}

/** Named scene on the continuous global timeline; contains at least one beat. */
export interface Scene {
  id: string;
  label: string;
  beats: Beat[];
}

/** Immutable effective beat interval in global milliseconds; caption includes inherited text. */
export interface DiagramBeat {
  readonly sceneId: string;
  readonly beatId: string;
  /** Zero-based index within the scene. */
  readonly beatIndex: number;
  readonly startMs: number;
  readonly endMs: number;
  readonly caption?: string;
}

/**
 * Persistent actions take effect from the beat start and inherit into later beats; durationMs must be positive.
 * transitionMs defaults to min(250, durationMs) within [0, durationMs]; omitted captions inherit the previous text.
 * One flow moves at a reference 180 diagram units/second with a 400 ms minimum, then uses a 500 ms post-arrival interval.
 * Single-flow duration replaces authored timing; multiple flows share authored full-beat progress. All flows expire without inheritance.
 */
export interface Beat {
  /** Authored beat length in milliseconds for no-flow/multi-flow beats; one flow uses movement plus 500 ms. */
  durationMs: number;
  /** Opening transition in milliseconds; defaults to min(250, durationMs), clamps to effective beat length, and zero applies changes immediately. */
  transitionMs?: number;
  /** Replaces the inherited caption at the beat start; an empty string clears it. */
  caption?: string;
  actions: Action[];
}

/**
 * Base values accepted by updateNode; coordinates remain parent-relative and opacity is within [0, 1].
 * label/content are mutually exclusive within a beat and replace the display mode at its start.
 * Content replacement and clearing preserve authored dimensions unless geometry is explicitly updated.
 */
export interface NodeVisualState {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  /** Switch to simple-label mode at the beat start, clearing structured content. */
  label?: string;
  /** Replace all content at the beat start; null clears content without restoring a previous label. */
  content?: NodeContent | null;
  fill?: string;
  stroke?: string;
  opacity?: number;
}

/** Base values accepted by updateEdge; colors and numbers interpolate, while labels switch at the beat start. */
export interface EdgeVisualState {
  label?: string;
  stroke?: string;
  strokeWidth?: number;
  opacity?: number;
}

/**
 * Declarative beat action. Visibility, explicit highlighting, base updates and focus persist into later beats.
 * Flow markers and their temporary highlights expire at the beat end without changing persistent layers.
 * Flows highlight their edge and, by default, both endpoints; highlightParticipants: false excludes the endpoints.
 * Single-flow receiver paint fades in for 200 ms after arrival, holds for 100 ms, then automatic node/edge paint fades out for 200 ms.
 * Logical participant flags and markers last for the whole beat; explicit highlights retain authored timing.
 * Reduced motion skips paint interpolation. Multiple flows retain synchronized endpoint paint.
 * focus accepts a node/group ID or null for the full view; duplicate assignments within one beat are rejected.
 * A beat permits at most one flow per edge, regardless of direction; other visual layers can coexist.
 */
export type Action =
  | {
    type: "show" | "hide" | "highlight" | "unhighlight";
    target: string
  }
  | {
    type: "updateNode";
    target: string;
    value: Partial<NodeVisualState>
  }
  | {
    type: "updateEdge";
    target: string;
    value: Partial<EdgeVisualState>
  }
  | {
    type: "focus";
    target: string | null
  }
  | {
    type: "flow";
    target: string;
    direction: FlowDirection;
    /** Plain short message for this transfer; provided text uses a horizontal capsule instead of a dot. */
    text?: string;
    /** Defaults to true. False disables temporary endpoint highlights; explicit highlights and the flow edge are unchanged. */
    highlightParticipants?: boolean;
  };
/** Validation path and reason, for example scenes[0].beats[1].actions[0].target. */
export interface ValidationIssue {
  path: string;
  message: string;
}

/**
 * Reproducible visual options: theme overrides the document theme, with light as the final default.
 * reducedMotion completes transitions immediately and hides flow markers while retaining the flow's configured highlights.
 * Beat durations and timeline positions do not change.
 */
export interface EvaluateOptions {
  /** Override the document theme; the final fallback is light. */
  theme?: ThemeName;
  /** Apply target values immediately and hide flow markers; retain configured flow highlights, beat durations and selection. */
  reducedMotion?: boolean;
}

/** Static SVG options; transparency removes only the whole-diagram background, preserving object fills and label halos. */
export interface SvgRenderOptions extends EvaluateOptions {
  /** Default: theme. Transparent preserves the selected camera and all diagram paint. */
  background?: "theme" | "transparent";
}

/** Deterministically laid-out line; x/y specify its centered anchor and text baseline in SVG document coordinates. */
export interface TextLine {
  text: string;
  x: number;
  y: number;
}

/**
 * Node after timeline and ancestor-group evaluation; x/y are absolute document coordinates.
 * visible tracks participation in visibility/routing; it can be true at a reveal start with zero opacity.
 * labelLines/labelBoxes retain overflowing text; preset label paint is clipped to its safe area.
 * Drawing and hit testing require positive opacity; preset hits exclude invisible overflow.
 */
export interface EvaluatedNode extends DiagramNode {
  x: number;
  y: number;
  /** Logical visibility after ancestor masking; a reveal may be visible with zero opacity. */
  visible: boolean;
  /** Effective opacity in [0, 1], including visibility transitions and ancestor opacity. */
  opacity: number;
  /** Logical highlight state; automatic single-flow paint can still be pending or interpolating. */
  highlighted: boolean;
  labelLines: string[];
  labelBoxes: TextLine[];
  /** Structured text geometry and clip region; absent in simple-label mode. */
  contentLayout?: NodeContentLayout;
}

/** Evaluated edge; opacity includes endpoint/ancestor masking, and path contains SVG line or cubic commands in document coordinates. */
export interface EvaluatedEdge extends DiagramEdge {
  visible: boolean;
  opacity: number;
  highlighted: boolean;
  path: string;
  labelLines: string[];
  labelBoxes: TextLine[];
  /** Beat-local marker state, omitted outside an active beat or when reduced motion hides it. */
  flow?: EdgeFlowMarker;
}

/** Deterministic transfer state derived from the current beat and edge path. */
export interface EdgeFlowMarker {
  direction: FlowDirection;
  /** Linear movement completion in [0, 1]; a single flow holds at 1 until its beat ends. */
  progress: number;
  point: DiagramPoint;
  /** Unmodified beat-local message; SVG uses deterministic code-point widths and keeps the capsule horizontal. */
  text?: string;
}

/** Existing text-overflow warning; geometry risks are returned separately by Diagram.diagnoseAt. */
export interface TextOverflowWarning {
  path: string;
  message: string;
  code: "text-overflow";
  objectId: string;
}

/** Additional sampled geometric risks; these do not prove pixel occlusion or request automatic repair. */
export type GeometryWarningCode = "edge-node-overlap" | "label-node-overlap" | "label-overlap";

/**
 * One on-demand risk with role-preserving object and document-field locations.
 * warningKey is a versioned canonical array encoding of code, roles, fields and line positions;
 * it excludes prose, time and visual options. Consumers bind those contexts separately.
 */
export interface GeometryWarning {
  path: string;
  message: string;
  code: GeometryWarningCode;
  objectId: string;
  relatedObjectIds: string[];
  warningKey: string;
}

/** Non-blocking layout warning; only geometry risks carry related objects and a canonical warningKey. */
export type LayoutWarning = TextOverflowWarning | GeometryWarning;

/** SVG viewBox in document coordinates; focusing preserves the initial viewport aspect ratio. */
export interface CameraState {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Hit category; groups are also reported as nodes. */
export type HitObjectType = "node" | "edge";
/** Identity of a hit object, without DOM references, so it can be used outside browsers. */
export interface HitObject {
  id: string;
  type: HitObjectType;
}

/** Point in absolute document coordinates; browser screen coordinates must first be mapped through the viewBox. */
export interface DiagramPoint {
  x: number;
  y: number;
}

/**
 * Complete frame for a time and visual options, shared by SVG export, the browser and consumers.
 * sceneId/beatId are null for static diagrams; beatId is `${scene.id}:${beatIndex}` with a zero-based index.
 * beatProgress spans the whole beat, unlike the eased progress used only during its opening transition.
 */
export interface DiagramFrameState {
  /** Clamped global time in milliseconds. */
  timeMs: number;
  sceneId: string | null;
  /** `${scene.id}:${beatIndex}`, with a zero-based index; null for static diagrams. */
  beatId: string | null;
  /** Linear progress in [0, 1] over the whole beat; zero for static diagrams. */
  beatProgress: number;
  nodes: EvaluatedNode[];
  edges: EvaluatedEdge[];
  camera: CameraState;
  caption?: string;
  warnings: LayoutWarning[];
}
