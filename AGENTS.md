# Agent Instructions

This is a **Next.js 16 App Router** application (React 19) that visualizes Jira task dependency graphs using React Flow and ELK layout. Package manager: **Bun**.

## Build, Lint & Type Check

```bash
bun run dev          # Start dev server (http://localhost:3000)
bun run build        # Production build
bun run lint         # ESLint (flat config — eslint-config-next core-web-vitals + typescript)
bunx tsc --noEmit    # TypeScript type check
```

> **No unit test framework is installed.** If adding tests, Vitest is the idiomatic choice for Next.js/Bun projects. To run a single Vitest test: `bunx vitest run path/to/file.test.ts`.

### Screenshot / Visual Tests

```bash
bun run screenshot          # Take Puppeteer screenshots of all pages
bun run screenshot home     # Home page only
bun run screenshot graph    # Graph page only (requires Jira env vars)
```

The dev server is started automatically if nothing is listening on port 3000.
Screenshots are saved to `tests/screenshots/output/`.

## Code Style

### TypeScript
- **Strict mode is enabled** — no `any`, no implicit `any`, no non-null assertions without justification.
- Use `import type { ... }` for type-only imports — enforced by `eslint-config-next/typescript`.
- Prefer `interface` for object shapes / props; `type` for unions, intersections, and aliases.
- Use TypeScript generics where appropriate (e.g., `useState<JiraProject[]>([])`).
- Use `satisfies` for inline type assertions on object literals (see `buildGraph.ts`).

### Imports
- Use the `@/` path alias (maps to project root) for **cross-directory** imports:
  ```ts
  import { buildGraph } from "@/lib/buildGraph";
  import type { JiraIssue } from "@/lib/jira";
  ```
- Use **relative `./`** paths for same-directory imports:
  ```ts
  import IssueNode from "./IssueNode";
  ```
- Group imports: external libraries → internal `@/` aliases → relative `./`.

### Naming Conventions
| Entity | Convention | Example |
|---|---|---|
| React component files | PascalCase | `EpicPicker.tsx`, `GraphView.tsx` |
| Custom hook files | camelCase | `useIssuePoller.ts`, `useSecondsTick.ts` |
| Utility/lib files | camelCase | `buildGraph.ts`, `jira.ts` |
| Components & types | PascalCase | `IssueNode`, `JiraProject`, `GraphData` |
| Functions & variables | camelCase | `buildGraph`, `getEpics`, `authHeader` |
| Constants | SCREAMING_SNAKE_CASE | `NODE_WIDTH`, `STATUS_COLORS`, `POLL_INTERVAL_MS` |

### Formatting
- Double quotes for strings and JSX attributes.
- Trailing semicolons everywhere.
- Arrow functions for callbacks and inline handlers; `function` keyword for top-level named functions.
- No Prettier config — formatting is not enforced beyond ESLint rules.
- Numeric literals: use underscore separators for large numbers (e.g., `30_000`, `60_000`).

### Error Handling
- API route handlers (`app/api/**/route.ts`) should return typed `NextResponse` with appropriate HTTP status codes.
- Jira API errors should surface as `{ error: string }` JSON responses to the client.
- Client-side fetch errors should be caught and stored in component state for display.
- Background polling errors should be swallowed silently (do not interrupt the UI).
- Always narrow `unknown` catch values: `const message = err instanceof Error ? err.message : "Unknown error"`.

## React & Next.js Patterns

### Server vs. Client Components
- Add `"use client"` at the **top of the file** (before imports) for interactive components.
- Client components: `EpicPicker.tsx`, `GraphView.tsx`, `IssueNode.tsx`, `app/graph/[epicKey]/page.tsx`.
- Server components (no directive needed): `app/page.tsx`, `app/layout.tsx`, `Legend.tsx`.
- Keep server components lean — no hooks, no browser APIs.

### Custom Hooks
- Live in `hooks/` at the project root.
- `useIssuePoller` — fetches issues on mount, polls every 30 s, returns `{ issues, latestIssues, loading, error, lastUpdated }`. Use `issues` for the initial ELK layout and `latestIssues` for in-place diff patches.
- `useSecondsTick` — utility hook for second-resolution time displays.
- Always guard async state setters with a `isMountedRef` to avoid setting state on unmounted components.

### API Routes
- Located at `app/api/**/route.ts` using named exports (`GET`, `POST`, etc.).
- Validate query params at the top of the handler; return `400` for missing required params.
- All Jira credentials come from `process.env` — never hardcode or log them.

### Performance
- Use `memo()` for expensive pure components (see `IssueNode.tsx`).
- Use `useCallback` and `useMemo` to stabilize references passed to React Flow.
- Prefer local `useState` — no global state library is used.
- Define static objects (`nodeTypes`, `edgeTypes`, `FIT_VIEW_OPTIONS`) outside the component to avoid re-creation on render.

### Data Fetching
- Data is fetched client-side via `fetch()` in `useEffect` hooks (no SWR, React Query, or Server Actions).
- Typed response shapes are defined in `lib/jira.ts` — always use them.

