const LEGEND_ITEMS = [
  { color: "#ef4444", label: "Blocks", dash: false },
  { color: "#94a3b8", label: "Relates to", dash: false },
  { color: "#a855f7", label: "Clones", dash: false },
];

export default function Legend() {
  return (
    <div className="absolute bottom-4 left-4 z-10 bg-white/80 backdrop-blur-md border border-slate-200/70 rounded-xl px-3.5 py-3 shadow-lg shadow-slate-200/60">
      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-2">
        Relationships
      </p>
      <ul className="flex flex-col gap-1.5">
        {LEGEND_ITEMS.map(({ color, label, dash }) => (
          <li key={label} className="flex items-center gap-2.5">
            <svg width="20" height="8" viewBox="0 0 20 8" fill="none" className="shrink-0">
              <line
                x1="0" y1="4" x2="20" y2="4"
                stroke={color}
                strokeWidth="2"
                strokeLinecap="round"
                strokeDasharray={dash ? "4 3" : undefined}
              />
            </svg>
            <span className="text-[11px] font-medium text-slate-600">{label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
