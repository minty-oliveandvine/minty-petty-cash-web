/**
 * Petty Cash pages this app has not ported yet, still served by Flask (Minty). The dashboard links
 * to them exactly where Flask's own dashboard did; each one moves to this app's own address as
 * its page is ported (docs/features/petty-cash-web.md, "Ported so far").
 *
 * Flask takes the company's full id in these addresses and redirects to its readable form. The
 * person is signed in there already: this app's token came from Flask's login-gated hand-off.
 */

import { env } from "@/lib/env";

/** The wizard's steps, by the key Flask's `report.current_section` uses. */
export const WIZARD_STEP_PATH = {
  opening: "opening",
  sales: "sale",
  expenses: "expense",
  deposit: "deposit",
  cash_count: "cash-count",
  ending: "ending",
} as const;

export type WizardStep = keyof typeof WIZARD_STEP_PATH;

function company(entityId: string): string {
  return `${env.ACCOUNTS_API_URL}/entity/${encodeURIComponent(entityId)}`;
}

/** A wizard step for a new report on `day` (Flask `report.report_<step>`). */
export function wizardStepUrl(entityId: string, step: WizardStep, day: string): string {
  return `${company(entityId)}/petty-cash/reports/new/${WIZARD_STEP_PATH[step]}?${new URLSearchParams({ transaction_date: day })}`;
}

/** Back into the open draft (Flask `report.resume_report`). */
export function resumeUrl(entityId: string, day: string): string {
  return `${company(entityId)}/petty-cash/reports/resume?${new URLSearchParams({ transaction_date: day })}`;
}

/**
 * The page after a day is submitted (Flask `report.report_submitted`, by the report's id). This app
 * has its own; Flask's is still where a report is published to Xero, which is not ported.
 */
export function submittedUrl(entityId: string, reportId: string): string {
  return `${company(entityId)}/petty-cash/reports/${encodeURIComponent(reportId)}/submitted`;
}

/**
 * The reports between two days as CSV (Flask `report.download_reports_csv`), from report history.
 * Flask's rule: both dates, the start on or before the end - null otherwise.
 */
export function csvUrl(entityId: string, start: string, end: string): string | null {
  if (!start || !end || start > end) return null;
  return `${company(entityId)}/petty-cash/reports/download-csv?${new URLSearchParams({ start_date: start, end_date: end })}`;
}

/**
 * Flask's own Petty Cash settings page (`entity_settings_entity`), for the Xero mapping and the
 * account codes, which stay there (the owner, 2026-10-16). Only this app's settings page links to
 * it, from its Xero card; every other settings link is this app's page (`settingsHref`).
 */
export function settingsUrl(entityId: string): string {
  return `${company(entityId)}/settings/petty-cash`;
}

/** The settings page's other tabs, Flask's addresses (each hands over to the app that holds it). */
export type SettingsTab = "users" | "integration" | "payment-request" | "modules";

export function settingsTabUrl(entityId: string, tab: SettingsTab): string {
  return `${company(entityId)}/settings/${tab}`;
}
