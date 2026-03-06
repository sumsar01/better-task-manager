import type { Edge } from "@xyflow/react";
import type { JiraIssue } from "./jira";
import { buildGraphStructure } from "./graphStructure";
import { applyEpicLayout, applyFlatLayout } from "./elkLayout";

// ── Re-exports (preserve existing public API) ─────────────────────────────────

export type { EdgeType, IssueNodeData, TaskGroupNodeData, EpicGroupNodeData, GraphData } from "./graphConstants";
export {
  NODE_WIDTH,
  NODE_HEIGHT,
  SUBTASK_NODE_WIDTH,
  SUBTASK_NODE_HEIGHT,
  GROUP_PADDING_X,
  GROUP_PADDING_TOP,
  GROUP_PADDING_BOT,
  GROUP_INNER_GAP,
  GROUP_LEFT_INDENT,
  EPIC_PADDING_X,
  EPIC_PADDING_TOP,
  EPIC_PADDING_BOT,
  EPIC_NODE_GAP,
  UNASSIGNED_EPIC_KEY,
  EXTERNAL_LABEL,
  EPIC_COLORS,
  UNASSIGNED_EPIC_COLOR,
  STATUS_COLORS,
  STATUS_TEXT_COLORS,
  EDGE_COLORS,
  groupHeight,
  groupWidth,
  GROUP_WIDTH,
} from "./graphConstants";

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Build edges only (phases 0-4), skipping ELK layout entirely.
 * Use this in polling diff paths where positions are not needed -
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
export async function buildGraph(issues: JiraIssue[]) {
  const { nodes, edges, groupIds, issueGroupId, childKeys, epicGroupIds } =
    buildGraphStructure(issues);

  const epicGroupingEnabled = epicGroupIds.size > 0;

  if (epicGroupingEnabled) {
    await applyEpicLayout(nodes, edges, epicGroupIds);
  } else {
    await applyFlatLayout(nodes, edges, groupIds, issueGroupId, childKeys);
  }

  return { nodes, edges };
}
