import type { MilestoneDetail, ProgramOverview, ProgramRelease, TeamEpic, WorkItem } from "@/lib/milestoneTypes";

// ── "My work" ───────────────────────────────────────────────────────────────
//
// What to do next, across every open milestone of the program: a developer's
// ready queue for one team, and a lead's decisions to review and chase. Pure
// over already-fetched milestone details, so it is tested without rendering.

export type MyWorkMode = "lead" | "developer";

export const DEFAULT_MODE: MyWorkMode = "developer";

/** The LA dashboard artifact the lead's "Asks for you" row opens. */
export const ASKS_FOR_YOU_URL = "https://claude.ai/artifact/2PH5FEeiXs1pUaQx2hfTep";

/** A decision due within this many days reads as "soon". */
export const DUE_SOON_DAYS = 7;

const DAY_MS = 86_400_000;

/** Natural key order: LAD-9 before LAD-10. */
const compareIssueKeys = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true });

export interface Me {
  /** Atlassian accountId. */
  id: string;
  name: string | null;
}

export interface MilestoneEntry {
  /** Fix-version id, as used in /program/<key>/<id>. */
  id: string;
  name: string;
  /** Position in the delivery space's release order. */
  sequence: number;
  detail: MilestoneDetail;
}

export type Reason =
  | { kind: "critical" }
  | { kind: "unblocks"; count: number }
  | { kind: "cross-team"; teams: string[] };

export interface RankedItem {
  item: WorkItem;
  milestone: Pick<MilestoneEntry, "id" | "name">;
  mine: boolean;
  /** Why it ranks where it does, most important first. */
  reasons: Reason[];
}

export type DueState = "overdue" | "soon" | "later" | "none";

export interface Chase extends Omit<RankedItem, "reasons"> {
  group: "mine" | "unassigned" | "others";
  due: DueState;
}

export interface DecisionLog {
  epic: TeamEpic;
  milestone: Pick<MilestoneEntry, "id" | "name">;
}

export interface DeveloperView {
  inProgress: RankedItem[];
  ready: RankedItem[];
}

export interface LeadView {
  decisionLogs: DecisionLog[];
  outsideDecisions: Chase[];
}

// ── Which milestones ────────────────────────────────────────────────────────

/** Unreleased, unarchived releases, in the program's release order. */
export function activeReleases(overview: ProgramOverview): ProgramRelease[] {
  return overview.releases.filter((r) => !r.released && !r.archived).toSorted((a, b) => a.sequence - b.sequence);
}

// ── Who is me ───────────────────────────────────────────────────────────────

/** Matches on accountId only: display names collide and change. */
export function isMine(person: { assigneeId?: string | null }, me: Me | null): boolean {
  return !!me && !!person.assigneeId && person.assigneeId === me.id;
}

const isOpen = (status: { category: string }) => status.category !== "done";

/** A work item someone does: not a link target from outside, not an epic standing in for missing items. */
const isWork = (item: WorkItem) => !item.external && !item.placeholder;

interface Located {
  entry: MilestoneEntry;
  item: WorkItem;
  /** In its milestone's readyNow list. */
  ready: boolean;
}

/**
 * Every work item once. A team epic can implement increments in two milestones
 * and an external blocker can be pulled into several; the milestone that ships
 * first owns the item.
 */
function uniqueItems(entries: MilestoneEntry[]): Located[] {
  const seen = new Set<string>();
  const out: Located[] = [];
  for (const entry of entries.toSorted((a, b) => a.sequence - b.sequence)) {
    const ready = new Set(entry.detail.readyNow);
    for (const item of entry.detail.items) {
      if (seen.has(item.key)) continue;
      seen.add(item.key);
      out.push({ entry, item, ready: ready.has(item.key) });
    }
  }
  return out;
}

/** Dev fixtures have no Jira login: act as whoever has the most open assignments. */
export function mostFrequentAssignee(entries: MilestoneEntry[]): Me | null {
  const counts = new Map<string, { name: string | null; count: number }>();
  for (const { item } of uniqueItems(entries)) {
    if (!item.assigneeId || !isOpen(item.status) || !isWork(item)) continue;
    const seen = counts.get(item.assigneeId);
    if (seen) seen.count++;
    else counts.set(item.assigneeId, { name: item.assignee, count: 1 });
  }
  const ranked = [...counts].toSorted(([ia, a], [ib, b]) => b.count - a.count || ia.localeCompare(ib));
  const top = ranked[0];
  return top ? { id: top[0], name: top[1].name } : null;
}

