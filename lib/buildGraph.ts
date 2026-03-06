import ELK from "elkjs/lib/elk.bundled.js";
import type { ElkNode, ElkExtendedEdge, ElkPoint } from "elkjs/lib/elk-api.js";
import type { Node, Edge } from "@xyflow/react";
import type { JiraIssue } from "./jira";

// ── Constants ────────────────────────────────────────────────────────────────

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

// Synthetic key for tasks with no epic parent
export const UNASSIGNED_EPIC_KEY = "__unassigned__";

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
  bgColor: string;
  textColor: string;
  subtaskCount?: number;
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

// ── Helpers ──────────────────────────────────────────────────────────────────

function getEdgeColor(linkTypeName: string): string {
  const normalized = linkTypeName.toLowerCase();
  return EDGE_COLORS[normalized] ?? EDGE_COLORS.default;
}

function getEdgeLabel(linkTypeName: string): string {
  const normalized = linkTypeName.toLowerCase();
  if (normalized === "blocks" || normalized === "is blocked by") return "blocks";
  if (normalized === "subtask" || normalized === "parent") return "subtask";
  if (normalized === "clones" || normalized === "is cloned by") return "clones";
  return normalized;
}

function statusBgColor(categoryKey: string): string {
  return STATUS_COLORS[categoryKey] ?? STATUS_COLORS.new;
}

function statusTextColor(categoryKey: string): string {
  return STATUS_TEXT_COLORS[categoryKey] ?? STATUS_TEXT_COLORS.new;
}

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

// ── BFS helper (module-scope, accepts blocksAdj as arg) ──────────────────────

/**
 * Returns true if `target` is reachable from `start` through the blocksAdj
 * graph WITHOUT using the direct edge start → target (i.e., via a path ≥ 2).
 * Uses BFS with an index pointer (O(1) dequeue) instead of Array.shift().
 */
function isBlocksReachableIndirectly(
  blocksAdj: Map<string, Set<string>>,
  start: string,
  target: string,
): boolean {
  const visited = new Set<string>();
  const queue: string[] = [];
  let head = 0;

  for (const next of blocksAdj.get(start) ?? []) {
    if (next !== target && !visited.has(next)) {
      visited.add(next);
      queue.push(next);
    }
  }

  while (head < queue.length) {
    const node = queue[head++];
    for (const next of blocksAdj.get(node) ?? []) {
      if (next === target) return true;
      if (!visited.has(next)) {
        visited.add(next);
        queue.push(next);
      }
    }
  }
  return false;
}

// ── Shared graph-structure builder (phases 0–4, no layout) ──────────────────

/**
 * Internal result of the structure-building phases.
 * Used by both buildGraph (which also runs ELK layout) and
 * buildEdgesOnly (which skips layout entirely).
 */
interface GraphStructure {
  nodes: Node[];
  edges: Edge[];
  /** parentKey → groupNodeId */
  groupIds: Map<string, string>;
  /** issueKey → groupNodeId */
  issueGroupId: Map<string, string>;
  /** subtask keys that belong to a group */
  childKeys: Set<string>;
  /** issueKey → epicGroupNodeId */
  issueEpicGroupId: Map<string, string>;
  /** epicKey → epicGroupNodeId */
  epicGroupIds: Map<string, string>;
}

