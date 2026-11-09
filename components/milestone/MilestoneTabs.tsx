"use client";

import { useMemo } from "react";
import {
  BadgeCheck,
  CircleCheck,
  CirclePlay,
  CircleDashed,
  CornerDownRight,
  Layers,
  Link2,
  Search,
  SquareStack,
  Hourglass,
  TriangleAlert,
  UserX,
  Users,
} from "lucide-react";
import {
  LINK_EVIDENCE,
  filterBlockers,
  filterIncrements,
  filterItems,
  filterWarnings,
  incrementLinks,
  plural,
  steps,
} from "@/lib/milestoneInsights";
import type { LinkEvidence } from "@/lib/milestoneInsights";
import type { BlockerEpic, Increment, WorkItem } from "@/lib/milestoneTypes";
import { cn } from "@/lib/utils";
import { Card, EmptyState, ProgressBar, SectionHeader, StatusPill } from "./MilestoneBits";
import { useMilestone } from "./MilestoneContext";
import { CriticalBadge, groupWarningsByKind, IssueChip, Team, WarningRow, WorkItemRow } from "./MilestoneRows";
import { CriticalChainPanel } from "./InsightPanels";

// The milestone's list tabs, after the mac app's BlockerEpicsView,
// IncrementsView and ReadinessView. Every one honours the filter.

export function NoMatches({ query, onClear }: { query: string; onClear: () => void }) {
  return (
    <EmptyState
      icon={<Search size={36} strokeWidth={1.5} />}
      title={`No results for “${query.trim()}”`}
      message="Check the spelling or try a broader filter."
      action={
        <button type="button" onClick={onClear} className="rounded-full bg-[var(--ms-fill)] px-3.5 py-1.5 text-[13px] font-medium text-[var(--ms-label)] hover:bg-[var(--ms-sep-strong)]">
          Clear filter
        </button>
      }
    />
  );
}

/** Selected cards get the accent ring; others a hover lift. Click inspects. */
function cardClass(selected: boolean) {
  return cn(
    "ms-hover-card rounded-2xl bg-[var(--ms-surface)] p-4 text-left shadow-[var(--ms-shadow-card)] cursor-default",
    selected && "ms-selected-card",
  );
}

/** Lets a whole card act as one control without nesting buttons inside a button. */
function activate(fn: () => void) {
  return {
    role: "button" as const,
    tabIndex: 0,
    onClick: fn,
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.target !== e.currentTarget) return;
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        fn();
      }
    },
  };
}

// ── Blockers ────────────────────────────────────────────────────────────────

function Metric({ value, label, icon }: { value: number; label: string; icon: React.ReactNode }) {
  return (
    <span className="flex items-center gap-1.5 whitespace-nowrap">
      <span className="text-[var(--ms-label-3)]" aria-hidden="true">{icon}</span>
      <span className="text-[14px] font-semibold tabular-nums text-[var(--ms-label)]">{value}</span>
      <span className="text-[12.5px] text-[var(--ms-label-2)]">{label}</span>
    </span>
  );
}

