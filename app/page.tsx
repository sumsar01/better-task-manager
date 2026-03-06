import EpicPicker from "@/components/EpicPicker";

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-4 bg-slate-50 relative overflow-hidden">
      {/* Subtle radial gradient blobs */}
      <div
        className="pointer-events-none absolute -top-40 -left-40 w-[600px] h-[600px] rounded-full opacity-30"
        style={{ background: "radial-gradient(circle, #e0e7ff 0%, transparent 70%)" }}
      />
      <div
        className="pointer-events-none absolute -bottom-40 -right-40 w-[500px] h-[500px] rounded-full opacity-20"
        style={{ background: "radial-gradient(circle, #c7d2fe 0%, transparent 70%)" }}
      />

      <div className="relative w-full max-w-sm">
        {/* Wordmark */}
        <div className="mb-10 text-center">
          <div className="inline-flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center shadow-md shadow-indigo-200">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <circle cx="4" cy="4" r="2" fill="white" />
                <circle cx="12" cy="4" r="2" fill="white" fillOpacity="0.6" />
                <circle cx="8" cy="12" r="2" fill="white" fillOpacity="0.8" />
                <line x1="4" y1="4" x2="8" y2="12" stroke="white" strokeWidth="1.5" strokeOpacity="0.7" />
                <line x1="12" y1="4" x2="8" y2="12" stroke="white" strokeWidth="1.5" strokeOpacity="0.7" />
              </svg>
            </div>
            <span className="text-lg font-bold text-slate-900 tracking-tight">TaskGraph</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight leading-tight">
            Visualize your<br />
            <span className="text-indigo-600">epic dependencies</span>
          </h1>
          <p className="mt-2.5 text-slate-500 text-sm leading-relaxed">
            See what&apos;s blocked, what&apos;s in progress,<br />and what you can ship next.
          </p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xl shadow-slate-200/50 overflow-hidden">
          <div className="px-6 pt-6 pb-5">
            <EpicPicker />
          </div>
          <div className="px-6 py-3 bg-slate-50 border-t border-slate-100 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
            <span className="text-[11px] text-slate-400">Connecting to Jira Cloud</span>
          </div>
        </div>
      </div>
    </main>
  );
}
