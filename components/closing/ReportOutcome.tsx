"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { Button, buttonClass, InlineAlert, Skeleton, StatusPill } from "@minty/shared/ui";

import { PublishDialog, PublishProgress, usePublish } from "@/components/closing/Publish";
import { AppBar } from "@/components/layout/AppBar";
import { ToastRegion, type ToastMessage } from "@/components/ui/Toast";
import { ApiError, pettyCashFetch } from "@/lib/apiClient";
import { pettyCashHome } from "@/lib/companyPages";
import { integrationUrl } from "@/lib/hub";
import { money } from "@/lib/money";
import {
  countedFact,
  differencePill,
  outcomeLine,
  outcomeTitle,
  xeroLine,
  type Outcome,
} from "@/lib/outcome";
import { isWorking, publishedMessage } from "@/lib/publish";
import { useAuth } from "@/lib/useAuth";
import { reportHref, stepHref } from "@/lib/wizardPages";

const UNREACHABLE = "We couldn't reach Petty Cash. Check your connection, then reload the page.";

type Load =
  { kind: "loading" } | { kind: "ready"; outcome: Outcome } | { kind: "failed"; message: string };

/**
 * The outcome page after Submit Daily Report - Part 15.12e "Daily Report finalised", a Part 14
 * Outcome state (Kind = Completion, 440 wide), as Flask's Daily Closing Phase 1 (Minty 4e004d2):
 * the happy Minty (no confetti), "Today is closed" and one line under it, three facts from the
 * server (Sales, Expenses, Cash counted with the difference as a Warning pill), one quiet Xero
 * line (Send to Xero / Publish again), then View report and Back to home. The focus moves to the
 * title. The next day starts from the launch page.
 *
 * Reads `GET /reports/<report id>/outcome` (Minty `petty_cash_api/routes/close.py`); its rules are
 * lib/outcome.ts. Sales and Expenses are its `total_sales` / `total_expenses` - the Daily Report's
 * `kpis` figures, in the one read. View report opens this app's Daily Report (DailyReport.tsx).
 * Send to Xero (with `can_publish`) asks first, then watches the publish here (Wave 2j,
 * Publish.tsx); while Xero works on it, an Info line says so (15.12 partial success).
 */
export function ReportOutcome({ reportId }: { reportId: string }) {
  const auth = useAuth();
  const [load, setLoad] = useState<Load>({ kind: "loading" });

  useEffect(() => {
    let live = true;
    pettyCashFetch<Outcome>(`/reports/${encodeURIComponent(reportId)}/outcome`)
      .then((outcome) => {
        if (live) setLoad({ kind: "ready", outcome });
      })
      .catch((err: unknown) => {
        // A 401 has already gone back through the hand-off.
        if (!live || (err instanceof ApiError && err.status === 401)) return;
        setLoad({ kind: "failed", message: err instanceof ApiError ? err.message : UNREACHABLE });
      });
    return () => {
      live = false;
    };
  }, [reportId]);

  const entityId = auth?.entityId ?? "";
  const entityName = auth?.entityName ?? "";
  const home = auth ? pettyCashHome(entityId, entityName) : "";

  return (
    <>
      <AppBar companyName={entityName} />
      {/* Part 15.D page padding; the Outcome state is a centred 440 column (Part 14). */}
      <main className="px-4 pb-16 pt-8 sm:px-6 lg:px-8 lg:pt-12">
        <div className="mx-auto flex w-full min-w-0 max-w-[440px] flex-col items-center gap-5 text-center">
          {load.kind === "ready" && auth ? (
            <Done
              outcome={load.outcome}
              onXero={(xero) =>
                setLoad((l) => (l.kind === "ready" ? { ...l, outcome: { ...l.outcome, xero } } : l))
              }
              entityId={entityId}
              entityName={entityName}
              home={home}
            />
          ) : load.kind === "failed" ? (
            <>
              <h1 className="text-display-m text-text-primary">Daily Report</h1>
              <InlineAlert tone="danger" className="w-full text-left">
                {load.message}
              </InlineAlert>
              {home ? (
                <Link href={home} className={buttonClass("link")}>
                  Back to home
                </Link>
              ) : null}
            </>
          ) : (
            <div
              className="flex w-full flex-col items-center gap-4"
              role="status"
              aria-busy="true"
              aria-label="Loading"
            >
              <Skeleton className="size-[168px] rounded-full" />
              <Skeleton className="h-8 w-3/4" />
              <Skeleton className="h-5 w-1/2" />
              <Skeleton className="h-32 w-full" />
              <Skeleton className="h-11 w-full" />
            </div>
          )}
        </div>
      </main>
    </>
  );
}

