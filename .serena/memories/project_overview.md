# better-task-manager

Next.js 16 App Router application that visualizes Jira task dependency graphs using React Flow and dagre layout. Package manager: Bun.

## Tech Stack
- Next.js 16 App Router
- React Flow 12
- dagre (graph layout)
- TypeScript (strict mode)
- Tailwind CSS
- Bun (package manager)

## Project Layout
```
app/           # Next.js App Router (pages, layouts, API routes)
  api/jira/    # Jira proxy routes (epics, issues, projects)
  graph/       # Dynamic graph page [epicKey]
components/    # Reusable React components
lib/           # Pure utility modules (Jira client, graph builder)
```

## Key Files
- lib/buildGraph.ts — Core graph builder, all grouping/layout logic
- lib/jira.ts — JiraIssue types
- components/TaskGroupNode.tsx — Transparent group container with SVG bracket
- components/IssueNode.tsx — Issue node component
- components/GraphView.tsx — Main graph view
- app/graph/[epicKey]/page.tsx — Dynamic graph page
