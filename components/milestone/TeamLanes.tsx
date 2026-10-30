"use client";

import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Rows3 } from "lucide-react";
import { plural } from "@/lib/milestoneInsights";
import type { TeamEpic } from "@/lib/milestoneTypes";
import { teamLanes } from "@/lib/teamLanes";
import type { EpicLink } from "@/lib/teamLanes";
import { cn } from "@/lib/utils";
import { EmptyState, KeyChip, ProgressBar } from "./MilestoneBits";
import { useMilestone } from "./MilestoneContext";

// Every team's epics side by side, in the order their work can run: an epic
// sits one wave after the latest epic it waits on. The arrows are the
// "blocks" links between their remaining work items, rolled up to epics.

const LABEL_WIDTH = 176;
const COLUMN_WIDTH = 236;
/** Gap between wave columns; links run down it so they never cross a card. */
const GUTTER = 36;
/** How far a link between epics in the same wave bows out to the right. */
const LOOP_BOW = 14;
const CORNER = 6;

interface Box {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/**
 * Right out of the blocker, down the gutter before the dependant's column,
 * then into it. `lane` spreads links that share a gutter so they stay apart.
 */
function linkPath(a: Box, b: Box, lane: number): string {
  const y1 = (a.top + a.bottom) / 2;
  const y2 = (b.top + b.bottom) / 2;
  const sameWave = b.left <= a.right;
  const x = sameWave ? Math.max(a.right, b.right) + LOOP_BOW + lane : b.left - GUTTER / 2 + lane;
  const end = sameWave ? b.right : b.left;
  if (Math.abs(y2 - y1) < 1) return `M ${a.right} ${y1} H ${end}`;
  const r = Math.min(CORNER, Math.abs(y2 - y1) / 2);
  const down = y2 > y1 ? 1 : -1;
  const back = end < x ? -1 : 1;
  return [
    `M ${a.right} ${y1}`,
    `H ${x - r}`,
    `Q ${x} ${y1} ${x} ${y1 + down * r}`,
    `V ${y2 - down * r}`,
    `Q ${x} ${y2} ${x + back * r} ${y2}`,
    `H ${end}`,
  ].join(" ");
}

const LINK_STYLE = {
  cross: "var(--ms-cross)",
  team: "var(--ms-label-3)",
  focus: "var(--ms-accent)",
} as const;

function linkTint(link: EpicLink, focused: boolean) {
  if (focused) return LINK_STYLE.focus;
  return link.crossTeam ? LINK_STYLE.cross : LINK_STYLE.team;
}

function EpicCard({
  epic,
  color,
  dimmed,
  selected,
  blocks,
  waitsOn,
  register,
  onHover,
}: {
  epic: TeamEpic;
  color: string | undefined;
  dimmed: boolean;
  selected: boolean;
  blocks: number;
  waitsOn: number;
  register: (key: string, el: HTMLElement | null) => void;
  onHover: (key: string | null) => void;
}) {
  const { inspect } = useMilestone();
  const done = epic.status.category === "done";
  const noItems = !epic.standIn && epic.itemKeys.length === 0;
  return (
    <button
      type="button"
      ref={(el) => register(epic.key, el)}
      onClick={() => inspect(epic.key)}
      onMouseEnter={() => onHover(epic.key)}
      onMouseLeave={() => onHover(null)}
      onFocus={() => onHover(epic.key)}
      onBlur={() => onHover(null)}
      aria-current={selected ? "true" : undefined}
      title={epic.summary}
      className={cn(
        "ms-hover-card relative flex w-full flex-col gap-1.5 overflow-hidden rounded-xl bg-[var(--ms-surface)] py-2.5 pl-3.5 pr-3 text-left shadow-[var(--ms-shadow-card)] transition-opacity",
        selected && "ms-selected-card",
        dimmed && "opacity-35",
        done && "opacity-70",
      )}
    >
      <span className="absolute inset-y-0 left-0 w-[3px]" style={{ background: color }} aria-hidden="true" />
      <span className="flex items-center gap-1.5">
        <KeyChip issueKey={epic.key} critical={epic.onCriticalPath} />
        {epic.standIn && (
          <span className="truncate rounded-full bg-[var(--ms-warn-fill)] px-1.5 py-[1px] text-[10px] font-semibold text-[var(--ms-warn-text)]" title="The increment has no open team epics yet">
            No team epic
          </span>
        )}
        {noItems && (
          <span className="truncate rounded-full bg-[var(--ms-warn-fill)] px-1.5 py-[1px] text-[10px] font-semibold text-[var(--ms-warn-text)]" title="Not broken down into work items yet">
            No items
          </span>
        )}
      </span>
      <span className="line-clamp-2 text-[12.5px] font-semibold leading-snug text-[var(--ms-label)]">{epic.summary}</span>
      <span className="flex items-center gap-2">
        <ProgressBar progress={epic.progress} className="flex-1" />
        <span className="shrink-0 text-[10.5px] tabular-nums text-[var(--ms-label-3)]">
          {epic.progress.done}/{epic.progress.total}
        </span>
      </span>
      {(blocks > 0 || waitsOn > 0) && (
        <span className="text-[10.5px] text-[var(--ms-label-3)]">
          {[waitsOn > 0 && `waits on ${plural(waitsOn, "epic")}`, blocks > 0 && `blocks ${plural(blocks, "epic")}`].filter(Boolean).join(" · ")}
        </span>
      )}
    </button>
  );
}

function Legend() {
  const swatch = (tint: string, dashed = false) => (
    <svg width="22" height="8" aria-hidden="true">
      <line x1="1" y1="4" x2="21" y2="4" stroke={tint} strokeWidth="2" strokeDasharray={dashed ? "3 3" : undefined} />
    </svg>
  );
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-x-3.5 gap-y-1 text-[11.5px] text-[var(--ms-label-2)]">
      <span className="flex items-center gap-1.5">{swatch(LINK_STYLE.team)} Within a team</span>
      <span className="flex items-center gap-1.5">{swatch(LINK_STYLE.cross)} Across teams</span>
      <span className="flex items-center gap-1.5">{swatch(LINK_STYLE.team, true)} Wait on each other</span>
    </div>
  );
}

