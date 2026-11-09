"use client";

import {
  CalendarX,
  CornerDownRight,
  Flame,
  Hourglass,
  Link2,
  RefreshCcw,
  ShieldAlert,
  ShieldCheck,
  Shrink,
  TriangleAlert,
  Undo2,
  Unlink,
  UserRoundX,
  UserX,
} from "lucide-react";
import { useState } from "react";
import { epicSpan, isSevere, scheduleSummary, sortedKeys, warningTitle } from "@/lib/milestoneInsights";
import type { MilestoneWarning, StatusRef, TeamEpic, WorkItem } from "@/lib/milestoneTypes";
import { cn } from "@/lib/utils";
import { AssigneeLabel, ProgressBar, StatusDot, TeamBadge } from "./MilestoneBits";
import { useMilestone } from "./MilestoneContext";

// Rows and chips shared by the milestone tabs, the team page and the
// inspector. They read the milestone from context so a key can be resolved to
// its title, status and criticality wherever it appears.

export function Team({ team, className }: { team: string; className?: string }) {
  const { colors } = useMilestone();
  return <TeamBadge team={team} color={colors.get(team)} className={className} />;
}

export function CriticalBadge() {
  return (
    <span
      title="On the critical path: a delay here delays the milestone."
      className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[var(--ms-critical-fill)] px-1.5 py-[2px] text-[10.5px] font-semibold text-[var(--ms-critical-text)]"
    >
      <Flame size={10} className="fill-current" aria-hidden="true" />
      Critical path
    </span>
  );
}

function resolve(key: string, index: ReturnType<typeof useMilestone>["index"]) {
  const inc = index.increments.get(key);
  const epic = index.epics.get(key);
  const item = index.items.get(key);
  return {
    known: !!(inc || epic || item),
    title: inc?.summary ?? epic?.summary ?? item?.summary ?? null,
    status: (inc?.status ?? epic?.status ?? item?.status ?? null) as StatusRef | null,
    critical: !!item?.schedule?.critical || !!epic?.onCriticalPath,
  };
}

/**
 * A navigable key. Neutral capsules: a list of chips each tinted by team or
 * criticality turned whole panels pink, so criticality is a glyph, not a fill.
 */
export function IssueChip({ issueKey, showTitle = false }: { issueKey: string; showTitle?: boolean }) {
  const { index, inspect, selectedKey } = useMilestone();
  const r = resolve(issueKey, index);
  const content = (
    <>
      {r.status && <StatusDot status={r.status} className="h-1.5 w-1.5" />}
      <span className="shrink-0 whitespace-nowrap font-mono text-[11px] font-medium text-[var(--ms-label)]">{issueKey}</span>
      {showTitle && r.title && <span className="min-w-0 truncate text-[11.5px] text-[var(--ms-label-2)]">{r.title}</span>}
      {r.critical && <Flame size={10} className="shrink-0 fill-current text-[var(--ms-critical)]" aria-label="critical" />}
    </>
  );
  const className = cn(
    "inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-full px-2 py-[3px] transition-colors",
    selectedKey === issueKey ? "bg-[color-mix(in_srgb,var(--ms-accent)_18%,transparent)]" : "bg-[var(--ms-fill-2)]",
  );
  if (!r.known) {
    return (
      <span className={className} title={`${issueKey} isn’t part of this milestone`}>
        {content}
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        inspect(issueKey);
      }}
      title={r.title ? `${issueKey} — ${r.title}` : issueKey}
      className={cn(className, "hover:bg-[var(--ms-fill)]")}
    >
      {content}
    </button>
  );
}

