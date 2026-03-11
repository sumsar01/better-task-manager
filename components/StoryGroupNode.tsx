"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps, type Node } from "@xyflow/react";
import type { StoryGroupNodeData } from "@/lib/buildGraph";

type StoryGroupNodeType = Node<StoryGroupNodeData, "storyGroupNode">;

// Story accent color: violet
const STORY_BORDER = "#7c3aed";
const STORY_TINT = "rgba(124,58,237,0.05)";
const STORY_HEADER_TEXT = "#5b21b6";

/**
 * Container node that visually groups all tasks belonging to a story.
 *
 * Renders a rounded rectangle with:
 * - A subtle violet border and lightly tinted background
 * - A compact header row showing the story key + summary in violet
 * - Source/Target handles for cross-story dependency edges
 *
 * Intentionally lighter than EpicGroupNode to reflect the hierarchy:
 *   Epic (bold colored header) > Story (subtle border + label) > Task
 */
function StoryGroupNode({ data, width, height }: NodeProps<StoryGroupNodeType>) {
  const { storyKey, storySummary } = data;

  const containerWidth = (width as number | undefined) ?? 320;
  const containerHeight = (height as number | undefined) ?? 120;

  return (
    <>
      {/* Target handle — dependency edges enter here */}
      <Handle
        type="target"
        position={Position.Top}
        className="!bg-white !w-2.5 !h-2.5 !border-2"
        style={{ borderColor: STORY_BORDER }}
      />

      <div
        style={{
          width: containerWidth,
          height: containerHeight,
          background: STORY_TINT,
          border: `1.5px solid ${STORY_BORDER}`,
          borderRadius: 8,
          overflow: "visible",
          position: "relative",
        }}
      >
        {/* Header row */}
        <div
          style={{
            padding: "6px 12px 4px",
            display: "flex",
            alignItems: "center",
            gap: 6,
            borderBottom: `1px solid rgba(124,58,237,0.15)`,
            minHeight: 28,
          }}
        >
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              color: STORY_BORDER,
              opacity: 0.8,
              letterSpacing: "0.05em",
              textTransform: "uppercase",
              whiteSpace: "nowrap",
            }}
          >
            {storyKey}
          </span>
          <span
            style={{
              fontSize: 12,
              fontWeight: 500,
              color: STORY_HEADER_TEXT,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              flex: 1,
            }}
            title={storySummary}
          >
            {storySummary}
          </span>
        </div>
      </div>

      {/* Source handle — dependency edges exit here */}
      <Handle
        type="source"
        position={Position.Bottom}
        className="!bg-white !w-2.5 !h-2.5 !border-2"
        style={{ borderColor: STORY_BORDER }}
      />
    </>
  );
}

export default memo(StoryGroupNode);
