import { notFound } from "next/navigation";

import { ReportStepView } from "@/components/report/view/ReportStepView";
import { isReportStepView } from "@/lib/companyPages";

/**
 * One step of a submitted report, read-only:
 * `/entity/<shortid>/<name>/petty-cash/reports/<report id>/<opening|sale|expense|deposit|cash-count>`
 * - Flask's address for the same view, reached from the report's stepper. Any other segment is a 404
 * (`summary` and `submitted` are their own pages beside this one).
 */
export default async function Page({
  params,
}: {
  params: Promise<{ reportId: string; step: string }>;
}) {
  const { reportId, step } = await params;
  if (!isReportStepView(step)) notFound();
  return <ReportStepView reportId={reportId} step={step} />;
}
