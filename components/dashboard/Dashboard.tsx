"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { Button, buttonClass, EmptyState, Icon, InlineAlert, PageBanner, Skeleton, StatusPill } from "@minty/shared/ui";
import { useViewer } from "@minty/shared/viewer";

import { AppBar } from "@/components/layout/AppBar";
import { BeforeYouStartModal, DepositModal, SetupRequiredModal, type Confirmation } from "@/components/dashboard/DepositModals";
import { SubscriptionNoticeModal } from "@/components/dashboard/SubscriptionNoticeModal";
import { StepProgress, type StepProgressStep } from "@/components/ui/StepProgress";
import { ApiError, pettyCashFetch } from "@/lib/apiClient";
import { xeroSettingsHref } from "@/lib/companyPages";
import { useAuth } from "@/lib/useAuth";
import {
  notStartedProgress,
  STAGES,
  stageProgress,
  stageSection,
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
  setupRequired,
  startProblem,
  type Home,
  type Launch,
} from "@/lib/dashboard";
import { formatWeekdayDay, formatWeekdayShort, savedText } from "@/lib/dates";
import { takeFlash, type FlashKind } from "@/lib/flash";
import { leaveTo } from "@/lib/handoff";
import { money } from "@/lib/money";
import { subscriptionSettingsUrl } from "@/lib/hub";
import { claimSubscriptionNotice, fetchSubscriptionNotice, type SubscriptionNotice } from "@/lib/subscriptionNotice";
import { historyHref, reportHref, resumeHref, stepHref } from "@/lib/wizardPages";

const UNREACHABLE = "We couldn't reach Petty Cash. Check your connection, then reload the page.";
const READ_ONLY = "Read-only access";

// `now` is the device's clock when /home answered: the greeting and "Saved 6:02 pm" read it, so
// rendering stays pure and the server's HTML (which never has the data) cannot disagree with it.
type Load = { kind: "loading" } | { kind: "ready"; home: Home; now: Date } | { kind: "failed"; message: string };
type Flash = { message: string; kind: FlashKind } | null;

/** A flash's tone as a Page banner - an error is Danger, and never a toast (Part 14, 15.10). */
const FLASH_TONE = { error: "danger", warning: "warning", success: "success", info: "info" } as const;

/**
 * The Petty Cash launch page - Part 15.6a "Action Dashboard": the greeting, ONE primary work card
 * (today's Daily Closing over its five stages, Part 15.15), the business-rule gate when an earlier
 * day is unfinished, and the recent reports. No calendar, no Quick Actions, no KPIs (15.6).
 * Its rules live in lib/dashboard.ts and lib/dailyClosing.ts; what it reads is `GET /home`. The
 * stages, the Daily Report and the report history it opens are this app's. Its settings links open
 * this app's settings, never a Flask page: Setup Required's "Choose your company's currency" at
 * Country & currency (`currencySettingsHref`), its Xero mappings and a deposit correction's missing
 * accounts at the Xero cards (`xeroSettingsHref`).
 */
export function Dashboard() {
  const [load, setLoad] = useState<Load>({ kind: "loading" });
  // A stage that refused its day sends the person here with why (lib/flash.ts, Flask's flash).
  // Taken once - in a ref, so a development re-run of the effect does not lose it - and shown
  // once the page has data, under the h1 (15.1: a page-wide state goes under the header).
  const flash = useRef<Flash | undefined>(undefined);
  const [shownFlash, setShownFlash] = useState<Flash>(null);

  useEffect(() => {
    let live = true;
    if (flash.current === undefined) flash.current = takeFlash();
    pettyCashFetch<Home>("/home")
      .then((home) => {
        if (!live) return;
        setShownFlash(flash.current ?? null);
        setLoad({ kind: "ready", home, now: new Date() });
      })
      .catch((err: unknown) => {
        // A 401 has already gone back through the hand-off.
        if (!live || (err instanceof ApiError && err.status === 401)) return;
        setShownFlash(flash.current ?? null);
        setLoad({ kind: "failed", message: err instanceof ApiError ? err.message : UNREACHABLE });
      });
    return () => {
      live = false;
    };
  }, []);

  const auth = useAuth();
  const companyName = auth?.entityName ?? "";

  // The subscription notice (Flask's launch page): read alongside /home, shown once per company
  // per sign-in. Claimed only when there is something to show, so a quiet day claims nothing.
  const entityId = auth?.entityId ?? "";
  const [notice, setNotice] = useState<SubscriptionNotice | null>(null);
  useEffect(() => {
    if (!entityId) return;
    let live = true;
    void fetchSubscriptionNotice(entityId).then((found) => {
      if (live && found && claimSubscriptionNotice(entityId)) setNotice(found);
    });
    return () => {
      live = false;
    };
  }, [entityId]);

  return (
    <>
      <AppBar companyName={companyName} />
      {/* Phone: one column. Tablet: 640 wide. Computer: the card and the recent reports side by
          side (2:1), centred, at most 1200 (Part 15.6 Responsive, 15.D Main width). */}
      <main className="mx-auto flex w-full max-w-[640px] flex-col gap-5 px-4 pb-16 pt-6 sm:px-6 lg:max-w-[1200px] lg:px-8 lg:pt-8">
        {/* The App bar names the module for screen readers only, so the page keeps its own h1. */}
        <h1 className="text-display-m text-text-primary">Petty Cash</h1>
        {shownFlash ? <PageBanner tone={FLASH_TONE[shownFlash.kind]}>{shownFlash.message}</PageBanner> : null}
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
          <LaunchBody home={load.home} now={load.now} entityId={entityId} entityName={companyName} />
        )}
      </main>
      <SubscriptionNoticeModal notice={notice} settingsHref={subscriptionSettingsUrl(entityId, companyName)} onClose={() => setNotice(null)} />
    </>
  );
}

