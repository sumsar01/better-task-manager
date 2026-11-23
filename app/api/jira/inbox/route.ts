import { NextRequest, NextResponse } from "next/server";
import { DEFAULT_WINDOW_DAYS } from "@/lib/inbox";
import { buildFixtureInbox } from "@/lib/inboxFixture";
import { getInboxCached } from "@/lib/inboxJira";
import { fixtureName } from "@/lib/milestoneFixture";
import { getServerSession, persistRotatedToken } from "@/lib/session";

export const dynamic = "force-dynamic";

const PROJECT_KEY = /^[A-Za-z][A-Za-z0-9_]*$/;
const DAY_MS = 86_400_000;

function isAuthError(message: string): boolean {
  return message.includes("Not authenticated") || message.includes("Token refresh failed");
}

/**
 * GET ?project=LAD&since=ISO — what changed in the delivery space and the team
 * spaces of its unreleased milestones since `since` (default: the last week):
 * status moves, new dependencies, answered outside decisions, moved dates and
 * mentions of the signed-in user. Changes made by that user are left out.
 */
export async function GET(req: NextRequest) {
  const project = req.nextUrl.searchParams.get("project");
  if (!project || !PROJECT_KEY.test(project)) {
    return NextResponse.json({ error: "Missing or invalid query param: project" }, { status: 400 });
  }
  const sinceParam = req.nextUrl.searchParams.get("since");
  const since = sinceParam ? new Date(sinceParam) : new Date(Date.now() - DEFAULT_WINDOW_DAYS * DAY_MS);
  if (Number.isNaN(since.getTime())) {
    return NextResponse.json({ error: "Invalid query param: since (expected an ISO 8601 time)" }, { status: 400 });
  }

  if (fixtureName(req.nextUrl.searchParams.get("fixture"))) {
    return NextResponse.json(buildFixtureInbox(project, since), { headers: { "X-Cache": "fixture" } });
  }

  const started = performance.now();
  const session = await getServerSession();
  const priorRefreshToken = session.refreshToken;
  try {
    const { value, source } = await getInboxCached(project, since, session);
    await persistRotatedToken(session, priorRefreshToken);
    const ms = (performance.now() - started).toFixed(1);
    return NextResponse.json(value, {
      headers: { "X-Cache": source, "Server-Timing": `inbox;desc="${source}";dur=${ms}` },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: isAuthError(message) ? 401 : 500 });
  }
}
