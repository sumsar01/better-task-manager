import type { Node, Edge } from "@xyflow/react";
import type { JiraIssue } from "./jira";
import {
  NODE_WIDTH,
  NODE_HEIGHT,
  GROUP_PADDING_X,
  GROUP_PADDING_TOP,
  GROUP_INNER_GAP,
  GROUP_LEFT_INDENT,
  SUBTASK_NODE_HEIGHT,
  EPIC_PADDING_X,
  UNASSIGNED_EPIC_KEY,
  EXTERNAL_LABEL,
  EPIC_COLORS,
  UNASSIGNED_EPIC_COLOR,
  STATUS_COLORS,
  STATUS_TEXT_COLORS,
  EDGE_COLORS,
  GROUP_WIDTH,
  groupHeight,
} from "./graphConstants";
import type {
  IssueNodeData,
  TaskGroupNodeData,
  EpicGroupNodeData,
} from "./graphConstants";

// ── Private helpers ───────────────────────────────────────────────────────────

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
  // Fall back to "new" (= Jira's "To Do" category, renders as grey) for unknown categories.
  return STATUS_COLORS[categoryKey] ?? STATUS_COLORS.new;
}

function statusTextColor(categoryKey: string): string {
  return STATUS_TEXT_COLORS[categoryKey] ?? STATUS_TEXT_COLORS.new;
}

// ── BFS helper ────────────────────────────────────────────────────────────────

/**
 * Returns true if `target` is reachable from `start` through the blocksAdj
 * graph WITHOUT using the direct edge start → target (i.e., via a path >= 2).
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

// ── Graph structure result type ───────────────────────────────────────────────

/**
 * Internal result of the structure-building phases.
 * Used by both buildGraph (which also runs ELK layout) and
 * buildEdgesOnly (which skips layout entirely).
 */
export interface GraphStructure {
  nodes: Node[];
  edges: Edge[];
  /** parentKey -> groupNodeId */
  groupIds: Map<string, string>;
  /** issueKey -> groupNodeId */
  issueGroupId: Map<string, string>;
  /** subtask keys that belong to a group */
  childKeys: Set<string>;
  /** issueKey -> epicGroupNodeId */
  issueEpicGroupId: Map<string, string>;
  /** epicKey -> epicGroupNodeId */
  epicGroupIds: Map<string, string>;
}

// ── Structure builder (phases 0-4, no layout) ─────────────────────────────────

export function buildGraphStructure(issues: JiraIssue[]): GraphStructure {
  const issueMap = new Map(issues.map((i) => [i.key, i]));
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  const edgeSet = new Set<string>();

  // ── 0. Build epic -> member issues map ───────────────────────────────────
  // For each issue, find the epic it belongs to by walking up the parent chain.
  // epicToMembers: epicKey (or UNASSIGNED_EPIC_KEY) -> Set of direct member keys
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
      // Don't add the epic itself as a member - it becomes the group header
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
  // are created in Phases 1-3.
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

      // Width/height are placeholders - updated after ELK inner layout
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

  // ── 1. Build parent->children map ────────────────────────────────────────
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
    // Do NOT set extent:"parent" on it - React Flow doesn't support extent:"parent"
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
    // issueNodes inside it must NOT have extent:"parent" - React Flow does not
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
        isExternal: (parentIssue.fields.labels as string[] | undefined)?.includes(EXTERNAL_LABEL) ?? false,
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
          isExternal: (subtaskIssue.fields.labels as string[] | undefined)?.includes(EXTERNAL_LABEL) ?? false,
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
    // a standalone issueNode - that would render them twice (container + card).
    if (epicGroupIds.has(issue.key)) continue;

    const cat = issue.fields.status.statusCategory.key;
    const isEpicStandalone =
      issue.fields.issuetype.name === "Epic" && !groupIds.has(issue.key);

    // If epic grouping is on and this issue belongs to an epic group, set parentId.
    // Epic nodes themselves map to their own key in issueToEpic - they become the
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
        isExternal: (issue.fields.labels as string[] | undefined)?.includes(EXTERNAL_LABEL) ?? false,
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
    // container's id (e.g. "EPIC-A" -> "epic_group__EPIC-A").  Without this,
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

      // Subtask -> parent relationship is shown visually via the TaskGroupNode
      // container (indented chips). No explicit edge is drawn in either case.
    }
  }

  return { nodes, edges, groupIds, issueGroupId, childKeys, issueEpicGroupId, epicGroupIds };
}