/** The outcome once read (exported for its component tests). */
export function Done({
  outcome,
  onXero,
  entityId,
  entityName,
  home,
}: {
  outcome: Outcome;
  /** A publishing-status read: "Sent to Xero" as the API has it now. */
  onXero: (xero: Outcome["xero"]) => void;
  entityId: string;
  entityName: string;
  home: string;
}) {
  const title = useRef<HTMLHeadingElement>(null);
  const day = outcome.transaction_date;
  const code = outcome.currency_code;
  const [asking, setAsking] = useState(false);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const publishing = usePublish({
    reportId: outcome.report_id,
    initial: outcome.xero.publishing_status,
    onStatus: (s) =>
      onXero({
        publishing_status: s.publishing_status,
        published_at: s.published_at,
        xero_integrated: s.xero_integrated,
        was_published: s.was_published,
      }),
    onPublished: () => setToast({ id: Date.now(), message: publishedMessage(day) }),
  });
  // Not while Xero works on it.
  const working = isWorking(publishing.state) || outcome.xero.publishing_status === "publishing";
  const xero = xeroLine(outcome);
  const pill = differencePill(outcome);

  // 15.12 Accessibility: the focus moves to the outcome title.
  useEffect(() => {
    title.current?.focus();
  }, []);

  return (
    <>
      {outcome.submitted ? (
        // Minty is decoration (Part 14 Character): Flask's happy Minty, no confetti.
        <Image
          src="/minty-cat.png"
          alt=""
          width={168}
          height={168}
          unoptimized
          className="size-[168px] object-contain"
        />
      ) : null}
      <div className="flex flex-col gap-2">
        <h1
          ref={title}
          tabIndex={-1}
          className="text-display-m text-text-primary focus:outline-none"
        >
          {outcomeTitle(outcome)}
        </h1>
        {outcome.submitted ? (
          <p className="text-body-m text-text-secondary">{outcomeLine(outcome)}</p>
        ) : null}
      </div>

      {outcome.submitted ? (
        <>
          <dl className="w-full rounded-xl border border-border-subtle bg-surface-card px-4 text-left">
            <Fact label="Sales">{money(outcome.total_sales, code)}</Fact>
            <Fact label="Expenses">{money(outcome.total_expenses, code)}</Fact>
            <Fact label="Cash counted">
              <span>{countedFact(outcome)}</span>
              {pill ? <StatusPill label={pill} tone="warning" /> : null}
            </Fact>
          </dl>
          {outcome.can_publish ? (
            <div className="flex w-full flex-wrap items-center justify-between gap-x-3 rounded-lg bg-state-selected py-1 pl-4 pr-1 text-left text-body-s text-text-secondary">
              <span className="min-w-0">{xero.text}</span>
              {!working ? (
                <Button kind="link" onClick={() => setAsking(true)}>
                  {xero.action}
                </Button>
              ) : null}
            </div>
          ) : null}
          {/* 15.12 partial success: submitted, Xero pending - an Info line; a failure says why. */}
          <PublishProgress
            state={publishing.state}
            onCheckAgain={publishing.begin}
            onRetry={outcome.can_publish && !working ? () => setAsking(true) : undefined}
            className="w-full text-left"
          />
          {/* Part 15.2: Back to home is the next action; View report beside it (stacked, primary first, on a phone). */}
          <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-center sm:gap-3">
            <Link
              href={reportHref(entityId, entityName, outcome.report_id)}
              className={`${buttonClass("secondary")} w-full sm:w-auto`}
            >
              View report
            </Link>
            <Link href={home} className={`${buttonClass("primary")} w-full sm:w-auto`}>
              Back to home
            </Link>
          </div>
        </>
      ) : (
        <>
          <p className="text-body-m text-text-secondary">Check the day in Close, then submit it.</p>
          <Link
            href={stepHref(entityId, entityName, "ending", day)}
            className={buttonClass("primary", { full: true })}
          >
            Go to Close
          </Link>
          <Link href={home} className={buttonClass("link")}>
            Back to home
          </Link>
        </>
      )}

      {asking ? (
        <PublishDialog
          reportId={outcome.report_id}
          again={outcome.xero.xero_integrated}
          wasPublished={outcome.xero.was_published}
          reconnectHref={integrationUrl(entityId, entityName)}
          onCancel={() => setAsking(false)}
          onStarted={() => {
            setAsking(false);
            publishing.begin();
          }}
        />
      ) : null}
      <ToastRegion toast={toast} onDismiss={() => setToast(null)} />
    </>
  );
}

/** One outcome fact: the term, and the server's value at the right (it wraps before it is clipped). */
function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-border-subtle py-3 last:border-b-0">
      <dt className="min-w-0 text-body-m text-text-secondary">{label}</dt>
      <dd
        className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-2 break-words text-right text-body-m font-semibold text-text-primary"
        translate="no"
      >
        {children}
      </dd>
    </div>
  );
}
