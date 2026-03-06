import { NextRequest, NextResponse } from "next/server";
import { getEpicChildren, getSubtasks } from "@/lib/jira";

export async function GET(req: NextRequest) {
  const epic = req.nextUrl.searchParams.get("epic");
  if (!epic) {
    return NextResponse.json({ error: "Missing required query param: epic" }, { status: 400 });
  }

  try {
    // Level 1: direct children of the epic
    const children = await getEpicChildren(epic);

    // Level 2: subtasks of those children
    const nonSubtaskKeys = children
      .filter((i) => !i.fields.issuetype.subtask)
      .map((i) => i.key);

    const subtasks = await getSubtasks(nonSubtaskKeys);

    // Combine, deduplicate by key
    const allIssues = [...children, ...subtasks];
    const seen = new Set<string>();
    const deduped = allIssues.filter((i) => {
      if (seen.has(i.key)) return false;
      seen.add(i.key);
      return true;
    });

    return NextResponse.json(deduped);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
