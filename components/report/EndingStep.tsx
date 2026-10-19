"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { PhoneCard } from "@/components/flask/PhoneCard";
import { Stepper } from "@/components/flask/Stepper";
import { useToast } from "@/components/flask/Toasts";
import { FixNegativeBalanceModal, FixStepButton, LoadingOverlay, ReportBadge, fixNote } from "@/components/report/ReportChrome";
import { ReportSummary } from "@/components/report/ReportSummary";
import { sentenceOf, toOpening, useBackToOpening } from "@/components/report/stepErrors";
import { entityAcronym } from "@/lib/acronym";
import { ApiError, pettyCashFetch } from "@/lib/apiClient";
import { getAuth } from "@/lib/auth";
import { pettyCashHome, reportHref } from "@/lib/companyPages";
import type { ClosePage } from "@/lib/ending";
import { setFlash } from "@/lib/flash";
import { datePill } from "@/lib/opening";
import { useAuth } from "@/lib/useAuth";
import { stepHref, type WizardStep } from "@/lib/wizardPages";

const UNREACHABLE = "We couldn't reach Petty Cash. Check your connection, then reload the page.";
const SUBMIT_FAILED = "I couldn't submit the report. Mind trying again?";
/** The steps a refusal can send the person back to - all of them this app's own pages. */
const STEPS: readonly string[] = ["opening", "sales", "expenses", "deposit", "cash_count"];

type SubmitAnswer = { report_id: string; transaction_date: string; status: string; submitted_at: string | null; closing_balance: number; next: "submitted" };
type Refusal = { error?: string; to?: string; report_id?: string };

/**
 * The report wizard's Ending step - a pixel-faithful port of Flask's ORIGINAL `report/ending.html`
 * (before the Part 15 redesign): the report header, the stepper, the "Draft report" callout,
 * "Summary" with the currency, then the cards - Total Sales (against yesterday, the three totals,
 * Show more for each method), Sales History (30 days, the day in red), Total Expenses (the pie of
 * the top seven accounts and "Other expenses", Show more for every account), Cash Balance (Show
 * more: the till and the safebox) - the shortage or surplus box, Back and "Finish Daily Report".
 * Reads `GET /reports/close`, submits through `POST /reports/submit` (Minty
 * `petty_cash_api/routes/close.py`), then opens the Submitted page (this app's own). The summary itself is
 * ReportSummary.tsx, shared with a submitted report's view.
 *
 * Flask's bugs left behind: one submit per click, however many clicks (Flask's form could post
 * twice); a refusal keeps the day and says why, on the step that fixes it (Flask's clean-up could
 * delete the draft); nothing is posted while the API names a problem or the drawer is below zero.
 */
export function EndingStep({ day }: { day: string | null }) {
  const toast = useToast();
  const router = useRouter();
  const auth = useAuth();
  const backToOpening = useBackToOpening();
  const [page, setPage] = useState<ClosePage | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    pettyCashFetch<ClosePage>("/reports/close", { query: { transaction_date: day ?? undefined } })
      .then((answer) => live && setPage(answer))
      .catch((err: unknown) => {
        if (!live || (err instanceof ApiError && err.status === 401)) return;
        setFailed(true);
        const message = err instanceof ApiError ? err.message : UNREACHABLE;
        const body = err instanceof ApiError ? (err.body as Refusal | null) : null;
        const company = getAuth();
        if (body?.to === "submitted" && body.report_id && company) {
          // the day is already in: its Submitted page
          router.push(reportHref(company.entityId, company.entityName, body.report_id, "submitted"));
        } else if (toOpening(err) && day) backToOpening(message, day);
        else toast(message, "error");
      });
    return () => {
      live = false;
    };
  }, [day, toast, backToOpening, router]);

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
  return <EndingSummary page={page} entityId={auth.entityId} entityName={auth.entityName} acronym={acronym} />;
}

