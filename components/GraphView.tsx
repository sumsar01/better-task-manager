"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ReactFlow,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import IssueNode from "./IssueNode";
import TaskGroupNode from "./TaskGroupNode";
import EpicGroupNode from "./EpicGroupNode";
import ElkEdge from "./ElkEdge";
import Legend from "./Legend";
import { buildGraph, buildEdgesOnly, STATUS_COLORS, STATUS_TEXT_COLORS } from "@/lib/buildGraph";
import { diffIssues } from "@/lib/diffGraph";
import type { JiraIssue } from "@/lib/jira";
import type { IssueNodeData, EpicGroupNodeData } from "@/lib/buildGraph";

// The graph can contain mixed node types (issueNode + taskGroupNode + epicGroupNode)
type AnyNode = Node;

const nodeTypes = { issueNode: IssueNode, taskGroupNode: TaskGroupNode, epicGroupNode: EpicGroupNode };
const edgeTypes = { elkEdge: ElkEdge };
const FIT_VIEW_OPTIONS = { padding: 0.2 } as const;
const PRO_OPTIONS = { hideAttribution: true } as const;

interface GraphViewProps {
  issues: JiraIssue[];
  /** Updated snapshot from the background poller — triggers in-place patch. */
  latestIssues?: JiraIssue[];
  /** Called when a node is selected (key) or deselected (null). */
  onNodeSelect?: (key: string | null) => void;
}

