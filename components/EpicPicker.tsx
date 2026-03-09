"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { JiraProject, JiraIssue } from "@/lib/jira";
import {
  getLastProject,
  setLastProject,
  getLastEpic,
  setLastEpic,
  clearLastEpic,
  getRecentGraphs,
  pushRecentGraph,
  removeRecentGraph,
  type RecentGraphEntry,
} from "@/lib/homePrefs";
import ErrorBanner from "@/components/ErrorBanner";

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function RecentEpicIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" className="shrink-0 text-indigo-400">
      <circle cx="4" cy="4" r="2" fill="currentColor" fillOpacity="0.7" />
      <circle cx="12" cy="4" r="2" fill="currentColor" fillOpacity="0.4" />
      <circle cx="8" cy="12" r="2" fill="currentColor" fillOpacity="0.55" />
      <line x1="4" y1="4" x2="8" y2="12" stroke="currentColor" strokeWidth="1.5" strokeOpacity="0.5" />
      <line x1="12" y1="4" x2="8" y2="12" stroke="currentColor" strokeWidth="1.5" strokeOpacity="0.5" />
    </svg>
  );
}

function RecentProjectIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" className="shrink-0 text-violet-400">
      <rect x="2" y="2" width="5" height="5" rx="1.5" fill="currentColor" fillOpacity="0.6" />
      <rect x="9" y="2" width="5" height="5" rx="1.5" fill="currentColor" fillOpacity="0.4" />
      <rect x="2" y="9" width="5" height="5" rx="1.5" fill="currentColor" fillOpacity="0.4" />
      <rect x="9" y="9" width="5" height="5" rx="1.5" fill="currentColor" fillOpacity="0.6" />
    </svg>
  );
}

interface RecentItemProps {
  entry: RecentGraphEntry;
  onClick: () => void;
  onRemove: () => void;
}

