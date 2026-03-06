"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { BeadsRepo } from "@/lib/beads";
import ChevronDown from "@/components/icons/ChevronDown";
import ErrorBanner from "@/components/ErrorBanner";

export default function BeadsPicker() {
  const router = useRouter();

  const [repos, setRepos] = useState<BeadsRepo[]>([]);
  const [selectedRepo, setSelectedRepo] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/beads/repos")
      .then((r) => {
        if (!r.ok) throw new Error(`Failed to load repos (${r.status})`);
        return r.json();
      })
      .then((data: BeadsRepo[]) => {
        setRepos(data);
        if (data.length === 1) {
          setSelectedRepo(data[0].name);
        }
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  function handleViewGraph() {
    if (!selectedRepo) return;
    router.push(`/beads/graph/${encodeURIComponent(selectedRepo)}`);
  }

  return (
    <div className="flex flex-col gap-4 w-full">
      {error && <ErrorBanner message={error} />}

      {/* Repository selector */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
          Repository
        </label>
        <div className="relative">
          <select
            className="w-full appearance-none border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-violet-500 disabled:opacity-40 disabled:bg-slate-50 disabled:cursor-not-allowed cursor-pointer transition pr-8 shadow-sm"
            value={selectedRepo}
            onChange={(e) => setSelectedRepo(e.target.value)}
            disabled={loading}
          >
            <option value="">
              {loading ? "Loading…" : repos.length === 0 ? "No repos found" : "Select a repository"}
            </option>
            {repos.map((r) => (
              <option key={r.name} value={r.name}>
                {r.name}
              </option>
            ))}
          </select>
          <ChevronDown />
        </div>
      </div>

      {/* CTA */}
      <div className="mt-1">
        <button
          onClick={handleViewGraph}
          disabled={!selectedRepo}
          className="relative w-full py-2.5 px-4 rounded-xl text-sm font-semibold text-white transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none hover:enabled:scale-[1.02] hover:enabled:brightness-110 cursor-pointer"
          style={{
            background: selectedRepo
              ? "linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)"
              : "#94a3b8",
            boxShadow: selectedRepo ? "0 4px 14px rgba(124,58,237,0.4)" : "none",
          }}
        >
          View Task Graph →
        </button>
      </div>
    </div>
  );
}
