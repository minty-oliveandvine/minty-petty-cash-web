"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useRef, useState, type ReactNode } from "react";

import { Button, buttonClass, Icon, InlineAlert, PageBanner, StatusPill } from "@minty/shared/ui";

import {
  StagePage,
  stageSteps,
  WorkflowHeader,
  type StageContext,
} from "@/components/closing/Stage";
import { ApiError, pettyCashFetch } from "@/lib/apiClient";
import {
  cashSummary,
  closeDifference,
  closeGate,
  closeReadiness,
  differenceOf,
  expensesSummary,
  salesSummary,
  submitRefusal,
  type ClosePage,
  type FixLink,
  type Submitted,
} from "@/lib/close";
import { money } from "@/lib/money";
import { reportStatus } from "@/lib/reportStatus";
import { outcomeHref, stepHref } from "@/lib/wizardPages";

const STAGE = "Close";
const GUIDANCE = "One last look before today is closed.";
const NOT_SUBMITTED = "We couldn't submit the day. Check your connection, then try again.";

/**
 * The Daily Closing's fifth stage, "Close" (Part 15.9g Work Verification / 15.15e; Flask's Ending
 * section, as its Daily Closing Phase 1 - Minty 4e004d2): "Is this correct and ready to submit?" -
 * a readiness banner ("Ready to submit", or what is in the way), then ONE summary card with a row
 * per stage - Addition to Drawer, Sales, Expenses, Cash Count - each its total and an Edit link
 * (the per-item breakdowns are the stages' own), the cash difference highlighted inside the Cash
 * Count row, what submitting does, and one action, Submit Daily Report. No KPIs or charts
 * (D15-03). Every figure is the API's; nothing is typed here, so there is nothing to hold. In
 * Stage.tsx's frame.
 *
 * Reads `GET /reports/close` and submits through `POST /reports/submit` (Minty
 * `petty_cash_api/routes/close.py`), then opens the outcome page (ReportOutcome.tsx). Its rules
 * are lib/close.ts.
 */
export function Close({ day }: { day: string | null }) {
  return (
    <StagePage<ClosePage>
      path="/reports/close"
      day={day}
      title={STAGE}
      guidance={GUIDANCE}
      here="close"
    >
      {(page, context) => <Verification page={page} {...context} />}
    </StagePage>
  );
}

type Refusal = { message: string; action: FixLink | null } | null;

