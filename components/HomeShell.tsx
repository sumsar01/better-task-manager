import type { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import BackgroundBlobs from "@/components/BackgroundBlobs";

interface HomeShellProps {
  /** Color stop for the top-left decorative blob (e.g. "#e0e7ff"). */
  topBlobColor: string;
  /** Color stop for the bottom-right decorative blob (e.g. "#c7d2fe"). */
  bottomBlobColor: string;
  /** Accent color class for the wordmark icon background (e.g. "bg-indigo-600"). */
  accentBg: string;
  /** Tailwind shadow class for the wordmark icon (e.g. "shadow-indigo-200 dark:shadow-indigo-900"). */
  accentShadow: string;
  /** Highlight text in the h1 heading (e.g. "epic dependencies"). */
  headingHighlight: string;
  /** Tailwind color class for the heading highlight (e.g. "text-indigo-600"). */
  highlightColor: string;
  /** Top-right controls slot (e.g. theme toggle + settings link). */
  controls?: ReactNode;
  /** The picker component rendered inside the card. */
  picker: ReactNode;
  /** Footer slot (e.g. back link or cross-product link). */
  footer?: ReactNode;
}

/**
 * Shared layout shell for home-page style picker views.
 * Handles the background blobs, wordmark, card, and footer
 * so each page only provides its colour theme and content slots.
 */
export default function HomeShell({
  topBlobColor,
  bottomBlobColor,
  accentBg,
  accentShadow,
  headingHighlight,
  highlightColor,
  controls,
  picker,
  footer,
}: HomeShellProps) {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-4 bg-slate-50 dark:bg-slate-950 relative overflow-hidden">
      <BackgroundBlobs topColor={topBlobColor} bottomColor={bottomBlobColor} />

      <div className="relative w-full max-w-md">
        {/* Top-right controls */}
        {controls && (
          <div className="absolute -top-2 right-0 flex items-center gap-3">
            {controls}
          </div>
        )}

        {/* Wordmark */}
        <div className="mb-10 text-center">
          <div className="inline-flex items-center gap-2 mb-4">
            <div className={`w-8 h-8 rounded-lg ${accentBg} flex items-center justify-center shadow-md ${accentShadow}`}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <circle cx="4" cy="4" r="2" fill="white" />
                <circle cx="12" cy="4" r="2" fill="white" fillOpacity="0.6" />
                <circle cx="8" cy="12" r="2" fill="white" fillOpacity="0.8" />
                <line x1="4" y1="4" x2="8" y2="12" stroke="white" strokeWidth="1.5" strokeOpacity="0.7" />
                <line x1="12" y1="4" x2="8" y2="12" stroke="white" strokeWidth="1.5" strokeOpacity="0.7" />
              </svg>
            </div>
            <span className="text-lg font-bold text-slate-900 dark:text-slate-100 tracking-tight">TaskGraph</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 tracking-tight leading-tight">
            Visualize your<br />
            <span className={highlightColor}>{headingHighlight}</span>
          </h1>
          <p className="mt-2.5 text-slate-500 dark:text-slate-400 text-sm leading-relaxed">
            See what&apos;s blocked, what&apos;s in progress,<br />and what you can ship next.
          </p>
        </div>

        {/* Card */}
        <Card className="rounded-2xl border-slate-200 dark:border-slate-700/80 shadow-xl shadow-slate-200/50 dark:shadow-black/30">
          <CardContent className="px-6 pt-6 pb-6">
            {picker}
          </CardContent>
        </Card>

        {/* Footer */}
        {footer && (
          <div className="mt-4 text-center">
            {footer}
          </div>
        )}
      </div>
    </main>
  );
}