export function TeamLanesTab({ matches, showDone, empty }: { matches: Set<string> | null; showDone: boolean; empty: React.ReactNode }) {
  const { detail, colors, selectedKey, showTeam } = useMilestone();
  const { lanes, waveCount, links } = useMemo(() => teamLanes(detail), [detail]);
  const [hovered, setHovered] = useState<string | null>(null);
  const [boxes, setBoxes] = useState<Map<string, Box>>(new Map());
  const canvasRef = useRef<HTMLDivElement>(null);
  const cards = useRef(new Map<string, HTMLElement>());

  const register = useCallback((key: string, el: HTMLElement | null) => {
    if (el) cards.current.set(key, el);
    else cards.current.delete(key);
  }, []);

  const hasDone = showDone && lanes.some((l) => l.done.length > 0);
  const matchesEpic = useCallback((e: TeamEpic) => !matches || matches.has(e.key) || e.itemKeys.some((k) => matches.has(k)), [matches]);
  const shownLanes = useMemo(
    () => (matches ? lanes.filter((l) => [...l.waves.flat(), ...(showDone ? l.done : [])].some(matchesEpic)) : lanes),
    [lanes, matches, matchesEpic, showDone],
  );

  // Card positions relative to the canvas, re-measured whenever it reflows.
  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const measure = () => {
      const origin = canvas.getBoundingClientRect();
      const next = new Map<string, Box>();
      for (const [key, el] of cards.current) {
        const r = el.getBoundingClientRect();
        next.set(key, { left: r.left - origin.left, right: r.right - origin.left, top: r.top - origin.top, bottom: r.bottom - origin.top });
      }
      setBoxes(next);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [shownLanes, hasDone, waveCount]);

  const focus = hovered ?? (selectedKey && links.some((l) => l.from === selectedKey || l.to === selectedKey) ? selectedKey : null);
  const related = useMemo(() => {
    if (!focus) return null;
    const keys = new Set([focus]);
    for (const l of links) if (l.from === focus || l.to === focus) keys.add(l.from).add(l.to);
    return keys;
  }, [focus, links]);

  const counts = useMemo(() => {
    const blocks = new Map<string, number>();
    const waitsOn = new Map<string, number>();
    for (const l of links) {
      blocks.set(l.from, (blocks.get(l.from) ?? 0) + 1);
      waitsOn.set(l.to, (waitsOn.get(l.to) ?? 0) + 1);
    }
    return { blocks, waitsOn };
  }, [links]);

  if (lanes.length === 0) {
    return <EmptyState icon={<Rows3 size={40} strokeWidth={1.4} />} title="No team epics yet" message="No team epics implement this milestone’s increments." />;
  }
  if (shownLanes.length === 0) return empty;

  const columns = `${LABEL_WIDTH}px ${hasDone ? `${COLUMN_WIDTH}px ` : ""}repeat(${Math.max(1, waveCount)}, ${COLUMN_WIDTH}px)`;
  const width = boxes.size ? Math.max(...[...boxes.values()].map((b) => b.right)) + LOOP_BOW * 2 : 0;
  const height = boxes.size ? Math.max(...[...boxes.values()].map((b) => b.bottom)) + 8 : 0;
  const card = (e: TeamEpic) => (
    <EpicCard
      key={e.key}
      epic={e}
      color={colors.get(e.team)}
      dimmed={(related ? !related.has(e.key) : false) || !matchesEpic(e)}
      selected={selectedKey === e.key}
      blocks={counts.blocks.get(e.key) ?? 0}
      waitsOn={counts.waitsOn.get(e.key) ?? 0}
      register={register}
      onHover={setHovered}
    />
  );

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <p className="max-w-3xl text-[13px] text-[var(--ms-label-2)]">
          Each team’s epics in the order their work can run. An epic sits one wave after the latest epic it waits on; epics in the same wave can run in parallel. Arrows are “blocks” links between their remaining work items.
        </p>
        <Legend />
      </div>
      <div className="overflow-x-auto">
        <div ref={canvasRef} className="relative grid w-max gap-y-3" style={{ gridTemplateColumns: columns, columnGap: GUTTER }}>
          <div className="sticky left-0 z-10 bg-[var(--ms-bg)]" />
          {hasDone && <ColumnHeader title="Done" hint="Finished epics" />}
          {Array.from({ length: Math.max(1, waveCount) }, (_, w) => (
            <ColumnHeader key={w} title={`Wave ${w + 1}`} hint={w === 0 ? "Waits on no other epic" : `After wave ${w}`} />
          ))}
          {shownLanes.map((lane) => {
            const color = colors.get(lane.team);
            const open = lane.waves.flat();
            return (
              <div key={lane.team} className="contents">
                <button
                  type="button"
                  onClick={() => showTeam(lane.team)}
                  title={`Show ${lane.team}`}
                  className="sticky left-0 z-10 flex flex-col items-start justify-center gap-0.5 rounded-xl bg-[var(--ms-bg)] py-2 pr-3 text-left hover:text-[var(--ms-accent-text)]"
                >
                  <span className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: color }} aria-hidden="true" />
                    <span className="text-[13.5px] font-semibold text-[var(--ms-label)]">{lane.team}</span>
                  </span>
                  <span className="pl-[18px] text-[11px] text-[var(--ms-label-3)]">
                    {plural(open.length, "open epic")}
                    {lane.done.length > 0 && ` · ${lane.done.length} done`}
                  </span>
                </button>
                {hasDone && <Cell>{lane.done.map(card)}</Cell>}
                {lane.waves.length === 0 ? <Cell /> : lane.waves.map((wave, w) => <Cell key={w}>{wave.map(card)}</Cell>)}
              </div>
            );
          })}
          {/* Under the cards: a link that skips a wave passes behind the epics in between. */}
          <svg className="pointer-events-none absolute left-0 top-0 z-0 overflow-visible" width={width} height={height} aria-hidden="true">
            <defs>
              {Object.entries(LINK_STYLE).map(([name, tint]) => (
                <marker key={name} id={`lane-arrow-${name}`} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                  <path d="M 0 0 L 8 4 L 0 8 z" fill={tint} />
                </marker>
              ))}
            </defs>
            {links.map((l, i) => {
              const a = boxes.get(l.from);
              const b = boxes.get(l.to);
              if (!a || !b) return null;
              const lane = ((i % 5) - 2) * 3;
              const focused = !!focus && (l.from === focus || l.to === focus);
              const tint = linkTint(l, focused);
              const marker = focused ? "focus" : l.crossTeam ? "cross" : "team";
              return (
                <path
                  key={`${l.from}>${l.to}`}
                  d={linkPath(a, b, lane)}
                  fill="none"
                  stroke={tint}
                  strokeWidth={focused ? 2.25 : 1.5}
                  strokeDasharray={l.mutual ? "4 4" : undefined}
                  opacity={focus && !focused ? 0.15 : 0.85}
                  markerEnd={`url(#lane-arrow-${marker})`}
                />
              );
            })}
          </svg>
        </div>
      </div>
    </div>
  );
}

function ColumnHeader({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="flex flex-col pb-1">
      <span className="text-[12px] font-semibold text-[var(--ms-label-2)]">{title}</span>
      <span className="text-[11px] text-[var(--ms-label-3)]">{hint}</span>
    </div>
  );
}

function Cell({ children }: { children?: React.ReactNode }) {
  return <div className="relative z-[1] flex min-h-[64px] flex-col gap-2 rounded-2xl bg-[var(--ms-lane)] p-2">{children}</div>;
}
