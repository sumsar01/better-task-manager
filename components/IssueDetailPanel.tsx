"use client";

import { useEffect, useRef, useState } from "react";
import { adfToHtml } from "@/lib/adfToHtml";

// ── Types ─────────────────────────────────────────────────────────────────────

interface AdfNode {
  type: string;
  attrs?: Record<string, string | number | boolean | null>;
  content?: AdfNode[];
  marks?: Array<{ type: string; attrs?: Record<string, string | number | boolean | null> }>;
  text?: string;
}

interface IssueStatus {
  name: string;
  statusCategory: { key: string };
}

interface IssueType {
  name: string;
  subtask: boolean;
}

interface IssueUser {
  displayName: string;
  avatarUrls?: Record<string, string>;
}

interface IssueLinkRef {
  key: string;
  fields: { summary: string; status: IssueStatus };
}

interface IssueLink {
  id: string;
  type: { name: string; inward: string; outward: string };
  inwardIssue?: IssueLinkRef;
  outwardIssue?: IssueLinkRef;
}

interface IssueComment {
  id: string;
  author: IssueUser;
  body: AdfNode | null;
  created: string;
  updated: string;
}

interface IssueDetail {
  id: string;
  key: string;
  fields: {
    summary: string;
    status: IssueStatus;
    issuetype: IssueType;
    assignee: IssueUser | null;
    priority?: { name: string };
    labels?: string[];
    description: AdfNode | null;
    comment?: { comments: IssueComment[] };
    issuelinks?: IssueLink[];
    parent?: { key: string; fields: { summary: string } };
    subtasks?: Array<{ key: string; fields: { summary: string; status: IssueStatus } }>;
    customfield_10016?: number | null;
    customfield_10028?: number | null;
  };
}

// ── Design tokens ─────────────────────────────────────────────────────────────

const STATUS_STYLES: Record<string, { dot: string; text: string; bg: string; border: string }> = {
  new: {
    dot: "#94a3b8",
    text: "text-slate-600",
    bg: "bg-slate-100",
    border: "border-slate-200",
  },
  indeterminate: {
    dot: "#6366f1",
    text: "text-indigo-700",
    bg: "bg-indigo-50",
    border: "border-indigo-200",
  },
  done: {
    dot: "#22c55e",
    text: "text-green-700",
    bg: "bg-green-50",
    border: "border-green-200",
  },
};

const STATUS_ACCENT: Record<string, string> = {
  new: "bg-slate-300",
  indeterminate: "bg-indigo-400",
  done: "bg-green-400",
};

