import { extractInboxEvents } from "@/lib/inbox";
import type { InboxIssue, InboxPayload, JiraChangelogItem, JiraHistory } from "@/lib/inbox";
import { fixtureDetail } from "@/lib/milestoneFixture";

// ── Synthetic inbox (dev only) ──────────────────────────────────────────────
//
// Jira-shaped issues with changelogs and comments, run through the same
// extraction as the real route, so the page renders without Jira.

export const FIXTURE_ME = { accountId: "fixture-me", name: "Emil Thaudal Bønnerup" };

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

const PEOPLE = {
  mia: { accountId: "fixture-mia", displayName: "Mia Holm" },
  jonas: { accountId: "fixture-jonas", displayName: "Jonas Berg" },
  sara: { accountId: "fixture-sara", displayName: "Sara Lind" },
  kim: { accountId: "fixture-kim", displayName: "Kim Dahl" },
  ola: { accountId: "fixture-ola", displayName: "Ola Nord" },
  lars: { accountId: "fixture-lars", displayName: "Lars Vik" },
  me: { accountId: FIXTURE_ME.accountId, displayName: FIXTURE_ME.name },
};

/** Jira's timestamp format: 2026-11-20T09:12:33.456+0000. */
function jiraTime(ms: number): string {
  return new Date(ms).toISOString().replace("Z", "+0000");
}

const status = (from: string, to: string): JiraChangelogItem => ({
  field: "status",
  fieldtype: "jira",
  from: from === "To Do" ? "10000" : from === "In Progress" ? "10001" : "10002",
  fromString: from,
  to: to === "To Do" ? "10000" : to === "In Progress" ? "10001" : "10002",
  toString: to,
});

const blocks = (other: string, direction: "blocks" | "is blocked by"): JiraChangelogItem => ({
  field: "Link",
  fieldtype: "jira",
  from: null,
  fromString: null,
  to: other,
  toString: `This issue ${direction} ${other}`,
});

const dueDate = (from: string, to: string): JiraChangelogItem => ({
  field: "duedate",
  fieldtype: "jira",
  from,
  fromString: `${from} 00:00:00.0`,
  to,
  toString: `${to} 00:00:00.0`,
});

const fixVersion = (from: string, to: string): JiraChangelogItem => ({
  field: "Fix Version",
  fieldtype: "jira",
  from: "90000",
  fromString: from,
  to: "90001",
  toString: to,
});

function mentionBody(text: string, id: string, name: string) {
  return {
    type: "doc",
    version: 1,
    content: [
      {
        type: "paragraph",
        content: [
          { type: "mention", attrs: { id, text: `@${name}` } },
          { type: "text", text: ` ${text}` },
        ],
      },
    ],
  };
}

/** Synthetic issues, their changes timed relative to `now`. */
export function fixtureInboxIssues(now: Date): InboxIssue[] {
  const t = now.getTime();
  const items = fixtureDetail("multi").items.filter((i) => !i.external);
  const at = (index: number) => items[index % items.length];
  let historyId = 100;
  const history = (author: keyof typeof PEOPLE, agoMs: number, ...changes: JiraChangelogItem[]): JiraHistory => ({
    id: String(historyId++),
    author: PEOPLE[author],
    created: jiraTime(t - agoMs),
    items: changes,
  });
  const issue = (
    index: number,
    extra: Partial<InboxIssue["fields"]> & { histories?: JiraHistory[] } = {},
  ): InboxIssue => {
    const item = at(index);
    const { histories = [], ...fields } = extra;
    return {
      key: item?.key ?? `FIX-${index}`,
      fields: { summary: item?.summary ?? "Synthetic item", parent: item?.epicKey ? { key: item.epicKey } : undefined, ...fields },
      changelog: { histories },
    };
  };

  const decision = issue(30, {
    labels: ["external"],
    status: { name: "Done", statusCategory: { key: "done" } },
    histories: [history("kim", 26 * HOUR_MS, status("In Progress", "Done"))],
  });
  const secondItem = at(12);

  return [
    issue(0, { histories: [history("mia", 40 * 60_000, status("To Do", "In Progress"))] }),
    issue(3, { histories: [history("jonas", 3 * HOUR_MS, status("In Progress", "Done"))] }),
    issue(5, {
      histories: [history("sara", 5 * HOUR_MS, blocks(secondItem?.key ?? "FIX-12", "is blocked by"))],
    }),
    issue(8, {
      histories: [history("sara", 5.5 * HOUR_MS, blocks(secondItem?.key ?? "FIX-12", "blocks"))],
    }),
    decision,
    issue(14, { histories: [history("ola", 30 * HOUR_MS, dueDate("2026-11-30", "2026-12-14"))] }),
    issue(17, {
      histories: [history("ola", 2 * DAY_MS + 3 * HOUR_MS, fixVersion("B2B Wholesale", "B2B Project (synthetic)"))],
    }),
    issue(21, {
      comment: {
        comments: [
          {
            id: "5001",
            author: PEOPLE.lars,
            created: jiraTime(t - 2 * HOUR_MS),
            body: mentionBody("can you confirm the carrier slot rules before Thursday?", FIXTURE_ME.accountId, "Emil"),
          },
          {
            id: "5002",
            author: PEOPLE.lars,
            created: jiraTime(t - 4 * HOUR_MS),
            body: mentionBody("this one is for you", "fixture-someone-else", "Nora"),
          },
        ],
      },
    }),
    issue(24, { histories: [history("me", HOUR_MS, status("To Do", "In Progress"))] }),
    issue(27, { histories: [history("mia", 3 * DAY_MS, status("In Progress", "Done")), history("kim", 4 * DAY_MS, status("To Do", "In Progress"))] }),
    issue(33, { histories: [history("jonas", 5 * DAY_MS, dueDate("2026-11-20", "2026-11-27"))] }),
    issue(36, { histories: [history("lars", 6 * DAY_MS, blocks(at(2)?.key ?? "FIX-2", "blocks"))] }),
    issue(39, { histories: [history("sara", 12 * DAY_MS, status("To Do", "In Progress"))] }),
    {
      key: "OPS-142",
      fields: { summary: "Carrier API credentials rotated" },
      changelog: { histories: [history("kim", 8 * HOUR_MS, status("In Progress", "Done"))] },
    },
  ];
}

export function buildFixtureInbox(project: string, since: Date, now: Date = new Date()): InboxPayload {
  const issues = fixtureInboxIssues(now);
  return {
    project,
    since: since.toISOString(),
    events: extractInboxEvents(issues, { since, meAccountId: FIXTURE_ME.accountId }),
    issuesScanned: issues.length,
    capped: false,
    cap: issues.length,
    me: FIXTURE_ME,
    generatedAt: now.toISOString(),
  };
}
