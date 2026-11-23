"use client";

import { useCallback, useMemo, useState, useSyncExternalStore } from "react";
import { usePolledJson } from "@/hooks/usePolledJson";
import { EMPTY_SEEN, markAllRead, markRead, parseSeen, serializeSeen, unreadCount, windowStart } from "@/lib/inbox";
import type { InboxPayload, InboxSeen } from "@/lib/inbox";

// The inbox's seen-state lives in localStorage, per project: BTM has no
// datastore, and "what I've looked at" is a property of this device.

const INBOX_POLL_MS = 120_000;
const storageKey = (project: string) => `btm:inbox:${project}`;

const listeners = new Set<() => void>();

function readRaw(project: string): string | null {
  try {
    return localStorage.getItem(storageKey(project));
  } catch {
    return null;
  }
}

function subscribe(notify: () => void): () => void {
  listeners.add(notify);
  window.addEventListener("storage", notify);
  return () => {
    listeners.delete(notify);
    window.removeEventListener("storage", notify);
  };
}

function inboxUrl(project: string, since: string, fixture: string | null): string {
  const params = new URLSearchParams({ project, since });
  if (fixture) params.set("fixture", fixture);
  return `/api/jira/inbox?${params}`;
}

export function useInbox(project: string, fixture: string | null) {
  const raw = useSyncExternalStore(subscribe, () => readRaw(project), () => null);
  const seen = useMemo(() => parseSeen(raw), [raw]);
  const [since] = useState(() => windowStart(new Date(), parseSeen(readRaw(project))));
  const polled = usePolledJson<InboxPayload>(inboxUrl(project, since, fixture), INBOX_POLL_MS);
  const payload = polled.data;

  const save = useCallback(
    (next: InboxSeen) => {
      try {
        localStorage.setItem(storageKey(project), serializeSeen(next));
      } catch {
        // Private mode: the seen-state lasts until the page reloads.
      }
      listeners.forEach((notify) => notify());
    },
    [project],
  );

  const read = useCallback((id: string) => save(markRead(parseSeen(readRaw(project)), id)), [project, save]);
  const readAll = useCallback(() => {
    if (payload) save(markAllRead(payload.generatedAt));
  }, [payload, save]);

  const unread = payload ? unreadCount(payload.events, seen) : 0;
  return { ...polled, payload, seen: payload ? seen : EMPTY_SEEN, unread, read, readAll };
}
