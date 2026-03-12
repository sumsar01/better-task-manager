import type { Node, Edge } from "@xyflow/react";

// ── Layout constants ──────────────────────────────────────────────────────────

export const NODE_WIDTH = 280;
export const NODE_HEIGHT = 112;

// Subtask grouping layout constants
export const SUBTASK_NODE_WIDTH = 220;
export const SUBTASK_NODE_HEIGHT = 52;
export const GROUP_PADDING_X = 20;
export const GROUP_PADDING_TOP = 8;
export const GROUP_PADDING_BOT = 8;
export const GROUP_INNER_GAP = 6;    // tight gap for compact chips
export const GROUP_LEFT_INDENT = 60; // how far subtasks are indented from the left of the group

// Epic group container layout constants
export const EPIC_PADDING_X = 32;
export const EPIC_PADDING_TOP = 52; // extra room for the header bar
export const EPIC_PADDING_BOT = 32;
export const EPIC_NODE_GAP = 24;    // gap between child nodes inside an epic group

// Story group container layout constants
export const STORY_PADDING_X = 20;
export const STORY_PADDING_TOP = 36; // room for the story label header
export const STORY_PADDING_BOT = 20;
export const STORY_NODE_GAP = 16;    // gap between child nodes inside a story group

// Synthetic key for tasks with no epic parent
export const UNASSIGNED_EPIC_KEY = "__unassigned__";

// Jira label that marks a task as having an external dependency
export const EXTERNAL_LABEL = "external";

// ── Color tables ──────────────────────────────────────────────────────────────

// Per-epic accent color palette (cycles through these)
// Each entry: [bgTint (8% opacity fill), headerBg, headerText, border]
export const EPIC_COLORS: Array<{
  tint: string;
  header: string;
  text: string;
  border: string;
}> = [
  { tint: "rgba(99,102,241,0.07)",  header: "#6366f1", text: "#ffffff", border: "#6366f1" }, // indigo
  { tint: "rgba(16,185,129,0.07)",  header: "#10b981", text: "#ffffff", border: "#10b981" }, // emerald
  { tint: "rgba(245,158,11,0.07)",  header: "#f59e0b", text: "#ffffff", border: "#f59e0b" }, // amber
  { tint: "rgba(239,68,68,0.07)",   header: "#ef4444", text: "#ffffff", border: "#ef4444" }, // red
  { tint: "rgba(59,130,246,0.07)",  header: "#3b82f6", text: "#ffffff", border: "#3b82f6" }, // blue
  { tint: "rgba(168,85,247,0.07)",  header: "#a855f7", text: "#ffffff", border: "#a855f7" }, // purple
  { tint: "rgba(236,72,153,0.07)",  header: "#ec4899", text: "#ffffff", border: "#ec4899" }, // pink
];

// Unassigned group uses a neutral grey
export const UNASSIGNED_EPIC_COLOR = {
  tint: "rgba(148,163,184,0.07)",
  header: "#94a3b8",
  text: "#ffffff",
  border: "#94a3b8",
};

// Status → accent bar color (left border on white card nodes)
export const STATUS_COLORS: Record<string, string> = {
  new: "#94a3b8",           // To Do → slate-400
  indeterminate: "#6366f1", // In Progress → indigo-500
  done: "#22c55e",          // Done → green-500
};

export const STATUS_TEXT_COLORS: Record<string, string> = {
  new: "#64748b",           // slate-500
  indeterminate: "#6366f1", // indigo-500
  done: "#16a34a",          // green-600
};

// Edge link type name → color
export const EDGE_COLORS: Record<string, string> = {
  blocks: "#ef4444",       // red-500
  "is blocked by": "#ef4444",
  subtask: "#3b82f6",      // blue-500
  parent: "#3b82f6",
  "relates to": "#94a3b8", // slate-400
  clones: "#a855f7",       // purple-500
  "is cloned by": "#a855f7",
  default: "#94a3b8",
};

// ── Derived helpers ───────────────────────────────────────────────────────────

/** Compute total height of a task group given the number of subtasks */
export function groupHeight(subtaskCount: number): number {
  return (
    GROUP_PADDING_TOP +
    NODE_HEIGHT +
    (subtaskCount > 0
      ? GROUP_INNER_GAP + subtaskCount * SUBTASK_NODE_HEIGHT + (subtaskCount - 1) * GROUP_INNER_GAP
      : 0) +
    GROUP_PADDING_BOT
  );
}