function buildGraphStructure(issues: JiraIssue[]): GraphStructure {
  const issueMap = new Map(issues.map((i) => [i.key, i]));
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  const edgeSet = new Set<string>();

  // ── 0. Build epic → member issues map ───────────────────────────────────
  // For each issue, find the epic it belongs to by walking up the parent chain.
  // epicToMembers: epicKey (or UNASSIGNED_EPIC_KEY) → Set of direct member keys
  // (members = tasks + subtasks that belong under this epic, but NOT the epic node itself)
  const epicToMembers = new Map<string, Set<string>>();
  const issueToEpic = new Map<string, string>();

  function findEpicKey(issue: JiraIssue): string {
    // If this issue IS an epic, it is its own group representative
    if (issue.fields.issuetype.name === "Epic") return issue.key;
    // Walk up parent chain
    let current: JiraIssue | undefined = issue;
    while (current) {
      const parentKey = current.fields.parent?.key;
      if (!parentKey) break;
      const parentIssue = issueMap.get(parentKey);
      if (!parentIssue) break;
      if (parentIssue.fields.issuetype.name === "Epic") return parentKey;
      current = parentIssue;
    }
    return UNASSIGNED_EPIC_KEY;
  }

  for (const issue of issues) {
    const epicKey = findEpicKey(issue);
    issueToEpic.set(issue.key, epicKey);
    if (epicKey !== issue.key) {
      // Don't add the epic itself as a member — it becomes the group header
      if (!epicToMembers.has(epicKey)) epicToMembers.set(epicKey, new Set());
      epicToMembers.get(epicKey)!.add(issue.key);
    }
  }

  // Assign stable color indices to epics (sorted for determinism)
  const allEpicKeys = Array.from(epicToMembers.keys()).sort();
  const epicColorIndex = new Map<string, number>();
  let colorIdx = 0;
  for (const k of allEpicKeys) {
    if (k !== UNASSIGNED_EPIC_KEY) {
      epicColorIndex.set(k, colorIdx % EPIC_COLORS.length);
      colorIdx++;
    }
  }

  // Determine whether epic grouping applies (more than one distinct epic, or
  // exactly one real epic).  Must be computed before Phase 1 so that child
  // nodes can set parentId at creation time.
  const epicGroupingEnabled =
    epicToMembers.size > 1 ||
    (epicToMembers.size === 1 && !epicToMembers.has(UNASSIGNED_EPIC_KEY));

  // ── 0.5 Create epicGroupNode containers first ────────────────────────────
  // React Flow requires parent nodes to appear BEFORE their children in the
  // nodes array.  We push epicGroupNode entries here, before any child nodes
  // are created in Phases 1–3.
  const epicGroupIds = new Map<string, string>();
  const issueEpicGroupId = new Map<string, string>();

  if (epicGroupingEnabled) {
    for (const [epicKey, memberKeys] of epicToMembers.entries()) {
      if (memberKeys.size === 0) continue;

      const epicGroupId = `epic_group__${epicKey}`;
      epicGroupIds.set(epicKey, epicGroupId);

      const color =
        epicKey === UNASSIGNED_EPIC_KEY
          ? UNASSIGNED_EPIC_COLOR
          : EPIC_COLORS[epicColorIndex.get(epicKey) ?? 0];

      let epicSummary =
        epicKey === UNASSIGNED_EPIC_KEY ? "Unassigned" : epicKey;
      const epicIssue = issueMap.get(epicKey);
      if (epicIssue) epicSummary = epicIssue.fields.summary;

      // Width/height are placeholders — updated after ELK inner layout
      nodes.push({
        id: epicGroupId,
        type: "epicGroupNode",
        position: { x: 0, y: 0 },
        width: NODE_WIDTH + EPIC_PADDING_X * 2,
        height: 200,
        style: { width: NODE_WIDTH + EPIC_PADDING_X * 2, height: 200 },
        selectable: false,
        data: {
          epicKey,
          epicSummary,
          color,
        } satisfies EpicGroupNodeData,
      });
    }
  }

  // ── 1. Build parent→children map ────────────────────────────────────────
  const parentToSubtasks = new Map<string, string[]>();

  for (const issue of issues) {
    if (!issue.fields.parent) continue;
    const pk = issue.fields.parent.key;
    if (!issueMap.has(pk)) continue;
    const parentIssue = issueMap.get(pk)!;
    if (parentIssue.fields.issuetype.subtask) continue;
    if (parentIssue.fields.issuetype.name === "Epic") continue; // tasks are not sub-tasks of epics
    if (!parentToSubtasks.has(pk)) parentToSubtasks.set(pk, []);
    parentToSubtasks.get(pk)!.push(issue.key);
  }

  const childKeys = new Set<string>();
  const groupIds = new Map<string, string>();
  const issueGroupId = new Map<string, string>();

  // ── 2. Build task group container nodes ─────────────────────────────────
  for (const [parentKey, subtaskKeys] of parentToSubtasks.entries()) {
    if (subtaskKeys.length === 0) continue;

    const groupId = `group__${parentKey}`;
    groupIds.set(parentKey, groupId);

    const gWidth = GROUP_WIDTH;
    const gHeight = groupHeight(subtaskKeys.length);

    const subtaskOffsets: number[] = [];
    let currentY = GROUP_PADDING_TOP + NODE_HEIGHT + GROUP_INNER_GAP;
    for (let i = 0; i < subtaskKeys.length; i++) {
      subtaskOffsets.push(currentY);
      currentY += SUBTASK_NODE_HEIGHT + GROUP_INNER_GAP;
    }

    // If epic grouping is on, this taskGroupNode is a child of an epicGroupNode.
    // Do NOT set extent:"parent" on it — React Flow doesn't support extent:"parent"
    // on nodes whose own parent is also a child (3-level extent nesting is unsupported).
    const taskGroupEpicId = epicGroupingEnabled
      ? epicGroupIds.get(issueToEpic.get(parentKey) ?? "")
      : undefined;

    nodes.push({
      id: groupId,
      type: "taskGroupNode",
      position: { x: 0, y: 0 },
      width: gWidth,
      height: gHeight,
      style: { width: gWidth, height: gHeight },
      selectable: false,
      ...(taskGroupEpicId ? { parentId: taskGroupEpicId } : {}),
      // extent:"parent" intentionally omitted when inside an epicGroupNode
      data: {
        parentKey,
        subtaskCount: subtaskKeys.length,
        subtaskOffsets,
      } satisfies TaskGroupNodeData,
    });

    if (taskGroupEpicId) {
      issueEpicGroupId.set(parentKey, taskGroupEpicId);
    }

    // When this taskGroupNode lives inside an epicGroupNode (3-level hierarchy),
    // issueNodes inside it must NOT have extent:"parent" — React Flow does not
    // support extent:"parent" at depth 3 (grandchild of a parent node).
    const issueExtent = taskGroupEpicId ? undefined : ("parent" as const);

    const parentIssue = issueMap.get(parentKey)!;
    const parentCat = parentIssue.fields.status.statusCategory.key;
    nodes.push({
      id: parentKey,
      type: "issueNode",
      parentId: groupId,
      ...(issueExtent ? { extent: issueExtent } : {}),
      position: { x: GROUP_PADDING_X, y: GROUP_PADDING_TOP },
      data: {
        key: parentKey,
        summary: parentIssue.fields.summary,
        statusName: parentIssue.fields.status.name,
        statusCategory: parentCat,
        assignee: parentIssue.fields.assignee?.displayName ?? null,
        issueType: parentIssue.fields.issuetype.name,
        isSubtask: false,
        insideGroup: true,
        isEpicStandalone: false,
        bgColor: statusBgColor(parentCat),
        textColor: statusTextColor(parentCat),
        subtaskCount: subtaskKeys.length,
      } satisfies IssueNodeData,
    });

    issueGroupId.set(parentKey, groupId);

    for (let i = 0; i < subtaskKeys.length; i++) {
      const sk = subtaskKeys[i];
      const subtaskIssue = issueMap.get(sk)!;
      const cat = subtaskIssue.fields.status.statusCategory.key;

      nodes.push({
        id: sk,
        type: "issueNode",
        parentId: groupId,
        ...(issueExtent ? { extent: issueExtent } : {}),
        position: { x: GROUP_LEFT_INDENT, y: subtaskOffsets[i] },
        data: {
          key: sk,
          summary: subtaskIssue.fields.summary,
          statusName: subtaskIssue.fields.status.name,
          statusCategory: cat,
          assignee: subtaskIssue.fields.assignee?.displayName ?? null,
          issueType: subtaskIssue.fields.issuetype.name,
          isSubtask: true,
          insideGroup: true,
          isEpicStandalone: false,
          bgColor: statusBgColor(cat),
          textColor: statusTextColor(cat),
        } satisfies IssueNodeData,
      });

      childKeys.add(sk);
      issueGroupId.set(sk, groupId);
    }
  }

  // ── 3. Build standalone nodes ────────────────────────────────────────────
  for (const issue of issues) {
    if (issueGroupId.has(issue.key)) continue;
    // Epics that already have an epicGroupNode container should not also get
    // a standalone issueNode — that would render them twice (container + card).
    if (epicGroupIds.has(issue.key)) continue;

    const cat = issue.fields.status.statusCategory.key;
    const isEpicStandalone =
      issue.fields.issuetype.name === "Epic" && !groupIds.has(issue.key);

    // If epic grouping is on and this issue belongs to an epic group, set parentId.
    // Epic nodes themselves map to their own key in issueToEpic — they become the
    // group header and should NOT be placed inside their own group container.
    const issueEpicKey = issueToEpic.get(issue.key);
    const standaloneEpicGroupId =
      epicGroupingEnabled && issueEpicKey && issueEpicKey !== issue.key
        ? epicGroupIds.get(issueEpicKey)
        : undefined;

    nodes.push({
      id: issue.key,
      type: "issueNode",
      position: { x: 0, y: 0 },
      ...(standaloneEpicGroupId ? { parentId: standaloneEpicGroupId } : {}),
      data: {
        key: issue.key,
        summary: issue.fields.summary,
        statusName: issue.fields.status.name,
        statusCategory: cat,
        assignee: issue.fields.assignee?.displayName ?? null,
        issueType: issue.fields.issuetype.name,
        isSubtask: issue.fields.issuetype.subtask,
        insideGroup: false,
        isEpicStandalone,
        bgColor: statusBgColor(cat),
        textColor: statusTextColor(cat),
      } satisfies IssueNodeData,
    });

    if (standaloneEpicGroupId) {
      issueEpicGroupId.set(issue.key, standaloneEpicGroupId);
    }
  }

  // ── 4a. Transitive reduction of "blocks" edges ──────────────────────────
  const blocksAdj = new Map<string, Set<string>>();
  for (const issue of issues) {
    for (const link of issue.fields.issuelinks ?? []) {
      if (link.outwardIssue && issueMap.has(link.outwardIssue.key)) {
        if (link.type.outward.toLowerCase() === "blocks") {
          if (!blocksAdj.has(issue.key)) blocksAdj.set(issue.key, new Set());
          blocksAdj.get(issue.key)!.add(link.outwardIssue.key);
        }
      }
      if (link.inwardIssue && issueMap.has(link.inwardIssue.key)) {
        const typeName = link.type.inward.toLowerCase();
        if (typeName === "is blocked by") {
          const blocker = link.inwardIssue.key;
          if (!blocksAdj.has(blocker)) blocksAdj.set(blocker, new Set());
          blocksAdj.get(blocker)!.add(issue.key);
        } else if (typeName === "blocks") {
          if (!blocksAdj.has(issue.key)) blocksAdj.set(issue.key, new Set());
          blocksAdj.get(issue.key)!.add(link.inwardIssue.key);
        }
      }
    }
  }

  // ── 4b. Helper: resolve node ID for edge endpoints ──────────────────────
  // When epic grouping is on, cross-epic edges must connect at the epic group level
  // (or at the task group level if within the same epic group).
  function resolveEdgeEndpoint(key: string): string {
    // If this key is an epic that has a group container node, map it to that
    // container's id (e.g. "EPIC-A" → "epic_group__EPIC-A").  Without this,
    // edges whose endpoint is an epic issue would reference a node id that
    // doesn't exist in the React Flow graph (epics become epicGroupNode
    // containers, not standalone issueNodes, when epic grouping is active).
    if (epicGroupingEnabled) {
      const epicGroupId = epicGroupIds.get(key);
      if (epicGroupId) return epicGroupId;
    }

    // Resolve to task-group level for tasks that have subtasks
    const taskGroupId = groupIds.get(key) ?? (issueGroupId.get(key) && childKeys.has(key) ? issueGroupId.get(key) : null);
    return taskGroupId ?? key;
  }

  // Helper to get the epic group id for an issue key (for cross-epic detection)
  function getEpicGroupForKey(key: string): string | undefined {
    const epicKey = issueToEpic.get(key);
    if (!epicKey) return undefined;
    return epicGroupIds.get(epicKey);
  }

  // ── 4c. Build edges ──────────────────────────────────────────────────────
  for (const issue of issues) {
    for (const link of issue.fields.issuelinks ?? []) {
      if (link.outwardIssue && issueMap.has(link.outwardIssue.key)) {
        const typeName = link.type.outward;
        if (
          typeName.toLowerCase() === "blocks" &&
          isBlocksReachableIndirectly(blocksAdj, issue.key, link.outwardIssue.key)
        ) {
          continue;
        }
        const src = resolveEdgeEndpoint(issue.key);
        const tgt = resolveEdgeEndpoint(link.outwardIssue.key);
        if (src === tgt) continue;
        const edgeId = `${src}-${tgt}-${getEdgeLabel(typeName)}`;
        if (!edgeSet.has(edgeId)) {
          edgeSet.add(edgeId);
          const color = getEdgeColor(typeName);
          const isCrossEpic = epicGroupingEnabled &&
            getEpicGroupForKey(issue.key) !== getEpicGroupForKey(link.outwardIssue.key);
          edges.push({
            id: edgeId,
            source: src,
            target: tgt,
            label: getEdgeLabel(typeName),
            type: "elkEdge",
            animated: typeName.toLowerCase() === "blocks",
            style: {
              stroke: color,
              strokeWidth: isCrossEpic ? 2.5 : 2,
              strokeDasharray: isCrossEpic ? "6 3" : undefined,
            },
            labelStyle: { fill: color, fontWeight: 600, fontSize: 11 },
            labelBgStyle: { fill: "white", fillOpacity: 0.85 },
            data: { color, bendPoints: [], isCrossEpic },
          });
        }
      }

      if (link.inwardIssue && issueMap.has(link.inwardIssue.key)) {
        const typeName = link.type.inward;
        const normalised = typeName.toLowerCase();
        let rawBlocker = link.inwardIssue.key;
        let rawBlocked = issue.key;
        if (normalised === "blocks") {
          [rawBlocker, rawBlocked] = [rawBlocked, rawBlocker];
        }
        if (normalised.includes("block") && isBlocksReachableIndirectly(blocksAdj, rawBlocker, rawBlocked)) {
          continue;
        }
        const source = resolveEdgeEndpoint(rawBlocker);
        const target = resolveEdgeEndpoint(rawBlocked);
        if (source === target) continue;
        const edgeId = `${source}-${target}-${getEdgeLabel(typeName)}`;
        if (!edgeSet.has(edgeId)) {
          edgeSet.add(edgeId);
          const color = getEdgeColor(normalised);
          const isCrossEpic = epicGroupingEnabled &&
            getEpicGroupForKey(rawBlocker) !== getEpicGroupForKey(rawBlocked);
          edges.push({
            id: edgeId,
            source,
            target,
            label: getEdgeLabel(typeName),
            type: "elkEdge",
            animated: normalised.includes("block"),
            style: {
              stroke: color,
              strokeWidth: isCrossEpic ? 2.5 : 2,
              strokeDasharray: isCrossEpic ? "6 3" : undefined,
            },
            labelStyle: { fill: color, fontWeight: 600, fontSize: 11 },
            labelBgStyle: { fill: "white", fillOpacity: 0.85 },
            data: { color, bendPoints: [], isCrossEpic },
          });
        }
      }
    }

    // Subtask → parent relationship is shown visually via the TaskGroupNode
    // container (indented chips). No explicit edge is drawn in either case.
  }

  return { nodes, edges, groupIds, issueGroupId, childKeys, issueEpicGroupId, epicGroupIds };
}

