"use client";

import { useEffect, useState } from "react";
import IssueHeader from "./IssueHeader";
import IssueMetadata from "./IssueMetadata";
import IssueRelations from "./IssueRelations";
import IssueDescription from "./IssueDescription";
import IssueComments from "./IssueComments";
import PanelSkeleton from "./PanelSkeleton";
import type { IssueDetail, IssueDetailPanelProps } from "./types";

const MAX_DISPLAYED_COMMENTS = 20;

export default function IssueDetailPanel({
  issueKey,
  jiraBaseUrl,
  onClose,
  onNavigate,
}: IssueDetailPanelProps) {
  const [issue, setIssue] = useState<IssueDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    // Reset state before fetch (safe: triggered by issueKey change only)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError(null);
    setIssue(null);

    fetch(`/api/jira/issue/${encodeURIComponent(issueKey)}`)
      .then(async (r) => {
        if (!r.ok) {
          const j = await r.json().catch(() => ({}));
          throw new Error((j as { error?: string }).error ?? `HTTP ${r.status}`);
        }
        return r.json() as Promise<IssueDetail>;
      })
      .then((data) => { if (!cancelled) setIssue(data); })
      .catch((e: Error) => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [issueKey]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const f = issue?.fields;
  const storyPoints = f?.customfield_10028 ?? f?.customfield_10016 ?? null;
  const comments = f?.comment?.comments?.slice(-MAX_DISPLAYED_COMMENTS) ?? [];

  return (
    <aside
      className="flex flex-col h-full w-full bg-white dark:bg-slate-900 overflow-hidden"
    >
      <IssueHeader
        issueKey={issueKey}
        jiraBaseUrl={jiraBaseUrl}
        onClose={onClose}
        f={f}
        loading={loading}
      />

      <div className="flex-1 overflow-y-auto">
        {loading && <PanelSkeleton />}

        {error && (
          <div className="mx-5 mt-5 bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-800/60 rounded-xl px-4 py-3">
            <p className="text-sm font-semibold text-red-700 dark:text-red-400 mb-0.5">Failed to load issue</p>
            <p className="text-sm text-red-600 dark:text-red-500">{error}</p>
          </div>
        )}

        {!loading && !error && f && (
          <div className="px-5 pb-10 space-y-5">
            <IssueMetadata f={f} storyPoints={storyPoints} />
            <IssueRelations f={f} onNavigate={onNavigate} />
            <IssueDescription description={f.description} />
            <IssueComments comments={comments} />
          </div>
        )}
      </div>
    </aside>
  );
}
