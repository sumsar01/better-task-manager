import ELK from "elkjs/lib/elk.bundled.js";
import type { ElkNode, ElkExtendedEdge, ElkPoint } from "elkjs/lib/elk-api.js";
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

// ── Shared graph-structure builder (phases 1–4, no layout) ──────────────────

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
}

function buildGraphStructure(issues: JiraIssue[]): GraphStructure {
  const issueMap = new Map(issues.map((i) => [i.key, i]));
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  const edgeSet = new Set<string>();

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

  // ── 2. Build group container nodes ──────────────────────────────────────
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

    nodes.push({
      id: groupId,
      type: "taskGroupNode",
      position: { x: 0, y: 0 },
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

  // ── 3. Build standalone nodes ────────────────────────────────────────────
  for (const issue of issues) {
    if (issueGroupId.has(issue.key)) continue;

    const cat = issue.fields.status.statusCategory.key;
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
  function groupOrKey(key: string): string {
    const gid = groupIds.get(key);
    if (gid) return gid;
    const parentGid = issueGroupId.get(key);
    if (parentGid && childKeys.has(key)) return parentGid;
    return key;
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
        const src = groupOrKey(issue.key);
        const tgt = groupOrKey(link.outwardIssue.key);
        const edgeId = `${src}-${tgt}-${getEdgeLabel(typeName)}`;
        if (!edgeSet.has(edgeId)) {
          edgeSet.add(edgeId);
          const color = getEdgeColor(typeName);
          edges.push({
            id: edgeId,
            source: src,
            target: tgt,
            label: getEdgeLabel(typeName),
            type: "elkEdge",
            animated: typeName.toLowerCase() === "blocks",
            style: { stroke: color, strokeWidth: 2 },
            labelStyle: { fill: color, fontWeight: 600, fontSize: 11 },
            labelBgStyle: { fill: "white", fillOpacity: 0.85 },
            data: { color, bendPoints: [] },
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
        const source = groupOrKey(rawBlocker);
        const target = groupOrKey(rawBlocked);
        const edgeId = `${source}-${target}-${getEdgeLabel(typeName)}`;
        if (!edgeSet.has(edgeId)) {
          edgeSet.add(edgeId);
          const color = getEdgeColor(normalised);
          edges.push({
            id: edgeId,
            source,
            target,
            label: getEdgeLabel(typeName),
            type: "elkEdge",
            animated: normalised.includes("block"),
            style: { stroke: color, strokeWidth: 2 },
            labelStyle: { fill: color, fontWeight: 600, fontSize: 11 },
            labelBgStyle: { fill: "white", fillOpacity: 0.85 },
            data: { color, bendPoints: [] },
          });
        }
      }
    }

    if (issue.fields.parent && issueMap.has(issue.fields.parent.key)) {
      const parentKey = issue.fields.parent.key;
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
            type: "elkEdge",
            animated: false,
            style: { stroke: EDGE_COLORS.subtask, strokeWidth: 1.5, strokeDasharray: "5 3" },
            labelStyle: { fill: EDGE_COLORS.subtask, fontWeight: 600, fontSize: 11 },
            labelBgStyle: { fill: "white", fillOpacity: 0.85 },
            data: { color: EDGE_COLORS.subtask, bendPoints: [] },
          });
        }
      }
    }
  }

  return { nodes, edges, groupIds, issueGroupId, childKeys };
}

// ── ELK instance ─────────────────────────────────────────────────────────────

const elk = new ELK();

const ELK_OPTIONS = {
  "elk.algorithm": "layered",
  "elk.direction": "DOWN",
  "elk.layered.spacing.nodeNodeBetweenLayers": "120",
  "elk.spacing.nodeNode": "80",
  "elk.edgeRouting": "ORTHOGONAL",
  "elk.layered.unnecessaryBendpoints": "true",
  "elk.padding": "[top=40, left=40, bottom=40, right=40]",
};

// ── Public API ────────────────────────────────────────────────────────────────

export interface GraphData {
  nodes: Node[];
  edges: Edge[];
}

/**
 * Build edges only (phases 1–4), skipping ELK layout entirely.
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
 * Subtasks are grouped visually under their parent task.
 * ELK bend points are stored on edge.data.bendPoints for the ElkEdge renderer.
 */
export async function buildGraph(issues: JiraIssue[]): Promise<GraphData> {
  const { nodes, edges, groupIds, issueGroupId, childKeys } = buildGraphStructure(issues);

  // ── 5. Apply ELK layout to top-level nodes only ──────────────────────────
  const topLevelNodes = nodes.filter((n) => !n.parentId);
  const topLevelNodeIds = new Set(topLevelNodes.map((n) => n.id));

  function groupOrKey(key: string): string {
    const gid = groupIds.get(key);
    if (gid) return gid;
    const parentGid = issueGroupId.get(key);
    if (parentGid && childKeys.has(key)) return parentGid;
    return key;
  }

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

  // Apply positions — ELK gives top-left (x, y) directly
  const elkNodeMap = new Map<string, { x: number; y: number }>();
  for (const elkNode of layoutedGraph.children ?? []) {
    elkNodeMap.set(elkNode.id, { x: elkNode.x ?? 0, y: elkNode.y ?? 0 });
  }
  for (const node of topLevelNodes) {
    const pos = elkNodeMap.get(node.id);
    if (pos) node.position = { x: pos.x, y: pos.y };
  }

  // Extract bend points and attach to React Flow edges
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

  return { nodes, edges };
}
