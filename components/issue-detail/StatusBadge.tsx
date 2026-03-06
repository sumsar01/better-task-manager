"use client";

import type { JiraStatus } from "@/lib/jira";
import { STATUS_STYLES } from "./tokens";

export function StatusBadge({ status }: { status: JiraStatus }) {
  const s = STATUS_STYLES[status.statusCategory.key] ?? STATUS_STYLES.new;
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border dark:bg-slate-700/60 dark:border-slate-600/50 dark:text-slate-200 ${s.text} ${s.bg} ${s.border}`}>
      <span className="w-2 h-2 rounded-full" style={{ background: s.dot }} />
      {status.name}
    </span>
  );
}

export function SectionHeader({ title, count }: { title: string; count?: number }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <span className="text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">{title}</span>
      {count !== undefined && (
        <span className="text-xs font-semibold text-slate-400 dark:text-slate-400 bg-slate-100 dark:bg-slate-700 px-1.5 py-0.5 rounded-md tabular-nums">
          {count}
        </span>
      )}
    </div>
  );
}

export function Section({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`pt-5 border-t border-slate-200 dark:border-slate-700 ${className}`}>
      {children}
    </div>
  );
}
