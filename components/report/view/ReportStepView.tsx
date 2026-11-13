"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { goBack } from "@minty/shared/backLink";
import { formatAmount } from "@minty/shared/money";

import { PhoneCard } from "@/components/flask/PhoneCard";
import { Stepper } from "@/components/flask/Stepper";
import { useToast } from "@/components/flask/Toasts";
import { DiscrepancyAlert } from "@/components/report/CashCountStep";
import { ExpenseDetailsModal, ExpenseRow } from "@/components/report/ExpensesStep";
import { ReportBadge, StepImage } from "@/components/report/ReportChrome";
import { CardIcon, CashIcon, Section, Total, TruckIcon } from "@/components/report/SalesStep";
import { entityAcronym } from "@/lib/acronym";
import { ApiError, pettyCashFetch } from "@/lib/apiClient";
import { getAuth } from "@/lib/auth";
import { denominationLabel, rowTotal } from "@/lib/cash";
import {
  pettyCashHome,
  REPORT_STEP_VIEW_SKIP,
  REPORT_STEP_VIEWS,
  reportHref,
  reportStepHref,
  type ReportStepView as StepSegment,
} from "@/lib/companyPages";
import { ALL_DONE } from "@/lib/dashboard";
import { formatMoney } from "@/lib/money";
import { historyHref } from "@/lib/history";
import { datePill } from "@/lib/opening";
import { stepViewFigures, summarySales, type DailyReport, type ReportLine } from "@/lib/report";
import { flaskLabel, sections } from "@/lib/sales";
import { useAuth } from "@/lib/useAuth";
import { stepHref } from "@/lib/wizardPages";

const UNREACHABLE = "We couldn't reach Petty Cash. Check your connection, then reload the page.";

/** A locked field, as Flask drew a submitted report's: grey, the text dimmed, no pointer. */
const LOCKED =
  "w-full cursor-not-allowed rounded-flask-2xl border border-flask-gray-300 bg-flask-gray-200 py-3 pl-12 pr-3 text-flask-gray-500 focus:outline-none";

/**
 * One step of a submitted report, read-only - the submitted-report mode of Flask's ORIGINAL step
 * templates (Minty `1c25b35^1`, `/entity/<id>/petty-cash/reports/<report id>/<step>`): the report
 * header, the stepper with every step done (each leading to its own view, Ending to the summary),
 * the step's card with every field locked, and Close in place of Save & Next. Reads
 * `GET /reports/<id>` - the summary's own read - so nothing here can change the report; its
 * `cash.opening_safe_box` and `cash.denominations` exist for these views.
 *
 * A draft has no submitted view: it opens that step of the wizard. The header's Back steps over
 * the other read-only steps to the summary the stepper came from; with nothing before it in this
 * app, the summary. Close closes the report (the owner, 2026-11-13: never Ending): past its steps,
 * summary and Submitted page to where it was opened from - the report list with its dates and
 * page, the dashboard; with nothing before it in this app, report history, as the summary's Close.
 */

/** What Close steps over: every page of this report, so it leaves the report. */
const CLOSE_REPORT_SKIP = [
  ...REPORT_STEP_VIEW_SKIP,
  /\/petty-cash\/reports\/[^/]+\/(summary|submitted)$/,
];
export function ReportStepView({ reportId, step }: { reportId: string; step: StepSegment }) {
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
        if (answer.status === "draft" && company)
          router.replace(
            stepHref(
              company.entityId,
              company.entityName,
              REPORT_STEP_VIEWS[step],
              answer.transaction_date,
            ),
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
  }, [reportId, step, toast, router]);

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
    <StepViewBody
      report={report}
      step={step}
      entityId={auth.entityId}
      entityName={auth.entityName}
      acronym={acronym}
    />
  );
}

function StepViewBody({
  report,
  step,
  entityId,
  entityName,
  acronym,
}: {
  report: DailyReport;
  step: StepSegment;
  entityId: string;
  entityName: string;
  acronym: string;
}) {
  const summary = reportHref(entityId, entityName, report.report_id, "summary");
  const [viewing, setViewing] = useState<ReportLine | null>(null);
  const [calculator, setCalculator] = useState(false);
  const code = report.currency_code;

  const body =
    step === "opening" ? (
      <OpeningView report={report} />
    ) : step === "sale" ? (
      <SalesView report={report} />
    ) : step === "expense" ? (
      <ExpensesView report={report} onOpen={setViewing} />
    ) : step === "deposit" ? (
      <DepositView report={report} />
    ) : (
      <CashCountView report={report} onCalculator={() => setCalculator(true)} />
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
      backHref={summary}
      backSkip={REPORT_STEP_VIEW_SKIP}
      stepper={
        <Stepper
          draft={ALL_DONE}
          page={REPORT_STEP_VIEWS[step]}
          stepHref={(s) => reportStepHref(entityId, entityName, report.report_id, s)}
        />
      }
      overlays={
        <>
          {viewing ? (
            <ExpenseDetailsModal line={viewing} code={code} onClose={() => setViewing(null)} />
          ) : null}
          {calculator ? <CountsModal report={report} onClose={() => setCalculator(false)} /> : null}
        </>
      }
    >
      {body}
      <button
        type="button"
        onClick={() => goBack(historyHref(entityId, entityName), { skip: CLOSE_REPORT_SKIP })}
        className="group flex w-full items-center justify-center gap-2 rounded-flask-xl bg-flask-teal px-4 py-3 font-medium text-flask-white shadow-flask-md transition-colors hover:bg-flask-teal/80"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth="1.5"
          stroke="currentColor"
          className="size-6 transition-transform duration-300 group-hover:scale-[1.2]"
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
    </PhoneCard>
  );
}

