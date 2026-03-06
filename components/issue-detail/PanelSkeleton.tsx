"use client";

function SkeletonLine({ w = "full", h = "3" }: { w?: string; h?: string }) {
  return <div className={`h-${h} w-${w} bg-slate-100 dark:bg-slate-700 rounded animate-pulse`} />;
}

export { SkeletonLine };

export default function PanelSkeleton() {
  return (
    <div className="px-5 py-5 space-y-4">
      <SkeletonLine w="1/3" h="3" />
      <SkeletonLine w="4/5" h="5" />
      <SkeletonLine w="3/5" h="4" />
      <div className="h-px bg-slate-100 dark:bg-slate-700 my-4" />
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2"><SkeletonLine w="1/2" h="2" /><SkeletonLine w="3/4" h="6" /></div>
        <div className="space-y-2"><SkeletonLine w="1/2" h="2" /><SkeletonLine w="3/4" h="6" /></div>
        <div className="space-y-2"><SkeletonLine w="1/2" h="2" /><SkeletonLine w="3/4" h="6" /></div>
        <div className="space-y-2"><SkeletonLine w="1/2" h="2" /><SkeletonLine w="3/4" h="6" /></div>
      </div>
      <div className="h-px bg-slate-100 dark:bg-slate-700 my-4" />
      <SkeletonLine h="3" />
      <SkeletonLine w="5/6" h="3" />
      <SkeletonLine w="4/6" h="3" />
    </div>
  );
}
