"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlow,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  useReactFlow,
  type Node,
  type Edge,
  type InternalNode,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import IssueNode from "./IssueNode";
import TaskGroupNode from "./TaskGroupNode";
import EpicGroupNode from "./EpicGroupNode";
import StoryGroupNode from "./StoryGroupNode";
import ElkEdge from "./ElkEdge";
import Legend from "./Legend";
import { buildGraph, buildEdgesOnly, STATUS_COLORS, STATUS_TEXT_COLORS } from "@/lib/buildGraph";
import { diffIssues } from "@/lib/diffGraph";
import { computeCriticalPath } from "@/lib/criticalPath";
import type { JiraIssue } from "@/lib/jira";
import type { IssueNodeData, TaskGroupNodeData, EpicGroupNodeData, StoryGroupNodeData } from "@/lib/buildGraph";

/** Discriminated union of all node types used in the graph. */
type AnyNode =
  | Node<IssueNodeData, "issueNode">
  | Node<TaskGroupNodeData, "taskGroupNode">
  | Node<EpicGroupNodeData, "epicGroupNode">
  | Node<StoryGroupNodeData, "storyGroupNode">;

const nodeTypes = { issueNode: IssueNode, taskGroupNode: TaskGroupNode, epicGroupNode: EpicGroupNode, storyGroupNode: StoryGroupNode };
const edgeTypes = { elkEdge: ElkEdge };
const FIT_VIEW_OPTIONS = { padding: 0.2 } as const;
const PRO_OPTIONS = { hideAttribution: true } as const;

/** Amber ring style applied to nodes on the critical path. */
const CRITICAL_NODE_STYLE: React.CSSProperties = {
  outline: "2px solid #f59e0b",
  outlineOffset: "2px",
  borderRadius: "12px",
};

