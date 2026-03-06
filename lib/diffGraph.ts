import type { JiraIssue } from "./jira";

/**
 * Produces a stable fingerprint string for the fields we care about.
 * If this string is identical between two polls the issue has not changed.
 */
export function issueFingerprint(issue: JiraIssue): string {
  const links = (issue.fields.issuelinks ?? [])
    .map((l) => `${l.type.name}:${l.inwardIssue?.key ?? ""}:${l.outwardIssue?.key ?? ""}`)
    .sort()
    .join("|");

  return [
    issue.fields.status.id,
    issue.fields.summary,
    issue.fields.assignee?.accountId ?? "null",
    issue.fields.issuetype.id,
    links,
  ].join("§");
}

export interface IssueDiff {
  /** Issues whose fingerprint changed (status, summary, assignee, links). */
  changed: JiraIssue[];
  /** Issues present in next but not in prev. */
  added: JiraIssue[];
  /** Keys present in prev but not in next. */
  removed: string[];
  /** True if there are any changes at all. */
  hasChanges: boolean;
}

/**
 * Diff two snapshots of a list of Jira issues.
 * Compares by issue key; detects field changes via fingerprint.
 */
export function diffIssues(prev: JiraIssue[], next: JiraIssue[]): IssueDiff {
  const prevMap = new Map(prev.map((i) => [i.key, i]));
  const nextMap = new Map(next.map((i) => [i.key, i]));

  const changed: JiraIssue[] = [];
  const added: JiraIssue[] = [];
  const removed: string[] = [];

  for (const [key, nextIssue] of nextMap) {
    const prevIssue = prevMap.get(key);
    if (!prevIssue) {
      added.push(nextIssue);
    } else if (issueFingerprint(prevIssue) !== issueFingerprint(nextIssue)) {
      changed.push(nextIssue);
    }
  }

  for (const key of prevMap.keys()) {
    if (!nextMap.has(key)) {
      removed.push(key);
    }
  }

  return {
    changed,
    added,
    removed,
    hasChanges: changed.length > 0 || added.length > 0 || removed.length > 0,
  };
}