// ── ELK instance ─────────────────────────────────────────────────────────────

const elk = new ELK();

// Layout options for nodes inside an epic group container.
// POLYLINE routing is used instead of ORTHOGONAL — ORTHOGONAL crashes inside
// ELK's bundled algorithm on certain DAG topologies (null-pointer in elk.bundled.js).
// POLYLINE is simpler (straight-line segments) and never crashes.
const ELK_INNER_OPTIONS = {
  "elk.algorithm": "layered",
  "elk.direction": "DOWN",
  "elk.layered.spacing.nodeNodeBetweenLayers": "80",
  "elk.spacing.nodeNode": "60",
  "elk.edgeRouting": "POLYLINE",
  "elk.padding": `[top=${EPIC_PADDING_TOP}, left=${EPIC_PADDING_X}, bottom=${EPIC_PADDING_BOT}, right=${EPIC_PADDING_X}]`,
};

const ELK_OPTIONS = {
  "elk.algorithm": "layered",
  "elk.direction": "DOWN",
  "elk.layered.spacing.nodeNodeBetweenLayers": "120",
  "elk.spacing.nodeNode": "80",
  "elk.edgeRouting": "POLYLINE",
  "elk.padding": "[top=40, left=40, bottom=40, right=40]",
};


// ── Public API ────────────────────────────────────────────────────────────────

