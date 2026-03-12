"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import GraphView from "@/components/GraphView";
import BeadsIssueDetailPanel from "@/components/BeadsIssueDetailPanel";
import {
  GraphLoadingState,
  GraphErrorState,
  GraphEmptyState,
} from "@/components/GraphStates";
import type { JiraIssue } from "@/lib/jira";

export default function BeadsGraphPage() {
  const { repoSlug } = useParams<{ repoSlug: string }>();
  const router = useRouter();

  const [issues, setIssues] = useState<JiraIssue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const isMountedRef = useRef(true);
  const abortRef = useRef<AbortController | null>(null);

  const handleNodeSelect = useCallback((key: string | null) => {
    setSelectedKey(key);
  }, []);

  const fetchIssues = useCallback(async (slug: string) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);
    setIssues([]);

    try {
      const res = await fetch(
        `/api/beads/issues?repo=${encodeURIComponent(slug)}`,
        { signal: controller.signal },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` })) as { error?: string };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const data = await res.json() as JiraIssue[];
      if (!isMountedRef.current) return;
      setIssues(data);
    } catch (err) {
      if (!isMountedRef.current) return;
      if (err instanceof Error && err.name === "AbortError") return;
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      if (isMountedRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!repoSlug) return;
    isMountedRef.current = true;
    void fetchIssues(repoSlug);
    return () => {
      isMountedRef.current = false;
      abortRef.current?.abort();
    };
  }, [repoSlug, fetchIssues]);

  // Beads issue detail: show a simple side panel with the raw issue data.
  // We don't have a Jira-style detail API for beads, so we show the info
  // we already have in the node's data by finding the issue by key.
  const selectedIssue = selectedKey ? issues.find((i) => i.key === selectedKey) : null;

  return (
    <div className="flex flex-col h-screen bg-slate-50">
      {/* Header */}
      <header className="flex items-center gap-3 px-5 py-0 h-14 bg-white border-b border-slate-200/80 shrink-0 shadow-sm shadow-slate-100">
        {/* Back */}
        <button
          onClick={() => router.push("/beads")}
          className="flex items-center gap-1.5 text-slate-400 hover:text-slate-800 transition-colors text-sm font-medium group"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="transition-transform group-hover:-translate-x-0.5">
            <path d="M10 12L6 8l4-4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Back
        </button>

        <div className="w-px h-5 bg-slate-200" />

        {/* App name */}
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-violet-600 flex items-center justify-center">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <circle cx="3" cy="3" r="1.5" fill="white" />
              <circle cx="9" cy="3" r="1.5" fill="white" fillOpacity="0.6" />
              <circle cx="6" cy="9" r="1.5" fill="white" fillOpacity="0.8" />
              <line x1="3" y1="3" x2="6" y2="9" stroke="white" strokeWidth="1.2" strokeOpacity="0.7" />
              <line x1="9" y1="3" x2="6" y2="9" stroke="white" strokeWidth="1.2" strokeOpacity="0.7" />
            </svg>
          </div>
          <span className="text-sm font-semibold text-slate-800">TaskGraph</span>
        </div>

        <div className="w-px h-5 bg-slate-200" />

        {/* Repo chip */}
        <span className="text-[11px] font-mono font-semibold text-violet-600 bg-violet-50 border border-violet-100 px-2.5 py-1 rounded-full">
          {repoSlug}
        </span>

        <span className="text-[11px] text-slate-400 font-medium">beads</span>

        {/* Issue count */}
        {!loading && !error && issues.length > 0 && (
          <span className="text-[11px] text-slate-400 font-medium">
            · {issues.length} issue{issues.length !== 1 ? "s" : ""}
          </span>
        )}

        {/* Refresh button */}
        {!loading && (
          <button
            onClick={() => void fetchIssues(repoSlug)}
            className="ml-auto flex items-center gap-1.5 text-slate-400 hover:text-slate-700 transition-colors text-[11px] font-medium px-2.5 py-1 rounded-lg hover:bg-slate-100 cursor-pointer"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M10 6A4 4 0 1 1 6 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              <path d="M6 0l2 2-2 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Refresh
          </button>
        )}
      </header>

      {/* Graph + panel */}
      <div className="flex flex-1 min-h-0 relative">
        {/* Graph area */}
        <div className={`relative ${selectedKey ? "w-[75%]" : "w-full"} transition-[width] duration-200`}>
          {loading && (
            <GraphLoadingState label="Loading issues…" accentColor="violet" />
          )}

          {error && (
            <GraphErrorState
              message={error}
              heading="Failed to load issues"
              backHref="/beads"
              accentColor="violet"
            />
          )}

          {!loading && !error && issues.length === 0 && (
            <GraphEmptyState
              message="No open issues found in this repo."
              backHref="/beads"
              accentColor="violet"
            />
          )}

          {!loading && !error && issues.length > 0 && (
            <GraphView
              issues={issues}
              latestIssues={issues}
              onNodeSelect={handleNodeSelect}
              selectedKey={selectedKey}
            />
          )}
        </div>

        {/* Detail panel */}
        {selectedKey && selectedIssue && (
          <BeadsIssueDetailPanel
            issue={selectedIssue}
            allIssues={issues}
            onClose={() => setSelectedKey(null)}
            onSelectKey={setSelectedKey}
          />
        )}
      </div>
    </div>
  );
}
