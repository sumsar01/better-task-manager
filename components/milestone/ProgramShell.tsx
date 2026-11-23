"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { CloudAlert, CloudCheck, Flame, Kanban, ListChecks, Map as MapIcon, TriangleAlert, UsersRound } from "lucide-react";
import { cachedJson, usePolledJson } from "@/hooks/usePolledJson";
import { useJiraBaseUrl } from "@/hooks/useJiraBaseUrl";
import { useMyWork } from "@/hooks/useMyWork";
import { plural, releaseState, releaseStateLabel } from "@/lib/milestoneInsights";
import { milestoneApiUrl } from "@/lib/milestoneView";
import { readyMineCount } from "@/lib/myWork";
import type { MilestoneDetail, ProgramOverview, ProgramRelease } from "@/lib/milestoneTypes";
import { cn } from "@/lib/utils";
import { ProgressRing, percentDone } from "./MilestoneBits";
import { milestoneTeamColors } from "./MilestoneContext";

// ── Program shell ───────────────────────────────────────────────────────────
//
// The persistent frame around every /program/<key> page, after the mac app's
// MilestoneRootView: a sidebar of milestones and the open milestone's teams,
// and one store that polls the program overview and the open milestone so
// switching between them never starts from a blank page.

type Polled<T> = ReturnType<typeof usePolledJson<T>>;

interface ProgramContextValue {
  projectKey: string;
  versionId: string | null;
  /** `?fixture=…` to carry on internal links in local dev, else "". */
  linkSuffix: string;
  href: {
    program: string;
    milestone: (id: string) => string;
    team: (id: string, team: string) => string;
  };
  program: Polled<ProgramOverview>;
  milestone: Polled<MilestoneDetail>;
  refresh: () => void;
  refreshing: boolean;
  lastUpdated: Date | null;
  backgroundError: string | null;
  jiraBaseUrl: string;
  /** Show or hide the sidebar — a column on wide windows, a sheet on narrow ones. */
  toggleSidebar: () => void;
  sidebarVisible: boolean;
}

const ProgramContext = createContext<ProgramContextValue | null>(null);

export function useProgram(): ProgramContextValue {
  const value = useContext(ProgramContext);
  if (!value) throw new Error("useProgram must be used inside ProgramShell");
  return value;
}

const LAST_MILESTONE_KEY = (project: string) => `btm:lastMilestone:${project}`;
const SIDEBAR_HIDDEN_KEY = "btm:sidebarHidden";

export function lastViewedMilestone(project: string): string | null {
  try {
    return localStorage.getItem(LAST_MILESTONE_KEY(project));
  } catch {
    return null;
  }
}

const WIDE = "(min-width: 1024px)";

function useIsWide(): boolean {
  return useSyncExternalStore(
    (notify) => {
      const mq = window.matchMedia(WIDE);
      mq.addEventListener("change", notify);
      return () => mq.removeEventListener("change", notify);
    },
    () => window.matchMedia(WIDE).matches,
    () => true,
  );
}

const flagListeners = new Set<() => void>();

/**
 * A boolean kept in localStorage, read through useSyncExternalStore so the
 * server render (which can't see it) hydrates cleanly before it applies.
 */
function useStoredFlag(key: string): [boolean, (on: boolean) => void] {
  const value = useSyncExternalStore(
    (notify) => {
      flagListeners.add(notify);
      return () => flagListeners.delete(notify);
    },
    () => {
      try {
        return localStorage.getItem(key) === "1";
      } catch {
        return false;
      }
    },
    () => false,
  );
  const set = useCallback(
    (on: boolean) => {
      try {
        localStorage.setItem(key, on ? "1" : "0");
      } catch {
        // Private mode: the choice lasts until reload.
      }
      flagListeners.forEach((notify) => notify());
    },
    [key],
  );
  return [value, set];
}

export { milestoneApiUrl };

