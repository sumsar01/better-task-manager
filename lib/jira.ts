const JIRA_BASE_URL = process.env.JIRA_BASE_URL!;
const JIRA_EMAIL = process.env.JIRA_EMAIL!;
const JIRA_API_TOKEN = process.env.JIRA_API_TOKEN!;

function authHeader(): string {
  return "Basic " + Buffer.from(`${JIRA_EMAIL}:${JIRA_API_TOKEN}`).toString("base64");
}

async function jiraFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${JIRA_BASE_URL}/rest/api/3${path}`, {
    headers: {
      Authorization: authHeader(),
      Accept: "application/json",
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Jira API error ${res.status} for ${path}: ${text}`);
  }
  return res.json() as Promise<T>;
}

// ── Types ────────────────────────────────────────────────────────────────────

export interface JiraProject {
  id: string;
  key: string;
  name: string;
  avatarUrls?: Record<string, string>;
}

export interface JiraStatus {
  id: string;
  name: string;
  statusCategory: {
    id: number;
    key: string; // "new" | "indeterminate" | "done"
    name: string;
  };
}

export interface JiraIssueType {
  id: string;
  name: string;
  subtask: boolean;
  iconUrl?: string;
}

export interface JiraUser {
  accountId: string;
  displayName: string;
  avatarUrls?: Record<string, string>;
}

export interface JiraIssueLinkType {
  id: string;
  name: string;
  inward: string;
  outward: string;
}

export interface JiraIssueLink {
  id: string;
  type: JiraIssueLinkType;
  inwardIssue?: { id: string; key: string; fields: { summary: string; status: JiraStatus } };
  outwardIssue?: { id: string; key: string; fields: { summary: string; status: JiraStatus } };
}

export interface JiraIssue {
  id: string;
  key: string;
  fields: {
    summary: string;
    status: JiraStatus;
    issuetype: JiraIssueType;
    assignee: JiraUser | null;
    parent?: { id: string; key: string; fields: { summary: string; issuetype: JiraIssueType } };
    subtasks?: Array<{ id: string; key: string; fields: { summary: string; status: JiraStatus; issuetype: JiraIssueType } }>;
    issuelinks: JiraIssueLink[];
    priority?: { name: string; iconUrl?: string };
    story_points?: number;
  };
}

interface SearchResult<T> {
  issues: T[];
  isLast: boolean;
  nextPageToken?: string;
}

// ── API helpers ──────────────────────────────────────────────────────────────

/** Fetch all pages of a JQL search using the /search/jql endpoint, returning every issue. */
export async function searchIssues(jql: string, fields: string[]): Promise<JiraIssue[]> {
  const all: JiraIssue[] = [];
  const maxResults = 100;
  let nextPageToken: string | undefined = undefined;

  while (true) {
    const params = new URLSearchParams({
      jql,
      fields: fields.join(","),
      maxResults: String(maxResults),
    });
    if (nextPageToken) {
      params.set("nextPageToken", nextPageToken);
    }
    const page = await jiraFetch<SearchResult<JiraIssue>>(`/search/jql?${params}`);
    all.push(...page.issues);
    if (page.isLast || !page.nextPageToken) break;
    nextPageToken = page.nextPageToken;
  }

  return all;
}

/** Fetch all projects accessible to the token. */
export async function getProjects(): Promise<JiraProject[]> {
  const all: JiraProject[] = [];
  let startAt = 0;
  const maxResults = 50;

  while (true) {
    const params = new URLSearchParams({
      maxResults: String(maxResults),
      startAt: String(startAt),
      orderBy: "name",
    });
    const page = await jiraFetch<{ values: JiraProject[]; isLast: boolean }>(`/project/search?${params}`);
    all.push(...page.values);
    if (page.isLast) break;
    startAt += page.values.length;
  }

  return all;
}

/** Fetch all epics in a project. */
export async function getEpics(projectKey: string): Promise<JiraIssue[]> {
  return searchIssues(
    `project = "${projectKey}" AND issueType = Epic ORDER BY created DESC`,
    ["summary", "status", "assignee", "issuetype", "issuelinks"]
  );
}

/** Fetch all issues that are direct children of an epic (one level). */
export async function getEpicChildren(epicKey: string): Promise<JiraIssue[]> {
  return searchIssues(
    `parent = "${epicKey}" ORDER BY created ASC`,
    ["summary", "status", "issuetype", "assignee", "parent", "subtasks", "issuelinks", "priority"]
  );
}

/** Fetch subtasks of a set of issue keys. */
export async function getSubtasks(parentKeys: string[]): Promise<JiraIssue[]> {
  if (parentKeys.length === 0) return [];
  const inClause = parentKeys.map((k) => `"${k}"`).join(", ");
  return searchIssues(
    `parent in (${inClause}) ORDER BY created ASC`,
    ["summary", "status", "issuetype", "assignee", "parent", "subtasks", "issuelinks", "priority"]
  );
}
