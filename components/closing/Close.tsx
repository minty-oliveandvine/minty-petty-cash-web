"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useRef, useState, type ReactNode } from "react";

import { Button, buttonClass, InlineAlert, PageBanner } from "@minty/shared/ui";

import { StagePage, stageSteps, WorkflowHeader, type StageContext } from "@/components/closing/Stage";
import { signedMoney } from "@/lib/addition";
import { ApiError, pettyCashFetch } from "@/lib/apiClient";
import {
  closeDifference,
  closeGate,
  differenceOf,
  expenseLabel,
  receiptsText,
  salesRows,
  submitRefusal,
  type ClosePage,
  type FixLink,
  type Submitted,
} from "@/lib/close";
import { differenceText } from "@/lib/cashCount";
import { formatMoney } from "@/lib/money";
import { reportStatus } from "@/lib/reportStatus";
import { outcomeHref, stepHref } from "@/lib/wizardPages";

const STAGE = "Close";
const GUIDANCE = "Check the day, then submit the Daily Report.";
const NOT_SUBMITTED = "We couldn't submit the day. Check your connection, then try again.";

/**
 * The Daily Closing's fifth stage, "Close" (Part 15.9g Work Verification / 15.15e; Flask's Ending
 * section): a read-only summary of every stage, each with an Edit link back to it - Addition to
 * Drawer, Sales, Expenses, Cash Count - then the closing balance, and one action, Submit Daily
 * Report. Every figure is the API's; nothing is typed here, so there is nothing to hold. In
 * Stage.tsx's frame.
 *
 * Reads `GET /reports/close` and submits through `POST /reports/submit` (Minty
 * `petty_cash_api/routes/close.py`), then opens the outcome page (ReportOutcome.tsx). Its rules
 * are lib/close.ts.
 */
export function Close({ day }: { day: string | null }) {
  return (
    <StagePage<ClosePage> path="/reports/close" day={day} title={STAGE} guidance={GUIDANCE} here="close">
      {(page, context) => <Verification page={page} {...context} />}
    </StagePage>
  );
}

type Refusal = { message: string; action: FixLink | null } | null;

