"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import GraphView from "@/components/GraphView";
import IssueDetailPanel from "@/components/IssueDetailPanel";
import type { JiraIssue } from "@/lib/jira";

const JIRA_BASE_URL = process.env.NEXT_PUBLIC_JIRA_BASE_URL ?? "";

// ── Types mirroring the server-side NDJSON messages ──────────────────────────

interface EpicsMessage {
  type: "epics";
  issues: JiraIssue[];
  total: number;
}

interface ChildrenMessage {
  type: "children";
  epicKey: string;
  issues: JiraIssue[];
  expanded: number;
  total: number;
}

interface ErrorMessage {
  type: "error";
  epicKey: string;
  error: string;
}

interface DoneMessage {
  type: "done";
}

type StreamMessage = EpicsMessage | ChildrenMessage | ErrorMessage | DoneMessage;

// ── Helpers ───────────────────────────────────────────────────────────────────

function dedupeByKey(issues: JiraIssue[]): JiraIssue[] {
  const seen = new Set<string>();
  return issues.filter((i) => {
    if (seen.has(i.key)) return false;
    seen.add(i.key);
    return true;
  });
}

function useSecondsTick(enabled: boolean) {
  const startRef = useRef<number | null>(null);
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    startRef.current = Date.now();
    const id = setInterval(() => {
      setSeconds(startRef.current !== null ? Math.floor((Date.now() - startRef.current) / 1000) : 0);
    }, 1000);
    return () => {
      clearInterval(id);
      startRef.current = null;
    };
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

// ── Main component ────────────────────────────────────────────────────────────

export default function ProjectGraphPage() {
  const { projectKey } = useParams<{ projectKey: string }>();
  const router = useRouter();

  // `issues` is only set once streaming is fully complete — GraphView must
  // receive a stable, final array so that buildGraph (which locks layoutDoneRef)
  // runs exactly once on the complete dataset rather than on a partial stream.
  const [issues, setIssues] = useState<JiraIssue[]>([]);
  const [loading, setLoading] = useState(true);
  // null = not yet streaming, object = streaming in progress
  const [expandProgress, setExpandProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const isMountedRef = useRef(true);
  const abortRef = useRef<AbortController | null>(null);
  // Accumulates issues during streaming — flushed to state on "done"
  const accIssuesRef = useRef<JiraIssue[]>([]);

  const secondsSince = useSecondsTick(lastUpdated !== null);

  const handleNodeSelect = useCallback((key: string | null) => {
    setSelectedKey(key);
  }, []);

  const streamIssues = useCallback(async (project: string) => {
    // Cancel any previous in-flight stream
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);
    setIssues([]);
    setExpandProgress(null);
    accIssuesRef.current = [];

    let fatalError = false;

    try {
      const res = await fetch(
        `/api/jira/issues/project?project=${encodeURIComponent(project)}`,
        { signal: controller.signal },
      );

      if (!res.ok || !res.body) {
        throw new Error(`Failed to load issues (${res.status})`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? ""; // keep any partial trailing line

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;

          let msg: StreamMessage;
          try {
            msg = JSON.parse(trimmed) as StreamMessage;
          } catch {
            console.warn("[project-stream] Failed to parse line:", trimmed);
            continue;
          }

          if (!isMountedRef.current) return;

          if (msg.type === "epics") {
            // Accumulate epics — do NOT push to state yet (GraphView would
            // run buildGraph on partial data and lock out further updates)
            accIssuesRef.current = dedupeByKey([...accIssuesRef.current, ...msg.issues]);
            setExpandProgress({ done: 0, total: msg.total });
          } else if (msg.type === "children") {
            accIssuesRef.current = dedupeByKey([...accIssuesRef.current, ...msg.issues]);
            setExpandProgress({ done: msg.expanded, total: msg.total });
          } else if (msg.type === "error") {
            if (msg.epicKey === "") {
              // Fatal top-level error (e.g. getEpics failed)
              fatalError = true;
              setError(msg.error);
              setLoading(false);
            }
            // Per-epic errors are non-fatal — the graph keeps building
          } else if (msg.type === "done") {
            if (!fatalError) {
              // Flush the complete accumulated set to state exactly once —
              // GraphView will run buildGraph on the full dataset
              setIssues(accIssuesRef.current);
              setLastUpdated(new Date());
              setExpandProgress(null);
              setLoading(false);
            }
          }
        }
      }
    } catch (err) {
      if (!isMountedRef.current) return;
      if (err instanceof Error && err.name === "AbortError") return; // navigation away
      setError(err instanceof Error ? err.message : "Unknown error");
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!projectKey) return;
    isMountedRef.current = true;

    void streamIssues(projectKey);

    return () => {
      isMountedRef.current = false;
      abortRef.current?.abort();
    };
  }, [projectKey, streamIssues]);

  // Derive latestIssues — for the project graph we just use current issues
  // (no background polling needed; user can navigate away and back to refresh)
  const latestIssues = issues;

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

        {/* Project chip */}
        <span className="text-[11px] font-mono font-semibold text-indigo-600 bg-indigo-50 border border-indigo-100 px-2.5 py-1 rounded-full">
          {projectKey}
        </span>

        {/* "All Epics" label */}
        <span className="text-[11px] text-slate-400 font-medium">All Epics</span>

        {/* Issue count */}
        {!loading && !error && expandProgress === null && issues.length > 0 && (
          <span className="text-[11px] text-slate-400 font-medium">
            · {issues.length} issue{issues.length !== 1 ? "s" : ""}
          </span>
        )}

        {/* Live badge — only once streaming is complete */}
        {!loading && !error && expandProgress === null && issues.length > 0 && lastUpdated !== null && (
          <LiveBadge seconds={secondsSince} />
        )}
      </header>

      {/* Graph + panel */}
      <div className="flex flex-1 min-h-0 relative">
        {/* Graph */}
        <div className={`relative ${selectedKey ? "w-[75%]" : "w-full"} transition-[width] duration-200`}>
        {(loading || expandProgress !== null) && (
            <div className="absolute inset-0 flex items-center justify-center bg-slate-50">
              <div className="flex flex-col items-center gap-4">
                <div className="relative w-10 h-10">
                  <div className="absolute inset-0 rounded-full border-2 border-indigo-100" />
                  <div className="absolute inset-0 rounded-full border-2 border-indigo-600 border-t-transparent animate-spin" />
                </div>
                {expandProgress ? (
                  <p className="text-sm text-slate-400 font-medium">
                    Loading {expandProgress.done} / {expandProgress.total} epics…
                  </p>
                ) : (
                  <p className="text-sm text-slate-400 font-medium">Loading epics…</p>
                )}
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
                <p className="font-semibold text-sm text-slate-800 mb-1">Failed to load epics</p>
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

          {!loading && !error && issues.length === 0 && expandProgress === null && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center">
                <p className="text-slate-400 text-sm">No epics found for this project.</p>
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
