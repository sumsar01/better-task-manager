"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { AtSign, CalendarClock, CheckCheck, CircleArrowRight, Gavel, Inbox, Link2, TriangleAlert } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useInbox } from "@/hooks/useInbox";
import {
  INBOX_KINDS,
  INBOX_KIND_LABEL,
  describeEvent,
  filterByKind,
  groupByDay,
  isUnread,
  milestoneOfIssue,
  relativeTime,
} from "@/lib/inbox";
import type { InboxEvent, InboxKind, InboxSeen } from "@/lib/inbox";
import type { ProgramOverview } from "@/lib/milestoneTypes";
import { cn } from "@/lib/utils";
import { Avatar, EmptyState, KeyChip, Segmented } from "./MilestoneBits";
import { ErrorState, Skeleton, Toolbar } from "./MilestoneChrome";
import { useProgram } from "./ProgramShell";

const KIND_ICON: Record<InboxKind, { icon: LucideIcon; tone: string }> = {
  status: { icon: CircleArrowRight, tone: "text-[var(--ms-label-2)]" },
  link: { icon: Link2, tone: "text-[var(--ms-cross-text)]" },
  decision: { icon: Gavel, tone: "text-[var(--ms-ready-text)]" },
  date: { icon: CalendarClock, tone: "text-[var(--ms-warn-text)]" },
  mention: { icon: AtSign, tone: "text-[var(--ms-accent-text)]" },
};

type KindFilter = InboxKind | "all";

function useNow(intervalMs: number): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

function InboxRow({
  event,
  unread,
  href,
  external,
  now,
  onOpen,
}: {
  event: InboxEvent;
  unread: boolean;
  /** Where the row goes: the item in its milestone, else its Jira page. */
  href: string | null;
  external: boolean;
  now: Date;
  onOpen: () => void;
}) {
  const { icon: Icon, tone } = KIND_ICON[event.kind];
  const body = (
    <>
      <span className={cn("h-2 w-2 shrink-0 rounded-full", unread ? "bg-[var(--ms-accent)]" : "bg-transparent")} aria-hidden="true" />
      <Icon size={16} className={cn("shrink-0", tone)} aria-hidden="true" />
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-center gap-2">
          <KeyChip issueKey={event.issueKey} />
          <span className={cn("min-w-0 truncate text-[13px]", unread ? "font-semibold text-[var(--ms-label)]" : "text-[var(--ms-label-2)]")}>
            {event.summary}
          </span>
        </span>
        <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[12px] text-[var(--ms-label-3)]">
          <span className="truncate">{describeEvent(event)}</span>
          {event.author && (
            <>
              <span aria-hidden="true">·</span>
              <Avatar name={event.author.name} size={14} />
              <span className="shrink-0">{event.author.name}</span>
            </>
          )}
        </span>
      </span>
      <time dateTime={event.at} title={new Date(event.at).toLocaleString()} className="w-9 shrink-0 text-right text-[12px] tabular-nums text-[var(--ms-label-3)]">
        {relativeTime(event.at, now)}
      </time>
    </>
  );
  const className = "flex items-center gap-3 rounded-lg px-3 py-2 transition-colors hover:bg-[var(--ms-fill-2)]";
  const label = `${unread ? "Unread: " : ""}${event.issueKey} ${describeEvent(event)}`;
  return (
    <li>
      {href === null ? (
        <div className={className} aria-label={label}>
          {body}
        </div>
      ) : external ? (
        <a href={href} target="_blank" rel="noreferrer" onClick={onOpen} className={className} aria-label={label} title="Open in Jira">
          {body}
        </a>
      ) : (
        <Link href={href} onClick={onOpen} className={className} aria-label={label}>
          {body}
        </Link>
      )}
    </li>
  );
}

function InboxSkeleton() {
  return (
    <div role="status" aria-label="Loading inbox" className="flex flex-col gap-2">
      {Array.from({ length: 6 }, (_, i) => (
        <Skeleton key={i} className="h-[46px] rounded-lg" />
      ))}
    </div>
  );
}

function openTarget(
  event: InboxEvent,
  overview: ProgramOverview | null,
  milestoneHref: (id: string) => string,
  jiraBaseUrl: string,
): { href: string | null; external: boolean } {
  const milestone = overview ? milestoneOfIssue(overview, event.issueKey, event.parentKey) : null;
  if (milestone) {
    const base = milestoneHref(milestone);
    return { href: `${base}${base.includes("?") ? "&" : "?"}item=${encodeURIComponent(event.issueKey)}`, external: false };
  }
  return { href: jiraBaseUrl ? `${jiraBaseUrl}/browse/${encodeURIComponent(event.issueKey)}` : null, external: true };
}