export default function ProgramShell({ children }: { children: React.ReactNode }) {
  const params = useParams<{ projectKey: string; versionId?: string; team?: string }>();
  const projectKey = params.projectKey;
  const versionId = params.versionId ?? null;
  const fixture = useSearchParams().get("fixture");
  const router = useRouter();
  const jiraBaseUrl = useJiraBaseUrl();
  const isWide = useIsWide();
  const [wideHidden, setWideHidden] = useStoredFlag(SIDEBAR_HIDDEN_KEY);
  const [narrowOpen, setNarrowOpen] = useState(false);
  const pathname = usePathname();

  const linkSuffix = fixture ? `?fixture=${encodeURIComponent(fixture)}` : "";
  const base = `/program/${encodeURIComponent(projectKey)}`;
  const href = useMemo(
    () => ({
      program: `${base}${linkSuffix}`,
      milestone: (id: string) => `${base}/${encodeURIComponent(id)}${linkSuffix}`,
      team: (id: string, team: string) => `${base}/${encodeURIComponent(id)}/team/${encodeURIComponent(team)}${linkSuffix}`,
    }),
    [base, linkSuffix],
  );

  const program = usePolledJson<ProgramOverview>(
    `/api/jira/milestones?project=${encodeURIComponent(projectKey)}${fixture ? `&fixture=${encodeURIComponent(fixture)}` : ""}`,
  );
  const milestone = usePolledJson<MilestoneDetail>(versionId ? milestoneApiUrl(projectKey, versionId, fixture) : null);

  const refreshProgram = program.refresh;
  const refreshMilestone = milestone.refresh;
  const refresh = useCallback(() => {
    refreshProgram();
    refreshMilestone();
  }, [refreshProgram, refreshMilestone]);

  useEffect(() => {
    if (!versionId) return;
    try {
      localStorage.setItem(LAST_MILESTONE_KEY(projectKey), versionId);
    } catch {
      // Private mode: the next visit just lands on the next milestone.
    }
  }, [projectKey, versionId]);

  // The narrow sheet is for picking a destination; once one is picked it gets out of the way.
  const [sheetPath, setSheetPath] = useState(pathname);
  if (sheetPath !== pathname) {
    setSheetPath(pathname);
    setNarrowOpen(false);
  }

  const toggleSidebar = useCallback(() => {
    if (isWide) setWideHidden(!wideHidden);
    else setNarrowOpen((open) => !open);
  }, [isWide, wideHidden, setWideHidden, setNarrowOpen]);

  // ⌘R refreshes; ⌥⌘0 goes to the program, ⌥⌘1–9 to a milestone — the mac app's Go menu.
  const releases = program.data?.releases;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      if (!e.altKey && !e.shiftKey && e.key.toLowerCase() === "r") {
        e.preventDefault();
        refresh();
        return;
      }
      if (e.altKey && !e.shiftKey && /^Digit\d$/.test(e.code)) {
        const n = Number(e.code.slice(5));
        e.preventDefault();
        if (n === 0) router.push(href.program);
        else {
          const target = releases?.[n - 1];
          if (target) router.push(href.milestone(target.id));
        }
      } else if (e.key === "Escape" && narrowOpen) {
        setNarrowOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [refresh, router, href, releases, narrowOpen]);

  const backgroundError = milestone.backgroundError ?? program.backgroundError;
  const lastUpdated = versionId ? (milestone.lastUpdated ?? program.lastUpdated) : program.lastUpdated;
  const refreshing = program.refreshing || milestone.refreshing;
  const sidebarVisible = isWide ? !wideHidden : narrowOpen;

  const value: ProgramContextValue = {
    projectKey,
    versionId,
    linkSuffix,
    href,
    program,
    milestone,
    refresh,
    refreshing,
    lastUpdated,
    backgroundError,
    jiraBaseUrl,
    toggleSidebar,
    sidebarVisible,
  };

  return (
    <ProgramContext.Provider value={value}>
      <div className="ms flex h-screen overflow-hidden">
        {isWide ? (
          !wideHidden && <Sidebar teamName={params.team ? decodeURIComponent(params.team) : null} fixture={fixture} />
        ) : (
          narrowOpen && (
            <div className="fixed inset-0 z-50 flex" role="dialog" aria-modal="true" aria-label="Navigation">
              <div className="ms-sidebar-sheet h-full">
                <Sidebar teamName={params.team ? decodeURIComponent(params.team) : null} fixture={fixture} />
              </div>
              <button
                type="button"
                aria-label="Close navigation"
                className="ms-scrim flex-1"
                onClick={() => setNarrowOpen(false)}
              />
            </div>
          )
        )}
        <div className="flex min-w-0 flex-1 flex-col">{children}</div>
      </div>
    </ProgramContext.Provider>
  );
}

// ── Sidebar ─────────────────────────────────────────────────────────────────

function SidebarSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-4 first:mt-1">
      <h2 className="truncate px-2.5 pb-1 text-[11px] font-semibold text-[var(--ms-label-3)]">{title}</h2>
      <ul className="flex flex-col gap-px">{children}</ul>
    </section>
  );
}

