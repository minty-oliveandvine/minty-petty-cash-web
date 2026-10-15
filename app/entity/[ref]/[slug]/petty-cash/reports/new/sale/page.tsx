"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

import { Sales } from "@/components/closing/Sales";

/**
 * The Daily Closing's second stage, "Sales":
 * `/entity/<shortid>/<name>/petty-cash/reports/new/sale?transaction_date=` - Flask's address for
 * its Sales page, kept so a link into one app works in the other.
 */
function SalesPage() {
  const params = useSearchParams();
  return <Sales day={params.get("transaction_date")} />;
}

export default function Page() {
  return (
    <Suspense>
      <SalesPage />
    </Suspense>
  );
}
