"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps, type Node } from "@xyflow/react";
import type { IssueNodeData } from "@/lib/buildGraph";

const ISSUE_TYPE_LABEL: Record<string, { short: string; color: string; bg: string }> = {
  Story:   { short: "Story",   color: "#7c3aed", bg: "#ede9fe" },
  Bug:     { short: "Bug",     color: "#dc2626", bg: "#fee2e2" },
  Task:    { short: "Task",    color: "#0369a1", bg: "#e0f2fe" },
  Subtask: { short: "Sub",     color: "#0369a1", bg: "#e0f2fe" },
  Epic:    { short: "Epic",    color: "#d97706", bg: "#fef3c7" },
};

function avatarInitials(name: string): string {
  return name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

type IssueNodeType = Node<IssueNodeData, "issueNode">;

function IssueNode({ data, selected }: NodeProps<IssueNodeType>) {
  // Standalone epic nodes are wider + amber-bordered to stand out from task nodes.
  const borderColor = data.isEpicStandalone ? "#fbbf24" : data.bgColor;

  // ── Compact chip for subtask nodes ───────────────────────────────────────
  // Subtasks show only the title. The left border color communicates status.
  if (data.isSubtask) {
    return (
      <div
        style={{
          borderLeft: `4px solid ${borderColor}`,
          width: 220,
          boxShadow: selected
            ? `0 0 0 2px #6366f1, 0 4px 16px rgba(99,102,241,0.18), 0 1px 4px rgba(0,0,0,0.08)`
            : "0 1px 3px rgba(0,0,0,0.07), 0 4px 10px rgba(0,0,0,0.05)",
        }}
        className="bg-white rounded-lg overflow-hidden transition-[box-shadow,border-color,opacity,transform] duration-150 border border-slate-200/80 cursor-pointer hover:-translate-y-0.5 hover:shadow-[0_0_0_2px_#a5b4fc,_0_6px_16px_rgba(99,102,241,0.12)] hover:border-indigo-200/80 px-2.5 py-1.5"
      >
        <div className="text-[12px] font-medium text-slate-800 leading-snug line-clamp-2">
          {data.summary}
        </div>
      </div>
    );
  }

  // ── Full card for regular task / epic nodes ───────────────────────────────
  const typeInfo = ISSUE_TYPE_LABEL[data.issueType] ?? { short: data.issueType, color: "#64748b", bg: "#f1f5f9" };
  const width = data.isEpicStandalone ? 320 : 280;
  const cardBg = data.isEpicStandalone ? "bg-amber-50/40" : "bg-white";

  return (
    <>
      {/* Only render handles for nodes that are NOT inside a group container.
          Grouped nodes (parent tasks + their subtasks) use the group container's
          handles so dependency edges enter/exit at the true top/bottom of the
          group, never passing through the sub-task area. */}
      {!data.insideGroup && (
        <Handle type="target" position={Position.Top} className="!bg-slate-300 !w-2 !h-2 !border-white !border-2" />
      )}

      <div
        style={{
          borderLeft: `4px solid ${borderColor}`,
          width,
          boxShadow: selected
            ? `0 0 0 2px #6366f1, 0 4px 20px rgba(99,102,241,0.18), 0 1px 4px rgba(0,0,0,0.08)`
            : "0 1px 3px rgba(0,0,0,0.07), 0 4px 12px rgba(0,0,0,0.06)",
        }}
        className={`${cardBg} rounded-xl flex flex-col overflow-hidden transition-[box-shadow,border-color,opacity,transform] duration-150 border border-slate-200/80 cursor-pointer hover:-translate-y-0.5 hover:shadow-[0_0_0_2px_#a5b4fc,_0_6px_20px_rgba(99,102,241,0.15),_0_1px_4px_rgba(0,0,0,0.08)] hover:border-indigo-200/80`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-3 pt-2.5 pb-1.5 gap-2">
          {/* Type pill */}
          <span
            className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md tracking-wide"
            style={{ color: typeInfo.color, background: typeInfo.bg }}
          >
            {typeInfo.short}
          </span>
          {/* Issue key */}
          <span className="text-[11px] font-mono font-semibold text-slate-400 shrink-0">
            {data.key}
          </span>
        </div>

        {/* Summary */}
        <div className="px-3 pb-2 text-[13px] font-medium text-slate-800 leading-snug line-clamp-2">
          {data.summary}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-3 pb-2.5 gap-2 mt-auto">
          {/* Status */}
          <span
            className="text-[10px] font-semibold flex items-center gap-1"
            style={{ color: data.textColor }}
          >
            <span
              className="inline-block w-1.5 h-1.5 rounded-full"
              style={{ background: data.bgColor }}
            />
            {data.statusName}
          </span>

          <div className="flex items-center gap-1.5 ml-auto">
            {/* Subtask count badge */}
            {data.subtaskCount != null && data.subtaskCount > 0 && (
              <span
                className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md tracking-wide flex items-center gap-0.5"
                style={{ color: "#0369a1", background: "#e0f2fe" }}
                title={`${data.subtaskCount} subtask${data.subtaskCount === 1 ? "" : "s"}`}
              >
                ↳ {data.subtaskCount}
              </span>
            )}

            {/* Assignee avatar */}
            {data.assignee && (
              <span
                className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white shrink-0"
                style={{ background: "#6366f1" }}
                title={data.assignee}
              >
                {avatarInitials(data.assignee)}
              </span>
            )}
          </div>
        </div>
      </div>

      {!data.insideGroup && (
        <Handle type="source" position={Position.Bottom} className="!bg-slate-300 !w-2 !h-2 !border-white !border-2" />
      )}
    </>
  );
}

export default memo(IssueNode);
