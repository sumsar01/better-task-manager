import type { LaidOutCard, LaneMode, LaidOutEdge } from "@/lib/milestoneLayout";
import { CARD_HEIGHT, CARD_WIDTH } from "@/lib/milestoneLayout";
import type { Dependency, MilestoneDetail, WorkItem } from "@/lib/milestoneTypes";

// ── Pure view logic for the milestone page ──────────────────────────────────
//
// URL state, filtering, keyboard navigation and viewport culling — kept out
// of the components so they can be tested and so renders stay cheap.

// ── URL state ───────────────────────────────────────────────────────────────

export const MILESTONE_TABS = ["path", "blockers", "teams", "increments", "ready", "lanes"] as const;

export type MilestoneTab = (typeof MILESTONE_TABS)[number];

export interface MilestoneViewState {
  tab: MilestoneTab;
  lanes: LaneMode;
  /** Timeline shows finished items too. */
  showDone: boolean;
  /** Timeline shows blockers and dependants pulled in from outside the milestone. */
  showOutside: boolean;
  /** Selected issue key (item, epic or increment). */
  item: string | null;
  query: string;
}

/** Lanes by team, like the mac app: a program reads team by team first. */
export const DEFAULT_VIEW: MilestoneViewState = { tab: "path", lanes: "team", showDone: false, showOutside: true, item: null, query: "" };

/** View options that carry over between milestones (and visits); selection and filter don't. */
export type ViewPrefs = Pick<MilestoneViewState, "tab" | "lanes" | "showDone" | "showOutside">;

const ISSUE_KEY = /^[A-Z][A-Z0-9_]*-\d+$/;

const isTab = (v: unknown): v is MilestoneTab => typeof v === "string" && (MILESTONE_TABS as readonly string[]).includes(v);

/**
 * URL first (a shared link must open exactly as sent), then the viewer's
 * saved options, then defaults. `?tab=insights` predates the split tabs.
 */
export function parseViewState(params: URLSearchParams, saved: Partial<ViewPrefs> = {}): MilestoneViewState {
  const tab = params.get("tab");
  const lanes = params.get("lanes");
  const done = params.get("done");
  const outside = params.get("outside");
  const item = params.get("item")?.toUpperCase() ?? null;
  const flag = (v: string | null, fallback: boolean) => (v === "1" ? true : v === "0" ? false : fallback);
  return {
    tab: tab === "insights" ? "blockers" : isTab(tab) ? tab : isTab(saved.tab) ? saved.tab : DEFAULT_VIEW.tab,
    lanes: lanes === "team" || lanes === "epic" ? lanes : saved.lanes === "epic" || saved.lanes === "team" ? saved.lanes : DEFAULT_VIEW.lanes,
    showDone: flag(done, typeof saved.showDone === "boolean" ? saved.showDone : DEFAULT_VIEW.showDone),
    showOutside: flag(outside, typeof saved.showOutside === "boolean" ? saved.showOutside : DEFAULT_VIEW.showOutside),
    item: item && ISSUE_KEY.test(item) ? item : null,
    query: (params.get("q") ?? "").slice(0, 100),
  };
}

/**
 * Writes the view state into `params`, leaving unrelated params (e.g.
 * `fixture`) alone and omitting defaults so shared links stay short.
 * `only` limits which parts are written — a team page has no tabs or lanes.
 */
export function serializeViewState(
  state: MilestoneViewState,
  params = new URLSearchParams(),
  only?: ReadonlyArray<keyof MilestoneViewState>,
): URLSearchParams {
  const next = new URLSearchParams(params);
  const put = (part: keyof MilestoneViewState, key: string, value: string, fallback: string) => {
    if (only && !only.includes(part)) return;
    if (value && value !== fallback) next.set(key, value);
    else next.delete(key);
  };
  const bit = (b: boolean) => (b ? "1" : "0");
  put("tab", "tab", state.tab, DEFAULT_VIEW.tab);
  put("lanes", "lanes", state.lanes, DEFAULT_VIEW.lanes);
  put("showDone", "done", bit(state.showDone), bit(DEFAULT_VIEW.showDone));
  put("showOutside", "outside", bit(state.showOutside), bit(DEFAULT_VIEW.showOutside));
  put("item", "item", state.item ?? "", "");
  put("query", "q", state.query.trim(), "");
  return next;
}

