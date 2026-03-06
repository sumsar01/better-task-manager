import Link from "next/link";
import EpicPicker from "@/components/EpicPicker";
import ThemeToggle from "@/components/ThemeToggle";
import GearIcon from "@/components/icons/GearIcon";
import HomeShell from "@/components/HomeShell";

export default function Home() {
  return (
    <HomeShell
      topBlobColor="#e0e7ff"
      bottomBlobColor="#c7d2fe"
      accentBg="bg-indigo-600"
      accentShadow="shadow-indigo-200 dark:shadow-indigo-900"
      headingHighlight="epic dependencies"
      highlightColor="text-indigo-600"
      controls={
        <>
          <ThemeToggle />
          <Link
            href="/settings"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
            title="Configure Jira connection"
          >
            <GearIcon size={14} />
            Settings
          </Link>
        </>
      }
      picker={<EpicPicker />}
      footer={
        <Link
          href="/beads"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-violet-600 dark:text-violet-400 hover:text-violet-800 dark:hover:text-violet-300 transition-colors"
        >
          <span className="w-3.5 h-3.5 rounded bg-violet-600 inline-flex items-center justify-center">
            <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
              <circle cx="2" cy="2" r="1" fill="white" />
              <circle cx="6" cy="2" r="1" fill="white" fillOpacity="0.6" />
              <circle cx="4" cy="6" r="1" fill="white" fillOpacity="0.8" />
            </svg>
          </span>
          Visualize beads tasks →
        </Link>
      }
    />
  );
}