const PRIORITY_STYLES: Record<string, { color: string; bg: string; border: string; icon: string }> = {
  Highest: { color: "text-red-700",    bg: "bg-red-50",    border: "border-red-200",    icon: "↑↑" },
  High:    { color: "text-orange-700", bg: "bg-orange-50", border: "border-orange-200", icon: "↑"  },
  Medium:  { color: "text-yellow-700", bg: "bg-yellow-50", border: "border-yellow-200", icon: "→"  },
  Low:     { color: "text-blue-700",   bg: "bg-blue-50",   border: "border-blue-200",   icon: "↓"  },
  Lowest:  { color: "text-slate-500",  bg: "bg-slate-100", border: "border-slate-200",  icon: "↓↓" },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function avatarInitials(name: string): string {
  return name.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase();
}

function avatarColor(name: string): string {
  const colors = ["#6366f1", "#8b5cf6", "#ec4899", "#f59e0b", "#10b981", "#0ea5e9", "#f97316"];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Avatar({ name, size = "md" }: { name: string; size?: "sm" | "md" | "lg" }) {
  const dim =
    size === "sm" ? "w-6 h-6 text-[10px]" :
    size === "lg" ? "w-9 h-9 text-[13px]" :
    "w-7 h-7 text-[11px]";
  return (
    <span
      className={`${dim} rounded-full flex items-center justify-center font-bold text-white shrink-0`}
      style={{ background: avatarColor(name) }}
      title={name}
    >
      {avatarInitials(name)}
    </span>
  );
}

function StatusBadge({ status }: { status: IssueStatus }) {
  const s = STATUS_STYLES[status.statusCategory.key] ?? STATUS_STYLES.new;
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border ${s.text} ${s.bg} ${s.border}`}>
      <span className="w-2 h-2 rounded-full" style={{ background: s.dot }} />
      {status.name}
    </span>
  );
}

function SectionHeader({ title, count }: { title: string; count?: number }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <span className="text-xs font-bold uppercase tracking-widest text-slate-500">{title}</span>
      {count !== undefined && (
        <span className="text-xs font-semibold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded-md tabular-nums">
          {count}
        </span>
      )}
    </div>
  );
}

function Section({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`pt-5 border-t border-slate-200 ${className}`}>
      {children}
    </div>
  );
}

function SkeletonLine({ w = "full", h = "3" }: { w?: string; h?: string }) {
  return <div className={`h-${h} w-${w} bg-slate-100 rounded animate-pulse`} />;
}

function PanelSkeleton() {
  return (
    <div className="px-5 py-5 space-y-4">
      <SkeletonLine w="1/3" h="3" />
      <SkeletonLine w="4/5" h="5" />
      <SkeletonLine w="3/5" h="4" />
      <div className="h-px bg-slate-100 my-4" />
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2"><SkeletonLine w="1/2" h="2" /><SkeletonLine w="3/4" h="6" /></div>
        <div className="space-y-2"><SkeletonLine w="1/2" h="2" /><SkeletonLine w="3/4" h="6" /></div>
        <div className="space-y-2"><SkeletonLine w="1/2" h="2" /><SkeletonLine w="3/4" h="6" /></div>
        <div className="space-y-2"><SkeletonLine w="1/2" h="2" /><SkeletonLine w="3/4" h="6" /></div>
      </div>
      <div className="h-px bg-slate-100 my-4" />
      <SkeletonLine h="3" />
      <SkeletonLine w="5/6" h="3" />
      <SkeletonLine w="4/6" h="3" />
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface IssueDetailPanelProps {
  issueKey: string;
  jiraBaseUrl: string;
  onClose: () => void;
  onNavigate?: (key: string) => void;
}

export default function IssueDetailPanel({
  issueKey,
  jiraBaseUrl,
  onClose,
  onNavigate,
}: IssueDetailPanelProps) {
  const [issue, setIssue] = useState<IssueDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setIssue(null);

    fetch(`/api/jira/issue/${encodeURIComponent(issueKey)}`)
      .then(async (r) => {
        if (!r.ok) {
          const j = await r.json().catch(() => ({}));
          throw new Error((j as { error?: string }).error ?? `HTTP ${r.status}`);
        }
        return r.json() as Promise<IssueDetail>;
      })
      .then((data) => { if (!cancelled) setIssue(data); })
      .catch((e: Error) => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [issueKey]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const f = issue?.fields;
  const storyPoints = f?.customfield_10028 ?? f?.customfield_10016 ?? null;
  const descHtml = f?.description ? adfToHtml(f.description as Parameters<typeof adfToHtml>[0]) : null;
  const comments = f?.comment?.comments?.slice(-20) ?? [];
  const links = f?.issuelinks ?? [];
  const priorityStyle = f?.priority ? (PRIORITY_STYLES[f.priority.name] ?? null) : null;

  return (
    <aside
      ref={panelRef}
      className="flex flex-col h-full w-full bg-white overflow-hidden"
    >
      {/* ── Panel header ── */}
      <div className="px-5 pt-5 pb-4 border-b border-slate-200 shrink-0 bg-white">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            {/* Issue key + type */}
            <div className="flex items-center gap-2 mb-2.5 flex-wrap">
              <a
                href={`${jiraBaseUrl}/browse/${issueKey}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs font-mono font-bold text-indigo-600 bg-indigo-50 border border-indigo-200 px-2.5 py-1 rounded-lg hover:bg-indigo-100 transition-colors"
              >
                {issueKey}
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                  <path d="M2 8L8 2M8 2H4M8 2v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </a>
              {f && (
                <span className="text-xs font-medium text-slate-500 bg-slate-100 border border-slate-200 px-2.5 py-1 rounded-lg">
                  {f.issuetype.name}
                </span>
              )}
            </div>
            {/* Summary */}
            {f && (
              <h2 className="text-base font-semibold text-slate-900 leading-snug">
                {f.summary}
              </h2>
            )}
            {loading && !f && (
              <div className="space-y-2 mt-1">
                <SkeletonLine w="1/3" h="3" />
                <SkeletonLine w="4/5" h="5" />
              </div>
            )}
          </div>
          {/* Close button */}
          <button
            onClick={onClose}
            aria-label="Close panel"
            className="shrink-0 w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>

      {/* ── Body ── */}
      <div className="flex-1 overflow-y-auto">
        {loading && <PanelSkeleton />}

        {error && (
          <div className="mx-5 mt-5 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
            <p className="text-sm font-semibold text-red-700 mb-0.5">Failed to load issue</p>
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        {!loading && !error && f && (
          <div className="px-5 pb-10 space-y-5">

            {/* ── Meta grid ── */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 mt-4 grid grid-cols-2 gap-x-4 gap-y-4">
              {/* Status */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">Status</p>
                <StatusBadge status={f.status} />
              </div>

              {/* Assignee */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">Assignee</p>
                {f.assignee ? (
                  <div className="flex items-center gap-1.5">
                    <Avatar name={f.assignee.displayName} size="sm" />
                    <span className="text-sm text-slate-700 font-medium truncate">{f.assignee.displayName}</span>
                  </div>
                ) : (
                  <span className="text-sm text-slate-400 italic">Unassigned</span>
                )}
              </div>

              {/* Priority */}
              {f.priority && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">Priority</p>
                  <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border ${priorityStyle?.color ?? "text-slate-600"} ${priorityStyle?.bg ?? "bg-slate-100"} ${priorityStyle?.border ?? "border-slate-200"}`}>
                    <span className="font-bold">{priorityStyle?.icon ?? ""}</span>
                    {f.priority.name}
                  </span>
                </div>
              )}

              {/* Story points */}
              {storyPoints != null && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">Points</p>
                  <span className="inline-flex items-center text-sm font-bold text-violet-700 bg-violet-50 border border-violet-200 px-2.5 py-1 rounded-lg">
                    {storyPoints} pts
                  </span>
                </div>
              )}
            </div>

            {/* Labels */}
            {f.labels && f.labels.length > 0 && (
              <Section>
                <SectionHeader title="Labels" />
                <div className="flex flex-wrap gap-2">
                  {f.labels.map((l) => (
                    <span key={l} className="text-xs font-medium text-slate-600 bg-slate-100 border border-slate-200 px-2.5 py-1 rounded-full">
                      {l}
                    </span>
                  ))}
                </div>
              </Section>
            )}

            {/* Parent */}
            {f.parent && (
              <Section>
                <SectionHeader title="Parent" />
                <button
                  onClick={() => onNavigate?.(f.parent!.key)}
                  className="flex items-center gap-2.5 w-full text-left px-3.5 py-3 rounded-xl bg-slate-50 border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/50 transition-colors group"
                >
                  <span className="text-xs font-mono font-bold text-indigo-600 shrink-0">{f.parent.key}</span>
                  <span className="text-sm text-slate-600 truncate flex-1">{f.parent.fields.summary}</span>
                  <svg width="14" height="14" viewBox="0 0 12 12" fill="none" className="text-slate-300 group-hover:text-indigo-400 transition-colors shrink-0">
                    <path d="M4 2l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              </Section>
            )}

            {/* Description */}
            <Section>
              <SectionHeader title="Description" />
              {descHtml ? (
                <div
                  className="adf-content text-sm text-slate-700 leading-relaxed"
                  dangerouslySetInnerHTML={{ __html: descHtml }}
                />
              ) : (
                <p className="text-sm text-slate-400 italic">No description provided.</p>
              )}
            </Section>

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
                          className="flex items-center gap-3 w-full text-left px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/40 transition-all group overflow-hidden"
                        >
                          {/* Status accent bar */}
                          <span className={`w-1 h-8 rounded-full shrink-0 ${accent}`} />
                          <div className="flex-1 min-w-0">
                            {/* Direction label */}
                            <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">{direction}</span>
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="text-xs font-mono font-bold text-indigo-600 shrink-0">{ref.key}</span>
                              <span className="text-sm text-slate-600 truncate">{ref.fields.summary}</span>
                            </div>
                          </div>
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border shrink-0 ${s.text} ${s.bg} ${s.border}`}>
                            {ref.fields.status.name}
                          </span>
                          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="text-slate-300 group-hover:text-indigo-400 transition-colors shrink-0">
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
                          className="flex items-center gap-3 w-full text-left px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/40 transition-all group overflow-hidden"
                        >
                          {/* Status accent bar */}
                          <span className={`w-1 h-8 rounded-full shrink-0 ${accent}`} />
                          <div className="flex-1 min-w-0 flex items-center gap-2">
                            <span className="text-xs font-mono font-bold text-indigo-600 shrink-0">{st.key}</span>
                            <span className="text-sm text-slate-600 truncate flex-1">{st.fields.summary}</span>
                          </div>
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border shrink-0 ${s.text} ${s.bg} ${s.border}`}>
                            {st.fields.status.name}
                          </span>
                          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="text-slate-300 group-hover:text-indigo-400 transition-colors shrink-0">
                            <path d="M4 2l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </Section>
            )}

            {/* Comments */}
            <Section>
              <SectionHeader title="Comments" count={comments.length > 0 ? comments.length : undefined} />
              {comments.length === 0 ? (
                <p className="text-sm text-slate-400 italic">No comments yet.</p>
              ) : (
                <ul className="space-y-3">
                  {[...comments].reverse().map((c) => {
                    const bodyHtml = c.body
                      ? adfToHtml(c.body as Parameters<typeof adfToHtml>[0])
                      : null;
                    const ts = c.updated !== c.created ? c.updated : c.created;
                    return (
                      <li key={c.id} className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                        <div className="flex items-center gap-2.5 mb-2.5">
                          <Avatar name={c.author.displayName} size="md" />
                          <div className="flex-1 min-w-0">
                            <span className="text-sm font-semibold text-slate-800 block leading-tight">
                              {c.author.displayName}
                            </span>
                          </div>
                          <span className="text-xs text-slate-400 shrink-0">
                            {relativeTime(ts)}
                          </span>
                        </div>
                        {bodyHtml ? (
                          <div
                            className="adf-content text-sm text-slate-600 leading-relaxed"
                            dangerouslySetInnerHTML={{ __html: bodyHtml }}
                          />
                        ) : (
                          <p className="text-sm text-slate-400 italic">Empty comment.</p>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </Section>

          </div>
        )}
      </div>
    </aside>
  );
}
