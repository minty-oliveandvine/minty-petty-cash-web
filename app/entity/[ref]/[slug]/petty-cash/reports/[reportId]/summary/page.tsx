"use client";

import { useParams } from "next/navigation";

import { DailyReport } from "@/components/closing/DailyReport";
import { reportIdFromSegment } from "@/lib/report";

/**
 * The Daily Report (Part 15.7) of a submitted day:
 * `/entity/<shortid>/<name>/petty-cash/reports/<report id>/summary` - Flask's id address for its
 * report summary.
 */
export default function Page() {
  const { reportId } = useParams<{ reportId: string }>();
  return <DailyReport reportId={reportIdFromSegment(reportId)} />;
}
