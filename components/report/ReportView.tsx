"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { PhoneCard } from "@/components/flask/PhoneCard";
import { useToast } from "@/components/flask/Toasts";
import {
  DeleteReportModal,
  ShareButton,
  ShareModal,
  useEditReport,
  useShareLink,
} from "@/components/report/ReportActions";
import { LoadingOverlay, ReportBadge } from "@/components/report/ReportChrome";
import {
  EditLinesCard,
  LineEditor,
  ReasonEditor,
  WithdrawalCard,
} from "@/components/report/ReportEdits";
import { ReportSummary } from "@/components/report/ReportSummary";
import { entityAcronym } from "@/lib/acronym";
import { ApiError, pettyCashFetch } from "@/lib/apiClient";
import { getAuth } from "@/lib/auth";
import { pettyCashHome } from "@/lib/companyPages";
import { setFlash } from "@/lib/flash";
import { historyHref } from "@/lib/history";
import { datePill } from "@/lib/opening";
import { DELETED, summarySales, type DailyReport } from "@/lib/report";
import { useAuth } from "@/lib/useAuth";
import { stepHref } from "@/lib/wizardPages";

const UNREACHABLE = "We couldn't reach Petty Cash. Check your connection, then reload the page.";

/** Flask's big action buttons under the summary (`w-full mt-6`, the icon growing on hover). */
const ACTION =
  "group mt-6 flex w-full items-center justify-center gap-2 rounded-flask-xl px-4 py-3 font-medium text-flask-white shadow-flask-md transition-colors";
const ICON_GROW = "transition-transform duration-300 group-hover:scale-[1.2]";

/**
 * A submitted report's own view - a pixel-faithful port of the submitted-report mode of Flask's
 * ORIGINAL `report/ending.html`, at Flask's `/entity/<id>/petty-cash/reports/<report id>/summary`:
 * the report header (date, initials, the Submitted / Published badge), the same summary the Ending
 * step draws (ReportSummary.tsx), then Share, Delete Report, Edit Report and Close. Reads
 * `GET /reports/<id>` (Minty `petty_cash_api/routes/report.py`); each button shows only when
 * `permissions` allows it, and Close always.
 *
 * - Edit Report: `POST /reports/<id>/reopen`, then this app's Opening for the day (Flask's confirm
 *   first for a report that has been to Xero).
 * - Delete: Flask's modal (warning first that the report is in Xero, the owner's rule of 2026-10-15),
 *   `DELETE /reports/<id>`, then the dashboard with "That report's deleted.".
 * - Share: `POST /reports/<id>/share-link` into Flask's Share Report modal.
 * - Close: report history, as Flask's did.
 *
 * - Edit Details (`permissions.edit_details`): Flask's constrained report_edit mode, in place on
 *   this page (ReportEdits.tsx) - the difference reason in its box, "Addition to Cash Drawer"'s
 *   Withdrawal from, and each expense line's editor. Each edit answers the Daily Report and the
 *   page is drawn from it again. "Done editing" leaves the mode; Close hides while in it, as Flask's.
 *
 * Every refusal shows the API's sentence and keeps the page.
 */
export function ReportView({ reportId }: { reportId: string }) {
  const toast = useToast();
  const auth = useAuth();
  const router = useRouter();
  const [report, setReport] = useState<DailyReport | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    pettyCashFetch<DailyReport>(`/reports/${encodeURIComponent(reportId)}`)
      .then((answer) => {
        if (!live) return;
        const company = getAuth();
        // a draft has no submitted view: its summary is the wizard's Ending step
        if (answer.status === "draft" && company)
          router.replace(
            stepHref(company.entityId, company.entityName, "ending", answer.transaction_date),
          );
        else setReport(answer);
      })
      .catch((err: unknown) => {
        if (!live || (err instanceof ApiError && err.status === 401)) return;
        setFailed(true);
        toast(err instanceof ApiError ? err.message : UNREACHABLE, "error");
      });
    return () => {
      live = false;
    };
  }, [reportId, toast, router]);

  const acronym = entityAcronym(auth?.entityName);
  if (!report || !auth) {
    return (
      <PhoneCard
        acronym={acronym}
        datePill=""
        backHref={auth ? pettyCashHome(auth.entityId, auth.entityName) : undefined}
      >
        {!failed ? (
          <p className="text-sm text-flask-gray-500" role="status">
            Loading…
          </p>
        ) : null}
      </PhoneCard>
    );
  }
  return (
    <ReportViewBody
      report={report}
      onSaved={setReport}
      entityId={auth.entityId}
      entityName={auth.entityName}
      acronym={acronym}
    />
  );
}

