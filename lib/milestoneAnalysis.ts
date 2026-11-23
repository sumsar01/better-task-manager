import type {
  BlockerEpic,
  CriticalPath,
  Dependency,
  Increment,
  IncrementSummary,
  ItemSchedule,
  MilestoneWarning,
  Progress,
  StatusRef,
  TeamEpic,
  TeamSummary,
  WorkItem,
} from "@/lib/milestoneTypes";

// ── Inputs ──────────────────────────────────────────────────────────────────
//
// Pure analysis over already-fetched, already-normalised Jira data — no I/O,
// so it can be exercised directly against fixtures.

export interface EpicInput {
  key: string;
  summary: string;
  status: StatusRef;
  team: string;
  projectKey: string;
  assignee: string | null;
  assigneeId?: string | null;
  incrementKeys: string[];
  /** Epic keys this epic declares it blocks (epic-level "blocks" links). */
  blocks: string[];
  /** Carries the design-approved label: its decision log is signed off. */
  designApproved: boolean;
}

export interface ItemInput {
  key: string;
  summary: string;
  type: string;
  status: StatusRef;
  assignee: string | null;
  assigneeId?: string | null;
  epicKey: string | null;
  team: string;
  points: number | null;
  external: boolean;
  /** Carries the external label: a decision or change owned outside the program. */
  outsideDecision?: boolean;
  /** Jira due date, YYYY-MM-DD. */
  dueDate?: string | null;
  /** Item keys this item blocks (outward "blocks" links). */
  blocks: string[];
}

export interface AnalysisInput {
  increments: IncrementSummary[];
  epics: EpicInput[];
  items: ItemInput[];
  /** Today as YYYY-MM-DD; defaults to the current date. */
  today?: string;
}

export interface AnalysisResult {
  increments: Increment[];
  epics: TeamEpic[];
  items: WorkItem[];
  dependencies: Dependency[];
  teams: TeamSummary[];
  criticalPath: CriticalPath;
  blockerEpics: BlockerEpic[];
  readyNow: string[];
  outsideDecisions: string[];
  progress: Progress;
  warnings: MilestoneWarning[];
}

// ── Helpers ─────────────────────────────────────────────────────────────────

const isDone = (s: StatusRef) => s.category === "done";

export function progressOf(statuses: StatusRef[]): Progress {
  const p: Progress = { done: 0, inProgress: 0, todo: 0, total: statuses.length };
  for (const s of statuses) {
    if (s.category === "done") p.done++;
    else if (s.category === "indeterminate") p.inProgress++;
    else p.todo++;
  }
  return p;
}

function pushUnique<K, V>(map: Map<K, V[]>, key: K, value: V) {
  const list = map.get(key);
  if (!list) map.set(key, [value]);
  else if (!list.includes(value)) list.push(value);
}

function placeholderKey(epicKey: string) {
  return epicKey;
}

/** Jira label on a team epic whose decision log is signed off. */
export const DESIGN_APPROVED_LABEL = "design-approved";

/** Jira label on a work item that waits on a decision owned outside the program. */
export const OUTSIDE_DECISION_LABEL = "external";

/** An unowned outside decision due this soon needs someone chasing it. */
const OUTSIDE_DECISION_HORIZON_DAYS = 14;

/** Team of a stand-in whose increment has no Team value set. */
export const NO_TEAM = "No team yet";

/**
 * While an increment has no open team epics — it hasn't been split into team
 * work yet, or only its earlier, finished team work is linked — it stands in
 * for its own remaining work as one team epic, owned by the increment's Team
 * value. Its declared increment links then sequence it, so the critical path
 * and team load exist before any team space does.
 */
function incrementStandIns(input: AnalysisInput): EpicInput[] {
  const epicByKey = new Map(input.epics.map((e) => [e.key, e]));
  return input.increments
    .filter((inc) => !isDone(inc.status))
    .filter((inc) => {
      const own = input.epics.filter((e) => e.incrementKeys.includes(inc.key));
      return own.every((e) => isDone(e.status)) && inc.teamEpics.every((e) => isDone(epicByKey.get(e.key)?.status ?? e.status));
    })
    .map((inc) => ({
      key: inc.key,
      summary: inc.summary,
      status: inc.status,
      team: inc.team ?? NO_TEAM,
      projectKey: inc.key.split("-")[0],
      assignee: null,
      incrementKeys: [inc.key],
      blocks: [],
      designApproved: false,
    }));
}

