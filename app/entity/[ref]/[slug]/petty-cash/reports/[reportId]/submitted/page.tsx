"use client";

import { useParams } from "next/navigation";

import { ReportOutcome } from "@/components/closing/ReportOutcome";

/**
 * The outcome page after Submit Daily Report (Part 15.12e):
 * `/entity/<shortid>/<name>/petty-cash/reports/<report id>/submitted` - Flask's address for its
 * "Report submitted" page.
 */
export default function Page() {
  const { reportId } = useParams<{ reportId: string }>();
  return <ReportOutcome reportId={decoded(reportId)} />;
}

/** The id as typed: a segment can arrive percent-encoded; a malformed escape stays as written (the API 404s it). */
function decoded(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}
