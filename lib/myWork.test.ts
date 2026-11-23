import { describe, expect, it } from "vitest";
import { analyzeMilestone } from "@/lib/milestoneAnalysis";
import type { EpicInput, ItemInput } from "@/lib/milestoneAnalysis";
import type { IncrementSummary, MilestoneDetail, ProgramOverview, ProgramRelease, StatusRef } from "@/lib/milestoneTypes";
import {
  ASKS_FOR_YOU_URL,
  activeReleases,
  decisionLogsToReview,
  defaultTeam,
  developerView,
  dueState,
  isMine,
  itemHref,
  mostFrequentAssignee,
  outsideDecisionsToChase,
  parseMode,
  readyMineCount,
  reasonLabel,
} from "@/lib/myWork";
import type { MilestoneEntry, Me } from "@/lib/myWork";

const TODO: StatusRef = { name: "To Do", category: "new" };
const DOING: StatusRef = { name: "In Progress", category: "indeterminate" };
const DONE: StatusRef = { name: "Done", category: "done" };

const ME: Me = { id: "acc-me", name: "Maya Me" };
const TODAY = "2026-11-23";

function epic(key: string, team: string, over: Partial<EpicInput> = {}): EpicInput {
  return { key, summary: key, status: DOING, team, projectKey: key.split("-")[0] as string, assignee: null, incrementKeys: ["LAD-1"], blocks: [], designApproved: false, ...over };
}

function item(key: string, epicKey: string | null, team: string, over: Partial<ItemInput> = {}): ItemInput {
  return { key, summary: key, type: "Story", status: TODO, assignee: null, epicKey, team, points: null, external: epicKey === null, blocks: [], ...over };
}

const mine = (over: Partial<ItemInput> = {}): Partial<ItemInput> => ({ assignee: ME.name, assigneeId: ME.id, ...over });
const other = (over: Partial<ItemInput> = {}): Partial<ItemInput> => ({ assignee: "Olle Other", assigneeId: "acc-other", ...over });

function increment(teamEpics: string[]): IncrementSummary {
  return {
    key: "LAD-1",
    summary: "LAD-1",
    status: DOING,
    team: null,
    capabilities: [],
    teamEpics: teamEpics.map((k) => ({ key: k, summary: k, status: DOING })),
    blocks: [],
    blockedBy: [],
  };
}

function entry(id: string, sequence: number, epics: EpicInput[], items: ItemInput[]): MilestoneEntry {
  const analysis = analyzeMilestone({ increments: [increment(epics.map((e) => e.key))], epics, items, today: TODAY });
  const detail: MilestoneDetail = {
    project: { key: "LAD", name: "LAD" },
    release: { id, name: `M${id}`, description: null, released: false, archived: false, startDate: null, releaseDate: null, overdue: false, sequence },
    ...analysis,
    generatedAt: TODAY,
  };
  return { id, name: `M${id}`, sequence, detail };
}

// Team A: A-1 is mine and underway and gates A-3; A-2 is mine and ready; A-4 is
// someone else's, critical, and gates team B; A-5 is someone else's and gates nothing.
function milestoneOne(): MilestoneEntry {
  return entry(
    "1",
    0,
    [epic("A-E", "Team A"), epic("B-E", "Team B")],
    [
      item("A-1", "A-E", "Team A", { ...mine({ status: DOING }), blocks: ["A-3"] }),
      item("A-2", "A-E", "Team A", mine()),
      item("A-3", "A-E", "Team A", other()),
      item("A-4", "A-E", "Team A", { ...other(), blocks: ["B-1"] }),
      item("A-5", "A-E", "Team A", other()),
      item("A-6", "A-E", "Team A", { ...other({ status: DOING }) }),
      item("B-1", "B-E", "Team B", { ...mine(), blocks: ["B-2"] }),
      item("B-2", "B-E", "Team B", mine()),
    ],
  );
}