/** Opacity for nodes/edges NOT on the critical path when highlight is active. */
const DIM_OPACITY = 0.15;

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

  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [criticalPathOn, setCriticalPathOn] = useState(false);
  // Tracks whether critical path styles are currently applied to nodes/edges.
  // Used to avoid redundant setNodes/setEdges calls in the clear branch.
  const criticalPathAppliedRef = useRef(false);

  // ── Critical path computation ───────────────────────────────────────────
  // Recomputes only when edges change (e.g. after initial layout or polling patch).
  const criticalPath = useMemo(() => computeCriticalPath(edges), [edges]);
  // Keep a ref so the effect below can read the latest value without it being
  // a dependency — this breaks the setEdges → criticalPath → effect loop.
  const criticalPathRef = useRef(criticalPath);
  criticalPathRef.current = criticalPath;

  // Refs that PanController populates so we can pan from the outer component.
  const setCenterRef = useRef<((x: number, y: number, opts: { zoom: number; duration: number }) => void) | null>(null);
  const getZoomRef = useRef<(() => number) | null>(null);
  const getNodeRef = useRef<((id: string) => InternalNode | undefined) | null>(null);

  // Stable nodeColor callback — avoids MiniMap re-rendering on every render
  const miniMapNodeColor = useCallback((n: AnyNode) => {
    if (n.type === "issueNode") return n.data.bgColor ?? "#e2e8f0";
    return "#e2e8f0";
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
        nds.map((n): AnyNode => {
          // Only issueNode type carries status/assignee — skip group containers
          if (n.type !== "issueNode") return n;
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
      const offsetNodes: AnyNode[] = diff.added.map((issue, i): Node<IssueNodeData, "issueNode"> => {
        const cat = issue.fields.status.statusCategory.key;
        return {
          id: issue.key,
          type: "issueNode",
          position: { x: offsetX + (i % 3) * 300, y: offsetY + Math.floor(i / 3) * 140 },
          data: {
            key: issue.key,
            summary: issue.fields.summary,
            statusName: issue.fields.status.name,
            statusCategory: cat,
            assignee: issue.fields.assignee?.displayName ?? null,
            issueType: issue.fields.issuetype.name,
            isSubtask: issue.fields.issuetype.subtask,
            insideGroup: false,
            isEpicStandalone: false,
            isExternal: issue.fields.labels?.includes("external") ?? false,
            bgColor: STATUS_COLORS[cat] ?? STATUS_COLORS.new,
            textColor: STATUS_TEXT_COLORS[cat] ?? STATUS_TEXT_COLORS.new,
          },
        };
      });

      setNodes((nds) => {
        const existingKeys = new Set(nds.map((n) => n.id));
        const toAdd = offsetNodes.filter((n) => !existingKeys.has(n.id));
        return [...nds, ...toAdd];
      });
      setEdges((eds) => {
        const existingEdgeIds = new Set(eds.map((e) => e.id));
        const deduped = newEdges.filter((e) => !existingEdgeIds.has(e.id));
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

  // ── Critical path visual overrides ─────────────────────────────────────
  // Depends only on criticalPathOn — reads the current path from a ref to avoid
  // the setEdges → new edges ref → new criticalPath object → effect re-runs loop.
  useEffect(() => {
    const cp = criticalPathRef.current;
    if (!criticalPathOn || cp.length === 0) {
      if (!criticalPathAppliedRef.current) return;
      criticalPathAppliedRef.current = false;
      setNodes((nds) =>
        nds.map((n) => {
          const { outline, outlineOffset, borderRadius, ...rest } = (n.style ?? {}) as Record<string, unknown>;
          void outline; void outlineOffset; void borderRadius;
          return { ...n, style: { ...(rest as React.CSSProperties), opacity: 1 } };
        })
      );
      setEdges((eds) =>
        eds.map((e) => ({ ...e, style: { ...e.style, opacity: 1 } }))
      );
      return;
    }

    criticalPathAppliedRef.current = true;
    setNodes((nds) => {
      // Expand critical node IDs to include child nodes whose parentId is a
      // critical container (taskGroupNode / epicGroupNode). Children get full
      // opacity but no amber ring — the ring stays on the container only.
      const expandedIds = new Set(cp.nodeIds);
      for (const n of nds) {
        if (n.parentId && cp.nodeIds.has(n.parentId)) {
          expandedIds.add(n.id);
        }
      }
      return nds.map((n) => {
        const isCritical = cp.nodeIds.has(n.id);          // direct → ring + opacity
        const isVisible = expandedIds.has(n.id);           // child → opacity only
        return {
          ...n,
          style: {
            ...n.style,
            opacity: isVisible ? 1 : DIM_OPACITY,
            ...(isCritical ? CRITICAL_NODE_STYLE : {}),
          },
        };
      });
    });
    setEdges((eds) =>
      eds.map((e) => ({
        ...e,
        style: {
          ...e.style,
          opacity: cp.edgeIds.has(e.id) ? 1 : DIM_OPACITY,
        },
      }))
    );
  // criticalPathRef is a ref — intentionally not in deps. setNodes/setEdges are stable.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [criticalPathOn]);

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: AnyNode) => {
      const key =
        node.type === "epicGroupNode"
          ? node.data.epicKey
          : node.type === "storyGroupNode"
            ? node.data.storyKey
            : node.id;
      if (key === selectedKey) {
        setSelectedKey(null);
        highlightConnected(null);
        onNodeSelect?.(null);
      } else {
        setSelectedKey(key);
        highlightConnected(key);
        onNodeSelect?.(key);

        // Pan to the clicked node (no zoom change).
        // In React Flow v12, absolute canvas position is at node.internals.positionAbsolute.
        // getInternalNode() returns the InternalNode which always has this populated,
        // even for child nodes nested inside epicGroupNode / taskGroupNode containers.
        const internalNode = getNodeRef.current?.(node.id);
        const absPos = internalNode?.internals?.positionAbsolute ?? node.position;
        const w = (node.width as number | undefined) ?? (internalNode?.measured?.width ?? 280);
        const h = (node.height as number | undefined) ?? (internalNode?.measured?.height ?? 100);
        const cx = absPos.x + w / 2;
        const cy = absPos.y + h / 2;
        const zoom = getZoomRef.current?.() ?? 1;
        setCenterRef.current?.(cx, cy, { zoom, duration: 350 });
      }
    },
    [selectedKey, highlightConnected, onNodeSelect]
  );

  const onPaneClick = useCallback(() => {
    setSelectedKey(null);
    highlightConnected(null);
    onNodeSelect?.(null);
  }, [highlightConnected, onNodeSelect]);

  const toggleCriticalPath = useCallback(() => {
    setCriticalPathOn((prev) => !prev);
    // Clear any click-based highlight when switching modes
    setSelectedKey(null);
    highlightConnected(null);
    onNodeSelect?.(null);
  }, [highlightConnected, onNodeSelect]);

  return (
    <div className="w-full h-full relative dark:bg-slate-900">
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
        {/* PanController must live inside <ReactFlow> to call useReactFlow() */}
        <PanController setCenterRef={setCenterRef} getZoomRef={getZoomRef} getInternalNodeRef={getNodeRef} />
        <Controls />
        <MiniMap
          nodeColor={miniMapNodeColor}
          maskColor="rgba(248,250,252,0.7)"
          className="!border-slate-200 dark:!border-slate-700"
        />
      </ReactFlow>
      <Legend />

      {/* Critical path toggle button — only shown when blocking edges exist */}
      {criticalPath.length > 0 && (
        <button
          onClick={toggleCriticalPath}
          title={
            criticalPathOn
              ? "Hide critical path"
              : `Show critical path (${criticalPath.length} step${criticalPath.length === 1 ? "" : "s"})`
          }
          className={[
            "absolute top-4 left-4 z-10",
            "flex items-center gap-2 px-3 py-2 rounded-xl",
            "text-[11px] font-semibold tracking-wide",
            "border shadow-lg transition-all duration-150 backdrop-blur-sm",
            criticalPathOn
              ? "bg-amber-500 border-amber-400 text-white shadow-amber-200/60 dark:shadow-amber-900/40"
              : [
                  "bg-white/90 dark:bg-slate-800/90",
                  "border-slate-200 dark:border-slate-700",
                  "text-slate-600 dark:text-slate-300",
                  "hover:bg-amber-50 dark:hover:bg-slate-700",
                  "hover:border-amber-300 hover:text-amber-700 dark:hover:text-amber-400",
                  "shadow-slate-200/60 dark:shadow-slate-900/40",
                ].join(" "),
          ].join(" ")}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"
              stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            />
            <path
              d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"
              stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            />
          </svg>
          Critical path
          {criticalPathOn && (
            <span className="ml-1 bg-amber-400/40 rounded-md px-1.5 py-0.5 text-[10px]">
              {criticalPath.length}
            </span>
          )}
        </button>
      )}
    </div>
  );
}

// ── PanController ────────────────────────────────────────────────────────────
// Must be rendered as a child of <ReactFlow> so it can call useReactFlow().
// Populates the mutable refs with the live setCenter / getZoom functions.

interface PanControllerProps {
  setCenterRef: React.MutableRefObject<
    ((x: number, y: number, opts: { zoom: number; duration: number }) => void) | null
  >;
  getZoomRef: React.MutableRefObject<(() => number) | null>;
  getInternalNodeRef: React.MutableRefObject<((id: string) => InternalNode | undefined) | null>;
}

function PanController({ setCenterRef, getZoomRef, getInternalNodeRef }: PanControllerProps) {
  const { setCenter, getZoom, getInternalNode } = useReactFlow();

  useEffect(() => {
    setCenterRef.current = setCenter;
    getZoomRef.current = getZoom;
    getInternalNodeRef.current = getInternalNode;
  }, [setCenter, getZoom, getInternalNode, setCenterRef, getZoomRef, getInternalNodeRef]);

  return null;
}
