"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

import { Icon, InlineAlert, Skeleton, StatusPill } from "@minty/shared/ui";

import { AuditFacts, ClosingBalance, Disclosure, OutcomeBand, Row, Rows } from "@/components/closing/ReportParts";
import { signedMoney } from "@/lib/addition";
import { formatWeekdayDay } from "@/lib/dates";
import {
  readSharedReport,
  sharedAudit,
  sharedCash,
  sharedDifference,
  sharedExpenses,
  sharedKpis,
  sharedPill,
  sharedSales,
  type SharedRead,
  type SharedReport as Shared,
} from "@/lib/share";

type Load = { kind: "loading" } | SharedRead;

/** The refusals, in Part 11's words (issue -> action), as an Outcome state (15.7 "shared link expired"). */
const REFUSED: Record<"missing" | "expired" | "failed", { title: string; body: string }> = {
  missing: { title: "This link doesn't work", body: "It may be mistyped, or a newer link replaced it. Ask the person who shared it for a fresh link." },
  expired: { title: "This link has expired", body: "Shared links work for a limited time. Ask the person who shared it for a fresh link." },
  failed: { title: "We couldn't open this report", body: "Check your connection, then reload the page. If it keeps happening, ask for a fresh link." },
};

/**
 * A shared Daily Report - Part 15.7's "shared/public variant without actions or navigation", read
 * by anyone with the link and no sign-in (Flask's `report/ending.html` with `is_shared_link`): the
 * title with its Status pill, the day and the company, the outcome band, the difference as a fact, the
 * breakdowns as disclosures, the closing balance and the audit facts. No Share, Publish or More,
 * no edits, no receipt View, no sidebar, no menu, no way back: the App bar keeps the Minty mark and
 * the company only (Flask's `pc_bare`).
 *
 * `path` is `<initials>/<day>/<secret>` (lib/share.ts checked it), or null for an address that is
 * not a share link - said as a link that doesn't work, with nothing read.
 */
export function SharedReport({ path }: { path: string | null }) {
  const [load, setLoad] = useState<Load>(path ? { kind: "loading" } : { kind: "missing" });

  useEffect(() => {
    if (!path) return;
    let live = true;
    void readSharedReport(path).then((read) => live && setLoad(read));
    return () => {
      live = false;
    };
  }, [path]);

  const company = load.kind === "ready" ? (load.report.company_name ?? "").trim() : "";

  return (
    <>
      <BareAppBar companyName={company} />
      {/* Part 15.D: page padding 16 / 24 / 32; a report is a centred 720 column. */}
      <main className="px-4 pb-16 pt-6 sm:px-6 lg:px-8 lg:pt-8">
        <div className="mx-auto flex w-full min-w-0 max-w-[720px] flex-col gap-6">
          {load.kind === "ready" ? (
            <SharedBody report={load.report} company={company} />
          ) : load.kind === "loading" ? (
            <>
              <h1 className="min-w-0 break-words text-display-m text-text-primary">Daily Report</h1>
              <div className="flex flex-col gap-4" role="status" aria-busy="true" aria-label="Loading">
                <Skeleton className="h-5 w-48" />
                <Skeleton className="h-44 w-full rounded-xl" />
                <Skeleton className="h-14 w-full" />
                <Skeleton className="h-14 w-full" />
              </div>
            </>
          ) : (
            <Refused kind={load.kind} />
          )}
        </div>
      </main>
    </>
  );
}

/** The App bar of a page read without signing in: the Minty mark and the company - nothing to open. */
function BareAppBar({ companyName }: { companyName: string }) {
  return (
    <header className="border-b border-border-subtle bg-surface-card pt-[env(safe-area-inset-top,0px)]">
      <div className="mx-auto flex h-14 w-full max-w-[1920px] items-center gap-2 px-4 sm:h-15 sm:gap-3 sm:px-6 lg:px-8">
        <Image src="/minty-mark.png" alt="Minty" width={40} height={40} priority unoptimized className="h-9 w-9 shrink-0 object-contain sm:h-10 sm:w-10" />
        <span className="sr-only">Petty Cash</span>
        {companyName ? (
          <span className="ml-auto flex min-w-0 items-center gap-1.5 text-body-m text-text-secondary">
            <Icon name="corporate_fare" size="md" />
            <span className="min-w-0 truncate">{companyName}</span>
          </span>
        ) : null}
      </div>
    </header>
  );
}

