import { launchBrowser, screenshot, waitForSelector, BASE_URL } from "./helpers.js";

export async function screenshotHome(): Promise<void> {
  console.log("\n[home] Capturing landing page...");
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    await page.goto(`${BASE_URL}/`, { waitUntil: "networkidle2" });
    // Wait for the EpicPicker selects or the CTA button to confirm the page loaded
    await waitForSelector(page, "select, button", 10_000);
    await screenshot(page, "home");
  } finally {
    await browser.close();
  }
}
