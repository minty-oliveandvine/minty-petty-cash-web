import Image from "next/image";
import type { ReactNode } from "react";

import { Icon } from "@minty/shared/ui";

import { formatMoney } from "@/lib/money";
import { CASH_POSITION, expenseBarsSummary, salesMixSummary, type ExpenseBar, type Kpi, type MixSegment } from "@/lib/report";

// The Daily Report's read-only parts (Part 15.7), drawn the same on the signed-in report
// (DailyReport.tsx) and on its public share page (SharedReport.tsx).

/**
 * The outcome band (15.7's KPIs; the owner's brief 2026-10-19, Minty
 * docs/features/visual-anchors-review.md §1): one band on the brand/50 tint with the Petty Cash
 * module chip, **Cash position** as the one hero amount, Total sales and Total expenses as
 * secondary figures, and the safe box as spot art (decorative, hidden on a phone). Amounts are
 * primary text, never coloured, and wrap before they are ever clipped. One <dl>, so each value is
 * read with its label. Phone: one column; from 640 the two figures sit two-up under the hero;
 * from 1024 hero, figures and art share one row. Only the KPIs that arrived are drawn.
 */
export function OutcomeBand({ kpis }: { kpis: Kpi[] }) {
  if (!kpis.length) return null;
  const hero = kpis.find((kpi) => kpi.label === CASH_POSITION) ?? null;
  const figures = kpis.filter((kpi) => kpi !== hero);
  return (
    <div className="flex min-w-0 flex-col items-start gap-4 rounded-xl bg-state-selected p-4 sm:p-6">
      <span className="inline-flex min-h-7 items-center gap-1.5 rounded-full bg-module-pettycash-wash px-3 py-1 text-label text-module-pettycash-ink">
        <Icon name="point_of_sale" size="sm" />
        <span>Petty Cash</span>
      </span>
      <div className="flex w-full min-w-0 items-start gap-4 lg:items-center lg:gap-6">
        <dl className="grid min-w-0 flex-1 grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:gap-x-6 lg:gap-y-0">
          {hero ? (
            <div className="flex min-w-0 flex-col gap-1 sm:col-span-2 lg:col-span-1 lg:row-span-2 lg:self-center">
              <dt className="text-body-s text-text-secondary">{hero.label}</dt>
              <dd className="min-w-0 break-all text-display-xl text-text-primary" translate="no">
                {hero.value}
              </dd>
              {hero.meta ? <dd className="text-caption text-text-muted">{hero.meta}</dd> : null}
            </div>
          ) : null}
          {figures.map((kpi) => (
            <div
              key={kpi.label}
              className={`flex min-w-0 flex-col gap-0.5 ${hero ? "lg:col-start-2 lg:border-l lg:border-border-default lg:py-1.5 lg:pl-6" : ""}`}
            >
              <dt className="text-body-s text-text-secondary">{kpi.label}</dt>
              <dd className="min-w-0 break-all text-title-l text-text-primary" translate="no">
                {kpi.value}
              </dd>
              {kpi.meta ? <dd className="text-caption text-text-muted">{kpi.meta}</dd> : null}
            </div>
          ))}
        </dl>
        <Image src="/safebox.webp" alt="" width={96} height={96} unoptimized className="hidden size-24 shrink-0 object-contain sm:block" />
      </div>
    </div>
  );
}

/**
 * "Where the money came from and went" (15.7: charts optional, brand + neutral only, no red/green
 * meaning; the visual-anchors review §1): sales by method as ONE stacked proportion bar with its
 * legend (swatch, name, amount, %), expenses by account as bar rows (name, amount, a bar against
 * the largest). Plain HTML/CSS. Each chart is a `role="img"` with its figures as text; the
 * disclosures under it are the table alternative. The data is lib/report.ts `salesMix` /
 * `expenseBars`; the tones are app/globals.css `[data-chart-tone]`.
 */