// ── Mode ────────────────────────────────────────────────────────────────────

export function parseMode(param: string | null, saved: string | null): MyWorkMode {
  for (const v of [param, saved]) if (v === "lead" || v === "developer") return v;
  return DEFAULT_MODE;
}

// ── Developer ───────────────────────────────────────────────────────────────

export function teamNames(entries: MilestoneEntry[]): string[] {
  const names = new Set(entries.flatMap(({ detail }) => detail.teams.map((t) => t.name)));
  return [...names].toSorted((a, b) => a.localeCompare(b));
}

/** The team where I have the most open items; with none, the team with the most ready work. */
export function defaultTeam(entries: MilestoneEntry[], me: Me | null): string | null {
  const mine = new Map<string, number>();
  const ready = new Map<string, number>();
  for (const { item, ready: isReady } of uniqueItems(entries)) {
    if (!isWork(item)) continue;
    if (isOpen(item.status) && isMine(item, me)) mine.set(item.team, (mine.get(item.team) ?? 0) + 1);
    if (isReady) ready.set(item.team, (ready.get(item.team) ?? 0) + 1);
  }
  const top = (counts: Map<string, number>) =>
    [...counts].toSorted(([na, a], [nb, b]) => b - a || na.localeCompare(nb))[0]?.[0] ?? null;
  return top(mine) ?? top(ready);
}

function reasonsFor(item: WorkItem): Reason[] {
  const s = item.schedule;
  if (!s) return [];
  const reasons: Reason[] = [];
  if (s.critical) reasons.push({ kind: "critical" });
  if (s.downstream > 0) reasons.push({ kind: "unblocks", count: s.downstream });
  if (s.downstreamTeams.length > 0) reasons.push({ kind: "cross-team", teams: s.downstreamTeams });
  return reasons;
}

export function reasonLabel(reason: Reason): string {
  switch (reason.kind) {
    case "critical":
      return "Critical path";
    case "unblocks":
      return `Unblocks ${reason.count}`;
    case "cross-team":
      return `Cross-team: ${reason.teams.join(", ")}`;
  }
}

function ranked(entry: MilestoneEntry, item: WorkItem, me: Me | null): RankedItem {
  return { item, milestone: { id: entry.id, name: entry.name }, mine: isMine(item, me), reasons: reasonsFor(item) };
}

const byImpact = (a: RankedItem, b: RankedItem) =>
  Number(!!b.item.schedule?.critical) - Number(!!a.item.schedule?.critical) ||
  (b.item.schedule?.downstream ?? 0) - (a.item.schedule?.downstream ?? 0);

/** Same impact: the milestone that ships first, then the earlier step, then key order. */
function bySchedule(entries: MilestoneEntry[]) {
  const sequence = new Map(entries.map((e) => [e.id, e.sequence]));
  return (a: RankedItem, b: RankedItem) =>
    (sequence.get(a.milestone.id) ?? 0) - (sequence.get(b.milestone.id) ?? 0) ||
    (a.item.schedule?.earliestStart ?? 0) - (b.item.schedule?.earliestStart ?? 0) ||
    compareIssueKeys(a.item.key, b.item.key);
}

/**
 * In progress and mine, and the team's ready queue (not yet started): mine
 * first, then critical path, then how much the item unblocks.
 */
export function developerView(entries: MilestoneEntry[], me: Me | null, team: string | null): DeveloperView {
  if (!team) return { inProgress: [], ready: [] };
  const tiebreak = bySchedule(entries);
  const inProgress: RankedItem[] = [];
  const ready: RankedItem[] = [];
  for (const { entry, item, ready: isReady } of uniqueItems(entries)) {
    if (item.team !== team || !isWork(item)) continue;
    if (item.status.category === "indeterminate" && isMine(item, me)) inProgress.push(ranked(entry, item, me));
    else if (isReady && item.status.category === "new") ready.push(ranked(entry, item, me));
  }
  inProgress.sort((a, b) => byImpact(a, b) || tiebreak(a, b));
  ready.sort((a, b) => Number(b.mine) - Number(a.mine) || byImpact(a, b) || tiebreak(a, b));
  return { inProgress, ready };
}

