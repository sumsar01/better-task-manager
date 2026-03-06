import Link from "next/link";
import BeadsPicker from "@/components/BeadsPicker";
import ThemeToggle from "@/components/ThemeToggle";
import HomeShell from "@/components/HomeShell";

export default function BeadsHome() {
  return (
    <HomeShell
      topBlobColor="#ede9fe"
      bottomBlobColor="#ddd6fe"
      accentBg="bg-violet-600"
      accentShadow="shadow-violet-200 dark:shadow-violet-900"
      headingHighlight="beads task graph"
      highlightColor="text-violet-600"
      controls={<ThemeToggle />}
      picker={<BeadsPicker />}
      footer={
        <Link
          href="/"
          className="text-xs text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
        >
          ← Back to Jira
        </Link>
      }
    />
  );
}
