/**
 * Screenshot runner — takes visual snapshots of the frontend.
 *
 * Usage:
 *   bun run screenshot              # all pages
 *   bun run screenshot home         # home page only
 *   bun run screenshot graph        # graph page only (requires Jira env vars)
 *
 * The dev server is started automatically if nothing is listening on port 3000.
 * It is stopped again when all screenshots are done (unless it was already
 * running when the script started, in which case it is left untouched).
 */

import { spawn, type ChildProcess } from "child_process";
import { screenshotHome } from "./home.js";
import { screenshotGraph } from "./graph.js";
import { BASE_URL, OUTPUT_DIR } from "./helpers.js";

const DEV_SERVER_READY_RE = /ready|started server|localhost/i;
const DEV_START_TIMEOUT_MS = 60_000;

async function isServerRunning(): Promise<boolean> {
  try {
    const res = await fetch(BASE_URL, { signal: AbortSignal.timeout(2_000) });
    return res.ok || res.status < 500;
  } catch {
    return false;
  }
}

async function startDevServer(): Promise<ChildProcess> {
  return new Promise((resolve, reject) => {
    const deadline = setTimeout(
      () => reject(new Error(`Dev server did not start within ${DEV_START_TIMEOUT_MS / 1000}s.`)),
      DEV_START_TIMEOUT_MS
    );

    // Resolve the bun binary: prefer explicit env override, then the current
    // process executable (works when run via `bun run screenshot`), then PATH.
    const bunBin =
      process.env["BUN_BIN"] ??
      (process.execPath.includes("bun") ? process.execPath : "bun");

    const child = spawn(
      bunBin,
      ["run", "dev"],
      {
        cwd: process.cwd(),
        stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env, FORCE_COLOR: "0" },
      }
    );

    const onData = (data: Buffer) => {
      const line = data.toString();
      if (DEV_SERVER_READY_RE.test(line)) {
        clearTimeout(deadline);
        child.stdout?.off("data", onData);
        child.stderr?.off("data", onData);
        resolve(child);
      }
    };

    child.stdout?.on("data", onData);
    child.stderr?.on("data", onData);
    child.on("error", (err) => {
      clearTimeout(deadline);
      reject(err);
    });
  });
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const runHome = args.length === 0 || args.includes("home");
  const runGraph = args.length === 0 || args.includes("graph");

  console.log("=== Puppeteer Screenshot Runner ===");
  console.log(`Output directory: ${OUTPUT_DIR}`);

  // Check / start dev server
  const alreadyRunning = await isServerRunning();
  let devServer: ChildProcess | null = null;

  if (!alreadyRunning) {
    console.log("\nDev server not detected — starting it now (this may take ~30s)...");
    devServer = await startDevServer();
    // Give Next.js a brief moment to finish compiling the first request
    await new Promise((resolve) => setTimeout(resolve, 3_000));
    console.log("Dev server is ready.");
  } else {
    console.log("\nDev server already running — reusing it.");
  }

  try {
    if (runHome) await screenshotHome();
    if (runGraph) await screenshotGraph();

    console.log("\nAll screenshots saved to tests/screenshots/output/");
  } finally {
    if (devServer) {
      devServer.kill("SIGTERM");
      console.log("Dev server stopped.");
    }
  }
}

main().catch((err) => {
  console.error("\nFatal:", err instanceof Error ? err.message : err);
  process.exit(1);
});
