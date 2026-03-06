import { useEffect, useRef, useState } from "react";
import type { JiraIssue } from "@/lib/jira";

const POLL_INTERVAL_MS = 30_000;

export interface UseIssuePollerResult {
  issues: JiraIssue[];
  latestIssues: JiraIssue[];
  loading: boolean;
  error: string | null;
  lastUpdated: Date | null;
}

async function fetchIssues(epic: string): Promise<JiraIssue[]> {
  const r = await fetch(`/api/jira/issues?epic=${encodeURIComponent(epic)}`);
  if (!r.ok) throw new Error(`Failed to load issues (${r.status})`);
  return r.json() as Promise<JiraIssue[]>;
}

/**
 * Fetches issues for the given epic key on mount, then polls every 30s.
 * Returns the initial `issues` (used for layout), `latestIssues` (used for
 * in-place patching), `loading`, `error`, and `lastUpdated` (timestamp of
 * the most recent successful fetch).
 */
export function useIssuePoller(epicKey: string | undefined): UseIssuePollerResult {
  const [issues, setIssues] = useState<JiraIssue[]>([]);
  const [latestIssues, setLatestIssues] = useState<JiraIssue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const isMountedRef = useRef(true);

  // Initial fetch
  useEffect(() => {
    if (!epicKey) return;
    isMountedRef.current = true;

    // Signal loading start before async work (safe: triggered by epicKey change only)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    fetchIssues(epicKey)
      .then((data) => {
        if (!isMountedRef.current) return;
        setIssues(data);
        setLatestIssues(data);
        setLastUpdated(new Date());
      })
      .catch((e: Error) => {
        if (!isMountedRef.current) return;
        setError(e.message);
      })
      .finally(() => {
        if (isMountedRef.current) setLoading(false);
      });

    return () => {
      isMountedRef.current = false;
    };
  }, [epicKey]);

  // Background polling — only starts when the initial fetch succeeded.
  // NOTE: If the initial fetch fails (error is set), polling is intentionally
  // skipped. It will not self-recover unless the component re-mounts or
  // epicKey changes. If a retry mechanism is added in the future, reset `error`
  // to null first so this effect re-runs and registers the interval.
  useEffect(() => {
    if (!epicKey || loading || error) return;

    const id = setInterval(async () => {
      try {
        const data = await fetchIssues(epicKey);
        if (!isMountedRef.current) return;
        setLatestIssues(data);
        setLastUpdated(new Date());
      } catch {
        // Silently swallow polling errors
      }
    }, POLL_INTERVAL_MS);

    return () => clearInterval(id);
  }, [epicKey, loading, error]);

  return { issues, latestIssues, loading, error, lastUpdated };
}