describe("isMine", () => {
  it("matches on accountId, never on display name", () => {
    expect(isMine({ assigneeId: "acc-me" }, ME)).toBe(true);
    expect(isMine({ assigneeId: "acc-other" }, ME)).toBe(false);
    expect(isMine({ assigneeId: null }, ME)).toBe(false);
    expect(isMine({}, ME)).toBe(false);
    expect(isMine({ assigneeId: "acc-me" }, null)).toBe(false);
  });
});

describe("mostFrequentAssignee", () => {
  it("picks the assignee with the most open items, ignoring done work", () => {
    const e = entry(
      "1",
      0,
      [epic("A-E", "Team A")],
      [
        item("A-1", "A-E", "Team A", other()),
        item("A-2", "A-E", "Team A", other()),
        item("A-3", "A-E", "Team A", mine({ status: DONE })),
        item("A-4", "A-E", "Team A", mine({ status: DONE })),
        item("A-5", "A-E", "Team A", mine({ status: DONE })),
        item("A-6", "A-E", "Team A", mine()),
      ],
    );
    expect(mostFrequentAssignee([e])).toEqual({ id: "acc-other", name: "Olle Other" });
  });

  it("is null when nothing is assigned", () => {
    expect(mostFrequentAssignee([entry("1", 0, [epic("A-E", "Team A")], [item("A-1", "A-E", "Team A")])])).toBeNull();
  });
});

describe("parseMode", () => {
  it("takes the URL first, then the saved choice, then developer", () => {
    expect(parseMode("lead", "developer")).toBe("lead");
    expect(parseMode(null, "lead")).toBe("lead");
    expect(parseMode("bogus", "lead")).toBe("lead");
    expect(parseMode(null, null)).toBe("developer");
    expect(parseMode("bogus", "also-bogus")).toBe("developer");
  });
});

describe("defaultTeam", () => {
  it("is the team with the most of my open items", () => {
    expect(defaultTeam([milestoneOne()], ME)).toBe("Team A");
  });

  it("falls back to the team with the most ready work when I have none", () => {
    expect(defaultTeam([milestoneOne()], { id: "acc-nobody", name: null })).toBe("Team A");
    expect(defaultTeam([], ME)).toBeNull();
  });
});

describe("developerView", () => {
  it("lists my in-progress items for the team, not other people's", () => {
    const { inProgress } = developerView([milestoneOne()], ME, "Team A");
    expect(inProgress.map((r) => r.item.key)).toEqual(["A-1"]);
  });

  it("ranks ready work mine first, then critical, then by what it unblocks", () => {
    const { ready } = developerView([milestoneOne()], ME, "Team A");
    // A-2 is mine; of the rest A-4 gates team B (downstream 2), then A-5 gates nothing.
    expect(ready.map((r) => r.item.key)).toEqual(["A-2", "A-4", "A-5"]);
    expect(ready.map((r) => r.mine)).toEqual([true, false, false]);
  });

  it("says why an item ranks where it does", () => {
    const a4 = developerView([milestoneOne()], ME, "Team A").ready.find((r) => r.item.key === "A-4");
    expect(a4?.reasons).toContainEqual({ kind: "unblocks", count: 2 });
    expect(a4?.reasons).toContainEqual({ kind: "cross-team", teams: ["Team B"] });
    expect(a4?.reasons.map(reasonLabel)).toContain("Unblocks 2");
    expect(a4?.reasons.map(reasonLabel)).toContain("Cross-team: Team B");
  });

  it("puts the critical path ahead of larger downstream counts", () => {
    const e = entry(
      "1",
      0,
      [epic("A-E", "Team A")],
      [
        item("A-1", "A-E", "Team A", { blocks: ["A-3", "A-4", "A-5"] }),
        item("A-2", "A-E", "Team A", { blocks: ["A-6"] }),
        item("A-6", "A-E", "Team A", { blocks: ["A-7"] }),
        item("A-7", "A-E", "Team A", { blocks: ["A-8"] }),
        item("A-8", "A-E", "Team A"),
        item("A-3", "A-E", "Team A"),
        item("A-4", "A-E", "Team A"),
        item("A-5", "A-E", "Team A"),
      ],
    );
    const ready = developerView([e], ME, "Team A").ready;
    expect(ready[0]?.item.key).toBe("A-2");
    expect(ready[0]?.reasons[0]).toEqual({ kind: "critical" });
    expect(ready[1]?.item.key).toBe("A-1");
  });

  it("merges milestones, breaking ties by the milestone that ships first", () => {
    const later = entry("2", 1, [epic("A-E2", "Team A")], [item("A-20", "A-E2", "Team A")]);
    const sooner = entry("1", 0, [epic("A-E1", "Team A")], [item("A-10", "A-E1", "Team A")]);
    const { ready } = developerView([later, sooner], ME, "Team A");
    expect(ready.map((r) => [r.item.key, r.milestone.id])).toEqual([
      ["A-10", "1"],
      ["A-20", "2"],
    ]);
  });

  it("leaves out external items and epics standing in for missing items", () => {
    const e = entry("1", 0, [epic("A-E", "Team A"), epic("A-EMPTY", "Team A")], [item("A-1", "A-E", "Team A"), item("X-1", null, "Team A")]);
    expect(developerView([e], ME, "Team A").ready.map((r) => r.item.key)).toEqual(["A-1"]);
  });

  it("counts an item once when two milestones carry it, under the first to ship", () => {
    const { ready, inProgress } = developerView([{ ...milestoneOne(), id: "2", sequence: 1 }, milestoneOne()], ME, "Team A");
    expect(ready.map((r) => r.item.key)).toEqual(["A-2", "A-4", "A-5"]);
    expect(new Set([...ready, ...inProgress].map((r) => r.milestone.id))).toEqual(new Set(["1"]));
  });

  it("is empty without a team", () => {
    expect(developerView([milestoneOne()], ME, null)).toEqual({ inProgress: [], ready: [] });
  });
});

