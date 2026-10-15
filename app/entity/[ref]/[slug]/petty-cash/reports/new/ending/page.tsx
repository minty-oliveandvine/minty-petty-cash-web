"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

import { Close } from "@/components/closing/Close";

/**
 * The Daily Closing's fifth stage, "Close":
 * `/entity/<shortid>/<name>/petty-cash/reports/new/ending?transaction_date=` - Flask's address for
 * its Ending page, kept so a link into one app works in the other.
 */
function ClosePage() {
  const params = useSearchParams();
  return <Close day={params.get("transaction_date")} />;
}

export default function Page() {
  return (
    <Suspense>
      <ClosePage />
    </Suspense>
  );
}
