"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CloudAlert, PanelLeft, RotateCw } from "lucide-react";
import ThemeToggle from "@/components/ThemeToggle";
import { cn } from "@/lib/utils";
import { useProgram } from "./ProgramShell";

// Window chrome for the delivery pages: a translucent toolbar, loading
// skeletons and the error state. Kept apart from the data components so the
// program and milestone pages share one look.

/** A borderless toolbar button, the way macOS draws them: icon only, a wash on hover. */
export function ToolButton({
  label,
  shortcut,
  onClick,
  pressed,
  disabled,
  children,
  className,
}: {
  label: string;
  shortcut?: string;
  onClick: () => void;
  pressed?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={pressed}
      title={shortcut ? `${label} (${shortcut})` : label}
      className={cn(
        "flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[var(--ms-label-2)] transition-colors hover:bg-[var(--ms-fill)] hover:text-[var(--ms-label)] disabled:opacity-60 disabled:hover:bg-transparent",
        pressed && "bg-[var(--ms-fill)] text-[var(--ms-label)]",
        className,
      )}
    >
      {children}
    </button>
  );
}

/** Copies the current URL — view state lives in the query string, so it's a shareable view. */
function CopyLink() {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const id = window.setTimeout(() => setCopied(false), 1600);
    return () => window.clearTimeout(id);
  }, [copied]);
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard?.writeText(window.location.href).then(() => setCopied(true), () => {});
      }}
      title="Copy a link to this exact view"
      className="flex h-7 shrink-0 items-center gap-1.5 rounded-md px-1.5 text-[12px] font-medium text-[var(--ms-accent-text)] transition-colors hover:bg-[var(--ms-fill-2)] 2xl:px-2"
    >
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        {copied ? (
          <path d="m3.5 8.5 3 3 6-7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        ) : (
          <path d="M6.5 9.5 9.5 6.5M7 4.5l1.3-1.3a2.6 2.6 0 0 1 3.7 3.7L10.7 8.2M9 11.5l-1.3 1.3a2.6 2.6 0 0 1-3.7-3.7L5.3 7.8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        )}
      </svg>
      <span aria-live="polite" className={cn(!copied && "sr-only 2xl:not-sr-only")}>{copied ? "Copied" : "Copy link"}</span>
    </button>
  );
}

/**
 * The content column's toolbar: sidebar toggle and title on the leading edge,
 * the page's primary control (tabs) centred, actions trailing. Refresh lives
 * here like the mac app's; "Updated x ago" lives in the sidebar.
 */
export function Toolbar({
  title,
  subtitle,
  center,
  trailing,
  shareable = false,
}: {
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  center?: React.ReactNode;
  trailing?: React.ReactNode;
  shareable?: boolean;
}) {
  const { toggleSidebar, sidebarVisible, refresh, refreshing, backgroundError } = useProgram();
  return (
    <header className="ms-chrome sticky top-0 z-40 grid h-[52px] shrink-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 border-b border-[var(--ms-sep)] pl-3 pr-16">
      <div className="flex min-w-0 items-center gap-2">
        <ToolButton label={sidebarVisible ? "Hide sidebar" : "Show sidebar"} onClick={toggleSidebar}>
          <PanelLeft size={17} strokeWidth={1.75} aria-hidden="true" />
        </ToolButton>
        {title && (
          <div className="min-w-0 leading-tight">
            <div className="truncate text-[13px] font-semibold text-[var(--ms-label)]">{title}</div>
            {subtitle && <div className="truncate text-[11px] text-[var(--ms-label-3)]">{subtitle}</div>}
          </div>
        )}
      </div>
      <div className="flex justify-center">{center}</div>
      <div className="flex items-center justify-end gap-0.5">
        {backgroundError && (
          <span
            className="flex h-7 w-7 items-center justify-center text-[var(--ms-warn)] lg:hidden"
            title={`Last refresh failed: ${backgroundError}. Showing the previous data.`}
            role="img"
            aria-label="Last refresh failed — showing the previous data"
          >
            <CloudAlert size={16} aria-hidden="true" />
          </span>
        )}
        {trailing}
        {shareable && <CopyLink />}
        <ToolButton label="Refresh from Jira" shortcut="⌘R" onClick={refresh} disabled={refreshing}>
          <RotateCw size={15} strokeWidth={1.9} aria-hidden="true" className={cn(refreshing && "ms-spin")} />
        </ToolButton>
        <ThemeToggle />
      </div>
    </header>
  );
}

