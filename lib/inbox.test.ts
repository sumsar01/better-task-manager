import { describe, expect, it } from "vitest";
import {
  EMPTY_SEEN,
  adfText,
  describeEvent,
  extractInboxEvents,
  filterByKind,
  groupByDay,
  isUnread,
  jiraTimeToIso,
  markAllRead,
  markRead,
  milestoneOfIssue,
  parseSeen,
  relativeTime,
  serializeSeen,
  unreadCount,
  windowStart,
} from "@/lib/inbox";
import type { InboxIssue } from "@/lib/inbox";
import { buildFixtureInbox, FIXTURE_ME } from "@/lib/inboxFixture";
import type { ProgramOverview, ProgramRelease } from "@/lib/milestoneTypes";

const ME = "5b10ac8d82e05b22cc7d4ef5";
const MIA = { accountId: "6011aa", displayName: "Mia Holm", emailAddress: "mia@example.com", active: true };
const SINCE = new Date("2026-11-16T00:00:00.000Z");

const issue = (over: Partial<InboxIssue> & { key: string }): InboxIssue => ({
  fields: { summary: "Price agreement service", parent: { key: "AS-10" } },
  ...over,
});

const history = (id: string, created: string, items: object[], author: object | null = MIA) =>
  ({ id, created, author, items }) as never;

describe("jiraTimeToIso", () => {
  it("reads Jira's +0100 offsets", () => {
    expect(jiraTimeToIso("2026-11-20T09:12:33.456+0100")).toBe("2026-11-20T08:12:33.456Z");
    expect(jiraTimeToIso("2026-11-20T09:12:33.456-0500")).toBe("2026-11-20T14:12:33.456Z");
  });
  it("rejects garbage", () => expect(jiraTimeToIso("yesterday")).toBeNull());
});

