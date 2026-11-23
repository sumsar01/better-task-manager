// ── Milestone (delivery program) API contract ────────────────────────────────
//
// Shared by the milestone API routes, the web milestone pages and (mirrored by
// hand in Swift) the native mac app. Everything here is plain JSON — arrays,
// not Sets — so the same payload decodes on every client.
//
// The model has three layers:
//   capability (LA, Jira Product Discovery idea)
//     ← implemented by → increment (epic in the delivery space, fix version = milestone)
//       ← implemented by → team epic (epic in a team space)
//         → work items (stories/tasks), sequenced by "blocks" links

export type StatusCategory = "new" | "indeterminate" | "done";

export interface StatusRef {
  name: string;
  category: StatusCategory;
}

export interface IssueRef {
  key: string;
  summary: string;
  status: StatusRef;
}

export interface Release {
  id: string;
  name: string;
  description: string | null;
  released: boolean;
  archived: boolean;
  startDate: string | null;
  releaseDate: string | null;
  overdue: boolean;
  /** Position in the delivery space's release order (0-based). */
  sequence: number;
}

export interface Progress {
  done: number;
  inProgress: number;
  todo: number;
  total: number;
}

// ── Program overview (all releases) ─────────────────────────────────────────

export interface IncrementSummary {
  key: string;
  summary: string;
  status: StatusRef;
  team: string | null;
  capabilities: IssueRef[];
  /** Team epics that implement this increment. */
  teamEpics: IssueRef[];
  /** Increment keys this increment declares it blocks / is blocked by. */
  blocks: string[];
  blockedBy: string[];
}

export interface ProgramRelease extends Release {
  increments: IncrementSummary[];
  /** Progress counted over increments. */
  progress: Progress;
  /** Progress counted over the team epics implementing those increments. */
  epicProgress: Progress;
}

export interface ProgramOverview {
  project: { key: string; name: string };
  releases: ProgramRelease[];
  /** Increments in the delivery space without a fix version. */
  unscheduled: IncrementSummary[];
  warnings: MilestoneWarning[];
  generatedAt: string;
}

// ── Milestone detail (one release) ──────────────────────────────────────────

export interface ItemSchedule {
  /** Earliest dependency level the item can start at (0 = can start now). */
  earliestStart: number;
  earliestFinish: number;
  latestStart: number;
  /** How many levels the item can slip without delaying the milestone. */
  slack: number;
  critical: boolean;
  /** Not done, and every blocker is done. */
  ready: boolean;
  /** Remaining items that transitively wait on this one. */
  downstream: number;
  /** Teams (other than this item's own) with remaining work waiting on this item. */
  downstreamTeams: string[];
}

export interface WorkItem {
  key: string;
  summary: string;
  type: string;
  status: StatusRef;
  assignee: string | null;
  /** Atlassian accountId of the assignee; absent in older payloads. */
  assigneeId?: string | null;
  epicKey: string | null;
  team: string;
  incrementKey: string | null;
  points: number | null;
  /** Outside this milestone (a blocker or dependant pulled in through a link). */
  external: boolean;
  /** Carries the external label: a decision or change owned outside the program (Finance, a vendor). */
  outsideDecision: boolean;
  /** Jira due date, YYYY-MM-DD. */
  dueDate: string | null;
  /** Stands in for a team epic that has no child items. */
  placeholder: boolean;
  /** Stands in for an increment with no open team epics (also a placeholder). */
  standIn: boolean;
  blockedBy: string[];
  blocks: string[];
  /** null for done items — they no longer take part in scheduling. */
  schedule: ItemSchedule | null;
}

export type DependencyKind = "item" | "epic";

export interface Dependency {
  from: string;
  to: string;
  /** "item" = a blocks link between work items; "epic" = a blocks link between team epics. */
  kind: DependencyKind;
  crossTeam: boolean;
  crossEpic: boolean;
  /** The blocker is done. */
  satisfied: boolean;
  critical: boolean;
}

export interface TeamEpic {
  key: string;
  summary: string;
  status: StatusRef;
  team: string;
  projectKey: string;
  assignee: string | null;
  /** Atlassian accountId of the assignee; absent in older payloads. */
  assigneeId?: string | null;
  incrementKeys: string[];
  itemKeys: string[];
  progress: Progress;
  /** Epic keys this epic's remaining work blocks (derived from item links + epic links). */
  blocksEpics: string[];
  blockedByEpics: string[];
  earliestStart: number | null;
  earliestFinish: number | null;
  criticalItems: number;
  onCriticalPath: boolean;
  /** The increment itself, standing in until it has open team epics; its key is the increment's. */
  standIn: boolean;
  /** Carries the design-approved label: its decision log is signed off. */
  designApproved: boolean;
}

export interface Increment extends IncrementSummary {
  progress: Progress;
  /** Increments this one blocks, derived from the team-level links. */
  derivedBlocks: string[];
  derivedBlockedBy: string[];
  criticalItems: number;
  earliestFinish: number | null;
}

export interface TeamSummary {
  name: string;
  epicKeys: string[];
  progress: Progress;
  remaining: number;
  criticalItems: number;
  readyNow: number;
  unassignedRemaining: number;
  /** Remaining items in this team blocked by another team's remaining work. */
  waitingOnOtherTeams: number;
  /** Remaining items in other teams blocked by this team's remaining work. */
  blockingOtherTeams: number;
  /** Remaining items per earliest-start level — the team's load over the schedule. */
  loadByLevel: number[];
  criticalByLevel: number[];
}

export interface BlockerEpic {
  epicKey: string;
  team: string;
  remaining: number;
  blockedEpics: string[];
  blockedTeams: string[];
  /** Remaining items outside this epic that transitively wait on it. */
  downstreamItems: number;
  onCriticalPath: boolean;
  /** This epic's remaining items that directly unblock work elsewhere, most impactful first. */
  gatingItems: string[];
}

export type WarningKind =
  | "cycle"
  | "undeclared-dependency"
  | "unbacked-dependency"
  | "out-of-order-dependency"
  | "external-blocker"
  | "no-team-epics"
  | "unscheduled"
  | "unassigned-critical"
  | "unapproved-design"
  | "unowned-outside-decision";

export interface MilestoneWarning {
  kind: WarningKind;
  message: string;
  keys: string[];
}

export interface CriticalPath {
  /** One representative longest chain, start → finish. */
  keys: string[];
  /** Every item with zero slack. */
  criticalKeys: string[];
  /** Length of the longest remaining chain, in items. */
  length: number;
}

export interface MilestoneDetail {
  project: { key: string; name: string };
  release: Release;
  increments: Increment[];
  epics: TeamEpic[];
  items: WorkItem[];
  dependencies: Dependency[];
  teams: TeamSummary[];
  criticalPath: CriticalPath;
  blockerEpics: BlockerEpic[];
  /** Ready-to-start items, critical first, then by downstream impact. */
  readyNow: string[];
  /** Open items waiting on a decision outside the program, soonest due first. */
  outsideDecisions: string[];
  progress: Progress;
  warnings: MilestoneWarning[];
  generatedAt: string;
}
