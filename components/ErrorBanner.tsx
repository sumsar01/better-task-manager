interface ErrorBannerProps {
  message: string;
}

/**
 * Inline error banner for picker components.
 * Shown when a data-fetch fails inside a form card.
 */
export default function ErrorBanner({ message }: ErrorBannerProps) {
  return (
    <div className="bg-red-50 border border-red-200 text-red-600 rounded-xl px-4 py-3 text-xs leading-relaxed">
      <span className="font-semibold">Error: </span>{message}
    </div>
  );
}