describe("extractInboxEvents", () => {
  const extract = (issues: InboxIssue[], meAccountId: string | null = ME) => extractInboxEvents(issues, { since: SINCE, meAccountId });

  it("reports status changes with from and to", () => {
    const [e] = extract([
      issue({
        key: "AS-101",
        changelog: {
          histories: [
            history("10001", "2026-11-20T09:12:33.456+0100", [
              { field: "status", fieldtype: "jira", fieldId: "status", from: "10000", fromString: "To Do", to: "10001", toString: "In Progress" },
            ]),
          ],
        },
      }),
    ]);
    expect(e).toMatchObject({
      id: "AS-101:h10001:0",
      kind: "status",
      issueKey: "AS-101",
      summary: "Price agreement service",
      parentKey: "AS-10",
      from: "To Do",
      to: "In Progress",
      at: "2026-11-20T08:12:33.456Z",
      author: { accountId: "6011aa", name: "Mia Holm" },
    });
    expect(describeEvent(e!)).toBe("To Do → In Progress");
  });

  it("reports a new blocks link and a new is-blocked-by link, not a removed one", () => {
    const events = extract([
      issue({
        key: "AS-102",
        changelog: {
          histories: [
            history("10002", "2026-11-20T10:00:00.000+0000", [
              { field: "Link", fieldtype: "jira", from: null, fromString: null, to: "PLT-7", toString: "This issue blocks PLT-7" },
            ]),
            history("10003", "2026-11-20T11:00:00.000+0000", [
              { field: "Link", fieldtype: "jira", from: null, fromString: null, to: "CHK-3", toString: "This issue is blocked by CHK-3" },
            ]),
            history("10004", "2026-11-20T12:00:00.000+0000", [
              { field: "Link", fieldtype: "jira", from: "PLT-9", fromString: "This issue blocks PLT-9", to: null, toString: null },
            ]),
            history("10005", "2026-11-20T13:00:00.000+0000", [
              { field: "Link", fieldtype: "jira", from: null, fromString: null, to: "CHK-4", toString: "This issue relates to CHK-4" },
            ]),
          ],
        },
      }),
    ]);
    expect(events.map((e) => [e.kind, e.detail, e.otherKey])).toEqual([
      ["link", "is blocked by", "CHK-3"],
      ["link", "blocks", "PLT-7"],
    ]);
    expect(describeEvent(events[1]!)).toBe("Now blocks PLT-7");
  });

  it("turns an external-labelled issue moving to done into an answered decision, not a plain status change", () => {
    const events = extract([
      issue({
        key: "AS-103",
        fields: { summary: "Finance signs off the credit policy", labels: ["external"], status: { name: "Done", statusCategory: { key: "done" } } },
        changelog: {
          histories: [
            history("10006", "2026-11-21T08:00:00.000+0000", [{ field: "status", from: "10001", fromString: "In Progress", to: "10002", toString: "Done" }]),
            history("10007", "2026-11-19T08:00:00.000+0000", [{ field: "status", from: "10000", fromString: "To Do", to: "10001", toString: "In Progress" }]),
          ],
        },
      }),
    ]);
    expect(events.map((e) => [e.kind, e.to])).toEqual([
      ["decision", "Done"],
      ["status", "In Progress"],
    ]);
  });

  it("does not call a done move a decision without the external label", () => {
    const [e] = extract([
      issue({
        key: "AS-104",
        changelog: { histories: [history("10008", "2026-11-21T08:00:00.000+0000", [{ field: "status", fromString: "In Progress", toString: "Done" }])] },
      }),
    ]);
    expect(e?.kind).toBe("status");
  });

  it("reports moved due dates and fix versions", () => {
    const events = extract([
      issue({
        key: "AS-105",
        changelog: {
          histories: [
            history("10009", "2026-11-18T08:00:00.000+0000", [
              { field: "duedate", fieldtype: "jira", from: "2026-11-30", fromString: "2026-11-30 00:00:00.0", to: "2026-12-14", toString: "2026-12-14 00:00:00.0" },
            ]),
            history("10010", "2026-11-19T08:00:00.000+0000", [
              { field: "Fix Version", fieldtype: "jira", from: "10100", fromString: "B2B Wholesale", to: "10101", toString: "B2B Project" },
            ]),
            history("10011", "2026-11-20T08:00:00.000+0000", [
              { field: "duedate", fieldtype: "jira", from: null, fromString: null, to: "2026-12-01", toString: "2026-12-01 00:00:00.0" },
            ]),
          ],
        },
      }),
    ]);
    expect(events.map((e) => [e.kind, e.detail, e.from, e.to])).toEqual([
      ["date", "Due date", null, "2026-12-01"],
      ["date", "Fix version", "B2B Wholesale", "B2B Project"],
      ["date", "Due date", "2026-11-30", "2026-12-14"],
    ]);
    expect(describeEvent(events[2]!)).toBe("Due date: 2026-11-30 → 2026-12-14");
  });

  it("splits one history with several changed fields into one event per change and ignores other fields", () => {
    const events = extract([
      issue({
        key: "AS-106",
        changelog: {
          histories: [
            history("10012", "2026-11-20T08:00:00.000+0000", [
              { field: "summary", fromString: "a", toString: "b" },
              { field: "status", fromString: "To Do", toString: "In Progress" },
              { field: "duedate", fromString: "2026-11-30 00:00:00.0", toString: "2026-12-02 00:00:00.0" },
            ]),
          ],
        },
      }),
    ]);
    expect(events.map((e) => e.id)).toEqual(["AS-106:h10012:1", "AS-106:h10012:2"]);
  });

  it("reports comments that mention me, with an excerpt, and ignores mentions of others", () => {
    const body = (id: string) => ({
      type: "doc",
      version: 1,
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Heads up " },
            { type: "mention", attrs: { id, text: "@Emil", accessLevel: "" } },
            { type: "text", text: ", the carrier slots changed." },
          ],
        },
      ],
    });
    const events = extract([
      issue({
        key: "AS-107",
        fields: {
          summary: "Carrier booking per drop",
          comment: {
            comments: [
              { id: "20001", author: MIA, created: "2026-11-21T09:00:00.000+0100", body: body(ME) },
              { id: "20002", author: MIA, created: "2026-11-21T09:30:00.000+0100", body: body("someone-else") },
              { id: "20003", author: MIA, created: "2026-11-01T09:00:00.000+0100", body: body(ME) },
            ],
          },
        },
      }),
    ]);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ id: "AS-107:c20001", kind: "mention", detail: "Heads up @Emil, the carrier slots changed.", author: { name: "Mia Holm" } });
    expect(describeEvent(events[0]!)).toContain("Mentioned you");
  });

  it("drops changes and mentions made by me", () => {
    const mine = { accountId: ME, displayName: "Me" };
    const events = extract([
      issue({
        key: "AS-108",
        fields: {
          summary: "x",
          comment: {
            comments: [
              { id: "1", author: mine, created: "2026-11-21T09:00:00.000+0000", body: { type: "doc", content: [{ type: "mention", attrs: { id: ME } }] } },
            ],
          },
        },
        changelog: { histories: [history("1", "2026-11-21T09:00:00.000+0000", [{ field: "status", fromString: "a", toString: "b" }], mine)] },
      }),
    ]);
    expect(events).toEqual([]);
  });

  it("skips changes before since and sorts the rest newest first across issues", () => {
    const events = extract([
      issue({ key: "AS-1", changelog: { histories: [history("1", "2026-11-15T23:59:59.000+0000", [{ field: "status", fromString: "a", toString: "b" }]), history("2", "2026-11-17T08:00:00.000+0000", [{ field: "status", fromString: "a", toString: "b" }])] } }),
      issue({ key: "AS-2", changelog: { histories: [history("3", "2026-11-18T08:00:00.000+0000", [{ field: "status", fromString: "a", toString: "b" }])] } }),
    ]);
    expect(events.map((e) => e.issueKey)).toEqual(["AS-2", "AS-1"]);
  });

  it("keeps changes but finds no mentions when the account is unknown", () => {
    const events = extract(
      [issue({ key: "AS-3", changelog: { histories: [history("1", "2026-11-18T08:00:00.000+0000", [{ field: "status", fromString: "a", toString: "b" }])] } })],
      null,
    );
    expect(events).toHaveLength(1);
  });
});