/** One work item: what it is, whose it is, what it unblocks. Click to inspect. */
export function WorkItemRow({
  item,
  showTeam = true,
  crossTeams,
}: {
  item: WorkItem;
  showTeam?: boolean;
  /** Other teams this item is linked to — the point of the cross-team lists. */
  crossTeams?: string[];
}) {
  const { inspect, selectedKey } = useMilestone();
  const selected = selectedKey === item.key;
  const critical = !!item.schedule?.critical;
  return (
    <li>
      <button
        type="button"
        onClick={() => inspect(item.key)}
        aria-current={selected ? "true" : undefined}
        title={item.schedule ? scheduleSummary(item.schedule) : item.status.name}
        className={cn(
          "flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors",
          selected ? "bg-[color-mix(in_srgb,var(--ms-accent)_15%,transparent)]" : "hover:bg-[var(--ms-fill-2)]",
        )}
      >
        <span className="flex w-4 shrink-0 justify-center">
          {critical ? (
            <Flame size={13} className="fill-current text-[var(--ms-critical)]" aria-label="On the critical path" />
          ) : (
            <StatusDot status={item.status} className="h-1.5 w-1.5" />
          )}
        </span>
        <span className="w-[72px] shrink-0 truncate font-mono text-[11.5px] text-[var(--ms-label-3)]">{item.key}</span>
        <span className="min-w-0 flex-1 truncate text-[13px] text-[var(--ms-label)]">{item.summary}</span>
        {item.outsideDecision && <OutsideDecisionBadge dueDate={item.dueDate} />}
        {crossTeams?.map((t) => <Team key={t} team={t} className="hidden md:inline-flex" />)}
        {showTeam && <Team team={item.team} className="hidden sm:inline-flex" />}
        {item.schedule && item.schedule.downstream > 0 && (
          <span
            className="flex shrink-0 items-center gap-0.5 text-[11.5px] tabular-nums text-[var(--ms-label-3)]"
            title={`Unblocks ${item.schedule.downstream} item${item.schedule.downstream === 1 ? "" : "s"}`}
          >
            <CornerDownRight size={12} aria-hidden="true" />
            {item.schedule.downstream}
          </span>
        )}
        <span className="flex w-[104px] shrink-0 justify-end">
          <AssigneeLabel name={item.assignee} />
        </span>
      </button>
    </li>
  );
}

