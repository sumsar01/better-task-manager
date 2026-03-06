import { NextRequest, NextResponse } from "next/server";
import { getEpics } from "@/lib/jira";

export async function GET(req: NextRequest) {
  const project = req.nextUrl.searchParams.get("project");
  if (!project) {
    return NextResponse.json({ error: "Missing required query param: project" }, { status: 400 });
  }

  try {
    const epics = await getEpics(project);
    return NextResponse.json(epics);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[/api/jira/epics]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
