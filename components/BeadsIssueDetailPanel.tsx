"use client";

import type { JiraIssue } from "@/lib/jira";

interface BeadsIssueDetailPanelProps {
  issue: JiraIssue;
  allIssues: JiraIssue[];
  onClose: () => void;
  onSelectKey: (key: string) => void;
}

/**
 * Side panel showing beads issue details.
 * Rendered when a node is selected on the beads graph page.
 * Uses data already loaded in the issues list — no additional API call needed.
 */
export default function BeadsIssueDetailPanel({
  issue,
  allIssues,
  onClose,
  onSelectKey,
}: BeadsIssueDetailPanelProps) {
  return (
    <div className="w-[25%] h-full border-l border-slate-200 shrink-0 shadow-[-4px_0_24px_rgba(0,0,0,0.04)] bg-white flex flex-col">
      {/* Panel header */}
      <div className="flex items-start justify-between gap-2 px-5 py-4 border-b border-slate-100">
        <div className="flex flex-col gap-1 min-w-0">
          <span className="text-[11px] font-mono font-semibold text-violet-600 bg-violet-50 border border-violet-100 px-2 py-0.5 rounded-full w-fit">
            {issue.key}
          </span>
          <h2 className="text-sm font-semibold text-slate-900 leading-snug">
            {issue.fields.summary}
          </h2>
        </div>
        <button
          onClick={onClose}
          className="shrink-0 p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
          aria-label="Close panel"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {/* Panel body */}
      <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-4">
        {/* Status */}
        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Status</span>
          <span className="text-xs font-medium text-slate-700">
            {issue.fields.status.name}
          </span>
        </div>

        {/* Type */}
        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Type</span>
          <span className="text-xs font-medium text-slate-700">
            {issue.fields.issuetype.id}
          </span>
        </div>

        {/* Priority */}
        {issue.fields.priority && (
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Priority</span>
            <span className="text-xs font-medium text-slate-700">
              {issue.fields.priority.name}
            </span>
          </div>
        )}

        {/* Assignee */}
        {issue.fields.assignee && (
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Assignee</span>
            <span className="text-xs font-medium text-slate-700">
              {issue.fields.assignee.displayName}
            </span>
          </div>
        )}

        {/* Blocks */}
        {issue.fields.issuelinks.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Blocks</span>
            <div className="flex flex-col gap-1">
              {issue.fields.issuelinks.map((link) => {
                const target = link.outwardIssue;
                if (!target) return null;
                const targetIssue = allIssues.find((i) => i.key === target.key);
                return (
                  <button
                    key={link.id}
                    onClick={() => onSelectKey(target.key)}
                    className="text-left text-xs text-violet-600 hover:underline font-mono cursor-pointer"
                  >
                    {target.key}{targetIssue ? `: ${targetIssue.fields.summary}` : ""}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