function RecentItem({ entry, onClick, onRemove }: RecentItemProps) {
  const isEpic = entry.type === "epic";
  const title = entry.label;
  const subtitle = isEpic
    ? `${entry.projectName} · ${entry.key}`
    : `${entry.key} · All epics`;

  return (
    <div className="group flex items-center gap-2.5 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5 hover:border-indigo-200 hover:bg-indigo-50/60 transition-colors">
      <button
        onClick={onClick}
        className="flex items-center gap-2.5 flex-1 min-w-0 text-left cursor-pointer"
        aria-label={`Open ${title}`}
      >
        <span className="mt-px">{isEpic ? <RecentEpicIcon /> : <RecentProjectIcon />}</span>
        <span className="flex flex-col min-w-0">
          <span className="text-xs font-semibold text-slate-800 truncate leading-tight">{title}</span>
          <span className="text-[10px] text-slate-400 truncate leading-snug">{subtitle}</span>
        </span>
      </button>
      <Button
        variant="ghost"
        size="icon"
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        className="shrink-0 h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity text-slate-300 hover:text-slate-500"
        aria-label="Remove from recents"
      >
        <X className="h-3 w-3" />
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared select styles
// ---------------------------------------------------------------------------

const selectClass = cn(
  "w-full appearance-none border border-input rounded-xl px-3.5 py-2.5 text-sm bg-background text-foreground",
  "focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring",
  "disabled:opacity-40 disabled:bg-muted disabled:cursor-not-allowed",
  "cursor-pointer transition pr-8 shadow-sm"
);

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function EpicPicker() {
  const router = useRouter();

  const [projects, setProjects] = useState<JiraProject[]>([]);
  const [epics, setEpics] = useState<JiraIssue[]>([]);

  const [selectedProject, setSelectedProject] = useState("");
  const [selectedEpic, setSelectedEpic] = useState("");

  const [loadingProjects, setLoadingProjects] = useState(true);
  const [loadingEpics, setLoadingEpics] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [jiraConnected, setJiraConnected] = useState<boolean | null>(null);

  // Recents list — hydrated client-side only to avoid SSR mismatch
  const [recents, setRecents] = useState<RecentGraphEntry[]>([]);

  // Hydrate recents from localStorage once on mount (client only)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRecents(getRecentGraphs());
  }, []);

  // Load projects; pre-select last project if stored
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoadingProjects(true);
    fetch("/api/jira/projects")
      .then((r) => {
        if (!r.ok) throw new Error(`Failed to load projects (${r.status})`);
        return r.json();
      })
      .then((data: JiraProject[]) => {
        setProjects(data);
        setJiraConnected(true);
        const last = getLastProject();
        if (last && data.some((p: JiraProject) => p.key === last)) {
          setSelectedProject(last);
        }
      })
      .catch((e: Error) => {
        setError(e.message);
        setJiraConnected(false);
      })
      .finally(() => setLoadingProjects(false));
  }, []);

  // Load epics whenever project changes; pre-select last epic if stored
  useEffect(() => {
    if (!selectedProject) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setEpics([]);
      setSelectedEpic("");
      return;
    }
    setLoadingEpics(true);
    setSelectedEpic("");
    fetch(`/api/jira/epics?project=${encodeURIComponent(selectedProject)}`)
      .then((r) => {
        if (!r.ok) throw new Error(`Failed to load epics (${r.status})`);
        return r.json();
      })
      .then((data: JiraIssue[]) => {
        setEpics(data);
        const lastEpic = getLastEpic();
        if (lastEpic && data.some((e: JiraIssue) => e.key === lastEpic)) {
          setSelectedEpic(lastEpic);
        }
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoadingEpics(false));
  }, [selectedProject]);

  function handleProjectChange(key: string) {
    setSelectedProject(key);
    setLastProject(key);
    if (!key) clearLastEpic();
  }

  function handleEpicChange(key: string) {
    setSelectedEpic(key);
    if (key) setLastEpic(key);
    else clearLastEpic();
  }

  function handleViewGraph() {
    if (!selectedEpic) return;
    const epicObj = epics.find((e) => e.key === selectedEpic);
    const projectObj = projects.find((p) => p.key === selectedProject);
    pushRecentGraph({
      type: "epic",
      key: selectedEpic,
      label: epicObj?.fields.summary ?? selectedEpic,
      projectKey: selectedProject,
      projectName: projectObj?.name ?? selectedProject,
    });
    setRecents(getRecentGraphs());
    router.push(`/graph/${encodeURIComponent(selectedEpic)}`);
  }

  function handleViewAllEpics() {
    if (!selectedProject) return;
    const projectObj = projects.find((p) => p.key === selectedProject);
    pushRecentGraph({
      type: "project",
      key: selectedProject,
      label: projectObj?.name ?? selectedProject,
      projectKey: selectedProject,
      projectName: projectObj?.name ?? selectedProject,
    });
    setRecents(getRecentGraphs());
    router.push(`/graph/project/${encodeURIComponent(selectedProject)}`);
  }

  function handleRecentClick(entry: RecentGraphEntry) {
    if (entry.type === "epic") {
      router.push(`/graph/${encodeURIComponent(entry.key)}`);
    } else {
      router.push(`/graph/project/${encodeURIComponent(entry.key)}`);
    }
  }

  function handleRecentRemove(entry: RecentGraphEntry) {
    removeRecentGraph(entry.type, entry.key);
    setRecents(getRecentGraphs());
  }

  return (
    <div className="flex flex-col gap-4 w-full">
      {/* Recent graphs */}
      {recents.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
            Jump back in
          </span>
          <div className="flex flex-col gap-1.5">
            {recents.map((entry) => (
              <RecentItem
                key={`${entry.type}-${entry.key}`}
                entry={entry}
                onClick={() => handleRecentClick(entry)}
                onRemove={() => handleRecentRemove(entry)}
              />
            ))}
          </div>
          <div className="border-t border-slate-100 mt-1.5" />
        </div>
      )}

      {error && <ErrorBanner message={error} />}

      {/* Project */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Project</label>
        <div className="relative">
          <select
            className={selectClass}
            value={selectedProject}
            onChange={(e) => handleProjectChange(e.target.value)}
            disabled={loadingProjects}
          >
            <option value="">
              {loadingProjects ? "Loading…" : "Select a project"}
            </option>
            {projects.map((p) => (
              <option key={p.id} value={p.key}>
                {p.name} ({p.key})
              </option>
            ))}
          </select>
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-muted-foreground h-3.5 w-3.5" />
        </div>
      </div>

      {/* Epic */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Epic</label>
        <div className="relative">
          <select
            className={selectClass}
            value={selectedEpic}
            onChange={(e) => handleEpicChange(e.target.value)}
            disabled={!selectedProject || loadingEpics}
          >
            <option value="">
              {loadingEpics
                ? "Loading…"
                : !selectedProject
                ? "Select a project first"
                : epics.length === 0
                ? "No epics found"
                : "Select an epic"}
            </option>
            {epics.map((e) => (
              <option key={e.id} value={e.key}>
                {e.key}: {e.fields.summary}
              </option>
            ))}
          </select>
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-muted-foreground h-3.5 w-3.5" />
        </div>
      </div>

      {/* CTAs */}
      <div className="mt-1 flex flex-col gap-2">
        <Button
          onClick={handleViewGraph}
          disabled={!selectedEpic}
          className="w-full"
        >
          View Task Graph →
        </Button>
        <Button
          variant="outline"
          onClick={handleViewAllEpics}
          disabled={!selectedProject}
          className="w-full border-indigo-200 text-indigo-600 bg-indigo-50 hover:bg-indigo-100 hover:text-indigo-700 dark:border-indigo-800 dark:bg-indigo-950 dark:text-indigo-400 dark:hover:bg-indigo-900"
        >
          View All Epics →
        </Button>
      </div>

      {/* Connection status */}
      <div className="flex items-center gap-1.5 -mt-1">
        {jiraConnected === null && (
          <>
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse shrink-0" />
            <span className="text-[11px] text-slate-400">Connecting to Jira Cloud…</span>
          </>
        )}
        {jiraConnected === true && (
          <>
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 shrink-0" />
            <span className="text-[11px] text-slate-400">Connected to Jira Cloud</span>
          </>
        )}
        {jiraConnected === false && (
          <>
            <span className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0" />
            <span className="text-[11px] text-red-400">Could not connect to Jira</span>
          </>
        )}
      </div>
    </div>
  );
}