describe("adfText", () => {
  it("flattens paragraphs and mentions", () => {
    expect(
      adfText({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Hi " }, { type: "mention", attrs: { id: "x", text: "@Ola" } }] }] }).trim(),
    ).toBe("Hi @Ola");
  });
});

describe("milestoneOfIssue", () => {
  const release = (id: string, released: boolean, epics: string[], incKey = `LAD-${id}`): ProgramRelease =>
    ({
      id,
      released,
      increments: [{ key: incKey, teamEpics: epics.map((key) => ({ key })) }],
    }) as unknown as ProgramRelease;
  const overview = { releases: [release("1", true, ["AS-10"]), release("2", false, ["AS-10", "PLT-5"])] } as unknown as ProgramOverview;

  it("finds the milestone through the parent epic, preferring an unreleased one", () => {
    expect(milestoneOfIssue(overview, "AS-101", "AS-10")).toBe("2");
  });
  it("finds a team epic or increment itself", () => {
    expect(milestoneOfIssue(overview, "PLT-5", null)).toBe("2");
    expect(milestoneOfIssue(overview, "LAD-2", null)).toBe("2");
  });
  it("returns null for an issue in no milestone", () => {
    expect(milestoneOfIssue(overview, "OPS-142", null)).toBeNull();
  });
});

describe("presentation", () => {
  const event = (id: string, at: string, kind: "status" | "date" = "status") =>
    ({ id, at, kind, issueKey: "AS-1", summary: "s", parentKey: null, author: null, from: null, to: null, detail: null, otherKey: null }) as never;

  it("groups by local day as Today, Yesterday, then the date", () => {
    const now = new Date(2026, 10, 23, 15, 0);
    const days = groupByDay(
      [
        event("a", new Date(2026, 10, 23, 14, 0).toISOString()),
        event("b", new Date(2026, 10, 23, 1, 0).toISOString()),
        event("c", new Date(2026, 10, 22, 23, 0).toISOString()),
        event("d", new Date(2026, 10, 19, 9, 0).toISOString()),
      ],
      now,
    );
    expect(days.map((d) => [d.label, d.events.map((e) => e.id)])).toEqual([
      ["Today", ["a", "b"]],
      ["Yesterday", ["c"]],
      ["Thu 19 Nov", ["d"]],
    ]);
  });

  it("filters by kind", () => {
    const list = [event("a", "2026-11-20T00:00:00.000Z"), event("b", "2026-11-20T00:00:00.000Z", "date")];
    expect(filterByKind(list, "date").map((e) => e.id)).toEqual(["b"]);
    expect(filterByKind(list, "all")).toHaveLength(2);
  });

  it("writes compact relative times", () => {
    const now = new Date("2026-11-23T12:00:00.000Z");
    expect(relativeTime("2026-11-23T11:59:40.000Z", now)).toBe("now");
    expect(relativeTime("2026-11-23T11:15:00.000Z", now)).toBe("45m");
    expect(relativeTime("2026-11-23T07:00:00.000Z", now)).toBe("5h");
    expect(relativeTime("2026-11-20T12:00:00.000Z", now)).toBe("3d");
  });
});

describe("seen-state", () => {
  const e = (id: string, at: string) => ({ id, at }) as never;
  const events = [e("a", "2026-11-23T10:00:00.000Z"), e("b", "2026-11-22T10:00:00.000Z"), e("c", "2026-11-21T10:00:00.000Z")];

  it("counts everything unread on a first visit", () => {
    expect(unreadCount(events, EMPTY_SEEN)).toBe(3);
  });

  it("counts only events after the last look and not those read one by one", () => {
    const seen = markRead({ lookedAt: "2026-11-21T12:00:00.000Z", read: [] }, "a");
    expect(unreadCount(events, seen)).toBe(1);
    expect(isUnread(events[0]!, seen)).toBe(false);
    expect(isUnread(events[1]!, seen)).toBe(true);
    expect(isUnread(events[2]!, seen)).toBe(false);
  });

  it("marks everything read at the moment the data was generated, so later changes stay unread", () => {
    const seen = markAllRead("2026-11-23T09:00:00.000Z");
    expect(unreadCount(events, seen)).toBe(1);
  });

  it("survives a round trip and bad storage", () => {
    const seen = markRead(markAllRead("2026-11-23T09:00:00.000Z"), "x");
    expect(parseSeen(serializeSeen(seen))).toEqual(seen);
    expect(parseSeen("{nope")).toEqual(EMPTY_SEEN);
    expect(parseSeen(null)).toEqual(EMPTY_SEEN);
    expect(parseSeen('{"lookedAt":5,"read":[1,"y"]}')).toEqual({ lookedAt: null, read: ["y"] });
  });

  it("reading the same event twice changes nothing", () => {
    const once = markRead(EMPTY_SEEN, "a");
    expect(markRead(once, "a")).toBe(once);
  });

  it("looks back a week on a first visit and after a recent visit, further after a long absence, never past a month", () => {
    const now = new Date("2026-11-23T12:30:00.000Z");
    expect(windowStart(now, EMPTY_SEEN)).toBe("2026-11-16T12:00:00.000Z");
    expect(windowStart(now, markAllRead("2026-11-22T10:00:00.000Z"))).toBe("2026-11-16T12:00:00.000Z");
    expect(windowStart(now, markAllRead("2026-11-10T10:00:00.000Z"))).toBe("2026-11-10T10:00:00.000Z");
    expect(windowStart(now, markAllRead("2026-08-01T10:00:00.000Z"))).toBe("2026-10-24T12:00:00.000Z");
  });
});

describe("fixture inbox", () => {
  const now = new Date("2026-11-23T12:00:00.000Z");
  const since = new Date(now.getTime() - 7 * 86_400_000);
  const payload = buildFixtureInbox("LAD", since, now);

  it("covers every kind through the real extraction", () => {
    expect(new Set(payload.events.map((e) => e.kind))).toEqual(new Set(["status", "link", "decision", "date", "mention"]));
  });

  it("leaves out my own changes, other people's mentions and changes before the window", () => {
    expect(payload.events.some((e) => e.author?.accountId === FIXTURE_ME.accountId)).toBe(false);
    expect(payload.events.filter((e) => e.kind === "mention")).toHaveLength(1);
    expect(payload.events.every((e) => e.at >= since.toISOString())).toBe(true);
  });

  it("is newest first", () => {
    const times = payload.events.map((e) => e.at);
    expect(times).toEqual([...times].sort().reverse());
  });
});