export function Skeleton({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return <div aria-hidden="true" className={cn("ms-skeleton", className)} style={style} />;
}

/** Placeholder with the milestone page's real proportions, so nothing jumps on load. */
export function MilestoneSkeleton() {
  return (
    <div role="status" aria-label="Loading milestone" className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-end gap-10 border-b border-[var(--ms-sep)] px-8 pb-5 pt-6">
        <div className="flex flex-col gap-2.5">
          <Skeleton className="h-3 w-40" />
          <Skeleton className="h-7 w-72" />
          <Skeleton className="h-2 w-56" />
        </div>
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="flex flex-col gap-2">
            <Skeleton className="h-2.5 w-16" />
            <Skeleton className="h-6 w-12" />
          </div>
        ))}
      </div>
      <div className="flex items-center gap-3 border-b border-[var(--ms-sep)] px-8 py-2.5">
        <Skeleton className="h-7 w-48 rounded-[9px]" />
        <Skeleton className="h-7 w-64 rounded-[9px]" />
      </div>
      <div className="flex-1 overflow-hidden">
        {Array.from({ length: 5 }, (_, lane) => (
          <div key={lane} className={cn("flex border-t border-[var(--ms-sep)]", lane % 2 === 1 && "bg-[var(--ms-lane)]")}>
            <div className="flex w-[188px] shrink-0 flex-col justify-center gap-2 border-r border-[var(--ms-sep)] px-4 py-6">
              <Skeleton className="h-3 w-28" />
              <Skeleton className="h-2.5 w-20" />
            </div>
            <div className="flex gap-14 px-7 py-3.5">
              {Array.from({ length: 4 - (lane % 3) }, (_, i) => (
                <Skeleton key={i} className="h-[84px] w-[216px] rounded-xl" style={{ animationDelay: `${(lane + i) * 80}ms` }} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Browsers keep ⌘1–⌘9 for switching tabs, so on the web the view tabs answer
// to the bare digits (⌘-digits still work where the browser passes them on,
// as in the desktop shell).
const SHORTCUTS: Array<{ group: string; keys: Array<[string, string]> }> = [
  {
    group: "Views",
    keys: [
      ["1 – 6", "Critical path, Blockers, Team load, Increments, Ready & warnings, Team lanes"],
      ["⌥⌘1 – ⌥⌘9", "Go to milestone 1–9"],
      ["⌥⌘0", "Program overview"],
      ["⌘R", "Refresh from Jira"],
    ],
  },
  {
    group: "Filter",
    keys: [
      ["⌘F  ⌘K  /", "Filter"],
      ["Return", "Go to the best match — again for the next"],
      ["⇧Return", "Previous match"],
    ],
  },
  {
    group: "Selection",
    keys: [
      ["← → ↑ ↓", "Move between work items"],
      ["Return  or double-click", "Show in the inspector"],
      ["⌥⌘I", "Show or hide the inspector"],
      ["⇧⌘O", "Open the selection in Jira"],
      ["Esc", "Clear the selection"],
    ],
  },
  {
    group: "Timeline",
    keys: [
      ["⇧⌘D", "Show done items"],
      ["+  −", "Zoom in / out"],
      ["0", "Fit to screen"],
      ["⌘ scroll / pinch", "Zoom around the pointer"],
    ],
  },
];

/** Keyboard shortcut reference, opened with "?". */
export function ShortcutsSheet({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/20 p-6 backdrop-blur-[2px]" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Keyboard shortcuts"
        className="ms-material ms-fade-quick max-h-full w-full max-w-md overflow-y-auto rounded-2xl p-5"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.stopPropagation();
            onClose();
          }
        }}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[15px] font-semibold text-[var(--ms-label)]">Keyboard shortcuts</h2>
          <button
            type="button"
            autoFocus
            onClick={onClose}
            className="rounded-full bg-[var(--ms-fill)] px-3 py-1 text-[12px] font-medium text-[var(--ms-label)] hover:bg-[var(--ms-sep-strong)]"
          >
            Done
          </button>
        </div>
        <div className="flex flex-col gap-4">
          {SHORTCUTS.map(({ group, keys }) => (
            <section key={group}>
              <h3 className="mb-1 text-[11px] font-semibold text-[var(--ms-label-3)]">{group}</h3>
              <dl className="divide-y divide-[var(--ms-sep)]">
                {keys.map(([combo, what]) => (
                  <div key={combo} className="flex items-center justify-between gap-4 py-1.5 text-[13px]">
                    <dt className="text-[var(--ms-label-2)]">{what}</dt>
                    <dd className="shrink-0">
                      <kbd className="whitespace-pre rounded-md bg-[var(--ms-fill)] px-1.5 py-0.5 font-sans text-[12px] font-medium text-[var(--ms-label)]">{combo}</kbd>
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
          <p className="text-[11.5px] leading-snug text-[var(--ms-label-3)]">
            Browsers keep ⌘1–⌘9 for their own tabs, so views use the bare digits here. ⇧⌘D, ⌘R and ⌘F act on this page while it has focus.
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * Load failure with nothing to show. Says which delivery space was asked for —
 * the commonest cause is a wrong key — and lets it be changed in place.
 */
export function ErrorState({ message, onRetry, what, projectKey }: { message: string; onRetry: () => void; what: string; projectKey: string }) {
  const auth = /auth|sign in/i.test(message);
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [key, setKey] = useState(projectKey);
  return (
    <div role="alert" className="flex flex-1 items-center justify-center p-8">
      <div className="ms-fade-up flex max-w-sm flex-col items-center text-center">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--ms-warn-fill)] text-[var(--ms-warn-text)]" aria-hidden="true">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <path d="M12 8v5m0 3.5v.01M10.3 3.9 2.4 17.6A2 2 0 0 0 4.1 20.6h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <h2 className="text-[17px] font-semibold text-[var(--ms-label)]">{auth ? "Sign in to Jira again" : `Couldn’t load ${what}`}</h2>
        <p className="mt-1.5 text-[13px] leading-relaxed text-[var(--ms-label-2)]">{message}</p>
        {editing ? (
          <form
            className="mt-3 flex items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const next = key.trim().toUpperCase();
              if (!next) return;
              try {
                localStorage.setItem("btm:deliveryProject", next);
              } catch {
                // Not worth surfacing.
              }
              router.push(`/program/${encodeURIComponent(next)}`);
            }}
          >
            <label htmlFor="ms-space" className="text-[12px] text-[var(--ms-label-3)]">
              Delivery space
            </label>
            <input
              id="ms-space"
              autoFocus
              value={key}
              onChange={(e) => setKey(e.target.value)}
              className="h-7 w-20 rounded-md bg-[var(--ms-fill)] px-2 text-center font-mono text-[13px] uppercase text-[var(--ms-label)] outline-none focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--ms-accent)_35%,transparent)]"
            />
            <button type="submit" className="rounded-full bg-[var(--ms-accent)] px-3 py-1 text-[12px] font-medium text-white hover:opacity-90">
              Open
            </button>
          </form>
        ) : (
          <p className="mt-2 text-[12px] text-[var(--ms-label-3)]">
            Delivery space <span className="font-mono font-medium text-[var(--ms-label-2)]">{projectKey}</span> ·{" "}
            <button type="button" onClick={() => setEditing(true)} className="font-medium text-[var(--ms-accent-text)] hover:underline">
              Change…
            </button>
          </p>
        )}
        <div className="mt-5 flex gap-2">
          {auth ? (
            <a href="/api/auth/login" className="rounded-full bg-[var(--ms-accent)] px-4 py-1.5 text-[13px] font-medium text-white hover:opacity-90">
              Sign in
            </a>
          ) : (
            <button type="button" onClick={onRetry} className="rounded-full bg-[var(--ms-accent)] px-4 py-1.5 text-[13px] font-medium text-white hover:opacity-90">
              Try again
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
