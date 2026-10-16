"use client";

import { useEffect, useRef, useState } from "react";

import { BeforeYouStartModal, DepositModal, SetupRequiredModal, type Confirmation } from "@/components/dashboard/Modals";
import { ReportCalendar } from "@/components/dashboard/ReportCalendar";
import { Stepper } from "@/components/flask/Stepper";
import { PhoneCard } from "@/components/flask/PhoneCard";
import { useToast } from "@/components/flask/Toasts";
import { entityAcronym } from "@/lib/acronym";
import { ApiError, pettyCashFetch } from "@/lib/apiClient";
import { reportHref } from "@/lib/companyPages";
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
import { resumeUrl, settingsUrl } from "@/lib/flaskPages";
import { takeFlash, takeNextDay } from "@/lib/flash";
import { leaveTo } from "@/lib/handoff";
import { historyHref } from "@/lib/history";
import { formatMoney } from "@/lib/money";
import { useAuth } from "@/lib/useAuth";
import { stepHref } from "@/lib/wizardPages";

const UNREACHABLE = "We couldn't reach Petty Cash. Check your connection, then reload the page.";
const READ_ONLY = "Read-only access";

const TEAL_BUTTON =
  "flex w-full items-center justify-center gap-2 rounded-flask-xl bg-flask-teal px-4 py-3 font-medium text-flask-white shadow-flask-md transition-colors hover:bg-flask-teal/80 disabled:cursor-not-allowed disabled:opacity-50";

type Load = { kind: "loading" } | { kind: "ready"; home: Home; nextDay: string | null } | { kind: "failed" };

/**
 * The Petty Cash dashboard - a pixel-faithful port of Flask's `entity/entity_dashboard_v2.html`:
 * the same phone card, sections, wording, colours and destinations. Its rules are lib/dashboard.ts
 * (the same ones the payments-look port on `port/prw-look` uses); what it reads is `GET /home`.
 * Settings, which it links to, is still Flask's page.
 */
export function Dashboard() {
  const toast = useToast();
  const auth = useAuth();
  const [load, setLoad] = useState<Load>({ kind: "loading" });

  useEffect(() => {
    // A step that refused a day sends the person here with why (Flask's flash).
    const flash = takeFlash();
    if (flash) toast(flash.message, flash.kind);
  }, [toast]);

  useEffect(() => {
    let live = true;
    pettyCashFetch<Home>("/home")
      // the Submitted page's "Continue to next day report": that day, started on arrival
      .then((home) => live && setLoad({ kind: "ready", home, nextDay: takeNextDay() }))
      .catch((err: unknown) => {
        // A 401 has already gone back through the hand-off.
        if (!live || (err instanceof ApiError && err.status === 401)) return;
        setLoad({ kind: "failed" });
        toast(err instanceof ApiError ? err.message : UNREACHABLE, "error");
      });
    return () => {
      live = false;
    };
  }, [toast]);

  const acronym = entityAcronym(auth?.entityName);
  if (load.kind !== "ready") {
    return (
      <PhoneCard acronym={acronym}>
        {load.kind === "loading" ? (
          <p className="text-sm text-flask-gray-500" role="status">
            Loading…
          </p>
        ) : null}
      </PhoneCard>
    );
  }
  return <DashboardBody home={load.home} nextDay={load.nextDay} entityId={auth?.entityId ?? ""} entityName={auth?.entityName ?? ""} acronym={acronym} />;
}

