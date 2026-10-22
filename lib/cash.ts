/**
 * The Bank Deposit and Cash Count steps' reads (what `GET /reports/deposit` and
 * `GET /reports/cash-count` answer - Minty `petty_cash_api/routes/cash.py`) and their arithmetic,
 * the same as the shared service's (`report/services/cash.py`) so the page shows what is saved:
 * - the cash on hand is opening + addition + cash sales - expenses (the API sends it);
 * - the expected cash is that less the deposit (the API sends it too);
 * - the difference is (counted till + safebox) - expected, to the cent; negative is short.
 *
 * The owner's rules (2026-10-15), checked here as the person types and again by the API:
 * the deposit can't be more than the cash on hand, any difference counts - one cent included -
 * and Save & Next with a difference needs a reason.
 */

import type { OpeningPage } from "@/lib/opening";
import { formatMoney } from "@/lib/money";

/** The figures both steps read. */
export type CashFigures = {
  transaction_date: string;
  currency_code: string | null;
  draft: OpeningPage["draft"];
  opening_balance: number;
  cash_addition: number;
  cash_sales: number;
  expenses: number;
  bank_deposit: number;
  /** Before the deposit. */
  cash_on_hand: number;
  /** After the deposit: what the count should come to. */
  expected_cash: number;
};

export type DepositPage = CashFigures;

export type Denomination = { id: string; value: number; kind: "note" | "coin" | string; name: string | null; count: number };

export type DifferenceKind = "short" | "over" | "none";

export type CashCountPage = CashFigures & {
  /** The company's notes and coins, in its order, with the saved counts. */
  denominations: Denomination[];
  safe_box_balance: number;
  discrepancy: { amount: number; kind: DifferenceKind; reason: string };
};

/** The API's limits (`MAX_COUNT` in cash.py, `MAX_REASON` in the service). */
export const MAX_COUNT = 1_000_000;
export const MAX_REASON = 300;

/** Back to whole cents, as the service's `cents()` does (Python's `round(x, 2)`). */
export function cents(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const rounded = Math.round(Math.abs(value) * 100 + 1e-7) / 100;
  return value < 0 ? -rounded : rounded;
}

/**
 * The deposit's limit, as the person types: null while it is within the cash on hand, else the
 * API's own sentence naming the amount allowed.
 */
export function depositProblem(amount: number, cashOnHand: number, currencyCode: string | null): string | null {
  if (cents(amount) <= cents(cashOnHand)) return null;
  return `The deposit can't be more than the cash on hand. Enter ${formatMoney(Math.max(cents(cashOnHand), 0), currencyCode)} or less.`;
}

/**
 * A denomination's label: the currency code, a non-breaking space, and its `cash_info.cash_name` without the symbol
 * (`$1,000` -> `HKD 1,000`). Without a name, its value: `HKD 1000`, and a coin under 1 as `HKD 0.50`, never `HKD 0`.
 * With no currency, just the figure - never a "$" (the dashboard keeps a report from starting without a currency).
 */
export function denominationLabel(value: number, currencyCode: string | null, name?: string | null): string {
  const figure = name?.replace(/^\D*\$/, "").trim() || (Number.isInteger(value) ? String(value) : value.toFixed(2));
  return currencyCode ? `${currencyCode}\u00a0${figure}` : figure;
}

/** A count as typed: digits only (a whole number), at most seven of them; empty stays empty. */
export function sanitizeCount(raw: string): string {
  const digits = raw.replace(/\D/g, "").replace(/^0+(?=\d)/, "");
  return digits.slice(0, String(MAX_COUNT).length);
}

/** A typed count as a number (empty is 0). */
export function parseCount(value: string): number {
  return value === "" ? 0 : Number.parseInt(value, 10) || 0;
}

/** A count above the API's limit, in Part 11's words; null when it is fine. */
export function countProblem(value: string): string | null {
  return parseCount(value) > MAX_COUNT ? `A count can't be more than ${MAX_COUNT.toLocaleString("en-US")}. Enter ${MAX_COUNT.toLocaleString("en-US")} or less.` : null;
}

/** One row of the calculator: the count times the denomination, to the cent. */
export function rowTotal(value: number, count: number): number {
  return cents(value * count);
}

/** The cash counted in the till: every denomination's count times its value. */
export function tillTotal(denominations: Pick<Denomination, "id" | "value">[], counts: Record<string, number>): number {
  return cents(denominations.reduce((total, d) => total + d.value * (counts[d.id] ?? 0), 0));
}

/** (counted till + safebox) - expected, to the cent: negative is short, positive is over. */
export function difference(till: number, safeBox: number, expected: number): number {
  return cents(till - expected + safeBox);
}

/** Any cent counts (the owner, 2026-10-15; Flask's page needed more than 0.01). */
export function differenceKind(amount: number): DifferenceKind {
  const c = cents(amount);
  if (c < 0) return "short";
  if (c > 0) return "over";
  return "none";
}

/** Save & Next's refusal of a difference with no reason - the API's own sentence. */
export function reasonNeeded(amount: number, currencyCode: string | null): string {
  const word = amount < 0 ? "short" : "over";
  return `The count is ${formatMoney(Math.abs(cents(amount)), currencyCode)} ${word}. Add the reason to continue.`;
}

/** A reason past the API's length, as typed; null when it fits. */
export function reasonProblem(reason: string): string | null {
  return reason.trim().length > MAX_REASON ? `Keep the reason to ${MAX_REASON} characters or fewer.` : null;
}
