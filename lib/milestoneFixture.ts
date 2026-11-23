import { analyzeMilestone, progressOf } from "@/lib/milestoneAnalysis";
import type { EpicInput, ItemInput } from "@/lib/milestoneAnalysis";
import type {
  IncrementSummary,
  MilestoneDetail,
  ProgramOverview,
  ProgramRelease,
  Release,
  StatusCategory,
  StatusRef,
} from "@/lib/milestoneTypes";

// ── Synthetic multi-team milestone (dev only) ───────────────────────────────
//
// The real delivery space has one team so far; designing for the program it
// will become needs 4–6 teams and a few hundred items. Built through the real
// analysis code so the payload is exactly what the API would return.

const STATUS: Record<StatusCategory, StatusRef> = {
  new: { name: "To Do", category: "new" },
  indeterminate: { name: "In Progress", category: "indeterminate" },
  done: { name: "Done", category: "done" },
};

const TEAMS = [
  { name: "Platform", key: "PLT", people: ["Mia Holm", "Ola Nord", "Rasmus Kjær"] },
  { name: "Checkout", key: "CHK", people: ["Jonas Berg", "Sara Lind"] },
  { name: "Aftersales", key: "AS", people: ["Emil Thaudal Bønnerup", "Kim Dahl"] },
  { name: "Fulfilment", key: "FUL", people: ["Lars Vik", "Nora Ali"] },
  { name: "Payments", key: "PAY", people: ["Ida Krogh", "Mads Friis"] },
  { name: "Search", key: "SRC", people: ["Freja Moe"] },
];

const EPIC_THEMES = [
  "Price agreement service", "Quote-based checkout", "Multi-drop shipment planning", "Wave picking for projects",
  "Invoice per delivery site", "Project search & filters", "Credit limit checks", "Order timeline",
  "Carrier booking per drop", "Stock reservation", "Self-service project portal", "Payment terms engine",
];

const VERBS = ["Model", "API for", "Import", "Sync", "UI for", "Validate", "Migrate", "Events for", "Report on", "Harden"];
const NOUNS = [
  "price agreements", "delivery drops", "quote carts", "pick lists", "credit limits", "invoice lines", "site addresses",
  "carrier slots", "project orders", "payment terms", "search facets", "stock holds", "audit trail", "notifications",
];

/** Small deterministic PRNG (mulberry32) so the fixture is stable between polls. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Stable stand-in for an Atlassian accountId. */
function personId(name: string | null): string | null {
  return name ? `fixture-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}` : null;
}

/** YYYY-MM-DD, `offsetDays` from today. */
function isoDay(offsetDays: number): string {
  return new Date(Date.now() + offsetDays * 86_400_000).toISOString().slice(0, 10);
}

export interface FixtureOptions {
  teams?: number;
  epicsPerTeam?: number;
  itemsPerEpic?: number;
  seed?: number;
}

const RELEASE: Release = {
  id: "90001",
  name: "B2B Project (synthetic)",
  description: "Synthetic multi-team milestone for design work",
  released: false,
  archived: false,
  startDate: "2026-09-01",
  releaseDate: "2026-12-15",
  overdue: false,
  sequence: 1,
};

