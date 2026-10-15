/**
 * Where each report section lives: this app's own page once it is redesigned, Flask's until then
 * (lib/flaskPages.ts). Redesigned so far: `opening`, the "Addition to Drawer" stage, `sales`,
 * the "Sales" stage, and `expenses`, the "Expenses" stage - at Flask's own paths
 * (`reports/new/opening`, `reports/new/sale`, `reports/new/expense`), so a link
 * into one app works in the other.
 */

import { companyRef } from "@minty/shared/companyRef";

import { wizardStepUrl, type WizardStep } from "@/lib/flaskPages";

const PORTED: Partial<Record<WizardStep, string>> = { opening: "opening", sales: "sale", expenses: "expense" };

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
