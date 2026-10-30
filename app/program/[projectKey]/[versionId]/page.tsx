"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CirclePlay, CircleDashed, Flame, PanelRight, TriangleAlert, Users } from "lucide-react";
import CriticalPathTimeline from "@/components/milestone/CriticalPathTimeline";
import MilestoneInspector from "@/components/milestone/MilestoneInspector";
import { ErrorState, MilestoneSkeleton, ShortcutsSheet, ToolButton, Toolbar } from "@/components/milestone/MilestoneChrome";
import { MilestoneProvider } from "@/components/milestone/MilestoneContext";
import { BlockersTab, IncrementsTab, NoMatches, ReadyTab } from "@/components/milestone/MilestoneTabs";
import { TeamLanesTab } from "@/components/milestone/TeamLanes";
import { TeamLoadTab } from "@/components/milestone/TeamLoad";
import { FilterBar, useInspector, useWorkspaceKeys } from "@/components/milestone/MilestoneWorkspace";
import { KeyChip, ProgressRing, Segmented, StatTile, percentDone } from "@/components/milestone/MilestoneBits";
import { useProgram } from "@/components/milestone/ProgramShell";
import { useMilestoneViewState } from "@/hooks/useMilestoneViewState";
import { plural, rankMatches, releaseState, releaseStateLabel, steps, warningsDetail } from "@/lib/milestoneInsights";
import { MILESTONE_TABS, matchItems } from "@/lib/milestoneView";
import type { MilestoneTab, MilestoneViewState } from "@/lib/milestoneView";
import type { MilestoneDetail } from "@/lib/milestoneTypes";
import { cn } from "@/lib/utils";

const TABS: Array<{ value: MilestoneTab; label: React.ReactNode }> = [
  { value: "path", label: <><span className="hidden xl:inline">Critical path</span><span className="xl:hidden">Path</span></> },
  { value: "blockers", label: "Blockers" },
  { value: "teams", label: <><span className="hidden xl:inline">Team load</span><span className="xl:hidden">Load</span></> },
  { value: "increments", label: "Increments" },
  { value: "ready", label: <><span className="hidden xl:inline">Ready & warnings</span><span className="xl:hidden">Ready</span></> },
  { value: "lanes", label: <><span className="hidden xl:inline">Team lanes</span><span className="xl:hidden">Lanes</span></> },
];

const TAB_TITLE: Record<MilestoneTab, string> = {
  path: "Critical path",
  blockers: "Blockers",
  teams: "Team load",
  increments: "Increments",
  ready: "Ready & warnings",
  lanes: "Team lanes",
};

const STATE_STYLE = {
  released: "bg-[var(--ms-ready-fill)] text-[var(--ms-ready-text)]",
  overdue: "bg-[var(--ms-critical-fill)] text-[var(--ms-critical-text)]",
  due: "bg-[color-mix(in_srgb,var(--ms-accent)_14%,transparent)] text-[var(--ms-accent-text)]",
  undated: "bg-[var(--ms-fill)] text-[var(--ms-label-2)]",
} as const;

