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
  STORY_PADDING_X,
  STORY_PADDING_TOP,
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
  StoryGroupNodeData,
  CrossEpicBundleEdgeData,
  CrossEpicLink,
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
  /** storyKey -> storyGroupNodeId */
  storyGroupIds: Map<string, string>;
  /** issueKey -> storyGroupNodeId (for issues inside a story group) */
  issueStoryGroupId: Map<string, string>;
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

  // ── 0.7 Build story -> child issues map, create storyGroupNode containers ─
  // Stories that have direct children in the dataset become group containers,
  // similar to how epics work. Stories without children remain standalone cards.

  // First, identify which stories have children (by scanning parent relationships).
  const storyToChildren = new Map<string, string[]>();
  for (const issue of issues) {
    if (!issue.fields.parent) continue;
    const pk = issue.fields.parent.key;
    const parentIssue = issueMap.get(pk);
    if (!parentIssue) continue;
    // Only group children under Stories (not under Epics or Jira-subtask-type issues)
    if (parentIssue.fields.issuetype.name !== "Story") continue;
    if (!storyToChildren.has(pk)) storyToChildren.set(pk, []);
    storyToChildren.get(pk)!.push(issue.key);
  }

  const storyGroupIds = new Map<string, string>();
  const issueStoryGroupId = new Map<string, string>();

  for (const [storyKey, childIssueKeys] of storyToChildren.entries()) {
    if (childIssueKeys.length === 0) continue;
    const storyIssue = issueMap.get(storyKey);
    if (!storyIssue) continue;

    const storyGroupId = `story_group__${storyKey}`;
    storyGroupIds.set(storyKey, storyGroupId);

    const storySummary = storyIssue.fields.summary;

    // The storyGroupNode lives inside an epicGroupNode if epic grouping is on
    const storyEpicKey = issueToEpic.get(storyKey);
    const storyEpicGroupId =
      epicGroupingEnabled && storyEpicKey
        ? epicGroupIds.get(storyEpicKey)
        : undefined;

    // Width/height are placeholders - updated after ELK inner layout
    nodes.push({
      id: storyGroupId,
      type: "storyGroupNode",
      position: { x: 0, y: 0 },
      width: NODE_WIDTH + STORY_PADDING_X * 2,
      height: 120,
      style: { width: NODE_WIDTH + STORY_PADDING_X * 2, height: 120 },
      selectable: false,
      ...(storyEpicGroupId ? { parentId: storyEpicGroupId } : {}),
      data: {
        storyKey,
        storySummary,
      } satisfies StoryGroupNodeData,
    });

    if (storyEpicGroupId) {
      issueEpicGroupId.set(storyKey, storyEpicGroupId);
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
    if (parentIssue.fields.issuetype.name === "Story") continue; // story children handled as storyGroup members
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

    // Determine the parent container for this taskGroupNode.
    // Priority: storyGroupNode > epicGroupNode > none
    const parentIssueEpicKey = issueToEpic.get(parentKey);
    const taskGroupEpicId = epicGroupingEnabled
      ? epicGroupIds.get(parentIssueEpicKey ?? "")
      : undefined;

    // Check if the parent task lives inside a storyGroupNode
    const parentStoryGroupId = storyGroupIds.get(
      issueMap.get(parentKey)?.fields.parent?.key ?? ""
    );
    const taskGroupParentId = parentStoryGroupId ?? taskGroupEpicId;

    // If epic grouping is on, this taskGroupNode is a child of an epicGroupNode
    // (possibly via a storyGroupNode). Do NOT set extent:"parent" on it -
    // React Flow doesn't support extent:"parent" on nodes whose own parent is
    // also a child (3-level extent nesting is unsupported).

    nodes.push({
      id: groupId,
      type: "taskGroupNode",
      position: { x: 0, y: 0 },
      width: gWidth,
      height: gHeight,
      style: { width: gWidth, height: gHeight },
      selectable: false,
      ...(taskGroupParentId ? { parentId: taskGroupParentId } : {}),
      // extent:"parent" intentionally omitted when inside an epicGroupNode or storyGroupNode
      data: {
        parentKey,
        subtaskCount: subtaskKeys.length,
        subtaskOffsets,
      } satisfies TaskGroupNodeData,
    });

    if (taskGroupEpicId) {
      issueEpicGroupId.set(parentKey, taskGroupEpicId);
    }
    if (parentStoryGroupId) {
      issueStoryGroupId.set(parentKey, parentStoryGroupId);
    }

    // When this taskGroupNode lives inside an epicGroupNode or storyGroupNode
    // (3-level hierarchy), issueNodes inside it must NOT have extent:"parent" -
    // React Flow does not support extent:"parent" at depth 3.
    const issueExtent = taskGroupParentId ? undefined : ("parent" as const);

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

  // ── 2.5 Build standalone issueNodes for story-group members that are NOT
  //        themselves parents of subtasks (i.e. tasks inside a story with no
  //        sub-tasks of their own become plain issueNode cards inside the story
  //        group container).
  for (const [storyKey, childIssueKeys] of storyToChildren.entries()) {
    const storyGroupId = storyGroupIds.get(storyKey);
    if (!storyGroupId) continue;

    for (const ck of childIssueKeys) {
      // Skip if already handled as a taskGroupNode parent (Phase 2 above)
      if (issueGroupId.has(ck)) continue;
      // Skip if it is a subtask-type chip (childKeys)
      if (childKeys.has(ck)) continue;

      const childIssue = issueMap.get(ck);
      if (!childIssue) continue;

      const cat = childIssue.fields.status.statusCategory.key;

      // The storyGroupNode itself lives inside an epicGroupNode (depth 2),
      // so its children are at depth 3. Omit extent:"parent" at depth >= 3.
      const storyEpicGroupId = epicGroupingEnabled
        ? issueEpicGroupId.get(storyKey)
        : undefined;
      const issueExtent = storyEpicGroupId ? undefined : ("parent" as const);

      nodes.push({
        id: ck,
        type: "issueNode",
        parentId: storyGroupId,
        ...(issueExtent ? { extent: issueExtent } : {}),
        position: { x: STORY_PADDING_X, y: STORY_PADDING_TOP },
        data: {
          key: ck,
          summary: childIssue.fields.summary,
          statusName: childIssue.fields.status.name,
          statusCategory: cat,
          assignee: childIssue.fields.assignee?.displayName ?? null,
          issueType: childIssue.fields.issuetype.name,
          isSubtask: childIssue.fields.issuetype.subtask,
          // Story-group members are NOT inside a taskGroupNode, so they need
          // their own handles for dependency edges. insideGroup: false ensures
          // handles are rendered on the card.
          insideGroup: false,
          isEpicStandalone: false,
          isExternal: (childIssue.fields.labels as string[] | undefined)?.includes(EXTERNAL_LABEL) ?? false,
          bgColor: statusBgColor(cat),
          textColor: statusTextColor(cat),
        } satisfies IssueNodeData,
      });

      issueStoryGroupId.set(ck, storyGroupId);
    }
  }

  // ── 3. Build standalone nodes ────────────────────────────────────────────
  for (const issue of issues) {
    if (issueGroupId.has(issue.key)) continue;
    if (issueStoryGroupId.has(issue.key)) continue;
    // Epics that already have an epicGroupNode container should not also get
    // a standalone issueNode - that would render them twice (container + card).
    if (epicGroupIds.has(issue.key)) continue;
    // Stories that already have a storyGroupNode container should not also get
    // a standalone issueNode.
    if (storyGroupIds.has(issue.key)) continue;

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
  // Story groups act as an additional level of resolution within an epic.
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

    // If this key is a story that has a group container node, map it to that
    // container's id (e.g. "STORY-A" -> "story_group__STORY-A").
    const storyGroupId = storyGroupIds.get(key);
    if (storyGroupId) return storyGroupId;

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
  // Cross-epic links are aggregated into bundle edges (one per directed epic
  // pair) rather than drawn as individual dashed lines.  Within-epic edges are
  // drawn normally.
  //
  // We also track per-raw-issue-key cross-epic out/in counts so we can show
  // ↗/↙ badges on node cards.

  // Map: `${srcEpicGroupId}--${tgtEpicGroupId}` → accumulated bundle data
  interface BundleAccum {
    srcEpicId: string;
    tgtEpicId: string;
    links: CrossEpicLink[];
    typeCounts: Map<string, number>; // typeName → count, for label generation
  }
  const bundleMap = new Map<string, BundleAccum>();

  // Per raw issue key: how many cross-epic outgoing / incoming edges
  const crossEpicOutCount = new Map<string, number>();
  const crossEpicInCount  = new Map<string, number>();

  function addCrossEpicLink(
    srcRaw: string, tgtRaw: string,
    srcEpicId: string, tgtEpicId: string,
    typeName: string, color: string,
  ) {
    const bundleKey = `${srcEpicId}--${tgtEpicId}`;
    if (!bundleMap.has(bundleKey)) {
      bundleMap.set(bundleKey, { srcEpicId, tgtEpicId, links: [], typeCounts: new Map() });
    }
    const bundle = bundleMap.get(bundleKey)!;
    // Deduplicate individual links — use canonical normalised type name so that
    // "blocks" (outward) and "is blocked by" (inward) for the same pair don't
    // produce two entries. We normalise to the outward/canonical form here.
    const linkKey = `${srcRaw}--${tgtRaw}`;
    if (!bundle.links.find(l => `${l.sourceKey}--${l.targetKey}` === linkKey)) {
      bundle.links.push({ sourceKey: srcRaw, targetKey: tgtRaw, typeName, color });
      bundle.typeCounts.set(typeName, (bundle.typeCounts.get(typeName) ?? 0) + 1);
      // Only count after confirmed add — prevents double-counting from outward+inward iterations
      crossEpicOutCount.set(srcRaw, (crossEpicOutCount.get(srcRaw) ?? 0) + 1);
      crossEpicInCount.set(tgtRaw,  (crossEpicInCount.get(tgtRaw)  ?? 0) + 1);
    }
  }

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
        const isCrossEpic = epicGroupingEnabled &&
          getEpicGroupForKey(issue.key) !== getEpicGroupForKey(link.outwardIssue.key);

        if (isCrossEpic) {
          const srcEpicId = getEpicGroupForKey(issue.key) ?? src;
          const tgtEpicId = getEpicGroupForKey(link.outwardIssue.key) ?? tgt;
          addCrossEpicLink(issue.key, link.outwardIssue.key, srcEpicId, tgtEpicId, typeName, getEdgeColor(typeName));
        } else {
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
        const isCrossEpic = epicGroupingEnabled &&
          getEpicGroupForKey(rawBlocker) !== getEpicGroupForKey(rawBlocked);

        if (isCrossEpic) {
          const srcEpicId = getEpicGroupForKey(rawBlocker) ?? source;
          const tgtEpicId = getEpicGroupForKey(rawBlocked) ?? target;
          // Use the outward type name so the stored label is canonical (e.g. "blocks")
          addCrossEpicLink(rawBlocker, rawBlocked, srcEpicId, tgtEpicId, link.type.outward, getEdgeColor(link.type.outward.toLowerCase()));
        } else {
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

      // Subtask -> parent relationship is shown visually via the TaskGroupNode
      // container (indented chips). No explicit edge is drawn in either case.
    }
  }

  // ── 4d. Emit bundle edges for cross-epic links ────────────────────────────
  for (const bundle of bundleMap.values()) {
    // Build a human-readable label: dominant type name + total count.
    // e.g. "3 blocks" or "2 blocks, 1 relates to"
    let label = "";
    const sorted = [...bundle.typeCounts.entries()].sort((a, b) => b[1] - a[1]);
    if (sorted.length === 1) {
      label = `${sorted[0][1]} ${getEdgeLabel(sorted[0][0])}`;
    } else {
      label = sorted.map(([t, n]) => `${n} ${getEdgeLabel(t)}`).join(", ");
    }
    // Dominant color = color of most common type
    const dominantColor = getEdgeColor(sorted[0][0]);
    const bundleEdgeId = `bundle__${bundle.srcEpicId}--${bundle.tgtEpicId}`;
    const bundleData: CrossEpicBundleEdgeData = {
      individualEdges: bundle.links,
      bendPoints: [],
      color: dominantColor,
      label,
    };
    edges.push({
      id: bundleEdgeId,
      source: bundle.srcEpicId,
      target: bundle.tgtEpicId,
      type: "crossEpicBundle",
      animated: false,
      style: { stroke: dominantColor, strokeWidth: 3 },
      data: bundleData,
    });
  }

  // ── 4e. Back-patch cross-epic badge counts onto issueNode data ────────────
  if (crossEpicOutCount.size > 0 || crossEpicInCount.size > 0) {
    for (const node of nodes) {
      if (node.type !== "issueNode") continue;
      const out = crossEpicOutCount.get(node.id);
      const inc = crossEpicInCount.get(node.id);
      if (out || inc) {
        // IssueNodeData has an index signature so this cast is safe
        const data = node.data as IssueNodeData;
        if (out) data.crossEpicOut = out;
        if (inc) data.crossEpicIn  = inc;
      }
    }
  }

  return { nodes, edges, groupIds, issueGroupId, childKeys, issueEpicGroupId, epicGroupIds, storyGroupIds, issueStoryGroupId };
}
