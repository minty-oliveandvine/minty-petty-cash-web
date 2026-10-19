/**
 * Where each report section lives - every one is this app's own page: `opening`, the "Addition to
 * Drawer" stage, `sales`, the "Sales" stage, `expenses`, the "Expenses" stage, `deposit` +
 * `cash_count`, the one "Cash Count" stage (D15-05: the deposit is its first section), and
 * `ending`, the "Close" stage - at Flask's old paths (`reports/new/opening`, `reports/new/sale`,
 * `reports/new/expense`, `reports/new/cash-count`, `reports/new/ending`), so an old link still
 * lands. `reports/new/deposit` redirects to `reports/new/cash-count` here (its page.tsx). The
 * outcome page after Submit is `reports/<report id>/submitted`, the Daily Report
 * `reports/<report id>/summary` and the report history `reports`. No section opens a Flask page
 * (docs/features/petty-cash-web.md, "No Flask pages").
 */

import { companyRef } from "@minty/shared/companyRef";

/** The Daily Closing's sections, by the key the API's `report.current_section` uses, and each one's page. */
const STEP_PATH = {
  opening: "opening",
  sales: "sale",
  expenses: "expense",
  deposit: "cash-count",
  cash_count: "cash-count",
  ending: "ending",
} as const;

export type WizardStep = keyof typeof STEP_PATH;

/** Whether `step` is one of the report's sections (the API's `current_section` keys). */
export function isWizardStep(step: string): step is WizardStep {
  return Object.hasOwn(STEP_PATH, step);
}

/** A step of a new report for `day`, in the company's address (`/entity/<ref>/petty-cash/reports/new/<step>`). */
export function stepHref(entityId: string, entityName: string, step: WizardStep, day: string): string {
  return `/entity/${companyRef(entityId, entityName)}/petty-cash/reports/new/${STEP_PATH[step]}?${new URLSearchParams({ transaction_date: day })}`;
}

/**
 * Where an open draft for `day` continues: the stage of its `current_section`, or Addition to
 * Drawer when it names none (or a key this app does not know) - the launch page's Continue and a
 * history row's draft alike.
 */
export function resumeHref(entityId: string, entityName: string, section: string | null, day: string): string {
  return stepHref(entityId, entityName, section && isWizardStep(section) ? section : "opening", day);
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
