"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ComponentProps, type MouseEvent } from "react";

import { useAmountInput } from "@minty/shared/amountInput";
import { formatAmount } from "@minty/shared/money";

import { PhoneCard } from "@/components/flask/PhoneCard";
import { Stepper } from "@/components/flask/Stepper";
import { useToast } from "@/components/flask/Toasts";
import {
  FieldMessage,
  FixNegativeBalanceModal,
  FixStepButton,
  LoadingOverlay,
  ReportBadge,
  SaveButtons,
  StepImage,
  fixNote,
} from "@/components/report/ReportChrome";
import { fieldOf, sentenceOf, toOpening, useBackToOpening } from "@/components/report/stepErrors";
import { entityAcronym } from "@/lib/acronym";
import { ApiError, pettyCashFetch } from "@/lib/apiClient";
import {
  cents,
  countProblem,
  denominationLabel,
  difference,
  differenceKind,
  parseCount,
  reasonNeeded,
  reasonProblem,
  rowTotal,
  COUNT_DIGITS,
  tillTotal,
  type CashCountPage,
  type Denomination,
} from "@/lib/cash";
import { pettyCashHome } from "@/lib/companyPages";
import { parseMoney } from "@/lib/currencyInput";
import { formatMoney } from "@/lib/money";
import { datePill } from "@/lib/opening";
import { changed } from "@/lib/sales";
import { useAuth } from "@/lib/useAuth";
import { stepHref, type WizardStep } from "@/lib/wizardPages";

const UNREACHABLE = "We couldn't reach Petty Cash. Check your connection, then reload the page.";
const UNSAVED = "You have unsaved changes. Please save your changes first.";
const SAVE_FAILED = "I couldn't save that. Mind trying again?";
const DESCRIPTION = "Description";
const NO_DISCREPANCY = "No discrepancy — description not required";

type SaveAnswer = { next: "ending" | "dashboard"; transaction_date: string };
type Counts = Record<string, number>;

/**
 * The report wizard's Cash Count step - a pixel-faithful port of Flask's `report/cash_count.html`:
 * the report header, the stepper, "Cash Count" with the grey "Expected Cash Count Balance" pill,
 * one card with the cash register, "Cash Box Balance" (filled from the calculator), the safebox
 * and "Safebox Cash Balance", "Total Cash Count", then "Discrepancy Details" (the shortage or
 * surplus alert and the reason), Save & Next / Save & Exit, the "Use Calculator" modal and the
 * "Fix Negative Balance" modal when the expected cash is below zero. Reads and saves through
 * `GET`/`PUT /reports/cash-count` (Minty `petty_cash_api/routes/cash.py`).
 *
 * The owner's rules (2026-10-15): any difference counts, one cent included, and Save & Next with a
 * difference needs a reason (Save & Exit does not). The difference shown is the one saved: it is
 * worked out from the counts the calculator's Save applied, never from rows still being typed.
 */
export function CashCountStep({ day }: { day: string | null }) {
  const toast = useToast();
  const auth = useAuth();
  const backToOpening = useBackToOpening();
  const [page, setPage] = useState<CashCountPage | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    pettyCashFetch<CashCountPage>("/reports/cash-count", {
      query: { transaction_date: day ?? undefined },
    })
      .then((answer) => live && setPage(answer))
      .catch((err: unknown) => {
        if (!live || (err instanceof ApiError && err.status === 401)) return;
        setFailed(true);
        const message = err instanceof ApiError ? err.message : UNREACHABLE;
        if (toOpening(err) && day) backToOpening(message, day);
        else toast(message, "error");
      });
    return () => {
      live = false;
    };
  }, [day, toast, backToOpening]);

  const acronym = entityAcronym(auth?.entityName);
  if (!page || !auth) {
    return (
      <PhoneCard acronym={acronym} datePill="">
        {!failed ? (
          <p className="text-sm text-flask-gray-500" role="status">
            Loading…
          </p>
        ) : null}
      </PhoneCard>
    );
  }
  return (
    <CashCountForm
      page={page}
      entityId={auth.entityId}
      entityName={auth.entityName}
      acronym={acronym}
    />
  );
}