function BlockerCard({ blocker, rank }: { blocker: BlockerEpic; rank: number }) {
  const { index, inspect, selectedKey } = useMilestone();
  const epic = index.epics.get(blocker.epicKey);
  const selected = selectedKey === blocker.epicKey;
  return (
    <li
      {...activate(() => inspect(blocker.epicKey))}
      aria-current={selected ? "true" : undefined}
      aria-label={`${rank}. ${blocker.epicKey}, ${epic?.summary ?? ""}, holds up ${plural(blocker.downstreamItems, "item")}`}
      className={cn(cardClass(selected), "flex gap-4")}
    >
      <span
        className={cn(
          "flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full text-[14px] font-semibold tabular-nums",
          blocker.onCriticalPath ? "bg-[var(--ms-critical-fill)] text-[var(--ms-critical-text)]" : "bg-[var(--ms-fill)] text-[var(--ms-label-2)]",
        )}
        aria-hidden="true"
      >
        {rank}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-2.5">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-mono text-[12px] text-[var(--ms-label-3)]">{blocker.epicKey}</span>
          <span className="min-w-0 flex-1 truncate text-[15px] font-semibold text-[var(--ms-label)]">{epic?.summary ?? blocker.epicKey}</span>
          {blocker.onCriticalPath && <CriticalBadge />}
          <Team team={blocker.team} />
        </div>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5">
          <Metric value={blocker.remaining} label="remaining" icon={<CircleDashed size={14} />} />
          <Metric value={blocker.downstreamItems} label={blocker.downstreamItems === 1 ? "item waiting" : "items waiting"} icon={<CornerDownRight size={14} />} />
          <Metric value={blocker.blockedEpics.length} label={blocker.blockedEpics.length === 1 ? "epic blocked" : "epics blocked"} icon={<Layers size={14} />} />
          {blocker.blockedTeams.length > 0 && (
            <Metric value={blocker.blockedTeams.length} label={blocker.blockedTeams.length === 1 ? "other team" : "other teams"} icon={<Users size={14} />} />
          )}
          {epic && (
            <span className="flex items-center gap-2" title={`${epic.progress.done} of ${epic.progress.total} done`}>
              <ProgressBar progress={epic.progress} className="w-[140px]" />
              <span className="text-[11.5px] tabular-nums text-[var(--ms-label-3)]">
                {epic.progress.done}/{epic.progress.total}
              </span>
            </span>
          )}
        </div>
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-3 gap-y-1.5">
          <dt className="text-[11.5px] font-semibold text-[var(--ms-label-3)]">Blocks</dt>
          <dd className="flex flex-wrap gap-1">
            {blocker.blockedEpics.map((k) => (
              <IssueChip key={k} issueKey={k} showTitle />
            ))}
            {blocker.blockedTeams.map((t) => (
              <Team key={t} team={t} />
            ))}
          </dd>
          {blocker.gatingItems.length > 0 && (
            <>
              <dt className="text-[11.5px] font-semibold text-[var(--ms-label-3)]">Unblock first</dt>
              <dd className="flex flex-wrap gap-1">
                {blocker.gatingItems.map((k) => (
                  <IssueChip key={k} issueKey={k} showTitle />
                ))}
              </dd>
            </>
          )}
        </dl>
      </div>
    </li>
  );
}

export function BlockersTab({ query, onClearQuery }: { query: string; onClearQuery: () => void }) {
  const { detail } = useMilestone();
  const rows = useMemo(() => filterBlockers(detail, query), [detail, query]);
  return (
    <div className="mx-auto grid max-w-[1400px] gap-5 p-6 xl:grid-cols-[minmax(0,1fr)_380px]">
      <div className="flex min-w-0 flex-col gap-3">
        {detail.blockerEpics.length === 0 ? (
          <EmptyState
            icon={<BadgeCheck size={40} strokeWidth={1.4} />}
            title="No epic is blocking another"
            message="None of the remaining work in this milestone gates an epic outside its own."
          />
        ) : rows.length === 0 ? (
          <NoMatches query={query} onClear={onClearQuery} />
        ) : (
          <>
            <p className="text-[13px] text-[var(--ms-label-2)]">
              Epics whose unfinished work holds up other epics. Finish their gating items first — or move them to a team with capacity.
            </p>
            <ol className="flex flex-col gap-3">
              {rows.map(({ blocker, rank }) => (
                <BlockerCard key={blocker.epicKey} blocker={blocker} rank={rank} />
              ))}
            </ol>
          </>
        )}
      </div>
      <div className="min-w-0 xl:sticky xl:top-6 xl:self-start">
        <CriticalChainPanel />
      </div>
    </div>
  );
}

// ── Increments ──────────────────────────────────────────────────────────────

const EVIDENCE_STYLE: Record<LinkEvidence, { icon: React.ReactNode; tint: string }> = {
  "declared-and-backed": { icon: <CircleCheck size={13} />, tint: "var(--ms-ready-text)" },
  "declared-only": { icon: <Link2 size={13} />, tint: "var(--ms-label-2)" },
  "derived-only": { icon: <Link2 size={13} />, tint: "var(--ms-warn-text)" },
};