function SidebarLink({
  href,
  selected,
  title,
  children,
}: {
  href: string;
  selected: boolean;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <li>
      <Link
        href={href}
        title={title}
        aria-current={selected ? "page" : undefined}
        className={cn(
          "flex min-h-[30px] items-center gap-2.5 rounded-[7px] px-2.5 py-1 text-[13px] text-[var(--ms-label)] transition-colors",
          selected ? "bg-[var(--ms-sidebar-selected)]" : "hover:bg-[var(--ms-fill-2)]",
        )}
      >
        {children}
      </Link>
    </li>
  );
}

function MilestoneRow({ release, selected, href, fixture, projectKey }: { release: ProgramRelease; selected: boolean; href: string; fixture: string | null; projectKey: string }) {
  const loaded = cachedJson<MilestoneDetail>(milestoneApiUrl(projectKey, release.id, fixture));
  const state = releaseState(release);
  // Item-level progress once the milestone has been opened; until then the
  // team-epic rollup from the overview is the best signal there is.
  const progress = loaded?.progress ?? release.epicProgress;
  const warnings = loaded?.warnings.length ?? 0;
  return (
    <SidebarLink href={href} selected={selected} title={`${release.name} — ${percentDone(progress)}% done`}>
      <span className="relative flex shrink-0 items-center justify-center">
        <ProgressRing progress={progress} size={26} stroke={3} tint={state.kind === "overdue" ? "var(--ms-warn)" : undefined} />
        <span className="absolute text-[10px] font-bold tabular-nums text-[var(--ms-label-2)]">{release.sequence + 1}</span>
      </span>
      <span className="min-w-0 flex-1 py-0.5">
        <span className="block truncate leading-tight">{release.name}</span>
        <span className={cn("block truncate text-[11px] leading-tight", state.kind === "overdue" ? "text-[var(--ms-critical-text)]" : "text-[var(--ms-label-3)]")}>
          {releaseStateLabel(state)}
          {release.increments.length > 0 && ` · ${plural(release.increments.length, "increment")}`}
        </span>
      </span>
      {warnings > 0 && (
        <TriangleAlert size={13} strokeWidth={2.2} className="shrink-0 text-[var(--ms-warn)]" aria-label={plural(warnings, "warning")} />
      )}
    </SidebarLink>
  );
}

function MyWorkLink({ fixture, selected }: { fixture: string | null; selected: boolean }) {
  const { program, projectKey, linkSuffix } = useProgram();
  const { entries, me } = useMyWork(projectKey, fixture, program.data);
  const ready = readyMineCount(entries, me);
  return (
    <SidebarLink href={`/program/${encodeURIComponent(projectKey)}/me${linkSuffix}`} selected={selected} title="What to do next, across the open milestones">
      <ListChecks size={16} className="shrink-0 text-[var(--ms-accent)]" aria-hidden="true" />
      <span className="min-w-0 flex-1 truncate">My work</span>
      {ready > 0 && (
        <span className="shrink-0 rounded-full bg-[var(--ms-fill-2)] px-1.5 text-[11px] font-medium tabular-nums text-[var(--ms-label-2)]" aria-label={`${ready} ready for you`}>
          {ready}
        </span>
      )}
    </SidebarLink>
  );
}

function RefreshStatus() {
  const { refreshing, lastUpdated, backgroundError } = useProgram();
  const now = useNow(20_000);
  const updated = !lastUpdated
    ? "Not updated yet"
    : now - lastUpdated.getTime() < 45_000
      ? "Updated just now"
      : `Updated ${relative(lastUpdated.getTime(), now)}`;
  return (
    <div className="flex items-center gap-1.5 px-3.5 py-2.5 text-[11.5px] text-[var(--ms-label-3)]" aria-live="polite">
      {refreshing ? (
        <>
          <span className="ms-spinner" aria-hidden="true" />
          <span>Updating…</span>
        </>
      ) : backgroundError ? (
        <span className="flex items-center gap-1.5" title={`Last refresh failed: ${backgroundError}. Showing the previous data.`}>
          <CloudAlert size={14} className="shrink-0 text-[var(--ms-warn)]" aria-hidden="true" />
          <span>{updated}</span>
          <span className="sr-only">. Last refresh failed: {backgroundError}. Showing the previous data.</span>
        </span>
      ) : lastUpdated ? (
        <>
          <CloudCheck size={14} className="shrink-0" aria-hidden="true" />
          <span>{updated}</span>
        </>
      ) : null}
    </div>
  );
}