function Title({ children }: { children: ReactNode }) {
  return (
    <div className="mb-6 text-left">
      <h2 className="text-lg font-bold text-flask-gray-700 sm:text-xl">{children}</h2>
    </div>
  );
}

const CARD = "mb-6 rounded-flask-lg bg-flask-white p-6 shadow-flask-sm";

/** A step's money field, locked: the currency code inside on the left, the saved amount. */
function LockedMoney({
  id,
  label,
  ariaLabel,
  code,
  amount,
  labelClass = "mb-2 block text-sm font-medium text-flask-gray-500",
}: {
  id: string;
  label?: string;
  ariaLabel?: string;
  code: string | null;
  amount: number;
  labelClass?: string;
}) {
  return (
    <div>
      {label ? (
        <label htmlFor={id} className={labelClass}>
          {label}
        </label>
      ) : null}
      <div className="relative">
        <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
          <span className="text-sm text-flask-gray-500">{code}</span>
        </div>
        <input
          id={id}
          aria-label={ariaLabel}
          readOnly
          placeholder="0.00"
          value={amount ? formatAmount(amount) : ""}
          className={LOCKED}
        />
      </div>
    </div>
  );
}

function OpeningView({ report }: { report: DailyReport }) {
  const { cash, currency_code: code } = report;
  const figures = stepViewFigures(cash);
  const withdrawal = cash.cash_addition_type ?? "personal";
  return (
    <>
      <Title>Opening</Title>
      <div className={CARD}>
        <div className="mb-2">
          <StepImage
            src="/img/opening.webp"
            alt="Opening"
            width={240}
            height={156}
            boxClass="mb-10 w-[240px]"
            minHeight={156}
            skeleton={170}
          />
          <div className="rounded-flask-2xl bg-flask-gray-100 p-4">
            <div className="flex items-center justify-between border-b border-flask-gray-300 pb-2">
              <span className="text-sm font-medium text-flask-gray-500">Starting Cash Balance</span>
              <span className="text-sm font-medium text-flask-gray-500">
                {formatMoney(cash.opening_balance, code)}
              </span>
            </div>
            <div className="pt-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-flask-gray-400">Cash Till Balance</span>
                <span className="text-sm font-medium text-flask-gray-400">
                  {formatMoney(figures.openingTill, code)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-flask-gray-400">Safebox</span>
                <span className="text-sm font-medium text-flask-gray-400">
                  {formatMoney(cash.opening_safe_box, code)}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="mb-4">
          <LockedMoney
            id="additiontocashbalance"
            label="Addition to Cash Drawer"
            labelClass="mb-2 block text-sm font-medium text-flask-gray-700"
            code={code}
            amount={cash.cash_addition}
          />
        </div>

        <fieldset className="mb-4" disabled>
          <legend className="mb-2 block text-sm font-medium text-flask-gray-700">
            Withdrawal from:
          </legend>
          <div className="space-y-2">
            {(
              [
                ["company", "Company Bank"],
                ["personal", "Personal"],
              ] as const
            ).map(([value, label]) => (
              <label key={value} className="flex cursor-not-allowed items-center">
                <input
                  type="radio"
                  name="withdrawal"
                  value={value}
                  checked={withdrawal === value}
                  readOnly
                  className="flask-radio"
                />
                <span className="ml-2 text-sm text-flask-gray-700">{label}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="flex items-center justify-between rounded-flask-2xl bg-flask-teal-soft/50 px-3 py-2">
          <span className="text-sm font-medium text-flask-teal-pill">Opening Cash Balance</span>
          <span className="text-sm font-medium text-flask-teal-pill">
            {formatMoney(figures.openingCash, code)}
          </span>
        </div>
      </div>
    </>
  );
}

function SalesView({ report }: { report: DailyReport }) {
  const code = report.currency_code;
  const sales = summarySales(report.sales);
  const nonCash = sales.groups === "non_cash";
  const { electronic, delivery } = sections(sales.methods, sales.groups);
  const sum = (list: { amount: number }[]) => list.reduce((t, m) => t + m.amount, 0);
  const field = (m: (typeof sales.methods)[number]) => (
    <LockedMoney
      key={m.value_name}
      id={`sales_${m.value_name}`}
      label={flaskLabel(m.name)}
      code={code}
      amount={m.amount}
    />
  );
  return (
    <>
      <Title>Sales Entry</Title>
      <div className={CARD}>
        <Section
          icon={<CardIcon />}
          title={nonCash ? "Non-cash Sales" : "Electronic Payments"}
          smallTitle
        >
          <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2">{electronic.map(field)}</div>
          <Total
            label={nonCash ? "Total Non-cash Sales" : "Total Electronic Payment Sales"}
            amount={formatMoney(sum(electronic), code)}
          />
        </Section>

        {nonCash ? null : (
          <Section icon={<TruckIcon />} title="Delivery Sales">
            <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2">{delivery.map(field)}</div>
            <Total label="Total Delivery Sales" amount={formatMoney(sum(delivery), code)} />
          </Section>
        )}

        <Section icon={<CashIcon />} title="Cash Sales">
          <div className="mb-3">
            <LockedMoney
              id="sales_cash_sales"
              ariaLabel="Cash Sales"
              code={code}
              amount={sales.cash}
            />
          </div>
          <Total label="Total Cash Sales" amount={formatMoney(sales.cash, code)} />
        </Section>
      </div>
    </>
  );
}

function ExpensesView({
  report,
  onOpen,
}: {
  report: DailyReport;
  onOpen: (line: ReportLine) => void;
}) {
  const code = report.currency_code;
  const lines = report.expenses.lines;
  return (
    <>
      <Title>Expenses</Title>
      <div className={CARD}>
        {/* block, not flex: Flask's rows overlap by their -12px margins, which only collapse in block flow */}
        <div>
          {lines.map((line) => (
            <ExpenseRow key={line.id} line={line} code={code} onOpen={() => onOpen(line)} />
          ))}
        </div>
        {lines.length === 0 ? (
          <p className="py-8 text-center text-flask-gray-500">No expenses recorded</p>
        ) : null}
        <div className="mt-4 flex items-center justify-between rounded-flask-2xl bg-flask-teal-soft/50 p-3 py-2">
          <span className="text-sm font-medium text-flask-teal-pill">Total Expense</span>
          <span className="text-sm font-medium text-flask-teal-pill">
            {formatMoney(report.expenses.total, code)}
          </span>
        </div>
      </div>
    </>
  );
}

function DepositView({ report }: { report: DailyReport }) {
  const { cash, currency_code: code } = report;
  return (
    <>
      <Title>Deposit to Bank</Title>
      <div className={CARD}>
        <StepImage
          src="/img/deposit.webp"
          alt="Deposit"
          width={240}
          height={282}
          boxClass="mb-10 w-[240px]"
          minHeight={164}
          skeleton={170}
        />
        <div className="mb-6">
          <p className="text-sm text-flask-gray-600">
            <span>Current Balance: </span>
            <span className="font-semibold break-all">
              {formatMoney(stepViewFigures(cash).cashOnHand, code)}
            </span>
          </p>
        </div>
        <LockedMoney
          id="bank_deposit"
          label="Deposit Amount"
          labelClass="mb-2 block text-sm font-medium text-flask-gray-700"
          code={code}
          amount={cash.bank_deposit}
        />
      </div>
    </>
  );
}

function CashCountView({
  report,
  onCalculator,
}: {
  report: DailyReport;
  onCalculator: () => void;
}) {
  const { cash, currency_code: code } = report;
  const { difference } = cash;
  const out = difference.kind !== "none";
  return (
    <>
      <div className="mb-2 text-left">
        <h2 className="text-lg font-bold text-flask-gray-700 sm:text-xl">Cash Count</h2>
        <div className="mt-2 inline-flex max-w-full flex-wrap items-center gap-x-4 rounded-flask-2xl bg-flask-gray-200 px-4 py-2">
          <span className="text-sm font-medium text-flask-gray-500">
            Expected Cash Count Balance
          </span>
          <span className="w-fit whitespace-nowrap text-sm font-medium text-flask-gray-500">
            {formatMoney(cash.expected, code)}
          </span>
        </div>
      </div>

      <div className={CARD}>
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
              value={formatMoney(cash.counted, code)}
              className="min-w-0 flex-1 cursor-not-allowed rounded-flask-xl border border-flask-gray-300 bg-flask-gray-200 px-3 py-3 text-flask-gray-500 focus:outline-none focus:ring-0"
            />
            <button
              type="button"
              title="Calculator"
              aria-label="Calculator"
              onClick={onCalculator}
              className="shrink-0 rounded-flask-xl border border-flask-gray-200 bg-flask-teal p-2 hover:bg-flask-teal/80 focus:outline-none focus:ring-0 focus-visible:ring-2 focus-visible:ring-flask-teal-ink"
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- Flask's 27px icon drawn at 32px */}
              <img src="/img/btn_calculator.webp" alt="" className="h-8 w-8" />
            </button>
          </div>
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
          <input
            id="safeBoxBalance"
            readOnly
            aria-labelledby="safe_box_label"
            value={formatMoney(cash.safe_box, code)}
            className="w-full min-w-0 cursor-not-allowed rounded-flask-xl border border-flask-gray-300 bg-flask-gray-200 px-3 py-3 text-flask-gray-500 focus:outline-none"
          />
        </div>
        <div className="mt-2 flex items-center justify-between gap-3 rounded-flask-2xl bg-flask-teal-soft/50 p-3">
          <span className="min-w-0 text-sm font-medium text-flask-teal-count">
            Total Cash Count
          </span>
          <span className="whitespace-nowrap text-right text-sm font-medium text-flask-teal-count">
            {formatMoney(stepViewFigures(cash).totalCount, code)}
          </span>
        </div>
      </div>

      <div className={CARD}>
        <h3 className="mb-4 text-sm font-semibold text-flask-gray-700">Discrepancy Details</h3>
        {out ? (
          <DiscrepancyAlert kind={difference.kind} amount={difference.amount} code={code} />
        ) : null}
        <textarea
          id="discrepancyDescription"
          aria-label="Description"
          rows={1}
          readOnly
          placeholder={out ? "Description" : "No discrepancy — description not required"}
          value={difference.reason}
          className="block w-full cursor-not-allowed resize-none rounded-flask-2xl border border-flask-gray-300 bg-flask-gray-200 px-3 py-3 text-flask-gray-500 focus:outline-none"
        />
      </div>
    </>
  );
}

/**
 * The Cash Count's calculator, read-only: each denomination with the report's count and its row's
 * total, then Total Cash Till Balance; Close, Escape or a click outside closes it.
 */
function CountsModal({ report, onClose }: { report: DailyReport; onClose: () => void }) {
  const code = report.currency_code;
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    panel.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
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
        className="max-h-[90vh] w-full min-w-0 max-w-2xl overflow-y-auto rounded-flask-2xl bg-flask-white p-6 shadow-flask-xl outline-none"
      >
        <div className="mb-6 flex items-center justify-between">
          <h2 id="calculator_title" className="text-xl font-bold text-flask-gray-700">
            Cash Count
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

        {report.cash.denominations.map((d) => {
          const id = `count_${d.id}`;
          return (
            <div key={d.id} className="mb-4">
              <div className="grid grid-cols-[6rem_minmax(0,1fr)] items-center gap-x-3 gap-y-2 sm:flex sm:gap-3">
                <label
                  htmlFor={id}
                  className="w-24 shrink-0 whitespace-nowrap text-base font-medium text-flask-gray-500"
                >
                  {denominationLabel(d.value, code, d.name)}
                </label>
                <div className="relative min-w-0 sm:flex-1">
                  <div
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-normal text-flask-gray-400"
                    aria-hidden="true"
                  >
                    X
                  </div>
                  <input
                    id={id}
                    readOnly
                    placeholder="0"
                    value={d.count ? d.count.toLocaleString("en-US") : ""}
                    className="w-full cursor-not-allowed rounded-flask-2xl border border-flask-gray-300 bg-flask-gray-200 py-3 pl-10 pr-3 text-right text-flask-gray-500 focus:outline-none"
                  />
                </div>
                <div className="col-span-2 flex min-w-0 items-center justify-between gap-2 rounded-flask-2xl border border-flask-gray-500 bg-flask-gray-300/20 px-3 py-3 sm:w-auto sm:min-w-40 sm:shrink-0">
                  <span className="font-medium text-flask-gray-500/60">{code}</span>
                  <output htmlFor={id} className="whitespace-nowrap text-right text-flask-gray-700">
                    {rowTotal(d.value, d.count).toLocaleString("en-US", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </output>
                </div>
              </div>
            </div>
          );
        })}

        <div className="mb-4 flex items-center justify-between gap-3 rounded-flask-2xl">
          <span className="min-w-0 text-sm font-medium text-flask-gray-700">
            Total Cash Till Balance
          </span>
          <span className="whitespace-nowrap text-right text-sm font-medium text-flask-gray-700">
            {formatMoney(report.cash.counted, code)}
          </span>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="w-full rounded-flask-xl bg-flask-teal px-4 py-3 text-flask-white hover:bg-flask-teal/80 focus:outline-none focus:ring-2 focus:ring-flask-teal"
        >
          Close
        </button>
      </div>
    </div>
  );
}
