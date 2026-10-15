"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

import { ExpensesStep } from "@/components/report/ExpensesStep";

/**
 * A new report's Expenses step: `/entity/<shortid>/<name>/petty-cash/reports/new/expense?transaction_date=`
 * - Flask's address for the same page, so a link into one works in the other.
 */
function ExpensesPage() {
  const params = useSearchParams();
  return <ExpensesStep day={params.get("transaction_date")} />;
}

export default function Page() {
  return (
    <Suspense>
      <ExpensesPage />
    </Suspense>
  );
}