/** Ready, not started and assigned to me, in any team: the sidebar's count. */
export function readyMineCount(entries: MilestoneEntry[], me: Me | null): number {
  if (!me) return 0;
  return uniqueItems(entries).filter(({ item, ready }) => ready && isWork(item) && item.status.category === "new" && isMine(item, me)).length;
}

// ── Lead ────────────────────────────────────────────────────────────────────

export function addDays(isoDay: string, days: number): string {
  return new Date(Date.parse(`${isoDay}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

export function dueState(dueDate: string | null, today: string): DueState {
  if (!dueDate) return "none";
  if (dueDate < today) return "overdue";
  return dueDate <= addDays(today, DUE_SOON_DAYS) ? "soon" : "later";
}

const DUE_ORDER: Record<DueState, number> = { overdue: 0, soon: 1, later: 2, none: 3 };
const GROUP_ORDER: Record<Chase["group"], number> = { mine: 0, unassigned: 1, others: 2 };

/**
 * Open team epics whose decision log isn't signed off, the critical path first,
 * then the earliest start. Increments standing in for missing epics are not epics.
 */
export function decisionLogsToReview(entries: MilestoneEntry[]): DecisionLog[] {
  const sequence = new Map(entries.map((e) => [e.id, e.sequence]));
  const seen = new Set<string>();
  const logs: DecisionLog[] = [];
  for (const entry of entries.toSorted((a, b) => a.sequence - b.sequence)) {
    for (const epic of entry.detail.epics) {
      if (epic.standIn || epic.designApproved || !isOpen(epic.status) || seen.has(epic.key)) continue;
      seen.add(epic.key);
      logs.push({ epic, milestone: { id: entry.id, name: entry.name } });
    }
  }
  return logs.sort(
    (a, b) =>
      Number(b.epic.onCriticalPath) - Number(a.epic.onCriticalPath) ||
      (a.epic.earliestStart ?? Infinity) - (b.epic.earliestStart ?? Infinity) ||
      (sequence.get(a.milestone.id) ?? 0) - (sequence.get(b.milestone.id) ?? 0) ||
      compareIssueKeys(a.epic.key, b.epic.key),
  );
}

/**
 * Open items waiting on a decision owned outside the program: mine first, then
 * the unassigned ones nobody chases, then the rest; overdue before soon within
 * each. An item pulled into several milestones is listed once, in the first.
 */
export function outsideDecisionsToChase(entries: MilestoneEntry[], me: Me | null, today: string): Chase[] {
  const out: Chase[] = [];
  for (const { entry, item } of uniqueItems(entries)) {
    if (!item.outsideDecision || item.placeholder || !isOpen(item.status)) continue;
    const mine = isMine(item, me);
    out.push({
      item,
      milestone: { id: entry.id, name: entry.name },
      mine,
      group: mine ? "mine" : item.assignee || item.assigneeId ? "others" : "unassigned",
      due: dueState(item.dueDate, today),
    });
  }
  return out.sort(
    (a, b) =>
      GROUP_ORDER[a.group] - GROUP_ORDER[b.group] ||
      DUE_ORDER[a.due] - DUE_ORDER[b.due] ||
      (a.item.dueDate ?? "").localeCompare(b.item.dueDate ?? "") ||
      compareIssueKeys(a.item.key, b.item.key),
  );
}

export function leadView(entries: MilestoneEntry[], me: Me | null, today: string): LeadView {
  return { decisionLogs: decisionLogsToReview(entries), outsideDecisions: outsideDecisionsToChase(entries, me, today) };
}

// ── Navigation ──────────────────────────────────────────────────────────────

/** The milestone page with the item selected; `milestoneHref` may already carry `?fixture=`. */
export function itemHref(milestoneHref: string, key: string): string {
  return `${milestoneHref}${milestoneHref.includes("?") ? "&" : "?"}item=${encodeURIComponent(key)}`;
}