export interface GraphData {
  nodes: Node[];
  edges: Edge[];
}

/**
 * Build edges only (phases 0–4), skipping ELK layout entirely.
 * Use this in polling diff paths where positions are not needed —
 * avoids the expensive async ELK layout call.
 */
export function buildEdgesOnly(issues: JiraIssue[]): { edges: Edge[] } {
  const { edges } = buildGraphStructure(issues);
  return { edges };
}

/**
 * Convert a flat list of JiraIssues into React Flow nodes and edges
 * with a top-to-bottom ELK layered layout.
 *
 * Tasks are visually grouped under their parent task (subtask groups).
 * When multiple epics are present, all nodes belonging to an epic are
 * further wrapped in an epic group container node with a coloured header.
 * ELK bend points are stored on edge.data.bendPoints for the ElkEdge renderer.
 */
export async function buildGraph(issues: JiraIssue[]): Promise<GraphData> {
  const { nodes, edges, groupIds, issueGroupId, childKeys, epicGroupIds } =
    buildGraphStructure(issues);

  const epicGroupingEnabled = epicGroupIds.size > 0;

  // ── 5. Apply ELK layout ──────────────────────────────────────────────────

  // Helper: resolve to the task-group node id (same as before)
  function groupOrKey(key: string): string {
    const gid = groupIds.get(key);
    if (gid) return gid;
    const parentGid = issueGroupId.get(key);
    if (parentGid && childKeys.has(key)) return parentGid;
    return key;
  }

  if (epicGroupingEnabled) {
    // ── 5a. Nested ELK layout: layout children inside each epic group,
    //        then layout the epic groups relative to each other at the top level.

    // Build a map from epicGroupId → its direct children (taskGroupNode or standalone issueNode)
    const epicGroupChildren = new Map<string, Node[]>();
    for (const [, epicGroupId] of epicGroupIds.entries()) {
      epicGroupChildren.set(epicGroupId, []);
    }

    for (const node of nodes) {
      if (node.type === "epicGroupNode") continue;
      if (!node.parentId || !epicGroupChildren.has(node.parentId)) continue;
      // Only direct children of the epic group:
      //   - taskGroupNode containers (their children are issueNodes with parentId=groupId, not epicGroupId)
      //   - standalone issueNodes whose parentId is the epicGroupId directly
      if (node.type === "taskGroupNode" || node.type === "issueNode") {
        epicGroupChildren.get(node.parentId)!.push(node);
      }
    }

    // Build intra-epic edge lists for each epic group
    const epicGroupEdges = new Map<string, ElkExtendedEdge[]>();
    for (const [, epicGroupId] of epicGroupIds.entries()) {
      epicGroupEdges.set(epicGroupId, []);
    }

    // Collect the set of direct-child node ids within each epic group
    const epicChildIdSets = new Map<string, Set<string>>();
    for (const [epicGroupId, children] of epicGroupChildren.entries()) {
      epicChildIdSets.set(epicGroupId, new Set(children.map((n) => n.id)));
    }

    for (const edge of edges) {
      // Only include edges whose both endpoints are direct children of the same epic group
      // (cross-epic edges are handled at the top-level layout)
      let sharedEpicGroup: string | undefined;
      for (const [epicGroupId, childSet] of epicChildIdSets.entries()) {
        if (childSet.has(edge.source) && childSet.has(edge.target)) {
          sharedEpicGroup = epicGroupId;
          break;
        }
      }
      if (sharedEpicGroup) {
        epicGroupEdges.get(sharedEpicGroup)!.push({
          id: `elk__inner__${edge.id}`,
          sources: [edge.source],
          targets: [edge.target],
        });
      }
    }

    // Run ELK layout for each epic group's children independently.
    // POLYLINE routing is used — it's simpler than ORTHOGONAL and never crashes
    // on the graph topologies that ELK's ORTHOGONAL router fails on.
    const epicGroupSizes = new Map<string, { width: number; height: number }>();
    const innerPositions = new Map<string, { x: number; y: number }>();

    for (const [epicGroupId, children] of epicGroupChildren.entries()) {
      if (children.length === 0) continue;

      const innerGraph: ElkNode = {
        id: epicGroupId,
        layoutOptions: ELK_INNER_OPTIONS,
        children: children.map((n) => ({
          id: n.id,
          width: n.type === "taskGroupNode" ? (n.width as number) : NODE_WIDTH,
          height: n.type === "taskGroupNode" ? (n.height as number) : NODE_HEIGHT,
        })),
        edges: epicGroupEdges.get(epicGroupId) ?? [],
      };

      const layouted = await elk.layout(innerGraph);

      // ELK applies elk.padding internally, so elkChild positions already include
      // the left/top padding offsets. ELK also sets layouted.width/height to the
      // full computed size of the graph (content + all padding). Use those directly
      // as the container dimensions — do NOT add extra padding on top.
      for (const elkChild of layouted.children ?? []) {
        innerPositions.set(elkChild.id, { x: elkChild.x ?? 0, y: elkChild.y ?? 0 });
      }

      epicGroupSizes.set(epicGroupId, {
        width: layouted.width ?? (NODE_WIDTH + EPIC_PADDING_X * 2),
        height: layouted.height ?? 200,
      });
    }

    // Apply inner positions to nodes
    for (const node of nodes) {
      if (!node.parentId || !epicGroupChildren.has(node.parentId)) continue;
      const pos = innerPositions.get(node.id);
      if (pos) node.position = { x: pos.x, y: pos.y };
    }

    // Apply computed sizes to epic group nodes
    for (const node of nodes) {
      if (node.type !== "epicGroupNode") continue;
      const size = epicGroupSizes.get(node.id);
      if (size) {
        node.width = size.width;
        node.height = size.height;
        node.style = { ...node.style, width: size.width, height: size.height };
      }
    }

    // Top-level layout: just the epic group nodes
    const topLevelNodes = nodes.filter((n) => !n.parentId);
    const topLevelNodeIds = new Set(topLevelNodes.map((n) => n.id));

    // Cross-epic edges for the top-level ELK graph
    const topLevelElkEdges: ElkExtendedEdge[] = [];
    const edgeIdToElkId = new Map<string, string>();
    const topEdgeSet = new Set<string>();

    for (const edge of edges) {
      // Resolve source/target to their top-level parent (epic group or standalone)
      const srcTopLevel = (() => {
        if (topLevelNodeIds.has(edge.source)) return edge.source;
        const srcNode = nodes.find((n) => n.id === edge.source);
        if (srcNode?.parentId && topLevelNodeIds.has(srcNode.parentId)) return srcNode.parentId;
        return null;
      })();
      const tgtTopLevel = (() => {
        if (topLevelNodeIds.has(edge.target)) return edge.target;
        const tgtNode = nodes.find((n) => n.id === edge.target);
        if (tgtNode?.parentId && topLevelNodeIds.has(tgtNode.parentId)) return tgtNode.parentId;
        return null;
      })();

      if (srcTopLevel && tgtTopLevel && srcTopLevel !== tgtTopLevel) {
        const topEdgeId = `${srcTopLevel}-${tgtTopLevel}`;
        if (!topEdgeSet.has(topEdgeId)) {
          topEdgeSet.add(topEdgeId);
          const elkEdgeId = `elk__top__${edge.id}`;
          edgeIdToElkId.set(edge.id, elkEdgeId);
          topLevelElkEdges.push({
            id: elkEdgeId,
            sources: [srcTopLevel],
            targets: [tgtTopLevel],
          });
        }
      }
    }

    const topGraph: ElkNode = {
      id: "root",
      layoutOptions: ELK_OPTIONS,
      children: topLevelNodes.map((n) => ({
        id: n.id,
        width: (n.width as number) || NODE_WIDTH,
        height: (n.height as number) || NODE_HEIGHT,
      })),
      edges: topLevelElkEdges,
    };

    const topLayouted = await elk.layout(topGraph);
    const topPositions = new Map<string, { x: number; y: number }>();
    for (const elkNode of topLayouted.children ?? []) {
      topPositions.set(elkNode.id, { x: elkNode.x ?? 0, y: elkNode.y ?? 0 });
    }
    for (const node of topLevelNodes) {
      const pos = topPositions.get(node.id);
      if (pos) node.position = { x: pos.x, y: pos.y };
    }

    // Extract bend points from top-level layout
    type LayoutedEdge = ElkExtendedEdge & {
      sections?: Array<{ startPoint: ElkPoint; endPoint: ElkPoint; bendPoints?: ElkPoint[] }>;
    };
    for (const elkEdge of topLayouted.edges ?? []) {
      const section = (elkEdge as LayoutedEdge).sections?.[0];
      if (!section) continue;
      const pts = [section.startPoint, ...(section.bendPoints ?? []), section.endPoint];
      // Find original edge by elk id
      for (const [origId, elkId] of edgeIdToElkId.entries()) {
        if (elkId === elkEdge.id) {
          const edge = edges.find((e) => e.id === origId);
          if (edge) (edge.data as Record<string, unknown>).bendPoints = pts;
        }
      }
    }
  } else {
    // ── 5b. No epic grouping (single epic or all unassigned) — original flat layout
    const topLevelNodes = nodes.filter((n) => !n.parentId);
    const topLevelNodeIds = new Set(topLevelNodes.map((n) => n.id));

    const elkEdges: ElkExtendedEdge[] = [];
    const edgeIdToElkId = new Map<string, string>();

    for (const edge of edges) {
      const src = groupOrKey(edge.source);
      const tgt = groupOrKey(edge.target);
      if (src !== tgt && topLevelNodeIds.has(src) && topLevelNodeIds.has(tgt)) {
        const elkEdgeId = `elk__${edge.id}`;
        edgeIdToElkId.set(edge.id, elkEdgeId);
        elkEdges.push({ id: elkEdgeId, sources: [src], targets: [tgt] });
      }
    }

    const elkGraph: ElkNode = {
      id: "root",
      layoutOptions: ELK_OPTIONS,
      children: topLevelNodes.map((node) => ({
        id: node.id,
        width: node.type === "taskGroupNode" ? (node.width as number) : NODE_WIDTH,
        height: node.type === "taskGroupNode" ? (node.height as number) : NODE_HEIGHT,
      })),
      edges: elkEdges,
    };

    const layoutedGraph = await elk.layout(elkGraph);

    const elkNodeMap = new Map<string, { x: number; y: number }>();
    for (const elkNode of layoutedGraph.children ?? []) {
      elkNodeMap.set(elkNode.id, { x: elkNode.x ?? 0, y: elkNode.y ?? 0 });
    }
    for (const node of topLevelNodes) {
      const pos = elkNodeMap.get(node.id);
      if (pos) node.position = { x: pos.x, y: pos.y };
    }

    type LayoutedEdge = ElkExtendedEdge & {
      sections?: Array<{ startPoint: ElkPoint; endPoint: ElkPoint; bendPoints?: ElkPoint[] }>;
    };
    const elkEdgeMap = new Map<string, ElkPoint[]>();
    for (const elkEdge of layoutedGraph.edges ?? []) {
      const section = (elkEdge as LayoutedEdge).sections?.[0];
      if (section) {
        elkEdgeMap.set(elkEdge.id, [
          section.startPoint,
          ...(section.bendPoints ?? []),
          section.endPoint,
        ]);
      }
    }

    for (const edge of edges) {
      const elkId = edgeIdToElkId.get(edge.id);
      if (elkId) {
        const pts = elkEdgeMap.get(elkId);
        if (pts) (edge.data as Record<string, unknown>).bendPoints = pts;
      }
    }
  }

  return { nodes, edges };
}