function savedCounts(denominations: Denomination[]): Counts {
  return Object.fromEntries(denominations.map((d) => [d.id, d.count || 0]));
}

function CashCountForm({
  page,
  entityId,
  entityName,
  acronym,
}: {
  page: CashCountPage;
  entityId: string;
  entityName: string;
  acronym: string;
}) {
  const toast = useToast();
  const router = useRouter();
  const backToOpening = useBackToOpening();
  const home = pettyCashHome(entityId, entityName);
  const code = page.currency_code;
  const day = page.transaction_date;
  const expected = page.expected_cash;
  const progress = page.draft ?? { current_section: null, completed_sections: [] };

  const [initial] = useState(() => ({
    counts: savedCounts(page.denominations),
    safe: page.safe_box_balance ? formatAmount(page.safe_box_balance) : "",
    reason: page.discrepancy.reason,
  }));
  const [counts, setCounts] = useState<Counts>(initial.counts);
  // Flask fills "Actual Cash Balance" when the saved count is above zero, and after every Save
  const [tillShown, setTillShown] = useState(
    () => tillTotal(page.denominations, initial.counts) > 0,
  );
  const [safe, setSafe] = useState(initial.safe);
  const [reason, setReason] = useState(initial.reason);
  // a Save & Next refused for want of a reason: the box turns red until one is written
  const [reasonAsked, setReasonAsked] = useState(false);
  // the API's 422, by the field it named; each clears when its field changes
  const [refused, setRefused] = useState<{ field: string; message: string } | null>(null);
  const safeInput = useAmountInput({
    value: safe,
    onValue: (next) => {
      setSafe(next);
      if (refused?.field === "safe_box_balance") setRefused(null);
      settle(counts, next);
    },
  });
  const [calculator, setCalculator] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [negative, setNegative] = useState(expected < 0);
  const reasonField = useRef<HTMLTextAreaElement>(null);
  const safeField = useRef<HTMLInputElement>(null);
  const calculatorButton = useRef<HTMLButtonElement>(null);

  const till = tillTotal(page.denominations, counts);
  const safeAmount = parseMoney(safe);
  const amount = difference(till, safeAmount, expected);
  const kind = differenceKind(amount);
  const out = kind !== "none";

  const reasonMessage =
    refused?.field === "discrepancy_reason"
      ? refused.message
      : (reasonProblem(reason) ??
        (reasonAsked && out && reason.trim() === "" ? reasonNeeded(amount, code) : null));
  const safeMessage = refused?.field === "safe_box_balance" ? refused.message : null;
  const countMessage =
    refused && page.denominations.some((d) => d.id === refused.field) ? refused.message : null;

  /** After a change to the count or the safebox: a reason for a difference now gone is dropped (Flask's rule). */
  function settle(nextCounts: Counts, nextSafe: string) {
    const nextKind = differenceKind(
      difference(tillTotal(page.denominations, nextCounts), parseMoney(nextSafe), expected),
    );
    if (out && nextKind === "none") {
      setReason("");
      setReasonAsked(false);
      if (refused?.field === "discrepancy_reason") setRefused(null);
    }
  }

  function dirty(): boolean {
    return (
      page.denominations.some((d) => (counts[d.id] ?? 0) !== (initial.counts[d.id] ?? 0)) ||
      changed(safe, initial.safe) ||
      changed(reason, initial.reason)
    );
  }

  function onStepClick(event: MouseEvent<HTMLAnchorElement>) {
    if (dirty()) {
      event.preventDefault();
      toast(UNSAVED, "warning");
    }
  }

  function go(step: WizardStep) {
    router.push(stepHref(entityId, entityName, step, day));
  }

  async function save(action: "next" | "exit") {
    if (expected < 0) {
      setNegative(true);
      return;
    }
    if (reasonProblem(reason) || refused?.field === "discrepancy_reason") {
      reasonField.current?.focus();
      return;
    }
    if (action === "next" && out && reason.trim() === "") {
      // Flask's toast and red box; the sentence under the box says how much and what to do
      toast("Please enter description", "error");
      setReasonAsked(true);
      reasonField.current?.focus();
      return;
    }
    setBusy("Saving...");
    try {
      const answer = await pettyCashFetch<SaveAnswer>("/reports/cash-count", {
        method: "PUT",
        json: {
          transaction_date: day,
          counts: Object.fromEntries(page.denominations.map((d) => [d.id, counts[d.id] ?? 0])),
          safe_box_balance: safeAmount,
          discrepancy_reason: out ? reason : "",
          action,
        },
      });
      if (answer.next === "dashboard") router.push(home);
      else go("ending");
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return;
      setBusy(null);
      const sentence = sentenceOf(err) ?? SAVE_FAILED;
      const field = fieldOf(err);
      if (toOpening(err)) backToOpening(sentence, day);
      else if (field) {
        setRefused({ field, message: sentence });
        if (field === "discrepancy_reason") reasonField.current?.focus();
        else if (field === "safe_box_balance") safeField.current?.focus();
        else calculatorButton.current?.focus();
      } else toast(sentence, "error");
    }
  }

  function fix(step: WizardStep) {
    setNegative(false);
    setBusy("Redirecting...");
    go(step);
  }

  const overlays = (
    <>
      {calculator ? (
        <CalculatorModal
          denominations={page.denominations}
          counts={counts}
          code={code}
          onClose={() => {
            setCalculator(false);
            calculatorButton.current?.focus();
          }}
          onSave={(next) => {
            setCounts(next);
            setTillShown(true);
            if (refused && page.denominations.some((d) => d.id === refused.field)) setRefused(null);
            settle(next, safe);
            setCalculator(false);
            calculatorButton.current?.focus();
          }}
        />
      ) : null}
      {busy ? <LoadingOverlay text={busy} /> : null}
      {negative ? (
        <FixNegativeBalanceModal
          balance={expected}
          currencyCode={code}
          message="Cash balance cannot be negative, let's go back to"
          window
        >
          <FixStepButton
            label="Opening"
            note={fixNote("Cash in", page.cash_addition, code)}
            noteClass="text-flask-green"
            onClick={() => fix("opening")}
          />
          <FixStepButton
            label="Sales"
            note={fixNote("Cash in", page.cash_sales, code)}
            noteClass="text-flask-green"
            onClick={() => fix("sales")}
          />
          <FixStepButton
            label="Expenses"
            note={fixNote("Cash out", page.expenses, code)}
            noteClass="text-flask-red"
            onClick={() => fix("expenses")}
          />
          <FixStepButton
            label="Deposit"
            note={fixNote("Cash out", page.bank_deposit, code)}
            noteClass="text-flask-red"
            onClick={() => fix("deposit")}
          />
        </FixNegativeBalanceModal>
      ) : null}
    </>
  );

  const reasonInvalid = reasonMessage !== null;

  return (
    <PhoneCard
      acronym={acronym}
      datePill={datePill(day)}
      badge={<ReportBadge draft={page.draft} />}
      backHref={home}
      stepper={
        <Stepper
          draft={progress}
          page="cash_count"
          stepHref={(step) => stepHref(entityId, entityName, step, day)}
          onStepClick={onStepClick}
        />
      }
      overlays={overlays}
    >
      <div className="mb-2 text-left">
        <h2 className="text-lg font-bold text-flask-gray-700 sm:text-xl">Cash Count</h2>
        <div className="mt-2 inline-flex max-w-full flex-wrap items-center gap-x-4 rounded-flask-2xl bg-flask-gray-200 px-4 py-2">
          <span className="text-sm font-medium text-flask-gray-500">
            Expected Cash Count Balance
          </span>
          <span className="w-fit whitespace-nowrap text-sm font-medium text-flask-gray-500">
            {formatMoney(expected, code)}
          </span>
        </div>
      </div>

      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void save("next");
        }}
      >
        <div className="mb-6 rounded-flask-lg bg-flask-white p-6 shadow-flask-sm">
          <div>
            <StepImage
              src="/img/cash_reg.webp"
              alt="Cash Count"
              width={180}
              height={151}
              boxClass="mb-6 w-[180px]"
              minHeight={150}
              skeleton={160}
            />
            <div className="mb-4">
              <h3 id="cash_box_label" className="mb-2 text-sm font-semibold text-flask-gray-700">
                Cash Box Balance
              </h3>
              <div className="flex items-center gap-2">
                <input
                  id="actualCashBalance"
                  type="text"
                  readOnly
                  aria-labelledby="cash_box_label"
                  aria-describedby={countMessage ? "cash_box_message" : undefined}
                  placeholder="Actual Cash Balance"
                  value={tillShown ? formatMoney(till, code) : ""}
                  className={`min-w-0 flex-1 rounded-flask-xl border bg-flask-gray-200 px-3 py-3 text-flask-gray-500 focus:outline-none focus:ring-0 ${
                    countMessage ? "border-flask-red-500" : "border-flask-gray-300"
                  }`}
                />
                <button
                  ref={calculatorButton}
                  type="button"
                  title="Calculator"
                  aria-label="Calculator"
                  onClick={() => setCalculator(true)}
                  className="shrink-0 rounded-flask-xl border border-flask-gray-200 bg-flask-teal p-2 hover:bg-flask-teal/80 focus:outline-none focus:ring-0 focus-visible:ring-2 focus-visible:ring-flask-teal-ink"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- Flask's 27px icon drawn at 32px */}
                  <img src="/img/btn_calculator.webp" alt="" className="h-8 w-8" />
                </button>
              </div>
              {countMessage ? (
                <FieldMessage id="cash_box_message">{countMessage}</FieldMessage>
              ) : null}
            </div>
            <StepImage
              src="/img/safebox.webp"
              alt="Safe Box"
              width={180}
              height={162}
              boxClass="mb-6 w-[180px]"
              minHeight={162}
              skeleton={160}
            />
            <div className="mb-4">
              <h3 id="safe_box_label" className="mb-2 text-sm font-semibold text-flask-gray-700">
                Safebox Cash Balance
              </h3>
              <div className="flex items-center gap-2">
                <input
                  ref={safeField}
                  id="safeBoxBalance"
                  name="safe_box_balance"
                  autoComplete="off"
                  aria-labelledby="safe_box_label"
                  aria-invalid={safeMessage ? true : undefined}
                  aria-describedby={safeMessage ? "safe_box_message" : undefined}
                  placeholder="Please enter Balance of the safebox"
                  {...safeInput}
                  onFocus={(e) => {
                    const input = e.currentTarget;
                    window.setTimeout(
                      () => input.scrollIntoView({ block: "center", behavior: "smooth" }),
                      300,
                    );
                  }}
                  className={`min-w-0 flex-1 cursor-pointer rounded-flask-xl border bg-flask-white px-3 py-3 text-flask-black focus:border-transparent focus:outline-none focus:ring-2 focus:ring-flask-teal ${
                    safeMessage ? "border-flask-red-500" : "border-flask-gray-300"
                  }`}
                />
              </div>
              {safeMessage ? (
                <FieldMessage id="safe_box_message">{safeMessage}</FieldMessage>
              ) : null}
            </div>
            <div className="mt-2 flex items-center justify-between gap-3 rounded-flask-2xl bg-flask-teal-soft/50 p-3">
              <span className="min-w-0 text-sm font-medium text-flask-teal-count">
                Total Cash Count
              </span>
              <span
                className="whitespace-nowrap text-right text-sm font-medium text-flask-teal-count"
                aria-live="polite"
              >
                {formatMoney(cents(till + safeAmount), code)}
              </span>
            </div>
          </div>
        </div>

        <div className="mb-6 rounded-flask-lg bg-flask-white p-6 shadow-flask-sm">
          <div className="mb-2 flex items-center gap-3">
            <h3 className="mb-2 text-sm font-semibold text-flask-gray-700">
              Discrepancy Details
              {out ? (
                <>
                  <span className="ml-0.5 text-flask-red-500" aria-hidden="true">
                    *
                  </span>
                  <span className="sr-only"> (required)</span>
                </>
              ) : null}
            </h3>
          </div>

          {out ? <DiscrepancyAlert kind={kind} amount={amount} code={code} /> : null}

          <div>
            <textarea
              ref={reasonField}
              id="discrepancyDescription"
              name="discrepancy_reason"
              aria-label="Description"
              aria-required={out ? true : undefined}
              aria-invalid={reasonInvalid ? true : undefined}
              aria-describedby={reasonInvalid ? "discrepancy_message" : undefined}
              rows={1}
              readOnly={!out}
              placeholder={out ? DESCRIPTION : NO_DISCREPANCY}
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
                if (refused?.field === "discrepancy_reason") setRefused(null);
              }}
              onFocus={(e) => {
                if (!out) return;
                const input = e.currentTarget;
                window.setTimeout(
                  () => input.scrollIntoView({ block: "center", behavior: "smooth" }),
                  300,
                );
              }}
              className={`block w-full resize-none rounded-flask-2xl border px-3 py-3 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-flask-teal ${
                reasonInvalid ? "border-flask-red-500" : "border-flask-gray-300"
              } ${out ? "cursor-pointer bg-flask-white text-flask-gray-700" : "cursor-not-allowed bg-flask-gray-200 text-flask-gray-500"}`}
            />
            {reasonMessage ? (
              <FieldMessage id="discrepancy_message">{reasonMessage}</FieldMessage>
            ) : null}
          </div>
        </div>

        <SaveButtons disabled={busy !== null} onExit={() => void save("exit")} />
      </form>
    </PhoneCard>
  );
}

