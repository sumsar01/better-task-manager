"use client";

import { SectionHeader, Section } from "./StatusBadge";
import { STATUS_STYLES, STATUS_ACCENT } from "./tokens";
import type { IssueDetail } from "./types";

interface IssueRelationsProps {
  f: IssueDetail["fields"];
  onNavigate?: (key: string) => void;
}

export default function IssueRelations({ f, onNavigate }: IssueRelationsProps) {
  const links = f.issuelinks ?? [];

  return (
    <>
      {/* Parent */}
      {f.parent && (
        <Section>
          <SectionHeader title="Parent" />
          <button
            onClick={() => onNavigate?.(f.parent!.key)}
            className="flex items-center gap-2.5 w-full text-left px-3.5 py-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80 hover:border-indigo-300 dark:hover:border-indigo-500 hover:bg-indigo-50/50 dark:hover:bg-indigo-900/20 transition-colors group"
          >
            <span className="text-xs font-mono font-bold text-indigo-600 dark:text-indigo-400 shrink-0">{f.parent.key}</span>
            <span className="text-sm text-slate-600 dark:text-slate-300 truncate flex-1">{f.parent.fields.summary}</span>
            <svg width="14" height="14" viewBox="0 0 12 12" fill="none" className="text-slate-300 dark:text-slate-600 group-hover:text-indigo-400 transition-colors shrink-0">
              <path d="M4 2l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </Section>
      )}

      {/* Linked issues */}
      {links.length > 0 && (
        <Section>
          <SectionHeader title="Linked Issues" count={links.length} />
          <ul className="space-y-1.5">
            {links.map((link) => {
              const ref = link.inwardIssue ?? link.outwardIssue;
              const direction = link.inwardIssue ? link.type.inward : link.type.outward;
              if (!ref) return null;
              const sKey = ref.fields.status.statusCategory.key;
              const s = STATUS_STYLES[sKey] ?? STATUS_STYLES.new;
              const accent = STATUS_ACCENT[sKey] ?? STATUS_ACCENT.new;
              return (
                <li key={link.id}>
                  <button
                    onClick={() => onNavigate?.(ref.key)}
                    className="flex items-center gap-3 w-full text-left px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80 hover:border-indigo-300 dark:hover:border-indigo-500 hover:bg-indigo-50/40 dark:hover:bg-indigo-900/20 transition-all group overflow-hidden"
                  >
                    <span className={`w-1 h-8 rounded-full shrink-0 ${accent}`} />
                    <div className="flex-1 min-w-0">
                      <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-0.5">{direction}</span>
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-xs font-mono font-bold text-indigo-600 dark:text-indigo-400 shrink-0">{ref.key}</span>
                        <span className="text-sm text-slate-600 dark:text-slate-300 truncate">{ref.fields.summary}</span>
                      </div>
                    </div>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border shrink-0 dark:bg-slate-700/60 dark:border-slate-600/50 dark:text-slate-200 ${s.text} ${s.bg} ${s.border}`}>
                      {ref.fields.status.name}
                    </span>
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="text-slate-300 dark:text-slate-600 group-hover:text-indigo-400 transition-colors shrink-0">
                      <path d="M4 2l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                </li>
              );
            })}
          </ul>
        </Section>
      )}

      {/* Subtasks */}
      {f.subtasks && f.subtasks.length > 0 && (
        <Section>
          <SectionHeader title="Subtasks" count={f.subtasks.length} />
          <ul className="space-y-1.5">
            {f.subtasks.map((st) => {
              const sKey = st.fields.status.statusCategory.key;
              const s = STATUS_STYLES[sKey] ?? STATUS_STYLES.new;
              const accent = STATUS_ACCENT[sKey] ?? STATUS_ACCENT.new;
              return (
                <li key={st.key}>
                  <button
                    onClick={() => onNavigate?.(st.key)}
                    className="flex items-center gap-3 w-full text-left px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80 hover:border-indigo-300 dark:hover:border-indigo-500 hover:bg-indigo-50/40 dark:hover:bg-indigo-900/20 transition-all group overflow-hidden"
                  >
                    <span className={`w-1 h-8 rounded-full shrink-0 ${accent}`} />
                    <div className="flex-1 min-w-0 flex items-center gap-2">
                      <span className="text-xs font-mono font-bold text-indigo-600 dark:text-indigo-400 shrink-0">{st.key}</span>
                      <span className="text-sm text-slate-600 dark:text-slate-300 truncate flex-1">{st.fields.summary}</span>
                    </div>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border shrink-0 dark:bg-slate-700/60 dark:border-slate-600/50 dark:text-slate-200 ${s.text} ${s.bg} ${s.border}`}>
                      {st.fields.status.name}
                    </span>
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="text-slate-300 dark:text-slate-600 group-hover:text-indigo-400 transition-colors shrink-0">
                      <path d="M4 2l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                </li>
              );
            })}
          </ul>
        </Section>
      )}
    </>
  );
}
