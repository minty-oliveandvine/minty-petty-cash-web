/**
 * Where each report section lives: this app's own page once it is redesigned, Flask's until then
 * (lib/flaskPages.ts). Redesigned so far: `opening`, the "Addition to Drawer" stage, `sales`,
 * the "Sales" stage, `expenses`, the "Expenses" stage, and `deposit` + `cash_count`, the one
 * "Cash Count" stage (D15-05: the deposit is its first section), and `ending`, the "Close" stage -
 * at Flask's own paths (`reports/new/opening`, `reports/new/sale`, `reports/new/expense`,
 * `reports/new/cash-count`, `reports/new/ending`), so a link into one app works in the other.
 * Flask's `reports/new/deposit` redirects to `reports/new/cash-count` here (its page.tsx). The
 * outcome page after Submit is `reports/<report id>/submitted`, the Daily Report
 * `reports/<report id>/summary` and the report history `reports` - Flask's addresses too.
 */

import { companyRef } from "@minty/shared/companyRef";

import { wizardStepUrl, type WizardStep } from "@/lib/flaskPages";

const PORTED: Partial<Record<WizardStep, string>> = {
  opening: "opening",
  sales: "sale",
  expenses: "expense",
  deposit: "cash-count",
  cash_count: "cash-count",
  ending: "ending",
};

/** Whether `step` is this app's own page (so going there is a client-side navigation). */
export function isPorted(step: string): step is WizardStep {
  return Object.hasOwn(PORTED, step);
}

/** A step of a new report for `day`, in the company's address (`/entity/<ref>/petty-cash/reports/new/<step>`). */
export function stepHref(entityId: string, entityName: string, step: WizardStep, day: string): string {
  const path = PORTED[step];
  if (!path) return wizardStepUrl(entityId, step, day);
  return `/entity/${companyRef(entityId, entityName)}/petty-cash/reports/new/${path}?${new URLSearchParams({ transaction_date: day })}`;
}

/** The outcome page of a submitted report (`/entity/<ref>/petty-cash/reports/<report id>/submitted`). */
export function outcomeHref(entityId: string, entityName: string, reportId: string): string {
  return `/entity/${companyRef(entityId, entityName)}/petty-cash/reports/${encodeURIComponent(reportId)}/submitted`;
}

/** A report's Daily Report (15.7) - `/entity/<ref>/petty-cash/reports/<report id>/summary`, Flask's id address for its summary. */
export function reportHref(entityId: string, entityName: string, reportId: string): string {
  return `/entity/${companyRef(entityId, entityName)}/petty-cash/reports/${encodeURIComponent(reportId)}/summary`;
}

/** The report history (15.4b) - `/entity/<ref>/petty-cash/reports`, Flask's address for it - with its filters' `query` (no "?"). */
export function historyHref(entityId: string, entityName: string, query = ""): string {
  return `/entity/${companyRef(entityId, entityName)}/petty-cash/reports${query ? `?${query}` : ""}`;
}
