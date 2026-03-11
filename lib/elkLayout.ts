import ELK from "elkjs/lib/elk.bundled.js";
import type { ElkNode, ElkExtendedEdge, ElkPoint } from "elkjs/lib/elk-api.js";
import type { Node, Edge } from "@xyflow/react";
import {
  NODE_WIDTH,
  NODE_HEIGHT,
  EPIC_PADDING_X,
  EPIC_PADDING_TOP,
  EPIC_PADDING_BOT,
  STORY_PADDING_X,
  STORY_PADDING_TOP,
  STORY_PADDING_BOT,
  STORY_NODE_GAP,
} from "./graphConstants";

/**
 * ELK's bundled type definitions don't expose the `sections` field on
 * ElkExtendedEdge even though it is always populated after layout.
 * This augmented type is used wherever we extract bend points.
 */
export type LayoutedEdge = ElkExtendedEdge & {
  sections?: Array<{ startPoint: ElkPoint; endPoint: ElkPoint; bendPoints?: ElkPoint[] }>;
};

// ── ELK instance ─────────────────────────────────────────────────────────────

const elk = new ELK();

// Layout options for nodes inside an epic group container.
// POLYLINE routing is used instead of ORTHOGONAL - ORTHOGONAL crashes inside
// ELK's bundled algorithm on certain DAG topologies (null-pointer in elk.bundled.js).
// POLYLINE is simpler (straight-line segments) and never crashes.
export const ELK_INNER_OPTIONS = {
  "elk.algorithm": "layered",
  "elk.direction": "DOWN",
  "elk.layered.spacing.nodeNodeBetweenLayers": "80",
  "elk.spacing.nodeNode": "60",
  "elk.edgeRouting": "POLYLINE",
  "elk.padding": `[top=${EPIC_PADDING_TOP}, left=${EPIC_PADDING_X}, bottom=${EPIC_PADDING_BOT}, right=${EPIC_PADDING_X}]`,
};

// Layout options for nodes inside a story group container.
export const ELK_STORY_OPTIONS = {
  "elk.algorithm": "layered",
  "elk.direction": "DOWN",
  "elk.layered.spacing.nodeNodeBetweenLayers": String(STORY_NODE_GAP * 4),
  "elk.spacing.nodeNode": String(STORY_NODE_GAP * 3),
  "elk.edgeRouting": "POLYLINE",
  "elk.padding": `[top=${STORY_PADDING_TOP}, left=${STORY_PADDING_X}, bottom=${STORY_PADDING_BOT}, right=${STORY_PADDING_X}]`,
};

export const ELK_OPTIONS = {
  "elk.algorithm": "layered",
  "elk.direction": "DOWN",
  "elk.layered.spacing.nodeNodeBetweenLayers": "120",
  "elk.spacing.nodeNode": "80",
  "elk.edgeRouting": "POLYLINE",
  "elk.padding": "[top=40, left=40, bottom=40, right=40]",
};

// ── Top-level resolver helper ─────────────────────────────────────────────────

/**
 * Given a node id, resolve it to the id of its top-level ancestor
 * (i.e. the node that has no parentId, or whose parentId is not in topLevelNodeIds).
 * Returns the node's own id if it is already top-level.
 */
export function resolveToTopLevel(
  nodeId: string,
  nodes: Node[],
  topLevelNodeIds: Set<string>,
): string | null {
  if (topLevelNodeIds.has(nodeId)) return nodeId;
  const node = nodes.find((n) => n.id === nodeId);
  if (node?.parentId && topLevelNodeIds.has(node.parentId)) return node.parentId;
  return null;
}

// ── Epic-grouped layout ───────────────────────────────────────────────────────

/**
 * Apply a three-level ELK layout:
 * 1. Layout child nodes within each story group independently (sized).
 * 2. Layout child nodes within each epic group (stories + standalone tasks) independently.
 * 3. Layout the resulting sized epic group nodes at the top level.
 *
 * Mutates `nodes` and `edges` in place (positions and bend points).
 */
