"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps, type Node } from "@xyflow/react";
import type { EpicGroupNodeData } from "@/lib/buildGraph";
import { UNASSIGNED_EPIC_KEY } from "@/lib/buildGraph";

type EpicGroupNodeType = Node<EpicGroupNodeData, "epicGroupNode">;

/**
 * Container node that visually groups all tasks belonging to an epic.
 *
 * Renders a rounded rectangle with:
 * - A coloured header bar showing the epic key + summary
 * - A light tinted background matching the epic colour
 * - Source/Target handles for cross-epic dependency edges
 */
function EpicGroupNode({ data, width, height }: NodeProps<EpicGroupNodeType>) {
  const { epicKey, epicSummary, color } = data;
  const isUnassigned = epicKey === UNASSIGNED_EPIC_KEY;

  const containerWidth = (width as number | undefined) ?? 320;
  const containerHeight = (height as number | undefined) ?? 200;

  return (
    <>
      {/* Target handle — cross-epic dependency edges enter here */}
      <Handle
        type="target"
        position={Position.Top}
        className="!bg-white !w-3 !h-3 !border-2"
        style={{ borderColor: color.border }}
      />

      <div
        style={{
          width: containerWidth,
          height: containerHeight,
          background: color.tint,
          border: `1.5px solid ${color.border}`,
          borderRadius: 12,
          overflow: "visible",
          position: "relative",
        }}
      >
        {/* Header bar */}
        <div
          style={{
            background: color.header,
            borderRadius: "10px 10px 0 0",
            padding: "8px 14px",
            display: "flex",
            alignItems: "center",
            gap: 8,
            minHeight: 36,
          }}
        >
          {!isUnassigned && (
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: color.text,
                opacity: 0.85,
                letterSpacing: "0.04em",
                textTransform: "uppercase",
                whiteSpace: "nowrap",
              }}
            >
              {epicKey}
            </span>
          )}
          <span
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: color.text,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              flex: 1,
            }}
            title={epicSummary}
          >
            {epicSummary}
          </span>
        </div>
      </div>

      {/* Source handle — cross-epic dependency edges exit here */}
      <Handle
        type="source"
        position={Position.Bottom}
        className="!bg-white !w-3 !h-3 !border-2"
        style={{ borderColor: color.border }}
      />
    </>
  );
}

export default memo(EpicGroupNode);
