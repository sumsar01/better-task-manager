"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import GraphView from "@/components/GraphView";
import IssueDetailPanel from "@/components/IssueDetailPanel";
import type { JiraIssue } from "@/lib/jira";

const POLL_INTERVAL_MS = 30_000;
const JIRA_BASE_URL = process.env.NEXT_PUBLIC_JIRA_BASE_URL ?? "";

function useSecondsTick(enabled: boolean) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    setSeconds(0);
    const id = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [enabled]);
  return seconds;
}

function LiveBadge({ seconds }: { seconds: number }) {
  const label =
    seconds < 5 ? "just now" : seconds < 60 ? `${seconds}s ago` : `${Math.floor(seconds / 60)}m ago`;
  return (
    <span className="ml-auto flex items-center gap-1.5 bg-green-50 border border-green-200 text-green-700 text-[11px] font-medium px-2.5 py-1 rounded-full">
      <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
      {label}
    </span>
  );
}

export default function GraphPage() {
  const { epicKey } = useParams<{ epicKey: string }>();
  const router = useRouter();

  const [issues, setIssues] = useState<JiraIssue[]>([]);
  const [latestIssues, setLatestIssues] = useState<JiraIssue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const isMountedRef = useRef(true);
  const hasLoadedRef = useRef(false);

  const secondsSince = useSecondsTick(lastUpdated !== null);

  const handleNodeSelect = useCallback((key: string | null) => {
    setSelectedKey(key);
  }, []);

  const fetchIssues = useCallback(async (epic: string): Promise<JiraIssue[]> => {
    const r = await fetch(`/api/jira/issues?epic=${encodeURIComponent(epic)}`);
    if (!r.ok) throw new Error(`Failed to load issues (${r.status})`);
    return r.json();
  }, []);

  useEffect(() => {
    if (!epicKey) return;
    isMountedRef.current = true;
    hasLoadedRef.current = false;

    setLoading(true);
    fetchIssues(epicKey)
      .then((data) => {
        if (!isMountedRef.current) return;
        setIssues(data);
        setLatestIssues(data);
        setLastUpdated(new Date());
        hasLoadedRef.current = true;
      })
      .catch((e: Error) => {
        if (!isMountedRef.current) return;
        setError(e.message);
      })
      .finally(() => {
        if (isMountedRef.current) setLoading(false);
      });

    return () => {
      isMountedRef.current = false;
    };
  }, [epicKey, fetchIssues]);

  useEffect(() => {
    if (!epicKey || error) return;

    const id = setInterval(async () => {
      if (!hasLoadedRef.current) return;
      try {
        const data = await fetchIssues(epicKey);
        if (!isMountedRef.current) return;
        setLatestIssues(data);
        setLastUpdated(new Date());
      } catch {
        // Silently swallow polling errors
      }
    }, POLL_INTERVAL_MS);

    return () => clearInterval(id);
  }, [epicKey, error, fetchIssues]);

  return (
    <div className="flex flex-col h-screen bg-slate-50">
      {/* Header */}
      <header className="flex items-center gap-3 px-5 py-0 h-14 bg-white border-b border-slate-200/80 shrink-0 shadow-sm shadow-slate-100">
        {/* Back */}
        <button
          onClick={() => router.push("/")}
          className="flex items-center gap-1.5 text-slate-400 hover:text-slate-800 transition-colors text-sm font-medium group"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="transition-transform group-hover:-translate-x-0.5">
            <path d="M10 12L6 8l4-4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Back
        </button>

        {/* Divider */}
        <div className="w-px h-5 bg-slate-200" />

        {/* App name */}
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-indigo-600 flex items-center justify-center">
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

        {/* Divider */}
        <div className="w-px h-5 bg-slate-200" />

        {/* Epic chip */}
        <span className="text-[11px] font-mono font-semibold text-indigo-600 bg-indigo-50 border border-indigo-100 px-2.5 py-1 rounded-full">
          {epicKey}
        </span>

        {/* Issue count */}
        {!loading && !error && issues.length > 0 && (
          <span className="text-[11px] text-slate-400 font-medium">
            {issues.length} issue{issues.length !== 1 ? "s" : ""}
          </span>
        )}

        {/* Live badge */}
        {!loading && !error && issues.length > 0 && (
          <LiveBadge seconds={secondsSince} />
        )}
      </header>

      {/* Graph + panel */}
      <div className="flex flex-1 min-h-0 relative">
        {/* Graph */}
        <div className={`relative ${selectedKey ? "w-[75%]" : "w-full"} transition-all duration-200`}>
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-slate-50">
              <div className="flex flex-col items-center gap-4">
                <div className="relative w-10 h-10">
                  <div className="absolute inset-0 rounded-full border-2 border-indigo-100" />
                  <div className="absolute inset-0 rounded-full border-2 border-indigo-600 border-t-transparent animate-spin" />
                </div>
                <p className="text-sm text-slate-400 font-medium">Loading issues…</p>
              </div>
            </div>
          )}

          {error && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="bg-white border border-red-200 rounded-2xl px-8 py-6 max-w-sm text-center shadow-lg">
                <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-3">
                  <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                    <path d="M9 6v4M9 12.5v.5" stroke="#dc2626" strokeWidth="2" strokeLinecap="round" />
                    <circle cx="9" cy="9" r="7.5" stroke="#dc2626" strokeWidth="1.5" />
                  </svg>
                </div>
                <p className="font-semibold text-sm text-slate-800 mb-1">Failed to load issues</p>
                <p className="text-xs text-slate-500 mb-4">{error}</p>
                <button
                  onClick={() => router.push("/")}
                  className="text-xs font-medium text-indigo-600 hover:underline cursor-pointer"
                >
                  Go back and try again
                </button>
              </div>
            </div>
          )}

          {!loading && !error && issues.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center">
                <p className="text-slate-400 text-sm">No issues found for this epic.</p>
                <button onClick={() => router.push("/")} className="mt-2 text-xs text-indigo-500 hover:underline cursor-pointer">
                  Go back
                </button>
              </div>
            </div>
          )}

          {!loading && !error && issues.length > 0 && (
            <GraphView
              issues={issues}
              latestIssues={latestIssues}
              onNodeSelect={handleNodeSelect}
            />
          )}
        </div>

        {/* Detail panel */}
        {selectedKey && (
          <div className="w-[25%] h-full border-l border-slate-200 shrink-0 shadow-[-4px_0_24px_rgba(0,0,0,0.04)]">
            <IssueDetailPanel
              issueKey={selectedKey}
              jiraBaseUrl={JIRA_BASE_URL}
              onClose={() => setSelectedKey(null)}
              onNavigate={(key) => setSelectedKey(key)}
            />
          </div>
        )}
      </div>
    </div>
  );
}
