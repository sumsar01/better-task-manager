"use client";

import { Suspense, useEffect, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { ErrorState, Skeleton, Toolbar } from "@/components/milestone/MilestoneChrome";
import { DeveloperMode, LeadMode, ModeToggle } from "@/components/milestone/MyWork";
import { useProgram } from "@/components/milestone/ProgramShell";
import { useMyWorkMode, useSavedTeam } from "@/hooks/useMyWorkPrefs";
import { useMyWork } from "@/hooks/useMyWork";
import { defaultTeam, teamNames } from "@/lib/myWork";

function MyWorkSkeleton() {
  return (
    <div role="status" aria-label="Loading your work" className="flex flex-col gap-3">
      <Skeleton className="h-4 w-40" />
      {Array.from({ length: 8 }, (_, i) => (
        <Skeleton key={i} className="h-8 w-full rounded-lg" />
      ))}
    </div>
  );
}

function MyWorkView() {
  const { program, projectKey, href, jiraBaseUrl } = useProgram();
  const fixture = useSearchParams().get("fixture");
  const work = useMyWork(projectKey, fixture, program.data);
  const [mode, setMode] = useMyWorkMode();
  const [savedTeam, chooseTeam] = useSavedTeam(projectKey);

  const teams = useMemo(() => teamNames(work.entries), [work.entries]);
  const team = savedTeam && teams.includes(savedTeam) ? savedTeam : defaultTeam(work.entries, work.me);
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const nav = useMemo(() => ({ milestoneHref: href.milestone, jiraBaseUrl }), [href, jiraBaseUrl]);

  useEffect(() => {
    document.title = "My work";
  }, []);

  const waiting = (program.loading && !program.data) || (program.data && work.loading) || !work.meKnown;
  const nothingLoaded = work.entries.length === 0 && work.failed.length > 0;

  return (
    <>
      <Toolbar title="My work" subtitle={program.data?.project.name ?? projectKey} center={<ModeToggle mode={mode} onChange={setMode} />} />
      {program.error && !program.data ? (
        <ErrorState message={program.error} onRetry={program.retry} what="the delivery program" projectKey={projectKey} />
      ) : nothingLoaded ? (
        <ErrorState message={work.failed[0]?.message ?? "Unknown error"} onRetry={program.refresh} what="your work" projectKey={projectKey} />
      ) : (
        <main className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-[900px] px-6 pb-16 pt-7 sm:px-8">
            {waiting ? (
              <MyWorkSkeleton />
            ) : work.noReleases ? (
              <p className="px-2 text-[13px] text-[var(--ms-label-3)]">No open milestones in {projectKey}.</p>
            ) : (
              <>
                {work.failed.length > 0 && (
                  <p role="status" className="mb-6 rounded-lg bg-[var(--ms-warn-fill)] px-3 py-2 text-[12.5px] text-[var(--ms-warn-text)]">
                    Couldn’t load {work.failed.map((f) => f.name).join(", ")}. Showing the rest.
                  </p>
                )}
                {!fixture && !work.me && (
                  <p role="status" className="mb-6 rounded-lg bg-[var(--ms-warn-fill)] px-3 py-2 text-[12.5px] text-[var(--ms-warn-text)]">
                    Couldn’t tell who you are, so nothing is marked as yours. Sign in again to fix this.
                  </p>
                )}
                {mode === "developer" ? (
                  <DeveloperMode entries={work.entries} me={work.me} team={team} onTeamChange={chooseTeam} nav={nav} />
                ) : (
                  <LeadMode entries={work.entries} me={work.me} today={today} nav={nav} />
                )}
              </>
            )}
          </div>
        </main>
      )}
    </>
  );
}

export default function MyWorkPage() {
  return (
    <Suspense fallback={null}>
      <MyWorkView />
    </Suspense>
  );
}