export function buildFixtureDetail({ teams = 5, epicsPerTeam = 3, itemsPerEpic = 9, seed = 7 }: FixtureOptions = {}): MilestoneDetail {
  const rand = rng(seed);
  const pick = <T,>(list: T[]) => list[Math.floor(rand() * list.length)] as T;
  const usedTeams = TEAMS.slice(0, Math.min(teams, TEAMS.length));

  const epics: EpicInput[] = [];
  const items: ItemInput[] = [];
  const incrementCount = Math.max(2, Math.ceil((usedTeams.length * epicsPerTeam) / 3));
  const incrementKeys = Array.from({ length: incrementCount }, (_, i) => `LAD-${20 + i}`);

  let theme = 0;
  usedTeams.forEach((team, t) => {
    for (let e = 0; e < epicsPerTeam; e++) {
      const epicKey = `${team.key}-${100 + e * 50}`;
      const incrementKey = incrementKeys[(t * epicsPerTeam + e) % incrementCount] as string;
      epics.push({
        key: epicKey,
        summary: EPIC_THEMES[theme++ % EPIC_THEMES.length] as string,
        status: e === 0 ? STATUS.indeterminate : STATUS.new,
        team: team.name,
        projectKey: team.key,
        assignee: rand() < 0.7 ? pick(team.people) : null,
        incrementKeys: [incrementKey],
        blocks: [],
        // Not drawn from rand(), so the generated plan stays the same as before.
        designApproved: t % 2 === 0,
      });
      const count = itemsPerEpic + Math.floor(rand() * 4) - 1;
      for (let i = 0; i < count; i++) {
        const key = `${team.key}-${100 + e * 50 + i + 1}`;
        // Earlier items in an epic are more likely to be done or underway.
        const progress = i / count;
        const r = rand();
        const category: StatusCategory = r < 0.35 - progress * 0.3 ? "done" : r < 0.55 - progress * 0.3 ? "indeterminate" : "new";
        items.push({
          key,
          summary: `${pick(VERBS)} ${pick(NOUNS)}`,
          type: rand() < 0.2 ? "Task" : "Story",
          status: STATUS[category],
          assignee: rand() < 0.75 ? pick(team.people) : null,
          epicKey,
          team: team.name,
          points: rand() < 0.6 ? Math.ceil(rand() * 8) : null,
          external: false,
          blocks: [],
        });
      }
    }
  });

  // Within an epic, work mostly flows forward; across teams, a few items gate
  // later work elsewhere — the links that make a program hard to plan.
  const byEpic = new Map<string, ItemInput[]>();
  for (const item of items) byEpic.set(item.epicKey ?? "", [...(byEpic.get(item.epicKey ?? "") ?? []), item]);
  for (const list of byEpic.values()) {
    list.forEach((item, i) => {
      for (let j = i + 1; j < Math.min(list.length, i + 4); j++) {
        if (rand() < 0.38) item.blocks.push((list[j] as ItemInput).key);
      }
    });
  }
  const teamOrder = usedTeams.map((t) => t.name);
  for (const item of items) {
    if (rand() > 0.16) continue;
    const myTeam = teamOrder.indexOf(item.team);
    const laterTeams = teamOrder.slice(myTeam + 1);
    if (laterTeams.length === 0) continue;
    const target = items.filter((i) => i.team === pick(laterTeams));
    const victim = target[Math.floor(rand() * target.length)];
    if (victim) item.blocks.push(victim.key);
  }

  // Two blockers outside the milestone.
  items.push(
    { key: "FIN-12", summary: "Credit limit per project (Finance)", type: "Story", status: STATUS.indeterminate, assignee: "Per Ek", epicKey: null, team: "Finance", points: null, external: true, outsideDecision: true, dueDate: isoDay(-3), blocks: [items[3]?.key ?? ""].filter(Boolean) },
    { key: "ERP-7", summary: "Expose agreement prices from ERP", type: "Task", status: STATUS.new, assignee: null, epicKey: null, team: "ERP", points: null, external: true, outsideDecision: true, dueDate: isoDay(5), blocks: [items[12]?.key ?? ""].filter(Boolean) },
  );

  const increments: IncrementSummary[] = incrementKeys.map((key, i) => ({
    key,
    summary: `${EPIC_THEMES[(i * 3) % EPIC_THEMES.length]} · B2B Project`,
    status: i === 0 ? STATUS.indeterminate : STATUS.new,
    team: null,
    capabilities: [{ key: `LA-${40 + i}`, summary: `Capability ${i + 1}`, status: STATUS.new }],
    teamEpics: epics
      .filter((e) => e.incrementKeys.includes(key))
      .map((e) => ({ key: e.key, summary: e.summary, status: e.status })),
    blocks: i + 1 < incrementKeys.length && i % 2 === 0 ? [incrementKeys[i + 1] as string] : [],
    blockedBy: i > 0 && (i - 1) % 2 === 0 ? [incrementKeys[i - 1] as string] : [],
  }));

  for (const e of epics) e.assigneeId = personId(e.assignee);
  for (const i of items) i.assigneeId = personId(i.assignee);

  const analysis = analyzeMilestone({ increments, epics, items });
  return {
    project: { key: "LAD", name: "Logistics Accelerator - Delivery" },
    release: RELEASE,
    ...analysis,
    generatedAt: new Date().toISOString(),
  };
}

/** Program overview wrapping the synthetic milestone, for roadmap design work. */
export function buildFixtureOverview(): ProgramOverview {
  const detail = buildFixtureDetail();
  const summary = (i: IncrementSummary): IncrementSummary => ({
    key: i.key, summary: i.summary, status: i.status, team: i.team, capabilities: i.capabilities,
    teamEpics: i.teamEpics, blocks: i.blocks, blockedBy: i.blockedBy,
  });
  const release = (r: Release, incs: IncrementSummary[]): ProgramRelease => ({
    ...r,
    increments: incs,
    progress: progressOf(incs.map((i) => i.status)),
    epicProgress: progressOf(incs.flatMap((i) => i.teamEpics.map((e) => e.status))),
  });
  const base = { description: null, released: false, archived: false, startDate: null, overdue: false };
  const first = detail.increments.slice(0, 2).map((i, n) => ({
    ...summary(i),
    key: `LAD-${n + 1}`,
    status: STATUS.done,
    teamEpics: i.teamEpics.map((e) => ({ ...e, status: STATUS.done })),
    blocks: [],
    blockedBy: [],
  }));
  return {
    project: detail.project,
    releases: [
      release({ ...base, id: "90000", name: "B2B Wholesale", releaseDate: "2026-08-29", released: true, sequence: 0 }, first),
      release(detail.release, detail.increments.map(summary)),
      release({ ...base, id: "90002", name: "B2C Low Volume", releaseDate: "2027-03-01", sequence: 2 }, detail.increments.slice(0, 1).map((i) => ({ ...summary(i), key: "LAD-60", status: STATUS.new, blockedBy: ["LAD-21"], blocks: [] }))),
      release({ ...base, id: "90003", name: "B2C High Volume", releaseDate: null, sequence: 3 }, []),
    ],
    unscheduled: [],
    warnings: [],
    generatedAt: new Date().toISOString(),
  };
}

/** Fixture name from a query param, only honoured in local dev. */
export function fixtureName(param: string | null): "multi" | "large" | null {
  const allowed = process.env.NODE_ENV === "development" || process.env.JIRA_BYPASS === "true";
  if (!allowed) return null;
  return param === "multi" || param === "large" ? param : null;
}

export function fixtureDetail(name: "multi" | "large"): MilestoneDetail {
  return name === "large"
    ? buildFixtureDetail({ teams: 6, epicsPerTeam: 5, itemsPerEpic: 11, seed: 11 })
    : buildFixtureDetail();
}
