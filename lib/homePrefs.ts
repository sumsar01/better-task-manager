/**
 * Persistence helpers for home-page user preferences.
 * All data lives in localStorage under a `btm:` namespace.
 * Safe to call during SSR — all reads/writes are guarded by typeof window checks.
 */

const KEY_LAST_PROJECT = "btm:lastProject";
const KEY_LAST_EPIC = "btm:lastEpic";
const KEY_RECENT_GRAPHS = "btm:recentGraphs";
const MAX_RECENTS = 3;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RecentGraphEntry =
  | {
      type: "epic";
      key: string; // epicKey, e.g. "PROJ-42"
      label: string; // epic summary
      projectKey: string;
      projectName: string;
      timestamp: number;
    }
  | {
      type: "project";
      key: string; // projectKey, e.g. "PROJ"
      label: string; // project name
      projectKey: string;
      projectName: string;
      timestamp: number;
    };

// ---------------------------------------------------------------------------
// Last-selected project / epic
// ---------------------------------------------------------------------------

export function getLastProject(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(KEY_LAST_PROJECT) ?? "";
}

export function setLastProject(projectKey: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY_LAST_PROJECT, projectKey);
}

export function getLastEpic(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(KEY_LAST_EPIC) ?? "";
}

export function setLastEpic(epicKey: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY_LAST_EPIC, epicKey);
}

export function clearLastEpic(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(KEY_LAST_EPIC);
}

// ---------------------------------------------------------------------------
// Recent graphs
// ---------------------------------------------------------------------------

export function getRecentGraphs(): RecentGraphEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY_RECENT_GRAPHS);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed as RecentGraphEntry[];
  } catch {
    return [];
  }
}

export function pushRecentGraph(entry: Omit<RecentGraphEntry, "timestamp">): void {
  if (typeof window === "undefined") return;
  const existing = getRecentGraphs();
  // De-duplicate by type + key (keep newest position)
  const deduped = existing.filter((r) => !(r.type === entry.type && r.key === entry.key));
  const next: RecentGraphEntry[] = [
    { ...entry, timestamp: Date.now() } as RecentGraphEntry,
    ...deduped,
  ].slice(0, MAX_RECENTS);
  localStorage.setItem(KEY_RECENT_GRAPHS, JSON.stringify(next));
}

export function removeRecentGraph(type: RecentGraphEntry["type"], key: string): void {
  if (typeof window === "undefined") return;
  const existing = getRecentGraphs();
  const next = existing.filter((r) => !(r.type === type && r.key === key));
  localStorage.setItem(KEY_RECENT_GRAPHS, JSON.stringify(next));
}
