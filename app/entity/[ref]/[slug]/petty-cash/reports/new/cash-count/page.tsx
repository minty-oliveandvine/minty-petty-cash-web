"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

import { CashCount } from "@/components/closing/CashCount";

/**
 * The Daily Closing's fourth stage, "Cash Count":
 * `/entity/<shortid>/<name>/petty-cash/reports/new/cash-count?transaction_date=` - Flask's address
 * for its Cash Count page, kept so a link into one app works in the other. Flask's Bank Deposit
 * address (`reports/new/deposit`) lands here too: the deposit is this stage's first section (D15-05).
 */
function CashCountPage() {
  const params = useSearchParams();
  return <CashCount day={params.get("transaction_date")} />;
}

export default function Page() {
  return (
    <Suspense>
      <CashCountPage />
    </Suspense>
  );
}
