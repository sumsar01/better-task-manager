import type { JiraIssue, JiraStatus, JiraIssueType } from "./jira";

// ── Beads types ───────────────────────────────────────────────────────────────

export interface BeadsDependency {
  issue_id: string;
  depends_on_id: string;
  type: "blocks" | "discovered-from" | string;
  created_at: string;
  created_by: string;
  metadata: string;
}

export interface BeadsIssue {
  id: string;
  title: string;
  description?: string;
  status: "open" | "in_progress" | "closed" | "done" | string;
  priority: number;
  issue_type: "bug" | "feature" | "task" | "chore" | "epic" | string;
  assignee?: string;
  owner?: string;
  created_at: string;
  created_by?: string;
  updated_at?: string;
  closed_at?: string;
  close_reason?: string;
  dependencies?: BeadsDependency[];
  dependency_count?: number;
  dependent_count?: number;
  comment_count?: number;
  labels?: string[];
  notes?: string;
}

// ── Repo info ─────────────────────────────────────────────────────────────────

export interface BeadsRepo {
  /** Human-readable directory name, also used as the URL slug. */
  name: string;
  /** Absolute path to the repo root. */
  path: string;
}

// ── Status mapping ────────────────────────────────────────────────────────────

/** Active statuses — anything else (closed, done) is filtered out. */
export const ACTIVE_STATUSES = new Set(["open", "in_progress"]);

function beadsStatusToJira(status: string): JiraStatus {
  // open → new (To Do), in_progress → indeterminate (In Progress)
  const categoryKey = status === "in_progress" ? "indeterminate" : "new";
  const categoryName = status === "in_progress" ? "In Progress" : "To Do";
  const statusName = status === "in_progress" ? "In Progress" : "Open";
  return {
    id: status,
    name: statusName,
    statusCategory: { id: 0, key: categoryKey, name: categoryName },
  };
}

// ── Issue-type mapping ────────────────────────────────────────────────────────

function beadsTypeToJira(issueType: string): JiraIssueType {
  // Map beads issue_type to the names that IssueNode's ISSUE_TYPE_LABEL table
  // recognises: Story, Bug, Task, Subtask, Epic (case-sensitive match in IssueNode).
  const nameMap: Record<string, string> = {
    feature: "Story",
    bug: "Bug",
    task: "Task",
    chore: "Task",
    epic: "Epic",
  };
  const name = nameMap[issueType] ?? "Task";
  return { id: issueType, name, subtask: false };
}

// ── Synthetic epic keys for type groups ───────────────────────────────────────

/** Prefix for synthetic type-group epic keys (for issues not in any discovered-from group). */
const TYPE_GROUP_PREFIX = "__type_group_";

export function typeGroupKey(issueType: string): string {
  return `${TYPE_GROUP_PREFIX}${issueType}__`;
}

const TYPE_GROUP_LABELS: Record<string, string> = {
  feature: "Features",
  bug: "Bugs",
  task: "Tasks",
  chore: "Chores",
  epic: "Epics",
};

// ── Main adapter ──────────────────────────────────────────────────────────────

/**
 * Converts a list of BeadsIssue objects into JiraIssue objects that the
 * existing buildGraph / GraphView pipeline can consume unchanged.
 *
 * Grouping strategy:
 * 1. Issues that have other issues pointing at them via `discovered-from`
 *    deps become group parents (rendered as EpicGroupNode containers).
 * 2. Issues with a `discovered-from` parent are nested inside that parent's
 *    container (via JiraIssue.fields.parent).
 * 3. All remaining issues (no discovered-from relationship) get a synthetic
 *    type-group epic parent (e.g. "__type_group_task__") so they're grouped
 *    by issue_type — reusing the same EpicGroupNode rendering path.
 *
 * Only `blocks` deps are emitted as edges (via issuelinks).
 * `discovered-from` deps are used only for grouping, never as edges.
 */
