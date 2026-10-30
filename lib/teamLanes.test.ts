import { describe, expect, it } from "vitest";
import { fixtureDetail } from "@/lib/milestoneFixture";
import type { Dependency, MilestoneDetail, StatusCategory, TeamEpic, WorkItem } from "@/lib/milestoneTypes";
import { teamLanes } from "@/lib/teamLanes";

const epic = (key: string, team: string, blocksEpics: string[] = [], category: StatusCategory = "new"): TeamEpic => ({
  key,
  summary: key,
  status: { name: category, category },
  team,
  projectKey: key.split("-")[0],
  assignee: null,
  incrementKeys: [],
  itemKeys: [],
  progress: { done: 0, inProgress: 0, todo: 0, total: 0 },
  blocksEpics,
  blockedByEpics: [],
  earliestStart: null,
  earliestFinish: null,
  criticalItems: 0,
  onCriticalPath: false,
  standIn: false,
  designApproved: false,
});

const detailOf = (epics: TeamEpic[], dependencies: Dependency[] = [], items: Partial<WorkItem>[] = []) =>
  ({ epics, dependencies, items }) as unknown as MilestoneDetail;

const waves = (d: MilestoneDetail) =>
  Object.fromEntries(teamLanes(d).lanes.map((l) => [l.team, l.waves.map((w) => w.map((e) => e.key))]));

describe("team lanes", () => {
  it("places an epic one wave after the latest epic it waits on, across teams", () => {
    const d = detailOf([
      epic("C-1", "Customer", ["F-1", "C-2"]),
      epic("C-2", "Customer"),
      epic("F-1", "Finance", ["P-1"]),
      epic("P-1", "Payments"),
    ]);
    expect(waves(d)).toEqual({
      Customer: [["C-1"], ["C-2"], []],
      Finance: [[], ["F-1"], []],
      Payments: [[], [], ["P-1"]],
    });
    const links = teamLanes(d).links;
    expect(links.find((l) => l.from === "C-1" && l.to === "C-2")?.crossTeam).toBe(false);
    expect(links.find((l) => l.from === "C-1" && l.to === "F-1")?.crossTeam).toBe(true);
  });

  it("puts epics that wait on each other in one wave and marks the links mutual", () => {
    const d = detailOf([epic("A-1", "T", ["A-2"]), epic("A-2", "T", ["A-3", "A-1"]), epic("A-3", "T")]);
    expect(waves(d).T).toEqual([["A-1", "A-2"], ["A-3"]]);
    const { links } = teamLanes(d);
    expect(links.filter((l) => l.mutual).map((l) => `${l.from}>${l.to}`).sort()).toEqual(["A-1>A-2", "A-2>A-1"]);
    expect(links.find((l) => l.to === "A-3")?.mutual).toBe(false);
  });

  it("keeps finished epics out of the waves and their links", () => {
    const d = detailOf([epic("A-1", "T", [], "done"), epic("A-2", "T")]);
    const [lane] = teamLanes(d).lanes;
    expect(lane.done.map((e) => e.key)).toEqual(["A-1"]);
    expect(lane.waves).toEqual([[expect.objectContaining({ key: "A-2" })]]);
  });

  it("resolves an epic-level link to an item onto the item's epic", () => {
    const dep: Dependency = { from: "S-1", to: "C-9", kind: "epic", crossTeam: true, crossEpic: true, satisfied: false, critical: false };
    const d = detailOf([epic("S-1", "Stock"), epic("C-1", "Customer")], [dep], [{ key: "C-9", epicKey: "C-1" }]);
    expect(teamLanes(d).links).toEqual([{ from: "S-1", to: "C-1", crossTeam: true, mutual: false }]);
    expect(waves(d).Customer).toEqual([[], ["C-1"]]);
  });

  it("orders lanes by when their work starts", () => {
    const d = detailOf([epic("B-1", "Beta"), epic("A-1", "Alpha", [], "done"), epic("Z-1", "Zulu", ["B-1"])]);
    expect(teamLanes(d).lanes.map((l) => l.team)).toEqual(["Zulu", "Beta", "Alpha"]);
  });

  it("places every open epic of the fixture exactly once", () => {
    const d = fixtureDetail("multi");
    const { lanes } = teamLanes(d);
    const placed = lanes.flatMap((l) => [...l.waves.flat(), ...l.done].map((e) => e.key)).sort();
    expect(placed).toEqual(d.epics.map((e) => e.key).sort());
    const { links, waveOf } = teamLanes(d);
    for (const l of links) if (!l.mutual) expect(waveOf.get(l.to)).toBeGreaterThan(waveOf.get(l.from) as number);
  });
});