export function MoneyFlow({ sales, expenses, code }: { sales: MixSegment[]; expenses: ExpenseBar[]; code: string | null }) {
  const money = (amount: number) => formatMoney(amount, code);
  return (
    <section aria-labelledby="money-flow" className="flex min-w-0 flex-col gap-4 rounded-xl border border-border-subtle bg-surface-card p-4 sm:p-6">
      <h2 id="money-flow" className="min-w-0 break-words text-title-l text-text-primary">
        Where the money came from and went
      </h2>

      <div className="flex min-w-0 flex-col gap-3">
        <h3 className="text-title-m text-text-primary">Sales by method</h3>
        {sales.length ? (
          <>
            <div role="img" aria-label={salesMixSummary(sales, code)} className="flex h-6 w-full min-w-0 gap-0.5 overflow-hidden rounded-md">
              {sales.map((seg) => (
                <span key={seg.key} data-chart-tone={seg.tone} className="block min-w-1 shrink basis-0" style={{ flexGrow: seg.width }} />
              ))}
            </div>
            <ul className="flex min-w-0 flex-wrap gap-x-4 gap-y-2">
              {sales.map((seg) => (
                <li key={seg.key} className="inline-flex min-w-0 flex-wrap items-center gap-x-1.5 text-body-s text-text-primary">
                  <span data-chart-tone={seg.tone} className="size-3 shrink-0 rounded-sm" aria-hidden />
                  <span className="min-w-0 break-words font-semibold">{seg.label}</span>
                  <span className="min-w-0 break-all" translate="no">
                    {money(seg.amount)}
                  </span>
                  <span className="text-text-secondary">· {seg.pct}%</span>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="text-body-m text-text-secondary">No sales this day.</p>
        )}
      </div>

      <div className="flex min-w-0 flex-col gap-3">
        <h3 className="text-title-m text-text-primary">Expenses by account</h3>
        {expenses.length ? (
          <div role="img" aria-label={expenseBarsSummary(expenses, code)} className="flex min-w-0 flex-col gap-3">
            {expenses.map((bar) => (
              <div key={bar.name} className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 gap-y-1.5">
                <span className="min-w-0 break-words text-body-m text-text-primary">{bar.name}</span>
                <span className="min-w-0 break-all text-right text-body-m font-semibold text-text-primary" translate="no">
                  {money(bar.amount)}
                </span>
                <span className="col-span-2 block h-2 overflow-hidden rounded-full bg-surface-sunk">
                  <span className="block h-full min-w-1 rounded-full bg-brand-primary" style={{ width: `${bar.width}%` }} />
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-body-m text-text-secondary">No expenses this day.</p>
        )}
      </div>
    </section>
  );
}

/** A collapsed breakdown (15.7: "collapsible sections as disclosures") - a native disclosure. */
export function Disclosure({ title, children }: { title: string; children: ReactNode }) {
  return (
    <details className="group min-w-0 rounded-xl border border-border-subtle bg-surface-card">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-xl px-4 py-3 text-title-m text-text-primary hover:bg-state-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus sm:px-6 [&::-webkit-details-marker]:hidden">
        <span className="min-w-0 break-words">{title}</span>
        <Icon name="expand_more" size="lg" className="text-text-secondary transition-transform group-open:rotate-180 motion-reduce:transition-none" />
      </summary>
      <div className="flex min-w-0 flex-col gap-3 px-4 pb-4 sm:px-6 sm:pb-6">{children}</div>
    </details>
  );
}

export function Rows({ children }: { children: ReactNode }) {
  return <dl className="flex flex-col gap-2">{children}</dl>;
}

/**
 * A Description row: the term, then its value at the right - an amount wraps under the term
 * before it is ever clipped. A total is bold over a rule; `words` is a value in words ("None").
 */
export function Row({ label, value, total = false, words = false }: { label: string; value: string; total?: boolean; words?: boolean }) {
  return (
    <div className={`flex min-w-0 flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 ${total ? "border-t border-border-subtle pt-2" : ""}`}>
      <dt className={`min-w-0 break-words text-body-m ${total ? "font-semibold text-text-primary" : "text-text-secondary"}`}>{label}</dt>
      <dd
        className={`min-w-0 text-right text-body-m text-text-primary ${words ? "break-words" : "break-all"} ${total ? "font-semibold" : ""}`}
        translate="no"
      >
        {value}
      </dd>
    </div>
  );
}

/** The day's closing balance, plain text, never coloured - the server's figure. */
export function ClosingBalance({ value }: { value: string }) {
  return (
    <dl className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 rounded-xl bg-surface-sunk p-4 sm:px-6">
      <dt className="min-w-0 text-title-m text-text-primary">Closing balance</dt>
      <dd className="min-w-0 break-all text-right text-title-m text-text-primary" translate="no">
        {value}
      </dd>
      <dd className="basis-full text-body-s text-text-secondary">What the drawer and the safe box held at the end of the day.</dd>
    </dl>
  );
}

/** Part 14 Audit meta, at the bottom (15.1: administrative facts never in the header). */
export function AuditFacts({ facts }: { facts: string[] }) {
  if (!facts.length) return null;
  return (
    <div className="flex flex-col gap-1 text-body-s text-text-muted">
      {facts.map((fact) => (
        <p key={fact} className="flex min-w-0 items-start gap-1.5 break-words">
          <Icon name="history" size="sm" className="mt-0.5" />
          {fact}
        </p>
      ))}
    </div>
  );
}
