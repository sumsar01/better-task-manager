"use client";

export type ViewTab = "graph" | "timeline";

interface ViewTabsProps {
  activeTab: ViewTab;
  onTabChange: (tab: ViewTab) => void;
}

/**
 * Two-tab toggle bar for switching between the dependency graph view and the
 * timeline/roadmap view on the project graph page.
 */
export default function ViewTabs({ activeTab, onTabChange }: ViewTabsProps) {
  return (
    <div className="flex items-center gap-1 px-5 py-2 bg-white dark:bg-slate-900 border-b border-slate-200/80 dark:border-slate-700/80 shrink-0">
      <TabButton
        label="Graph"
        icon={<GraphIcon />}
        active={activeTab === "graph"}
        onClick={() => onTabChange("graph")}
      />
      <TabButton
        label="Timeline"
        icon={<TimelineIcon />}
        active={activeTab === "timeline"}
        onClick={() => onTabChange("timeline")}
      />
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

interface TabButtonProps {
  label: string;
  icon: React.ReactNode;
  active: boolean;
  onClick: () => void;
}

function TabButton({ label, icon, active, onClick }: TabButtonProps) {
  return (
    <button
      onClick={onClick}
      className={[
        "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-all duration-150",
        active
          ? "bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-800/60"
          : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/60 border border-transparent",
      ].join(" ")}
    >
      {icon}
      {label}
    </button>
  );
}

function GraphIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
      <circle cx="2.5" cy="2.5" r="1.5" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="10.5" cy="2.5" r="1.5" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="6.5" cy="10.5" r="1.5" stroke="currentColor" strokeWidth="1.5" />
      <line x1="2.5" y1="2.5" x2="6.5" y2="10.5" stroke="currentColor" strokeWidth="1.2" strokeOpacity="0.7" />
      <line x1="10.5" y1="2.5" x2="6.5" y2="10.5" stroke="currentColor" strokeWidth="1.2" strokeOpacity="0.7" />
    </svg>
  );
}

function TimelineIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
      <line x1="1" y1="4" x2="12" y2="4" stroke="currentColor" strokeWidth="1.2" strokeOpacity="0.4" />
      <line x1="1" y1="7" x2="12" y2="7" stroke="currentColor" strokeWidth="1.2" strokeOpacity="0.4" />
      <line x1="1" y1="10" x2="12" y2="10" stroke="currentColor" strokeWidth="1.2" strokeOpacity="0.4" />
      <rect x="2" y="2.5" width="5" height="3" rx="1" fill="currentColor" fillOpacity="0.85" />
      <rect x="6" y="5.5" width="5" height="3" rx="1" fill="currentColor" fillOpacity="0.6" />
      <rect x="3" y="8.5" width="7" height="3" rx="1" fill="currentColor" fillOpacity="0.75" />
    </svg>
  );
}
