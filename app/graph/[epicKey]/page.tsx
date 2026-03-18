"use client";

import { useCallback, useState } from "react";
import { useParams } from "next/navigation";
import GraphView from "@/components/GraphView";
import IssueDetailPanel from "@/components/IssueDetailPanel";
import GraphPageHeader from "@/components/GraphPageHeader";
import { GraphLoadingState, GraphErrorState, GraphEmptyState } from "@/components/GraphStates";
import { useIssuePoller } from "@/hooks/useIssuePoller";

const JIRA_BASE_URL = process.env.NEXT_PUBLIC_JIRA_BASE_URL ?? "";

export default function GraphPage() {
  const { epicKey } = useParams<{ epicKey: string }>();

  const { issues, latestIssues, loading, error, lastUpdated } = useIssuePoller(epicKey);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const handleNodeSelect = useCallback((key: string | null) => {
    setSelectedKey(key);
  }, []);

  return (
    <div className="flex flex-col h-screen bg-slate-50">
      <GraphPageHeader
        chipKey={epicKey}
        issueCount={issues.length}
        lastUpdated={lastUpdated}
        loading={loading}
        error={error}
      />

      {/* Graph + panel */}
      <div className="flex flex-1 min-h-0 relative">
        {/* Graph */}
        <div className={`relative ${selectedKey ? "w-[75%]" : "w-full"} transition-[width] duration-200`}>
          {loading && <GraphLoadingState label="Loading issues…" />}

          {error && <GraphErrorState message={error} heading="Failed to load issues" />}

          {!loading && !error && issues.length === 0 && (
            <GraphEmptyState message="No issues found for this epic." />
          )}

          {!loading && !error && issues.length > 0 && (
            <GraphView
              issues={issues}
              latestIssues={latestIssues}
              onNodeSelect={handleNodeSelect}
              selectedKey={selectedKey}
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
