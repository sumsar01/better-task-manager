"use client";

import { useRouter } from "next/navigation";

// ── GraphLoadingState ─────────────────────────────────────────────────────────

interface GraphLoadingStateProps {
  /** Optional progress for streaming loads (e.g. project page). */
  progress?: { done: number; total: number } | null;
  /** Default label shown when no progress is available. */
  label?: string;
  /** Accent color class for the spinner ring. Defaults to indigo. */
  accentColor?: "indigo" | "violet";
}

/**
 * Centered spinner shown while graph data is loading.
 * Accepts an optional `progress` object for streaming progress display.
 */
export function GraphLoadingState({
  progress,
  label = "Loading…",
  accentColor = "indigo",
}: GraphLoadingStateProps) {
  const ringBase = accentColor === "violet" ? "border-violet-100" : "border-indigo-100";
  const ringAccent = accentColor === "violet"
    ? "border-violet-600 border-t-transparent"
    : "border-indigo-600 border-t-transparent";

  return (
    <div className="absolute inset-0 flex items-center justify-center bg-slate-50">
      <div className="flex flex-col items-center gap-4">
        <div className="relative w-10 h-10">
          <div className={`absolute inset-0 rounded-full border-2 ${ringBase}`} />
          <div className={`absolute inset-0 rounded-full border-2 ${ringAccent} animate-spin`} />
        </div>
        {progress ? (
          <p className="text-sm text-slate-400 font-medium">
            Loading {progress.done} / {progress.total} epics…
          </p>
        ) : (
          <p className="text-sm text-slate-400 font-medium">{label}</p>
        )}
      </div>
    </div>
  );
}

// ── GraphErrorState ───────────────────────────────────────────────────────────

interface GraphErrorStateProps {
  /** Error message to display. */
  message: string;
  /** Heading above the error message. */
  heading?: string;
  /** Route to navigate to when "Go back" is clicked. Defaults to "/". */
  backHref?: string;
  /** Accent color for the back-link text. Defaults to indigo. */
  accentColor?: "indigo" | "violet";
}

/**
 * Centered error card with a "Go back and try again" link.
 */
export function GraphErrorState({
  message,
  heading = "Failed to load",
  backHref = "/",
  accentColor = "indigo",
}: GraphErrorStateProps) {
  const router = useRouter();
  const linkColor = accentColor === "violet" ? "text-violet-600" : "text-indigo-600";

  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <div className="bg-white border border-red-200 rounded-2xl px-8 py-6 max-w-sm text-center shadow-lg">
        <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-3">
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <path d="M9 6v4M9 12.5v.5" stroke="#dc2626" strokeWidth="2" strokeLinecap="round" />
            <circle cx="9" cy="9" r="7.5" stroke="#dc2626" strokeWidth="1.5" />
          </svg>
        </div>
        <p className="font-semibold text-sm text-slate-800 mb-1">{heading}</p>
        <p className="text-xs text-slate-500 mb-4">{message}</p>
        <button
          onClick={() => router.push(backHref)}
          className={`text-xs font-medium ${linkColor} hover:underline cursor-pointer`}
        >
          Go back and try again
        </button>
      </div>
    </div>
  );
}

// ── GraphEmptyState ───────────────────────────────────────────────────────────

interface GraphEmptyStateProps {
  /** Message shown to the user. */
  message: string;
  /** Route to navigate to when "Go back" is clicked. Defaults to "/". */
  backHref?: string;
  /** Accent color for the back-link text. Defaults to indigo. */
  accentColor?: "indigo" | "violet";
}

/**
 * Centered empty state with a "Go back" link.
 */
export function GraphEmptyState({
  message,
  backHref = "/",
  accentColor = "indigo",
}: GraphEmptyStateProps) {
  const router = useRouter();
  const linkColor = accentColor === "violet" ? "text-violet-500" : "text-indigo-500";

  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <div className="text-center">
        <p className="text-slate-400 text-sm">{message}</p>
        <button
          onClick={() => router.push(backHref)}
          className={`mt-2 text-xs ${linkColor} hover:underline cursor-pointer`}
        >
          Go back
        </button>
      </div>
    </div>
  );
}
