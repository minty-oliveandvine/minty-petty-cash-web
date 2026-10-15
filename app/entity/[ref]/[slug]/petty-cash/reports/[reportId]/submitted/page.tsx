"use client";

import { useParams } from "next/navigation";

import { ReportOutcome } from "@/components/closing/ReportOutcome";
import { reportIdFromSegment } from "@/lib/report";

/**
 * The outcome page after Submit Daily Report (Part 15.12e):
 * `/entity/<shortid>/<name>/petty-cash/reports/<report id>/submitted` - Flask's address for its
 * "Report submitted" page.
 */
export default function Page() {
  const { reportId } = useParams<{ reportId: string }>();
  return <ReportOutcome reportId={reportIdFromSegment(reportId)} />;
}
