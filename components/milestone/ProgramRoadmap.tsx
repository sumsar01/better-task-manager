"use client";

import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  CalendarClock,
  Check,
  Flag,
  Inbox,
  Search,
  SquareStack,
  TriangleAlert,
  Undo2,
  Users,
} from "lucide-react";
import { matchesIncrement, outOfOrderBlockers, plural, releaseState, releaseStateLabel } from "@/lib/milestoneInsights";
import type { ReleaseState } from "@/lib/milestoneInsights";
import type { IncrementSummary, Progress, ProgramOverview, ProgramRelease } from "@/lib/milestoneTypes";
import { cn } from "@/lib/utils";
import { Card, EmptyState, KeyChip, ProgressBar, SectionHeader, StatTile, StatusDot, StatusPill } from "./MilestoneBits";
import { groupWarningsByKind, WarningRow } from "./MilestoneRows";

// The delivery program as a roadmap, after the mac app's ProgramOverviewView:
// each milestone is a stage on a spine, in release order, with every
// increment (capability slice) that ships in it.

const STATE_TINT: Record<ReleaseState["kind"], string> = {
  released: "var(--ms-ready)",
  overdue: "var(--ms-critical)",
  due: "var(--ms-accent)",
  undated: "var(--ms-label-3)",
};

const sum = (list: Progress[]): Progress =>
  list.reduce((a, p) => ({ done: a.done + p.done, inProgress: a.inProgress + p.inProgress, todo: a.todo + p.todo, total: a.total + p.total }), {
    done: 0,
    inProgress: 0,
    todo: 0,
    total: 0,
  });

function JiraLink({ base, issueKey, label }: { base: string; issueKey: string; label?: string }) {
  return (
    <a
      href={`${base}/browse/${issueKey}`}
      target="_blank"
      rel="noopener noreferrer"
      title={`Open ${issueKey} in Jira`}
      className="inline-flex items-center gap-0.5 rounded font-mono text-[11px] text-[var(--ms-accent-text)] hover:underline"
    >
      {label ?? issueKey}
      <ArrowUpRight size={11} aria-hidden="true" />
    </a>
  );
}

