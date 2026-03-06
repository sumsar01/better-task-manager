"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps, type Node } from "@xyflow/react";
import type { TaskGroupNodeData } from "@/lib/buildGraph";
import {
  GROUP_WIDTH,
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
  const { subtaskCount } = data;

  const totalWidth = GROUP_WIDTH;
  const totalHeight = groupHeight(subtaskCount);

  return (
    <>
      {/* Target handle at the top of the group — dependency edges enter here */}
      <Handle type="target" position={Position.Top} className="!bg-slate-300 !w-2 !h-2 !border-white !border-2" />

      <div
        style={{ width: totalWidth, height: totalHeight }}
        className="relative rounded-[14px] border border-dashed border-slate-300/50 bg-white/70"
      />

      {/* Source handle at the bottom of the group — dependency edges exit here,
          below all sub-tasks, so they never visually pass through the group */}
      <Handle type="source" position={Position.Bottom} className="!bg-slate-300 !w-2 !h-2 !border-white !border-2" />
    </>
  );
}

export default memo(TaskGroupNode);