/** Compute total width of a task group — depends only on module-level constants. */
export function groupWidth(): number {
  const widthForParent = NODE_WIDTH + 2 * GROUP_PADDING_X;
  const widthForSubtasks = GROUP_LEFT_INDENT + SUBTASK_NODE_WIDTH + GROUP_PADDING_X;
  return Math.max(widthForParent, widthForSubtasks);
}

/** Pre-computed group width — call groupWidth() once at module load. */
export const GROUP_WIDTH = groupWidth();

// ── Exported types ────────────────────────────────────────────────────────────

export type EdgeType = "blocks" | "subtask" | "relates-to" | "clone" | "default";

export interface IssueNodeData {
  key: string;
  summary: string;
  statusName: string;
  statusCategory: string;
  assignee: string | null;
  issueType: string;
  isSubtask: boolean;
  /** True when this node lives inside a taskGroupNode container.
   *  Handles are suppressed — the group container provides them instead. */
  insideGroup: boolean;
  /** True for Epic-type nodes that have no children in the loaded set
   *  (i.e. not acting as a group container parent). Renders with a wider
   *  amber-bordered card so they're visually distinct from task nodes. */
  isEpicStandalone: boolean;
  /** True when the issue has the "external" Jira label, indicating it
   *  depends on work from another team. Renders with an orange border and badge. */
  isExternal: boolean;
  bgColor: string;
  textColor: string;
  subtaskCount?: number;
  /** Number of cross-epic outgoing dependency edges (e.g. "blocks" another epic's tasks).
   *  Shown as an ↗ badge on the node card. Populated by graphStructure Phase 4c. */
  crossEpicOut?: number;
  /** Number of cross-epic incoming dependency edges (e.g. "blocked by" another epic's tasks).
   *  Shown as an ↙ badge on the node card. Populated by graphStructure Phase 4c. */
  crossEpicIn?: number;
  [key: string]: unknown;
}

export interface TaskGroupNodeData {
  /** Key of the parent issue this group wraps */
  parentKey: string;
  /** Number of subtask children */
  subtaskCount: number;
  /** Y offsets (relative to group top) at which each subtask node starts */
  subtaskOffsets: number[];
  [key: string]: unknown;
}

export interface EpicGroupNodeData {
  /** Key of the epic issue (or UNASSIGNED_EPIC_KEY for orphan tasks) */
  epicKey: string;
  /** Display name / summary of the epic */
  epicSummary: string;
  /** Accent color bundle for this epic */
  color: { tint: string; header: string; text: string; border: string };
  [key: string]: unknown;
}

export interface StoryGroupNodeData {
  /** Key of the story issue */
  storyKey: string;
  /** Display name / summary of the story */
  storySummary: string;
  /** Number of cross-story outgoing dependency edges from subtasks in this group.
   *  Shown as an ↗ badge on the story group header. Populated by graphStructure Phase 4d′. */
  crossStoryOut?: number;
  /** Number of cross-story incoming dependency edges to subtasks in this group.
   *  Shown as an ↙ badge on the story group header. Populated by graphStructure Phase 4d′. */
  crossStoryIn?: number;
  [key: string]: unknown;
}

export interface GraphData {
  nodes: Node[];
  edges: Edge[];
}

/** One resolved link within a cross-epic bundle — the raw issue keys and link type. */
export interface CrossEpicLink {
  sourceKey: string;
  targetKey: string;
  typeName: string;
  color: string;
}

/** Data stored on a `crossEpicBundle` edge. */
export interface CrossEpicBundleEdgeData {
  /** All individual cross-epic links aggregated into this bundle. */
  individualEdges: CrossEpicLink[];
  /** ELK-computed bend points (populated after layout, same format as ElkEdge). */
  bendPoints: Array<{ x: number; y: number }>;
  /** Dominant color (from the most common link type in the bundle). */
  color: string;
  /** Display label, e.g. "3 blocks" or "2 blocks, 1 relates to". */
  label: string;
  [key: string]: unknown;
}

/** One resolved link within a cross-story bundle — the raw issue keys and link type. */
export interface CrossStoryLink {
  sourceKey: string;
  targetKey: string;
  typeName: string;
  color: string;
}

/** Data stored on a `crossStoryBundle` edge. */
export interface CrossStoryBundleEdgeData {
  /** All individual cross-story links aggregated into this bundle. */
  individualEdges: CrossStoryLink[];
  /** ELK-computed bend points (populated after layout, same format as ElkEdge). */
  bendPoints: Array<{ x: number; y: number }>;
  /** Dominant color (from the most common link type in the bundle). */
  color: string;
  /** Display label, e.g. "2 blocks". */
  label: string;
  [key: string]: unknown;
}
