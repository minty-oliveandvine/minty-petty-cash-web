"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

import { OpeningStep } from "@/components/report/OpeningStep";

/**
 * A new report's Opening step: `/entity/<shortid>/<name>/petty-cash/reports/new/opening?transaction_date=`
 * - Flask's address for the same page, so a link into one works in the other.
 */
function OpeningPage() {
  const params = useSearchParams();
  return <OpeningStep day={params.get("transaction_date")} />;
}

export default function Page() {
  return (
    <Suspense>
      <OpeningPage />
    </Suspense>
  );
}