function IncrementTile({
  increment,
  late,
  jiraBaseUrl,
  inspectHref,
}: {
  increment: IncrementSummary;
  late: string[];
  jiraBaseUrl: string;
  inspectHref?: string;
}) {
  const done = increment.teamEpics.filter((e) => e.status.category === "done").length;
  const title = increment.capabilities.map((c) => c.summary).join(" + ") || increment.summary;
  return (
    <li
      className={cn(
        "flex flex-col gap-2 rounded-[14px] bg-[var(--ms-surface)] p-3.5 shadow-[var(--ms-shadow-card)] transition-shadow hover:shadow-[var(--ms-shadow-hover)]",
        late.length > 0 && "ms-late",
      )}
    >
      <div className="flex items-center gap-1.5">
        <StatusDot status={increment.status} />
        {inspectHref ? (
          <Link href={inspectHref} className="font-mono text-[11.5px] text-[var(--ms-label-3)] hover:text-[var(--ms-accent-text)]" title={`Show ${increment.key} in its milestone`}>
            {increment.key}
          </Link>
        ) : (
          <span className="font-mono text-[11.5px] text-[var(--ms-label-3)]">{increment.key}</span>
        )}
        <span className="ml-auto">
          <StatusPill status={increment.status} />
        </span>
      </div>
      <div>
        <h4 className="line-clamp-2 text-[14px] font-semibold leading-snug text-[var(--ms-label)]" title={title}>
          {title}
        </h4>
        {title !== increment.summary && <p className="truncate text-[12px] text-[var(--ms-label-3)]">{increment.summary}</p>}
      </div>
      <div className={cn("flex items-center gap-1.5 text-[12px]", increment.teamEpics.length ? "text-[var(--ms-label)]" : "font-medium text-[var(--ms-warn-text)]")}>
        <Users size={13} aria-hidden="true" />
        {plural(increment.teamEpics.length, "team epic")}
        {increment.teamEpics.length > 0 && <span className="text-[var(--ms-label-3)]">· {done} done</span>}
      </div>
      {(increment.blockedBy.length > 0 || increment.blocks.length > 0) && (
        <div className="flex flex-wrap gap-1">
          {increment.blockedBy.map((k) => {
            const isLate = late.includes(k);
            return (
              <span
                key={`a-${k}`}
                title={isLate ? `${k} ships in a later milestone (or none) — this increment can’t ship on time` : `Blocked by ${k}`}
                className={cn(
                  "inline-flex items-center gap-1 rounded-full px-1.5 py-[2px] text-[10.5px] font-semibold",
                  isLate ? "bg-[var(--ms-critical-fill)] text-[var(--ms-critical-text)]" : "bg-[var(--ms-fill)] text-[var(--ms-label-2)]",
                )}
              >
                {isLate ? <Undo2 size={10} aria-hidden="true" /> : <ArrowLeft size={10} aria-hidden="true" />}
                after {k}
              </span>
            );
          })}
          {increment.blocks.map((k) => (
            <span key={`b-${k}`} title={`${k} waits on this`} className="inline-flex items-center gap-1 rounded-full bg-[var(--ms-fill)] px-1.5 py-[2px] text-[10.5px] font-semibold text-[var(--ms-label-2)]">
              <ArrowRight size={10} aria-hidden="true" />
              before {k}
            </span>
          ))}
        </div>
      )}
      {late.length > 0 && (
        <p className="text-[11.5px] leading-snug text-[var(--ms-critical-text)]">
          Waits on {late.join(", ")}, which {late.length === 1 ? "ships" : "ship"} later — this can’t ship with its milestone.
        </p>
      )}
      {jiraBaseUrl && (
        <div className="mt-auto flex flex-wrap items-center gap-x-2.5 gap-y-1 border-t border-[var(--ms-sep)] pt-2 text-[11px] text-[var(--ms-label-3)]">
          <span>Open in Jira</span>
          <JiraLink base={jiraBaseUrl} issueKey={increment.key} />
          {increment.capabilities.map((c) => (
            <JiraLink key={c.key} base={jiraBaseUrl} issueKey={c.key} />
          ))}
        </div>
      )}
    </li>
  );
}

function ProgressLabel({ title, progress }: { title: string; progress: Progress }) {
  return (
    <div className="flex items-center gap-2" title={`${progress.done} done · ${progress.inProgress} in progress · ${progress.todo} to do`}>
      <span className="text-[11.5px] font-semibold text-[var(--ms-label-2)]">{title}</span>
      <ProgressBar progress={progress} className="w-[140px]" />
      <span className="text-[11.5px] tabular-nums text-[var(--ms-label-3)]">
        {progress.done}/{progress.total}
      </span>
    </div>
  );
}

