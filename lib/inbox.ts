import { OUTSIDE_DECISION_LABEL } from "@/lib/milestoneAnalysis";
import type { ProgramOverview } from "@/lib/milestoneTypes";

// ── Inbox: what changed in the program since I last looked ──────────────────
//
// Pure logic. The server route feeds it Jira issues expanded with their
// changelog and comments; the page feeds it the events plus the on-device
// seen-state. Nothing here touches the network or storage.

export const INBOX_KINDS = ["status", "link", "decision", "date", "mention"] as const;
export type InboxKind = (typeof INBOX_KINDS)[number];

export const INBOX_KIND_LABEL: Record<InboxKind, string> = {
  status: "Status",
  link: "Dependencies",
  decision: "Decisions",
  date: "Dates",
  mention: "Mentions",
};

export interface InboxPerson {
  accountId: string;
  name: string;
}

export interface InboxEvent {
  /** Stable across polls: the same Jira change always yields the same id. */
  id: string;
  kind: InboxKind;
  issueKey: string;
  summary: string;
  /** The issue's parent (a team epic for an item), used to find its milestone. */
  parentKey: string | null;
  /** ISO 8601, UTC. */
  at: string;
  author: InboxPerson | null;
  from: string | null;
  to: string | null;
  /** "link": which way the new dependency points; "date": which field moved; "mention": the comment excerpt. */
  detail: string | null;
  /** "link": the issue on the other end. */
  otherKey: string | null;
}

export interface InboxPayload {
  project: string;
  since: string;
  events: InboxEvent[];
  /** Issues the changes were read from. */
  issuesScanned: number;
  /** More issues changed than the cap allows; the oldest changes are not shown. */
  capped: boolean;
  cap: number;
  me: InboxPerson | null;
  generatedAt: string;
}

// ── Jira input (the parts of an expanded issue that matter) ─────────────────

export interface JiraChangelogItem {
  field: string;
  fieldtype?: string;
  from?: string | null;
  fromString?: string | null;
  to?: string | null;
  toString?: string | null;
}

export interface JiraHistory {
  id: string;
  author?: { accountId?: string; displayName?: string } | null;
  created: string;
  items: JiraChangelogItem[];
}

export interface JiraComment {
  id: string;
  author?: { accountId?: string; displayName?: string } | null;
  body?: unknown;
  created: string;
}

export interface InboxIssue {
  key: string;
  fields: {
    summary: string;
    status?: { name: string; statusCategory?: { key: string } };
    labels?: string[];
    parent?: { key: string };
    comment?: { comments?: JiraComment[] };
    updated?: string;
  };
  changelog?: { histories?: JiraHistory[] };
}

export interface ExtractOptions {
  /** Only events at or after this instant. */
  since: Date;
  /** Changes made by this account are dropped. */
  meAccountId: string | null;
}

// ── Extraction ──────────────────────────────────────────────────────────────

