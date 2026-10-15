"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState, type ReactNode } from "react";

import { buttonClass, ErrorSummary, Field, InlineAlert, inputClass, PageBanner } from "@minty/shared/ui";

import { AmountInput, openStep, refused, StageActions, StagePage, stageSteps, useLeaveHold, WorkflowHeader, type StageContext } from "@/components/closing/Stage";
import { signedMoney } from "@/lib/addition";
import { ApiError, pettyCashFetch } from "@/lib/apiClient";
import {
  belowZero,
  cashCountDirty,
  countedCash,
  countProblem,
  denominationGroups,
  denominationLabel,
  depositProblem,
  difference,
  differenceText,
  drawerTotal,
  expectedCash,
  initialValues,
  kindNoun,
  openingCash,
  reasonHelper,
  reasonProblem,
  rowTotal,
  sanitizeCount,
  savePayload,
  type CashCountPage,
  type CashCountSaved,
  type CashCountValues,
  type Denomination,
} from "@/lib/cashCount";
import { formatMoney } from "@/lib/money";
import { reportStatus } from "@/lib/reportStatus";
import { stepHref } from "@/lib/wizardPages";

const STAGE = "Cash Count";
const GUIDANCE = "Take out any cash for the bank first, then count what is left in the drawer and the safebox.";

/** The fields' ids - the error summary links to them, and a refusal moves the focus to one. */
const DEPOSIT = "cash-deposit";
const SAFEBOX = "cash-safebox";
const REASON = "cash-reason";
const countId = (d: Denomination) => `cash-count-${d.id}`;

/**
 * The Daily Closing's fourth stage, "Cash Count" (Part 15.9 / 15.15d; Flask's Bank Deposit and
 * Cash Count sections, one stage by D15-05): the optional "Cash taken for bank deposit" first (it
 * is taken out before counting, A15-02), then the drawer counted by notes and coins with a live
 * total, then the safebox, then the Check block - Expected in drawer, Counted, Difference in words
 * ("HKD20.00 short") - with the reason a difference needs before Save & Next. In Stage.tsx's frame.
 *
 * Reads through `GET /reports/cash-count` and saves the deposit and the count TOGETHER through
 * `PUT /reports/cash-count` (one transaction; Minty `petty_cash_api/routes/cash.py`). Its rules
 * are lib/cashCount.ts.
 */
export function CashCount({ day }: { day: string | null }) {
  return (
    <StagePage<CashCountPage> path="/reports/cash-count" day={day} title={STAGE} guidance={GUIDANCE} here="cash_count">
      {(page, context) => <StageForm page={page} {...context} />}
    </StagePage>
  );
}

type FieldError = { field: string; message: string } | null;