export default function GraphView({ issues, latestIssues, onNodeSelect }: GraphViewProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState<AnyNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const layoutDoneRef = useRef(false);
  const nodesReadyRef = useRef(false);
  // Stable ref to current edges — allows reading edge topology without stale closures
  const edgesRef = useRef<Edge[]>(edges);
  useEffect(() => { edgesRef.current = edges; }, [edges]);

  // Stable nodeColor callback — avoids MiniMap re-rendering on every render
  const miniMapNodeColor = useCallback((n: AnyNode) => {
    const data = n.data as IssueNodeData;
    return data?.bgColor ?? "#e2e8f0";
  }, []);

  // Build the ELK layout once — when initial issues first arrive.
  // We deliberately ignore subsequent changes to `issues` (polling uses the
  // separate `latestIssues` in-place patch path below).
  useEffect(() => {
    if (layoutDoneRef.current || issues.length === 0) return;
    layoutDoneRef.current = true;
    buildGraph(issues).then(({ nodes: n, edges: e }) => {
      nodesReadyRef.current = true;
      setNodes(n as AnyNode[]);
      setEdges(e);
    }).catch(() => {
      // Layout failed — leave canvas empty; user can refresh
    });
  }, [issues, setNodes, setEdges]);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  // Keep a ref to the current issues so the diff can compare without stale closure.
  const prevIssuesRef = useRef<JiraIssue[]>(issues);

  // ── In-place patch when latestIssues changes ────────────────────────────
  useEffect(() => {
    // Don't process patches until the initial ELK layout has been applied.
    // This prevents the polling diff from racing against the async buildGraph call.
    if (!latestIssues || latestIssues.length === 0) return;
    if (!nodesReadyRef.current) return;

    const diff = diffIssues(prevIssuesRef.current, latestIssues);
    if (!diff.hasChanges) return;

    prevIssuesRef.current = latestIssues;

    // Patch node data for changed issues (preserves position)
    if (diff.changed.length > 0) {
      const changedMap = new Map(diff.changed.map((i) => [i.key, i]));
      setNodes((nds) =>
        nds.map((n) => {
          const updated = changedMap.get(n.id);
          if (!updated) return n;
          const cat = updated.fields.status.statusCategory.key;
          return {
            ...n,
            data: {
              ...n.data,
              statusName: updated.fields.status.name,
              statusCategory: cat,
              assignee: updated.fields.assignee?.displayName ?? null,
              summary: updated.fields.summary,
              bgColor: STATUS_COLORS[cat] ?? STATUS_COLORS.new,
              textColor: STATUS_TEXT_COLORS[cat] ?? STATUS_TEXT_COLORS.new,
            },
          };
        })
      );
    }

    // Remove nodes for deleted issues
    if (diff.removed.length > 0) {
      const removedSet = new Set(diff.removed);
      setNodes((nds) => nds.filter((n) => !removedSet.has(n.id)));
      setEdges((eds) =>
        eds.filter(
          (e) => !removedSet.has(e.source) && !removedSet.has(e.target)
        )
      );
    }

    // Add nodes + edges for new issues — place them at a rough position
    // (no full re-layout; they appear at bottom-right, user can drag)
    if (diff.added.length > 0) {
      // buildEdgesOnly skips the expensive ELK layout — we only need edge topology
      const { edges: newEdges } = buildEdgesOnly(diff.added);
      const offsetX = 800;
      const offsetY = 600;
      // Produce placeholder nodes without running ELK (positions are rough anyway)
      const offsetNodes: AnyNode[] = diff.added.map((issue, i) => ({
        id: issue.key,
        type: "issueNode",
        position: { x: offsetX + (i % 3) * 300, y: offsetY + Math.floor(i / 3) * 140 },
        data: {
          summary: issue.fields.summary,
          statusName: issue.fields.status.name,
          statusCategory: issue.fields.status.statusCategory.key,
          assignee: issue.fields.assignee?.displayName ?? null,
          bgColor: STATUS_COLORS[issue.fields.status.statusCategory.key] ?? STATUS_COLORS.new,
          textColor: STATUS_TEXT_COLORS[issue.fields.status.statusCategory.key] ?? STATUS_TEXT_COLORS.new,
          isSubtask: false,
        },
      }));

      setNodes((nds) => {
        const existingKeys = new Set(nds.map((n) => n.id));
        const toAdd = offsetNodes.filter((n) => !existingKeys.has(n.id));
        return [...nds, ...toAdd];
      });
      setEdges((eds) => {
        const existingKeys = new Set(
          // use latest nodes — we just set them, but updater sees prev state,
          // so filter against edges whose nodes we know will exist
          [...eds.map((e) => e.source), ...eds.map((e) => e.target)]
        );
        const existingEdgeIds = new Set(eds.map((e) => e.id));
        const deduped = newEdges.filter((e) => !existingEdgeIds.has(e.id));
        void existingKeys; // used implicitly via existingEdgeIds dedup
        return [...eds, ...deduped];
      });
    }

    // Patch edges for changed issues (links may have changed) — no ELK needed
    if (diff.changed.length > 0) {
      const { edges: freshEdges } = buildEdgesOnly(latestIssues);
      setEdges((eds) => {
        const existingIds = new Set(eds.map((e) => e.id));
        const toAdd = freshEdges.filter((e) => !existingIds.has(e.id));
        const freshEdgeIds = new Set(freshEdges.map((e) => e.id));
        const filtered = eds.filter((e) => freshEdgeIds.has(e.id));
        return [...filtered, ...toAdd];
      });
    }
  }, [latestIssues, setNodes, setEdges]);

  // ── Highlight on click ──────────────────────────────────────────────────
  const highlightConnected = useCallback(
    (clickedKey: string | null) => {
      if (!clickedKey) {
        setNodes((nds) =>
          nds.map((n) => ({ ...n, style: { ...n.style, opacity: 1 } }))
        );
        setEdges((eds) =>
          eds.map((e) => ({ ...e, style: { ...e.style, opacity: 1 } }))
        );
        return;
      }

      // Compute connected sets from the stable ref — no side-effects in updaters
      const connectedNodes = new Set<string>([clickedKey]);
      const connectedEdges = new Set<string>();
      for (const edge of edgesRef.current) {
        if (edge.source === clickedKey || edge.target === clickedKey) {
          connectedEdges.add(edge.id);
          connectedNodes.add(edge.source);
          connectedNodes.add(edge.target);
        }
      }

      setEdges((eds) =>
        eds.map((e) => ({
          ...e,
          style: {
            ...e.style,
            opacity: connectedEdges.has(e.id) ? 1 : 0.1,
          },
        }))
      );

      setNodes((nds) =>
        nds.map((n) => ({
          ...n,
          style: {
            ...n.style,
            opacity: connectedNodes.has(n.id) ? 1 : 0.2,
          },
        }))
      );
    },
    [setNodes, setEdges]
  );

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: AnyNode) => {
      const key =
        node.type === "epicGroupNode"
          ? (node.data as EpicGroupNodeData).epicKey
          : node.id;
      if (key === selectedKey) {
        setSelectedKey(null);
        highlightConnected(null);
        onNodeSelect?.(null);
      } else {
        setSelectedKey(key);
        highlightConnected(key);
        onNodeSelect?.(key);
      }
    },
    [selectedKey, highlightConnected, onNodeSelect]
  );

  const onPaneClick = useCallback(() => {
    setSelectedKey(null);
    highlightConnected(null);
    onNodeSelect?.(null);
  }, [highlightConnected, onNodeSelect]);

  return (
    <div className="w-full h-full relative">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        fitView
        fitViewOptions={FIT_VIEW_OPTIONS}
        minZoom={0.1}
        maxZoom={2}
        nodesDraggable={false}
        onlyRenderVisibleElements
        proOptions={PRO_OPTIONS}
      >
        <Controls />
        <MiniMap
          nodeColor={miniMapNodeColor}
          maskColor="rgba(248,250,252,0.7)"
          className="!border-slate-200"
        />
      </ReactFlow>
      <Legend />
    </div>
  );
}