const DONE_STATUS_NAME = /^(done|closed|resolved|complete|completed|released|won't do|cancelled|canceled)$/i;
const DUE_DATE = /^\d{4}-\d{2}-\d{2}/;
const LINK_TEXT = /\b(is blocked by|blocks)\s+([A-Z][A-Z0-9_]*-\d+)/i;
const EXCERPT_LENGTH = 140;

/** Jira writes offsets as +0100; Date wants +01:00 in every engine. */
export function jiraTimeToIso(value: string): string | null {
  const normalised = value.replace(/([+-]\d{2})(\d{2})$/, "$1:$2");
  const t = Date.parse(normalised);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

function person(user: { accountId?: string; displayName?: string } | null | undefined): InboxPerson | null {
  if (!user?.accountId) return null;
  return { accountId: user.accountId, name: user.displayName ?? "Someone" };
}

function isDoneStatus(issue: InboxIssue, statusName: string): boolean {
  const current = issue.fields.status;
  if (current?.statusCategory?.key === "done" && current.name === statusName) return true;
  return DONE_STATUS_NAME.test(statusName);
}

function dateOnly(value: string | null | undefined): string | null {
  return value && DUE_DATE.test(value) ? value.slice(0, 10) : null;
}

type EventDraft = Pick<InboxEvent, "kind" | "from" | "to" | "detail" | "otherKey">;

function eventsOfChange(issue: InboxIssue, item: JiraChangelogItem): EventDraft[] {
  const field = item.field.toLowerCase();
  const from = item.fromString ?? null;
  const to = item.toString ?? null;

  if (field === "status" && to) {
    const outside = issue.fields.labels?.includes(OUTSIDE_DECISION_LABEL) ?? false;
    const kind: InboxKind = outside && isDoneStatus(issue, to) ? "decision" : "status";
    return [{ kind, from, to, detail: null, otherKey: null }];
  }

  if (field === "link" && to) {
    const match = LINK_TEXT.exec(to);
    if (!match) return [];
    const direction = (match[1] ?? "").toLowerCase() === "blocks" ? "blocks" : "is blocked by";
    return [{ kind: "link", from: null, to: `${direction} ${match[2]}`, detail: direction, otherKey: match[2] ?? null }];
  }

  if (field === "duedate") {
    const next = dateOnly(to);
    const prev = dateOnly(from);
    if (!next && !prev) return [];
    return [{ kind: "date", from: prev, to: next, detail: "Due date", otherKey: null }];
  }

  if (field === "fix version") {
    if (!from && !to) return [];
    return [{ kind: "date", from, to, detail: "Fix version", otherKey: null }];
  }

  return [];
}

/** Plain text of an ADF document, with mentions as @name. */
export function adfText(node: unknown): string {
  if (!node || typeof node !== "object") return "";
  const n = node as { type?: string; text?: string; attrs?: { text?: string }; content?: unknown[] };
  if (n.type === "text") return n.text ?? "";
  if (n.type === "mention") return n.attrs?.text ?? "@someone";
  if (n.type === "hardBreak") return " ";
  const inner = (n.content ?? []).map(adfText).join("");
  return n.type === "paragraph" ? `${inner} ` : inner;
}

/** Whether an ADF document @-mentions the given account. */
export function mentionsAccount(node: unknown, accountId: string): boolean {
  if (!node || typeof node !== "object") return false;
  const n = node as { type?: string; attrs?: { id?: string }; content?: unknown[] };
  if (n.type === "mention" && n.attrs?.id === accountId) return true;
  return (n.content ?? []).some((child) => mentionsAccount(child, accountId));
}

function excerpt(body: unknown): string {
  const text = adfText(body).replace(/\s+/g, " ").trim();
  return text.length > EXCERPT_LENGTH ? `${text.slice(0, EXCERPT_LENGTH - 1)}…` : text;
}

/** Events from issues expanded with changelog and comments, newest first. */
export function extractInboxEvents(issues: InboxIssue[], { since, meAccountId }: ExtractOptions): InboxEvent[] {
  const events: InboxEvent[] = [];
  const sinceMs = since.getTime();

  for (const issue of issues) {
    const base = {
      issueKey: issue.key,
      summary: issue.fields.summary,
      parentKey: issue.fields.parent?.key ?? null,
    };

    for (const history of issue.changelog?.histories ?? []) {
      const at = jiraTimeToIso(history.created);
      if (!at || Date.parse(at) < sinceMs) continue;
      const author = person(history.author);
      if (meAccountId && author?.accountId === meAccountId) continue;
      history.items.forEach((item, index) => {
        for (const draft of eventsOfChange(issue, item)) {
          events.push({ ...base, ...draft, id: `${issue.key}:h${history.id}:${index}`, at, author });
        }
      });
    }

    if (!meAccountId) continue;
    for (const comment of issue.fields.comment?.comments ?? []) {
      const at = jiraTimeToIso(comment.created);
      if (!at || Date.parse(at) < sinceMs) continue;
      const author = person(comment.author);
      if (author?.accountId === meAccountId || !mentionsAccount(comment.body, meAccountId)) continue;
      events.push({
        ...base,
        id: `${issue.key}:c${comment.id}`,
        kind: "mention",
        at,
        author,
        from: null,
        to: null,
        detail: excerpt(comment.body),
        otherKey: null,
      });
    }
  }

  return events.sort((a, b) => b.at.localeCompare(a.at) || a.id.localeCompare(b.id));
}

// ── Where an event opens ────────────────────────────────────────────────────

/** The milestone (release id) an issue belongs to, preferring unreleased ones; null when it is in none. */
export function milestoneOfIssue(overview: ProgramOverview, issueKey: string, parentKey: string | null): string | null {
  const holds = (keys: string[]) => keys.includes(issueKey) || (parentKey !== null && keys.includes(parentKey));
  const matches = overview.releases.filter((r) =>
    r.increments.some((inc) => holds([inc.key, ...inc.teamEpics.map((e) => e.key)])),
  );
  return (matches.find((r) => !r.released) ?? matches[0])?.id ?? null;
}

// ── Presentation helpers ────────────────────────────────────────────────────

export function filterByKind(events: InboxEvent[], kind: InboxKind | "all"): InboxEvent[] {
  return kind === "all" ? events : events.filter((e) => e.kind === kind);
}

export interface InboxDay {
  /** Local date, YYYY-MM-DD. */
  day: string;
  label: string;
  events: InboxEvent[];
}

function localDay(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function dayLabel(day: string): string {
  const [y = 0, m = 1, d = 1] = day.split("-").map(Number);
  return `${WEEKDAYS[new Date(y, m - 1, d).getDay()]} ${d} ${MONTHS[m - 1]}`;
}

/** Events (already newest first) grouped under local calendar days: Today, Yesterday, then the date. */
export function groupByDay(events: InboxEvent[], now: Date): InboxDay[] {
  const today = localDay(now);
  const yesterday = localDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1));
  const groups = new Map<string, InboxEvent[]>();
  for (const e of events) {
    const day = localDay(new Date(e.at));
    groups.set(day, [...(groups.get(day) ?? []), e]);
  }
  return [...groups].map(([day, list]) => ({
    day,
    label:
      day === today
        ? "Today"
        : day === yesterday
          ? "Yesterday"
          : dayLabel(day),
    events: list,
  }));
}

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/** "now", "5m", "3h", "2d" — compact, like a Linear inbox row. */
export function relativeTime(at: string, now: Date): string {
  const age = Math.max(0, now.getTime() - Date.parse(at));
  if (age < MINUTE_MS) return "now";
  if (age < HOUR_MS) return `${Math.floor(age / MINUTE_MS)}m`;
  if (age < DAY_MS) return `${Math.floor(age / HOUR_MS)}h`;
  return `${Math.floor(age / DAY_MS)}d`;
}

/** The sentence a row shows for what changed. */
export function describeEvent(e: InboxEvent): string {
  switch (e.kind) {
    case "status":
      return `${e.from ?? "—"} → ${e.to ?? "—"}`;
    case "decision":
      return `Decision answered: ${e.from ?? "—"} → ${e.to ?? "—"}`;
    case "link":
      return `Now ${e.detail ?? "linked to"} ${e.otherKey ?? ""}`.trim();
    case "date":
      return `${e.detail ?? "Date"}: ${e.from ?? "none"} → ${e.to ?? "none"}`;
    case "mention":
      return e.detail ? `Mentioned you: “${e.detail}”` : "Mentioned you";
  }
}

// ── Seen-state (on this device only) ────────────────────────────────────────

export interface InboxSeen {
  /** When the inbox was last marked as read, ISO; null before the first time. */
  lookedAt: string | null;
  /** Ids of events read one by one since then. */
  read: string[];
}

export const EMPTY_SEEN: InboxSeen = { lookedAt: null, read: [] };

const MAX_READ_IDS = 1000;
/** A first visit, and every visit within the week, shows this much history. */
export const DEFAULT_WINDOW_DAYS = 7;
/** However long since the last visit, never look further back than this. */
export const MAX_WINDOW_DAYS = 30;

export function parseSeen(raw: string | null): InboxSeen {
  if (!raw) return EMPTY_SEEN;
  try {
    const value = JSON.parse(raw) as { lookedAt?: unknown; read?: unknown };
    const lookedAt = typeof value.lookedAt === "string" && !Number.isNaN(Date.parse(value.lookedAt)) ? new Date(value.lookedAt).toISOString() : null;
    const read = Array.isArray(value.read) ? value.read.filter((id): id is string => typeof id === "string") : [];
    return { lookedAt, read };
  } catch {
    return EMPTY_SEEN;
  }
}

export function serializeSeen(seen: InboxSeen): string {
  return JSON.stringify(seen);
}

/**
 * How far back to fetch: the week, or further when the last visit was longer
 * ago (up to a month) so nothing since then is missed. Floored to the hour so
 * repeated loads share one server cache entry.
 */
export function windowStart(now: Date, seen: InboxSeen): string {
  const week = now.getTime() - DEFAULT_WINDOW_DAYS * DAY_MS;
  const month = now.getTime() - MAX_WINDOW_DAYS * DAY_MS;
  const looked = seen.lookedAt ? Date.parse(seen.lookedAt) : Infinity;
  const start = Math.max(month, Math.min(week, looked));
  return new Date(Math.floor(start / HOUR_MS) * HOUR_MS).toISOString();
}

export function isUnread(event: InboxEvent, seen: InboxSeen): boolean {
  if (seen.read.includes(event.id)) return false;
  return seen.lookedAt === null || event.at > seen.lookedAt;
}

export function unreadCount(events: InboxEvent[], seen: InboxSeen): number {
  const read = new Set(seen.read);
  return events.filter((e) => !read.has(e.id) && (seen.lookedAt === null || e.at > seen.lookedAt)).length;
}

export function markRead(seen: InboxSeen, id: string): InboxSeen {
  if (seen.read.includes(id)) return seen;
  return { ...seen, read: [...seen.read, id].slice(-MAX_READ_IDS) };
}

/** Everything up to `at` (the moment the data was generated) counts as seen. */
export function markAllRead(at: string): InboxSeen {
  return { lookedAt: at, read: [] };
}
