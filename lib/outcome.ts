/**
 * The outcome page after Submit Daily Report (Part 15.12e "Daily Report finalised"; Flask's
 * `report/submitted.html`): what `GET /reports/<report id>/outcome` answers (Minty
 * `petty_cash_api/routes/close.py`), and the page's sentence and facts as pure rules. Every fact
 * is the server's (15.12: "Outcome facts come from the server response, not client assumptions").
 */

import { differenceText } from "@/lib/cashCount";
import { differenceOf } from "@/lib/close";
import { clockTime } from "@/lib/dates";
import { formatMoney } from "@/lib/money";

export type Outcome = {
  report_id: string;
  transaction_date: string;
  currency_code: string | null;
  company_name: string | null;
  status: string;
  submitted: boolean;
  submitted_at: string | null;
  submitted_by: string | null;
  /** The drawer and the safebox together. */
  cash_counted: number;
  difference: { amount: number; kind: string; has_reason: boolean };
  /** `was_published`: it has been to Xero, even if changed since - publishing again warns. */
  xero: { publishing_status: string | null; published_at: string | null; xero_integrated: boolean; was_published: boolean };
  can_publish: boolean;
  /** The report is for today (the server's Hong Kong date). */
  is_today: boolean;
  /** The day after the report's. */
  next_day: string;
};

/** The outcome sentence: "Today's report is submitted", or "The report is submitted" for another day. */
export function outcomeTitle(outcome: Outcome): string {
  if (!outcome.submitted) return "This report isn't submitted yet";
  return outcome.is_today ? "Today's report is submitted" : "The report is submitted";
}

/** "HKD1,300.50" - the cash counted (drawer + safebox). */
export function countedFact(outcome: Outcome): string {
  return formatMoney(outcome.cash_counted, outcome.currency_code);
}

/** "HKD20.00 short · note added", "HKD0.01 over", or "None" - any cent counts. */
export function differenceFact(outcome: Outcome): string {
  const diff = differenceOf(outcome.difference.amount);
  if (diff.kind === "none") return "None";
  const text = differenceText(diff, outcome.currency_code);
  return outcome.difference.has_reason ? `${text} · note added` : text;
}

/**
 * "Sent to Xero": "Yes · 6:12 pm" (the time on the device's clock), "Pending" while Xero works on
 * it, "Not yet: it failed", or "Not yet" - Flask's outcome page's words.
 */
export function xeroFact(outcome: Outcome): string {
  const { xero_integrated, publishing_status, published_at } = outcome.xero;
  if (xero_integrated) {
    const at = published_at ? new Date(published_at) : null;
    return at && !Number.isNaN(at.getTime()) ? `Yes · ${clockTime(at)}` : "Yes";
  }
  if (publishing_status === "publishing") return "Pending";
  if (publishing_status === "failed") return "Not yet: it failed";
  return "Not yet";
}

/** Whether the outcome offers "Start the next day": not for today's report, whose next day is tomorrow. */
export function offersNextDay(outcome: Outcome): boolean {
  return outcome.submitted && !outcome.is_today;
}

const START_KEY = "petty_cash_start_day";

/**
 * "Start the next day": the launch page starts `day` when it lands (Flask's `autoStartNextDay`),
 * so the start rules and "Before You Start" run as for any Start. Kept in sessionStorage for one read.
 */
export function requestStart(day: string) {
  try {
    sessionStorage.setItem(START_KEY, day);
  } catch {
    // storage blocked: the launch page opens without starting, and its own Start is there
  }
}

/** The day the outcome page asked the launch page to start, once - or null. */
export function takeStartRequest(): string | null {
  try {
    const day = sessionStorage.getItem(START_KEY);
    sessionStorage.removeItem(START_KEY);
    return day && /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null;
  } catch {
    return null;
  }
}