function ReportViewBody({
  report,
  onSaved,
  entityId,
  entityName,
  acronym,
}: {
  report: DailyReport;
  /** An edit's answer: the whole Daily Report, drawn again. */
  onSaved: (report: DailyReport) => void;
  entityId: string;
  entityName: string;
  acronym: string;
}) {
  const toast = useToast();
  const router = useRouter();
  const home = pettyCashHome(entityId, entityName);
  const path = `/reports/${encodeURIComponent(report.report_id)}`;
  const share = useShareLink(report.report_id);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  // a ref, not state: a second click in the same frame must see the first one
  const acting = useRef(false);
  const edit = useEditReport(entityId, entityName, acting);
  const [editingDetails, setEditingDetails] = useState(false);
  const [lineId, setLineId] = useState<string | null>(null);
  const closeLine = useCallback(() => setLineId(null), []);

  function refused(err: unknown) {
    acting.current = false;
    if (err instanceof ApiError && err.status === 401) return;
    setBusy(null);
    toast(err instanceof ApiError ? err.message : UNREACHABLE, "error");
  }

  async function remove() {
    if (acting.current) return;
    acting.current = true;
    setConfirmDelete(false);
    setBusy("Deleting report...");
    try {
      await pettyCashFetch(path, { method: "DELETE" });
      setBusy("Success, Redirecting to Dashboard...");
      setFlash(DELETED, "success");
      router.push(home);
    } catch (err) {
      refused(err);
    }
  }

  const may = report.permissions;
  // the edits show only while the API allows them: an answer without edit_details ends the mode
  const details = may.edit_details && editingDetails;
  const editedLine =
    details && lineId ? report.expenses.lines.find((l) => l.id === lineId) : undefined;

  const overlays = (
    <>
      {editedLine ? (
        <LineEditor
          key={editedLine.id}
          report={report}
          line={editedLine}
          onSaved={onSaved}
          onClose={closeLine}
        />
      ) : null}
      {busy ? <LoadingOverlay text={busy} /> : null}
      {share.link ? <ShareModal url={share.link.url} onClose={share.close} /> : null}
      {confirmDelete ? (
        <DeleteReportModal
          wasPublished={report.was_published}
          onCancel={() => setConfirmDelete(false)}
          onDelete={() => void remove()}
        />
      ) : null}
    </>
  );

  return (
    <PhoneCard
      acronym={acronym}
      datePill={datePill(report.transaction_date)}
      badge={
        <ReportBadge
          draft={{
            id: report.report_id,
            status: report.status ?? "",
            current_section: null,
            completed_sections: [],
            xero_integrated: report.xero_integrated,
            publishing_status: report.publishing_status,
          }}
        />
      }
      backHref={home}
      overlays={overlays}
    >
      <ReportSummary
        code={report.currency_code}
        sales={summarySales(report.sales)}
        yesterday={report.sales.yesterday_total}
        history={report.sales.history}
        lines={report.expenses.lines}
        cash={report.cash}
        reasonEditor={
          details && report.cash.difference.kind !== "none" ? (
            <ReasonEditor key={report.cash.difference.reason} report={report} onSaved={onSaved} />
          ) : undefined
        }
      />

      {details && report.cash.cash_addition > 0 ? (
        <WithdrawalCard
          key={report.cash.cash_addition_type ?? ""}
          report={report}
          onSaved={onSaved}
        />
      ) : null}
      {details && report.expenses.lines.length > 0 ? (
        <EditLinesCard report={report} onOpen={(line) => setLineId(line.id)} />
      ) : null}

      {may.share ? (
        <div className="mt-6 flex items-start justify-center gap-8 sm:gap-12">
          <ShareButton onClick={() => void share.open()} />
        </div>
      ) : null}

      {may.delete ? (
        <button
          type="button"
          onClick={() => setConfirmDelete(true)}
          disabled={busy !== null}
          className={`${ACTION} bg-flask-red hover:bg-flask-red/80`}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className={ICON_GROW}
            aria-hidden="true"
          >
            <path
              d="M11.7497 3.50003H15.5V5.00013H13.9996V14.75C13.9996 14.96 13.9274 15.1375 13.7824 15.2825C13.6375 15.4275 13.4601 15.5 13.2501 15.5H2.74994C2.53994 15.5 2.36258 15.4275 2.21759 15.2825C2.0726 15.1375 2.00038 14.96 2.00038 14.75V5.00013H0.5V3.50003H4.25031V1.2502C4.25031 1.04021 4.32253 0.862556 4.46752 0.717527C4.61252 0.5725 4.78988 0.5 4.99987 0.5H11.0001C11.2101 0.5 11.3875 0.5725 11.5325 0.717527C11.6775 0.862556 11.7497 1.04021 11.7497 1.2502V3.50003ZM12.4999 5.00013H3.50013V14.0001H12.4999V5.00013ZM5.75006 7.25011H7.24981V11.7501H5.75006V7.25011ZM8.75019 7.25011H10.2499V11.7501H8.75019V7.25011ZM5.75006 2.00009V3.50003H10.2499V2.00009H5.75006Z"
              fill="currentColor"
            />
          </svg>
          <span>Delete Report</span>
        </button>
      ) : null}

      {may.edit ? (
        <button
          type="button"
          onClick={() => void edit(report.report_id, report.was_published)}
          disabled={busy !== null}
          className={`${ACTION} bg-flask-olive hover:bg-flask-olive/80`}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth="1.5"
            stroke="currentColor"
            className={`size-6 ${ICON_GROW}`}
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125"
            />
          </svg>
          <span>Edit Report</span>
        </button>
      ) : null}

      {may.edit_details ? (
        <button
          type="button"
          onClick={() => {
            setLineId(null);
            setEditingDetails((on) => !on);
          }}
          className={`${ACTION} bg-flask-olive hover:bg-flask-olive/80`}
        >
          {editingDetails ? (
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth="1.5"
              stroke="currentColor"
              className={`size-6 ${ICON_GROW}`}
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
          ) : (
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth="1.5"
              stroke="currentColor"
              className={`size-6 ${ICON_GROW}`}
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125"
              />
            </svg>
          )}
          <span>{editingDetails ? "Done editing" : "Edit Details"}</span>
        </button>
      ) : null}

      {!details ? (
        <button
          type="button"
          onClick={() => router.push(historyHref(entityId, entityName))}
          className={`${ACTION} bg-flask-teal hover:bg-flask-teal/80`}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth="1.5"
            stroke="currentColor"
            className={`size-6 ${ICON_GROW}`}
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="m9.75 9.75 4.5 4.5m0-4.5-4.5 4.5M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
            />
          </svg>
          <span>Close</span>
        </button>
      ) : null}
    </PhoneCard>
  );
}
