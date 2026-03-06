"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps, type Node } from "@xyflow/react";
import type { TaskGroupNodeData } from "@/lib/buildGraph";
import {
  GROUP_PADDING_TOP,
  GROUP_LEFT_INDENT,
  NODE_HEIGHT,
  SUBTASK_NODE_HEIGHT,
  GROUP_INNER_GAP,
  groupWidth,
  groupHeight,
} from "@/lib/buildGraph";

type TaskGroupNodeType = Node<TaskGroupNodeData, "taskGroupNode">;

/**
 * Transparent container node that visually groups a parent task and its subtasks.
 *
 * Renders an SVG bracket: a vertical line on the left that branches out
 * with a curved arrow to each subtask row — matching the design in Image 1.
 */
function TaskGroupNode({ data }: NodeProps<TaskGroupNodeType>) {
  const { subtaskOffsets, subtaskCount } = data;

  const totalWidth = groupWidth();
  const totalHeight = groupHeight(subtaskCount);

  // Bracket coordinates (relative to group container top-left)
  const bracketX = GROUP_LEFT_INDENT - 10;
  const lineStartY = GROUP_PADDING_TOP + NODE_HEIGHT + GROUP_INNER_GAP / 2;
  const lastSubtaskMidY = subtaskCount > 0
    ? subtaskOffsets[subtaskCount - 1] + SUBTASK_NODE_HEIGHT / 2
    : lineStartY;

  return (
    <>
      {/* Target handle at the top of the group — dependency edges enter here */}
      <Handle type="target" position={Position.Top} className="!bg-slate-300 !w-2 !h-2 !border-white !border-2" />

      <div
        style={{ width: totalWidth, height: totalHeight }}
        className="relative"
      >
        {/* SVG bracket + arrows */}
        <svg
          className="absolute inset-0 pointer-events-none overflow-visible"
          width={totalWidth}
          height={totalHeight}
        >
          {/* Vertical trunk line */}
          {subtaskCount > 0 && (
            <line
              x1={bracketX}
              y1={lineStartY}
              x2={bracketX}
              y2={lastSubtaskMidY}
              stroke="#94a3b8"
              strokeWidth={1.5}
            />
          )}

          {/* Curved branch + arrowhead for each subtask */}
          {subtaskOffsets.map((offsetY, i) => {
            const midY = offsetY + SUBTASK_NODE_HEIGHT / 2;
            // Curved path: starts at (bracketX, midY), curves right to the subtask node left edge
            const arrowEndX = GROUP_LEFT_INDENT - 2;
            const curveControlX = bracketX + 12;
            const d = `M ${bracketX} ${midY} Q ${curveControlX} ${midY} ${arrowEndX} ${midY}`;
            return (
              <g key={i}>
                <path
                  d={d}
                  stroke="#94a3b8"
                  strokeWidth={1.5}
                  fill="none"
                />
                {/* Arrowhead triangle */}
                <polygon
                  points={`${arrowEndX},${midY - 4} ${arrowEndX + 7},${midY} ${arrowEndX},${midY + 4}`}
                  fill="#94a3b8"
                />
              </g>
            );
          })}
        </svg>
      </div>

      {/* Source handle at the bottom of the group — dependency edges exit here,
          below all sub-tasks, so they never visually pass through the group */}
      <Handle type="source" position={Position.Bottom} className="!bg-slate-300 !w-2 !h-2 !border-white !border-2" />
    </>
  );
}

export default memo(TaskGroupNode);
