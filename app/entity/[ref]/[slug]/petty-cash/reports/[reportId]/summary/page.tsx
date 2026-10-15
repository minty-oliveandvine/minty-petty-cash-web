import { ReportView } from "@/components/report/ReportView";

/**
 * A submitted report's own view (its Daily Report, with Share, Delete, Edit Report and Close):
 * `/entity/<shortid>/<name>/petty-cash/reports/<report id>/summary` - Flask's address for the same
 * page, so a link into one works in the other.
 */
export default async function Page({ params }: { params: Promise<{ reportId: string }> }) {
  const { reportId } = await params;
  return <ReportView reportId={reportId} />;
}
