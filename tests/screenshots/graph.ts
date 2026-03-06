import {
  launchBrowser,
  screenshot,
  waitForGraph,
  loadJiraConfig,
  fetchFirstEpicKey,
  BASE_URL,
} from "./helpers.js";

export async function screenshotGraph(): Promise<void> {
  console.log("\n[graph] Loading Jira config...");
  const config = loadJiraConfig();

  console.log("[graph] Fetching first epic from Jira...");
  const epicKey = await fetchFirstEpicKey(config);

  console.log(`[graph] Capturing graph page for ${epicKey}...`);
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();

    // Intercept failed API calls and surface them clearly
    page.on("response", (response) => {
      const url = response.url();
      if (url.includes("/api/jira/") && !response.ok()) {
        console.warn(`  ⚠ API call failed (${response.status()}): ${url}`);
      }
    });

    await page.goto(`${BASE_URL}/graph/${epicKey}`, { waitUntil: "networkidle2" });

    // Wait for the graph canvas and at least one node to render
    await waitForGraph(page, 30_000);

    // Extra settle time so layout animations complete
    await new Promise((resolve) => setTimeout(resolve, 1_500));

    await screenshot(page, `graph-${epicKey.toLowerCase()}`);
  } finally {
    await browser.close();
  }
}
