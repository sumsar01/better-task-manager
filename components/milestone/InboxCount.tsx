"use client";

import { useInbox } from "@/hooks/useInbox";

/** Unread count beside the sidebar's Inbox entry; nothing while there is none. */
export default function InboxCount({ projectKey, fixture }: { projectKey: string; fixture: string | null }) {
  const { unread } = useInbox(projectKey, fixture);
  if (unread === 0) return null;
  return (
    <span
      className="shrink-0 rounded-full bg-[var(--ms-accent)] px-1.5 text-[11px] font-semibold tabular-nums text-white"
      aria-label={`${unread} unread`}
    >
      {unread > 99 ? "99+" : unread}
    </span>
  );
}
