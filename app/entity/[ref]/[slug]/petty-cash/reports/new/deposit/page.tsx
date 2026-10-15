"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

import { DepositStep } from "@/components/report/DepositStep";

/**
 * A new report's Bank Deposit step: `/entity/<shortid>/<name>/petty-cash/reports/new/deposit?transaction_date=`
 * - Flask's address for the same page, so a link into one works in the other.
 */
function DepositPage() {
  const params = useSearchParams();
  return <DepositStep day={params.get("transaction_date")} />;
}

export default function Page() {
  return (
    <Suspense>
      <DepositPage />
    </Suspense>
  );
}
