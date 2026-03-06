"use client";

import { useRouter } from "next/navigation";
import LiveBadge from "@/components/LiveBadge";
import ThemeToggle from "@/components/ThemeToggle";

interface GraphPageHeaderProps {
  /** The key displayed in the chip (epic key or project key). */
  chipKey: string;
  /** Optional label shown after the chip (e.g. "All Epics"). */
  chipLabel?: string;
  /** Number of issues to display alongside the chip label. Hidden when undefined or 0. */
  issueCount?: number;
  /** Passed to LiveBadge. Badge is hidden when null. */
  lastUpdated: Date | null;
  /** Whether data is still loading (hides count + badge). */
  loading: boolean;
  /** Whether an error occurred (hides count + badge). */
  error: string | null;
}

/**
 * Shared header bar used by both graph pages (epic and project).
 * Renders the back button, app logo, a key chip, and a LiveBadge.
 */
export default function GraphPageHeader({
  chipKey,
  chipLabel,
  issueCount,
  lastUpdated,
  loading,
  error,
}: GraphPageHeaderProps) {
  const router = useRouter();

  const showMeta = !loading && !error;
  const showCount = showMeta && typeof issueCount === "number" && issueCount > 0;
  const showBadge = showMeta && lastUpdated !== null;

  return (
    <header className="flex items-center gap-3 px-5 py-0 h-14 bg-white dark:bg-slate-900 border-b border-slate-200/80 dark:border-slate-700/80 shrink-0 shadow-sm shadow-slate-100 dark:shadow-slate-900/50">
      {/* Back */}
      <button
        onClick={() => router.push("/")}
        className="flex items-center gap-1.5 text-slate-400 hover:text-slate-800 dark:text-slate-500 dark:hover:text-slate-200 transition-colors text-sm font-medium group"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          className="transition-transform group-hover:-translate-x-0.5"
        >
          <path
            d="M10 12L6 8l4-4"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        Back
      </button>

      {/* Divider */}
      <div className="w-px h-5 bg-slate-200 dark:bg-slate-700" />

      {/* App name */}
      <div className="flex items-center gap-2">
        <div className="w-6 h-6 rounded-md bg-indigo-600 flex items-center justify-center">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <circle cx="3" cy="3" r="1.5" fill="white" />
            <circle cx="9" cy="3" r="1.5" fill="white" fillOpacity="0.6" />
            <circle cx="6" cy="9" r="1.5" fill="white" fillOpacity="0.8" />
            <line x1="3" y1="3" x2="6" y2="9" stroke="white" strokeWidth="1.2" strokeOpacity="0.7" />
            <line x1="9" y1="3" x2="6" y2="9" stroke="white" strokeWidth="1.2" strokeOpacity="0.7" />
          </svg>
        </div>
        <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">TaskGraph</span>
      </div>

      {/* Divider */}
      <div className="w-px h-5 bg-slate-200 dark:bg-slate-700" />

      {/* Key chip */}
      <span className="text-[11px] font-mono font-semibold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-100 dark:border-indigo-800/60 px-2.5 py-1 rounded-full">
        {chipKey}
      </span>

      {/* Optional label (e.g. "All Epics") */}
      {chipLabel && (
        <span className="text-[11px] text-slate-400 dark:text-slate-500 font-medium">{chipLabel}</span>
      )}

      {/* Issue count */}
      {showCount && (
        <span className="text-[11px] text-slate-400 dark:text-slate-500 font-medium">
          · {issueCount} issue{issueCount !== 1 ? "s" : ""}
        </span>
      )}

      {/* Live badge */}
      {showBadge && <LiveBadge lastUpdated={lastUpdated} />}

      {/* Spacer + theme toggle */}
      <div className="ml-auto">
        <ThemeToggle />
      </div>
    </header>
  );
}
