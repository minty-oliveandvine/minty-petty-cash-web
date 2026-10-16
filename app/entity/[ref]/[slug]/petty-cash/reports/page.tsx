"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

import { ReportHistory } from "@/components/history/ReportHistory";
import { filtersFromAddress } from "@/lib/history";

/**
 * Report history: `/entity/<shortid>/<name>/petty-cash/reports?start_date=&end_date=&page=` -
 * Flask's address for the same page, so a link into one works in the other. The filters live in
 * the address: a new one (a search, a page, Back) is a fresh page, as Flask's reload was.
 */
function HistoryPage() {
  const params = useSearchParams();
  return <ReportHistory key={params.toString()} filters={filtersFromAddress(params)} />;
}

export default function Page() {
  return (
    <Suspense>
      <HistoryPage />
    </Suspense>
  );
}
