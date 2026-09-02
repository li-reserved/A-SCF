import { Suspense } from "react";

import { SecurityDashboard } from "@/components/market/security-dashboard";

export default function SecurityPage() {
  return (
    <Suspense fallback={<div className="h-72 animate-pulse rounded-md border bg-muted/30" />}>
      <SecurityDashboard />
    </Suspense>
  );
}
