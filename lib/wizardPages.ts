/**
 * The report wizard's steps, each this app's own page: Opening, Sales, Expenses, Bank Deposit,
 * Cash Count and Ending. No step is Flask's - Flask is a backend only (docs/features/petty-cash-web.md,
 * "No Flask pages").
 */

import { companyRef } from "@minty/shared/companyRef";

/** The wizard's steps, by the key the API's `report.current_section` uses, and each one's address segment. */
export const WIZARD_STEP_PATH = {
  opening: "opening",
  sales: "sale",
  expenses: "expense",
  deposit: "deposit",
  cash_count: "cash-count",
  ending: "ending",
} as const;

export type WizardStep = keyof typeof WIZARD_STEP_PATH;

/**
 * The step a draft is on, from the API's `current_section`: that step when it is one of the six,
 * else Opening (a draft with no section yet, or one the app does not know).
 */
export function sectionStep(section: string | null | undefined): WizardStep {
  return section && Object.hasOwn(WIZARD_STEP_PATH, section) ? (section as WizardStep) : "opening";
}

/** A step of a new report for `day`, in the company's address (`/entity/<ref>/petty-cash/reports/new/<step>`). */
export function stepHref(
  entityId: string,
  entityName: string,
  step: WizardStep,
  day: string,
): string {
  return `/entity/${companyRef(entityId, entityName)}/petty-cash/reports/new/${WIZARD_STEP_PATH[step]}?${new URLSearchParams({ transaction_date: day })}`;
}