export function viewPrefs(state: MilestoneViewState): ViewPrefs {
  return { tab: state.tab, lanes: state.lanes, showDone: state.showDone, showOutside: state.showOutside };
}

/** Saved prefs are user-editable storage: anything malformed is dropped, not trusted. */
export function readViewPrefs(raw: string | null): Partial<ViewPrefs> {
  if (!raw) return {};
  try {
    const v = JSON.parse(raw) as Record<string, unknown>;
    if (!v || typeof v !== "object") return {};
    const out: Partial<ViewPrefs> = {};
    if (isTab(v.tab)) out.tab = v.tab;
    if (v.lanes === "team" || v.lanes === "epic") out.lanes = v.lanes;
    if (typeof v.showDone === "boolean") out.showDone = v.showDone;
    if (typeof v.showOutside === "boolean") out.showOutside = v.showOutside;
    return out;
  } catch {
    return {};
  }
}

// ── Filtering ───────────────────────────────────────────────────────────────

/** Quick filters, written into the query as `is:<name>` so they share links like text. */
export const QUICK_FILTERS = {
  critical: { label: "Critical", test: (i: WorkItem) => !!i.schedule?.critical },
  ready: { label: "Ready", test: (i: WorkItem) => !!i.schedule?.ready },
  unassigned: { label: "Unassigned", test: (i: WorkItem) => !!i.schedule && !i.assignee },
  cross: { label: "Blocks other teams", test: (i: WorkItem) => (i.schedule?.downstreamTeams.length ?? 0) > 0 },
  outside: { label: "Outside", test: (i: WorkItem) => i.external },
} as const;

export type QuickFilter = keyof typeof QUICK_FILTERS;

const isQuickFilter = (name: string): name is QuickFilter => Object.hasOwn(QUICK_FILTERS, name);

/** A team name as a query token value: `team:<token>` (lower-case, spaces as dashes). */
export function teamToken(team: string): string {
  return team.trim().toLowerCase().replace(/\s+/g, "-");
}

/** Whether `is:<name>` is part of the query. */
export function hasQuickFilter(query: string, name: QuickFilter): boolean {
  return query.toLowerCase().split(/\s+/).includes(`is:${name}`);
}

/** Adds or removes `is:<name>`, leaving the free text alone. */
export function toggleQuickFilter(query: string, name: QuickFilter): string {
  const token = `is:${name}`;
  const terms = query.split(/\s+/).filter(Boolean);
  const next = hasQuickFilter(query, name) ? terms.filter((t) => t.toLowerCase() !== token) : [...terms, token];
  return next.join(" ");
}

/**
 * Items matching a query: free text over key, summary, assignee, team and
 * epic, plus `is:` quick filters. Every term must match. `null` = no filter.
 */
export function matchItems(detail: MilestoneDetail, query: string): Set<string> | null {
  const all = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (all.length === 0) return null;
  const isQuick = (t: string) => t.startsWith("is:") && isQuickFilter(t.slice(3));
  const isTeam = (t: string) => t.startsWith("team:") && t.length > 5;
  const predicates: Array<(i: WorkItem) => boolean> = [
    ...all.filter(isQuick).map((t) => QUICK_FILTERS[t.slice(3) as QuickFilter].test),
    ...all.filter(isTeam).map((t) => (i: WorkItem) => teamToken(i.team) === t.slice(5)),
  ];
  const terms = all.filter((t) => !isQuick(t) && !isTeam(t));
  const epicSummary = new Map(detail.epics.map((e) => [e.key, e.summary]));
  const out = new Set<string>();
  for (const item of detail.items) {
    if (!predicates.every((p) => p(item))) continue;
    const haystack = [
      item.key,
      item.summary,
      item.assignee ?? "unassigned",
      item.team,
      item.epicKey ?? "",
      item.epicKey ? (epicSummary.get(item.epicKey) ?? "") : "",
    ]
      .join(" ")
      .toLowerCase();
    if (terms.every((t) => haystack.includes(t))) out.add(item.key);
  }
  return out;
}

