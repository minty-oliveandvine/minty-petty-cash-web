"use client";

import { useEffect, useState } from "react";

import { Button, Icon, InlineAlert, PageBanner, Skeleton } from "@minty/shared/ui";

import { AppBar } from "@/components/layout/AppBar";
import { BeforeYouStartModal, DepositModal, SetupRequiredModal, type Confirmation } from "@/components/dashboard/DepositModals";
import { ReportCalendar } from "@/components/dashboard/ReportCalendar";
import { Stepper } from "@/components/dashboard/Stepper";
import { ApiError, pettyCashFetch } from "@/lib/apiClient";
import { useAuth } from "@/lib/useAuth";
import {
  balanceFor,
  depositToConfirm,
  lastEditText,
  PREVIOUS_DAY_FIRST,
  previousDayUnfinished,
  reportSpan,
  startProblem,
  STEPS,
  type Home,
} from "@/lib/dashboard";
import { formatDay, formatDayWithWeekday } from "@/lib/dates";
import { historyUrl, reportSummaryUrl, resumeUrl, settingsUrl, wizardStepUrl } from "@/lib/flaskPages";
import { leaveTo } from "@/lib/handoff";
import { formatMoney } from "@/lib/money";

const UNREACHABLE = "We couldn't reach Petty Cash. Check your connection, then reload the page.";
const READ_ONLY = "Read-only access";

type Load = { kind: "loading" } | { kind: "ready"; home: Home } | { kind: "failed"; message: string };

/**
 * The Petty Cash dashboard - a faithful port of Flask's `entity/entity_dashboard_v2.html`, drawn
 * with minty-payment-request-web's design (Part 13 tokens, the `@minty/shared/ui` primitives):
 * the same sections, wording, rules and destinations. Its rules live in lib/dashboard.ts; what
 * it reads is `GET /home`. The wizard, history, summary and settings it links to are still
 * Flask's pages (lib/flaskPages.ts) until they are ported.
 */
export function Dashboard() {
  const [load, setLoad] = useState<Load>({ kind: "loading" });

  useEffect(() => {
    let live = true;
    pettyCashFetch<Home>("/home")
      .then((home) => live && setLoad({ kind: "ready", home }))
      .catch((err: unknown) => {
        // A 401 has already gone back through the hand-off.
        if (!live || (err instanceof ApiError && err.status === 401)) return;
        setLoad({ kind: "failed", message: err instanceof ApiError ? err.message : UNREACHABLE });
      });
    return () => {
      live = false;
    };
  }, []);

  const auth = useAuth();
  const companyName = auth?.entityName ?? "";

  return (
    <>
      <AppBar companyName={companyName} />
      <main className="mx-auto flex w-full max-w-[768px] flex-col gap-6 px-4 pb-16 pt-6 sm:px-6 lg:pt-8">
        {/* The page header's title, in the content column: Flask's dashboard is one centred column. */}
        <h1 className="text-display-m text-text-primary">Petty Cash</h1>
        {load.kind === "loading" ? (
          <div className="flex flex-col gap-4" role="status" aria-label="Loading">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-11 w-full" />
            <Skeleton className="h-80 w-full" />
          </div>
        ) : load.kind === "failed" ? (
          <InlineAlert tone="danger">{load.message}</InlineAlert>
        ) : (
          <DashboardBody home={load.home} entityId={auth?.entityId ?? ""} />
        )}
      </main>
    </>
  );
}