function StageForm({ page, entityId, entityName, home, notice }: { page: CashCountPage } & StageContext) {
  const router = useRouter();
  const [values, setValues] = useState<CashCountValues>(() => initialValues(page));
  const [submitted, setSubmitted] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [saving, setSaving] = useState<"next" | "exit" | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  // A 422 from the API names its field: shown there until that field changes.
  const [serverError, setServerError] = useState<FieldError>(null);

  const code = page.currency_code;
  const day = page.transaction_date;
  const expected = expectedCash(page, values.deposit);
  const drawer = drawerTotal(page.denominations, values.counts);
  const counted = countedCash(drawer, values.safebox);
  const diff = difference(counted, expected);
  const hold = useLeaveHold(cashCountDirty(page, values), saving !== null);
  const progress = page.draft ?? { current_section: null, completed_sections: [] };
  const push = (href: string) => router.push(href);

  const server = (field: string) => (serverError?.field === field ? serverError.message : null);
  const problems = (asSubmitted: boolean, action: "next" | "exit") => {
    const list: { fieldId: string; message: string }[] = [];
    const add = (fieldId: string, message: string | null) => message && list.push({ fieldId, message });
    add(DEPOSIT, depositProblem(page, values.deposit) ?? server("bank_deposit"));
    for (const d of page.denominations) add(countId(d), countProblem(values.counts[d.id] ?? "") ?? server(d.id));
    add(SAFEBOX, server("safe_box_balance"));
    add(REASON, reasonProblem(values.reason, diff, code, { submitted: asSubmitted && action === "next" }) ?? server("discrepancy_reason"));
    return list;
  };
  // Shown now: as typed, plus what a refused Save & Next found.
  const shown = problems(submitted, "next");
  const errorOf = (fieldId: string) => shown.find((p) => p.fieldId === fieldId)?.message;
  const reasonShown = diff.kind !== "none" || Boolean(server("discrepancy_reason"));

  const set = (patch: Partial<CashCountValues>, field: string) => {
    setValues((all) => ({ ...all, ...patch }));
    if (serverError?.field === field) setServerError(null);
  };

  async function save(action: "next" | "exit") {
    if (saving) return;
    setProblem(null);
    hold.release();
    const failing = problems(true, action);
    if (failing.length) {
      // A reason is asked for only by Save & Next; Save & Exit keeps a difference without one.
      if (action === "next") setSubmitted(true);
      setAttempt((n) => n + 1);
      // One problem: its field takes focus. Two or more: the summary does (ErrorSummary).
      if (failing.length === 1) document.getElementById(failing[0].fieldId)?.focus();
      return;
    }
    setSaving(action);
    try {
      const answer = await pettyCashFetch<CashCountSaved>("/reports/cash-count", {
        method: "PUT",
        json: savePayload(day, page, values, diff, action),
      });
      // Close is still Flask's Ending page.
      if (answer.next === "ending") openStep(push, entityId, entityName, "ending", answer.transaction_date);
      else push(home);
    } catch (err) {
      const field = err instanceof ApiError && err.status === 422 ? (err.body as { field?: unknown } | null)?.field : undefined;
      if (typeof field === "string" && err instanceof ApiError) {
        // A rule about one input: on that input, which takes the focus.
        setSaving(null);
        setServerError({ field, message: err.message });
        const target = field === "bank_deposit" ? DEPOSIT : field === "safe_box_balance" ? SAFEBOX : field === "discrepancy_reason" ? REASON : `cash-count-${field}`;
        requestAnimationFrame(() => document.getElementById(target)?.focus());
        return;
      }
      // No draft any more: to Addition to Drawer, which says why (`to: "opening"`).
      const message = refused(err, { here: "cash_count", push, entityId, entityName, home, day });
      if (message === undefined) return;
      setSaving(null);
      setProblem(message);
    }
  }

  const header = (
    <>
      <WorkflowHeader
        home={home}
        day={day}
        title={STAGE}
        guidance={GUIDANCE}
        status={reportStatus(page.draft)}
        steps={stageSteps(entityId, entityName, progress, "cash_count", day)}
        onLeave={hold.onLeave}
        held={hold.held}
      />
      {notice}
    </>
  );

  if (belowZero(page)) {
    // Part 15.9e business-rule gate (Flask's "Fix Negative Balance"): the rule, the reason, one
    // action. Nothing on this stage can fix it - the figures come from the earlier stages.
    return (
      <>
        {header}
        <PageBanner
          tone="warning"
          title="The cash on hand is below zero"
          action={
            <Link href={stepHref(entityId, entityName, "expenses", day)} className={buttonClass("link")}>
              Go to Expenses
            </Link>
          }
        >
          Opening cash <span translate="no" className="whitespace-nowrap">{formatMoney(openingCash(page), code)}</span> plus cash sales{" "}
          <span translate="no" className="whitespace-nowrap">{formatMoney(page.cash_sales, code)}</span>, less expenses{" "}
          <span translate="no" className="whitespace-nowrap">{formatMoney(page.expenses, code)}</span>, comes to{" "}
          <span translate="no" className="whitespace-nowrap">{signedMoney(page.cash_on_hand, code)}</span>, and cash can&apos;t be counted against less
          than zero. Check the expenses and the cash sales, then come back to Cash Count.
        </PageBanner>
      </>
    );
  }

  return (
    <>
      {header}
      <form
        className="flex flex-col gap-6"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void save("next");
        }}
      >
        <ErrorSummary items={shown.length > 1 && attempt > 0 ? shown : []} attempt={attempt} />

        <section aria-label={STAGE} className="flex flex-col gap-6 rounded-xl border border-border-subtle bg-surface-card p-4 sm:p-6">
          {/* 1. The deposit - optional, and first: the cash for the bank is taken out before counting (A15-02). */}
          <Group title="Bank deposit" description="Take the cash for the bank out of the drawer before you count.">
            <Fact label="Cash on hand" amount={formatMoney(page.cash_on_hand, code)} note="Opening cash and cash sales, less expenses." />
            <AmountInput
              id={DEPOSIT}
              label="Cash taken for bank deposit"
              name="bank_deposit"
              code={code}
              value={values.deposit}
              onChange={(deposit) => set({ deposit }, "bank_deposit")}
              helper={
                <>
                  Optional. Up to <span translate="no">{formatMoney(page.cash_on_hand, code)}</span>, the cash on hand.
                </>
              }
              error={errorOf(DEPOSIT)}
              disabled={saving !== null}
            />
          </Group>

          {/* 2. The drawer, by notes and coins (Flask's calculator, kept - 15.15). */}
          <Group title="Cash in the drawer" description="Count each note and coin, and enter how many you have." divided>
            {page.denominations.length ? (
              denominationGroups(page.denominations).map((group) => (
                <fieldset key={group.kind} className="flex min-w-0 flex-col gap-2">
                  <legend className="mb-1 text-label text-text-secondary">{group.title}</legend>
                  {group.items.map((d) => (
                    <CountRow
                      key={d.id}
                      denomination={d}
                      code={code}
                      value={values.counts[d.id] ?? ""}
                      error={errorOf(countId(d))}
                      disabled={saving !== null}
                      onChange={(text) => set({ counts: { ...values.counts, [d.id]: text } }, d.id)}
                    />
                  ))}
                </fieldset>
              ))
            ) : (
              <InlineAlert tone="info">
                This company has no notes or coins set up yet, so the drawer can&apos;t be counted here. Check the
                company&apos;s country in Settings.
              </InlineAlert>
            )}
            <dl className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 border-t border-border-subtle pt-3">
              <dt className="min-w-0 text-body-m text-text-secondary">Drawer total</dt>
              <dd className="min-w-0 break-all text-right text-body-m font-semibold text-text-primary" translate="no" aria-live="polite">
                {formatMoney(drawer, code)}
              </dd>
            </dl>
          </Group>

          {/* 3. The safebox - part of the cash counted. */}
          <Group title="Cash in the safebox" description="Cash kept in the safebox counts with the drawer." divided>
            <AmountInput
              id={SAFEBOX}
              label="Cash in the safebox"
              name="safe_box_balance"
              code={code}
              value={values.safebox}
              onChange={(safebox) => set({ safebox }, "safe_box_balance")}
              helper="Optional. Leave it empty when the safebox holds no cash."
              error={errorOf(SAFEBOX)}
              disabled={saving !== null}
            />
          </Group>
        </section>

        {/* The Check block - the stage summary (15.15d): plain text, never coloured; short/over in words. */}
        <section aria-labelledby="cash-check" className="flex flex-col gap-4 rounded-xl border border-border-subtle bg-surface-card p-4 sm:p-6">
          <h2 id="cash-check" className="text-title-m text-text-primary">
            Check
          </h2>
          <dl className="flex flex-col gap-3">
            <SummaryRow label="Expected in drawer" value={signedMoney(expected, code)} note="Cash on hand less the bank deposit." />
            <SummaryRow label="Counted" value={formatMoney(counted, code)} note="The drawer and the safebox together." />
            <SummaryRow label="Difference" value={differenceText(diff, code)} strong />
          </dl>
          {diff.kind !== "none" ? (
            <InlineAlert tone="warning" title={`The count is ${differenceText(diff, code)}`}>
              Count the cash again, or add the reason below. You can save and leave without one, but not move on.
            </InlineAlert>
          ) : null}
          {reasonShown ? (
            <Field id={REASON} label="Reason for the difference" required={diff.kind !== "none"} error={errorOf(REASON)} helper={reasonHelper(values.reason)}>
              {(a11y) => (
                <textarea
                  {...a11y}
                  name="discrepancy_reason"
                  rows={3}
                  value={values.reason}
                  disabled={saving !== null}
                  placeholder="For example: change given twice by mistake"
                  onChange={(e) => set({ reason: e.target.value }, "discrepancy_reason")}
                  className={`${inputClass(Boolean(errorOf(REASON)), { multiline: true })} max-h-60 resize-y`}
                />
              )}
            </Field>
          ) : null}
        </section>

        {problem ? <InlineAlert tone="danger">{problem}</InlineAlert> : null}

        <StageActions saving={saving} onExit={() => void save("exit")} />
      </form>
    </>
  );
}

