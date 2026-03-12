"use client";

import { memo, useMemo } from "react";
import type { EdgeProps } from "@xyflow/react";
import { BaseEdge, EdgeLabelRenderer } from "@xyflow/react";
import type { CrossEpicBundleEdgeData } from "@/lib/graphConstants";

interface ElkPoint {
  x: number;
  y: number;
}

/**
 * Custom React Flow edge renderer for cross-epic bundle edges.
 *
 * Renders a bold stroke (strokeWidth 3) using ELK bend points (same
 * Catmull-Rom → cubic Bézier conversion as ElkEdge), plus an oval pill badge
 * at the midpoint showing the bundle label (e.g. "3 blocks").
 *
 * Starts at opacity 0 and is revealed by GraphView when a node that
 * participates in this bundle is clicked/selected.
 */
function CrossEpicBundleEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  style,
  markerEnd,
  data,
}: EdgeProps) {
  const edgeData = data as CrossEpicBundleEdgeData | undefined;
  const bendPoints = edgeData?.bendPoints as ElkPoint[] | undefined;
  const color = edgeData?.color ?? "#ef4444";
  const label = edgeData?.label ?? "";

  const { edgePath, labelX, labelY } = useMemo(() => {
    if (bendPoints && bendPoints.length >= 2) {
      const TENSION = 0.4;
      const pts = bendPoints;
      const n = pts.length;
      const p = (i: number): ElkPoint => pts[Math.max(0, Math.min(n - 1, i))];

      let path = `M ${pts[0].x} ${pts[0].y}`;
      for (let i = 0; i < n - 1; i++) {
        const cp1x = p(i).x + (p(i + 1).x - p(i - 1).x) * TENSION / 2;
        const cp1y = p(i).y + (p(i + 1).y - p(i - 1).y) * TENSION / 2;
        const cp2x = p(i + 1).x - (p(i + 2).x - p(i).x) * TENSION / 2;
        const cp2y = p(i + 1).y - (p(i + 2).y - p(i).y) * TENSION / 2;
        path += ` C ${cp1x} ${cp1y} ${cp2x} ${cp2y} ${p(i + 1).x} ${p(i + 1).y}`;
      }

      const midIdx = Math.floor(n / 2);
      const a = pts[midIdx - 1] ?? pts[0];
      const b = pts[midIdx] ?? pts[n - 1];
      return { edgePath: path, labelX: (a.x + b.x) / 2, labelY: (a.y + b.y) / 2 };
    }

    // Fallback: vertical-bias cubic Bézier
    const dy = Math.abs(targetY - sourceY);
    const offset = Math.max(dy * 0.5, 40);
    const fallbackPath =
      `M ${sourceX} ${sourceY} C ${sourceX} ${sourceY + offset} ${targetX} ${targetY - offset} ${targetX} ${targetY}`;
    return {
      edgePath: fallbackPath,
      labelX: (sourceX + targetX) / 2,
      labelY: (sourceY + targetY) / 2,
    };
  }, [bendPoints, sourceX, sourceY, targetX, targetY]);

  const pathStyle: React.CSSProperties = useMemo(
    () => ({ ...style, fill: "none", stroke: color, strokeWidth: 3 }),
    [style, color],
  );

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        style={pathStyle}
      />
      {label && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              pointerEvents: "none",
              padding: "3px 8px",
              borderRadius: 999,
              fontSize: 11,
              fontWeight: 700,
              color: "#ffffff",
              background: color,
              whiteSpace: "nowrap",
              boxShadow: "0 1px 4px rgba(0,0,0,0.25)",
              letterSpacing: "0.02em",
            }}
            className="nodrag nopan"
          >
            {label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

export default memo(CrossEpicBundleEdge);
