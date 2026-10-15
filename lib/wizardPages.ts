/**
 * Where each report step lives: this app's own page once it is ported, Flask's until then
 * (lib/flaskPages.ts). Ported so far: Opening, Sales, Expenses, Bank Deposit and Cash Count.
 */

import { companyRef } from "@minty/shared/companyRef";

import { wizardStepUrl, type WizardStep } from "@/lib/flaskPages";

const PORTED: Partial<Record<WizardStep, string>> = {
  opening: "opening",
  sales: "sale",
  expenses: "expense",
  deposit: "deposit",
  cash_count: "cash-count",
};

/** Whether `step` is this app's own page (so going there is a client-side navigation). */
export function isPorted(step: WizardStep): boolean {
  return step in PORTED;
}

/** A step of a new report for `day`, in the company's address (`/entity/<ref>/petty-cash/reports/new/<step>`). */
export function stepHref(entityId: string, entityName: string, step: WizardStep, day: string): string {
  const path = PORTED[step];
  if (!path) return wizardStepUrl(entityId, step, day);
  return `/entity/${companyRef(entityId, entityName)}/petty-cash/reports/new/${path}?${new URLSearchParams({ transaction_date: day })}`;
}
