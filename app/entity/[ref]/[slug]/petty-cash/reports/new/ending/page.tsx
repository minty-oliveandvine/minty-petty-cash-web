"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

import { EndingStep } from "@/components/report/EndingStep";

/**
 * A new report's Ending step (the day's summary and Finish): `/entity/<shortid>/<name>/petty-cash/reports/new/ending?transaction_date=`
 * - Flask's address for the same page, so a link into one works in the other.
 */
function EndingPage() {
  const params = useSearchParams();
  return <EndingStep day={params.get("transaction_date")} />;
}

export default function Page() {
  return (
    <Suspense>
      <EndingPage />
    </Suspense>
  );
}
