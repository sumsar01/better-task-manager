interface BackgroundBlobsProps {
  /** Tailwind color stop for the top-left blob. e.g. "#e0e7ff" */
  topColor: string;
  /** Tailwind color stop for the bottom-right blob. e.g. "#c7d2fe" */
  bottomColor: string;
}

/**
 * Decorative radial-gradient blobs rendered behind page content.
 * Must be placed inside a `relative overflow-hidden` container.
 */
export default function BackgroundBlobs({ topColor, bottomColor }: BackgroundBlobsProps) {
  return (
    <>
      <div
        className="pointer-events-none absolute -top-40 -left-40 w-[600px] h-[600px] rounded-full opacity-30"
        style={{ background: `radial-gradient(circle, ${topColor} 0%, transparent 70%)` }}
      />
      <div
        className="pointer-events-none absolute -bottom-40 -right-40 w-[500px] h-[500px] rounded-full opacity-20"
        style={{ background: `radial-gradient(circle, ${bottomColor} 0%, transparent 70%)` }}
      />
    </>
  );
}
