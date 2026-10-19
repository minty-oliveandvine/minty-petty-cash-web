"use client";

import { useEffect, useMemo, useState } from "react";

import { PhoneCard } from "@/components/flask/PhoneCard";
import { ReportBadge } from "@/components/report/ReportChrome";
import { ReportSummary } from "@/components/report/ReportSummary";
import { ApiError, HOUSE_FALLBACK, pettyCashPublicFetch } from "@/lib/apiClient";
import { datePill } from "@/lib/opening";
import { SHARE_REFUSED, decodeSegments, parseSharedReport, sharePathParts, sharedBadge, shareRefusal, sharedReportApiPath, type SharedReport } from "@/lib/share";

type Read = { report: SharedReport } | { refused: string } | null;

/**
 * A shared Daily Report - Flask's ORIGINAL `report/ending.html` as a shared link drew it
 * (`is_shared_link`, Minty `1c25b35^1`): the header with only the day, the company and the badge
 * (no chevron, no person, no menu), no stepper, then the summary's cards (ReportSummary.tsx, the
 * submitted view's own) and nothing after them - no Share, Delete, Edit or Close, and no receipt.
 *
 * Reads `GET /api/petty-cash/v1/public/share/<initials>/<date>/<secret>` with no bearer, even for a
 * signed-in person (lib/apiClient.ts `pettyCashPublicFetch`). An address that is not a share path
 * is refused here without asking. A refusal says Flask's sentence for its status - never the API's
 * text, the address or the secret.
 */
export function SharedReportView({ segments }: { segments: string[] }) {
  const parts = useMemo(() => sharePathParts(decodeSegments(segments)), [segments]);
  const [read, setRead] = useState<Read>(null);

  useEffect(() => {
    if (!parts) return;
    let live = true;
    pettyCashPublicFetch(sharedReportApiPath(parts))
      .then((body) => {
        if (!live) return;
        const report = parseSharedReport(body);
        setRead(report ? { report } : { refused: HOUSE_FALLBACK });
      })
      .catch((err: unknown) => {
        if (live) setRead({ refused: shareRefusal(err instanceof ApiError ? err.status : null) });
      });
    return () => {
      live = false;
    };
  }, [parts]);

  const report = read && "report" in read ? read.report : null;
  useEffect(() => {
    // Flask's title, "Report Summary - <company>"
    if (report?.companyName) document.title = `Report Summary - ${report.companyName}`;
  }, [report]);

  const refused = !parts ? SHARE_REFUSED.gone : read && "refused" in read ? read.refused : null;
  if (!report) {
    return (
      <PhoneCard publicView acronym="" datePill="">
        {refused ? (
          <p role="alert" className="mt-10 text-center text-sm text-flask-gray-700">
            {refused}
          </p>
        ) : (
          <p className="text-sm text-flask-gray-500" role="status">
            Loading…
          </p>
        )}
      </PhoneCard>
    );
  }

  return (
    <PhoneCard publicView acronym={report.companyName} datePill={datePill(report.day)} badge={<ReportBadge draft={sharedBadge(report.statusTone, report.statusLabel)} />}>
      <ReportSummary code={report.code} sales={report.sales} yesterday={report.yesterday} history={report.history} lines={report.lines} cash={report.cash} />
    </PhoneCard>
  );
}