## Graph / Layout Architecture

- Layout engine is **ELK** (eclipse layout kernel) via `elkjs`, not dagre. Dagre is a dependency but no longer used.
- `buildGraph(issues)` — async, runs a full ELK layout. Call once on initial load.
- `buildEdgesOnly(issues)` — synchronous, skips layout. Used in polling diff paths.
- When multiple epics are present, a two-level nested ELK layout is applied: children inside each epic group are laid out first, then epic groups are positioned at the top level.
- `diffGraph.ts` (`diffIssues`) computes added/removed/changed issues between poll snapshots. In-place patching preserves node positions.
- `POLYLINE` edge routing is used instead of `ORTHOGONAL` — the ORTHOGONAL router crashes on certain DAG topologies in `elk.bundled.js`.

## Project Layout

```
app/                              # Next.js App Router
  page.tsx                        # Home — project + epic picker
  layout.tsx                      # Root layout
  globals.css                     # Tailwind base styles
  api/jira/                       # Jira proxy routes (never expose credentials to client)
    projects/route.ts             # GET: list projects
    epics/route.ts                # GET ?project=KEY: epics in project
    issues/route.ts               # GET ?epic=KEY: issues in epic (2 levels)
    issues/project/route.ts       # GET ?project=KEY: issues scoped to a project
    issue/[key]/route.ts          # GET: single issue detail
  graph/[epicKey]/page.tsx        # Graph view for a selected epic
  graph/project/[projectKey]/     # Project-scoped graph view
components/                       # Reusable React components
  GraphView.tsx                   # React Flow canvas + polling integration
  IssueNode.tsx                   # Custom node card (key, summary, status, assignee)
  EpicGroupNode.tsx               # Epic container node
  TaskGroupNode.tsx               # Subtask group container node
  ElkEdge.tsx                     # Custom edge renderer using ELK bend points
  EpicPicker.tsx                  # Two-step project/epic dropdown
  IssueDetailPanel.tsx            # Side panel for issue details
  issue-detail/                   # Sub-components for the detail panel
  Legend.tsx                      # Edge color legend overlay (server component)
  LiveBadge.tsx                   # "Live" indicator badge
hooks/                            # Custom React hooks
  useIssuePoller.ts               # Fetch + 30 s polling for issues
  useSecondsTick.ts               # Second-resolution timer
lib/                              # Pure utility modules
  jira.ts                         # Typed Jira Cloud REST API helpers + response types
  buildGraph.ts                   # Jira issues → React Flow nodes + ELK layout
  diffGraph.ts                    # Issue diff for in-place graph patching
  concurrency.ts                  # Async concurrency utilities
  adfToHtml.ts                    # Atlassian Document Format → HTML converter
tests/
  screenshots/                    # Puppeteer visual regression snapshots
    run.ts                        # Screenshot runner entry point
    helpers.ts                    # Shared Puppeteer utilities
```

## Environment Variables

Copy `.env.local.example` to `.env.local` and fill in:
- `JIRA_BASE_URL` — e.g. `https://yourorg.atlassian.net`
- `JIRA_EMAIL` — Atlassian account email
- `JIRA_API_TOKEN` — API token from https://id.atlassian.com/manage-profile/security/api-tokens

## Non-Interactive Shell Commands

Shell commands like `cp`, `mv`, and `rm` may be aliased to `-i` (interactive) mode. **Always use force flags:**

```bash
cp -f source dest   mv -f source dest   rm -f file   rm -rf dir
```

<!-- BEGIN BEADS INTEGRATION -->
## Issue Tracking with bd (beads)

**IMPORTANT**: This project uses **bd (beads)** for ALL issue tracking. Do NOT use markdown TODOs, task lists, or other tracking methods.

```bash
bd ready --json                                             # Find available work
bd show <id> --json                                         # View issue details
bd create "Title" --description="Why" -t task -p 2 --json  # Create issue
bd update <id> --claim --json                               # Claim work atomically
bd close <id> --reason "Done" --json                        # Complete work
```

### Issue Types & Priorities
Types: `bug` · `feature` · `task` · `epic` · `chore`
Priorities: `0` Critical → `1` High → `2` Medium (default) → `3` Low → `4` Backlog

### Workflow
1. `bd ready` — find unblocked issues
2. `bd update <id> --claim` — claim atomically
3. Implement, test, lint
4. Discovered new work? `bd create "..." --deps discovered-from:<parent-id>`
5. `bd close <id> --reason "Done"`

### Rules
- Always use `--json` flag for programmatic use
- Link discovered work with `discovered-from` dependencies
- Do NOT create markdown TODO lists or use external trackers

## Session Completion

1. File issues for remaining work
2. Run quality gates: `bun run lint && bunx tsc --noEmit && bun run build`
3. Close finished issues: `bd close <id1> <id2> ...`
4. Commit and sync: `git add -A && git commit -m "..." && bd sync`

<!-- END BEADS INTEGRATION -->
