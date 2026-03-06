import dagre from "dagre";
import type { Node, Edge } from "@xyflow/react";
import type { JiraIssue } from "./jira";

// ── Constants ────────────────────────────────────────────────────────────────

export const NODE_WIDTH = 280;
export const NODE_HEIGHT = 112;

// Subtask grouping layout constants
export const SUBTASK_NODE_WIDTH = 240;
export const SUBTASK_NODE_HEIGHT = 96;
export const GROUP_PADDING_X = 20;
export const GROUP_PADDING_TOP = 16;
export const GROUP_PADDING_BOT = 16;
export const GROUP_INNER_GAP = 16;   // gap between parent node and first subtask, and between subtasks
export const GROUP_LEFT_INDENT = 60; // how far subtasks are indented from the left of the group

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

/** Compute total width of a task group.
 * Must be wide enough for the parent node (NODE_WIDTH + 2*GROUP_PADDING_X)
 * and the indented subtask nodes (GROUP_LEFT_INDENT + SUBTASK_NODE_WIDTH + GROUP_PADDING_X).
 */
export function groupWidth(): number {
  const widthForParent = NODE_WIDTH + 2 * GROUP_PADDING_X;
  const widthForSubtasks = GROUP_LEFT_INDENT + SUBTASK_NODE_WIDTH + GROUP_PADDING_X;
  return Math.max(widthForParent, widthForSubtasks);
}

// ── Main builder ─────────────────────────────────────────────────────────────

export interface GraphData {
  nodes: Node[];
  edges: Edge[];
}

/**
 * Convert a flat list of JiraIssues (epic children + subtasks) into
 * React Flow nodes and edges with a top-to-bottom dagre layout.
 *
 * Subtasks are grouped visually under their parent task:
 *  - A transparent "taskGroup" container node wraps the parent + its subtasks.
 *  - Subtasks are positioned inside the group at fixed vertical offsets.
 *  - Parent→subtask dashed edges are suppressed (the grouping is visual instead).
 *  - Parent tasks show a subtaskCount badge.
 *
 * Edge direction: blocker → blocked (arrows point DOWN toward blocked work).
 */