function Verification({ page, entityId, entityName, home, notice }: { page: ClosePage } & StageContext) {
  const router = useRouter();
  const reasonId = useId();
  // A ref, not state: a double click lands twice before React re-renders, and must send once.
  const inFlight = useRef(false);
  const [submitting, setSubmitting] = useState(false);
  const [refusal, setRefusal] = useState<Refusal>(null);

  const code = page.currency_code;
  const day = page.transaction_date;
  const money = (amount: number) => formatMoney(amount, code);
  const gate = closeGate(page);
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
      const answer = await pettyCashFetch<Submitted>("/reports/submit", { method: "POST", json: { transaction_date: day } });
      // In place of Close (Back from the outcome must not land on a day that is no longer open);
      // the button stays busy until the outcome page is up.
      router.replace(outcomeHref(entityId, entityName, answer.report_id));
    } catch (err) {
      // A 401 has already gone back through the hand-off.
      if (err instanceof ApiError && err.status === 401) return;
      const body = err instanceof ApiError ? (err.body as { to?: unknown; report_id?: unknown } | null) : null;
      if (body?.to === "submitted" && typeof body.report_id === "string") {
        // Someone else submitted the day meanwhile: its outcome says so.
        router.replace(outcomeHref(entityId, entityName, body.report_id));
        return;
      }
      inFlight.current = false;
      setSubmitting(false);
      // Nothing was written: the sentence, and the way to the stage that fixes it.
      setRefusal(err instanceof ApiError ? submitRefusal(err.message, body?.to) : { message: NOT_SUBMITTED, action: null });
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

      {gate ? (
        // Part 15.9e business-rule gate: the rule, the reason, one action - the stage that fixes it.
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
      ) : null}

      <div className="flex flex-col gap-6 rounded-xl border border-border-subtle bg-surface-card p-4 sm:p-6">
        <Section title="Addition to Drawer" edit={edit("opening")}>
          <Rows>
            <Row label="Starting cash balance" value={money(page.opening_balance)} />
            <Row label="Added to the drawer" value={money(page.cash_addition)} />
          </Rows>
        </Section>

        <Section title="Sales" edit={edit("sales")} divided>
          <Rows>
            {salesRows(page).map((row) => (
              <Row key={row.key} label={row.label} value={money(row.amount)} />
            ))}
            <Row label="Cash" value={money(page.sales.cash)} />
            <Row label="Total sales" value={money(page.sales.total)} total />
          </Rows>
        </Section>

        <Section title={`Expenses (${lines.length})`} editLabel="Expenses" edit={edit("expenses")} divided>
          {lines.length ? null : <p className="text-body-m text-text-secondary">No expenses added for the day.</p>}
          <Rows>
            {lines.map((line) => (
              <Row key={line.id} label={expenseLabel(line)} value={money(line.amount)} />
            ))}
            {lines.length ? <Row label="Receipts" value={receiptsText(lines)} words /> : null}
            <Row label="Total expenses" value={money(page.expenses.total)} total />
          </Rows>
        </Section>

        <Section title="Cash Count" edit={edit("deposit")} divided>
          <Rows>
            <Row label="Cash taken for bank deposit" value={money(page.cash.bank_deposit)} />
            <Row label="Expected in drawer" value={signedMoney(page.cash.expected, code)} />
            <Row label="Counted in the drawer" value={money(page.cash.counted)} />
            <Row label="In the safe box" value={money(page.cash.safe_box)} />
            <Row label="Difference" value={closeDifference(page)} total words />
          </Rows>
          {diff.kind !== "none" ? (
            // 15.10b section issue: short/over in words, Warning tone, never a red number.
            <InlineAlert tone="warning" title={`The count is ${differenceText(diff, code)}`}>
              {page.cash.difference.reason.trim() ? `Reason: ${page.cash.difference.reason.trim()}` : "No reason was given yet."}
            </InlineAlert>
          ) : null}
        </Section>
      </div>

      {/* The stage summary: the day's closing balance, plain text, never coloured. */}
      <dl className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 rounded-xl bg-surface-sunk p-4 sm:px-6">
        <dt className="min-w-0 text-title-m text-text-primary">Closing balance</dt>
        <dd className="min-w-0 break-all text-right text-title-m text-text-primary" translate="no">
          {signedMoney(page.closing_balance, code)}
        </dd>
        <dd className="basis-full text-body-s text-text-secondary">What the drawer and the safe box hold once the day is submitted.</dd>
      </dl>

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
        <Link href={home} className={`${buttonClass("ghost")} w-full sm:w-auto`}>
          Save &amp; Exit
        </Link>
      </div>
    </>
  );
}

/** One stage's section: a Section header (h2) with its Edit link, then its rows. */
function Section({
  title,
  editLabel,
  edit,
  divided = false,
  children,
}: {
  title: string;
  /** The stage's name for the Edit link's accessible name, when the title carries more ("Expenses (2)"). */
  editLabel?: string;
  edit: string;
  divided?: boolean;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <section aria-labelledby={id} className={`flex min-w-0 flex-col gap-3 ${divided ? "border-t border-border-subtle pt-6" : ""}`}>
      <div className="flex min-w-0 items-center justify-between gap-3">
        <h2 id={id} className="min-w-0 break-words text-title-m text-text-primary">
          {title}
        </h2>
        <Link href={edit} className={`${buttonClass("link")} min-w-11 shrink-0`} aria-label={`Edit ${editLabel ?? title}`}>
          Edit
        </Link>
      </div>
      {children}
    </section>
  );
}

function Rows({ children }: { children: ReactNode }) {
  return <dl className="flex flex-col gap-2">{children}</dl>;
}

/**
 * A Description row: the term, then its value at the right - an amount wraps under the term
 * before it is ever clipped. A total is bold over a rule; `words` is a value in words ("None").
 */
function Row({ label, value, total = false, words = false }: { label: string; value: string; total?: boolean; words?: boolean }) {
  return (
    <div className={`flex min-w-0 flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 ${total ? "border-t border-border-subtle pt-2" : ""}`}>
      <dt className={`min-w-0 break-words text-body-m ${total ? "font-semibold text-text-primary" : "text-text-secondary"}`}>{label}</dt>
      <dd
        className={`min-w-0 text-right text-body-m text-text-primary ${words ? "break-words" : "break-all"} ${total ? "font-semibold" : ""}`}
        translate="no"
      >
        {value}
      </dd>
    </div>
  );
}