function EndingSummary({ page, entityId, entityName, acronym }: { page: ClosePage; entityId: string; entityName: string; acronym: string }) {
  const toast = useToast();
  const router = useRouter();
  const home = pettyCashHome(entityId, entityName);
  const code = page.currency_code;
  const day = page.transaction_date;
  const progress = page.draft ?? { current_section: null, completed_sections: [] };
  const negativeDrawer = page.cash.expected < 0;

  const [negative, setNegative] = useState(negativeDrawer);
  const [busy, setBusy] = useState<string | null>(null);
  const [finishing, setFinishing] = useState(false);
  const [percent, setPercent] = useState(0);
  // a ref, not state: a second click in the same frame must see the first one
  const sending = useRef(false);
  const ticker = useRef<number | null>(null);

  // What would stop the submit, said on arrival as Flask says things (its toast); the drawer below
  // zero has Flask's own modal instead.
  const problem = page.problem;
  const said = useRef(false); // once per arrival, though development runs effects twice
  useEffect(() => {
    if (said.current || !problem || negativeDrawer) return;
    said.current = true;
    toast(problem.error, "error");
  }, [problem, negativeDrawer, toast]);

  useEffect(
    () => () => {
      if (ticker.current !== null) window.clearInterval(ticker.current);
    },
    [],
  );

  function go(step: WizardStep) {
    router.push(stepHref(entityId, entityName, step, day));
  }

  /** Where a refusal (the API's, or the problem it named on arrival) sends the person, and why. */
  function sendBack(sentence: string, to: string | undefined, reportId?: string) {
    if (to === "submitted" && reportId) {
      setBusy("Redirecting...");
      router.push(reportHref(entityId, entityName, reportId, "submitted"));
    } else if (to === "dashboard") {
      setFlash(sentence, "error");
      router.push(home);
    } else if (to && STEPS.includes(to)) {
      toast(sentence, "error");
      setBusy("Redirecting...");
      go(to as WizardStep);
    } else toast(sentence, "error");
  }

  function stopTicker() {
    if (ticker.current !== null) window.clearInterval(ticker.current);
    ticker.current = null;
  }

  async function finish() {
    if (sending.current) return;
    if (negativeDrawer) {
      setNegative(true);
      return;
    }
    if (problem) {
      sendBack(problem.error, problem.to);
      return;
    }
    sending.current = true;
    setFinishing(true);
    setPercent(0);
    // Flask's overlay: "Finishing...", then 2% more every 600ms, never past 95%
    ticker.current = window.setInterval(() => setPercent((p) => p + 2), 600);
    try {
      const answer = await pettyCashFetch<SubmitAnswer>("/reports/submit", { method: "POST", json: { transaction_date: day } });
      router.push(reportHref(entityId, entityName, answer.report_id, "submitted"));
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return;
      stopTicker();
      sending.current = false;
      setFinishing(false);
      const body = err instanceof ApiError && err.status === 409 ? (err.body as Refusal | null) : null;
      const sentence = sentenceOf(err) ?? (err instanceof ApiError ? SUBMIT_FAILED : UNREACHABLE);
      if (body) sendBack(sentence, body.to, body.report_id);
      else toast(sentence, "error");
    }
  }

  function fix(step: WizardStep) {
    setNegative(false);
    setBusy("Redirecting...");
    go(step);
  }

  const overlays = (
    <>
      {finishing ? <LoadingOverlay text={percent > 0 ? `Finishing... ${Math.min(percent, 95)}%` : "Finishing..."} /> : null}
      {busy && !finishing ? <LoadingOverlay text={busy} /> : null}
      {negative ? (
        <FixNegativeBalanceModal balance={page.cash.expected} currencyCode={code} message="Cash balance cannot be negative, let's go back to" window>
          <FixStepButton label="Opening" note={fixNote("Cash in", page.cash_addition, code)} noteClass="text-flask-green" onClick={() => fix("opening")} />
          <FixStepButton label="Sales" note={fixNote("Cash in", page.sales.cash, code)} noteClass="text-flask-green" onClick={() => fix("sales")} />
          <FixStepButton label="Expenses" note={fixNote("Cash out", page.expenses.total, code)} noteClass="text-flask-red" onClick={() => fix("expenses")} />
          <FixStepButton label="Deposit" note={fixNote("Cash out", page.cash.bank_deposit, code)} noteClass="text-flask-red" onClick={() => fix("deposit")} />
          <FixStepButton label="Cash Count" note="" noteClass="" onClick={() => fix("cash_count")} />
        </FixNegativeBalanceModal>
      ) : null}
    </>
  );

  const gate = negativeDrawer ? null : problem?.error ?? null;

  return (
    <PhoneCard
      acronym={acronym}
      datePill={datePill(day)}
      badge={<ReportBadge draft={page.draft} />}
      backHref={home}
      stepper={<Stepper draft={progress} page="ending" stepHref={(step) => stepHref(entityId, entityName, step, day)} />}
      overlays={overlays}
    >
      {!page.draft || page.draft.status === "draft" ? <DraftCallout /> : null}

      <ReportSummary
        code={code}
        sales={page.sales}
        yesterday={page.sales.yesterday_total}
        history={page.sales.history}
        lines={page.expenses.lines}
        cash={page.cash}
      />

      <div className="mb-2 mt-6 flex justify-center">
        <button
          type="button"
          onClick={() => go("cash_count")}
          disabled={finishing}
          className="group flex min-h-[40px] items-center justify-center px-4 py-2 text-sm font-medium text-flask-teal transition-colors hover:text-flask-teal/80"
        >
          <svg width="14" height="13" viewBox="0 0 14 13" fill="none" xmlns="http://www.w3.org/2000/svg" className="mr-2 transition-transform duration-300 group-hover:-translate-x-1" aria-hidden="true">
            <path d="M3.466 5.66477L7.83718 1.18659L6.68352 -9.53674e-07L0.362305 6.50026L6.68352 13L7.83718 11.8139L3.466 7.33576H13.3623V5.66477H3.466Z" fill="currentColor" />
          </svg>
          <span>Back</span>
        </button>
      </div>

      <button
        type="button"
        onClick={() => void finish()}
        disabled={finishing}
        aria-describedby={gate ? "finish_reason" : undefined}
        className="group flex w-full items-center justify-center gap-2 rounded-flask-xl bg-flask-teal px-4 py-3 font-medium text-flask-white shadow-flask-md transition-colors hover:bg-flask-teal/80"
      >
        <svg width="14" height="10" viewBox="0 0 14 10" fill="none" xmlns="http://www.w3.org/2000/svg" className="transition-transform duration-300 group-hover:scale-[1.2]" aria-hidden="true">
          <path d="M5.25 7.6412L12.8443 9.53674e-07L14 1.1794L5.25 10L0 4.701L1.15566 3.53821L5.25 7.6412Z" className="fill-flask-white" />
        </svg>
        <span>{finishing ? "Finishing..." : "Finish Daily Report"}</span>
      </button>
      {gate ? (
        <p id="finish_reason" className="mt-2 text-sm text-flask-danger-ink">
          {gate}
        </p>
      ) : null}
    </PhoneCard>
  );
}

/** Flask's slate "Draft report" callout over the summary. */
function DraftCallout() {
  return (
    <div className="mb-6 flex w-full max-w-full items-start rounded-flask-lg border-l-4 border-l-flask-badge-draft-ink bg-flask-submitted px-4 py-3">
      <svg className="mr-3 mt-0.5 flex-shrink-0" width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
        <circle cx="10" cy="10" r="9" strokeWidth="2" className="fill-flask-submitted stroke-flask-badge-draft-ink" />
        <rect x="9" y="8" width="2" height="5" rx="1" className="fill-flask-badge-draft-ink" />
        <rect x="9" y="5" width="2" height="2" rx="1" className="fill-flask-badge-draft-ink" />
      </svg>
      <div className="min-w-0">
        <p className="mb-1 text-sm font-semibold text-flask-badge-draft-ink">Draft report</p>
        <p className="text-sm leading-snug text-flask-badge-draft-ink">
          This report is still a draft and has not been submitted. Review the summary below, then complete submission when you are ready to finalise.
        </p>
      </div>
    </div>
  );
}

