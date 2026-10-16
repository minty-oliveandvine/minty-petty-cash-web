"use client";

import { Suspense } from "react";

import { ReportHistory } from "@/components/history/ReportHistory";

/**
 * Report history (Part 15.4b): `/entity/<shortid>/<name>/petty-cash/reports` - Flask's address
 * for it - with its filters in the query (`?status=&start_date=&end_date=&page=&per_page=`).
 * The page reads the query with `useSearchParams`, hence the Suspense boundary.
 */
export default function Page() {
  return (
    <Suspense>
      <ReportHistory />
    </Suspense>
  );
}
