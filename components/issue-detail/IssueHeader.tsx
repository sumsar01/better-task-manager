"use client";

import { StatusBadge } from "./StatusBadge";
import { SkeletonLine } from "./PanelSkeleton";
import type { IssueDetail, IssueDetailPanelProps } from "./types";

type HeaderProps = Pick<IssueDetailPanelProps, "issueKey" | "jiraBaseUrl" | "onClose"> & {
  f: IssueDetail["fields"] | undefined;
  loading: boolean;
};

export default function IssueHeader({ issueKey, jiraBaseUrl, onClose, f, loading }: HeaderProps) {
  return (
    <div className="px-5 pt-5 pb-4 border-b border-slate-200 dark:border-slate-700/80 shrink-0 bg-white dark:bg-slate-900">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          {/* Issue key + type */}
          <div className="flex items-center gap-2 mb-2.5 flex-wrap">
            <a
              href={`${jiraBaseUrl}/browse/${issueKey}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs font-mono font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800/60 px-2.5 py-1 rounded-lg hover:bg-indigo-100 dark:hover:bg-indigo-900/60 transition-colors"
            >
              {issueKey}
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <path d="M2 8L8 2M8 2H4M8 2v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </a>
            {f && (
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-2.5 py-1 rounded-lg">
                {f.issuetype.name}
              </span>
            )}
          </div>
          {/* Summary */}
          {f && (
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 leading-snug">
              {f.summary}
            </h2>
          )}
          {loading && !f && (
            <div className="space-y-2 mt-1">
              <SkeletonLine w="1/3" h="3" />
              <SkeletonLine w="4/5" h="5" />
            </div>
          )}
        </div>
        {/* Close button */}
        <button
          onClick={onClose}
          aria-label="Close panel"
          className="shrink-0 w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </div>
  );
}

export { StatusBadge };
