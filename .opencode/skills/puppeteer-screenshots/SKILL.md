---
name: puppeteer-screenshots
description: Take Puppeteer screenshots of the frontend for visual testing
license: MIT
compatibility: opencode
metadata:
  audience: developers
  workflow: visual-testing
---

## Purpose

Take headless Chromium screenshots of any frontend page using Puppeteer. Use
this skill when asked to visually test the UI, capture page state, verify
layout, or add screenshot coverage for a new page.

## Running screenshots

```bash
bun run screenshot          # all pages (home + graph)
bun run screenshot home     # landing page only
bun run screenshot graph    # graph page only (requires Jira env vars)
```

The dev server on `localhost:3000` starts automatically if it is not already
running, and is stopped again when the script finishes. If it was already
running, it is left untouched.

Outputs land in `tests/screenshots/output/*.png` (gitignored). The directory
itself is tracked via `.gitkeep`.

## File layout

```
tests/screenshots/
  helpers.ts   — shared utils (launchBrowser, screenshot, waitForSelector,
                  waitForGraph, loadJiraConfig, fetchFirstEpicKey)
  home.ts      — screenshots the / landing page
  graph.ts     — fetches a real Jira epic from .env.local, screenshots
                  /graph/[epicKey]
  run.ts       — entry point; auto-starts dev server, runs selected scripts
  output/      — PNG outputs (gitignored)
```

## Adding a new page

1. Create `tests/screenshots/<page>.ts` following the pattern of `home.ts`:

```ts
import { launchBrowser, screenshot, waitForSelector, BASE_URL } from "./helpers.js";

export async function screenshot<Page>(): Promise<void> {
  console.log("\n[<page>] Capturing...");
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    await page.goto(`${BASE_URL}/<path>`, { waitUntil: "networkidle2" });
    await waitForSelector(page, "<key-selector>", 10_000);
    await screenshot(page, "<page>");
  } finally {
    await browser.close();
  }
}
```

2. Import and call it from `run.ts`:

```ts
import { screenshot<Page> } from "./<page>.js";
// add a flag and call it in main():
const run<Page> = args.length === 0 || args.includes("<page>");
if (run<Page>) await screenshot<Page>();
```

3. Run `bun run screenshot <page>` to verify.

## Wait helpers

| Helper | Use when |
|---|---|
| `waitForSelector(page, selector, timeoutMs?)` | Any page — wait for a specific DOM element |
| `waitForGraph(page, timeoutMs?)` | Graph page — waits for `.react-flow__renderer` then `.react-flow__node` |

For graph-like pages that animate into place, add a short settle delay after
the wait:

```ts
await waitForGraph(page);
await new Promise((resolve) => setTimeout(resolve, 1_500));
```

## Viewport & browser settings

Default: **1440 × 900**, headless. Defined in `helpers.ts:launchBrowser`.
Change `defaultViewport` there to adjust for all screenshots at once, or call
`page.setViewport(...)` in an individual script for a one-off override.

## Jira dependency (graph page only)

`graph.ts` reads `JIRA_BASE_URL`, `JIRA_EMAIL`, and `JIRA_API_TOKEN` from
`.env.local` at project root (via `loadJiraConfig()`), then calls the Jira
REST API to fetch the most-recently-created epic. No hardcoded keys needed.
If `.env.local` is missing or credentials are incomplete, the script exits with
a clear error message.