function Header({ detail, setTab, inspect }: { detail: MilestoneDetail; setTab: (tab: MilestoneTab) => void; inspect: (key: string) => void }) {
  const state = releaseState(detail.release);
  const remaining = detail.items.filter((i) => !i.external && i.status.category !== "done").length;
  const crossTeam = detail.items.filter((i) => (i.schedule?.downstreamTeams.length ?? 0) > 0).length;
  const top = detail.blockerEpics[0];
  const topEpic = top ? detail.epics.find((e) => e.key === top.epicKey) : undefined;
  const pct = percentDone(detail.progress);
  return (
    <section aria-label="Milestone summary" className="@container border-b border-[var(--ms-sep)] px-6 pb-4 pt-4">
      <div className="flex items-center gap-x-6 gap-y-3">
        <div className="flex min-w-0 flex-1 items-center gap-4">
          <div className="relative shrink-0" title={`${pct}% of items done`}>
            <ProgressRing progress={detail.progress} size={54} stroke={6} />
            <span className="absolute inset-0 flex items-center justify-center text-[12px] font-bold tabular-nums text-[var(--ms-label)]">{pct}%</span>
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-[24px] font-bold leading-tight tracking-[-0.02em] text-[var(--ms-label)]">{detail.release.name}</h1>
            <div className="mt-0.5 flex min-w-0 items-center gap-2">
              <span className={cn("shrink-0 rounded-full px-2 py-[2px] text-[11px] font-semibold", STATE_STYLE[state.kind])}>{releaseStateLabel(state)}</span>
              <span className="truncate text-[12.5px] text-[var(--ms-label-2)]">
                Milestone {detail.release.sequence + 1} · {plural(detail.increments.length, "increment")} · {plural(detail.teams.length, "team")}
              </span>
            </div>
            {detail.release.description && (
              <p className="mt-0.5 truncate text-[12.5px] text-[var(--ms-label-3)]" title={detail.release.description}>
                {detail.release.description}
              </p>
            )}
          </div>
        </div>
        {/* Tiles shrink, then drop out, as the column narrows — never the title. */}
        <div className="ms-tiles hidden shrink-0 items-stretch gap-2 @3xl:flex">
          <StatTile
            title="Critical path"
            value={steps(detail.criticalPath.length)}
            detail={`${detail.criticalPath.criticalKeys.length} items with no slack`}
            icon={<Flame size={13} className="fill-current" />}
            tint="var(--ms-critical)"
            onClick={() => setTab("path")}
            hint="The longest chain of remaining work, one step per item"
          />
          <StatTile title="Remaining" value={remaining} detail={`of ${detail.progress.total} items`} icon={<CircleDashed size={13} />} tint="var(--ms-accent)" />
          <StatTile
            title="Ready now"
            value={detail.readyNow.length}
            detail="unblocked, not started"
            icon={<CirclePlay size={13} />}
            tint="var(--ms-ready)"
            onClick={() => setTab("ready")}
            hint="Remaining items whose blockers are all done"
          />
          <StatTile
            title="Warnings"
            value={detail.warnings.length}
            detail={warningsDetail(detail.warnings)}
            icon={<TriangleAlert size={13} />}
            tint={detail.warnings.length ? "var(--ms-warn)" : "var(--ms-label-3)"}
            onClick={() => setTab("ready")}
            hint="Sequencing problems found in Jira links"
          />
          <span className="hidden @5xl:flex">
            <StatTile
              title="Blocks other teams"
              value={crossTeam}
              detail="remaining items"
              icon={<Users size={13} />}
              tint="var(--ms-cross)"
              onClick={() => setTab("teams")}
              hint="Remaining items that other teams' work waits on"
            />
          </span>
        </div>
        {top && (
          <button
            type="button"
            onClick={() => {
              setTab("blockers");
              inspect(top.epicKey);
            }}
            className="ms-tile-button hidden w-[300px] shrink-0 flex-col gap-1 rounded-xl bg-[var(--ms-fill-2)] px-3.5 py-2.5 text-left @7xl:flex"
          >
            <span className="flex items-center gap-1.5 text-[11.5px] font-medium text-[var(--ms-label-2)]">
              Biggest blocker
              {top.onCriticalPath && <span className="font-semibold text-[var(--ms-critical-text)]">· on critical path</span>}
            </span>
            <span className="flex min-w-0 items-center gap-2">
              <KeyChip issueKey={top.epicKey} critical={top.onCriticalPath} />
              <span className="truncate text-[13px] font-semibold text-[var(--ms-label)]">{topEpic?.summary ?? top.epicKey}</span>
            </span>
            <span className="truncate text-[11.5px] text-[var(--ms-label-3)]">
              {top.team} · gates {plural(top.downstreamItems, "item")}
              {top.blockedTeams.length > 0 && <> in {top.blockedTeams.join(", ")}</>}
            </span>
          </button>
        )}
      </div>
    </section>
  );
}