/** Flask's #discrepancyAlert: red "Cash Shortage" or green "Cash Surplus", and what to do. */
function DiscrepancyAlert({
  kind,
  amount,
  code,
}: {
  kind: "short" | "over" | "none";
  amount: number;
  code: string | null;
}) {
  const short = kind === "short";
  return (
    <div
      className={`mb-4 rounded-flask-lg p-4 ${short ? "bg-flask-danger-bg" : "bg-flask-success-bg"}`}
      role="status"
    >
      <div className="flex items-start">
        <div className="flex-shrink-0">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth="2"
            stroke="currentColor"
            className={`size-6 ${short ? "text-flask-danger" : "text-flask-green-500"}`}
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z"
            />
          </svg>
        </div>
        <div className="ml-3 min-w-0 flex-1">
          <h3
            className={`text-sm font-medium ${short ? "text-flask-red-800" : "text-flask-success-ink"}`}
          >
            {short ? "Cash Shortage: " : "Cash Surplus: "}
            <span className="whitespace-nowrap">{formatMoney(Math.abs(amount), code)}</span>
          </h3>
          <p className="mt-1 text-sm text-flask-gray-600">
            Please review your entries or provide a reason for the discrepancy below.
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * Flask's "Use Calculator" (#calculatorModal): a row per denomination - its label, "X", the count
 * (whole numbers only) and the row's total - then "Total Cash Till Balance" and Save, which copies
 * the counts into the page. The X, a click outside and Escape close it without applying anything.
 * Like Flask's (`fixed inset-0`), its backdrop covers the whole window, not just the phone card.
 */
/** One denomination's count: commas as it is typed, whole numbers, at most COUNT_DIGITS digits. */
function CountInput({
  value,
  onValue,
  ...rest
}: Omit<ComponentProps<"input">, "value" | "onChange" | "onBlur" | "type" | "inputMode"> & {
  value: string;
  onValue: (value: string) => void;
}) {
  const count = useAmountInput({ value, onValue, kind: "count", maxDigits: COUNT_DIGITS });
  return <input {...rest} {...count} />;
}

function CalculatorModal({
  denominations,
  counts,
  code,
  onClose,
  onSave,
}: {
  denominations: Denomination[];
  counts: Counts;
  code: string | null;
  onClose: () => void;
  onSave: (counts: Counts) => void;
}) {
  const [typed, setTyped] = useState<Record<string, string>>(() =>
    Object.fromEntries(denominations.map((d) => [d.id, counts[d.id] ? String(counts[d.id]) : ""])),
  );
  const panel = useRef<HTMLDivElement>(null);
  const inputs = useRef<Record<string, HTMLInputElement | null>>({});

  useEffect(() => {
    panel.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const parsed: Counts = Object.fromEntries(
    denominations.map((d) => [d.id, parseCount(typed[d.id] ?? "")]),
  );
  const total = tillTotal(denominations, parsed);

  function apply() {
    const wrong = denominations.find((d) => countProblem(typed[d.id] ?? ""));
    if (wrong) {
      inputs.current[wrong.id]?.focus();
      return;
    }
    onSave(parsed);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-flask-black/50 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="calculator_title"
        tabIndex={-1}
        className="max-h-[90vh] w-full min-w-0 max-w-2xl overflow-y-auto rounded-flask-2xl bg-flask-white shadow-flask-xl outline-none"
      >
        <form
          className="p-6"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            apply();
          }}
        >
          <div className="mb-6 flex items-center justify-between">
            <h2 id="calculator_title" className="text-xl font-bold text-flask-gray-700">
              Use Calculator
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="-m-2.5 inline-flex h-11 w-11 items-center justify-center text-flask-gray-500 hover:text-flask-gray-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-flask-teal"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-6 w-6"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>

          {denominations.map((d) => {
            const id = `count_${d.id}`;
            const label = denominationLabel(d.value, code, d.name);
            const value = typed[d.id] ?? "";
            const problem = countProblem(value);
            return (
              <div key={d.id} className="mb-4">
                <div className="grid grid-cols-[6rem_minmax(0,1fr)] items-center gap-x-3 gap-y-2 sm:flex sm:gap-3">
                  <label
                    htmlFor={id}
                    className="w-24 shrink-0 whitespace-nowrap text-base font-medium text-flask-gray-500"
                  >
                    {label}
                  </label>
                  <div className="relative min-w-0 sm:flex-1">
                    <div
                      className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-normal text-flask-gray-400"
                      aria-hidden="true"
                    >
                      X
                    </div>
                    <CountInput
                      ref={(el) => {
                        inputs.current[d.id] = el;
                      }}
                      id={id}
                      autoComplete="off"
                      placeholder="0"
                      value={value}
                      aria-invalid={problem ? true : undefined}
                      aria-describedby={problem ? `${id}_message` : undefined}
                      onValue={(next) => setTyped((all) => ({ ...all, [d.id]: next }))}
                      className={`w-full cursor-pointer rounded-flask-2xl border bg-flask-white py-3 pl-10 pr-3 text-right text-flask-black focus:border-transparent focus:outline-none focus:ring-2 focus:ring-flask-teal ${
                        problem ? "border-flask-red-500" : "border-flask-gray-300"
                      }`}
                    />
                  </div>
                  {/* The row's total: on a phone its own full-width line under the count, beside it
                      from sm up (growing past w-40 for the largest totals); never split mid-number. */}
                  <div className="col-span-2 flex min-w-0 items-center justify-between gap-2 rounded-flask-2xl border border-flask-gray-500 bg-flask-gray-300/20 px-3 py-3 sm:w-auto sm:min-w-40 sm:shrink-0">
                    <span className="font-medium text-flask-gray-500/60">{code}</span>
                    <output
                      htmlFor={id}
                      className="whitespace-nowrap text-right text-flask-gray-700"
                    >
                      {rowTotal(d.value, parseCount(value)).toLocaleString("en-US", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </output>
                  </div>
                </div>
                {problem ? <FieldMessage id={`${id}_message`}>{problem}</FieldMessage> : null}
              </div>
            );
          })}

          <div className="mb-4 flex items-center justify-between gap-3 rounded-flask-2xl">
            <span className="min-w-0 text-sm font-medium text-flask-gray-700">
              Total Cash Till Balance
            </span>
            <span
              className="whitespace-nowrap text-right text-sm font-medium text-flask-gray-700"
              aria-live="polite"
            >
              {formatMoney(total, code)}
            </span>
          </div>

          <div className="flex justify-center">
            <button
              type="submit"
              className="w-full rounded-flask-xl bg-flask-teal px-4 py-3 text-flask-white hover:bg-flask-teal/80 focus:outline-none focus:ring-2 focus:ring-flask-teal"
            >
              Save
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