function DashboardBody({
  home,
  nextDay,
  entityId,
  entityName,
  acronym,
}: {
  home: Home;
  /** A day to start on arrival (Flask's `autoStartNextDay`): selected, then started as Start New Report would. */
  nextDay: string | null;
  entityId: string;
  entityName: string;
  acronym: string;
}) {
  const toast = useToast();
  const [selected, setSelected] = useState<string | null>(nextDay);
  const [confirming, setConfirming] = useState<{ day: string; deposit: number; submitter: string | null } | null>(null);
  const [step, setStep] = useState<"confirm" | "amount">("confirm");
  const [busy, setBusy] = useState(false);

  const code = home.currency_code;
  const readOnly = home.permissions.read_only;
  const draft = home.draft;
  const hasReports = reportSpan(home) !== null;
  const selectedReport = selected ? home.published[selected] : undefined;
  const actionDay = selected ?? home.server_today;
  const viewing = selected ? !!selectedReport : home.today_has_report;
  const actionReport = home.published[actionDay];
  const summaryDay = selected ?? home.latest.date;
  const summaryBalance = selected ? balanceFor(home, selected) : home.latest.closing_balance;
  const todaySubmitted = !draft && home.today_is_latest_report && !(selected && !selectedReport);

  function open(day: string) {
    leaveTo(stepHref(entityId, entityName, "opening", day));
  }

  function pick(day: string) {
    if (day === home.server_today && !home.published[day] && previousDayUnfinished(home)) {
      toast(PREVIOUS_DAY_FIRST, "warning");
      return;
    }
    setSelected(day);
  }

  function start(day: string) {
    const why = startProblem(home, day);
    if (why) {
      toast(why, "warning");
      return;
    }
    if (!hasReports) return open(day);
    const previous = depositToConfirm(home, day);
    if (!previous) return open(day);
    setStep("confirm");
    setConfirming({ day: previous.day, deposit: previous.report.bank_deposit, submitter: previous.report.submitter_first_name });
  }

  const started = useRef(false); // once, though development runs effects twice
  useEffect(() => {
    if (started.current || !nextDay) return;
    started.current = true;
    start(nextDay);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, on arrival: `start` reads this render's home
  }, [nextDay]);

  async function correct(kind: "change" | "no", amount: number) {
    if (!confirming) return;
    setBusy(kind === "change");
    try {
      const answer = await pettyCashFetch<{ status: string; message?: string; next_transaction_date: string }>("/deposit-correction", {
        method: "POST",
        json: { kind, date: confirming.day, amount },
      });
      if (answer.status === "warning" && answer.message) toast(answer.message, "error");
      leaveTo(stepHref(entityId, entityName, "opening", answer.next_transaction_date));
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return;
      toast(err instanceof ApiError ? err.message : "I couldn't save that deposit correction. Mind trying again?", "error");
      setBusy(false);
    }
  }

  function proceed(choice: Confirmation | null) {
    if (!choice) {
      toast("Please select a confirmation option", "error");
      return;
    }
    if (choice === "yes") return open(actionDay);
    if (choice === "change") return setStep("amount");
    void correct("no", 0);
  }

  function proceedAmount(amount: number) {
    if (!confirming) return;
    if (amount > confirming.deposit) {
      setConfirming(null);
      toast("The deposit can't be higher than the previous one.", "warning");
      return;
    }
    void correct("change", amount);
  }

  const overlays = (
    <>
      {confirming && step === "confirm" ? (
        <BeforeYouStartModal
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
          onProceed={proceed}
        />
      ) : null}
      {confirming && step === "amount" ? (
        <DepositModal
          onBack={() => setStep("confirm")}
          onClose={() => setConfirming(null)}
          currencyCode={code}
          busy={busy}
          onProceed={proceedAmount}
        />
      ) : null}
      {!home.xero_settings.complete ? <SetupRequiredModal missing={home.xero_settings.missing} settingsHref={settingsUrl(entityId)} /> : null}
    </>
  );

  return (
    <PhoneCard acronym={acronym} overlays={overlays}>
      <div className="mb-6">
        {previousDayUnfinished(home) ? (
          <div className="mb-4">
            <div className="mb-10 flex w-full items-start rounded-[8px] border-l-4 border-l-flask-amber-edge bg-flask-amber-bg px-4 py-3" role="status">
              <svg className="mr-3 mt-0.5 flex-shrink-0" width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                <circle cx="10" cy="10" r="9" className="fill-flask-amber-bg stroke-flask-amber" strokeWidth="2" />
                <rect x="9" y="8" width="2" height="5" rx="1" className="fill-flask-amber" />
                <rect x="9" y="5" width="2" height="2" rx="1" className="fill-flask-amber" />
              </svg>
              <div>
                <p className="mb-1 text-sm font-bold text-flask-amber-ink">Warning</p>
                <p className="text-sm leading-snug text-flask-amber-ink">Earlier reports need finishing before this one. Want to catch those up first?</p>
              </div>
            </div>
          </div>
        ) : null}

        {todaySubmitted ? (
          <div className="mb-6">
            <div className="mb-6 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-flask-green-ink/10">
                <svg width="16" height="14" viewBox="0 0 16 14" fill="none" className="size-5" aria-hidden="true">
                  <path d="M6.25 9.6412L13.8443 2L15 3.1794L6.25 12L1 6.701L2.15566 5.53821L6.25 9.6412Z" className="fill-flask-green" />
                </svg>
              </div>
              <h2 className="text-xl font-bold text-flask-gray-900">Today&apos;s report is submitted</h2>
            </div>
          </div>
        ) : null}

        {!draft ? (
          <div className="mb-6 flex flex-row items-center justify-between gap-4">
            <div>
              <span className="mb-1 block text-sm text-flask-gray-500">Report in Progress</span>
              <div className="text-lg font-semibold text-flask-gray-900">{summaryDay ? formatDay(summaryDay) : "Today"}</div>
            </div>
            <div>
              <span className="mb-1 block text-sm text-flask-gray-500">Current balance</span>
              <div className="text-right text-lg font-semibold text-flask-gray-900">{formatMoney(summaryBalance, code)}</div>
            </div>
          </div>
        ) : (
          <div className="mb-16">
            <div className="mb-10 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-flask-red-soft">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor" className="h-5 w-5 text-flask-red" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                </svg>
              </div>
              <h2 className="text-xl font-bold text-flask-gray-900">Pick up where you left off</h2>
            </div>

            <div className="rounded-flask-xl border border-flask-gray-200 bg-flask-white p-4 shadow-flask-lg">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-base font-semibold text-flask-gray-900">Daily Report Progress</h3>
                <span className="text-sm font-medium text-flask-green-ink">
                  {draft.completed_sections.length}/{STEPS.length} Complete
                </span>
              </div>
              <p className="mb-4 text-sm text-flask-gray-600">{home.draft_date ? formatDayWithWeekday(home.draft_date) : "Today"}</p>
              <div className="mb-4">
                <Stepper draft={draft} stepHref={(key) => stepHref(entityId, entityName, key, home.draft_date ?? home.server_today)} />
              </div>
              <button
                type="button"
                onClick={() => leaveTo(resumeUrl(entityId, home.draft_date ?? home.server_today))}
                disabled={readOnly}
                title={readOnly ? READ_ONLY : undefined}
                className={`${TEAL_BUTTON} mb-12`}
              >
                <svg width="27" height="28" viewBox="0 0 21 22" fill="none" aria-hidden="true">
                  <path
                    d="M12.8761 11.4957L7.36113 7.83543V15.156L12.8761 11.4957ZM15.4441 11.8566L6.30984 17.9227C6.20643 17.9914 6.09728 18.0143 5.98238 17.9914C5.86749 17.9685 5.77557 17.9055 5.70663 17.8024C5.66067 17.7336 5.6377 17.6534 5.6377 17.5618V5.42961C5.6377 5.30359 5.68078 5.20049 5.76695 5.12029C5.85313 5.0401 5.95366 5 6.06855 5C6.16047 5 6.2409 5.02291 6.30984 5.06874L15.4441 11.1348C15.536 11.2036 15.5963 11.2952 15.625 11.4098C15.6537 11.5243 15.6336 11.6332 15.5647 11.7363C15.5302 11.7821 15.49 11.8222 15.4441 11.8566Z"
                    className="fill-flask-white"
                  />
                </svg>
                <span>Continue Report</span>
              </button>
              <p className="text-right text-xs text-flask-gray-500">Last edit {lastEditText(draft.last_edit_seconds)} ago</p>
            </div>
          </div>
        )}

        {!draft ? (
          <div className="mb-10">
            {viewing ? (
              <button
                type="button"
                onClick={() => actionReport && leaveTo(reportHref(entityId, entityName, actionReport.id, "summary"))}
                className="flex w-full items-center justify-center rounded-flask-xl bg-flask-green px-4 py-3 font-medium text-flask-white shadow-flask-md transition-colors hover:bg-flask-green/80"
              >
                <span>View Report</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => start(actionDay)}
                disabled={readOnly}
                title={readOnly ? READ_ONLY : undefined}
                className={TEAL_BUTTON}
              >
                <svg width="13" height="14" viewBox="0 0 13 14" fill="none" aria-hidden="true">
                  <path d="M5.57143 5.69643V0.125H7.42857V5.69643H13V7.55357H7.42857V13.125H5.57143V7.55357H0V5.69643H5.57143Z" className="fill-flask-white" />
                </svg>
                <span>Start New Report</span>
              </button>
            )}
          </div>
        ) : null}
      </div>

      <div className="mb-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-flask-gray-900">Quick Actions</h2>
          <span className="text-sm text-flask-gray-500">
            {home.user_count} user{home.user_count === 1 ? "" : "s"}
          </span>
        </div>
        <div className="mb-8 grid grid-cols-2 gap-4">
          <div className="cursor-pointer rounded-flask-lg bg-flask-white p-4 shadow-flask-sm transition-shadow hover:shadow-flask-md">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-flask-purple-bg">
                <svg width="21" height="28" viewBox="0 0 15 22" fill="none" aria-hidden="true">
                  <path d="M2.38956 11.291H3.55581V16.541H2.38956V11.291ZM11.7196 8.95768H12.8858V16.541H11.7196V8.95768ZM7.05456 5.45768H8.22081V16.541H7.05456V5.45768Z" className="fill-flask-purple" />
                </svg>
              </div>
              <a href={historyHref(entityId, entityName)} className="flex-1">
                <h3 className="text-xs font-semibold text-flask-gray-900 sm:text-sm">View History</h3>
                <p className="text-xs text-flask-gray-500">Reports &amp; Summary</p>
              </a>
            </div>
          </div>
          <div className="cursor-pointer rounded-flask-lg bg-flask-white p-4 shadow-flask-sm transition-shadow hover:shadow-flask-md">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-flask-orange-bg">
                <svg width="24" height="30" viewBox="0 0 16 22" fill="none" aria-hidden="true">
                  <path
                    d="M6.38833 5.16732V6.33398H9.88708V5.16732H11.0533V6.33398H13.3858C13.5491 6.33398 13.6871 6.39037 13.7999 6.50315C13.9126 6.61593 13.969 6.75398 13.969 6.91732V16.2507C13.969 16.414 13.9126 16.552 13.7999 16.6648C13.6871 16.7776 13.5491 16.834 13.3858 16.834H2.88958C2.72631 16.834 2.5883 16.7776 2.47556 16.6648C2.36283 16.552 2.30646 16.414 2.30646 16.2507V6.91732C2.30646 6.75398 2.36283 6.61593 2.47556 6.50315C2.5883 6.39037 2.72631 6.33398 2.88958 6.33398H5.22208V5.16732H6.38833ZM12.8027 10.4173H3.47271V15.6673H12.8027V10.4173ZM9.91041 11.0823L10.7268 11.9107L7.84615 14.7923L5.78188 12.7273L6.60992 11.9107L7.84615 13.1473L9.91041 11.0823ZM5.22208 7.50065H3.47271V9.25065H12.8027V7.50065H11.0533V8.08398H9.88708V7.50065H6.38833V8.08398H5.22208V7.50065Z"
                    className="fill-flask-orange"
                  />
                </svg>
              </div>
              <a href={settingsUrl(entityId)} className="flex-1">
                <h3 className="text-xs font-semibold text-flask-gray-900 sm:text-sm">Entity Settings</h3>
                <p className="text-xs text-flask-gray-500">Edit Sales Method</p>
              </a>
            </div>
          </div>
        </div>
      </div>

      <ReportCalendar home={home} selected={selected} onPick={pick} />
    </PhoneCard>
  );
}
