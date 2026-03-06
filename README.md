# Jira Task Graph

A personal Next.js tool that visualizes Jira epic task dependencies as an interactive node graph. Pick a project and epic, then see all issues laid out in a top-to-bottom DAG — blockers at the top, leaf tasks at the bottom.

## Features

- Two-step picker: project → epic
- Interactive React Flow graph with dagre layout
- Nodes color-coded by status (To Do / In Progress / Done)
- Edges color-coded by relationship type (blocks / subtask / relates to)
- Click a node to highlight its direct connections
- Minimap + zoom controls

## Setup

### 1. Get a Jira API token

1. Go to https://id.atlassian.com/manage-profile/security/api-tokens
2. Click **Create API token**, give it a name, copy the token

### 2. Configure environment

```bash
cp .env.local.example .env.local
```

Edit `.env.local`:

```
JIRA_BASE_URL=https://your-org.atlassian.net
JIRA_EMAIL=you@example.com
JIRA_API_TOKEN=your_api_token_here
```

### 3. Install and run

```bash
bun install
bun dev
```

Open [http://localhost:3000](http://localhost:3000).

## Tech stack

| | |
|---|---|
| Framework | Next.js 15 (App Router) |
| Graph | React Flow (`@xyflow/react`) |
| Layout | Dagre |
| Styling | Tailwind CSS |
| Runtime | Bun |

## Project structure

```
app/
  page.tsx                      # Home — project + epic picker
  graph/[epicKey]/page.tsx      # Graph view for a selected epic
  api/jira/
    projects/route.ts           # GET: list all projects
    epics/route.ts              # GET ?project=KEY: epics in project
    issues/route.ts             # GET ?epic=KEY: all issues in epic (2 levels deep)
lib/
  jira.ts                       # Typed Jira Cloud REST API helpers
  buildGraph.ts                 # Converts Jira issues → React Flow nodes + edges
components/
  IssueNode.tsx                 # Custom node card (key, summary, status, assignee)
  GraphView.tsx                 # React Flow canvas with click-to-highlight
  EpicPicker.tsx                # Two-step project/epic dropdown
  Legend.tsx                    # Edge color legend overlay
```