// ── Dependency chains ───────────────────────────────────────────────────────

export interface DependencyChain {
  focus: string;
  upstream: Set<string>;
  downstream: Set<string>;
  /** The focus plus everything up- and downstream of it. */
  members: Set<string>;
}

/**
 * Adjacency over unsatisfied links (or all links, when done work is on show),
 * built once per payload.
 */
export function chainIndex(dependencies: Dependency[], includeSatisfied = false): (key: string) => DependencyChain {
  const up = new Map<string, string[]>();
  const down = new Map<string, string[]>();
  for (const d of dependencies) {
    if ((d.satisfied && !includeSatisfied) || d.from === d.to) continue;
    (down.get(d.from) ?? down.set(d.from, []).get(d.from))?.push(d.to);
    (up.get(d.to) ?? up.set(d.to, []).get(d.to))?.push(d.from);
  }
  const closure = (key: string, graph: Map<string, string[]>) => {
    const seen = new Set<string>();
    const stack = [...(graph.get(key) ?? [])];
    while (stack.length) {
      const k = stack.pop() as string;
      // Cycles are reported as warnings but their links still arrive.
      if (k === key || seen.has(k)) continue;
      seen.add(k);
      stack.push(...(graph.get(k) ?? []));
    }
    return seen;
  };
  const memo = new Map<string, DependencyChain>();
  return (key) => {
    const hit = memo.get(key);
    if (hit) return hit;
    const upstream = closure(key, up);
    const downstream = closure(key, down);
    const chain = { focus: key, upstream, downstream, members: new Set([key, ...upstream, ...downstream]) };
    memo.set(key, chain);
    return chain;
  };
}

/**
 * An edge belongs to the chain only when it runs along the focus's side of the
 * graph — an upstream item that also links straight to a downstream one
 * bypasses the focus, so that shortcut isn't part of its path even though both
 * ends are.
 */
export function chainHasEdge(chain: DependencyChain, from: string, to: string): boolean {
  const before = (k: string) => k === chain.focus || chain.upstream.has(k);
  const after = (k: string) => k === chain.focus || chain.downstream.has(k);
  return (before(from) && before(to)) || (after(from) && after(to));
}

// ── Keyboard navigation ─────────────────────────────────────────────────────

export type Direction = "left" | "right" | "up" | "down";

/**
 * The card to move to from `fromKey`. Left/right step to the nearest column
 * that has cards, preferring the vertically closest one; up/down move to the
 * nearest card above/below in the same column.
 */
export function neighbor(cards: LaidOutCard[], fromKey: string | null, dir: Direction): string | null {
  if (cards.length === 0) return null;
  const from = fromKey ? cards.find((c) => c.item.key === fromKey) : undefined;
  if (!from) {
    // Nothing selected yet: start where the milestone is decided — the first
    // critical card — else the top-left card.
    const ordered = [...cards].sort((a, b) => a.x - b.x || a.y - b.y);
    return (ordered.find((c) => c.item.schedule?.critical) ?? ordered[0])?.item.key ?? null;
  }
  let best: LaidOutCard | null = null;
  let bestScore = Infinity;
  for (const c of cards) {
    if (c === from) continue;
    const dx = c.x - from.x;
    const dy = c.y - from.y;
    let score: number;
    if (dir === "right" || dir === "left") {
      if (dir === "right" ? dx <= 0 : dx >= 0) continue;
      // Nearest column first, then nearest row within it.
      score = Math.abs(dx) * 1000 + Math.abs(dy);
    } else {
      if (dx !== 0 || (dir === "down" ? dy <= 0 : dy >= 0)) continue;
      score = Math.abs(dy);
    }
    if (score < bestScore) {
      bestScore = score;
      best = c;
    }
  }
  return best?.item.key ?? null;
}