function ReleaseStage({
  release,
  last,
  late,
  query,
  milestoneHref,
  jiraBaseUrl,
}: {
  release: ProgramRelease;
  last: boolean;
  late: Map<string, string[]>;
  query: string;
  milestoneHref: string;
  jiraBaseUrl: string;
}) {
  const state = releaseState(release);
  const tint = STATE_TINT[state.kind];
  const shown = release.increments.filter((inc) => matchesIncrement(inc, query));
  const join = milestoneHref.includes("?") ? "&" : "?";
  return (
    <li className="ms-fade-up flex gap-4 sm:gap-5" style={{ animationDelay: `${Math.min(release.sequence, 6) * 40}ms` }}>
      {/* The spine: a marker per stage and a connector down to the next. */}
      <div className="flex shrink-0 flex-col items-center" aria-hidden="true">
        <span
          className="flex h-[34px] w-[34px] items-center justify-center rounded-full border-2 text-[14px] font-bold tabular-nums"
          style={{ borderColor: tint, background: state.kind === "released" ? tint : "var(--ms-bg)", color: state.kind === "released" ? "white" : tint }}
        >
          {state.kind === "released" ? <Check size={17} strokeWidth={3} /> : release.sequence + 1}
        </span>
        {!last && <span className="mt-1 w-0.5 flex-1 rounded-full" style={{ background: `linear-gradient(color-mix(in srgb, ${tint} 50%, transparent), var(--ms-sep))` }} />}
      </div>
      <section aria-label={`${release.name}, milestone ${release.sequence + 1}`} className="flex min-w-0 flex-1 flex-col gap-3 pb-9">
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-2 pt-0.5">
          <h2 className="text-[21px] font-semibold leading-tight tracking-[-0.015em] text-[var(--ms-label)]">{release.name}</h2>
          <span
            className="inline-flex items-center gap-1 rounded-full px-2 py-[2px] text-[11px] font-semibold"
            style={{ color: tint, background: `color-mix(in srgb, ${tint} 14%, transparent)` }}
          >
            {state.kind === "undated" || state.kind === "due" ? <CalendarClock size={11} aria-hidden="true" /> : null}
            {releaseStateLabel(state)}
          </span>
          <Link
            href={milestoneHref}
            title={`Show the critical path for ${release.name}`}
            className="ml-auto inline-flex items-center gap-1 rounded-full bg-[var(--ms-fill)] px-3 py-1 text-[12.5px] font-medium text-[var(--ms-label)] transition-colors hover:bg-[var(--ms-sep-strong)]"
          >
            Open milestone
            <ArrowRight size={13} aria-hidden="true" />
          </Link>
        </div>
        {release.description && <p className="-mt-1 max-w-3xl text-[13px] text-[var(--ms-label-2)]">{release.description}</p>}
        {release.increments.length > 0 && (
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            <ProgressLabel title="Increments" progress={release.progress} />
            <ProgressLabel title="Team epics" progress={release.epicProgress} />
          </div>
        )}
        {release.increments.length === 0 ? (
          <p className="py-1 text-[13px] text-[var(--ms-label-3)]">No increments planned yet.</p>
        ) : shown.length === 0 ? (
          <p className="py-1 text-[13px] text-[var(--ms-label-3)]">No matching increments.</p>
        ) : (
          <ul className="grid items-start gap-3 [grid-template-columns:repeat(auto-fill,minmax(min(100%,280px),1fr))]">
            {shown.map((inc) => (
              <IncrementTile
                key={inc.key}
                increment={inc}
                late={late.get(inc.key) ?? []}
                jiraBaseUrl={jiraBaseUrl}
                inspectHref={`${milestoneHref}${join}item=${encodeURIComponent(inc.key)}`}
              />
            ))}
          </ul>
        )}
      </section>
    </li>
  );
}

function Hero({ overview, upNextHref }: { overview: ProgramOverview; upNextHref: (id: string) => string }) {
  const increments = overview.releases.flatMap((r) => r.increments);
  const epics = sum(overview.releases.map((r) => r.epicProgress));
  const next = overview.releases.find((r) => !r.released);
  const nextState = next ? releaseState(next) : null;
  return (
    <div className="@container flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-[var(--ms-fill)] px-2 py-[1px] font-mono text-[11.5px] font-semibold text-[var(--ms-label-2)]">{overview.project.key}</span>
            <span className="text-[13px] text-[var(--ms-label-2)]">Delivery program</span>
          </div>
          <h1 className="mt-1 text-[30px] font-bold leading-tight tracking-[-0.025em] text-[var(--ms-label)]">{overview.project.name}</h1>
        </div>
      </div>
      <div className="flex flex-wrap gap-2.5">
        <StatTile
          title="Milestones"
          value={overview.releases.length}
          detail={`${overview.releases.filter((r) => r.released).length} released`}
          icon={<Flag size={13} />}
          tint="var(--ms-accent)"
        />
        <StatTile
          title="Increments"
          value={increments.length}
          detail={`${increments.filter((i) => i.status.category === "done").length} done`}
          icon={<SquareStack size={13} />}
          tint="var(--ms-accent)"
        />
        <StatTile title="Team epics" value={epics.total} detail={`${epics.done} done`} icon={<Users size={13} />} tint="var(--ms-accent)" />
        {next && nextState && (
          <Link href={upNextHref(next.id)} className="ms-tile-button flex rounded-xl" title={`Open ${next.name}`}>
            <StatTile title="Up next" value={next.name} detail={releaseStateLabel(nextState)} icon={<CalendarClock size={13} />} tint={STATE_TINT[nextState.kind]} />
          </Link>
        )}
      </div>
    </div>
  );
}

