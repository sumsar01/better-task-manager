"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { JiraIssue } from "@/lib/jira";

// ── Constants ─────────────────────────────────────────────────────────────────

const ROW_HEIGHT = 40;
const ROW_GAP = 8;
const ROW_STRIDE = ROW_HEIGHT + ROW_GAP;
const BAR_RADIUS = 6;
const BAR_VERTICAL_PAD = 8;
const BAR_HEIGHT = ROW_HEIGHT - BAR_VERTICAL_PAD * 2;
const MIN_LABEL_COL_WIDTH = 160;
const DEFAULT_LABEL_COL_WIDTH = 240;
const MAX_LABEL_COL_WIDTH = 520;
const HEADER_HEIGHT = 36;
const MIN_PIXELS_PER_DAY = 2;
const MAX_PIXELS_PER_DAY = 28;
const ZOOM_STEP = 1.4;
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Arrow colours — match EDGE_COLORS in graphConstants.ts */
const DEP_COLOR_ACTIVE = "#ef4444";   // red-500   — blocker unresolved
const DEP_COLOR_DONE   = "#94a3b8";   // slate-400 — blocker resolved

/** Status-category → bar fill (same palette as STATUS_COLORS in graphConstants.ts) */
const BAR_COLORS: Record<string, string> = {
  new: "#94a3b8",            // slate-400 — To Do
  indeterminate: "#6366f1",  // indigo-500 — In Progress
  done: "#22c55e",           // green-500 — Done
};

const BAR_TEXT_COLORS: Record<string, string> = {
  new: "#1e293b",
  indeterminate: "#ffffff",
  done: "#ffffff",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Parse a date string (YYYY-MM-DD or ISO) to a UTC midnight Date. Returns null if invalid. */
function parseDate(s: string | null | undefined): Date | null {
  if (!s) return null;
  // YYYY-MM-DD — treat as UTC midnight to avoid timezone shifts
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (!match) return null;
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
}

/** Number of days between two dates (end - start). */
function daysDiff(start: Date, end: Date): number {
  return (end.getTime() - start.getTime()) / 86_400_000;
}

/** Add `n` days to `d`, returning a new Date. */
function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 86_400_000);
}

