import { Suspense } from "react";

import { StrategyDashboard } from "@/components/market/strategy-dashboard";

export default function StrategyPage() {
  return (
    <Suspense fallback={<div className="h-72 animate-pulse rounded-md border bg-muted/30" />}>
      <StrategyDashboard />
    </Suspense>
  );
}
