import type { JiraIssue } from "@/lib/jira";

// ── NDJSON message types shared between the project-stream API route
// and the project graph page client. ─────────────────────────────────────────

export interface EpicsMessage {
  type: "epics";
  issues: JiraIssue[];
  total: number;
}

export interface ChildrenMessage {
  type: "children";
  epicKey: string;
  issues: JiraIssue[];
  expanded: number;
  total: number;
}

export interface ErrorMessage {
  type: "error";
  epicKey: string;
  error: string;
}

export interface DoneMessage {
  type: "done";
}

export type StreamMessage = EpicsMessage | ChildrenMessage | ErrorMessage | DoneMessage;