/** The stage once the read has answered (exported for its component tests). */
export function Verification({
  page,
  entityId,
  entityName,
  home,
  notice,
}: { page: ClosePage } & StageContext) {
  const router = useRouter();
  const reasonId = useId();
  const whenId = useId();
  // A ref, not state: a double click lands twice before React re-renders, and must send once.
  const inFlight = useRef(false);
  const [submitting, setSubmitting] = useState(false);
  const [refusal, setRefusal] = useState<Refusal>(null);

  const code = page.currency_code;
  const day = page.transaction_date;
  const amountText = (amount: number) => money(amount, code);
  const gate = closeGate(page);
  const readiness = closeReadiness(page);
  const progress = page.draft ?? { current_section: null, completed_sections: [] };
  const edit = (step: Parameters<typeof stepHref>[2]) => stepHref(entityId, entityName, step, day);
  const linkTo = (action: FixLink) => ("home" in action ? home : edit(action.step));
  const diff = differenceOf(page.cash.difference.amount);
  const lines = page.expenses.lines;

  async function submit() {
    if (inFlight.current || gate) return;
    inFlight.current = true;
    setSubmitting(true);
    setRefusal(null);
    try {
      const answer = await pettyCashFetch<Submitted>("/reports/submit", {
        method: "POST",
        body: { transaction_date: day },
      });
      // In place of Close (Back from the outcome must not land on a day that is no longer open);
      // the button stays busy until the outcome page is up.
      router.replace(outcomeHref(entityId, entityName, answer.report_id));
    } catch (err) {
      // A 401 has already gone back through the hand-off.
      if (err instanceof ApiError && err.status === 401) return;
      const body =
        err instanceof ApiError ? (err.body as { to?: unknown; report_id?: unknown } | null) : null;
      if (body?.to === "submitted" && typeof body.report_id === "string") {
        // Someone else submitted the day meanwhile: its outcome says so.
        router.replace(outcomeHref(entityId, entityName, body.report_id));
        return;
      }
      inFlight.current = false;
      setSubmitting(false);
      // Nothing was written: the sentence, and the way to the stage that fixes it.
      setRefusal(
        err instanceof ApiError
          ? submitRefusal(err.message, body?.to)
          : { message: NOT_SUBMITTED, action: null },
      );
    }
  }

  return (
    <>
      <WorkflowHeader
        home={home}
        day={day}
        title={STAGE}
        guidance={GUIDANCE}
        status={reportStatus(page.draft)}
        steps={stageSteps(entityId, entityName, progress, "close", day)}
      />
      {notice}

      {/* Readiness: the business-rule gate (15.9e), a difference without its reason, or Ready to submit. */}
      {gate ? (
        <PageBanner
          tone="warning"
          title={gate.title}
          action={
            gate.action ? (
              <Link href={linkTo(gate.action)} className={buttonClass("link")}>
                {gate.action.label}
              </Link>
            ) : undefined
          }
        >
          {gate.message}
        </PageBanner>
      ) : readiness.kind === "no-reason" ? (
        <InlineAlert
          tone="warning"
          title={readiness.title}
          action={
            <Link href={edit("deposit")} className={buttonClass("link")}>
              Go to Cash Count
            </Link>
          }
        >
          No reason was given yet.
        </InlineAlert>
      ) : readiness.kind === "ready" ? (
        <div
          className="flex items-start gap-3 rounded-lg border border-border-selected bg-state-selected p-4"
          role="status"
        >
          <span
            className="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-border-selected text-action-on-primary"
            aria-hidden
          >
            <Icon name="check" size="md" />
          </span>
          <div className="min-w-0">
            <p className="font-semibold text-text-primary">Ready to submit</p>
            <p className="mt-0.5 text-body-s text-text-secondary">{readiness.text}</p>
          </div>
        </div>
      ) : null}

      {/* One summary card, a row per stage; only what needs attention is highlighted. */}
      <div className="rounded-xl border border-border-subtle bg-surface-card px-4 sm:px-6">
        <SummaryRow
          title="Addition to Drawer"
          edit={edit("opening")}
          amount={amountText(page.cash_addition)}
        >
          Starting cash balance <span translate="no">{amountText(page.opening_balance)}</span>
        </SummaryRow>
        <SummaryRow title="Sales" edit={edit("sales")} amount={amountText(page.sales.total)}>
          <span translate="no">{salesSummary(page)}</span>
        </SummaryRow>
        <SummaryRow
          title={`Expenses (${lines.length})`}
          editLabel="Expenses"
          edit={edit("expenses")}
          amount={amountText(page.expenses.total)}
        >
          {expensesSummary(lines)}
        </SummaryRow>
        <SummaryRow
          title="Cash Count"
          edit={edit("deposit")}
          amount={amountText(page.cash.counted)}
          note={
            diff.kind !== "none" ? (
              // 15.10b: short/over in words as a Warning pill, never a red number; the reason under it.
              <div className="col-span-full flex flex-col items-start gap-1.5 rounded-md bg-status-warning-bg p-3 text-body-s text-status-warning-ink">
                <span translate="no">
                  <StatusPill label={closeDifference(page)} tone="warning" />
                </span>
                {page.cash.difference.reason.trim() ? (
                  <p className="break-words">{page.cash.difference.reason.trim()}</p>
                ) : null}
              </div>
            ) : null
          }
        >
          <span translate="no">{cashSummary(page)}</span>
        </SummaryRow>
      </div>

      <section aria-labelledby={whenId} className="text-body-s text-text-secondary">
        <h2 id={whenId} className="mb-1 text-body-m font-semibold text-text-primary">
          When you submit
        </h2>
        <p>
          Today&apos;s numbers are locked and the Daily Report is saved. You can send it to Xero
          straight after.
        </p>
      </section>

      {refusal ? (
        <InlineAlert
          tone="danger"
          action={
            refusal.action ? (
              <Link href={linkTo(refusal.action)} className={buttonClass("link")}>
                {refusal.action.label}
              </Link>
            ) : undefined
          }
        >
          {refusal.message}
        </InlineAlert>
      ) : null}

      {/* Part 15.2, not sticky: Submit first and full width on a phone, its reason under it; [Save & Exit] [Submit] from 640. */}
      <div className="flex flex-col gap-2 sm:flex-row-reverse sm:items-start sm:justify-start sm:gap-3">
        <div className="flex flex-col gap-1 sm:items-end">
          <Button
            kind="primary"
            className="w-full sm:w-auto"
            processing={submitting}
            processingLabel="Submitting…"
            disabled={Boolean(gate) || submitting}
            aria-describedby={gate ? reasonId : undefined}
            onClick={() => void submit()}
          >
            Submit Daily Report
          </Button>
          {gate ? (
            <p id={reasonId} className="text-body-s text-text-secondary sm:text-right">
              {gate.reason}
            </p>
          ) : null}
        </div>
        {/* Close holds nothing unsaved: every stage saved itself, so Save & Exit is the way home. */}
        <Link href={home} className={`${buttonClass("secondary")} w-full sm:w-auto`}>
          Save &amp; Exit
        </Link>
      </div>
    </>
  );
}

/**
 * One stage's summary row: its name and one line under it, its total and an Edit link at the
 * right (the amount wraps before it is ever clipped), and, when the stage needs attention, a note
 * across the row.
 */
function SummaryRow({
  title,
  editLabel,
  edit,
  amount,
  note,
  children,
}: {
  title: string;
  /** The stage's name for the Edit link's accessible name, when the title carries more ("Expenses (2)"). */
  editLabel?: string;
  edit: string;
  amount: string;
  note?: ReactNode;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <section
      aria-labelledby={id}
      className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 border-b border-border-subtle py-4 last:border-b-0"
    >
      <div className="min-w-0">
        <h2 id={id} className="break-words text-body-l font-semibold text-text-primary">
          {title}
        </h2>
        <p className="mt-0.5 break-words text-body-s text-text-secondary">{children}</p>
      </div>
      <div className="flex min-w-0 flex-wrap items-center justify-end gap-x-1">
        <span
          className="break-all text-right text-body-l font-semibold text-text-primary"
          translate="no"
        >
          {amount}
        </span>
        <Link
          href={edit}
          className={`${buttonClass("link")} min-w-11 shrink-0`}
          aria-label={`Edit ${editLabel ?? title}`}
        >
          Edit
        </Link>
      </div>
      {note}
    </section>
  );
}
