import { jiraFetch } from "@/lib/jira";
import type { SessionData } from "@/lib/session";
import { TtlCache } from "@/lib/ttlCache";
import { JQL_CHUNK, PAYLOAD_TTL_MS, cachePartition, chunks, getProgramOverviewCached } from "@/lib/milestone";
import { extractInboxEvents } from "@/lib/inbox";
import type { InboxIssue, InboxPayload, InboxPerson } from "@/lib/inbox";

/** Most issues read per request; beyond it the oldest changes are left out and the payload says so. */
export const INBOX_ISSUE_CAP = 300;
const PAGE_SIZE = 100;
const DAY_MS = 86_400_000;
const ISSUE_FIELDS = ["summary", "status", "labels", "parent", "comment", "updated"];
const META_TTL_MS = 5 * 60_000;

interface SearchPage {
  issues: InboxIssue[];
  isLast?: boolean;
  nextPageToken?: string;
}

const inboxCache = new TtlCache<InboxPayload>({ ttlMs: PAYLOAD_TTL_MS, maxEntries: 50 });
const meCache = new TtlCache<InboxPerson | null>({ ttlMs: META_TTL_MS });

async function whoAmI(session?: SessionData): Promise<InboxPerson | null> {
  const { value } = await meCache.getOrLoad(await cachePartition(session), async () => {
    const me = await jiraFetch<{ accountId?: string; displayName?: string }>("/myself", session);
    return me.accountId ? { accountId: me.accountId, name: me.displayName ?? "Me" } : null;
  });
  return value;
}

/** The delivery space plus every team space holding a team epic of an unreleased milestone. */
export async function inboxProjects(projectKey: string, session?: SessionData): Promise<string[]> {
  const { value: overview } = await getProgramOverviewCached(projectKey, session);
  const keys = new Set([projectKey]);
  for (const release of overview.releases) {
    if (release.released) continue;
    for (const inc of release.increments) {
      for (const epic of inc.teamEpics) keys.add(epic.key.split("-")[0] ?? "");
    }
  }
  keys.delete("");
  return [...keys].sort();
}

/** Issues of these projects changed since the given day (one day of slack covers any site time zone; events are cut to the exact instant afterwards), newest first, up to `limit`. */
async function searchChanged(projects: string[], since: Date, limit: number, session?: SessionData) {
  const day = new Date(since.getTime() - DAY_MS).toISOString().slice(0, 10);
  const perChunk = await Promise.all(
    chunks(projects, JQL_CHUNK).map(async (part) => {
      const jql = `project in (${part.map((p) => `"${p}"`).join(", ")}) AND updated >= "${day}" ORDER BY updated DESC`;
      const found: InboxIssue[] = [];
      let more = false;
      let token: string | undefined;
      while (true) {
        const params = new URLSearchParams({ jql, fields: ISSUE_FIELDS.join(","), expand: "changelog", maxResults: String(PAGE_SIZE) });
        if (token) params.set("nextPageToken", token);
        const page = await jiraFetch<SearchPage>(`/search/jql?${params}`, session);
        found.push(...page.issues);
        if (page.isLast || !page.nextPageToken) break;
        if (found.length >= limit) {
          more = true;
          break;
        }
        token = page.nextPageToken;
      }
      return { found, more };
    }),
  );
  const updated = (i: InboxIssue) => i.fields.updated ?? "";
  const all = perChunk.flatMap((c) => c.found).sort((a, b) => updated(b).localeCompare(updated(a)));
  return { issues: all.slice(0, limit), capped: all.length > limit || perChunk.some((c) => c.more) };
}

async function loadInbox(projectKey: string, since: Date, session?: SessionData): Promise<InboxPayload> {
  const [projects, me] = await Promise.all([inboxProjects(projectKey, session), whoAmI(session)]);
  const { issues, capped } = await searchChanged(projects, since, INBOX_ISSUE_CAP, session);
  return {
    project: projectKey,
    since: since.toISOString(),
    events: extractInboxEvents(issues, { since, meAccountId: me?.accountId ?? null }),
    issuesScanned: issues.length,
    capped,
    cap: INBOX_ISSUE_CAP,
    me,
    generatedAt: new Date().toISOString(),
  };
}

/** Cached per Jira site + signed-in account + project + start of the window. */
export async function getInboxCached(projectKey: string, since: Date, session?: SessionData) {
  const partition = await cachePartition(session);
  return inboxCache.getOrLoad(`${partition}|${projectKey}|${since.toISOString()}`, () => loadInbox(projectKey, since, session));
}
