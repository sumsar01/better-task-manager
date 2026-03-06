"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import GraphView from "@/components/GraphView";
import IssueDetailPanel from "@/components/IssueDetailPanel";
import GraphPageHeader from "@/components/GraphPageHeader";
import { GraphLoadingState, GraphErrorState, GraphEmptyState } from "@/components/GraphStates";
import type { JiraIssue } from "@/lib/jira";
import type { StreamMessage } from "@/lib/streamTypes";

const JIRA_BASE_URL = process.env.NEXT_PUBLIC_JIRA_BASE_URL ?? "";

// ── Helpers ───────────────────────────────────────────────────────────────────

function dedupeByKey(issues: JiraIssue[]): JiraIssue[] {
  const seen = new Set<string>();
  return issues.filter((i) => {
    if (seen.has(i.key)) return false;
    seen.add(i.key);
    return true;
  });
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ProjectGraphPage() {
  const { projectKey } = useParams<{ projectKey: string }>();

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
      <GraphPageHeader
        chipKey={projectKey}
        chipLabel="All Epics"
        issueCount={expandProgress === null ? issues.length : undefined}
        lastUpdated={expandProgress === null ? lastUpdated : null}
        loading={loading}
        error={error}
      />

      {/* Graph + panel */}
      <div className="flex flex-1 min-h-0 relative">
        {/* Graph */}
        <div className={`relative ${selectedKey ? "w-[75%]" : "w-full"} transition-[width] duration-200`}>
        {(loading || expandProgress !== null) && (
            <GraphLoadingState progress={expandProgress} label="Loading epics…" />
          )}

          {error && <GraphErrorState message={error} heading="Failed to load epics" />}

          {!loading && !error && issues.length === 0 && expandProgress === null && (
            <GraphEmptyState message="No epics found for this project." />
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
