import puppeteer, { type Browser, type Page } from "puppeteer";
import fs from "fs";
import path from "path";

export const BASE_URL = "http://localhost:3000";
export const OUTPUT_DIR = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  "output"
);

export async function launchBrowser(): Promise<Browser> {
  return puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
    defaultViewport: { width: 1440, height: 900 },
  });
}

export async function screenshot(page: Page, name: string): Promise<string> {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }
  const filePath = path.join(OUTPUT_DIR, `${name}.png`);
  await page.screenshot({ path: filePath, fullPage: true });
  console.log(`  ✓ Saved: tests/screenshots/output/${name}.png`);
  return filePath;
}

/**
 * Waits for a CSS selector to appear, with a descriptive timeout error.
 */
export async function waitForSelector(
  page: Page,
  selector: string,
  timeoutMs = 15_000
): Promise<void> {
  await page.waitForSelector(selector, { timeout: timeoutMs });
}

/**
 * Waits for the React Flow canvas to be rendered and populated with nodes.
 */
export async function waitForGraph(page: Page, timeoutMs = 30_000): Promise<void> {
  // React Flow renders a .react-flow__renderer once the canvas is ready
  await page.waitForSelector(".react-flow__renderer", { timeout: timeoutMs });
  // Then wait for at least one node to appear
  await page.waitForSelector(".react-flow__node", { timeout: timeoutMs });
}

/**
 * Load .env.local and return the Jira credentials.
 */
export interface JiraConfig {
  baseUrl: string;
  email: string;
  apiToken: string;
}

export function loadJiraConfig(): JiraConfig {
  const envPath = path.resolve(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) {
    throw new Error(".env.local not found — copy .env.local.example and fill in credentials.");
  }
  const raw = fs.readFileSync(envPath, "utf-8");
  const vars: Record<string, string> = {};
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const value = trimmed.slice(eqIdx + 1).trim();
    vars[key] = value;
  }
  const baseUrl = vars["JIRA_BASE_URL"];
  const email = vars["JIRA_EMAIL"];
  const apiToken = vars["JIRA_API_TOKEN"];
  if (!baseUrl || !email || !apiToken) {
    throw new Error(
      "Missing Jira credentials in .env.local — need JIRA_BASE_URL, JIRA_EMAIL, JIRA_API_TOKEN."
    );
  }
  return { baseUrl, email, apiToken };
}

/**
 * Fetches the first available epic key from Jira.
 */
export async function fetchFirstEpicKey(config: JiraConfig): Promise<string> {
  const auth = Buffer.from(`${config.email}:${config.apiToken}`).toString("base64");
  const url = `${config.baseUrl}/rest/api/3/search/jql?jql=issuetype%3DEpic%20ORDER%20BY%20created%20DESC&maxResults=1&fields=key,summary`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Basic ${auth}`,
      Accept: "application/json",
    },
  });
  if (!res.ok) {
    throw new Error(`Jira API error ${res.status}: ${await res.text()}`);
  }
  const data = (await res.json()) as { issues: Array<{ key: string; fields: { summary: string } }> };
  if (!data.issues || data.issues.length === 0) {
    throw new Error("No epics found in Jira.");
  }
  const epic = data.issues[0];
  console.log(`  ℹ Using epic: ${epic.key} — ${epic.fields.summary}`);
  return epic.key;
}
