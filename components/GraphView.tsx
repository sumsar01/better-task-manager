"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ReactFlow,
  Background,
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
import ElkEdge from "./ElkEdge";
import Legend from "./Legend";
import { buildGraph, STATUS_COLORS, STATUS_TEXT_COLORS } from "@/lib/buildGraph";
import { diffIssues } from "@/lib/diffGraph";
import type { JiraIssue } from "@/lib/jira";
import type { IssueNodeData } from "@/lib/buildGraph";

// The graph can contain mixed node types (issueNode + taskGroupNode)
type AnyNode = Node;

const nodeTypes = { issueNode: IssueNode, taskGroupNode: TaskGroupNode };
const edgeTypes = { elkEdge: ElkEdge };

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

  // Build the ELK layout once — when initial issues first arrive.
  // We deliberately ignore subsequent changes to `issues` (polling uses the
  // separate `latestIssues` in-place patch path below).
  useEffect(() => {
    if (layoutDoneRef.current || issues.length === 0) return;
    layoutDoneRef.current = true;
    buildGraph(issues).then(({ nodes: n, edges: e }) => {
      setNodes(n as AnyNode[]);
      setEdges(e);
    });
  }, [issues, setNodes, setEdges]);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  // Keep a ref to the current issues so the diff can compare without stale closure.
  const prevIssuesRef = useRef<JiraIssue[]>(issues);

  // ── In-place patch when latestIssues changes ────────────────────────────
  useEffect(() => {
    if (!latestIssues || latestIssues.length === 0) return;

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
      buildGraph(diff.added).then(({ nodes: newNodes, edges: newEdges }) => {
        // Offset newly added nodes so they don't stack at (0,0)
        const offsetX = 800;
        const offsetY = 600;
        const offsetNodes = newNodes.map((n, i) => ({
          ...n,
          position: { x: offsetX + (i % 3) * 300, y: offsetY + Math.floor(i / 3) * 140 },
        })) as AnyNode[];

        setNodes((nds) => {
          const existingKeys = new Set(nds.map((n) => n.id));
          const validNewEdges = newEdges.filter(
            (e) => existingKeys.has(e.source) && existingKeys.has(e.target)
          );
          setEdges((eds) => {
            const existingEdgeIds = new Set(eds.map((e) => e.id));
            const deduped = validNewEdges.filter((e) => !existingEdgeIds.has(e.id));
            return [...eds, ...deduped];
          });
          return [...nds, ...offsetNodes];
        });
      });
    }

    // Also patch edges for changed issues (links may have changed)
    if (diff.changed.length > 0) {
      buildGraph(latestIssues).then(({ edges: freshEdges }) => {
        setEdges((eds) => {
          const existingIds = new Set(eds.map((e) => e.id));
          // Add any new edges not already present
          const toAdd = freshEdges.filter((e) => !existingIds.has(e.id));
          // Remove edges whose source/target no longer appear in freshEdges
          const freshEdgeIds = new Set(freshEdges.map((e) => e.id));
          const filtered = eds.filter((e) => freshEdgeIds.has(e.id));
          return [...filtered, ...toAdd];
        });
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

      const connectedNodes = new Set<string>([clickedKey]);
      const connectedEdges = new Set<string>();

      setEdges((eds) => {
        for (const edge of eds) {
          if (edge.source === clickedKey || edge.target === clickedKey) {
            connectedEdges.add(edge.id);
            connectedNodes.add(edge.source);
            connectedNodes.add(edge.target);
          }
        }
        return eds.map((e) => ({
          ...e,
          style: {
            ...e.style,
            opacity: connectedEdges.has(e.id) ? 1 : 0.1,
          },
        }));
      });

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
      const key = node.id;
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
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.1}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
      >
        <Background color="#e2e8f0" gap={20} />
        <Controls />
        <MiniMap
          nodeColor={(n) => {
            const data = n.data as IssueNodeData;
            return data?.bgColor ?? "#e2e8f0";
          }}
          maskColor="rgba(248,250,252,0.7)"
          className="!border-slate-200"
        />
      </ReactFlow>
      <Legend />
    </div>
  );
}
