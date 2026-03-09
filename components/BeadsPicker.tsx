"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { BeadsRepo } from "@/lib/beads";
import ErrorBanner from "@/components/ErrorBanner";

const selectClass = cn(
  "w-full appearance-none border border-input rounded-xl px-3.5 py-2.5 text-sm bg-background text-foreground",
  "focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring",
  "disabled:opacity-40 disabled:bg-muted disabled:cursor-not-allowed",
  "cursor-pointer transition pr-8 shadow-sm"
);

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
            className={selectClass}
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
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-muted-foreground h-3.5 w-3.5" />
        </div>
      </div>

      {/* CTA */}
      <div className="mt-1">
        <Button
          onClick={handleViewGraph}
          disabled={!selectedRepo}
          className="w-full bg-secondary hover:bg-secondary/90 text-secondary-foreground"
        >
          View Task Graph →
        </Button>
      </div>
    </div>
  );
}
