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

  const { edgePath, labelX, labelY } = useMemo(() => {
    if (bendPoints && bendPoints.length >= 2) {
      const [first, ...rest] = bendPoints;
      const path = `M ${first.x} ${first.y} ` + rest.map((p) => `L ${p.x} ${p.y}`).join(" ");
      const midIdx = Math.floor(bendPoints.length / 2);
      const a = bendPoints[midIdx - 1] ?? bendPoints[0];
      const b = bendPoints[midIdx] ?? bendPoints[bendPoints.length - 1];
      return { edgePath: path, labelX: (a.x + b.x) / 2, labelY: (a.y + b.y) / 2 };
    }
    return {
      edgePath: `M ${sourceX} ${sourceY} L ${targetX} ${targetY}`,
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
