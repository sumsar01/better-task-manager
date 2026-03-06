import { NextRequest } from "next/server";
import { getEpics, getEpicChildren, getSubtasks } from "@/lib/jira";
import type { JiraIssue } from "@/lib/jira";
import { pLimit } from "@/lib/concurrency";

// Allow up to 60 seconds on Vercel Pro / similar platforms.
// Streaming responses are not subject to the same hard timeout as regular
// serverless functions, but setting this prevents premature kills.
export const maxDuration = 60;
export const dynamic = "force-dynamic";

/** Timeout (ms) for expanding a single epic's children + subtasks. */
const EPIC_EXPAND_TIMEOUT_MS = 12_000;

/** Max epics expanded concurrently. */
const EXPAND_CONCURRENCY = 5;

// ── NDJSON message types ──────────────────────────────────────────────────────

interface EpicsMessage {
  type: "epics";
  issues: JiraIssue[];
  total: number;
}

interface ChildrenMessage {
  type: "children";
  epicKey: string;
  issues: JiraIssue[];
  expanded: number;
  total: number;
}

interface ErrorMessage {
  type: "error";
  epicKey: string;
  error: string;
}

interface DoneMessage {
  type: "done";
}

type StreamMessage = EpicsMessage | ChildrenMessage | ErrorMessage | DoneMessage;

function encode(msg: StreamMessage): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(msg) + "\n");
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const project = req.nextUrl.searchParams.get("project");
  if (!project) {
    return new Response(JSON.stringify({ error: "Missing required query param: project" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const stream = new ReadableStream({
    async start(controller) {
      try {
        // ── 1. Fetch all open epics ───────────────────────────────────────────
        const epics = await getEpics(project);

        // Send epics immediately so the client can render the graph skeleton
        controller.enqueue(
          encode({ type: "epics", issues: epics, total: epics.length }),
        );

        // ── 2. Expand each epic's children + subtasks (throttled) ─────────────
        let expanded = 0;

        await pLimit(
          epics.map((epic) => async () => {
            const signal = AbortSignal.timeout(EPIC_EXPAND_TIMEOUT_MS);

            try {
              const children = await getEpicChildren(epic.key, signal);
              const nonSubtaskKeys = children
                .filter((i) => !i.fields.issuetype.subtask)
                .map((i) => i.key);
              const subtasks = await getSubtasks(nonSubtaskKeys, signal);

              expanded++;
              controller.enqueue(
                encode({
                  type: "children",
                  epicKey: epic.key,
                  issues: [...children, ...subtasks],
                  expanded,
                  total: epics.length,
                }),
              );
            } catch (err) {
              expanded++;
              const isTimeout =
                err instanceof Error &&
                (err.name === "AbortError" || err.name === "TimeoutError");
              const message = isTimeout
                ? `Timed out after ${EPIC_EXPAND_TIMEOUT_MS / 1000}s`
                : err instanceof Error
                  ? err.message
                  : "Unknown error";

              console.warn(`[project-stream] Failed to expand ${epic.key}: ${message}`);
              controller.enqueue(
                encode({ type: "error", epicKey: epic.key, error: message }),
              );
            }
          }),
          EXPAND_CONCURRENCY,
        );

        controller.enqueue(encode({ type: "done" }));
      } catch (err) {
        // Top-level failure (e.g. getEpics itself failed) — send an error line
        // then close. The client will treat this as a fatal error.
        const message = err instanceof Error ? err.message : "Unknown error";
        console.error(`[project-stream] Fatal error for project ${project}: ${message}`);
        controller.enqueue(encode({ type: "error", epicKey: "", error: message }));
        controller.enqueue(encode({ type: "done" }));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      // Prevent proxy/CDN buffering — essential for streaming to work
      "X-Accel-Buffering": "no",
      "Cache-Control": "no-cache, no-store",
      "Transfer-Encoding": "chunked",
    },
  });
}
