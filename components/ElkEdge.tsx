"use client";

import { memo, useMemo } from "react";
import type { EdgeProps } from "@xyflow/react";
import { BaseEdge, EdgeLabelRenderer } from "@xyflow/react";

interface ElkPoint {
  x: number;
  y: number;
}

interface ElkEdgeData {
  bendPoints?: ElkPoint[];
  color?: string;
  [key: string]: unknown;
}

/**
 * Custom React Flow edge renderer that uses ELK bend points for
 * obstacle-aware routing, rendered as smooth Catmull-Rom spline curves.
 *
 * ELK computes the full path including start/end points and all bend points,
 * which are stored on edge.data.bendPoints after layout. This renderer
 * converts those points into a smooth cubic Bézier SVG path using
 * Catmull-Rom → cubic Bézier conversion, making overlapping edges visually
 * distinguishable.
 *
 * Falls back to a straight line between sourceX/sourceY and targetX/targetY
 * when no bend points are present (e.g. disconnected or single-node graphs).
 */
function ElkEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  label,
  style,
  labelStyle,
  labelBgStyle,
  markerEnd,
  animated,
  data,
}: EdgeProps) {
  const edgeData = data as ElkEdgeData | undefined;
  const bendPoints = edgeData?.bendPoints;
  const color = edgeData?.color ?? "#94a3b8";

  const { edgePath, labelX, labelY } = useMemo(() => {
    if (bendPoints && bendPoints.length >= 2) {
      // Catmull-Rom → cubic Bézier conversion for smooth curves through ELK bend points.
      // For each segment P[i] → P[i+1], control points are:
      //   cp1 = P[i]   + (P[i+1] - P[i-1]) * tension / 2
      //   cp2 = P[i+1] - (P[i+2] - P[i])   * tension / 2
      // Out-of-bounds indices clamp to the nearest endpoint.
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
    // Fallback: vertical-bias cubic Bézier between source and target handles.
    // Control points bow outward proportional to the vertical distance,
    // producing a smooth S-curve that reads clearly in top-to-bottom layouts.
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

  const isAnimated = animated === true;

  const pathStyle: React.CSSProperties = useMemo(
    () => ({ ...style, fill: "none", stroke: color }),
    [style, color]
  );

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        style={pathStyle}
        className={isAnimated ? "animated" : undefined}
      />
      {label && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              pointerEvents: "all",
              padding: "2px 4px",
              borderRadius: 3,
              fontSize: 11,
              fontWeight: 600,
              color: (labelStyle?.fill as string) ?? color,
              background: "white",
              opacity: (labelBgStyle?.fillOpacity as number) ?? 0.85,
              whiteSpace: "nowrap",
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

export default memo(ElkEdge);
