import type { Edge } from "@xyflow/react";

export interface CriticalPathResult {
  nodeIds: Set<string>;
  edgeIds: Set<string>;
  /** Length of the critical path (number of edges). 0 if no blocking edges exist. */
  length: number;
}

/**
 * Computes the critical path(s) through the "blocks" dependency graph.
 *
 * The critical path is the longest chain of "blocks" edges — the sequence of
 * issues that determines the minimum time before everything can ship.
 *
 * All tied paths of maximum length are included (not just one).
 *
 * Algorithm:
 * 1. Build adjacency list from edges where label === "blocks"
 * 2. Compute in-degree for topological sort (Kahn's algorithm)
 * 3. Forward DP pass: dist[v] = max(dist[u] + 1) over all predecessors u
 * 4. Find the maximum distance (critical path length)
 * 5. Backward pass: collect all nodes/edges on any path achieving that max
 *
 * Returns empty sets if there are no blocking edges.
 */
export function computeCriticalPath(edges: Edge[]): CriticalPathResult {
  // Only blocks edges participate in the critical path
  const blockingEdges = edges.filter((e) => e.label === "blocks");

  if (blockingEdges.length === 0) {
    return { nodeIds: new Set(), edgeIds: new Set(), length: 0 };
  }

  // Collect all node ids that appear in blocking edges
  const nodeSet = new Set<string>();
  for (const e of blockingEdges) {
    nodeSet.add(e.source);
    nodeSet.add(e.target);
  }
  const nodeIds = Array.from(nodeSet);

  // Forward adjacency: source → [{target, edgeId}]
  const fwdAdj = new Map<string, Array<{ target: string; edgeId: string }>>();
  // Backward adjacency: target → [{source, edgeId}]
  const bwdAdj = new Map<string, Array<{ source: string; edgeId: string }>>();
  // In-degree for topological sort
  const inDegree = new Map<string, number>();

  for (const id of nodeIds) {
    fwdAdj.set(id, []);
    bwdAdj.set(id, []);
    inDegree.set(id, 0);
  }

  for (const e of blockingEdges) {
    fwdAdj.get(e.source)!.push({ target: e.target, edgeId: e.id });
    bwdAdj.get(e.target)!.push({ source: e.source, edgeId: e.id });
    inDegree.set(e.target, (inDegree.get(e.target) ?? 0) + 1);
  }

  // Kahn's topological sort
  const topoOrder: string[] = [];
  const queue: string[] = [];
  let head = 0;

  for (const [id, deg] of inDegree.entries()) {
    if (deg === 0) queue.push(id);
  }

  while (head < queue.length) {
    const node = queue[head++];
    topoOrder.push(node);
    for (const { target } of fwdAdj.get(node) ?? []) {
      const newDeg = (inDegree.get(target) ?? 0) - 1;
      inDegree.set(target, newDeg);
      if (newDeg === 0) queue.push(target);
    }
  }

  // Forward DP: dist[v] = length of longest path ending at v
  const dist = new Map<string, number>();
  for (const id of nodeIds) dist.set(id, 0);

  for (const u of topoOrder) {
    const du = dist.get(u) ?? 0;
    for (const { target } of fwdAdj.get(u) ?? []) {
      const current = dist.get(target) ?? 0;
      if (du + 1 > current) dist.set(target, du + 1);
    }
  }

  // Find the maximum path length
  let maxDist = 0;
  for (const d of dist.values()) {
    if (d > maxDist) maxDist = d;
  }

  if (maxDist === 0) {
    return { nodeIds: new Set(), edgeIds: new Set(), length: 0 };
  }

  // Backward pass: collect all nodes and edges on paths of maximum length.
  // A node u is on a critical path if dist[u] = maxDist.
  // An edge u→v is on a critical path if dist[u] + 1 = dist[v] and dist[v] = maxDist
  // — which we can expand to: dist[v] = dist[u] + 1 and dist[v] = maxDist for some
  // terminal, but it's simpler to just check: is v reachable at full depth?
  //
  // More precisely: a node is on a critical path if there exists a path from a
  // source (dist=0) to a terminal (dist=maxDist) passing through it. We check this
  // by also computing the "reverse dist" (longest path from a node to any terminal).
  const revDist = new Map<string, number>();
  for (const id of nodeIds) revDist.set(id, 0);

  // Reverse topological order
  for (let i = topoOrder.length - 1; i >= 0; i--) {
    const u = topoOrder[i];
    const du = revDist.get(u) ?? 0;
    for (const { source } of bwdAdj.get(u) ?? []) {
      const current = revDist.get(source) ?? 0;
      if (du + 1 > current) revDist.set(source, du + 1);
    }
  }

  // A node is on a critical path iff dist[v] + revDist[v] == maxDist
  const criticalNodes = new Set<string>();
  for (const id of nodeIds) {
    if ((dist.get(id) ?? 0) + (revDist.get(id) ?? 0) === maxDist) {
      criticalNodes.add(id);
    }
  }

  // An edge u→v is on a critical path iff both u and v are critical nodes
  // AND dist[v] == dist[u] + 1 (it's actually on a critical path, not just adjacent)
  const criticalEdges = new Set<string>();
  for (const e of blockingEdges) {
    if (
      criticalNodes.has(e.source) &&
      criticalNodes.has(e.target) &&
      (dist.get(e.target) ?? 0) === (dist.get(e.source) ?? 0) + 1
    ) {
      criticalEdges.add(e.id);
    }
  }

  return { nodeIds: criticalNodes, edgeIds: criticalEdges, length: maxDist };
}
