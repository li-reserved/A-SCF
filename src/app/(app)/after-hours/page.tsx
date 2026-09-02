import { Suspense } from "react";

import { AfterHoursDashboard } from "@/components/market/after-hours-dashboard";

export default function AfterHoursPage() {
  return (
    <Suspense fallback={<div className="h-72 animate-pulse rounded-md border bg-muted/30" />}>
      <AfterHoursDashboard />
    </Suspense>
  );
}