/** First day of the month for a given date. */
function startOfMonth(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

/** First day of the next month. */
function nextMonth(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
}

/** Monday of the week containing `d`. */
function startOfWeek(d: Date): Date {
  const day = d.getUTCDay(); // 0 = Sun
  const diffToMon = day === 0 ? -6 : 1 - day;
  return addDays(d, diffToMon);
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface EpicRow {
  issue: JiraIssue;
  startDate: Date | null;
  endDate: Date | null;
  /** True when start/end came from explicit Jira fields (not empty). */
  hasDates: boolean;
}

interface TooltipState {
  x: number;
  y: number;
  row: EpicRow;
}

/** A resolved dependency edge between two epic bars. */
interface DepEdge {
  srcKey: string;
  tgtKey: string;
  /** true = blocker epic is not yet done */
  active: boolean;
}

// ── Main component ────────────────────────────────────────────────────────────

interface EpicTimelineViewProps {
  issues: JiraIssue[];
  onEpicSelect?: (key: string) => void;
  selectedKey?: string | null;
}

export default function EpicTimelineView({ issues, onEpicSelect, selectedKey }: EpicTimelineViewProps) {
  // null = not yet auto-fitted
  const [pixelsPerDay, setPixelsPerDay] = useState<number | null>(null);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const [labelColWidth, setLabelColWidth] = useState(DEFAULT_LABEL_COL_WIDTH);
  const [isResizing, setIsResizing] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const didInitRef = useRef(false);
  const resizeDragStartX = useRef(0);
  const resizeDragStartWidth = useRef(DEFAULT_LABEL_COL_WIDTH);

  // ── Filter to epics only ─────────────────────────────────────────────────
  const epicRows: EpicRow[] = useMemo(() => {
    return issues
      .filter((i) => i.fields.issuetype.name === "Epic")
      .map((issue) => {
        const start = parseDate(issue.fields.customfield_10015) ?? parseDate(issue.fields.created ?? null);
        const end = parseDate(issue.fields.duedate);
        const hasExplicit =
          Boolean(issue.fields.customfield_10015) || Boolean(issue.fields.duedate);
        return { issue, startDate: start, endDate: end, hasDates: hasExplicit };
      });
  }, [issues]);

  // ── Dependency edges between epics ───────────────────────────────────────
  const depEdges: DepEdge[] = useMemo(() => {
    const epicKeySet = new Set(epicRows.map((r) => r.issue.key));
    const seen = new Set<string>();
    const edges: DepEdge[] = [];

    for (const row of epicRows) {
      for (const link of row.issue.fields.issuelinks ?? []) {
        // Normalise to (blocker → blocked) regardless of which end we're on.
        // outwardIssue on a "Blocks" link means: this issue blocks outwardIssue.
        // inwardIssue  on a "Blocks" link means: inwardIssue blocks this issue.
        const name = link.type.name.toLowerCase();
        const isBlocksType = name === "blocks";

        let blockerKey: string | undefined;
        let blockedKey: string | undefined;

        if (isBlocksType && link.outwardIssue) {
          blockerKey = row.issue.key;
          blockedKey = link.outwardIssue.key;
        } else if (isBlocksType && link.inwardIssue) {
          blockerKey = link.inwardIssue.key;
          blockedKey = row.issue.key;
        }

        if (!blockerKey || !blockedKey) continue;
        if (!epicKeySet.has(blockerKey) || !epicKeySet.has(blockedKey)) continue;

        const edgeId = `${blockerKey}→${blockedKey}`;
        if (seen.has(edgeId)) continue;
        seen.add(edgeId);

        const blockerRow = epicRows.find((r) => r.issue.key === blockerKey)!;
        const active = blockerRow.issue.fields.status.statusCategory.key !== "done";
        edges.push({ srcKey: blockerKey, tgtKey: blockedKey, active });
      }
    }
    return edges;
  }, [epicRows]);
  const { rangeStart, rangeEnd } = useMemo(() => {
    const allDates: Date[] = [];
    for (const row of epicRows) {
      if (row.startDate && row.hasDates) allDates.push(row.startDate);
      if (row.endDate) allDates.push(row.endDate);
    }

    const today = new Date();
    const todayUTC = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));

    if (allDates.length === 0) {
      return {
        rangeStart: addDays(startOfMonth(addDays(todayUTC, -30)), 0),
        rangeEnd: addDays(startOfMonth(addDays(todayUTC, 120)), 0),
      };
    }

    const minDate = allDates.reduce((a, b) => (a < b ? a : b));
    const maxDate = allDates.reduce((a, b) => (a > b ? a : b));
    return {
      rangeStart: startOfMonth(addDays(minDate, -15)),
      rangeEnd: nextMonth(addDays(maxDate, 15)),
    };
  }, [epicRows]);

  const totalDays = daysDiff(rangeStart, rangeEnd);

  // ── Auto-fit zoom on first render ────────────────────────────────────────
  useEffect(() => {
    if (didInitRef.current || pixelsPerDay !== null) return;
    if (!containerRef.current || totalDays <= 0) return;
    didInitRef.current = true;

    const availableWidth = containerRef.current.clientWidth - labelColWidth;
    if (availableWidth <= 0) return;

    const fitted = availableWidth / totalDays;
    const clamped = Math.min(MAX_PIXELS_PER_DAY, Math.max(MIN_PIXELS_PER_DAY, fitted));
    setPixelsPerDay(clamped);
  }, [pixelsPerDay, totalDays, labelColWidth]);

  // Resolved value used for all pixel calculations (fallback while effect hasn't fired)
  const resolvedPixelsPerDay = pixelsPerDay ?? MIN_PIXELS_PER_DAY;

  const canvasWidth = Math.ceil(totalDays * resolvedPixelsPerDay);
  const canvasHeight = HEADER_HEIGHT + epicRows.length * ROW_STRIDE + ROW_GAP;

  // ── Today marker ─────────────────────────────────────────────────────────
  const today = new Date();
  const todayUTC = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));
  const todayX = daysDiff(rangeStart, todayUTC) * resolvedPixelsPerDay;

  // ── Scroll to today once after initial zoom is set ────────────────────────
  useEffect(() => {
    if (pixelsPerDay === null || !scrollRef.current) return;
    const ref = scrollRef.current;
    const targetScroll = todayX - ref.clientWidth / 2;
    ref.scrollLeft = Math.max(0, targetScroll);
    // Intentionally runs only when pixelsPerDay first becomes non-null
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pixelsPerDay]);

  // ── Month grid lines ─────────────────────────────────────────────────────
  const monthMarkers = useMemo(() => {
    const markers: Array<{ x: number; label: string; year: number }> = [];
    let cursor = startOfMonth(rangeStart);
    if (cursor < rangeStart) cursor = nextMonth(cursor);
    while (cursor <= rangeEnd) {
      const x = daysDiff(rangeStart, cursor) * resolvedPixelsPerDay;
      markers.push({ x, label: MONTH_NAMES[cursor.getUTCMonth()], year: cursor.getUTCFullYear() });
      cursor = nextMonth(cursor);
    }
    return markers;
  }, [rangeStart, rangeEnd, resolvedPixelsPerDay]);

  // ── Week grid lines (only at higher zoom levels) ─────────────────────────
  const weekMarkers = useMemo(() => {
    if (resolvedPixelsPerDay < 14) return [];
    const markers: Array<{ x: number }> = [];
    let cursor = startOfWeek(rangeStart);
    if (cursor < rangeStart) cursor = addDays(cursor, 7);
    while (cursor <= rangeEnd) {
      markers.push({ x: daysDiff(rangeStart, cursor) * resolvedPixelsPerDay });
      cursor = addDays(cursor, 7);
    }
    return markers;
  }, [rangeStart, rangeEnd, resolvedPixelsPerDay]);

  // ── Zoom ─────────────────────────────────────────────────────────────────
  const zoomIn = useCallback(() => {
    setPixelsPerDay((p) => Math.min(MAX_PIXELS_PER_DAY, (p ?? MIN_PIXELS_PER_DAY) * ZOOM_STEP));
  }, []);

  const zoomOut = useCallback(() => {
    setPixelsPerDay((p) => Math.max(MIN_PIXELS_PER_DAY, (p ?? MIN_PIXELS_PER_DAY) / ZOOM_STEP));
  }, []);

  // ── Scroll to today ───────────────────────────────────────────────────────
  const scrollToToday = useCallback(() => {
    if (scrollRef.current) {
      const targetScroll = todayX - scrollRef.current.clientWidth / 2;
      scrollRef.current.scrollLeft = Math.max(0, targetScroll);
    }
  }, [todayX]);

  // ── Sidebar resize ────────────────────────────────────────────────────────
  const handleResizeMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      resizeDragStartX.current = e.clientX;
      resizeDragStartWidth.current = labelColWidth;
      setIsResizing(true);
    },
    [labelColWidth],
  );

  useEffect(() => {
    if (!isResizing) return;
    const onMouseMove = (e: MouseEvent) => {
      const delta = e.clientX - resizeDragStartX.current;
      const newWidth = Math.min(
        MAX_LABEL_COL_WIDTH,
        Math.max(MIN_LABEL_COL_WIDTH, resizeDragStartWidth.current + delta),
      );
      setLabelColWidth(newWidth);
    };
    const onMouseUp = () => setIsResizing(false);
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };
  }, [isResizing]);

  // ── Tooltip ───────────────────────────────────────────────────────────────
  const handleBarMouseEnter = useCallback(
    (e: React.MouseEvent<SVGRectElement>, row: EpicRow) => {
      const rect = (e.currentTarget.ownerSVGElement?.parentElement as HTMLElement | null)?.getBoundingClientRect();
      if (!rect) return;
      setTooltip({ x: e.clientX - rect.left, y: e.clientY - rect.top, row });
    },
    [],
  );

  const handleBarMouseMove = useCallback(
    (e: React.MouseEvent<SVGRectElement>) => {
      const rect = (e.currentTarget.ownerSVGElement?.parentElement as HTMLElement | null)?.getBoundingClientRect();
      if (!rect || !tooltip) return;
      setTooltip((prev) => (prev ? { ...prev, x: e.clientX - rect.left, y: e.clientY - rect.top } : null));
    },
    [tooltip],
  );

  const handleBarMouseLeave = useCallback(() => setTooltip(null), []);

  const handleBarClick = useCallback(
    (row: EpicRow) => { onEpicSelect?.(row.issue.key); },
    [onEpicSelect],
  );

  if (epicRows.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center text-slate-400 dark:text-slate-500 text-sm">
        No epics to display.
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={[
        "flex flex-1 min-h-0 flex-col bg-slate-50 dark:bg-slate-950 overflow-hidden",
        isResizing ? "select-none cursor-col-resize" : "",
      ].join(" ")}
    >
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-slate-900 border-b border-slate-200/80 dark:border-slate-700/80 shrink-0">
        <span className="text-[11px] text-slate-400 dark:text-slate-500 font-medium mr-1">Zoom</span>
        <button
          onClick={zoomOut}
          title="Zoom out"
          className="w-6 h-6 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors flex items-center justify-center text-sm leading-none font-semibold"
        >
          −
        </button>
        <button
          onClick={zoomIn}
          title="Zoom in"
          className="w-6 h-6 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors flex items-center justify-center text-sm leading-none font-semibold"
        >
          +
        </button>
        <div className="w-px h-4 bg-slate-200 dark:bg-slate-700 mx-1" />
        <button
          onClick={scrollToToday}
          title="Scroll to today"
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors text-[11px] font-medium"
        >
          <TodayIcon />
          Today
        </button>
        <div className="ml-auto text-[11px] text-slate-400 dark:text-slate-500">
          {epicRows.length} epic{epicRows.length !== 1 ? "s" : ""}
          {epicRows.filter((r) => !r.hasDates).length > 0 && (
            <span className="ml-2 text-slate-300 dark:text-slate-600">
              · {epicRows.filter((r) => !r.hasDates).length} without dates
            </span>
          )}
        </div>
      </div>

      {/* Main content: resizable label column + scrollable canvas */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Label column — resizable via drag handle on right edge */}
        <div
          className="relative shrink-0 bg-white dark:bg-slate-900 border-r border-slate-200/80 dark:border-slate-700/80 overflow-hidden"
          style={{ width: labelColWidth }}
        >
          {/* Header spacer */}
          <div
            className="border-b border-slate-200/80 dark:border-slate-700/80"
            style={{ height: HEADER_HEIGHT }}
          />
          {/* Epic labels */}
          <div style={{ paddingTop: ROW_GAP }}>
            {epicRows.map((row, i) => {
              const isSelected = selectedKey === row.issue.key;
              const cat = row.issue.fields.status.statusCategory.key;
              const dotColor = BAR_COLORS[cat] ?? BAR_COLORS.new;
              return (
                <div
                  key={row.issue.key}
                  onClick={() => handleBarClick(row)}
                  title={`${row.issue.key}: ${row.issue.fields.summary}`}
                  className={[
                    "flex items-center gap-2 px-3 cursor-pointer transition-colors select-none",
                    isSelected
                      ? "bg-indigo-50 dark:bg-indigo-950/40"
                      : i % 2 === 0
                        ? "bg-white dark:bg-slate-900"
                        : "bg-slate-50/60 dark:bg-slate-900/60",
                  ].join(" ")}
                  style={{ height: ROW_HEIGHT, marginBottom: ROW_GAP }}
                >
                  <span className="shrink-0 w-2 h-2 rounded-full" style={{ backgroundColor: dotColor }} />
                  <span className="shrink-0 text-[10px] font-mono font-semibold text-indigo-500 dark:text-indigo-400">
                    {row.issue.key}
                  </span>
                  <span className="text-[11px] text-slate-600 dark:text-slate-300 truncate leading-tight">
                    {row.issue.fields.summary}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Drag handle — right edge of the label column */}
          <div
            onMouseDown={handleResizeMouseDown}
            className={[
              "absolute top-0 right-0 w-[5px] h-full z-10 cursor-col-resize",
              "hover:bg-indigo-400/30 dark:hover:bg-indigo-500/30 transition-colors",
              isResizing ? "bg-indigo-400/40 dark:bg-indigo-500/40" : "",
            ].join(" ")}
            title="Drag to resize"
          />
        </div>

        {/* Scrollable SVG canvas */}
        <div ref={scrollRef} className="flex-1 overflow-x-auto overflow-y-auto relative">
          <svg
            width={canvasWidth}
            height={canvasHeight}
            className="block"
            style={{ minWidth: canvasWidth }}
          >
            {/* Arrowhead markers for dependency edges */}
            <defs>
              <marker
                id="dep-arrow-active"
                markerWidth="8" markerHeight="8"
                refX="7" refY="3"
                orient="auto"
                markerUnits="userSpaceOnUse"
              >
                <path d="M0,0 L0,6 L7,3 Z" fill={DEP_COLOR_ACTIVE} />
              </marker>
              <marker
                id="dep-arrow-done"
                markerWidth="8" markerHeight="8"
                refX="7" refY="3"
                orient="auto"
                markerUnits="userSpaceOnUse"
              >
                <path d="M0,0 L0,6 L7,3 Z" fill={DEP_COLOR_DONE} />
              </marker>
            </defs>
            {/* Month header background */}
            <rect x={0} y={0} width={canvasWidth} height={HEADER_HEIGHT} fill="white" className="dark:fill-slate-900" />

            {/* Week grid lines — faint dashed, only when zoom >= 14 px/day */}
            {weekMarkers.map((w, idx) => (
              <line
                key={`week-${idx}`}
                x1={w.x}
                y1={HEADER_HEIGHT}
                x2={w.x}
                y2={canvasHeight}
                stroke="#e2e8f0"
                strokeWidth={0.5}
                strokeDasharray="2 3"
                opacity={0.7}
                className="dark:[stroke:#1e293b]"
              />
            ))}

            {/* Month grid lines + labels */}
            {monthMarkers.map((m, idx) => {
              const showYear = idx === 0 || monthMarkers[idx - 1]?.year !== m.year;
              return (
                <g key={`month-${idx}`}>
                  <line
                    x1={m.x} y1={0} x2={m.x} y2={canvasHeight}
                    stroke="#e2e8f0" strokeWidth={1}
                    className="dark:[stroke:#334155]"
                  />
                  <text
                    x={m.x + 5} y={14}
                    fontSize={10} fontWeight={600} fill="#94a3b8"
                    className="dark:[fill:#64748b]"
                    fontFamily="ui-monospace,monospace"
                  >
                    {m.label}
                  </text>
                  {showYear && (
                    <text
                      x={m.x + 5} y={28}
                      fontSize={9} fill="#cbd5e1"
                      className="dark:[fill:#475569]"
                      fontFamily="ui-monospace,monospace"
                    >
                      {m.year}
                    </text>
                  )}
                </g>
              );
            })}

            {/* Header bottom border */}
            <line
              x1={0} y1={HEADER_HEIGHT} x2={canvasWidth} y2={HEADER_HEIGHT}
              stroke="#e2e8f0" strokeWidth={1}
              className="dark:[stroke:#334155]"
            />

            {/* Row backgrounds */}
            {epicRows.map((row, i) => {
              const y = HEADER_HEIGHT + ROW_GAP + i * ROW_STRIDE;
              const isSelected = selectedKey === row.issue.key;
              return (
                <rect
                  key={`bg-${row.issue.key}`}
                  x={0} y={y} width={canvasWidth} height={ROW_HEIGHT}
                  fill={isSelected ? "#eef2ff" : i % 2 === 0 ? "#ffffff" : "#f8fafc"}
                  opacity={0.8}
                />
              );
            })}

            {/* Today marker */}
            {todayX >= 0 && todayX <= canvasWidth && (
              <g>
                <line
                  x1={todayX} y1={0} x2={todayX} y2={canvasHeight}
                  stroke="#ef4444" strokeWidth={1.5} strokeDasharray="4 3" opacity={0.7}
                />
                <text
                  x={todayX + 3} y={12}
                  fontSize={9} fontWeight={700} fill="#ef4444" opacity={0.8}
                  fontFamily="ui-monospace,monospace"
                >
                  TODAY
                </text>
              </g>
            )}

            {/* Epic bars */}
            {epicRows.map((row, i) => {
              if (!row.hasDates || !row.startDate) return null;

              const y = HEADER_HEIGHT + ROW_GAP + i * ROW_STRIDE;
              const barY = y + BAR_VERTICAL_PAD;
              const cat = row.issue.fields.status.statusCategory.key;
              const fillColor = BAR_COLORS[cat] ?? BAR_COLORS.new;
              const textColor = BAR_TEXT_COLORS[cat] ?? BAR_TEXT_COLORS.new;

              const startX = Math.max(0, daysDiff(rangeStart, row.startDate) * resolvedPixelsPerDay);
              const endDate = row.endDate ?? addDays(row.startDate, 30);
              const endX = daysDiff(rangeStart, endDate) * resolvedPixelsPerDay;
              const barWidth = Math.max(endX - startX, 4);
              const isSelected = selectedKey === row.issue.key;
              const labelInBar = barWidth > 60;
              const clipId = `bar-clip-${row.issue.key}`;

              return (
                <g key={`bar-${row.issue.key}`}>
                  {/* Clip path so label text never overflows the bar */}
                  {labelInBar && (
                    <defs>
                      <clipPath id={clipId}>
                        <rect
                          x={startX + 4}
                          y={barY}
                          width={barWidth - 12}
                          height={BAR_HEIGHT}
                        />
                      </clipPath>
                    </defs>
                  )}
                  <rect
                    x={startX} y={barY} width={barWidth} height={BAR_HEIGHT}
                    rx={BAR_RADIUS} ry={BAR_RADIUS}
                    fill={fillColor}
                    opacity={isSelected ? 1 : 0.82}
                    stroke={isSelected ? "#4338ca" : "transparent"}
                    strokeWidth={isSelected ? 2 : 0}
                    style={{ cursor: "pointer" }}
                    onMouseEnter={(e) => handleBarMouseEnter(e, row)}
                    onMouseMove={handleBarMouseMove}
                    onMouseLeave={handleBarMouseLeave}
                    onClick={() => handleBarClick(row)}
                  />
                  {labelInBar && (
                    <text
                      x={startX + 8}
                      y={barY + BAR_HEIGHT / 2 + 4}
                      fontSize={10} fontWeight={600} fill={textColor}
                      clipPath={`url(#${clipId})`}
                      style={{ pointerEvents: "none", userSelect: "none" }}
                      fontFamily="ui-sans-serif,system-ui,sans-serif"
                    >
                      <tspan>{row.issue.key}</tspan>
                      {barWidth > 140 && <tspan> · </tspan>}
                      {barWidth > 140 && (
                        <tspan>
                          {row.issue.fields.summary}
                        </tspan>
                      )}
                    </text>
                  )}
                </g>
              );
            })}
            {/* Dependency arrows between epic bars */}
            {depEdges.map((edge) => {
              const srcIdx = epicRows.findIndex((r) => r.issue.key === edge.srcKey);
              const tgtIdx = epicRows.findIndex((r) => r.issue.key === edge.tgtKey);
              const srcRow = epicRows[srcIdx];
              const tgtRow = epicRows[tgtIdx];

              if (srcIdx < 0 || tgtIdx < 0) return null;
              if (!srcRow.hasDates || !srcRow.startDate) return null;
              if (!tgtRow.hasDates || !tgtRow.startDate) return null;

              // Source bar right edge (blocker)
              const srcEndDate = srcRow.endDate ?? addDays(srcRow.startDate, 30);
              const srcEndX = daysDiff(rangeStart, srcEndDate) * resolvedPixelsPerDay;
              const x1 = Math.max(0, srcEndX);
              const y1 = HEADER_HEIGHT + ROW_GAP + srcIdx * ROW_STRIDE + BAR_VERTICAL_PAD + BAR_HEIGHT / 2;

              // Target bar left edge (blocked)
              const x2 = Math.max(0, daysDiff(rangeStart, tgtRow.startDate) * resolvedPixelsPerDay);
              const y2 = HEADER_HEIGHT + ROW_GAP + tgtIdx * ROW_STRIDE + BAR_VERTICAL_PAD + BAR_HEIGHT / 2;

              // Cubic Bézier S-curve — same approach as ElkEdge fallback
              const tension = Math.min(120, Math.max(40, Math.abs(x2 - x1) * 0.5));
              const d = `M ${x1} ${y1} C ${x1 + tension} ${y1} ${x2 - tension} ${y2} ${x2} ${y2}`;

              const color = edge.active ? DEP_COLOR_ACTIVE : DEP_COLOR_DONE;
              const markerId = edge.active ? "dep-arrow-active" : "dep-arrow-done";

              return (
                <path
                  key={`dep-${edge.srcKey}-${edge.tgtKey}`}
                  d={d}
                  fill="none"
                  stroke={color}
                  strokeWidth={1.5}
                  opacity={edge.active ? 0.8 : 0.45}
                  markerEnd={`url(#${markerId})`}
                  style={{ pointerEvents: "none" }}
                />
              );
            })}
          </svg>

          {/* Tooltip */}
          {tooltip && (
            <EpicTooltip
              x={tooltip.x}
              y={tooltip.y}
              row={tooltip.row}
              containerWidth={scrollRef.current?.clientWidth ?? canvasWidth}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ── Tooltip ───────────────────────────────────────────────────────────────────

function formatDate(d: Date | null | undefined): string {
  if (!d) return "—";
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
}

interface EpicTooltipProps {
  x: number;
  y: number;
  row: EpicRow;
  containerWidth: number;
}

function EpicTooltip({ x, y, row, containerWidth }: EpicTooltipProps) {
  const TOOLTIP_WIDTH = 240;
  const OFFSET = 14;
  // Flip to left of cursor if it would overflow the right edge of the scroll container
  const wouldOverflow = x + OFFSET + TOOLTIP_WIDTH > containerWidth;
  const left = wouldOverflow ? x - TOOLTIP_WIDTH - OFFSET : x + OFFSET;

  return (
    <div
      className="pointer-events-none absolute z-20 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl px-3 py-2.5 text-[11px]"
      style={{ left, top: y + OFFSET, width: TOOLTIP_WIDTH }}
    >
      <div className="font-mono font-bold text-indigo-500 dark:text-indigo-400 mb-1">{row.issue.key}</div>
      <div className="font-semibold text-slate-700 dark:text-slate-200 leading-snug mb-2">
        {row.issue.fields.summary}
      </div>
      <div className="flex flex-col gap-0.5 text-slate-500 dark:text-slate-400">
        <div className="flex gap-2">
          <span className="w-14 shrink-0 text-slate-400 dark:text-slate-500">Status</span>
          <span className="font-medium text-slate-600 dark:text-slate-300">{row.issue.fields.status.name}</span>
        </div>
        <div className="flex gap-2">
          <span className="w-14 shrink-0 text-slate-400 dark:text-slate-500">Start</span>
          <span className="font-medium text-slate-600 dark:text-slate-300">
            {row.issue.fields.customfield_10015
              ? formatDate(parseDate(row.issue.fields.customfield_10015))
              : <span className="text-slate-300 dark:text-slate-600 italic">not set</span>}
          </span>
        </div>
        <div className="flex gap-2">
          <span className="w-14 shrink-0 text-slate-400 dark:text-slate-500">Due</span>
          <span className="font-medium text-slate-600 dark:text-slate-300">
            {row.issue.fields.duedate
              ? formatDate(parseDate(row.issue.fields.duedate))
              : <span className="text-slate-300 dark:text-slate-600 italic">not set</span>}
          </span>
        </div>
        {row.issue.fields.assignee && (
          <div className="flex gap-2">
            <span className="w-14 shrink-0 text-slate-400 dark:text-slate-500">Owner</span>
            <span className="font-medium text-slate-600 dark:text-slate-300">{row.issue.fields.assignee.displayName}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Icons ─────────────────────────────────────────────────────────────────────

function TodayIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 11 11" fill="none" aria-hidden="true">
      <rect x="1" y="2" width="9" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
      <line x1="3.5" y1="1" x2="3.5" y2="3.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <line x1="7.5" y1="1" x2="7.5" y2="3.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <line x1="1" y1="5" x2="10" y2="5" stroke="currentColor" strokeWidth="1" strokeOpacity="0.5" />
    </svg>
  );
}

// Re-export the date parser so page.tsx doesn't need to re-implement it
export { parseDate };