function InboxList({
  events,
  seen,
  overview,
  onRead,
}: {
  events: InboxEvent[];
  seen: InboxSeen;
  overview: ProgramOverview | null;
  onRead: (id: string) => void;
}) {
  const { href, jiraBaseUrl } = useProgram();
  const now = useNow(60_000);
  const days = useMemo(() => groupByDay(events, now), [events, now]);
  return (
    <div className="flex flex-col gap-5">
      {days.map((day) => (
        <section key={day.day} aria-label={day.label}>
          <h2 className="px-3 pb-1 text-[12px] font-semibold text-[var(--ms-label-3)]">{day.label}</h2>
          <ul className="flex flex-col">
            {day.events.map((e) => {
              const target = openTarget(e, overview, href.milestone, jiraBaseUrl);
              return (
                <InboxRow
                  key={e.id}
                  event={e}
                  unread={isUnread(e, seen)}
                  href={target.href}
                  external={target.external}
                  now={now}
                  onOpen={() => onRead(e.id)}
                />
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

export default function InboxView() {
  const { projectKey, program } = useProgram();
  const fixture = useSearchParams().get("fixture");
  const { payload, loading, error, retry, seen, unread, read, readAll } = useInbox(projectKey, fixture);
  const [kind, setKind] = useState<KindFilter>("all");
  const [unreadOnly, setUnreadOnly] = useState(false);

  useEffect(() => {
    document.title = "Inbox · Delivery program";
  }, []);

  const shown = useMemo(() => {
    const byKind = payload ? filterByKind(payload.events, kind) : [];
    return unreadOnly ? byKind.filter((e) => isUnread(e, seen)) : byKind;
  }, [payload, kind, unreadOnly, seen]);

  const kindOptions = [
    { value: "all" as const, label: "All" },
    ...INBOX_KINDS.map((k) => ({ value: k, label: INBOX_KIND_LABEL[k] })),
  ];

  return (
    <>
      <Toolbar
        title="Inbox"
        subtitle={unread > 0 ? `${unread} unread` : "All caught up"}
        trailing={
          <button
            type="button"
            onClick={readAll}
            disabled={unread === 0}
            className="flex h-7 items-center gap-1.5 rounded-md px-2 text-[12px] font-medium text-[var(--ms-accent-text)] transition-colors hover:bg-[var(--ms-fill-2)] disabled:opacity-50 disabled:hover:bg-transparent"
          >
            <CheckCheck size={14} aria-hidden="true" />
            Mark all as read
          </button>
        }
      />
      {error && !payload ? (
        <ErrorState message={error} onRetry={retry} what="the inbox" projectKey={projectKey} />
      ) : (
        <main className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-[860px] px-6 pb-16 pt-6 sm:px-8">
            <div className="mb-5 flex flex-wrap items-center gap-3">
              <Segmented value={kind} options={kindOptions} onChange={setKind} label="Filter by kind of change" />
              <button
                type="button"
                aria-pressed={unreadOnly}
                onClick={() => setUnreadOnly((on) => !on)}
                className={cn(
                  "h-7 rounded-md px-2.5 text-[12.5px] font-medium transition-colors",
                  unreadOnly ? "bg-[var(--ms-fill)] text-[var(--ms-label)]" : "text-[var(--ms-label-2)] hover:bg-[var(--ms-fill-2)]",
                )}
              >
                Unread only
              </button>
            </div>
            {payload?.capped && (
              <p className="mb-4 flex items-center gap-2 rounded-lg bg-[var(--ms-warn-fill)] px-3 py-2 text-[12.5px] text-[var(--ms-warn-text)]">
                <TriangleAlert size={14} className="shrink-0" aria-hidden="true" />
                Too much changed to show it all: only the {payload.cap} most recently updated issues were read, so older changes are missing.
              </p>
            )}
            {loading && !payload ? (
              <InboxSkeleton />
            ) : shown.length === 0 ? (
              <EmptyState
                icon={<Inbox size={34} strokeWidth={1.5} />}
                title={payload && payload.events.length > 0 ? "Nothing matches" : "Nothing new"}
                message={
                  payload && payload.events.length > 0
                    ? "No changes match this filter."
                    : "No changes by other people in the program since the start of this window."
                }
              />
            ) : (
              <InboxList events={shown} seen={seen} overview={program.data} onRead={read} />
            )}
          </div>
        </main>
      )}
    </>
  );
}
