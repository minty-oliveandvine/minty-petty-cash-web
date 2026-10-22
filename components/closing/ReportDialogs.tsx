"use client";

/**
 * Edit report and Delete report - the Part 14 Confirmation modals of a submitted report, shared by
 * the Daily Report (DailyReport.tsx) and the report history (components/history/ReportHistory.tsx).
 * Each sends its call once (a ref guards it), keeps its action busy until the answer, and shows a
 * refusal's sentence inside the modal, which stays open with its action back. Where a report goes
 * after a delete is the page's (`onDeleted`).
 */

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { Button, InlineAlert, Modal } from "@minty/shared/ui";

import { openStep } from "@/components/closing/Stage";
import { ApiError, pettyCashFetch } from "@/lib/apiClient";
import { formatWeekdayDay } from "@/lib/dates";
import { deleteWarning, editWarning, type Deleted, type Reopened } from "@/lib/report";

const NOT_REOPENED =
  "We couldn't open the report for editing. Check your connection, then try again.";
const NOT_DELETED = "We couldn't delete the report. Check your connection, then try again.";

/** What both dialogs need of a report: its id, its day, and whether it has been to Xero. */
export type DialogReport = { id: string; day: string; was_published: boolean };

/** A Xero warning inside a confirmation (Warning tone, the owner's words). */
function XeroWarning({ warning }: { warning: { title: string; body: string } | null }) {
  return warning ? (
    <InlineAlert tone="warning" title={warning.title}>
      {warning.body}
    </InlineAlert>
  ) : null;
}

/**
 * Edit report (Flask's page asks the same): the report goes back to a draft, then Addition to
 * Drawer opens (`openStep`). A report that has been to Xero warns first.
 */
export function EditReportDialog({
  report,
  entityId,
  entityName,
  onCancel,
}: {
  report: DialogReport;
  entityId: string;
  entityName: string;
  onCancel: () => void;
}) {
  const router = useRouter();
  const cancel = useRef<HTMLButtonElement>(null);
  // A ref, not state: a double click lands twice before React re-renders, and must send once.
  const inFlight = useRef(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const warning = editWarning(report);

  async function confirm() {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setProblem(null);
    try {
      const answer = await pettyCashFetch<Reopened>(
        `/reports/${encodeURIComponent(report.id)}/reopen`,
        { method: "POST" },
      );
      // The button stays busy until the stage is up.
      openStep(
        (href) => router.push(href),
        entityId,
        entityName,
        "opening",
        answer.transaction_date,
      );
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return;
      inFlight.current = false;
      setBusy(false);
      setProblem(err instanceof ApiError ? err.message : NOT_REOPENED);
    }
  }

  return (
    <Modal
      open
      role="alertdialog"
      onRequestClose={() => !busy && onCancel()}
      initialFocus={cancel}
      title="Edit this report?"
      description="It goes back to a draft so every stage can be changed, then you submit it again."
      footer={
        <>
          <Button ref={cancel} kind="secondary" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button
            kind="primary"
            onClick={() => void confirm()}
            processing={busy}
            processingLabel="Opening…"
          >
            Edit report
          </Button>
        </>
      }
    >
      {warning || problem ? (
        <div className="flex flex-col gap-3">
          <XeroWarning warning={warning} />
          {problem ? <InlineAlert tone="danger">{problem}</InlineAlert> : null}
        </div>
      ) : null}
    </Modal>
  );
}

/**
 * Delete report, Destructive: what goes and that it can't be undone, Cancel focused first, Delete
 * report in Danger. A report that has been to Xero MAY be deleted, but the modal warns first (the
 * owner, 2026-10-15). After the `DELETE`, `onDeleted` has the API's answer.
 */
export function DeleteReportDialog({
  report,
  onCancel,
  onDeleted,
}: {
  report: DialogReport;
  onCancel: () => void;
  onDeleted: (answer: Deleted) => void;
}) {
  const cancel = useRef<HTMLButtonElement>(null);
  const inFlight = useRef(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const warning = deleteWarning(report);

  async function confirm() {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setProblem(null);
    try {
      const answer = await pettyCashFetch<Deleted>(`/reports/${encodeURIComponent(report.id)}`, {
        method: "DELETE",
      });
      onDeleted(answer);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return;
      inFlight.current = false;
      setBusy(false);
      setProblem(err instanceof ApiError ? err.message : NOT_DELETED);
    }
  }

  return (
    <Modal
      open
      role="alertdialog"
      onRequestClose={() => !busy && onCancel()}
      initialFocus={cancel}
      title="Delete this report?"
      description={
        <>
          <span className="font-semibold">
            The Daily Report for {formatWeekdayDay(report.day)} is deleted with its expenses and
            receipts.
          </span>{" "}
          This can&apos;t be undone.
        </>
      }
      footer={
        <>
          <Button ref={cancel} kind="secondary" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button
            kind="danger"
            onClick={() => void confirm()}
            processing={busy}
            processingLabel="Deleting…"
          >
            Delete report
          </Button>
        </>
      }
    >
      {warning || problem ? (
        <div className="flex flex-col gap-3">
          <XeroWarning warning={warning} />
          {problem ? <InlineAlert tone="danger">{problem}</InlineAlert> : null}
        </div>
      ) : null}
    </Modal>
  );
}