export function Evidence({ evidence, compact = false }: { evidence: LinkEvidence; compact?: boolean }) {
  const { icon, tint } = EVIDENCE_STYLE[evidence];
  const { label, help } = LINK_EVIDENCE[evidence];
  return (
    <span className="inline-flex shrink-0 items-center gap-1 text-[11.5px] font-medium" style={{ color: tint }} title={help} aria-label={compact ? label : undefined}>
      <span aria-hidden="true" className="flex">{icon}</span>
      {!compact && label}
    </span>
  );
}

function LinkRows({ title, links }: { title: string; links: ReturnType<typeof incrementLinks> }) {
  return links.map((link, i) => (
    <div key={link.key} className="contents">
      <dt className="text-[11.5px] font-semibold text-[var(--ms-label-3)]">{i === 0 ? title : ""}</dt>
      <dd className="min-w-0">
        <IssueChip issueKey={link.key} showTitle />
      </dd>
      <dd>
        <Evidence evidence={link.evidence} />
      </dd>
    </div>
  ));
}

function IncrementCard({ increment }: { increment: Increment }) {
  const { inspect, selectedKey } = useMilestone();
  const selected = selectedKey === increment.key;
  const blocks = incrementLinks(increment.blocks, increment.derivedBlocks);
  const blockedBy = incrementLinks(increment.blockedBy, increment.derivedBlockedBy);
  const title = increment.capabilities.map((c) => c.summary).join(" + ") || increment.summary;
  return (
    <li {...activate(() => inspect(increment.key))} aria-current={selected ? "true" : undefined} className={cn(cardClass(selected), "flex flex-col gap-3")}>
      <div className="flex items-center gap-2">
        <span className="font-mono text-[12px] text-[var(--ms-label-3)]">{increment.key}</span>
        <span className="ml-auto flex items-center gap-1.5">
          {increment.criticalItems > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-[var(--ms-critical-fill)] px-1.5 py-[2px] text-[10.5px] font-semibold text-[var(--ms-critical-text)]">
              {increment.criticalItems} critical
            </span>
          )}
          <StatusPill status={increment.status} />
        </span>
      </div>
      <div>
        <h3 className="text-[16px] font-semibold leading-snug text-[var(--ms-label)]">{title}</h3>
        {title !== increment.summary && <p className="mt-0.5 text-[12.5px] text-[var(--ms-label-2)]">{increment.summary}</p>}
      </div>
      <div className="flex items-center gap-2.5">
        <ProgressBar progress={increment.progress} className="flex-1" />
        <span className="shrink-0 text-[11.5px] tabular-nums text-[var(--ms-label-3)]">
          {increment.progress.done}/{increment.progress.total}
          {increment.earliestFinish !== null && increment.earliestFinish > 0 && (
            <span title="If every team works the plan, its last remaining item finishes at this step"> · done after {steps(increment.earliestFinish)}</span>
          )}
        </span>
      </div>
      {increment.teamEpics.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          <span className="text-[11.5px] font-semibold text-[var(--ms-label-3)]">Team epics</span>
          <div className="flex flex-wrap gap-1">
            {increment.teamEpics.map((e) => (
              <IssueChip key={e.key} issueKey={e.key} showTitle />
            ))}
          </div>
        </div>
      ) : (
        <p className="flex items-center gap-1.5 text-[12.5px] font-medium text-[var(--ms-warn-text)]">
          <UserX size={14} aria-hidden="true" /> No team epics implement this yet
        </p>
      )}
      {(blocks.length > 0 || blockedBy.length > 0) && (
        <dl className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-2.5 gap-y-1.5 border-t border-[var(--ms-sep)] pt-3">
          <LinkRows title="Blocks" links={blocks} />
          <LinkRows title="Blocked by" links={blockedBy} />
        </dl>
      )}
    </li>
  );
}