export function buildGraph(issues: JiraIssue[]): GraphData {
  const issueMap = new Map(issues.map((i) => [i.key, i]));
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  const edgeSet = new Set<string>(); // deduplicate

  // ── 1. Build parent→children map ────────────────────────────────────────
  // Detect subtasks by:
  //   (a) issuetype.subtask === true AND fields.parent exists in this set, OR
  //   (b) fields.parent exists in this set AND parent is not a subtask itself
  //       (catches cases where issuetype.subtask may be false but parent link exists)
  const parentToSubtasks = new Map<string, string[]>(); // parentKey → [subtaskKey, ...]

  for (const issue of issues) {
    if (!issue.fields.parent) continue;
    const pk = issue.fields.parent.key;
    if (!issueMap.has(pk)) continue;
    // Only group as subtask if: issuetype.subtask flag OR the parent's issuetype is NOT a subtask
    // (avoid double-nesting if parent is itself a subtask)
    const parentIssue = issueMap.get(pk)!;
    if (parentIssue.fields.issuetype.subtask) continue; // don't nest subtask-of-subtask
    if (!parentToSubtasks.has(pk)) parentToSubtasks.set(pk, []);
    parentToSubtasks.get(pk)!.push(issue.key);
  }

  // Track which issue keys are placed inside a group (so we can skip them in dagre top-level layout)
  const childKeys = new Set<string>(); // subtask keys that have a group
  const groupIds = new Map<string, string>(); // parentKey → groupNodeId
  const issueGroupId = new Map<string, string>(); // issueKey → groupNodeId (for child nodes)

  // ── 2. Build group container nodes + place parent + subtask nodes inside them ──
  for (const [parentKey, subtaskKeys] of parentToSubtasks.entries()) {
    if (subtaskKeys.length === 0) continue;

    const groupId = `group__${parentKey}`;
    groupIds.set(parentKey, groupId);

    const gWidth = groupWidth();
    const gHeight = groupHeight(subtaskKeys.length);

    // Compute subtask Y offsets (relative to group top) for the SVG bracket renderer
    const subtaskOffsets: number[] = [];
    let currentY = GROUP_PADDING_TOP + NODE_HEIGHT + GROUP_INNER_GAP;
    for (let i = 0; i < subtaskKeys.length; i++) {
      subtaskOffsets.push(currentY);
      currentY += SUBTASK_NODE_HEIGHT + GROUP_INNER_GAP;
    }

    // Group container node (type: "taskGroupNode")
    nodes.push({
      id: groupId,
      type: "taskGroupNode",
      position: { x: 0, y: 0 }, // dagre will set this
      // React Flow 12 uses node.width/height (not style) for parent-node sizing
      width: gWidth,
      height: gHeight,
      style: { width: gWidth, height: gHeight },
      selectable: false,
      data: {
        parentKey,
        subtaskCount: subtaskKeys.length,
        subtaskOffsets,
      } satisfies TaskGroupNodeData,
    });

    // Parent issue node — positioned at the top of the group
    const parentIssue = issueMap.get(parentKey)!;
    const parentCat = parentIssue.fields.status.statusCategory.key;
    nodes.push({
      id: parentKey,
      type: "issueNode",
      parentId: groupId,
      extent: "parent",
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

    // Subtask nodes — stacked below the parent inside the group
    for (let i = 0; i < subtaskKeys.length; i++) {
      const sk = subtaskKeys[i];
      const subtaskIssue = issueMap.get(sk)!;
      const cat = subtaskIssue.fields.status.statusCategory.key;

      nodes.push({
        id: sk,
        type: "issueNode",
        parentId: groupId,
        extent: "parent",
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

  // ── 3. Build standalone nodes (issues not in any group) ──────────────────
  for (const issue of issues) {
    // Skip issues already placed in a group
    if (issueGroupId.has(issue.key)) continue;

    const cat = issue.fields.status.statusCategory.key;
    // An epic that has no children in the loaded set is not acting as a group
    // parent — flag it so IssueNode can render it with a distinct visual style.
    const isEpicStandalone =
      issue.fields.issuetype.name === "Epic" && !groupIds.has(issue.key);
    nodes.push({
      id: issue.key,
      type: "issueNode",
      position: { x: 0, y: 0 },
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
  }

  // ── 4a. Transitive reduction of "blocks" edges ──────────────────────────
  // Build a raw blocks adjacency map (issue key → set of keys it blocks)
  // using only the direct links from the Jira data, before groupOrKey mapping.
  // Then for each direct blocks edge (u → v), mark it redundant if v is
  // reachable from u via a path of length ≥ 2 through other blocks edges.
  const blocksAdj = new Map<string, Set<string>>();
  for (const issue of issues) {
    for (const link of issue.fields.issuelinks ?? []) {
      if (link.outwardIssue && issueMap.has(link.outwardIssue.key)) {
        const typeName = link.type.outward.toLowerCase();
        if (typeName === "blocks") {
          if (!blocksAdj.has(issue.key)) blocksAdj.set(issue.key, new Set());
          blocksAdj.get(issue.key)!.add(link.outwardIssue.key);
        }
      }
      if (link.inwardIssue && issueMap.has(link.inwardIssue.key)) {
        const typeName = link.type.inward.toLowerCase();
        if (typeName === "is blocked by") {
          // inwardIssue blocks this issue
          const blocker = link.inwardIssue.key;
          if (!blocksAdj.has(blocker)) blocksAdj.set(blocker, new Set());
          blocksAdj.get(blocker)!.add(issue.key);
        } else if (typeName === "blocks") {
          // this issue blocks inwardIssue (flipped)
          if (!blocksAdj.has(issue.key)) blocksAdj.set(issue.key, new Set());
          blocksAdj.get(issue.key)!.add(link.inwardIssue.key);
        }
      }
    }
  }

  /**
   * Returns true if `target` is reachable from `start` through the blocksAdj
   * graph WITHOUT using the direct edge start → target (i.e., via a path ≥ 2).
   * Uses BFS over issue keys.
   */
  function isBlocksReachableIndirectly(start: string, target: string): boolean {
    const visited = new Set<string>();
    // Seed BFS with neighbours of start, excluding target itself as a starting
    // point so we only find paths of length ≥ 2.
    const queue: string[] = [];
    for (const next of blocksAdj.get(start) ?? []) {
      if (next !== target && !visited.has(next)) {
        visited.add(next);
        queue.push(next);
      }
    }
    while (queue.length > 0) {
      const node = queue.shift()!;
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

  // ── 4b. Build edges from issuelinks (skip internal parent→subtask edges) ──

  // Helper: resolve the node ID to use as edge source/target.
  // When an issue is a grouped parent, use the group container ID so that
  // edges connect to the group's handles at the true top/bottom — not through
  // the sub-task area inside the group.
  // When an issue is a subtask inside a group, also use the group container ID
  // (subtasks cannot have their own external handles).
  function groupOrKey(key: string): string {
    // Parent of a group → use group id
    const gid = groupIds.get(key);
    if (gid) return gid;
    // Subtask inside a group → use that group id
    const parentGid = issueGroupId.get(key);
    if (parentGid && childKeys.has(key)) return parentGid;
    return key;
  }

  for (const issue of issues) {
    for (const link of issue.fields.issuelinks ?? []) {
      // outwardIssue: this issue → outward (e.g., "blocks" FOO-2)
      if (link.outwardIssue && issueMap.has(link.outwardIssue.key)) {
        const typeName = link.type.outward; // e.g. "blocks"
        // Transitive reduction: skip redundant blocks edges
        if (
          typeName.toLowerCase() === "blocks" &&
          isBlocksReachableIndirectly(issue.key, link.outwardIssue.key)
        ) {
          continue;
        }
        const src = groupOrKey(issue.key);
        const tgt = groupOrKey(link.outwardIssue.key);
        const edgeId = `${src}-${tgt}-${typeName}`;
        if (!edgeSet.has(edgeId)) {
          edgeSet.add(edgeId);
          const color = getEdgeColor(typeName);
          edges.push({
            id: edgeId,
            source: src,
            target: tgt,
            label: getEdgeLabel(typeName),
            type: "smoothstep",
            animated: typeName.toLowerCase() === "blocks",
            style: { stroke: color, strokeWidth: 2 },
            labelStyle: { fill: color, fontWeight: 600, fontSize: 11 },
            labelBgStyle: { fill: "white", fillOpacity: 0.85 },
          });
        }
      }
      // inwardIssue: inward → this issue (e.g., FOO-1 "is blocked by" this)
      if (link.inwardIssue && issueMap.has(link.inwardIssue.key)) {
        const typeName = link.type.inward; // e.g. "is blocked by"
        const normalised = typeName.toLowerCase();
        // Normalise direction: blocker → blocked
        let rawBlocker = link.inwardIssue.key;
        let rawBlocked = issue.key;
        if (normalised === "blocks") {
          // this issue blocks inward — flip raw keys
          [rawBlocker, rawBlocked] = [rawBlocked, rawBlocker];
        }
        // Transitive reduction: skip redundant blocks edges
        if (normalised.includes("block") && isBlocksReachableIndirectly(rawBlocker, rawBlocked)) {
          continue;
        }
        const source = groupOrKey(rawBlocker);
        const target = groupOrKey(rawBlocked);
        const edgeId = `${source}-${target}-${typeName}`;
        if (!edgeSet.has(edgeId)) {
          edgeSet.add(edgeId);
          const color = getEdgeColor(normalised);
          edges.push({
            id: edgeId,
            source,
            target,
            label: getEdgeLabel(typeName),
            type: "smoothstep",
            animated: normalised.includes("block"),
            style: { stroke: color, strokeWidth: 2 },
            labelStyle: { fill: color, fontWeight: 600, fontSize: 11 },
            labelBgStyle: { fill: "white", fillOpacity: 0.85 },
          });
        }
      }
    }

    // Parent → child edges: SUPPRESS internal ones (visual grouping handles them),
    // but KEEP them if the parent is not in this issue set (edge crosses groups)
    if (issue.fields.parent && issueMap.has(issue.fields.parent.key)) {
      const parentKey = issue.fields.parent.key;
      // Skip if this issue is a subtask and its parent is in the same group
      const inGroup = childKeys.has(issue.key) && parentToSubtasks.has(parentKey);
      if (!inGroup) {
        const edgeId = `${parentKey}-${issue.key}-subtask`;
        if (!edgeSet.has(edgeId)) {
          edgeSet.add(edgeId);
          edges.push({
            id: edgeId,
            source: parentKey,
            target: issue.key,
            label: "subtask",
            type: "smoothstep",
            animated: false,
            style: { stroke: EDGE_COLORS.subtask, strokeWidth: 1.5, strokeDasharray: "5 3" },
            labelStyle: { fill: EDGE_COLORS.subtask, fontWeight: 600, fontSize: 11 },
            labelBgStyle: { fill: "white", fillOpacity: 0.85 },
          });
        }
      }
    }
  }

  // ── 5. Apply dagre layout to top-level nodes only ────────────────────────
  // Top-level = nodes without a parentId (group containers + standalone issues)
  const topLevelNodes = nodes.filter((n) => !n.parentId);

  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: "TB", nodesep: 80, ranksep: 200 });

  for (const node of topLevelNodes) {
    const w = node.type === "taskGroupNode"
      ? (node.width as number)
      : NODE_WIDTH;
    const h = node.type === "taskGroupNode"
      ? (node.height as number)
      : NODE_HEIGHT;
    g.setNode(node.id, { width: w, height: h });
  }

  // Add edges between top-level nodes for dagre ordering.
  // For nodes inside groups, we connect via their group container id.
  for (const edge of edges) {
    const src = groupOrKey(edge.source);
    const tgt = groupOrKey(edge.target);
    if (src !== tgt && g.hasNode(src) && g.hasNode(tgt)) {
      g.setEdge(src, tgt);
    }
  }

  dagre.layout(g);

  for (const node of topLevelNodes) {
    const pos = g.node(node.id);
    if (!pos) continue;
    const w = node.type === "taskGroupNode" ? (node.width as number) : NODE_WIDTH;
    const h = node.type === "taskGroupNode" ? (node.height as number) : NODE_HEIGHT;
    node.position = {
      x: pos.x - w / 2,
      y: pos.y - h / 2,
    };
  }

  return { nodes, edges };
}
