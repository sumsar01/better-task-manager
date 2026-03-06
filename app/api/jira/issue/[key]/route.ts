import { NextRequest, NextResponse } from "next/server";

const JIRA_BASE_URL = process.env.JIRA_BASE_URL!;
const JIRA_EMAIL = process.env.JIRA_EMAIL!;
const JIRA_API_TOKEN = process.env.JIRA_API_TOKEN!;

const FIELDS = [
  "summary",
  "status",
  "issuetype",
  "assignee",
  "priority",
  "labels",
  "description",
  "comment",
  "issuelinks",
  "parent",
  "subtasks",
  "customfield_10016", // story points (classic)
  "customfield_10028", // story points (next-gen)
].join(",");

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ key: string }> }
) {
  const { key } = await params;
  if (!key) {
    return NextResponse.json({ error: "Missing issue key" }, { status: 400 });
  }

  const auth = "Basic " + Buffer.from(`${JIRA_EMAIL}:${JIRA_API_TOKEN}`).toString("base64");

  try {
    const res = await fetch(
      `${JIRA_BASE_URL}/rest/api/3/issue/${encodeURIComponent(key)}?fields=${FIELDS}`,
      { headers: { Authorization: auth, Accept: "application/json" } }
    );

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json(
        { error: `Jira API error ${res.status}: ${text}` },
        { status: res.status }
      );
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
