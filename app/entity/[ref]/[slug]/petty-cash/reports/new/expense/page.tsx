"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

import { Expenses } from "@/components/closing/Expenses";

/**
 * The Daily Closing's third stage, "Expenses":
 * `/entity/<shortid>/<name>/petty-cash/reports/new/expense?transaction_date=` - Flask's address
 * for its Expenses page, kept so a link into one app works in the other.
 */
function ExpensesPage() {
  const params = useSearchParams();
  return <Expenses day={params.get("transaction_date")} />;
}

export default function Page() {
  return (
    <Suspense>
      <ExpensesPage />
    </Suspense>
  );
}
