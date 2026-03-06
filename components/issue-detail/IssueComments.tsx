"use client";

import { adfToHtml } from "@/lib/adfToHtml";
import Avatar from "./Avatar";
import { SectionHeader, Section } from "./StatusBadge";
import { relativeTime } from "./utils";
import type { IssueComment } from "./types";

interface IssueCommentsProps {
  comments: IssueComment[];
}

export default function IssueComments({ comments }: IssueCommentsProps) {
  return (
    <Section>
      <SectionHeader title="Comments" count={comments.length > 0 ? comments.length : undefined} />
      {comments.length === 0 ? (
        <p className="text-sm text-slate-400 dark:text-slate-500 italic">No comments yet.</p>
      ) : (
        <ul className="space-y-3">
          {[...comments].reverse().map((c) => {
            const bodyHtml = c.body ? adfToHtml(c.body) : null;
            const ts = c.updated !== c.created ? c.updated : c.created;
            return (
              <li key={c.id} className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80 rounded-xl p-4">
                <div className="flex items-center gap-2.5 mb-2.5">
                  <Avatar name={c.author.displayName} size="md" />
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-semibold text-slate-800 dark:text-slate-200 block leading-tight">
                      {c.author.displayName}
                    </span>
                  </div>
                  <span className="text-xs text-slate-400 dark:text-slate-500 shrink-0">
                    {relativeTime(ts)}
                  </span>
                </div>
                {bodyHtml ? (
                  <div
                    className="adf-content text-sm text-slate-600 dark:text-slate-300 leading-relaxed"
                    dangerouslySetInnerHTML={{ __html: bodyHtml }}
                  />
                ) : (
                  <p className="text-sm text-slate-400 dark:text-slate-500 italic">Empty comment.</p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Section>
  );
}
