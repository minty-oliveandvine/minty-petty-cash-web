"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

import { CashCountStep } from "@/components/report/CashCountStep";

/**
 * A new report's Cash Count step: `/entity/<shortid>/<name>/petty-cash/reports/new/cash-count?transaction_date=`
 * - Flask's address for the same page, so a link into one works in the other.
 */
function CashCountPage() {
  const params = useSearchParams();
  return <CashCountStep day={params.get("transaction_date")} />;
}

export default function Page() {
  return (
    <Suspense>
      <CashCountPage />
    </Suspense>
  );
}
