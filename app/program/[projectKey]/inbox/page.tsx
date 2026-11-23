import { Suspense } from "react";
import InboxView from "@/components/milestone/InboxView";

export default function InboxPage() {
  return (
    <Suspense fallback={null}>
      <InboxView />
    </Suspense>
  );
}