function DashboardBody({ home, entityId }: { home: Home; entityId: string }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<{ day: string; deposit: number; submitter: string | null } | null>(null);
  const [step, setStep] = useState<"confirm" | "amount">("confirm");
  const [busy, setBusy] = useState(false);
  const [correctionProblem, setCorrectionProblem] = useState<string | null>(null);

  const code = home.currency_code;
  const readOnly = home.permissions.read_only;
  const draft = home.draft;
  const hasReports = reportSpan(home) !== null;
  const selectedReport = selected ? home.published[selected] : undefined;

  // The day the main action is about, and what it is.
  const actionDay = selected ?? home.server_today;
  const viewing = selected ? !!selectedReport : home.today_has_report;

  const summaryDay = selected ?? home.latest.date;
  const summaryBalance = selected ? balanceFor(home, selected) : home.latest.closing_balance;
  const todaySubmitted = !draft && home.today_is_latest_report && !(selected && !selectedReport);

  function open(day: string) {
    leaveTo(wizardStepUrl(entityId, "opening", day));
  }

  function pick(day: string) {
    setProblem(null);
    if (day === home.server_today && !home.published[day] && previousDayUnfinished(home)) {
      setProblem(PREVIOUS_DAY_FIRST);
      return;
    }
    setSelected(day);
  }

  function start(day: string) {
    const why = startProblem(home, day);
    if (why) {
      setProblem(why);
      return;
    }
    setProblem(null);
    if (!hasReports) return open(day);
    const previous = depositToConfirm(home, day);
    if (!previous) return open(day);
    setCorrectionProblem(null);
    setStep("confirm");
    setConfirming({ day: previous.day, deposit: previous.report.bank_deposit, submitter: previous.report.submitter_first_name });
  }

  async function correct(kind: "change" | "no", amount: number) {
    if (!confirming) return;
    setBusy(true);
    setCorrectionProblem(null);
    try {
      const answer = await pettyCashFetch<{ next_transaction_date: string }>("/deposit-correction", {
        method: "POST",
        json: { kind, date: confirming.day, amount },
      });
      leaveTo(wizardStepUrl(entityId, "opening", answer.next_transaction_date));
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return;
      setCorrectionProblem(err instanceof ApiError ? err.message : UNREACHABLE);
      setBusy(false);
    }
  }

  function proceed(choice: Confirmation) {
    if (!confirming) return;
    if (choice === "yes") return open(actionDay);
    if (choice === "change") {
      setCorrectionProblem(null);
      setStep("amount");
      return;
    }
    void correct("no", 0);
  }

  return (
    <>
      {previousDayUnfinished(home) ? (
        <PageBanner tone="warning" title="Warning">
          Earlier reports need finishing before this one. Want to catch those up first?
        </PageBanner>
      ) : null}

      {todaySubmitted ? (
        <InlineAlert tone="success">Today&apos;s report is submitted</InlineAlert>
      ) : null}

      {!draft ? (
        <dl className="grid grid-cols-2 gap-4 rounded-lg border border-border-subtle bg-surface-card p-4">
          <div className="min-w-0">
            <dt className="text-label text-text-secondary">Report in Progress</dt>
            <dd className="mt-1 text-title-m text-text-primary">{summaryDay ? formatDay(summaryDay) : "Today"}</dd>
          </div>
          <div className="min-w-0 text-right">
            <dt className="text-label text-text-secondary">Current balance</dt>
            <dd className="mt-1 text-title-m text-text-primary">{formatMoney(summaryBalance, code)}</dd>
          </div>
        </dl>
      ) : (
        <section aria-labelledby="draft-title" className="flex flex-col gap-3">
          <h2 className="flex items-center gap-2 text-title-m text-text-primary">
            <Icon name="schedule" />
            Pick up where you left off
          </h2>
          <div className="flex flex-col gap-4 rounded-lg border border-border-subtle bg-surface-card p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 id="draft-title" className="text-body-m font-semibold text-text-primary">
                Daily Report Progress
              </h3>
              <span className="rounded-full bg-status-success-bg px-3 py-1 text-label text-status-success-ink">
                {draft.completed_sections.length}/{STEPS.length} Complete
              </span>
            </div>
            <p className="text-body-m text-text-secondary">
              {home.draft_date ? formatDayWithWeekday(home.draft_date) : "Today"}
            </p>
            <Stepper draft={draft} stepHref={(key) => wizardStepUrl(entityId, key, home.draft_date ?? home.server_today)} />
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-body-s text-text-muted">Last edit {lastEditText(draft.last_edit_seconds)} ago</p>
              <div className="flex items-center gap-3">
                {readOnly ? <span className="text-body-s text-text-secondary">{READ_ONLY}</span> : null}
                <Button
                  kind="primary"
                  disabled={readOnly}
                  onClick={() => leaveTo(resumeUrl(entityId, home.draft_date ?? home.server_today))}
                >
                  Continue Report
                </Button>
              </div>
            </div>
          </div>
        </section>
      )}

      {!draft ? (
        <div className="flex flex-col gap-2">
          {viewing ? (
            <Button kind="primary" full onClick={() => leaveTo(reportSummaryUrl(entityId, actionDay))}>
              View Report
            </Button>
          ) : (
            <>
              <Button
                kind="primary"
                full
                disabled={readOnly}
                icon={<Icon name="add" />}
                onClick={() => start(actionDay)}
              >
                Start New Report
              </Button>
              {readOnly ? <p className="text-center text-body-s text-text-secondary">{READ_ONLY}</p> : null}
            </>
          )}
          {problem ? <InlineAlert tone="warning">{problem}</InlineAlert> : null}
        </div>
      ) : problem ? (
        <InlineAlert tone="warning">{problem}</InlineAlert>
      ) : null}

      <section aria-labelledby="quick-actions" className="flex flex-col gap-3">
        <h2 id="quick-actions" className="text-title-m text-text-primary">
          Quick Actions
        </h2>
        <div className="grid grid-cols-2 gap-3">
          <a
            href={historyUrl(entityId)}
            className="flex min-h-11 min-w-0 flex-col gap-1 rounded-lg border border-border-subtle bg-surface-card p-4 hover:bg-state-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus"
          >
            <Icon name="history" />
            <span className="text-body-m font-semibold text-text-primary">View History</span>
            <span className="text-body-s text-text-secondary">Reports &amp; Summary</span>
          </a>
          <a
            href={settingsUrl(entityId)}
            className="flex min-h-11 min-w-0 flex-col gap-1 rounded-lg border border-border-subtle bg-surface-card p-4 hover:bg-state-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus"
          >
            <Icon name="settings" />
            <span className="text-body-m font-semibold text-text-primary">Entity Settings</span>
            <span className="text-body-s text-text-secondary">Edit Sales Method</span>
          </a>
        </div>
      </section>

      <ReportCalendar home={home} selected={selected} onPick={pick} />

      {confirming ? (
        <>
          <BeforeYouStartModal
            open={step === "confirm"}
            onClose={() => setConfirming(null)}
            day={confirming.day}
            amount={confirming.deposit}
            bankName={home.latest.deposit_bank_name}
            bankNumber={home.latest.deposit_bank_number}
            submitter={confirming.submitter}
            currencyCode={code}
            blockedBy={home.latest.deposit_correction_missing_settings}
            mayCorrect={home.permissions.correct_deposit}
            settingsHref={settingsUrl(entityId)}
            busy={busy}
            problem={correctionProblem}
            onProceed={proceed}
          />
          <DepositModal
            open={step === "amount"}
            onBack={() => {
              setCorrectionProblem(null);
              setStep("confirm");
            }}
            previousAmount={confirming.deposit}
            currencyCode={code}
            busy={busy}
            problem={correctionProblem}
            onProceed={(amount) => void correct("change", amount)}
          />
        </>
      ) : null}

      <SetupRequiredModal open={!home.xero_settings.complete} missing={home.xero_settings.missing} settingsHref={settingsUrl(entityId)} />
    </>
  );
}