type Confirming = { startDay: string; day: string; deposit: number; submitter: string | null };

function LaunchBody({ home, now, entityId, entityName }: { home: Home; now: Date; entityId: string; entityName: string }) {
  const [problem, setProblem] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<Confirming | null>(null);
  const [step, setStep] = useState<"confirm" | "amount">("confirm");
  const [busy, setBusy] = useState(false);
  const [correctionProblem, setCorrectionProblem] = useState<string | null>(null);

  const code = home.currency_code;
  const readOnly = home.permissions.read_only;
  const launch = launchState(home);
  const gate = gateDay(home);
  // No currency or incomplete Xero settings: Setup Required holds the page, so no report can start.
  const setup = setupRequired(home, entityId, entityName);

  function open(day: string) {
    leaveTo(stepHref(entityId, entityName, "opening", day));
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
        body: { kind, date: confirming.day, amount },
      });
      leaveTo(stepHref(entityId, entityName, "opening", answer.next_transaction_date));
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
                {launch.day === home.server_today
                  ? "Start today's Daily Closing"
                  : `Start the Daily Closing for ${formatWeekdayShort(launch.day)}`}
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
              entityName={entityName}
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
          <RecentReports home={home} entityId={entityId} entityName={entityName} />
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
            settingsHref={xeroSettingsHref(entityId, entityName)}
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

      <SetupRequiredModal open={setup.open} items={setup.items} fallbackHref={xeroSettingsHref(entityId, entityName)} />
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
  entityName,
  readOnly,
  blockedBy,
  onStart,
  problem,
}: {
  launch: Exclude<Launch, { kind: "first-use" }>;
  today: string;
  now: Date;
  entityId: string;
  entityName: string;
  readOnly: boolean;
  /** The earlier day that must be finished before this one can start. */
  blockedBy: string | null;
  onStart: (day: string) => void;
  problem: ReactNode;
}) {
  const progress: StageProgress =
    launch.kind === "in-progress" ? stageProgress(launch.draft) : launch.kind === "done" ? submittedProgress() : notStartedProgress();
  const title = launch.day === today ? "Today's Daily Closing" : `Daily Closing · ${formatWeekdayShort(launch.day)}`;

  // Done and current stages open where they were left (Part 14: free navigation) - this app's
  // own stage page; never for read-only.
  const stageHref = (index: number): string | undefined => {
    if (readOnly || launch.kind !== "in-progress") return undefined;
    return stepHref(entityId, entityName, stageSection(STAGES[index], launch.draft.current_section), launch.day);
  };
  // Continue: the report's section's stage in this app, or Addition to Drawer when it has none.
  const continueHref = (draft: NonNullable<Home["draft"]>, day: string): string => resumeHref(entityId, entityName, draft.current_section, day);
  const steps: StepProgressStep[] = progress.stages.map(({ stage, state }, i) => ({ label: stage.short, state, href: stageHref(i) }));

  const reason = readOnly ? READ_ONLY : blockedBy ? `Finish ${formatWeekdayShort(blockedBy)} first.` : null;
  const action =
    launch.kind === "done" ? (
      // The day's Daily Report, this app's own (15.7).
      <Link href={reportHref(entityId, entityName, launch.reportId)} className={`${buttonClass("primary")} w-full sm:w-auto`}>
        View report
      </Link>
    ) : launch.kind === "in-progress" ? (
      <Button kind="primary" className="w-full sm:w-auto" disabled={readOnly} onClick={() => leaveTo(continueHref(launch.draft, launch.day))}>
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

/** "Recent reports": the newest 2-3 submitted days as Record rows, each opening its Daily Report, and See all - the report history. */
function RecentReports({ home, entityId, entityName }: { home: Home; entityId: string; entityName: string }) {
  const rows = recentReports(home);
  return (
    <section aria-labelledby="recent-title" className="flex min-w-0 flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h2 id="recent-title" className="text-title-m text-text-primary">
          Recent reports
        </h2>
        <Link href={historyHref(entityId, entityName)} className={buttonClass("link")}>
          See all
        </Link>
      </div>
      {rows.length ? (
        <ul className="flex flex-col gap-2">
          {rows.map(({ day, report }) => (
            <li key={day}>
              <Link
                href={reportHref(entityId, entityName, report.id)}
                className="flex min-h-11 min-w-0 items-center gap-3 rounded-lg border border-border-subtle bg-surface-card p-3 hover:bg-state-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-body-m font-semibold text-text-primary">{formatWeekdayDay(day)}</span>
                  <span className="block text-body-s text-text-secondary">Closing balance</span>
                </span>
                <span className="flex shrink-0 flex-col items-end gap-1">
                  <span className="text-body-m text-text-primary" translate="no">
                    {money(report.closing_balance, home.currency_code)}
                  </span>
                  <StatusPill label="Submitted" tone="info" />
                </span>
              </Link>
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
