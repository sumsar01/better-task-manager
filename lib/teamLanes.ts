import type { MilestoneDetail, TeamEpic } from "@/lib/milestoneTypes";

// ── Team lanes: epic sequencing per team ────────────────────────────────────
//
// One lane per team, its epics placed in waves: an epic sits one wave after
// the latest epic whose remaining work it waits on. Epics that wait on each
// other (a cycle, common between epics even when the items don't loop) share
// a wave. Finished epics are kept apart in their own column.

export interface EpicLink {
  from: string;
  to: string;
  crossTeam: boolean;
  /** The two epics wait on each other through other links too. */
  mutual: boolean;
}

export interface TeamLane {
  team: string;
  /** waves[n] = the team's open epics in wave n, critical first. */
  waves: TeamEpic[][];
  done: TeamEpic[];
}

export interface TeamLanes {
  lanes: TeamLane[];
  waveCount: number;
  links: EpicLink[];
  /** Epic key → its wave; finished epics are absent. */
  waveOf: Map<string, number>;
}

const isDone = (e: TeamEpic) => e.status.category === "done";

const byKey = (a: TeamEpic, b: TeamEpic) =>
  Number(b.onCriticalPath) - Number(a.onCriticalPath) || a.key.localeCompare(b.key, undefined, { numeric: true });

/** Strongly connected components (Tarjan), so cycles collapse to one node. */
function components(nodes: string[], next: Map<string, string[]>): Map<string, number> {
  const index = new Map<string, number>();
  const low = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const comp = new Map<string, number>();
  let counter = 0;
  let compCount = 0;
  const visit = (v: string) => {
    index.set(v, counter);
    low.set(v, counter);
    counter++;
    stack.push(v);
    onStack.add(v);
    for (const w of next.get(v) ?? []) {
      if (!index.has(w)) {
        visit(w);
        low.set(v, Math.min(low.get(v) as number, low.get(w) as number));
      } else if (onStack.has(w)) {
        low.set(v, Math.min(low.get(v) as number, index.get(w) as number));
      }
    }
    if (low.get(v) === index.get(v)) {
      let w: string | undefined;
      do {
        w = stack.pop() as string;
        onStack.delete(w);
        comp.set(w, compCount);
      } while (w !== v);
      compCount++;
    }
  };
  for (const v of nodes) if (!index.has(v)) visit(v);
  return comp;
}

/**
 * Epic-to-epic links over open work: the rollup of item "blocks" links, plus
 * epic-level "blocks" links whose ends resolve to epics in the milestone.
 */
export function epicLinks(detail: MilestoneDetail): Array<{ from: string; to: string }> {
  const open = new Map(detail.epics.filter((e) => !isDone(e)).map((e) => [e.key, e]));
  const epicOfItem = new Map(detail.items.map((i) => [i.key, i.epicKey]));
  const seen = new Set<string>();
  const out: Array<{ from: string; to: string }> = [];
  const add = (from: string | null | undefined, to: string | null | undefined) => {
    if (!from || !to || from === to || !open.has(from) || !open.has(to)) return;
    const id = `${from}>${to}`;
    if (seen.has(id)) return;
    seen.add(id);
    out.push({ from, to });
  };
  for (const e of open.values()) for (const to of e.blocksEpics) add(e.key, to);
  for (const d of detail.dependencies) {
    if (d.kind !== "epic" || d.satisfied) continue;
    const from = open.has(d.from) ? d.from : epicOfItem.get(d.from);
    const to = open.has(d.to) ? d.to : epicOfItem.get(d.to);
    add(from, to);
  }
  return out;
}

export function teamLanes(detail: MilestoneDetail): TeamLanes {
  const open = detail.epics.filter((e) => !isDone(e));
  const raw = epicLinks(detail);
  const next = new Map<string, string[]>();
  for (const l of raw) (next.get(l.from) ?? next.set(l.from, []).get(l.from))?.push(l.to);

  const keys = open.map((e) => e.key);
  const comp = components(keys, next);

  // Longest path over the condensed graph: a component starts one wave after
  // its latest predecessor. Tarjan numbers components in reverse topological
  // order, so walking them from the highest number visits predecessors first.
  const compNext = new Map<number, Set<number>>();
  for (const l of raw) {
    const a = comp.get(l.from) as number;
    const b = comp.get(l.to) as number;
    if (a !== b) (compNext.get(a) ?? compNext.set(a, new Set()).get(a))?.add(b);
  }
  const compWave = new Map<number, number>();
  const compIds = [...new Set(comp.values())].sort((a, b) => b - a);
  for (const c of compIds) {
    const w = compWave.get(c) ?? 0;
    compWave.set(c, w);
    for (const d of compNext.get(c) ?? []) compWave.set(d, Math.max(compWave.get(d) ?? 0, w + 1));
  }
  const waveOf = new Map(keys.map((k) => [k, compWave.get(comp.get(k) as number) ?? 0]));
  const waveCount = open.length ? Math.max(...waveOf.values()) + 1 : 0;

  const teamOf = new Map(detail.epics.map((e) => [e.key, e.team]));
  const links: EpicLink[] = raw.map((l) => ({
    ...l,
    crossTeam: teamOf.get(l.from) !== teamOf.get(l.to),
    mutual: comp.get(l.from) === comp.get(l.to),
  }));

  const byTeam = new Map<string, TeamLane>();
  for (const e of detail.epics) {
    const lane = byTeam.get(e.team) ?? byTeam.set(e.team, { team: e.team, waves: Array.from({ length: waveCount }, () => []), done: [] }).get(e.team);
    if (!lane) continue;
    if (isDone(e)) lane.done.push(e);
    else lane.waves[waveOf.get(e.key) ?? 0].push(e);
  }
  for (const lane of byTeam.values()) {
    lane.waves.forEach((w) => w.sort(byKey));
    lane.done.sort(byKey);
  }

  // Teams whose work starts first read first; finished-only teams go last.
  const firstWave = (l: TeamLane) => {
    const i = l.waves.findIndex((w) => w.length > 0);
    return i === -1 ? Infinity : i;
  };
  const lanes = [...byTeam.values()].sort((a, b) => firstWave(a) - firstWave(b) || a.team.localeCompare(b.team));
  return { lanes, waveCount, links, waveOf };
}