/** dd/mm/yyyy from Jira's YYYY-MM-DD. */
function formatDueDate(iso: string) {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

/** Waits on a decision owned outside the program, with its due date. */
export function OutsideDecisionBadge({ dueDate }: { dueDate: string | null }) {
  return (
    <span
      title="Waits on a decision owned outside the program (label external). Someone in the program chases it."
      className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[color-mix(in_srgb,var(--ms-warn)_12%,transparent)] px-1.5 py-[2px] text-[10.5px] font-semibold text-[var(--ms-warn-text)]"
    >
      <Hourglass size={10} aria-hidden="true" />
      Outside decision{dueDate ? ` · due ${formatDueDate(dueDate)}` : ""}
    </span>
  );
}

export function EpicRow({ epic }: { epic: TeamEpic }) {
  const { inspect, selectedKey } = useMilestone();
  const span = epicSpan(epic);
  const selected = selectedKey === epic.key;
  return (
    <li>
      <button
        type="button"
        onClick={() => inspect(epic.key)}
        aria-current={selected ? "true" : undefined}
        className={cn(
          "flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors",
          selected ? "bg-[color-mix(in_srgb,var(--ms-accent)_15%,transparent)]" : "hover:bg-[var(--ms-fill-2)]",
        )}
      >
        <StatusDot status={epic.status} />
        <span className="w-[72px] shrink-0 truncate font-mono text-[11.5px] text-[var(--ms-label-3)]">{epic.key}</span>
        <span className="min-w-0 flex-1 truncate text-[13px] text-[var(--ms-label)]">{epic.summary}</span>
        {epic.standIn && (
          <span className="shrink-0 rounded-full bg-[var(--ms-warn-fill)] px-1.5 py-[1px] text-[10px] font-semibold text-[var(--ms-warn-text)]" title="The increment has no open team epics yet; it stands in for its own work">
            No team epics
          </span>
        )}
        {epic.designApproved && <ShieldCheck size={13} className="shrink-0 text-[var(--ms-ready)]" aria-label="Decision log approved" />}
        {epic.onCriticalPath && <Flame size={13} className="shrink-0 fill-current text-[var(--ms-critical)]" aria-label="On the critical path" />}
        {span && (
          <span className="hidden shrink-0 text-[11.5px] tabular-nums text-[var(--ms-label-3)] sm:inline" title="Remaining work spans these steps">
            {span}
          </span>
        )}
        <ProgressBar progress={epic.progress} className="w-[90px] shrink-0" />
      </button>
    </li>
  );
}

const WARNING_ICON: Record<string, React.ComponentType<{ size?: number; className?: string; "aria-hidden"?: boolean }>> = {
  cycle: RefreshCcw,
  "undeclared-dependency": Link2,
  "unbacked-dependency": Unlink,
  "out-of-order-dependency": Undo2,
  "external-blocker": Shrink,
  "no-team-epics": UserX,
  unscheduled: CalendarX,
  "unassigned-critical": UserRoundX,
  "unapproved-design": ShieldAlert,
  "unowned-outside-decision": Hourglass,
};

/**
 * Warnings of one kind, in first-seen order. Three "Unscheduled" rows saying the
 * same thing about three keys pushed the program roadmap below the fold; one row
 * per kind lists every message and every key.
 */
export function groupWarningsByKind(warnings: MilestoneWarning[]): MilestoneWarning[][] {
  const groups = new Map<string, MilestoneWarning[]>();
  for (const w of warnings) {
    const group = groups.get(w.kind);
    if (group) group.push(w);
    else groups.set(w.kind, [w]);
  }
  return [...groups.values()];
}

const COLLAPSED_MESSAGES = 4;

/**
 * Warnings of one kind: symbol, title and messages, tinted red when they make the
 * plan wrong and orange when it's hygiene. Keys are sorted so the same warning
 * always reads the same way.
 */
export function WarningRow({ warnings, chip }: { warnings: MilestoneWarning[]; chip?: (key: string) => React.ReactNode }) {
  const [expanded, setExpanded] = useState(false);
  const kind = warnings[0].kind;
  const Icon = WARNING_ICON[kind] ?? TriangleAlert;
  const severe = isSevere(kind);
  const shown = expanded ? warnings : warnings.slice(0, COLLAPSED_MESSAGES);
  const keys = sortedKeys([...new Set(warnings.flatMap((w) => w.keys))]);
  return (
    <li
      className={cn("flex gap-3 rounded-xl px-3 py-2.5", severe ? "bg-[color-mix(in_srgb,var(--ms-critical)_7%,transparent)]" : "bg-[color-mix(in_srgb,var(--ms-warn)_8%,transparent)]")}
    >
      <Icon size={18} aria-hidden={true} className={cn("mt-0.5 shrink-0", severe ? "text-[var(--ms-critical)]" : "text-[var(--ms-warn)]")} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <h3 className="text-[13px] font-semibold text-[var(--ms-label)]">{warningTitle(kind)}</h3>
          {warnings.length > 1 && <span className="text-[11.5px] font-semibold tabular-nums text-[var(--ms-label-3)]">{warnings.length}</span>}
          <span className={cn("text-[10.5px] font-semibold", severe ? "text-[var(--ms-critical-text)]" : "text-[var(--ms-warn-text)]")}>
            {severe ? "Needs attention" : "Hygiene"}
          </span>
        </div>
        {shown.map((w, i) => (
          <p key={i} className="mt-0.5 text-[12.5px] leading-snug text-[var(--ms-label-2)]">
            {w.message}
          </p>
        ))}
        {warnings.length > COLLAPSED_MESSAGES && (
          <button
            type="button"
            onClick={() => setExpanded((e) => !e)}
            className="mt-0.5 text-[12.5px] font-medium text-[var(--ms-accent-text)] hover:underline"
          >
            {expanded ? "Show fewer" : `Show all ${warnings.length}`}
          </button>
        )}
        {keys.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1">{keys.map((k) => <span key={k}>{chip ? chip(k) : <IssueChip issueKey={k} />}</span>)}</div>
        )}
      </div>
    </li>
  );
}
