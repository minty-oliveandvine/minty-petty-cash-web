import type { ReactNode } from "react";

import { Icon } from "@minty/shared/ui";

import type { Kpi } from "@/lib/report";

// The Daily Report's read-only parts (Part 15.7), drawn the same on the signed-in report
// (DailyReport.tsx) and on its public share page (SharedReport.tsx).

/** 15.7: the KPIs - stacked on a phone, in a row from 640. Each value is read with its label. */
export function KpiCards({ kpis }: { kpis: Kpi[] }) {
  if (!kpis.length) return null;
  return (
    <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      {kpis.map((kpi) => (
        <div key={kpi.label} className="flex min-w-0 flex-col gap-1 rounded-xl border border-border-subtle bg-surface-card p-4">
          <dt className="text-body-s text-text-secondary">{kpi.label}</dt>
          <dd className="min-w-0 break-all text-title-l text-text-primary" translate="no">
            {kpi.value}
          </dd>
          {kpi.meta ? <dd className="text-body-s text-text-muted">{kpi.meta}</dd> : null}
        </div>
      ))}
    </dl>
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
