"use client";

import Link from "next/link";
import { useEffect, useState, useCallback } from "react";
import type { MaskedConfig } from "@/app/api/config/route";
import GearIcon from "@/components/icons/GearIcon";
import BackgroundBlobs from "@/components/BackgroundBlobs";

type TestState =
  | { status: "idle" }
  | { status: "testing" }
  | { status: "success"; displayName: string }
  | { status: "error"; message: string };

type SaveState =
  | { status: "idle" }
  | { status: "saving" }
  | { status: "success" }
  | { status: "error"; message: string };

// ── Reusable sub-components ───────────────────────────────────────────────────

function SourceBadge({
  source,
  envLabel,
  fileLabel,
}: {
  source: "env" | "file" | "none";
  envLabel: string;
  fileLabel: string;
}) {
  if (source === "none") return null;
  return (
    <div
      className={`flex items-center gap-2 text-xs font-medium px-3 py-2 rounded-lg ${
        source === "env"
          ? "bg-amber-50 text-amber-700 border border-amber-200"
          : "bg-green-50 text-green-700 border border-green-200"
      }`}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${source === "env" ? "bg-amber-500" : "bg-green-500"}`}
      />
      {source === "env" ? envLabel : fileLabel}
    </div>
  );
}

function SaveSuccess({ message }: { message: string }) {
  return (
    <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-xl px-3.5 py-2.5">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="flex-shrink-0" aria-hidden="true">
        <circle cx="8" cy="8" r="7" fill="#22c55e" />
        <path d="M5 8l2 2 4-4" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {message}
    </div>
  );
}

function SaveError({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-3.5 py-2.5">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="flex-shrink-0 mt-0.5" aria-hidden="true">
        <circle cx="8" cy="8" r="7" fill="#ef4444" />
        <path d="M8 5v3M8 11v.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
      {message}
    </div>
  );
}

function SectionDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 pt-2">
      <div className="flex-1 h-px bg-slate-100" />
      <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{label}</span>
      <div className="flex-1 h-px bg-slate-100" />
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  // Jira state
  const [baseUrl, setBaseUrl] = useState("");
  const [email, setEmail] = useState("");
  const [apiToken, setApiToken] = useState("");
  const [tokenPlaceholder, setTokenPlaceholder] = useState("Paste your API token");
  const [jiraSource, setJiraSource] = useState<"env" | "file" | "none">("none");

  // Beads state
  const [beadsReposDir, setBeadsReposDir] = useState("");
  const [beadsSource, setBeadsSource] = useState<"env" | "file" | "none">("none");

  const [loading, setLoading] = useState(true);

  // Jira-specific feedback
  const [testState, setTestState] = useState<TestState>({ status: "idle" });
  const [jiraSaveState, setJiraSaveState] = useState<SaveState>({ status: "idle" });

  // Beads-specific feedback
  const [beadsSaveState, setBeadsSaveState] = useState<SaveState>({ status: "idle" });

  const loadConfig = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/config");
      if (!res.ok) return;
      const data = (await res.json()) as MaskedConfig;
      setBaseUrl(data.baseUrl);
      setEmail(data.email);
      setJiraSource(data.jiraSource);
      if (data.hasApiToken) {
        setApiToken("");
        setTokenPlaceholder(data.apiTokenMasked || "Token already saved");
      }
      setBeadsReposDir(data.beadsReposDir);
      setBeadsSource(data.beadsSource);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadConfig();
  }, [loadConfig]);

  // ── Jira handlers ──────────────────────────────────────────────────────────

  function resetJiraFeedback() {
    setTestState({ status: "idle" });
    setJiraSaveState({ status: "idle" });
  }

  async function handleTest() {
    setTestState({ status: "testing" });
    try {
      const res = await fetch("/api/config/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ baseUrl, email, apiToken }),
      });
      const data = (await res.json()) as
        | { success: true; displayName: string }
        | { success: false; error: string };
      if (data.success) {
        setTestState({ status: "success", displayName: data.displayName });
      } else {
        setTestState({ status: "error", message: data.error });
      }
    } catch (err) {
      setTestState({ status: "error", message: err instanceof Error ? err.message : "Network error" });
    }
  }

  async function handleJiraSave() {
    setJiraSaveState({ status: "saving" });
    setTestState({ status: "idle" });
    try {
      const res = await fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ baseUrl, email, apiToken }),
      });
      const data = (await res.json()) as MaskedConfig | { error: string };
      if (!res.ok) {
        setJiraSaveState({ status: "error", message: "error" in data ? data.error : "Failed to save." });
        return;
      }
      const saved = data as MaskedConfig;
      setJiraSaveState({ status: "success" });
      setJiraSource(saved.jiraSource);
      if (saved.hasApiToken) {
        setApiToken("");
        setTokenPlaceholder(saved.apiTokenMasked || "Token saved");
      }
    } catch (err) {
      setJiraSaveState({ status: "error", message: err instanceof Error ? err.message : "Network error" });
    }
  }

  // ── Beads handlers ─────────────────────────────────────────────────────────

  async function handleBeadsSave() {
    setBeadsSaveState({ status: "saving" });
    try {
      const res = await fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ beadsReposDir }),
      });
      const data = (await res.json()) as MaskedConfig | { error: string };
      if (!res.ok) {
        setBeadsSaveState({ status: "error", message: "error" in data ? data.error : "Failed to save." });
        return;
      }
      const saved = data as MaskedConfig;
      setBeadsSaveState({ status: "success" });
      setBeadsSource(saved.beadsSource);
      setBeadsReposDir(saved.beadsReposDir);
    } catch (err) {
      setBeadsSaveState({ status: "error", message: err instanceof Error ? err.message : "Network error" });
    }
  }

  // ── Derived flags ──────────────────────────────────────────────────────────

  const canJiraSubmit = baseUrl.trim() !== "" && email.trim() !== "" && apiToken.trim() !== "";
  const canBeadsSave = beadsReposDir.trim() !== "";
  const isTesting = testState.status === "testing";
  const isJiraSaving = jiraSaveState.status === "saving";
  const isBeadsSaving = beadsSaveState.status === "saving";

  return (
    <main className="min-h-screen bg-slate-50 flex flex-col items-center justify-center px-4 py-12 relative overflow-hidden">
      {/* Gradient blobs */}
      <BackgroundBlobs topColor="#e0e7ff" bottomColor="#c7d2fe" />

      <div className="relative w-full max-w-md">
        {/* Header */}
        <div className="mb-8">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 transition-colors mb-6"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M10 12L6 8l4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Back to home
          </Link>

          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center shadow-md shadow-indigo-200 flex-shrink-0">
              <GearIcon size={18} className="text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900 tracking-tight">Settings</h1>
              <p className="text-sm text-slate-500">Configure your Jira and Beads connections</p>
            </div>
          </div>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xl shadow-slate-200/50 overflow-hidden">
          {loading ? (
            <div className="px-6 py-10 flex items-center justify-center">
              <div className="w-5 h-5 rounded-full border-2 border-indigo-300 border-t-indigo-600 animate-spin" />
            </div>
          ) : (
            <div className="px-6 py-6 space-y-5">

              {/* ── Jira section ── */}
              <SectionDivider label="Jira" />

              <SourceBadge
                source={jiraSource}
                envLabel="Credentials are set via environment variables and take priority over values below."
                fileLabel="Credentials are loaded from the saved config file."
              />

              {/* Base URL */}
              <div className="space-y-1.5">
                <label htmlFor="baseUrl" className="block text-sm font-medium text-slate-700">
                  Jira Base URL
                </label>
                <input
                  id="baseUrl"
                  type="url"
                  value={baseUrl}
                  onChange={(e) => { setBaseUrl(e.target.value); resetJiraFeedback(); }}
                  placeholder="https://yourorg.atlassian.net"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
                />
              </div>

              {/* Email */}
              <div className="space-y-1.5">
                <label htmlFor="email" className="block text-sm font-medium text-slate-700">
                  Email address
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); resetJiraFeedback(); }}
                  placeholder="you@yourorg.com"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
                />
              </div>

              {/* API Token */}
              <div className="space-y-1.5">
                <label htmlFor="apiToken" className="block text-sm font-medium text-slate-700">
                  API Token
                </label>
                <input
                  id="apiToken"
                  type="password"
                  value={apiToken}
                  onChange={(e) => { setApiToken(e.target.value); resetJiraFeedback(); }}
                  placeholder={tokenPlaceholder}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition font-mono"
                />
                <p className="text-xs text-slate-400">
                  Get your API token from{" "}
                  <a
                    href="https://id.atlassian.com/manage-profile/security/api-tokens"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-indigo-500 hover:text-indigo-700 underline underline-offset-2"
                  >
                    id.atlassian.com/manage-profile/security/api-tokens
                  </a>
                </p>
              </div>

              {/* Test result */}
              {testState.status === "success" && (
                <SaveSuccess message={`Connected as ${testState.displayName}`} />
              )}
              {testState.status === "error" && (
                <SaveError message={testState.message} />
              )}

              {jiraSaveState.status === "success" && <SaveSuccess message="Jira settings saved." />}
              {jiraSaveState.status === "error" && <SaveError message={jiraSaveState.message} />}

              {/* Jira actions */}
              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={handleTest}
                  disabled={!canJiraSubmit || isTesting || isJiraSaving}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50 hover:border-slate-300 disabled:opacity-40 disabled:cursor-not-allowed transition"
                >
                  {isTesting ? (
                    <><span className="w-3.5 h-3.5 rounded-full border-2 border-slate-300 border-t-slate-600 animate-spin" />Testing…</>
                  ) : "Test Connection"}
                </button>
                <button
                  type="button"
                  onClick={handleJiraSave}
                  disabled={!canJiraSubmit || isJiraSaving || isTesting}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition shadow-sm shadow-indigo-200"
                >
                  {isJiraSaving ? (
                    <><span className="w-3.5 h-3.5 rounded-full border-2 border-indigo-300 border-t-white animate-spin" />Saving…</>
                  ) : "Save Jira Settings"}
                </button>
              </div>

              {/* ── Beads section ── */}
              <SectionDivider label="Beads" />

              <SourceBadge
                source={beadsSource}
                envLabel="Repos directory is set via the BEADS_REPOS_BASE_DIR environment variable and takes priority."
                fileLabel="Repos directory is loaded from the saved config file."
              />

              {/* Repos base directory */}
              <div className="space-y-1.5">
                <label htmlFor="beadsReposDir" className="block text-sm font-medium text-slate-700">
                  Repos base directory
                </label>
                <input
                  id="beadsReposDir"
                  type="text"
                  value={beadsReposDir}
                  onChange={(e) => { setBeadsReposDir(e.target.value); setBeadsSaveState({ status: "idle" }); }}
                  placeholder="~/git/github.com/yourorg"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent transition font-mono"
                />
                <p className="text-xs text-slate-400">
                  The folder that contains your git repos. TaskGraph will scan it for directories
                  that have a <code className="font-mono bg-slate-100 px-1 rounded">.beads/</code> subfolder.
                  You can use <code className="font-mono bg-slate-100 px-1 rounded">~</code> for your home directory.
                </p>
              </div>

              {beadsSaveState.status === "success" && <SaveSuccess message="Beads settings saved." />}
              {beadsSaveState.status === "error" && <SaveError message={beadsSaveState.message} />}

              {/* Beads actions */}
              <div className="flex justify-end pt-1">
                <button
                  type="button"
                  onClick={handleBeadsSave}
                  disabled={!canBeadsSave || isBeadsSaving}
                  className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-violet-600 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-40 disabled:cursor-not-allowed transition shadow-sm shadow-violet-200"
                >
                  {isBeadsSaving ? (
                    <><span className="w-3.5 h-3.5 rounded-full border-2 border-violet-300 border-t-white animate-spin" />Saving…</>
                  ) : "Save Beads Settings"}
                </button>
              </div>

            </div>
          )}
        </div>

        <p className="mt-4 text-center text-xs text-slate-400">
          Settings are stored in{" "}
          <code className="font-mono bg-slate-100 px-1 py-0.5 rounded">.jira-config.json</code>{" "}
          in the project folder and are excluded from git.
        </p>
      </div>
    </main>
  );
}
