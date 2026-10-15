"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { Button, buttonClass, InlineAlert, Skeleton } from "@minty/shared/ui";

import { AppBar } from "@/components/layout/AppBar";
import { ApiError, pettyCashFetch } from "@/lib/apiClient";
import { pettyCashHome } from "@/lib/companyPages";
import { formatWeekdayDay } from "@/lib/dates";
import { reportSummaryUrl } from "@/lib/flaskPages";
import { countedFact, differenceFact, offersNextDay, outcomeTitle, requestStart, xeroFact, type Outcome } from "@/lib/outcome";
import { useAuth } from "@/lib/useAuth";
import { stepHref } from "@/lib/wizardPages";

const UNREACHABLE = "We couldn't reach Petty Cash. Check your connection, then reload the page.";

type Load = { kind: "loading" } | { kind: "ready"; outcome: Outcome } | { kind: "failed"; message: string };

/**
 * The outcome page after Submit Daily Report - Part 15.12e "Daily Report finalised", a Part 14
 * Outcome state (Kind = Completion, 440 wide): Minty, the outcome sentence, the day and the
 * company, three facts from the server (Cash counted, Difference, Sent to Xero), then the next
 * action - View report - and Back to home / Start the next day. The focus moves to the title.
 *
 * Reads `GET /reports/<report id>/outcome` (Minty `petty_cash_api/routes/close.py`); its rules are
 * lib/outcome.ts. Publish to Xero is not here yet: the Xero API is not ported, and Flask's report
 * page (View report) still publishes.
 */
export function ReportOutcome({ reportId }: { reportId: string }) {
  const auth = useAuth();
  const [load, setLoad] = useState<Load>({ kind: "loading" });

  useEffect(() => {
    let live = true;
    pettyCashFetch<Outcome>(`/reports/${encodeURIComponent(reportId)}/outcome`)
      .then((outcome) => live && setLoad({ kind: "ready", outcome }))
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
            <Done outcome={load.outcome} entityId={entityId} entityName={entityName} home={home} />
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
            <div className="flex w-full flex-col items-center gap-4" role="status" aria-busy="true" aria-label="Loading">
              <Skeleton className="size-[120px] rounded-full" />
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

function Done({ outcome, entityId, entityName, home }: { outcome: Outcome; entityId: string; entityName: string; home: string }) {
  const router = useRouter();
  const title = useRef<HTMLHeadingElement>(null);
  const day = outcome.transaction_date;
  const company = outcome.company_name || entityName;

  // 15.12 Accessibility: the focus moves to the outcome title.
  useEffect(() => {
    title.current?.focus();
  }, []);

  function startNextDay() {
    // The launch page starts it, so its start rules and "Before You Start" run (Flask's autoStartNextDay).
    requestStart(outcome.next_day);
    router.push(home);
  }

  return (
    <>
      {outcome.submitted ? (
        // Minty is decoration (Part 14 Character); the 3D happy pose is not exported yet.
        <Image src="/cat-hole.png" alt="" width={120} height={120} unoptimized className="size-[120px] object-contain" />
      ) : null}
      <div className="flex flex-col gap-2">
        <h1 ref={title} tabIndex={-1} className="text-display-m text-text-primary focus:outline-none">
          {outcomeTitle(outcome)}
        </h1>
        <p className="text-body-m text-text-secondary">
          {formatWeekdayDay(day)}
          {company ? <> &middot; {company}</> : null}
        </p>
      </div>

      {outcome.submitted ? (
        <>
          <dl className="flex w-full flex-col gap-3 rounded-xl border border-border-subtle bg-surface-card p-4 text-left sm:p-5">
            <Fact label="Cash counted" value={countedFact(outcome)} />
            <Fact label="Difference" value={differenceFact(outcome)} />
            <Fact label="Sent to Xero" value={xeroFact(outcome)} />
          </dl>
          {outcome.xero.publishing_status === "publishing" && !outcome.xero.xero_integrated ? (
            // 15.12 partial success: submitted, Xero pending - an Info line.
            <InlineAlert tone="info" title="Xero is still working on it" className="w-full text-left">
              The report is submitted. Check back in a few minutes; it shows here once Xero has it.
            </InlineAlert>
          ) : null}
          <a href={reportSummaryUrl(entityId, day)} className={buttonClass("primary", { full: true })}>
            View report
          </a>
        </>
      ) : (
        <>
          <p className="text-body-m text-text-secondary">Check the day in Close, then submit it.</p>
          <Link href={stepHref(entityId, entityName, "ending", day)} className={buttonClass("primary", { full: true })}>
            Go to Close
          </Link>
        </>
      )}

      <div className="flex flex-wrap items-center justify-center gap-x-4">
        <Link href={home} className={buttonClass("link")}>
          Back to home
        </Link>
        {offersNextDay(outcome) ? (
          <Button kind="link" onClick={startNextDay}>
            Start the next day
          </Button>
        ) : null}
      </div>
    </>
  );
}

/** One outcome fact: the term, and the server's value at the right (it wraps before it is clipped). */
function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5">
      <dt className="min-w-0 text-body-m text-text-secondary">{label}</dt>
      <dd className="min-w-0 break-words text-right text-body-m font-semibold text-text-primary" translate="no">
        {value}
      </dd>
    </div>
  );
}
