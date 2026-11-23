"use client";

import { useEffect, useMemo, useState } from "react";
import { milestoneApiUrl, samePayload } from "@/lib/milestoneView";
import type { MilestoneDetail, ProgramOverview } from "@/lib/milestoneTypes";
import { activeReleases, mostFrequentAssignee } from "@/lib/myWork";
import type { Me, MilestoneEntry } from "@/lib/myWork";

const POLL_INTERVAL_MS = 60_000;
/** The milestone routes cache for 30 s; two views asking within this window share one request. */
const SHARE_WINDOW_MS = 15_000;

const shared = new Map<string, { at: number; promise: Promise<unknown> }>();

function fetchShared<T>(url: string): Promise<T> {
  const hit = shared.get(url);
  if (hit && Date.now() - hit.at < SHARE_WINDOW_MS) return hit.promise as Promise<T>;
  const promise = fetch(url).then(async (res) => {
    const body = (await res.json().catch(() => ({}))) as T & { error?: string };
    if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`);
    return body;
  });
  shared.set(url, { at: Date.now(), promise });
  promise.catch(() => shared.delete(url));
  return promise;
}

interface AuthMe {
  user?: { account_id: string; name?: string };
}

/** Polls every open milestone's detail, and says who the signed-in user is. */
export function useMyWork(projectKey: string, fixture: string | null, overview: ProgramOverview | null) {
  const releases = useMemo(() => (overview ? activeReleases(overview) : null), [overview]);
  const ids = releases?.map((r) => r.id).join(",") ?? null;
  const [details, setDetails] = useState<Record<string, MilestoneDetail>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [authMe, setAuthMe] = useState<{ me: Me | null } | null>(null);

  useEffect(() => {
    if (ids === null) return;
    let live = true;
    const load = async () => {
      const wanted = ids ? ids.split(",") : [];
      const results = await Promise.allSettled(wanted.map((id) => fetchShared<MilestoneDetail>(milestoneApiUrl(projectKey, id, fixture))));
      if (!live) return;
      setDetails((prev) => {
        const next = { ...prev };
        results.forEach((r, i) => {
          const id = wanted[i] as string;
          if (r.status === "fulfilled" && !(prev[id] && samePayload(prev[id], r.value))) next[id] = r.value;
        });
        return next;
      });
      setErrors(Object.fromEntries(results.flatMap((r, i) => (r.status === "rejected" ? [[wanted[i], r.reason instanceof Error ? r.reason.message : "Unknown error"]] : []))));
    };
    void load();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, POLL_INTERVAL_MS);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [ids, projectKey, fixture]);

  useEffect(() => {
    if (fixture) return;
    let live = true;
    fetchShared<AuthMe>("/api/auth/me")
      .then((body) => live && setAuthMe({ me: body.user ? { id: body.user.account_id, name: body.user.name ?? null } : null }))
      .catch(() => live && setAuthMe({ me: null }));
    return () => {
      live = false;
    };
  }, [fixture]);

  const entries = useMemo<MilestoneEntry[]>(
    () => (releases ?? []).flatMap((r) => (details[r.id] ? [{ id: r.id, name: r.name, sequence: r.sequence, detail: details[r.id] as MilestoneDetail }] : [])),
    [releases, details],
  );
  const me = useMemo(() => (fixture ? mostFrequentAssignee(entries) : (authMe?.me ?? null)), [fixture, entries, authMe]);

  const failed = (releases ?? []).filter((r) => errors[r.id]);
  const settled = releases !== null && entries.length + failed.length === releases.length;
  return {
    entries,
    me,
    /** Who "me" is has been resolved (even if to nobody). */
    meKnown: !!fixture || authMe !== null,
    loading: !settled,
    /** Milestones that failed to load, with the reason. */
    failed: failed.map((r) => ({ name: r.name, message: errors[r.id] as string })),
    noReleases: releases !== null && releases.length === 0,
  };
}
