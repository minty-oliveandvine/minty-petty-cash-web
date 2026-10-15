"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

import { SalesStep } from "@/components/report/SalesStep";

/**
 * A new report's Sales step: `/entity/<shortid>/<name>/petty-cash/reports/new/sale?transaction_date=`
 * - Flask's address for the same page, so a link into one works in the other.
 */
function SalesPage() {
  const params = useSearchParams();
  return <SalesStep day={params.get("transaction_date")} />;
}

export default function Page() {
  return (
    <Suspense>
      <SalesPage />
    </Suspense>
  );
}