export default function ProgramRoadmap({
  overview,
  query,
  onQueryChange,
  milestoneHref,
  jiraBaseUrl,
}: {
  overview: ProgramOverview;
  query: string;
  onQueryChange: (q: string) => void;
  milestoneHref: (id: string) => string;
  jiraBaseUrl: string;
}) {
  const late = outOfOrderBlockers(overview);
  const unscheduled = overview.unscheduled.filter((inc) => matchesIncrement(inc, query));
  const anyMatch = !query.trim() || overview.releases.some((r) => r.increments.some((i) => matchesIncrement(i, query))) || unscheduled.length > 0;
  return (
    <div className="flex flex-col gap-7">
      <Hero overview={overview} upNextHref={milestoneHref} />

      {overview.warnings.length > 0 && (
        <Card className="flex flex-col gap-2.5">
          <SectionHeader title="Program warnings" icon={<TriangleAlert size={15} />} count={overview.warnings.length} />
          <ul className="flex flex-col gap-2">
            {groupWarningsByKind(overview.warnings).map((group) => (
              <WarningRow key={group[0].kind} warnings={group} chip={(k) => <KeyChip issueKey={k} />} />
            ))}
          </ul>
        </Card>
      )}

      {overview.releases.length === 0 ? (
        <EmptyState
          icon={<Flag size={40} strokeWidth={1.4} />}
          title="No milestones yet"
          message={`Create one release per milestone in ${overview.project.key}, then give each increment a fix version.`}
        />
      ) : !anyMatch ? (
        <EmptyState
          icon={<Search size={36} strokeWidth={1.5} />}
          title={`No results for “${query.trim()}”`}
          message="No increment, capability or team epic matches."
          action={
            <button type="button" onClick={() => onQueryChange("")} className="rounded-full bg-[var(--ms-fill)] px-3.5 py-1.5 text-[13px] font-medium text-[var(--ms-label)] hover:bg-[var(--ms-sep-strong)]">
              Clear filter
            </button>
          }
        />
      ) : (
        <ol aria-label="Milestones in delivery order" className="flex flex-col">
          {overview.releases.map((r, i) => (
            <ReleaseStage
              key={r.id}
              release={r}
              last={i === overview.releases.length - 1 && overview.unscheduled.length === 0}
              late={late}
              query={query}
              milestoneHref={milestoneHref(r.id)}
              jiraBaseUrl={jiraBaseUrl}
            />
          ))}
        </ol>
      )}

      {overview.unscheduled.length > 0 && anyMatch && (
        <section aria-labelledby="ms-unscheduled" className="flex flex-col gap-2.5 sm:pl-[54px]">
          <div id="ms-unscheduled">
            <SectionHeader title="Not in a milestone" icon={<Inbox size={15} />} count={overview.unscheduled.length} />
          </div>
          <p className="text-[13px] text-[var(--ms-label-2)]">Increments with no fix version — they won’t show up in any milestone’s plan.</p>
          {unscheduled.length === 0 ? (
            <p className="text-[13px] text-[var(--ms-label-3)]">No matching increments.</p>
          ) : (
            <ul className="grid items-start gap-3 [grid-template-columns:repeat(auto-fill,minmax(min(100%,280px),1fr))]">
              {unscheduled.map((inc) => (
                <IncrementTile key={inc.key} increment={inc} late={[]} jiraBaseUrl={jiraBaseUrl} />
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