// ── Viewport culling ────────────────────────────────────────────────────────

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * The visible region in layout coordinates, padded by `overscan` and snapped
 * outward to a `tile` grid — scrolling within a tile yields the identical
 * rect, so the timeline only re-renders when new tiles come into view.
 */
export function cullWindow(
  scroll: { left: number; top: number; width: number; height: number },
  zoom: number,
  overscan = 400,
  tile = 512,
): Rect {
  const x0 = Math.max(0, scroll.left / zoom - overscan);
  const y0 = Math.max(0, scroll.top / zoom - overscan);
  const x1 = (scroll.left + scroll.width) / zoom + overscan;
  const y1 = (scroll.top + scroll.height) / zoom + overscan;
  const sx = Math.floor(x0 / tile) * tile;
  const sy = Math.floor(y0 / tile) * tile;
  return { x: sx, y: sy, width: Math.ceil(x1 / tile) * tile - sx, height: Math.ceil(y1 / tile) * tile - sy };
}

const intersects = (r: Rect, x: number, y: number, w: number, h: number) =>
  x < r.x + r.width && x + w > r.x && y < r.y + r.height && y + h > r.y;

export function visibleCards(cards: LaidOutCard[], rect: Rect | null): LaidOutCard[] {
  if (!rect) return cards;
  return cards.filter((c) => intersects(rect, c.x, c.y, CARD_WIDTH, CARD_HEIGHT));
}

/** Edges whose bounding box touches the window — an edge can cross it with both ends outside. */
export function visibleEdges(edges: LaidOutEdge[], rect: Rect | null): LaidOutEdge[] {
  if (!rect) return edges;
  return edges.filter((e) => {
    const x = Math.min(e.x1, e.x2);
    const y = Math.min(e.y1, e.y2);
    return intersects(rect, x, y, Math.abs(e.x2 - e.x1) + 1, Math.abs(e.y2 - e.y1) + 1);
  });
}

// ── Cross-team dependency matrix ────────────────────────────────────────────

export interface TeamMatrix {
  /** Teams in display order: most blocking first. */
  teams: string[];
  /** counts[blocker][blocked] = open cross-team links from blocker's work to blocked's. */
  counts: Record<string, Record<string, number>>;
  max: number;
}

/**
 * Open (unsatisfied) cross-team "blocks" links, aggregated team × team —
 * who is waiting on whom. Null when there are none.
 */
export function teamMatrix(detail: MilestoneDetail): TeamMatrix | null {
  const teamOf = new Map(detail.items.map((i) => [i.key, i.team]));
  for (const e of detail.epics) teamOf.set(e.key, e.team);
  const counts: Record<string, Record<string, number>> = {};
  const outgoing = new Map<string, number>();
  const involved = new Set<string>();
  let max = 0;
  for (const d of detail.dependencies) {
    if (d.satisfied || !d.crossTeam) continue;
    const from = teamOf.get(d.from);
    const to = teamOf.get(d.to);
    if (!from || !to || from === to) continue;
    const row = (counts[from] ??= {});
    row[to] = (row[to] ?? 0) + 1;
    max = Math.max(max, row[to]);
    outgoing.set(from, (outgoing.get(from) ?? 0) + 1);
    involved.add(from).add(to);
  }
  if (involved.size === 0) return null;
  const teams = [...involved].sort((a, b) => (outgoing.get(b) ?? 0) - (outgoing.get(a) ?? 0) || a.localeCompare(b));
  return { teams, counts, max };
}

// ── Payload equality ────────────────────────────────────────────────────────

/** Same content ignoring `generatedAt` — a poll that changed nothing shouldn't re-render. */
export function samePayload(a: unknown, b: unknown): boolean {
  const strip = (v: unknown) =>
    JSON.stringify(v, (key, value: unknown) => (key === "generatedAt" ? undefined : value));
  return strip(a) === strip(b);
}

export function itemByKey(detail: MilestoneDetail): Map<string, WorkItem> {
  return new Map(detail.items.map((i) => [i.key, i]));
}
