"use client";

import Image from "next/image";
import { useEffect, useState, type ReactNode } from "react";

import { Button, buttonClass, EmptyState, Icon, InlineAlert, PageBanner, Skeleton, StatusPill } from "@minty/shared/ui";
import { useViewer } from "@minty/shared/viewer";

import { AppBar } from "@/components/layout/AppBar";
import { BeforeYouStartModal, DepositModal, SetupRequiredModal, type Confirmation } from "@/components/dashboard/DepositModals";
import { StepProgress, type StepProgressStep } from "@/components/ui/StepProgress";
import { ApiError, pettyCashFetch } from "@/lib/apiClient";
import { useAuth } from "@/lib/useAuth";
import {
  notStartedProgress,
  STAGES,
  stageOf,
  stageProgress,
  submittedProgress,
  type StageProgress,
} from "@/lib/dailyClosing";
import {
  depositToConfirm,
  firstName,
  gateDay,
  greetingFor,
  launchState,
  recentReports,
  reportSpan,
  startProblem,
  type Home,
  type Launch,
} from "@/lib/dashboard";
import { formatWeekdayDay, formatWeekdayShort, savedText } from "@/lib/dates";
import { historyUrl, reportSummaryUrl, resumeUrl, settingsUrl, wizardStepUrl, type WizardStep } from "@/lib/flaskPages";
import { leaveTo } from "@/lib/handoff";
import { formatMoney } from "@/lib/money";

const UNREACHABLE = "We couldn't reach Petty Cash. Check your connection, then reload the page.";
const READ_ONLY = "Read-only access";

// `now` is the device's clock when /home answered: the greeting and "Saved 6:02 pm" read it, so
// rendering stays pure and the server's HTML (which never has the data) cannot disagree with it.
type Load = { kind: "loading" } | { kind: "ready"; home: Home; now: Date } | { kind: "failed"; message: string };

/**
 * The Petty Cash launch page - Part 15.6a "Action Dashboard": the greeting, ONE primary work card
 * (today's Daily Closing over its five stages, Part 15.15), the business-rule gate when an earlier
 * day is unfinished, and the recent reports. No calendar, no Quick Actions, no KPIs (15.6).
 * Its rules live in lib/dashboard.ts and lib/dailyClosing.ts; what it reads is `GET /home`. The
 * wizard, history and report pages it opens are still Flask's (lib/flaskPages.ts).
 */
