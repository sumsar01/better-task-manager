"use client";

import Avatar from "./Avatar";
import { StatusBadge, SectionHeader, Section } from "./StatusBadge";
import { PRIORITY_STYLES } from "./tokens";
import type { IssueDetail } from "./types";

interface IssueMetadataProps {
  f: IssueDetail["fields"];
  storyPoints: number | null | undefined;
}

export default function IssueMetadata({ f, storyPoints }: IssueMetadataProps) {
  const priorityStyle = f.priority ? (PRIORITY_STYLES[f.priority.name] ?? null) : null;

  return (
    <>
      {/* Meta grid */}
      <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80 rounded-xl p-4 mt-4 grid grid-cols-2 gap-x-4 gap-y-4">
        {/* Status */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">Status</p>
          <StatusBadge status={f.status} />
        </div>

        {/* Assignee */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">Assignee</p>
          {f.assignee ? (
            <div className="flex items-center gap-1.5">
              <Avatar name={f.assignee.displayName} size="sm" />
              <span className="text-sm text-slate-700 dark:text-slate-300 font-medium truncate">{f.assignee.displayName}</span>
            </div>
          ) : (
            <span className="text-sm text-slate-400 dark:text-slate-500 italic">Unassigned</span>
          )}
        </div>

        {/* Priority */}
        {f.priority && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">Priority</p>
            <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border dark:bg-slate-700/50 dark:border-slate-600/50 dark:text-slate-200 ${priorityStyle?.color ?? "text-slate-600"} ${priorityStyle?.bg ?? "bg-slate-100"} ${priorityStyle?.border ?? "border-slate-200"}`}>
              <span className="font-bold">{priorityStyle?.icon ?? ""}</span>
              {f.priority.name}
            </span>
          </div>
        )}

        {/* Story points */}
        {storyPoints != null && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">Points</p>
            <span className="inline-flex items-center text-sm font-bold text-violet-700 dark:text-violet-300 bg-violet-50 dark:bg-violet-900/40 border border-violet-200 dark:border-violet-700/60 px-2.5 py-1 rounded-lg">
              {storyPoints} pts
            </span>
          </div>
        )}
      </div>

      {/* Labels */}
      {f.labels && f.labels.length > 0 && (
        <Section>
          <SectionHeader title="Labels" />
          <div className="flex flex-wrap gap-2">
            {f.labels.map((l) => (
              <span key={l} className="text-xs font-medium text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 px-2.5 py-1 rounded-full">
                {l}
              </span>
            ))}
          </div>
        </Section>
      )}
    </>
  );
}
