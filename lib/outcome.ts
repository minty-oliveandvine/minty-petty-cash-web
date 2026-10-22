/**
 * The outcome page after Submit Daily Report (Part 15.12e "Daily Report finalised"; Flask's
 * `report/submitted.html`): what `GET /reports/<report id>/outcome` answers (Minty
 * `petty_cash_api/routes/close.py`), and the page's sentence and facts as pure rules. Every fact
 * is the server's (15.12: "Outcome facts come from the server response, not client assumptions").
 *
 * Since Daily Closing Phase 1 (Flask 4e004d2, 2026-10-16) it is the Completion state: "Today is
 * closed", three facts (Sales, Expenses, Cash counted with the difference as a pill), one quiet
 * Xero line, then Back to home / View report. The next day starts from the launch page, which
 * already offers it, so the outcome no longer has "Start the next day".
 */

import { differenceText } from "@/lib/cashCount";
import { differenceOf } from "@/lib/close";
import { clockTime, formatWeekdayDay } from "@/lib/dates";
import { money } from "@/lib/money";

export type Outcome = {
  report_id: string;
  transaction_date: string;
  currency_code: string | null;
  company_name: string | null;
  status: string;
  submitted: boolean;
  submitted_at: string | null;
  submitted_by: string | null;
  /** The day's totals - the Daily Report's `kpis.total_sales` / `kpis.total_expenses`, the same figures. */
  total_sales: number;
  total_expenses: number;
  /** The drawer and the safebox together. */
  cash_counted: number;
  difference: { amount: number; kind: string; has_reason: boolean };
  /** `was_published`: it has been to Xero, even if changed since - publishing again warns. */
  xero: {
    publishing_status: string | null;
    published_at: string | null;
    xero_integrated: boolean;
    was_published: boolean;
  };
  can_publish: boolean;
  /** The report is for today (the server's Hong Kong date). */
  is_today: boolean;
  /** The day after the report's. */
  next_day: string;
};

/** The outcome sentence: "Today is closed", or "The report is submitted" for another day. */
export function outcomeTitle(outcome: Outcome): string {
  if (!outcome.submitted) return "This report isn't submitted yet";
  return outcome.is_today ? "Today is closed" : "The report is submitted";
}

/** Under it: "The Daily Report for Tue 13 Oct 2026 is submitted. Nice work — see you tomorrow." */
export function outcomeLine(outcome: Outcome): string {
  return `The Daily Report for ${formatWeekdayDay(outcome.transaction_date)} is submitted. Nice work — see you tomorrow.`;
}

/** "HKD 1,300.50" - the cash counted (drawer + safebox). */
export function countedFact(outcome: Outcome): string {
  return money(outcome.cash_counted, outcome.currency_code);
}

/** The pill beside Cash counted: "HKD 20.00 short", "HKD 0.01 over" - any cent counts - or null. */
export function differencePill(outcome: Outcome): string | null {
  const diff = differenceOf(outcome.difference.amount);
  return diff.kind === "none" ? null : differenceText(diff, outcome.currency_code);
}

/**
 * The one quiet Xero line (with `can_publish`): "Sent to Xero · 6:12 pm" + Publish again once it
 * is in Xero, else "Not sent to Xero yet" + Send to Xero (a report changed since it was published
 * warns in the dialog, `was_published`). The time is on the device's clock.
 */
export function xeroLine(outcome: Outcome): {
  text: string;
  action: "Send to Xero" | "Publish again";
} {
  const { xero_integrated, published_at } = outcome.xero;
  if (xero_integrated) {
    const at = published_at ? new Date(published_at) : null;
    return {
      text: at && !Number.isNaN(at.getTime()) ? `Sent to Xero · ${clockTime(at)}` : "Sent to Xero",
      action: "Publish again",
    };
  }
  return { text: "Not sent to Xero yet", action: "Send to Xero" };
}