export function Dashboard() {
  const [load, setLoad] = useState<Load>({ kind: "loading" });

  useEffect(() => {
    let live = true;
    pettyCashFetch<Home>("/home")
      .then((home) => live && setLoad({ kind: "ready", home, now: new Date() }))
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
      {/* Phone: one column. Tablet: 640 wide. Computer: the card and the recent reports side by
          side (2:1), centred, at most 1200 (Part 15.6 Responsive, 15.D Main width). */}
      <main className="mx-auto flex w-full max-w-[640px] flex-col gap-5 px-4 pb-16 pt-6 sm:px-6 lg:max-w-[1200px] lg:px-8 lg:pt-8">
        {/* The App bar names the module for screen readers only, so the page keeps its own h1. */}
        <h1 className="text-display-m text-text-primary">Petty Cash</h1>
        {load.kind === "loading" ? (
          <div className="flex flex-col gap-4 rounded-xl border border-border-subtle bg-surface-card p-4 sm:p-6" role="status" aria-busy="true" aria-label="Loading">
            <Skeleton className="h-6 w-1/2" />
            <Skeleton className="h-[70px] w-full" />
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-11 w-full sm:w-56" />
          </div>
        ) : load.kind === "failed" ? (
          <InlineAlert tone="danger">{load.message}</InlineAlert>
        ) : (
          <LaunchBody home={load.home} now={load.now} entityId={auth?.entityId ?? ""} />
        )}
      </main>
    </>
  );
}

type Confirming = { startDay: string; day: string; deposit: number; submitter: string | null };

function LaunchBody({ home, now, entityId }: { home: Home; now: Date; entityId: string }) {
  const [problem, setProblem] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<Confirming | null>(null);
  const [step, setStep] = useState<"confirm" | "amount">("confirm");
  const [busy, setBusy] = useState(false);
  const [correctionProblem, setCorrectionProblem] = useState<string | null>(null);

  const code = home.currency_code;
  const readOnly = home.permissions.read_only;
  const launch = launchState(home);
  const gate = gateDay(home);

  function open(day: string) {
    leaveTo(wizardStepUrl(entityId, "opening", day));
  }

  /** Starting a day's closing: the date rules, then "Before You Start" when the day before banked cash. */
  function start(day: string) {
    const why = startProblem(home, day);
    if (why) {
      setProblem(why);
      return;
    }
    setProblem(null);
    if (!reportSpan(home)) return open(day);
    const previous = depositToConfirm(home, day);
    if (!previous) return open(day);
    setCorrectionProblem(null);
    setStep("confirm");
    setConfirming({ startDay: day, day: previous.day, deposit: previous.report.bank_deposit, submitter: previous.report.submitter_first_name });
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
    if (choice === "yes") return open(confirming.startDay);
    if (choice === "change") {
      setCorrectionProblem(null);
      setStep("amount");
      return;
    }
    void correct("no", 0);
  }

  const problemAlert = problem ? <InlineAlert tone="warning">{problem}</InlineAlert> : null;

  return (
    <>
      <Greeting today={home.server_today} now={now} withCharacter={launch.kind !== "first-use"} />

      {launch.kind === "first-use" ? (
        <div className="flex flex-col gap-3">
          <EmptyState
            character
            title="Your first Daily Closing"
            action={
              <Button kind="primary" disabled={readOnly} onClick={() => start(launch.day)}>
                Start today&apos;s Daily Closing
              </Button>
            }
          >
            Count the drawer, add the day&apos;s sales and expenses, then close the day. Each day&apos;s report appears here once it is submitted.
          </EmptyState>
          {readOnly ? <p className="text-center text-body-s text-text-secondary">{READ_ONLY}</p> : null}
          {problemAlert}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3 lg:items-start">
          <div className="flex min-w-0 flex-col gap-5 lg:col-span-2">
            <ClosingCard
              launch={launch}
              today={home.server_today}
              now={now}
              entityId={entityId}
              readOnly={readOnly}
              blockedBy={launch.kind === "not-started" ? gate : null}
              onStart={start}
              problem={problemAlert}
            />
            {gate ? (
              <PageBanner
                tone="warning"
                title={`Finish ${formatWeekdayShort(gate)} first`}
                action={
                  readOnly || (launch.kind === "in-progress" && launch.day === gate) ? undefined : (
                    <Button kind="link" onClick={() => start(gate)}>
                      Start Daily Closing for {formatWeekdayShort(gate)}
                    </Button>
                  )
                }
              >
                {formatWeekdayShort(gate)} has no submitted report yet. Submit it before closing today.
              </PageBanner>
            ) : null}
          </div>
          <RecentReports home={home} entityId={entityId} />
        </div>
      )}

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

/**
 * "Good evening, Olive · Wed 14 Oct 2026" with a small Minty (Part 15.6, P15-01): home only, NOT a
 * heading, and only when the person's name is known. On first use the empty state already
 * carries Minty, so the greeting goes without.
 */
function Greeting({ today, now, withCharacter }: { today: string; now: Date; withCharacter: boolean }) {
  const name = firstName(useViewer()?.name);
  if (!name) return null;
  return (
    <div className="flex min-w-0 items-center gap-3">
      {withCharacter ? (
        <Image src="/cat-hole.png" alt="" width={40} height={40} unoptimized className="size-10 shrink-0 object-contain" />
      ) : null}
      <p className="min-w-0">
        <span className="block text-title-m text-text-primary">
          {greetingFor(now.getHours())}, {name}
        </span>
        <span className="block text-body-s text-text-secondary">{formatWeekdayDay(today)}</span>
      </p>
    </div>
  );
}

/** The one primary work card: the day's Daily Closing, its five stages, and the one action. */
function ClosingCard({
  launch,
  today,
  now,
  entityId,
  readOnly,
  blockedBy,
  onStart,
  problem,
}: {
  launch: Exclude<Launch, { kind: "first-use" }>;
  today: string;
  now: Date;
  entityId: string;
  readOnly: boolean;
  /** The earlier day that must be finished before this one can start. */
  blockedBy: string | null;
  onStart: (day: string) => void;
  problem: ReactNode;
}) {
  const progress: StageProgress =
    launch.kind === "in-progress" ? stageProgress(launch.draft) : launch.kind === "done" ? submittedProgress() : notStartedProgress();
  const title = launch.day === today ? "Today's Daily Closing" : `Daily Closing · ${formatWeekdayShort(launch.day)}`;

  // Done and current stages open in the wizard (Part 14: free navigation); never for read-only.
  const stageHref = (index: number): string | undefined => {
    if (readOnly || launch.kind !== "in-progress") return undefined;
    const stage = STAGES[index];
    const current = launch.draft.current_section;
    const section: WizardStep =
      current && stageOf(current) === stage ? (current as WizardStep) : stage.sections[0];
    return wizardStepUrl(entityId, section, launch.day);
  };
  const steps: StepProgressStep[] = progress.stages.map(({ stage, state }, i) => ({ label: stage.short, state, href: stageHref(i) }));

  const reason = readOnly ? READ_ONLY : blockedBy ? `Finish ${formatWeekdayShort(blockedBy)} first.` : null;
  const action =
    launch.kind === "done" ? (
      <Button kind="primary" className="w-full sm:w-auto" onClick={() => leaveTo(reportSummaryUrl(entityId, launch.day))}>
        View report
      </Button>
    ) : launch.kind === "in-progress" ? (
      <Button kind="primary" className="w-full sm:w-auto" disabled={readOnly} onClick={() => leaveTo(resumeUrl(entityId, launch.day))}>
        Continue Daily Closing
      </Button>
    ) : (
      <Button kind="primary" className="w-full sm:w-auto" disabled={!!reason} onClick={() => onStart(launch.day)}>
        Start today&apos;s Daily Closing
      </Button>
    );

  return (
    <section aria-labelledby="closing-title" className="flex min-w-0 flex-col gap-4 rounded-xl border border-border-subtle bg-surface-card p-4 sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 id="closing-title" className="text-title-l text-text-primary">
          {title}
        </h2>
        <p className="text-body-s text-text-secondary">{formatWeekdayDay(launch.day)}</p>
      </div>

      <StepProgress steps={steps} label="Daily Closing stages" />

      <div className="flex flex-col gap-1">
        <p className="text-body-m text-text-primary">
          <span className="font-semibold">
            {progress.done} of {STAGES.length} done
          </span>
          {launch.kind !== "done" && progress.next ? <> &middot; Next: {progress.next.label}</> : null}
        </p>
        {launch.kind === "in-progress" ? (
          <p className="flex items-center gap-1.5 text-body-s text-text-secondary" aria-live="polite">
            <Icon name="cloud_done" size="sm" />
            {savedText(launch.draft.last_edit_seconds, now)}
          </p>
        ) : launch.kind === "done" ? (
          <p className="flex items-center gap-1.5 text-body-m text-text-primary">
            <Icon name="check_circle" size="md" />
            Today&apos;s report is submitted
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
        {action}
        {reason && launch.kind !== "done" ? <p className="text-body-s text-text-secondary">{reason}</p> : null}
      </div>
      {problem}
    </section>
  );
}

/** "Recent reports": the newest 2-3 submitted days as Record rows, and the way to all of them. */
function RecentReports({ home, entityId }: { home: Home; entityId: string }) {
  const rows = recentReports(home);
  return (
    <section aria-labelledby="recent-title" className="flex min-w-0 flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h2 id="recent-title" className="text-title-m text-text-primary">
          Recent reports
        </h2>
        <a href={historyUrl(entityId)} className={buttonClass("link")}>
          See all
        </a>
      </div>
      {rows.length ? (
        <ul className="flex flex-col gap-2">
          {rows.map(({ day, report }) => (
            <li key={day}>
              <a
                href={reportSummaryUrl(entityId, day)}
                className="flex min-h-11 min-w-0 items-center gap-3 rounded-lg border border-border-subtle bg-surface-card p-3 hover:bg-state-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-body-m font-semibold text-text-primary">{formatWeekdayDay(day)}</span>
                  <span className="block text-body-s text-text-secondary">Closing balance</span>
                </span>
                <span className="flex shrink-0 flex-col items-end gap-1">
                  <span className="text-body-m text-text-primary" translate="no">
                    {formatMoney(report.closing_balance, home.currency_code)}
                  </span>
                  <StatusPill label="Submitted" tone="info" />
                </span>
              </a>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState title="No submitted reports yet" className="py-6">
          Each Daily Closing appears here once it is submitted.
        </EmptyState>
      )}
    </section>
  );
}
