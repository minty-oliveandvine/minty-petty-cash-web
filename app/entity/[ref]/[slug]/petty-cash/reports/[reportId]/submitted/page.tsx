import { SubmittedPage } from "@/components/report/SubmittedPage";

/**
 * The page after a day is submitted: `/entity/<shortid>/<name>/petty-cash/reports/<report id>/submitted`
 * - Flask's address for the same page, so a link into one works in the other.
 */
export default async function Page({ params }: { params: Promise<{ reportId: string }> }) {
  const { reportId } = await params;
  return <SubmittedPage reportId={reportId} />;
}