describe("readyMineCount", () => {
  it("counts my ready, not-yet-started items across teams", () => {
    // A-2 only: A-1 is underway, B-1 waits on A-4 and B-2 on B-1.
    expect(readyMineCount([milestoneOne()], ME)).toBe(1);
    const second = entry("2", 1, [epic("B-E2", "Team B")], [item("B-10", "B-E2", "Team B", mine())]);
    expect(readyMineCount([milestoneOne(), second], ME)).toBe(2);
    expect(readyMineCount([milestoneOne()], null)).toBe(0);
    expect(readyMineCount([milestoneOne(), { ...milestoneOne(), id: "dup", sequence: 5 }], ME)).toBe(1);
  });
});

describe("decisionLogsToReview", () => {
  const e = entry(
    "1",
    0,
    [
      epic("A-LATE", "Team A"),
      epic("A-APPROVED", "Team A", { designApproved: true }),
      epic("A-DONE", "Team A", { status: DONE }),
      epic("B-CRIT", "Team B"),
      epic("C-EARLY", "Team C"),
      epic("EMPTY", "Team D"),
    ],
    [
      item("A-1", "A-LATE", "Team A"),
      item("A-2", "A-LATE", "Team A"),
      item("B-1", "B-CRIT", "Team B", { blocks: ["B-2"] }),
      item("B-2", "B-CRIT", "Team B", { blocks: ["B-3"] }),
      item("B-3", "B-CRIT", "Team B"),
      item("C-1", "C-EARLY", "Team C"),
      item("A-9", "A-APPROVED", "Team A"),
    ],
  );

  it("skips approved and finished epics, the critical path first", () => {
    const keys = decisionLogsToReview([e]).map((l) => l.epic.key);
    expect(keys).not.toContain("A-APPROVED");
    expect(keys).not.toContain("A-DONE");
    expect(keys[0]).toBe("B-CRIT");
  });

  it("then orders by earliest start", () => {
    const logs = decisionLogsToReview([e]).filter((l) => !l.epic.onCriticalPath);
    const starts = logs.map((l) => l.epic.earliestStart ?? Infinity);
    expect(starts).toEqual([...starts].sort((a, b) => a - b));
  });

  it("lists an epic once when two milestones carry it", () => {
    const keys = decisionLogsToReview([e, { ...e, id: "2", sequence: 1 }]).map((l) => l.epic.key);
    expect(keys).toEqual([...new Set(keys)]);
  });

  it("does not list an increment standing in for missing team epics", () => {
    const standIn = e.detail.epics.find((x) => x.standIn);
    if (standIn) expect(decisionLogsToReview([e]).map((l) => l.epic.key)).not.toContain(standIn.key);
  });
});

