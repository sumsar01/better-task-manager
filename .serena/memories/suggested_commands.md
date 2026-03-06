# Suggested Commands

## Development
```bash
bun run dev          # Start dev server (http://localhost:3000)
bun run build        # Production build
bun run lint         # ESLint
bunx tsc --noEmit    # TypeScript type check
```

## Quality Gates (run before closing issues)
```bash
bun run lint && bunx tsc --noEmit && bun run build
```

## Beads Issue Tracking
```bash
bd ready --json                    # Find available work
bd show <id> --json                # View issue details
bd update <id> --claim --json      # Claim work
bd close <id> --reason "Done" --json  # Complete work
bd list --status=in_progress --json  # Active work
```
