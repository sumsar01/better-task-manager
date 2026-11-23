"use client";

import { useCallback, useSyncExternalStore } from "react";
import { useSearchParams } from "next/navigation";
import { parseMode } from "@/lib/myWork";
import type { MyWorkMode } from "@/lib/myWork";

const MODE_KEY = "btm:myWork:mode";
const teamKey = (project: string) => `btm:myWork:team:${project}`;

const listeners = new Set<() => void>();

/**
 * A string kept in localStorage, read through useSyncExternalStore so the
 * server render (which can't see it) hydrates cleanly before it applies.
 */
function useStoredString(key: string): [string | null, (value: string) => void] {
  const value = useSyncExternalStore(
    (notify) => {
      listeners.add(notify);
      return () => listeners.delete(notify);
    },
    () => {
      try {
        return localStorage.getItem(key);
      } catch {
        return null;
      }
    },
    () => null,
  );
  const set = useCallback(
    (next: string) => {
      try {
        localStorage.setItem(key, next);
      } catch {
        // Private mode: the choice lasts until reload.
      }
      listeners.forEach((notify) => notify());
    },
    [key],
  );
  return [value, set];
}

/**
 * Lead or Developer, kept in `?mode=` (a shared link opens as sent) and in
 * localStorage (the next visit opens as left). Uses replaceState so the back
 * button leaves the page rather than stepping through toggles.
 */
export function useMyWorkMode() {
  const param = useSearchParams().get("mode");
  const [saved, save] = useStoredString(MODE_KEY);
  const mode = parseMode(param, saved);
  const setMode = useCallback(
    (next: MyWorkMode) => {
      save(next);
      const url = new URL(window.location.href);
      url.searchParams.set("mode", next);
      window.history.replaceState(window.history.state, "", url);
    },
    [save],
  );
  return [mode, setMode] as const;
}

/** The team the developer view is for: the one picked last, if any. */
export function useSavedTeam(project: string) {
  return useStoredString(teamKey(project));
}