export async function applyEpicLayout(
  nodes: Node[],
  edges: Edge[],
  epicGroupIds: Map<string, string>,
  storyGroupIds?: Map<string, string>,
): Promise<void> {
  // ── Step 1: Layout children inside each story group ──────────────────────

  const allStoryGroupIds = new Set(storyGroupIds?.values() ?? []);

  if (allStoryGroupIds.size > 0) {
    const storyGroupChildren = new Map<string, Node[]>();
    for (const sgId of allStoryGroupIds) {
      storyGroupChildren.set(sgId, []);
    }

    for (const node of nodes) {
      if (node.type === "storyGroupNode") continue;
      if (!node.parentId || !storyGroupChildren.has(node.parentId)) continue;
      // Direct children of the story group: taskGroupNodes or standalone issueNodes
      if (node.type === "taskGroupNode" || node.type === "issueNode") {
        storyGroupChildren.get(node.parentId)!.push(node);
      }
    }

    // Build intra-story edge lists
    const storyGroupEdges = new Map<string, ElkExtendedEdge[]>();
    for (const sgId of allStoryGroupIds) {
      storyGroupEdges.set(sgId, []);
    }

    const storyChildIdSets = new Map<string, Set<string>>();
    for (const [sgId, children] of storyGroupChildren.entries()) {
      storyChildIdSets.set(sgId, new Set(children.map((n) => n.id)));
    }

    for (const edge of edges) {
      for (const [sgId, childSet] of storyChildIdSets.entries()) {
        if (childSet.has(edge.source) && childSet.has(edge.target)) {
          storyGroupEdges.get(sgId)!.push({
            id: `elk__story_inner__${edge.id}`,
            sources: [edge.source],
            targets: [edge.target],
          });
          break;
        }
      }
    }

    // Run ELK for each story group and apply positions + computed sizes
    for (const [sgId, children] of storyGroupChildren.entries()) {
      if (children.length === 0) continue;

      const innerGraph: ElkNode = {
        id: sgId,
        layoutOptions: ELK_STORY_OPTIONS,
        children: children.map((n) => ({
          id: n.id,
          width: n.type === "taskGroupNode" ? (n.width as number) : NODE_WIDTH,
          height: n.type === "taskGroupNode" ? (n.height as number) : NODE_HEIGHT,
        })),
        edges: storyGroupEdges.get(sgId) ?? [],
      };

      const layouted = await elk.layout(innerGraph);

      for (const elkChild of layouted.children ?? []) {
        const node = nodes.find((n) => n.id === elkChild.id);
        if (node) node.position = { x: elkChild.x ?? 0, y: elkChild.y ?? 0 };
      }

      // Update story group node size
      const storyNode = nodes.find((n) => n.id === sgId);
      if (storyNode) {
        const w = layouted.width ?? (NODE_WIDTH + STORY_PADDING_X * 2);
        const h = layouted.height ?? 120;
        storyNode.width = w;
        storyNode.height = h;
        storyNode.style = { ...storyNode.style, width: w, height: h };
      }
    }
  }

  // ── Step 2: Layout children inside each epic group ────────────────────────

  // Build a map from epicGroupId -> its direct children
  // (taskGroupNode, storyGroupNode, or standalone issueNode)
  const epicGroupChildren = new Map<string, Node[]>();
  for (const [, epicGroupId] of epicGroupIds.entries()) {
    epicGroupChildren.set(epicGroupId, []);
  }

  for (const node of nodes) {
    if (node.type === "epicGroupNode") continue;
    if (!node.parentId || !epicGroupChildren.has(node.parentId)) continue;
    // Only direct children of the epic group:
    //   - taskGroupNode containers
    //   - storyGroupNode containers
    //   - standalone issueNodes whose parentId is the epicGroupId directly
    if (node.type === "taskGroupNode" || node.type === "storyGroupNode" || node.type === "issueNode") {
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
  const epicGroupSizes = new Map<string, { width: number; height: number }>();
  const innerPositions = new Map<string, { x: number; y: number }>();

  for (const [epicGroupId, children] of epicGroupChildren.entries()) {
    if (children.length === 0) continue;

    const innerGraph: ElkNode = {
      id: epicGroupId,
      layoutOptions: ELK_INNER_OPTIONS,
      children: children.map((n) => ({
        id: n.id,
        width: (n.type === "taskGroupNode" || n.type === "storyGroupNode")
          ? (n.width as number)
          : NODE_WIDTH,
        height: (n.type === "taskGroupNode" || n.type === "storyGroupNode")
          ? (n.height as number)
          : NODE_HEIGHT,
      })),
      edges: epicGroupEdges.get(epicGroupId) ?? [],
    };

    const layouted = await elk.layout(innerGraph);

    // ELK applies elk.padding internally, so elkChild positions already include
    // the left/top padding offsets. ELK also sets layouted.width/height to the
    // full computed size of the graph (content + all padding). Use those directly
    // as the container dimensions - do NOT add extra padding on top.
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

  // ── Step 3: Top-level layout of epic group containers ────────────────────

  // Top-level layout: just the epic group nodes (and any standalone nodes)
  const topLevelNodes = nodes.filter((n) => !n.parentId);
  const topLevelNodeIds = new Set(topLevelNodes.map((n) => n.id));

  // Cross-epic edges for the top-level ELK graph
  const topLevelElkEdges: ElkExtendedEdge[] = [];
  const edgeIdToElkId = new Map<string, string>();
  // Maps "srcEpicId-tgtEpicId" -> representative ELK edge id for that epic pair.
  // Only one ELK edge is created per directed epic pair; subsequent original edges
  // are mapped to the same ELK id so they all receive the same bend points.
  const topEdgeSet = new Map<string, string>();

  for (const edge of edges) {
    const srcTopLevel = resolveToTopLevel(edge.source, nodes, topLevelNodeIds);
    const tgtTopLevel = resolveToTopLevel(edge.target, nodes, topLevelNodeIds);

    if (srcTopLevel && tgtTopLevel && srcTopLevel !== tgtTopLevel) {
      const topEdgeId = `${srcTopLevel}-${tgtTopLevel}`;
      if (!topEdgeSet.has(topEdgeId)) {
        const elkEdgeId = `elk__top__${edge.id}`;
        topEdgeSet.set(topEdgeId, elkEdgeId);
        edgeIdToElkId.set(edge.id, elkEdgeId);
        topLevelElkEdges.push({
          id: elkEdgeId,
          sources: [srcTopLevel],
          targets: [tgtTopLevel],
        });
      } else {
        // A representative ELK edge for this epic pair already exists - map
        // this original edge to the same ELK id so it gets the same bend points.
        const representativeElkId = topEdgeSet.get(topEdgeId)!;
        edgeIdToElkId.set(edge.id, representativeElkId);
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
  for (const elkEdge of topLayouted.edges ?? []) {
    const section = (elkEdge as LayoutedEdge).sections?.[0];
    if (!section) continue;
    const pts = [section.startPoint, ...(section.bendPoints ?? []), section.endPoint];
    for (const [origId, elkId] of edgeIdToElkId.entries()) {
      if (elkId === elkEdge.id) {
        const edge = edges.find((e) => e.id === origId);
        if (edge) (edge.data as Record<string, unknown>).bendPoints = pts;
      }
    }
  }
}

// ── Flat (no epic grouping) layout ────────────────────────────────────────────

/**
 * Apply a flat ELK layout for graphs with no epic grouping (single epic or all unassigned).
 * Mutates `nodes` and `edges` in place (positions and bend points).
 */
export async function applyFlatLayout(
  nodes: Node[],
  edges: Edge[],
  groupIds: Map<string, string>,
  issueGroupId: Map<string, string>,
  childKeys: Set<string>,
): Promise<void> {
  function groupOrKey(key: string): string {
    const gid = groupIds.get(key);
    if (gid) return gid;
    const parentGid = issueGroupId.get(key);
    if (parentGid && childKeys.has(key)) return parentGid;
    return key;
  }

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