describe("dueState", () => {
  it("reads overdue, soon, later and none", () => {
    expect(dueState("2026-11-22", TODAY)).toBe("overdue");
    expect(dueState("2026-11-23", TODAY)).toBe("soon");
    expect(dueState("2026-11-30", TODAY)).toBe("soon");
    expect(dueState("2026-12-01", TODAY)).toBe("later");
    expect(dueState(null, TODAY)).toBe("none");
  });
});

describe("outsideDecisionsToChase", () => {
  const ext = (key: string, over: Partial<ItemInput>) => item(key, null, "Finance", { outsideDecision: true, ...over });
  const e = entry(
    "1",
    0,
    [epic("A-E", "Team A")],
    [
      item("A-1", "A-E", "Team A"),
      ext("X-OTHER-SOON", { ...other(), dueDate: "2026-11-25" }),
      ext("X-NOBODY-LATER", { dueDate: "2027-01-01" }),
      ext("X-NOBODY-OVERDUE", { dueDate: "2026-11-01" }),
      ext("X-MINE-LATER", { ...mine(), dueDate: "2027-01-01" }),
      ext("X-MINE-OVERDUE", { ...mine(), dueDate: "2026-11-10" }),
      ext("X-DONE", { ...mine({ status: DONE }) }),
    ],
  );

  it("lists mine first, then unassigned, then the rest, overdue first within each", () => {
    const out = outsideDecisionsToChase([e], ME, TODAY);
    expect(out.map((c) => c.item.key)).toEqual(["X-MINE-OVERDUE", "X-MINE-LATER", "X-NOBODY-OVERDUE", "X-NOBODY-LATER", "X-OTHER-SOON"]);
    expect(out.map((c) => c.group)).toEqual(["mine", "mine", "unassigned", "unassigned", "others"]);
    expect(out.map((c) => c.due)).toEqual(["overdue", "later", "overdue", "later", "soon"]);
  });

  it("lists an item pulled into several milestones once, in the first", () => {
    const again = entry("2", 1, [epic("B-E", "Team B")], [item("B-1", "B-E", "Team B"), ext("X-NOBODY-LATER", { dueDate: "2027-01-01" })]);
    const out = outsideDecisionsToChase([again, e], ME, TODAY).filter((c) => c.item.key === "X-NOBODY-LATER");
    expect(out).toHaveLength(1);
    expect(out[0]?.milestone.id).toBe("1");
  });

  it("treats everything as unassigned-or-others when I am unknown", () => {
    expect(outsideDecisionsToChase([e], null, TODAY).every((c) => c.group !== "mine")).toBe(true);
  });
});

describe("activeReleases", () => {
  const release = (id: string, sequence: number, over: Partial<ProgramRelease> = {}) =>
    ({ id, name: id, sequence, released: false, archived: false, ...over }) as ProgramRelease;

  it("keeps unreleased, unarchived releases in release order", () => {
    const overview = { releases: [release("c", 2), release("done", 0, { released: true }), release("old", 1, { archived: true }), release("a", 3)].reverse() } as ProgramOverview;
    expect(activeReleases(overview).map((r) => r.id)).toEqual(["c", "a"]);
  });
});

describe("itemHref", () => {
  it("selects the item on the milestone page, keeping the fixture param", () => {
    expect(itemHref("/program/LAD/123", "AS-1")).toBe("/program/LAD/123?item=AS-1");
    expect(itemHref("/program/LAD/123?fixture=multi", "AS-1")).toBe("/program/LAD/123?fixture=multi&item=AS-1");
  });
});

describe("ASKS_FOR_YOU_URL", () => {
  it("points at the LA dashboard artifact", () => {
    expect(ASKS_FOR_YOU_URL).toBe("https://claude.ai/artifact/2PH5FEeiXs1pUaQx2hfTep");
  });
});