/**
 * Declared increment links become epic-level links wherever a stand-in is on
 * either side: the blocking increment's epics block the blocked one's. Between
 * two increments with real team epics the team-level links stay the truth.
 * Finished team epics are left out: they no longer sequence anything.
 */
function linkStandIns(increments: IncrementSummary[], epics: EpicInput[], standIns: Set<string>) {
  const epicsOf = (incKey: string) => epics.filter((e) => e.incrementKeys.includes(incKey) && !isDone(e.status));
  const known = new Set(increments.map((i) => i.key));
  for (const inc of increments) {
    for (const target of inc.blocks) {
      if (!known.has(target) || (!standIns.has(inc.key) && !standIns.has(target))) continue;
      const to = epicsOf(target).map((e) => e.key);
      for (const from of epicsOf(inc.key)) {
        for (const t of to) if (!from.blocks.includes(t)) from.blocks.push(t);
      }
    }
  }
}

interface Edge {
  from: string;
  to: string;
  kind: "item" | "epic";
}

// ── Analysis ────────────────────────────────────────────────────────────────

export function analyzeMilestone(input: AnalysisInput): AnalysisResult {
  const warnings: MilestoneWarning[] = [];
  const standInEpics = incrementStandIns(input);
  const standIns = new Set(standInEpics.map((e) => e.key));
  const epicInputs: EpicInput[] = [...input.epics.map((e) => ({ ...e, blocks: [...e.blocks] })), ...standInEpics];
  linkStandIns(input.increments, epicInputs, standIns);
  const epicByKey = new Map(epicInputs.map((e) => [e.key, e]));

  // Every team epic needs at least one schedulable node; an epic whose team
  // hasn't broken it down yet stands in for its own work.
  const itemInputs: ItemInput[] = [...input.items];
  const itemsByEpic = new Map<string, ItemInput[]>();
  for (const item of itemInputs) {
    if (item.epicKey && epicByKey.has(item.epicKey)) pushUnique(itemsByEpic, item.epicKey, item);
  }
  const placeholders = new Set<string>();
  for (const epic of epicInputs) {
    if (itemsByEpic.has(epic.key)) continue;
    const ph: ItemInput = {
      key: placeholderKey(epic.key),
      summary: epic.summary,
      type: "Epic",
      status: epic.status,
      assignee: epic.assignee,
      assigneeId: epic.assigneeId,
      epicKey: epic.key,
      team: epic.team,
      points: null,
      external: false,
      blocks: [],
    };
    placeholders.add(ph.key);
    itemInputs.push(ph);
    itemsByEpic.set(epic.key, [ph]);
  }

  const itemByKey = new Map(itemInputs.map((i) => [i.key, i]));
  const incrementOfEpic = (epicKey: string | null) =>
    epicKey ? (epicByKey.get(epicKey)?.incrementKeys[0] ?? null) : null;

  // ── Edges ────────────────────────────────────────────────────────────────

  const edgeKeys = new Set<string>();
  const edges: Edge[] = [];
  const addEdge = (from: string, to: string, kind: Edge["kind"]) => {
    if (from === to || !itemByKey.has(from) || !itemByKey.has(to)) return;
    const id = `${from}>${to}`;
    if (edgeKeys.has(id)) return;
    edgeKeys.add(id);
    edges.push({ from, to, kind });
  };

  for (const item of itemInputs) {
    for (const target of item.blocks) addEdge(item.key, target, "item");
  }

  // Item-level links between two epics are the fine-grained truth; an
  // epic-level link only adds sequencing when no item link already connects
  // the pair. It is expanded so the blocked epic's entry items wait on the
  // blocking epic's exit items.
  const itemLinkedEpicPairs = new Set<string>();
  for (const e of edges) {
    const a = itemByKey.get(e.from)?.epicKey;
    const b = itemByKey.get(e.to)?.epicKey;
    if (a && b && a !== b) itemLinkedEpicPairs.add(`${a}>${b}`);
  }
  const epicEdges: Array<{ from: string; to: string }> = [];
  for (const epic of epicInputs) {
    for (const target of epic.blocks) {
      if (!epicByKey.has(target) || target === epic.key) continue;
      epicEdges.push({ from: epic.key, to: target });
      if (itemLinkedEpicPairs.has(`${epic.key}>${target}`)) continue;
      const fromItems = itemsByEpic.get(epic.key) ?? [];
      const toItems = itemsByEpic.get(target) ?? [];
      const inEpic = (k: string, epicKey: string) => itemByKey.get(k)?.epicKey === epicKey;
      const exits = fromItems.filter((i) => !i.blocks.some((b) => inEpic(b, epic.key)));
      const entries = toItems.filter(
        (i) => !toItems.some((o) => o.blocks.includes(i.key)),
      );
      for (const a of exits) for (const b of entries) addEdge(a.key, b.key, "epic");
    }
  }

  const preds = new Map<string, string[]>();
  const succs = new Map<string, string[]>();
  for (const e of edges) {
    pushUnique(succs, e.from, e.to);
    pushUnique(preds, e.to, e.from);
  }

  // ── Scheduling over remaining work ──────────────────────────────────────
  //
  // Done items no longer constrain anything, so the schedule is computed over
  // the remaining sub-graph only. Each remaining item counts as one step:
  // the critical path length is "how many items must still happen in
  // sequence", which holds up without trusting anyone's estimates.

  const remaining = itemInputs.filter((i) => !isDone(i.status)).map((i) => i.key);
  const remainingSet = new Set(remaining);
  const rSuccs = new Map<string, string[]>();
  const rPreds = new Map<string, string[]>();
  for (const k of remaining) {
    rSuccs.set(k, (succs.get(k) ?? []).filter((s) => remainingSet.has(s)));
    rPreds.set(k, (preds.get(k) ?? []).filter((p) => remainingSet.has(p)));
  }

  let order = topoSort(remaining, rSuccs, rPreds);
  if (order.length < remaining.length) {
    // Only links inside a strongly connected component are dropped — items
    // merely downstream of a cycle keep their real sequencing.
    const component = stronglyConnected(remaining, rSuccs);
    const groups = new Map<number, string[]>();
    for (const [k, c] of component) pushUnique(groups, c, k);
    for (const members of groups.values()) {
      if (members.length < 2) continue;
      warnings.push({
        kind: "cycle",
        message: `Blocking links form a cycle between ${members.join(", ")} — the links among them are ignored for scheduling.`,
        keys: members.sort(),
      });
    }
    for (const k of remaining) {
      const c = component.get(k);
      rSuccs.set(k, (rSuccs.get(k) ?? []).filter((s) => component.get(s) !== c));
      rPreds.set(k, (rPreds.get(k) ?? []).filter((p) => component.get(p) !== c));
    }
    order = topoSort(remaining, rSuccs, rPreds);
  }

  const es = new Map<string, number>();
  for (const k of order) {
    let start = 0;
    for (const p of rPreds.get(k) ?? []) start = Math.max(start, (es.get(p) ?? 0) + 1);
    es.set(k, start);
  }
  const length = remaining.length === 0 ? 0 : Math.max(...order.map((k) => (es.get(k) ?? 0) + 1));
  const ls = new Map<string, number>();
  for (let i = order.length - 1; i >= 0; i--) {
    const k = order[i];
    let latestFinish = length;
    for (const s of rSuccs.get(k) ?? []) latestFinish = Math.min(latestFinish, ls.get(s) ?? length);
    ls.set(k, latestFinish - 1);
  }

  const downstreamOf = new Map<string, Set<string>>();
  for (let i = order.length - 1; i >= 0; i--) {
    const k = order[i];
    const set = new Set<string>();
    for (const s of rSuccs.get(k) ?? []) {
      set.add(s);
      for (const d of downstreamOf.get(s) ?? []) set.add(d);
    }
    downstreamOf.set(k, set);
  }

  const schedule = new Map<string, ItemSchedule>();
  for (const k of remaining) {
    const item = itemByKey.get(k);
    if (!item) continue;
    const start = es.get(k) ?? 0;
    const latestStart = ls.get(k) ?? start;
    const downstream = downstreamOf.get(k) ?? new Set<string>();
    const downstreamTeams = new Set<string>();
    for (const d of downstream) {
      const t = itemByKey.get(d)?.team;
      if (t && t !== item.team) downstreamTeams.add(t);
    }
    const blockers = preds.get(k) ?? [];
    schedule.set(k, {
      earliestStart: start,
      earliestFinish: start + 1,
      latestStart,
      slack: latestStart - start,
      critical: latestStart === start,
      ready: blockers.every((b) => {
        const blocker = itemByKey.get(b);
        return !blocker || isDone(blocker.status);
      }),
      downstream: downstream.size,
      downstreamTeams: [...downstreamTeams].sort(),
    });
  }

  // One representative chain: start from a critical root, keep stepping to a
  // critical successor exactly one level later — preferring the one that
  // unblocks the most.
  const pathKeys: string[] = [];
  const byImpact = (a: string, b: string) =>
    (schedule.get(b)?.downstream ?? 0) - (schedule.get(a)?.downstream ?? 0) || a.localeCompare(b);
  const roots = remaining
    .filter((k) => schedule.get(k)?.critical && schedule.get(k)?.earliestStart === 0)
    .sort(byImpact);
  let cursor: string | undefined = roots[0];
  while (cursor) {
    pathKeys.push(cursor);
    const level: number = schedule.get(cursor)?.earliestStart ?? 0;
    cursor = (rSuccs.get(cursor) ?? [])
      .filter((s) => schedule.get(s)?.critical && schedule.get(s)?.earliestStart === level + 1)
      .sort(byImpact)[0];
  }

  // ── Items & dependencies ────────────────────────────────────────────────

  const items: WorkItem[] = itemInputs.map((i) => ({
    key: i.key,
    summary: i.summary,
    type: i.type,
    status: i.status,
    assignee: i.assignee,
    assigneeId: i.assigneeId,
    epicKey: i.epicKey,
    team: i.team,
    incrementKey: i.external ? null : incrementOfEpic(i.epicKey),
    points: i.points,
    external: i.external,
    outsideDecision: !!i.outsideDecision,
    dueDate: i.dueDate ?? null,
    placeholder: placeholders.has(i.key),
    standIn: standIns.has(i.key),
    blockedBy: preds.get(i.key) ?? [],
    blocks: succs.get(i.key) ?? [],
    schedule: schedule.get(i.key) ?? null,
  }));

  const isCriticalEdge = (from: string, to: string) => {
    const a = schedule.get(from);
    const b = schedule.get(to);
    return !!a?.critical && !!b?.critical && b.earliestStart === a.earliestFinish;
  };
  const dependencies: Dependency[] = edges.map((e) => {
    const a = itemByKey.get(e.from);
    const b = itemByKey.get(e.to);
    return {
      from: e.from,
      to: e.to,
      kind: e.kind,
      crossTeam: !!a && !!b && a.team !== b.team,
      crossEpic: !!a && !!b && a.epicKey !== b.epicKey,
      satisfied: !!a && isDone(a.status),
      critical: isCriticalEdge(e.from, e.to),
    };
  });

  // ── Epic rollups ────────────────────────────────────────────────────────

  const blocksEpics = new Map<string, string[]>();
  const blockedByEpics = new Map<string, string[]>();
  for (const e of edges) {
    const a = itemByKey.get(e.from);
    const b = itemByKey.get(e.to);
    if (!a?.epicKey || !b?.epicKey || a.epicKey === b.epicKey) continue;
    if (isDone(a.status) || isDone(b.status)) continue;
    pushUnique(blocksEpics, a.epicKey, b.epicKey);
    pushUnique(blockedByEpics, b.epicKey, a.epicKey);
  }

  const epics: TeamEpic[] = epicInputs.map((epic) => {
    const own = itemsByEpic.get(epic.key) ?? [];
    const sched = own.map((i) => schedule.get(i.key)).filter((s): s is ItemSchedule => !!s);
    const criticalItems = sched.filter((s) => s.critical).length;
    return {
      key: epic.key,
      summary: epic.summary,
      status: epic.status,
      team: epic.team,
      projectKey: epic.projectKey,
      assignee: epic.assignee,
      assigneeId: epic.assigneeId,
      incrementKeys: epic.incrementKeys,
      itemKeys: own.filter((i) => !placeholders.has(i.key)).map((i) => i.key),
      progress: progressOf(own.filter((i) => !placeholders.has(i.key)).map((i) => i.status)),
      blocksEpics: blocksEpics.get(epic.key) ?? [],
      blockedByEpics: blockedByEpics.get(epic.key) ?? [],
      earliestStart: sched.length ? Math.min(...sched.map((s) => s.earliestStart)) : null,
      earliestFinish: sched.length ? Math.max(...sched.map((s) => s.earliestFinish)) : null,
      criticalItems,
      onCriticalPath: criticalItems > 0,
      standIn: standIns.has(epic.key),
      designApproved: epic.designApproved,
    };
  });
  const teamEpicByKey = new Map(epics.map((e) => [e.key, e]));

  // ── Blocker epics: remaining work that gates other epics ────────────────

  const blockerEpics: BlockerEpic[] = [];
  for (const epic of epics) {
    const blocked = epic.blocksEpics;
    if (blocked.length === 0) continue;
    const own = (itemsByEpic.get(epic.key) ?? []).filter((i) => remainingSet.has(i.key));
    const downstream = new Set<string>();
    const gating: Array<{ key: string; impact: number }> = [];
    for (const item of own) {
      const outside = [...(downstreamOf.get(item.key) ?? [])].filter(
        (d) => itemByKey.get(d)?.epicKey !== epic.key,
      );
      for (const d of outside) downstream.add(d);
      const directOutside = (rSuccs.get(item.key) ?? []).some(
        (s) => itemByKey.get(s)?.epicKey !== epic.key,
      );
      if (directOutside) gating.push({ key: item.key, impact: outside.length });
    }
    const blockedTeams = new Set(
      blocked.map((k) => teamEpicByKey.get(k)?.team).filter((t): t is string => !!t && t !== epic.team),
    );
    blockerEpics.push({
      epicKey: epic.key,
      team: epic.team,
      remaining: own.length,
      blockedEpics: blocked,
      blockedTeams: [...blockedTeams].sort(),
      downstreamItems: downstream.size,
      onCriticalPath: epic.onCriticalPath,
      gatingItems: gating.sort((a, b) => b.impact - a.impact).map((g) => g.key),
    });
  }
  blockerEpics.sort(
    (a, b) =>
      Number(b.onCriticalPath) - Number(a.onCriticalPath) ||
      b.blockedTeams.length - a.blockedTeams.length ||
      b.downstreamItems - a.downstreamItems,
  );

  // ── Team rollups ────────────────────────────────────────────────────────

  const teamNames = [...new Set(itemInputs.filter((i) => !i.external).map((i) => i.team))].sort();
  const teams: TeamSummary[] = teamNames.map((name) => {
    const own = itemInputs.filter((i) => !i.external && i.team === name);
    const rem = own.filter((i) => remainingSet.has(i.key));
    const loadByLevel = new Array<number>(length).fill(0);
    const criticalByLevel = new Array<number>(length).fill(0);
    let waiting = 0;
    let blocking = 0;
    for (const i of rem) {
      const s = schedule.get(i.key);
      if (!s) continue;
      loadByLevel[s.earliestStart]++;
      if (s.critical) criticalByLevel[s.earliestStart]++;
      if ((rPreds.get(i.key) ?? []).some((p) => itemByKey.get(p)?.team !== name)) waiting++;
    }
    for (const i of itemInputs) {
      if (i.team === name || !remainingSet.has(i.key)) continue;
      if ((rPreds.get(i.key) ?? []).some((p) => itemByKey.get(p)?.team === name)) blocking++;
    }
    return {
      name,
      epicKeys: epicInputs.filter((e) => e.team === name).map((e) => e.key),
      progress: progressOf(own.filter((i) => !placeholders.has(i.key)).map((i) => i.status)),
      remaining: rem.length,
      criticalItems: rem.filter((i) => schedule.get(i.key)?.critical).length,
      readyNow: rem.filter((i) => !i.outsideDecision && schedule.get(i.key)?.ready).length,
      unassignedRemaining: rem.filter((i) => !i.assignee).length,
      waitingOnOtherTeams: waiting,
      blockingOtherTeams: blocking,
      loadByLevel,
      criticalByLevel,
    };
  });

  // ── Increment rollups + declared vs. derived sequencing ─────────────────

  const derivedBlocks = new Map<string, string[]>();
  const derivedBlockedBy = new Map<string, string[]>();
  // Only links where both ends are still open count as evidence for an
  // undeclared dependency: a finished or cancelled item holds nothing up. All
  // links still back a declared one, since finished work did satisfy it.
  const evidence = new Map<string, string[]>();
  for (const e of edges) {
    const a = itemByKey.get(e.from);
    const b = itemByKey.get(e.to);
    if (!a || !b || a.external || b.external) continue;
    const ia = incrementOfEpic(a.epicKey);
    const ib = incrementOfEpic(b.epicKey);
    if (!ia || !ib || ia === ib) continue;
    pushUnique(derivedBlocks, ia, ib);
    pushUnique(derivedBlockedBy, ib, ia);
    if (!isDone(a.status) && !isDone(b.status)) pushUnique(evidence, `${ia}>${ib}`, `${e.from}→${e.to}`);
  }

  const increments: Increment[] = input.increments.map((inc) => {
    const epicKeys = epicInputs.filter((e) => e.incrementKeys.includes(inc.key)).map((e) => e.key);
    const own = epicKeys.flatMap((k) => (itemsByEpic.get(k) ?? []).filter((i) => !placeholders.has(i.key)));
    const sched = epicKeys
      .flatMap((k) => itemsByEpic.get(k) ?? [])
      .map((i) => schedule.get(i.key))
      .filter((s): s is ItemSchedule => !!s);
    return {
      ...inc,
      progress: progressOf(own.map((i) => i.status)),
      derivedBlocks: derivedBlocks.get(inc.key) ?? [],
      derivedBlockedBy: derivedBlockedBy.get(inc.key) ?? [],
      criticalItems: sched.filter((s) => s.critical).length,
      earliestFinish: sched.length ? Math.max(...sched.map((s) => s.earliestFinish)) : null,
    };
  });

  for (const inc of increments) {
    if (standIns.has(inc.key)) {
      const owner = inc.team ? `for ${inc.team}` : "with no team planned";
      warnings.push({
        kind: "no-team-epics",
        message: `${inc.key} has no open team epics yet, so it is scheduled as one step ${owner}.`,
        keys: [inc.key],
      });
    }
    for (const target of inc.derivedBlocks) {
      const open = evidence.get(`${inc.key}>${target}`);
      if (inc.blocks.includes(target) || !open) continue;
      warnings.push({
        kind: "undeclared-dependency",
        message: `Team work makes ${inc.key} block ${target}, but the increments don't declare it.`,
        keys: [inc.key, target, ...open.flatMap((e) => e.split("→"))],
      });
    }
    for (const target of inc.blocks) {
      if (inc.derivedBlocks.includes(target) || !increments.some((i) => i.key === target)) continue;
      warnings.push({
        kind: "unbacked-dependency",
        message: `${inc.key} is declared to block ${target}, but no team-level link backs it.`,
        keys: [inc.key, target],
      });
    }
  }

  const externalBlockers = items.filter(
    (i) => i.external && !isDone(i.status) && i.blocks.some((k) => remainingSet.has(k)),
  );
  for (const ext of externalBlockers) {
    warnings.push({
      kind: "external-blocker",
      message: `${ext.key} (${ext.team}) is outside this milestone but blocks ${ext.blocks.join(", ")}.`,
      keys: [ext.key, ...ext.blocks],
    });
  }

  const unassignedCritical = items.filter(
    (i) => !i.external && !i.placeholder && i.schedule?.critical && !i.assignee,
  );
  if (unassignedCritical.length > 0) {
    warnings.push({
      kind: "unassigned-critical",
      message: `${unassignedCritical.length} critical-path items have no assignee.`,
      keys: unassignedCritical.map((i) => i.key),
    });
  }

  // Building on the critical path without a signed-off decision log is where
  // a design mistake costs the milestone date.
  const unapproved = epics.filter(
    (e) => !e.standIn && e.onCriticalPath && e.status.category === "indeterminate" && !e.designApproved,
  );
  if (unapproved.length > 0) {
    warnings.push({
      kind: "unapproved-design",
      message: `${unapproved.length} critical-path team epics are in progress without an approved decision log (label ${DESIGN_APPROVED_LABEL}).`,
      keys: unapproved.map((e) => e.key),
    });
  }

  // Outside decisions aren't the team's to start; they're listed on their own,
  // and one nobody chases is a warning when it gates work or is due soon.
  const outsideDecisions = items
    .filter((i) => i.outsideDecision && !isDone(i.status))
    .sort((a, b) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999") || a.key.localeCompare(b.key));
  const today = input.today ?? new Date().toISOString().slice(0, 10);
  const horizon = new Date(`${today}T00:00:00Z`);
  horizon.setUTCDate(horizon.getUTCDate() + OUTSIDE_DECISION_HORIZON_DAYS);
  const horizonDate = horizon.toISOString().slice(0, 10);
  const unowned = outsideDecisions.filter(
    (i) => !i.assignee && (i.blocks.some((k) => remainingSet.has(k)) || (i.dueDate !== null && i.dueDate <= horizonDate)),
  );
  if (unowned.length > 0) {
    warnings.push({
      kind: "unowned-outside-decision",
      message: `${unowned.length} decisions owned outside the program gate work or are due within ${OUTSIDE_DECISION_HORIZON_DAYS} days, and nobody is chasing them.`,
      keys: unowned.map((i) => i.key),
    });
  }

  const readyNow = items
    .filter((i) => !i.external && !i.outsideDecision && i.schedule?.ready)
    .sort(
      (a, b) =>
        Number(b.schedule?.critical) - Number(a.schedule?.critical) ||
        (b.schedule?.downstream ?? 0) - (a.schedule?.downstream ?? 0) ||
        a.key.localeCompare(b.key),
    )
    .map((i) => i.key);

  return {
    increments,
    epics,
    items,
    dependencies,
    teams,
    criticalPath: {
      keys: pathKeys,
      criticalKeys: remaining.filter((k) => schedule.get(k)?.critical),
      length,
    },
    blockerEpics,
    readyNow,
    outsideDecisions: outsideDecisions.map((i) => i.key),
    progress: progressOf(
      itemInputs.filter((i) => !i.external && !placeholders.has(i.key)).map((i) => i.status),
    ),
    warnings,
  };
}

// ── Graph utilities ─────────────────────────────────────────────────────────

/** Kahn's algorithm; nodes left out of the result sit on a cycle. */
function topoSort(
  nodes: string[],
  succs: Map<string, string[]>,
  preds: Map<string, string[]>,
): string[] {
  const indegree = new Map(nodes.map((k) => [k, (preds.get(k) ?? []).length]));
  const queue = nodes.filter((k) => indegree.get(k) === 0).sort();
  const order: string[] = [];
  for (let head = 0; head < queue.length; head++) {
    const k = queue[head];
    order.push(k);
    for (const s of succs.get(k) ?? []) {
      const d = (indegree.get(s) ?? 0) - 1;
      indegree.set(s, d);
      if (d === 0) queue.push(s);
    }
  }
  return order;
}

/** Tarjan's algorithm — maps each node to its strongly connected component id. */
function stronglyConnected(nodes: string[], succs: Map<string, string[]>): Map<string, number> {
  const index = new Map<string, number>();
  const low = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const component = new Map<string, number>();
  let counter = 0;
  let components = 0;

  const visit = (v: string) => {
    index.set(v, counter);
    low.set(v, counter);
    counter++;
    stack.push(v);
    onStack.add(v);
    for (const w of succs.get(v) ?? []) {
      if (!index.has(w)) {
        visit(w);
        low.set(v, Math.min(low.get(v) ?? 0, low.get(w) ?? 0));
      } else if (onStack.has(w)) {
        low.set(v, Math.min(low.get(v) ?? 0, index.get(w) ?? 0));
      }
    }
    if (low.get(v) === index.get(v)) {
      let w: string | undefined;
      do {
        w = stack.pop();
        if (w === undefined) break;
        onStack.delete(w);
        component.set(w, components);
      } while (w !== v);
      components++;
    }
  };

  for (const v of nodes) if (!index.has(v)) visit(v);
  return component;
}
