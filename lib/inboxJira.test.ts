import { beforeEach, describe, expect, it, vi } from "vitest";

const jiraFetch = vi.fn();
vi.mock("@/lib/jira", () => ({ jiraFetch }));
vi.mock("@/lib/milestone", () => ({
  JQL_CHUNK: 80,
  PAYLOAD_TTL_MS: 30_000,
  cachePartition: async () => "cloud:site:me",
  chunks: <T,>(list: T[], size: number) => {
    const out: T[][] = [];
    for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
    return out;
  },
  getProgramOverviewCached: async () => ({
    value: {
      releases: [
        { released: true, increments: [{ teamEpics: [{ key: "OLD-1" }] }] },
        { released: false, increments: [{ teamEpics: [{ key: "AS-10" }, { key: "PLT-5" }, { key: "AS-11" }] }] },
      ],
    },
    source: "miss",
  }),
}));

const { getInboxCached, inboxProjects, INBOX_ISSUE_CAP } = await import("@/lib/inboxJira");

const issues = (from: number, count: number) =>
  Array.from({ length: count }, (_, i) => ({
    key: `AS-${from + i}`,
    fields: { summary: "s", updated: `2026-11-20T10:${String(59 - ((from + i) % 60)).padStart(2, "0")}:00.000+0000` },
    changelog: {
      histories: [
        {
          id: String(from + i),
          created: "2026-11-20T10:00:00.000+0000",
          author: { accountId: "other", displayName: "Other" },
          items: [{ field: "status", fromString: "To Do", toString: "In Progress" }],
        },
      ],
    },
  }));

beforeEach(() => {
  jiraFetch.mockReset();
});

describe("inboxProjects", () => {
  it("is the delivery space plus the team spaces of unreleased milestones only", async () => {
    expect(await inboxProjects("LAD")).toEqual(["AS", "LAD", "PLT"]);
  });
});

describe("getInboxCached", () => {
  it("searches those projects since a day before the window with the changelog expanded, and reads me from /myself", async () => {
    jiraFetch.mockImplementation(async (path: string) => {
      if (path === "/myself") return { accountId: "me-1", displayName: "Me" };
      return { issues: issues(1, 2), isLast: true };
    });
    const { value } = await getInboxCached("LAD", new Date("2026-11-16T12:00:00.000Z"));
    const search = new URLSearchParams(String(jiraFetch.mock.calls.find((c) => String(c[0]).startsWith("/search"))?.[0]).split("?")[1]);
    expect(search.get("jql")).toBe('project in ("AS", "LAD", "PLT") AND updated >= "2026-11-15" ORDER BY updated DESC');
    expect(search.get("expand")).toBe("changelog");
    expect(search.get("fields")).toContain("comment");
    expect(value.me).toEqual({ accountId: "me-1", name: "Me" });
    expect(value.events).toHaveLength(2);
    expect(value.capped).toBe(false);
  });

  it("caps the issues it reads and says so", async () => {
    jiraFetch.mockImplementation(async (path: string) => {
      if (path === "/myself") return { accountId: "me-1" };
      const page = Number(new URLSearchParams(path.split("?")[1]).get("nextPageToken") ?? 0);
      return { issues: issues(page * 100, 100), isLast: false, nextPageToken: String(page + 1) };
    });
    const { value } = await getInboxCached("CAP", new Date("2026-11-16T12:00:00.000Z"));
    expect(value.capped).toBe(true);
    expect(value.cap).toBe(INBOX_ISSUE_CAP);
    expect(value.issuesScanned).toBe(INBOX_ISSUE_CAP);
    const searches = jiraFetch.mock.calls.filter((c) => String(c[0]).startsWith("/search")).length;
    expect(searches).toBe(3);
  });

  it("does not cache a failure", async () => {
    jiraFetch.mockRejectedValueOnce(new Error("Jira API error 500"));
    await expect(getInboxCached("ERR", new Date("2026-11-16T12:00:00.000Z"))).rejects.toThrow("Jira API error 500");
  });
});