/** One group of the stage card: a Section header (h2 + why), then its content. */
function Group({ title, description, divided = false, children }: { title: string; description: string; divided?: boolean; children: ReactNode }) {
  const id = useId();
  return (
    <div role="group" aria-labelledby={id} className={`flex min-w-0 flex-col gap-4 ${divided ? "border-t border-border-subtle pt-6" : ""}`}>
      <div className="flex flex-col gap-0.5">
        <h2 id={id} className="text-title-m text-text-primary">
          {title}
        </h2>
        <p className="text-body-s text-text-secondary">{description}</p>
      </div>
      {children}
    </div>
  );
}

/** A read-only fact as a Description row - never an input (Part 14). */
function Fact({ label, amount, note }: { label: string; amount: string; note: string }) {
  return (
    <dl className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5">
      <dt className="min-w-0 text-body-m font-semibold text-text-primary">{label}</dt>
      <dd className="min-w-0 break-all text-right text-body-m font-semibold text-text-primary" translate="no">
        {amount}
      </dd>
      <dd className="basis-full text-body-s text-text-secondary">{note}</dd>
    </dl>
  );
}

/** A Check row: the term, the value (a polite live region, 15.15), and what it is made of. */
function SummaryRow({ label, value, note, strong = false }: { label: string; value: string; note?: string; strong?: boolean }) {
  const text = strong ? "text-title-m" : "text-body-m";
  return (
    <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5">
      <dt className={`min-w-0 ${text} text-text-primary`}>{label}</dt>
      <dd className={`min-w-0 break-all text-right ${text} font-semibold text-text-primary`} translate="no" aria-live="polite">
        {value}
      </dd>
      {note ? <dd className="basis-full text-body-s text-text-secondary">{note}</dd> : null}
    </div>
  );
}

