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
 * Where a submitted report is published to Xero (Flask `report.report_submitted`, its outcome
 * page): the Xero publish is not ported, so the Daily Report links here while the person may publish.
 */
export function publishUrl(entityId: string, reportId: string): string {
  return `${company(entityId)}/petty-cash/reports/${encodeURIComponent(reportId)}/submitted`;
}

/**
 * The CSV of every report between two days (Flask `report.download_reports_csv`): Export CSV on
 * this app's report history stays Flask's download, a full-page link.
 */
export function csvUrl(entityId: string, start: string, end: string): string {
  return `${company(entityId)}/petty-cash/reports/download-csv?${new URLSearchParams({ start_date: start, end_date: end })}`;
}

/**
 * Flask's Petty Cash settings page (`entity_settings_entity`), for the Xero parts that stay there
 * (the account mapping and the account codes): this app's settings page links here while Xero is
 * connected, and so do the launch page's Setup Required and a deposit correction's missing
 * accounts. The rest of the page is this app's (`settingsHref`, lib/companyPages.ts).
 */
export function settingsUrl(entityId: string): string {
  return `${company(entityId)}/settings/petty-cash`;
}
