"use client";

import Link from "next/link";
import { useMemo } from "react";
import { ArrowUpRight, CornerDownRight, Flame, Hourglass, Inbox, ShieldAlert, Users } from "lucide-react";
import { plural } from "@/lib/milestoneInsights";
import type { TeamEpic } from "@/lib/milestoneTypes";
import {
  ASKS_FOR_YOU_URL,
  developerView,
  itemHref,
  leadView,
  reasonLabel,
  teamNames,
} from "@/lib/myWork";
import type { Chase, DecisionLog, DueState, MilestoneEntry, Me, MyWorkMode, RankedItem } from "@/lib/myWork";
import { teamColors } from "@/lib/teamColor";
import { cn } from "@/lib/utils";
import { AssigneeLabel, ProgressBar, Segmented, StatusDot, TeamBadge } from "./MilestoneBits";
import { CriticalBadge } from "./MilestoneRows";

// ── My work ─────────────────────────────────────────────────────────────────
//
// Thin views over lib/myWork.ts: what to do next, as a developer on a team or
// as the lead. Rows are links to the milestone page with the item selected.

const MODE_OPTIONS: Array<{ value: MyWorkMode; label: string }> = [
  { value: "lead", label: "Lead" },
  { value: "developer", label: "Developer" },
];

export function ModeToggle({ mode, onChange }: { mode: MyWorkMode; onChange: (m: MyWorkMode) => void }) {
  return <Segmented label="Work as" value={mode} options={MODE_OPTIONS} onChange={onChange} />;
}

interface Nav {
  /** Milestone page for an id, carrying `?fixture=`. */
  milestoneHref: (id: string) => string;
  jiraBaseUrl: string;
}