/**
 * One calculator row (15.15: a label per denomination): "HKD1,000", the count (whole numbers,
 * the numeric keypad), and the row's amount. The amount wraps under the row before it is ever
 * clipped. Its problem - above a million - shows as typed.
 */
function CountRow({
  denomination,
  code,
  value,
  error,
  disabled,
  onChange,
}: {
  denomination: Denomination;
  code: string | null;
  value: string;
  error?: string;
  disabled: boolean;
  onChange: (text: string) => void;
}) {
  const id = countId(denomination);
  const label = denominationLabel(denomination, code);
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
      <label htmlFor={id} className="w-20 shrink-0 text-body-m font-medium text-text-primary" translate="no">
        <span className="sr-only">Number of </span>
        {label}
        <span className="sr-only"> {kindNoun(denomination.kind)}</span>
      </label>
      <div className="relative w-28 shrink-0">
        <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-body-m text-text-secondary" aria-hidden>
          &times;
        </span>
        <input
          id={id}
          name={`count-${denomination.id}`}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          placeholder="0"
          value={value}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-note` : undefined}
          onChange={(e) => onChange(sanitizeCount(e.target.value))}
          className={`${inputClass(Boolean(error))} pl-7 text-right`}
        />
      </div>
      <span className="ml-auto min-w-0 break-all text-right text-body-m text-text-secondary" translate="no">
        {formatMoney(rowTotal(denomination, value), code)}
      </span>
      {error ? (
        <p id={`${id}-note`} role="alert" className="basis-full text-caption text-status-danger-ink">
          {error}
        </p>
      ) : null}
    </div>
  );
}