function MilestoneView() {
  const program = useProgram();
  const { milestone, projectKey, versionId, href, jiraBaseUrl } = program;
  const { data, loading, error, retry } = milestone;
  const router = useRouter();
  const [view, setView] = useMilestoneViewState();
  const searchRef = useRef<HTMLInputElement>(null);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const inspector = useInspector(view, setView);
  const { select, inspect, setOpen } = inspector;

  const matches = useMemo(() => (data ? matchItems(data, view.query) : null), [data, view.query]);
  const ranked = useMemo(
    () => (data ? rankMatches(data, matches, { showDone: view.showDone, showOutside: view.showOutside }) : []),
    [data, matches, view.showDone, view.showOutside],
  );

  // Return in the filter goes to the best match (critical first, then the
  // earliest to start); repeats step through the rest in that order.
  const stepMatch = useCallback(
    (backwards: boolean) => {
      if (!ranked.length) return;
      const at = view.item ? ranked.indexOf(view.item) : -1;
      const n = ranked.length;
      const next = at === -1 ? (backwards ? n - 1 : 0) : (at + (backwards ? -1 : 1) + n) % n;
      const key = ranked[next];
      if (key) inspect(key);
    },
    [ranked, inspect, view.item],
  );

  const setTab = useCallback((tab: MilestoneTab) => setView({ tab }), [setView]);
  const showTeam = useCallback((team: string) => versionId && router.push(href.team(versionId, team)), [router, href, versionId]);
  const clearSelection = useCallback(() => setView({ item: null }), [setView]);
  const toggleInspector = useCallback(() => setOpen((o) => !o), [setOpen]);

  // Browsers keep ⌘1–9 for their tabs, so the bare digits switch views too.
  const extra = useCallback(
    (e: KeyboardEvent, typing: boolean) => {
      const digit = /^Digit[1-6]$/.test(e.code) ? Number(e.code.slice(5)) : 0;
      if (digit && !e.altKey && !e.shiftKey && (e.metaKey || e.ctrlKey || !typing)) {
        e.preventDefault();
        setView({ tab: MILESTONE_TABS[digit - 1] });
        return true;
      }
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.code === "KeyD") {
        e.preventDefault();
        setView({ showDone: !view.showDone });
        return true;
      }
      return false;
    },
    [setView, view.showDone],
  );
  useWorkspaceKeys({
    searchRef,
    shortcutsOpen,
    setShortcutsOpen,
    selectedKey: view.item,
    clearSelection,
    toggleInspector,
    jiraBaseUrl,
    extra,
  });

  useEffect(() => {
    document.title = data ? `${data.release.name} · ${TAB_TITLE[view.tab]}` : "Milestone";
  }, [data, view.tab]);

  const releaseName = data?.release.name ?? program.program.data?.releases.find((r) => r.id === versionId)?.name;
  const onClearQuery = () => setView({ query: "" });
  const patch = (p: Partial<MilestoneViewState>) => setView(p);

  return (
    <>
      <Toolbar
        title={releaseName ?? "Milestone"}
        subtitle={data?.project.name ?? program.program.data?.project.name}
        shareable={!!data}
        center={data ? <Segmented label="View" value={view.tab} onChange={setTab} options={TABS} /> : null}
        trailing={
          data && (
            <ToolButton label={inspector.open ? "Hide inspector" : "Show inspector"} shortcut="⌥⌘I" onClick={toggleInspector} pressed={inspector.open} disabled={!view.item}>
              <PanelRight size={17} strokeWidth={1.75} aria-hidden="true" />
            </ToolButton>
          )
        }
      />
      {loading && !data ? (
        <MilestoneSkeleton />
      ) : error && !data ? (
        <ErrorState message={error} onRetry={retry} what={releaseName ?? "this milestone"} projectKey={projectKey} />
      ) : data ? (
        <MilestoneProvider detail={data} selectedKey={view.item} inspect={inspect} showTeam={showTeam} jiraBaseUrl={jiraBaseUrl}>
          <Header detail={data} setTab={setTab} inspect={inspect} />
          <FilterBar
            view={view}
            setView={patch}
            count={view.query.trim() ? ranked.length : null}
            onSubmit={stepMatch}
            inputRef={searchRef}
            laneOptions={view.tab === "path"}
            onShowShortcuts={() => setShortcutsOpen(true)}
          />
          <main className="relative min-h-0 flex-1">
            {view.tab === "path" ? (
              <CriticalPathTimeline
                detail={data}
                laneMode={view.lanes}
                selectedKey={view.item}
                onSelect={select}
                onInspect={inspect}
                onOpenTeam={showTeam}
                showDone={view.showDone}
                showOutside={view.showOutside}
                matches={matches}
              />
            ) : (
              <div key={view.tab} className="ms-fade-quick absolute inset-0 overflow-y-auto">
                {view.tab === "blockers" && <BlockersTab query={view.query} onClearQuery={onClearQuery} />}
                {view.tab === "teams" && <TeamLoadTab matches={matches} empty={<NoMatches query={view.query} onClear={onClearQuery} />} />}
                {view.tab === "increments" && <IncrementsTab query={view.query} onClearQuery={onClearQuery} />}
                {view.tab === "ready" && <ReadyTab query={view.query} matches={matches} />}
                {view.tab === "lanes" && <TeamLanesTab matches={matches} showDone={view.showDone} empty={<NoMatches query={view.query} onClear={onClearQuery} />} />}
              </div>
            )}
            {inspector.open && view.item && (
              <MilestoneInspector
                selectedKey={view.item}
                onClose={() => setOpen(false)}
                onShowInTimeline={view.tab !== "path" ? () => setView({ tab: "path" }) : undefined}
              />
            )}
          </main>
        </MilestoneProvider>
      ) : null}
      {shortcutsOpen && <ShortcutsSheet onClose={() => setShortcutsOpen(false)} />}
    </>
  );
}

export default function MilestonePage() {
  return (
    <Suspense fallback={<MilestoneSkeleton />}>
      <MilestoneView />
    </Suspense>
  );
}
