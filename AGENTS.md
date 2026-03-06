# Agent Instructions

This is a **Next.js 16 App Router** application that visualizes Jira task dependency graphs using React Flow and dagre layout. Package manager: **Bun**.

## Build, Lint & Type Check

```bash
bun run dev          # Start dev server (http://localhost:3000)
bun run build        # Production build
bun run lint         # ESLint (flat config, eslint-config-next)
bunx tsc --noEmit    # TypeScript type check (no test runner configured yet)
```

> **No test framework is installed.** If adding tests, Vitest is the idiomatic choice for Next.js/Bun projects. To run a single Vitest test: `bunx vitest run path/to/file.test.ts`.

## Code Style

### TypeScript
- **Strict mode is enabled** — no `any`, no implicit `any`, no non-null assertions without justification.
- Use `import type { ... }` for type-only imports — enforced by `eslint-config-next/typescript`.
- Prefer `interface` for object shapes / props; `type` for unions, intersections, and aliases.
- Use TypeScript generics where appropriate (e.g., `useState<JiraProject[]>([])`).

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
| Utility/lib files | camelCase | `buildGraph.ts`, `jira.ts` |
| Components & types | PascalCase | `IssueNode`, `JiraProject`, `GraphData` |
| Functions & variables | camelCase | `buildGraph`, `getEpics`, `authHeader` |
| Constants | SCREAMING_SNAKE_CASE | `NODE_WIDTH`, `STATUS_COLORS` |

### Formatting
- Double quotes for strings and JSX attributes.
- Trailing semicolons everywhere.
- Arrow functions for callbacks and inline handlers; `function` keyword for top-level named functions.
- No Prettier config — formatting is not enforced beyond ESLint rules.

### Error Handling
- API route handlers (`app/api/**/route.ts`) should return typed `NextResponse` with appropriate HTTP status codes.
- Jira API errors should surface as `{ error: string }` JSON responses to the client.
- Client-side fetch errors should be caught and stored in component state for display.

## React & Next.js Patterns

### Server vs. Client Components
- Add `"use client"` at the **top of the file** (before imports) for interactive components.
- Client components: `EpicPicker.tsx`, `GraphView.tsx`, `IssueNode.tsx`, `app/graph/[epicKey]/page.tsx`.
- Server components (no directive needed): `app/page.tsx`, `app/layout.tsx`, `Legend.tsx`.
- Keep server components lean — no hooks, no browser APIs.

### API Routes
- Located at `app/api/**/route.ts` using named exports (`GET`, `POST`, etc.).
- Validate query params at the top of the handler; return `400` for missing required params.
- All Jira credentials come from `process.env` — never hardcode or log them.

### Performance
- Use `memo()` for expensive pure components (see `IssueNode.tsx`).
- Use `useCallback` and `useMemo` to stabilize references passed to React Flow.
- Prefer local `useState` — no global state library is used.

### Data Fetching
- Data is fetched client-side via `fetch()` in `useEffect` hooks (no SWR, React Query, or Server Actions).
- Typed response shapes are defined in `lib/jira.ts` — always use them.

## Project Layout

```
app/           # Next.js App Router (pages, layouts, API routes)
  api/jira/    # Jira proxy routes (epics, issues, projects)
  graph/       # Dynamic graph page [epicKey]
components/    # Reusable React components
lib/           # Pure utility modules (Jira client, graph builder)
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