function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

function relative(then: number, now: number): string {
  const minutes = Math.round((now - then) / 60_000);
  const fmt = new Intl.RelativeTimeFormat(undefined, { numeric: "auto", style: "short" });
  return minutes < 60 ? fmt.format(-Math.max(1, minutes), "minute") : fmt.format(-Math.round(minutes / 60), "hour");
}

function Sidebar({ teamName, fixture }: { teamName: string | null; fixture: string | null }) {
  const { program, milestone, versionId, href, projectKey } = useProgram();
  const overview = program.data;
  const detail = milestone.data;
  const colors = useMemo(() => (detail ? milestoneTeamColors(detail) : new Map<string, string>()), [detail]);
  const onMyWork = usePathname().endsWith("/me");
  return (
    <nav aria-label="Delivery program" className="ms-sidebar flex h-full w-[264px] shrink-0 flex-col border-r border-[var(--ms-sep)]">
      <div className="min-h-0 flex-1 overflow-y-auto px-2.5 pb-3 pt-3">
        <ul>
          <SidebarLink href={href.program} selected={!versionId && !onMyWork}>
            <MapIcon size={16} className="shrink-0 text-[var(--ms-accent)]" aria-hidden="true" />
            <span className="min-w-0 flex-1 py-0.5">
              <span className="block truncate leading-tight">Program overview</span>
              <span className="block truncate text-[11px] leading-tight text-[var(--ms-label-3)]">{overview?.project.name ?? projectKey}</span>
            </span>
          </SidebarLink>
        </ul>

        <SidebarSection title="You">
          <MyWorkLink fixture={fixture} selected={onMyWork} />
        </SidebarSection>

        <SidebarSection title="Milestones">
          {overview ? (
            overview.releases.length ? (
              overview.releases.map((r) => (
                <MilestoneRow
                  key={r.id}
                  release={r}
                  selected={versionId === r.id && !teamName}
                  href={href.milestone(r.id)}
                  fixture={fixture}
                  projectKey={projectKey}
                />
              ))
            ) : (
              <li className="px-2.5 py-1 text-[12px] text-[var(--ms-label-3)]">No releases in {overview.project.key}</li>
            )
          ) : program.error ? (
            <li className="flex items-center gap-1.5 px-2.5 py-1 text-[12px] text-[var(--ms-label-3)]">
              <TriangleAlert size={13} aria-hidden="true" /> Unavailable
            </li>
          ) : (
            Array.from({ length: 3 }, (_, i) => (
              <li key={i} className="flex items-center gap-2.5 px-2.5 py-1.5" aria-hidden="true">
                <span className="ms-skeleton h-[26px] w-[26px] rounded-full" />
                <span className="ms-skeleton h-3 w-32" />
              </li>
            ))
          )}
        </SidebarSection>

        {versionId && detail && detail.teams.length > 0 && (
          <SidebarSection title={`Teams · ${detail.release.name}`}>
            {detail.teams.map((t) => (
              <SidebarLink
                key={t.name}
                href={href.team(versionId, t.name)}
                selected={teamName === t.name}
                title={`${t.name}: ${t.remaining} remaining${t.criticalItems ? `, ${plural(t.criticalItems, "item")} on the critical path` : ""}`}
              >
                <UsersRound size={15} className="shrink-0" style={{ color: colors.get(t.name) }} aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate">{t.name}</span>
                {t.criticalItems > 0 && (
                  <Flame size={12} className="shrink-0 fill-current text-[var(--ms-critical)]" aria-label={`${t.criticalItems} critical`} />
                )}
                <span className="shrink-0 rounded-full bg-[var(--ms-fill-2)] px-1.5 text-[11px] font-medium tabular-nums text-[var(--ms-label-2)]" aria-label={`${t.remaining} remaining`}>
                  {t.remaining}
                </span>
              </SidebarLink>
            ))}
          </SidebarSection>
        )}

        <SidebarSection title="Boards">
          <SidebarLink href="/app" selected={false}>
            <Kanban size={15} className="shrink-0 text-[var(--ms-label-2)]" aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate">Kanban boards</span>
          </SidebarLink>
        </SidebarSection>
      </div>
      <div className="border-t border-[var(--ms-sep)]">
        <RefreshStatus />
      </div>
    </nav>
  );
}
