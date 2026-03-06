"use client";

import { memo } from "react";
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
 * obstacle-aware orthogonal routing.
 *
 * ELK computes the full path including start/end points and all bend points,
 * which are stored on edge.data.bendPoints after layout. This renderer
 * converts those points into an SVG polyline path.
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

  // Build an SVG path from the bend points returned by ELK.
  // ELK gives us startPoint + bendPoints + endPoint in absolute canvas coords.
  // The first and last points are the connection points on the node borders.
  let edgePath: string;
  let labelX: number;
  let labelY: number;

  if (bendPoints && bendPoints.length >= 2) {
    // Polyline path: M start L p1 L p2 ... L end
    const [first, ...rest] = bendPoints;
    edgePath = `M ${first.x} ${first.y} ` + rest.map((p) => `L ${p.x} ${p.y}`).join(" ");

    // Place label at the midpoint of the path (midpoint of middle segment)
    const midIdx = Math.floor(bendPoints.length / 2);
    const a = bendPoints[midIdx - 1] ?? bendPoints[0];
    const b = bendPoints[midIdx] ?? bendPoints[bendPoints.length - 1];
    labelX = (a.x + b.x) / 2;
    labelY = (a.y + b.y) / 2;
  } else {
    // Fallback: straight line
    edgePath = `M ${sourceX} ${sourceY} L ${targetX} ${targetY}`;
    labelX = (sourceX + targetX) / 2;
    labelY = (sourceY + targetY) / 2;
  }

  // Animated dashed stroke for "blocks" edges
  const strokeDasharray = style?.strokeDasharray as string | undefined;
  const isAnimated = animated === true;

  const pathStyle: React.CSSProperties = {
    ...style,
    fill: "none",
    stroke: color,
  };

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
              ...(strokeDasharray ? {} : {}),
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