export function IncrementsTab({ query, onClearQuery }: { query: string; onClearQuery: () => void }) {
  const { detail } = useMilestone();
  const increments = useMemo(() => filterIncrements(detail, query), [detail, query]);
  if (detail.increments.length === 0) {
    return (
      <EmptyState
        icon={<SquareStack size={40} strokeWidth={1.4} />}
        title="No increments"
        message="No delivery epics have this milestone as their fix version."
      />
    );
  }
  if (increments.length === 0) return <NoMatches query={query} onClear={onClearQuery} />;
  return (
    <ul className="mx-auto grid max-w-[1400px] items-start gap-3.5 p-6 [grid-template-columns:repeat(auto-fill,minmax(min(100%,420px),1fr))]">
      {increments.map((inc) => (
        <IncrementCard key={inc.key} increment={inc} />
      ))}
    </ul>
  );
}

// ── Ready & warnings ────────────────────────────────────────────────────────

export function ReadyTab({ query, matches }: { query: string; matches: Set<string> | null }) {
  const { detail, index } = useMilestone();
  const ready = useMemo(() => detail.readyNow.map((k) => index.items.get(k)).filter((i): i is WorkItem => !!i), [detail, index]);
  const shownReady = filterItems(ready, matches);
  const outside = useMemo(
    () => (detail.outsideDecisions ?? []).map((k) => index.items.get(k)).filter((i): i is WorkItem => !!i),
    [detail, index],
  );
  const shownOutside = filterItems(outside, matches);
  const warnings = useMemo(() => filterWarnings(detail, detail.warnings, query), [detail, query]);
  const filtering = !!query.trim();
  return (
    <div className="mx-auto grid max-w-[1400px] items-start gap-5 p-6 min-[1100px]:grid-cols-[minmax(0,1.35fr)_minmax(340px,1fr)]">
      <Card className="flex min-w-0 flex-col gap-2">
        <SectionHeader title="Ready now" icon={<CirclePlay size={15} />} count={shownReady.length} />
        <p className="text-[12px] text-[var(--ms-label-3)]">Every blocker is done. Critical-path work first, then by how much it unblocks.</p>
        {shownReady.length === 0 ? (
          <p className="py-2 text-[13px] text-[var(--ms-label-3)]">{filtering && ready.length ? "No matches." : "Nothing is ready to start."}</p>
        ) : (
          <ul className="-mx-2 flex flex-col">
            {shownReady.map((item) => (
              <WorkItemRow key={item.key} item={item} />
            ))}
          </ul>
        )}
        {outside.length > 0 && (
          <>
            <SectionHeader title="Waiting on outside decisions" icon={<Hourglass size={15} />} count={shownOutside.length} />
            <p className="text-[12px] text-[var(--ms-label-3)]">
              Owned outside the program (label external). The assignee chases the answer. Soonest due first.
            </p>
            {shownOutside.length === 0 ? (
              <p className="py-2 text-[13px] text-[var(--ms-label-3)]">No matches.</p>
            ) : (
              <ul className="-mx-2 flex flex-col">
                {shownOutside.map((item) => (
                  <WorkItemRow key={item.key} item={item} />
                ))}
              </ul>
            )}
          </>
        )}
      </Card>
      {/* Stacked below 1100px the ready list runs to dozens of rows, so the few
          warnings move above it rather than a long scroll below. */}
      <Card className={cn("flex min-w-0 flex-col gap-2.5", warnings.length > 0 && "max-[1099px]:order-first")}>
        <SectionHeader title="Warnings" icon={<TriangleAlert size={15} />} count={warnings.length} />
        {detail.warnings.length === 0 ? (
          <p className="flex items-center gap-1.5 py-1 text-[13px] font-medium text-[var(--ms-ready-text)]">
            <BadgeCheck size={16} aria-hidden="true" /> No warnings — the plan is consistent.
          </p>
        ) : warnings.length === 0 ? (
          <p className="py-2 text-[13px] text-[var(--ms-label-3)]">No matches.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {groupWarningsByKind(warnings).map((group) => (
              <WarningRow key={group[0].kind} warnings={group} />
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