function Section({ title, count, hint, children }: { title: string; count?: number; hint?: string; children: React.ReactNode }) {
  return (
    <section className="mt-8 first:mt-0">
      <div className="mb-1.5 flex items-baseline gap-2 px-2">
        <h2 className="text-[14px] font-semibold text-[var(--ms-label)]">{title}</h2>
        {count !== undefined && <span className="text-[12px] font-semibold tabular-nums text-[var(--ms-label-3)]">{count}</span>}
        {hint && <span className="min-w-0 truncate text-[12px] text-[var(--ms-label-3)]">{hint}</span>}
      </div>
      {children}
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-lg px-2 py-3 text-[13px] text-[var(--ms-label-3)]">{children}</p>;
}

/** A link row with the Jira link beside it: nesting one anchor in the other isn't valid HTML. */
function Row({ to, issueKey, jiraBaseUrl, children }: { to: string; issueKey: string; jiraBaseUrl: string; children: React.ReactNode }) {
  return (
    <li className="group flex items-center rounded-lg transition-colors hover:bg-[var(--ms-fill-2)]">
      <Link href={to} className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg px-2 py-1.5">
        {children}
      </Link>
      {jiraBaseUrl && (
        <a
          href={`${jiraBaseUrl}/browse/${issueKey}`}
          target="_blank"
          rel="noopener noreferrer"
          title={`Open ${issueKey} in Jira`}
          aria-label={`Open ${issueKey} in Jira`}
          className="mr-1 shrink-0 rounded p-1 text-[var(--ms-label-3)] opacity-0 transition-opacity hover:text-[var(--ms-accent-text)] focus-visible:opacity-100 group-hover:opacity-100"
        >
          <ArrowUpRight size={14} aria-hidden="true" />
        </a>
      )}
    </li>
  );
}

function MilestoneTag({ name }: { name: string }) {
  return (
    <span className="hidden max-w-[140px] shrink-0 truncate text-[11.5px] text-[var(--ms-label-3)] md:inline" title={name}>
      {name}
    </span>
  );
}

function Reasons({ reasons }: { reasons: RankedItem["reasons"] }) {
  return (
    <>
      {reasons.map((r) =>
        r.kind === "critical" ? (
          <CriticalBadge key={r.kind} />
        ) : (
          <span
            key={r.kind}
            title={reasonLabel(r)}
            className="inline-flex shrink-0 items-center gap-1 text-[11.5px] tabular-nums text-[var(--ms-label-3)]"
          >
            {r.kind === "unblocks" ? <CornerDownRight size={12} aria-hidden="true" /> : <Users size={12} aria-hidden="true" />}
            <span className={r.kind === "cross-team" ? "hidden max-w-[150px] truncate lg:inline" : undefined}>{reasonLabel(r)}</span>
          </span>
        ),
      )}
    </>
  );
}

function ItemRow({ ranked, nav, showMilestone }: { ranked: RankedItem; nav: Nav; showMilestone: boolean }) {
  const { item } = ranked;
  return (
    <Row to={itemHref(nav.milestoneHref(ranked.milestone.id), item.key)} issueKey={item.key} jiraBaseUrl={nav.jiraBaseUrl}>
      <span className="flex w-4 shrink-0 justify-center">
        {item.schedule?.critical ? (
          <Flame size={13} className="fill-current text-[var(--ms-critical)]" aria-label="On the critical path" />
        ) : (
          <StatusDot status={item.status} className="h-1.5 w-1.5" />
        )}
      </span>
      <span className="w-[72px] shrink-0 truncate font-mono text-[11.5px] text-[var(--ms-label-3)]">{item.key}</span>
      <span className="min-w-0 flex-1 truncate text-[13px] text-[var(--ms-label)]">{item.summary}</span>
      <Reasons reasons={ranked.reasons} />
      {showMilestone && <MilestoneTag name={ranked.milestone.name} />}
      <span className="flex w-[104px] shrink-0 justify-end">
        <AssigneeLabel name={ranked.mine ? "You" : item.assignee} />
      </span>
    </Row>
  );
}

// ── Developer ───────────────────────────────────────────────────────────────

export function DeveloperMode({
  entries,
  me,
  team,
  onTeamChange,
  nav,
}: {
  entries: MilestoneEntry[];
  me: Me | null;
  team: string | null;
  onTeamChange: (team: string) => void;
  nav: Nav;
}) {
  const teams = useMemo(() => teamNames(entries), [entries]);
  const view = useMemo(() => developerView(entries, me, team), [entries, me, team]);
  const many = entries.length > 1;
  return (
    <>
      <div className="mb-6 flex items-center gap-2 px-2">
        <label htmlFor="my-work-team" className="text-[12.5px] text-[var(--ms-label-2)]">
          Team
        </label>
        <select
          id="my-work-team"
          value={team ?? ""}
          onChange={(e) => onTeamChange(e.target.value)}
          className="h-7 rounded-md bg-[var(--ms-fill)] px-2 text-[12.5px] font-medium text-[var(--ms-label)] outline-none focus-visible:shadow-[0_0_0_3px_color-mix(in_srgb,var(--ms-accent)_35%,transparent)]"
        >
          {teams.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <span className="text-[12px] text-[var(--ms-label-3)]">across {plural(entries.length, "open milestone")}</span>
      </div>
      <Section title="In progress, mine" count={view.inProgress.length}>
        {view.inProgress.length ? (
          <ul>{view.inProgress.map((r) => <ItemRow key={`${r.milestone.id}:${r.item.key}`} ranked={r} nav={nav} showMilestone={many} />)}</ul>
        ) : (
          <Empty>Nothing of yours is in progress in {team ?? "this team"}.</Empty>
        )}
      </Section>
      <Section title="Ready" count={view.ready.length} hint="Yours first, then critical path, then what it unblocks">
        {view.ready.length ? (
          <ul>{view.ready.map((r) => <ItemRow key={`${r.milestone.id}:${r.item.key}`} ranked={r} nav={nav} showMilestone={many} />)}</ul>
        ) : (
          <Empty>No ready work in {team ?? "this team"}: everything is underway, done or waiting on a blocker.</Empty>
        )}
      </Section>
    </>
  );
}

// ── Lead ────────────────────────────────────────────────────────────────────

const DUE_STYLE: Record<DueState, string> = {
  overdue: "bg-[var(--ms-critical-fill)] text-[var(--ms-critical-text)]",
  soon: "bg-[var(--ms-warn-fill)] text-[var(--ms-warn-text)]",
  later: "bg-[var(--ms-fill-2)] text-[var(--ms-label-2)]",
  none: "bg-[var(--ms-fill-2)] text-[var(--ms-label-3)]",
};

const DUE_LABEL: Record<DueState, string> = { overdue: "Overdue", soon: "Due soon", later: "Due", none: "No due date" };

function dueText(due: DueState, dueDate: string | null): string {
  if (!dueDate) return DUE_LABEL[due];
  const [y = 0, m = 1, d = 1] = dueDate.split("-").map(Number);
  const day = new Date(y, m - 1, d).toLocaleDateString(undefined, { day: "numeric", month: "short" });
  return `${DUE_LABEL[due]} · ${day}`;
}

const GROUP_TITLE: Record<Chase["group"], string> = {
  mine: "Assigned to you",
  unassigned: "Unassigned: nobody is chasing these",
  others: "Assigned to others",
};

function ChaseRow({ chase, nav, showMilestone }: { chase: Chase; nav: Nav; showMilestone: boolean }) {
  const { item } = chase;
  return (
    <Row to={itemHref(nav.milestoneHref(chase.milestone.id), item.key)} issueKey={item.key} jiraBaseUrl={nav.jiraBaseUrl}>
      <span className="flex w-4 shrink-0 justify-center">
        <Hourglass size={13} className="text-[var(--ms-warn)]" aria-label="Outside decision" />
      </span>
      <span className="w-[72px] shrink-0 truncate font-mono text-[11.5px] text-[var(--ms-label-3)]">{item.key}</span>
      <span className="min-w-0 flex-1 truncate text-[13px] text-[var(--ms-label)]">{item.summary}</span>
      <span className={cn("shrink-0 rounded-full px-1.5 py-[2px] text-[10.5px] font-semibold", DUE_STYLE[chase.due])}>{dueText(chase.due, item.dueDate)}</span>
      {showMilestone && <MilestoneTag name={chase.milestone.name} />}
      <span className="flex w-[104px] shrink-0 justify-end">
        <AssigneeLabel name={chase.mine ? "You" : item.assignee} />
      </span>
    </Row>
  );
}

function DecisionLogRow({ log, nav, colors, showMilestone }: { log: DecisionLog; nav: Nav; colors: Map<string, string>; showMilestone: boolean }) {
  const epic: TeamEpic = log.epic;
  return (
    <Row to={itemHref(nav.milestoneHref(log.milestone.id), epic.key)} issueKey={epic.key} jiraBaseUrl={nav.jiraBaseUrl}>
      <span className="flex w-4 shrink-0 justify-center">
        {epic.onCriticalPath ? (
          <Flame size={13} className="fill-current text-[var(--ms-critical)]" aria-label="On the critical path" />
        ) : (
          <StatusDot status={epic.status} />
        )}
      </span>
      <span className="w-[72px] shrink-0 truncate font-mono text-[11.5px] text-[var(--ms-label-3)]">{epic.key}</span>
      <span className="min-w-0 flex-1 truncate text-[13px] text-[var(--ms-label)]">{epic.summary}</span>
      <TeamBadge team={epic.team} color={colors.get(epic.team)} className="hidden sm:inline-flex" />
      {showMilestone && <MilestoneTag name={log.milestone.name} />}
      <ProgressBar progress={epic.progress} className="hidden w-[70px] shrink-0 sm:block" />
    </Row>
  );
}

function AsksForYou() {
  return (
    <a
      href={ASKS_FOR_YOU_URL}
      target="_blank"
      rel="noopener noreferrer"
      className="mb-8 flex items-center gap-3 rounded-xl bg-[var(--ms-fill-2)] px-3 py-2.5 transition-colors hover:bg-[var(--ms-fill)]"
    >
      <Inbox size={17} className="shrink-0 text-[var(--ms-accent)]" aria-hidden="true" />
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-semibold text-[var(--ms-label)]">Asks for you</span>
        <span className="block truncate text-[12px] text-[var(--ms-label-3)]">Questions teams have raised for you, on the LA dashboard</span>
      </span>
      <ArrowUpRight size={15} className="shrink-0 text-[var(--ms-label-3)]" aria-hidden="true" />
    </a>
  );
}

/** Reserved: how contracts are marked in Jira is still open, so there is nothing to list yet. */
function ContractsToReview() {
  return null;
}

export function LeadMode({ entries, me, today, nav }: { entries: MilestoneEntry[]; me: Me | null; today: string; nav: Nav }) {
  const view = useMemo(() => leadView(entries, me, today), [entries, me, today]);
  const colors = useMemo(() => teamColors([...new Set(entries.flatMap((e) => e.detail.items.map((i) => i.team)))]), [entries]);
  const many = entries.length > 1;
  const groups = (["mine", "unassigned", "others"] as const)
    .map((g) => ({ group: g, rows: view.outsideDecisions.filter((c) => c.group === g) }))
    .filter((g) => g.rows.length > 0);
  return (
    <>
      <AsksForYou />
      <Section title="Decision logs to review" count={view.decisionLogs.length} hint="Team epics without design approval, critical path first">
        {view.decisionLogs.length ? (
          <ul>{view.decisionLogs.map((l) => <DecisionLogRow key={l.epic.key} log={l} nav={nav} colors={colors} showMilestone={many} />)}</ul>
        ) : (
          <Empty>Every open team epic has its decision log approved.</Empty>
        )}
      </Section>
      <Section title="Outside decisions to chase" count={view.outsideDecisions.length} hint="Yours first, then the ones nobody owns">
        {groups.length ? (
          groups.map(({ group, rows }) => (
            <div key={group} className="mb-3 last:mb-0">
              <h3 className="flex items-center gap-1.5 px-2 pb-0.5 pt-1 text-[11.5px] font-semibold text-[var(--ms-label-3)]">
                {group === "unassigned" && <ShieldAlert size={12} className="text-[var(--ms-warn)]" aria-hidden="true" />}
                {GROUP_TITLE[group]}
              </h3>
              <ul>{rows.map((c) => <ChaseRow key={c.item.key} chase={c} nav={nav} showMilestone={many} />)}</ul>
            </div>
          ))
        ) : (
          <Empty>No open decisions waiting on someone outside the program.</Empty>
        )}
      </Section>
      <ContractsToReview />
    </>
  );
}