function Refused({ kind }: { kind: keyof typeof REFUSED }) {
  const { title, body } = REFUSED[kind];
  return (
    <section aria-labelledby="share-refused" className="mx-auto flex w-full max-w-[400px] flex-col items-center gap-3 py-12 text-center">
      <Icon name={kind === "failed" ? "cloud_off" : "link_off"} size="lg" className="text-text-secondary" />
      <h1 id="share-refused" className="min-w-0 break-words text-title-l text-text-primary">
        {title}
      </h1>
      <p className="text-body-m text-text-secondary">{body}</p>
    </section>
  );
}

function SharedBody({ report, company }: { report: Shared; company: string }) {
  const pill = sharedPill(report);
  const day = report.transaction_date ? formatWeekdayDay(report.transaction_date) : "";
  const meta = [day, company].filter(Boolean).join(" · ");
  const difference = sharedDifference(report);
  const sales = sharedSales(report);
  const expenses = sharedExpenses(report);
  const cash = sharedCash(report);

  return (
    <>
      {/* Part 15.1 Report header, read-only: the title, its pill, the day and the company - no actions. */}
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
          <h1 className="min-w-0 break-words text-display-m text-text-primary">Daily Report</h1>
          {pill ? <StatusPill label={pill.label} tone={pill.tone} /> : null}
        </div>
        {meta ? <p className="min-w-0 break-words text-body-m text-text-secondary">{meta}</p> : null}
      </div>

      {/* The outcome band, from the KPIs that arrived. No charts here: the public read's lines carry no account. */}
      <OutcomeBand kpis={sharedKpis(report)} />

      {difference ? (
        // 15.7: the difference as a fact, not blame - Warning tone, in words, never a red number.
        <InlineAlert tone="warning" title={difference.title}>
          {difference.body}
        </InlineAlert>
      ) : null}

      <div className="flex flex-col gap-3">
        {sales ? (
          <Disclosure title="Sales by method">
            <Rows>
              {sales.map((row) => (
                <Row key={row.key} label={row.label} value={row.value} total={row.total} />
              ))}
            </Rows>
          </Disclosure>
        ) : null}

        {expenses ? (
          <Disclosure title={`Expenses (${expenses.lines.length})`}>
            {expenses.lines.length ? (
              <ul className="flex flex-col">
                {expenses.lines.map((line, i) => (
                  <li key={i} className="flex min-w-0 flex-col gap-1 border-t border-border-subtle py-3 first:border-t-0 first:pt-0 last:pb-0">
                    <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5">
                      <p className="min-w-0 flex-1 basis-40 break-words text-body-m font-semibold text-text-primary">{line.title}</p>
                      {line.value ? (
                        <p className="min-w-0 break-all text-right text-body-m font-semibold text-text-primary" translate="no">
                          {line.value}
                        </p>
                      ) : null}
                    </div>
                    <p className="min-w-0 break-words text-body-s text-text-secondary">{line.meta}</p>
                    {line.remarks ? <p className="min-w-0 break-words text-body-s text-text-muted">{line.remarks}</p> : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-body-m text-text-secondary">No expenses this day.</p>
            )}
            {expenses.total ? (
              <Rows>
                <Row label="Total expenses" value={expenses.total} total />
              </Rows>
            ) : null}
          </Disclosure>
        ) : null}

        {expenses?.receipts ? (
          <Disclosure title={`Receipts (${expenses.receipts.length})`}>
            {expenses.receipts.length ? (
              <ul className="flex flex-col gap-2">
                {expenses.receipts.map((receipt, i) => (
                  // A Part 14 File card, read-only: a shared report never opens a receipt (no View).
                  <li key={i} className="flex min-h-11 min-w-0 items-center gap-3 rounded-lg border border-border-default bg-surface-card px-3 py-2">
                    <Icon name={/\.pdf$/i.test(receipt.name) ? "picture_as_pdf" : "image"} className="text-text-secondary" />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-body-m text-text-primary">{receipt.name}</span>
                      <span className="break-words text-body-s text-text-secondary">
                        {receipt.title}
                        {receipt.value ? (
                          <>
                            {" · "}
                            <span translate="no">{receipt.value}</span>
                          </>
                        ) : null}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-body-m text-text-secondary">No receipts this day.</p>
            )}
          </Disclosure>
        ) : null}

        {cash ? (
          <Disclosure title="Cash">
            <Rows>
              {cash.map((row) => (
                <Row key={row.label} {...row} />
              ))}
            </Rows>
          </Disclosure>
        ) : null}
      </div>

      {typeof report.closing_balance === "number" ? <ClosingBalance value={signedMoney(report.closing_balance, report.currency_code ?? null)} /> : null}

      <AuditFacts facts={sharedAudit(report)} />
    </>
  );
}