export function beadsIssuesToJiraIssues(issues: BeadsIssue[]): JiraIssue[] {
  // ── Step 1: Build the discovered-from parent→children map ────────────────
  // child id → parent id
  const discoveredParent = new Map<string, string>();
  for (const issue of issues) {
    for (const dep of issue.dependencies ?? []) {
      if (dep.type === "discovered-from") {
        discoveredParent.set(issue.id, dep.depends_on_id);
      }
    }
  }
  // parent id → child ids
  const discoveredChildren = new Map<string, string[]>();
  for (const [childId, parentId] of discoveredParent) {
    const arr = discoveredChildren.get(parentId) ?? [];
    arr.push(childId);
    discoveredChildren.set(parentId, arr);
  }

  // Issues acting as group parents (have at least one discovered-from child)
  const groupParentIds = new Set(discoveredChildren.keys());

  // ── Step 2: Build blocks adjacency (for issuelinks) ──────────────────────
  // issue id → list of ids it blocks
  const blocksMap = new Map<string, string[]>();
  for (const issue of issues) {
    for (const dep of issue.dependencies ?? []) {
      if (dep.type === "blocks") {
        const arr = blocksMap.get(issue.id) ?? [];
        arr.push(dep.depends_on_id);
        blocksMap.set(issue.id, arr);
      }
    }
  }

  // Quick lookup by id
  const issueById = new Map(issues.map((i) => [i.id, i]));

  const result: JiraIssue[] = [];

  // ── Step 3: Emit group-parent synthetic epics ─────────────────────────────
  for (const parentId of groupParentIds) {
    const parent = issueById.get(parentId);
    if (!parent) continue;

    result.push(makeJiraIssue(parent, blocksMap, {
      // Treat as an Epic so buildGraph creates an EpicGroupNode for it
      overrideType: { id: parent.issue_type, name: "Epic", subtask: false },
    }));
  }

  // ── Step 4: Emit discovered-from children with parent link ────────────────
  for (const [childId, parentId] of discoveredParent) {
    const child = issueById.get(childId);
    const parent = issueById.get(parentId);
    if (!child || !parent) continue;

    result.push(makeJiraIssue(child, blocksMap, {
      parent: {
        id: parent.id,
        key: parent.id,
        fields: {
          summary: parent.title,
          issuetype: { id: parent.issue_type, name: "Epic", subtask: false },
        },
      },
    }));
  }

  // ── Step 5: Remaining issues → type-group synthetic epics ────────────────
  const alreadyEmitted = new Set([...groupParentIds, ...discoveredParent.keys()]);

  // Collect unique types for remaining issues
  const remainingByType = new Map<string, BeadsIssue[]>();
  for (const issue of issues) {
    if (alreadyEmitted.has(issue.id)) continue;
    const arr = remainingByType.get(issue.issue_type) ?? [];
    arr.push(issue);
    remainingByType.set(issue.issue_type, arr);
  }

  // Emit one synthetic epic per type group
  for (const [issueType, group] of remainingByType) {
    const groupKey = typeGroupKey(issueType);
    const groupLabel = TYPE_GROUP_LABELS[issueType] ?? issueType;

    // Synthetic Epic issue representing the type group container
    const syntheticEpic: JiraIssue = {
      id: groupKey,
      key: groupKey,
      fields: {
        summary: groupLabel,
        status: {
          id: "new",
          name: "Open",
          statusCategory: { id: 0, key: "new", name: "To Do" },
        },
        issuetype: { id: "epic", name: "Epic", subtask: false },
        assignee: null,
        issuelinks: [],
      },
    };
    result.push(syntheticEpic);

    // Emit each issue in this group with the synthetic epic as its parent
    for (const issue of group) {
      result.push(makeJiraIssue(issue, blocksMap, {
        parent: {
          id: groupKey,
          key: groupKey,
          fields: {
            summary: groupLabel,
            issuetype: { id: "epic", name: "Epic", subtask: false },
          },
        },
      }));
    }
  }

  return result;
}

// ── Helper ────────────────────────────────────────────────────────────────────

interface MakeOptions {
  overrideType?: JiraIssueType;
  parent?: JiraIssue["fields"]["parent"];
}

function makeJiraIssue(
  issue: BeadsIssue,
  blocksMap: Map<string, string[]>,
  { overrideType, parent }: MakeOptions = {},
): JiraIssue {
  const blockedIds = blocksMap.get(issue.id) ?? [];

  const issuelinks = blockedIds.map((blockedId, idx) => ({
    id: `${issue.id}__blocks__${blockedId}__${idx}`,
    type: {
      id: "blocks",
      name: "Blocks",
      inward: "is blocked by",
      outward: "blocks",
    },
    outwardIssue: {
      id: blockedId,
      key: blockedId,
      fields: {
        summary: "",
        status: {
          id: "new",
          name: "Open",
          statusCategory: { id: 0, key: "new", name: "To Do" },
        },
      },
    },
  }));

  const assignee = issue.assignee
    ? { accountId: issue.assignee, displayName: issue.assignee, avatarUrls: undefined }
    : null;

  return {
    id: issue.id,
    key: issue.id,
    fields: {
      summary: issue.title,
      status: beadsStatusToJira(issue.status),
      issuetype: overrideType ?? beadsTypeToJira(issue.issue_type),
      assignee,
      parent,
      issuelinks,
      priority: issue.priority !== undefined
        ? { name: PRIORITY_NAMES[issue.priority] ?? "Medium" }
        : undefined,
    },
  };
}

const PRIORITY_NAMES: Record<number, string> = {
  0: "Critical",
  1: "High",
  2: "Medium",
  3: "Low",
  4: "Lowest",
};
