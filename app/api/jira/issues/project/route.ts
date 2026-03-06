import { NextRequest, NextResponse } from "next/server";
import { getEpics, getEpicChildren, getSubtasks } from "@/lib/jira";
import type { JiraIssue } from "@/lib/jira";

export async function GET(req: NextRequest) {
  const project = req.nextUrl.searchParams.get("project");
  if (!project) {
    return NextResponse.json({ error: "Missing required query param: project" }, { status: 400 });
  }

  try {
    const epics = await getEpics(project);

    const openEpics = epics.filter((e) => e.fields.status.statusCategory.key !== "done");

    // Expand open epics: fetch children + subtasks in parallel
    const expandedResults = await Promise.all(
      openEpics.map(async (epic) => {
        const children = await getEpicChildren(epic.key);
        const nonSubtaskKeys = children
          .filter((i) => !i.fields.issuetype.subtask)
          .map((i) => i.key);
        const subtasks = await getSubtasks(nonSubtaskKeys);
        return [...children, ...subtasks];
      })
    );

    // Merge: all epics (open + closed) + all expanded children
    const allIssues: JiraIssue[] = [
      ...epics,
      ...expandedResults.flat(),
    ];

    // Deduplicate by key
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
