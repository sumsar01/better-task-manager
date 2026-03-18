import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";

interface ErrorBannerProps {
  message: string;
}

/**
 * Inline error banner for picker components.
 * Shown when a data-fetch fails inside a form card.
 */
export default function ErrorBanner({ message }: ErrorBannerProps) {
  return (
    <Alert variant="destructive" className="py-2.5 text-xs">
      <AlertCircle className="h-3.5 w-3.5" />
      <AlertDescription className="text-xs leading-relaxed">
        <span className="font-semibold">Error: </span>{message}
      </AlertDescription>
    </Alert>
  );
}
