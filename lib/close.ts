/**
 * The Daily Closing's fifth stage, "Close" (Part 15.9g / 15.15e; Flask's Ending section): what
 * `GET /reports/close` and `POST /reports/submit` answer (Minty `petty_cash_api/routes/close.py`),
 * and the stage's read-only summary, gate and refusals as pure rules, so the stage page
 * (components/closing/Close.tsx) only draws what this says.
 *
 * Close is a Work Verification (15.9g): every figure is the API's - nothing is added up here - with
 * an Edit link per stage, and one action, Submit Daily Report. No KPIs or trends (D15-03): the
 * read's `yesterday_total` and `history` are the Daily Report's, not this stage's.
 */

import { signedMoney } from "@/lib/addition";
import { differenceText, type Difference } from "@/lib/cashCount";
import { stageOf } from "@/lib/dailyClosing";
import type { WizardStep } from "@/lib/flaskPages";
import type { OpeningPage } from "@/lib/opening";
import { shownMethods, type SalesMethod } from "@/lib/sales";

export type CloseExpense = {
  id: string;
  /** The account's name ("General Expenses"). */
  item: string;
  supplier: string;
  remarks: string;
  amount: number;
  /** How many receipts the line has. */
  receipts: number;
};

export type ClosePage = {
  transaction_date: string;
  currency_code: string | null;
  draft: OpeningPage["draft"];
  opening_balance: number;
  cash_addition: number;
  sales: {
    methods: (Omit<SalesMethod, "amount"> & { amount: number })[];
    cash: number;
    total: number;
    yesterday_total: number | null;
    history: { date: string; total: number }[];
  };
  expenses: { lines: CloseExpense[]; total: number };
  cash: {
    bank_deposit: number;
    expected: number;
    /** In the drawer (the till) - the safebox is `safe_box`. */
    counted: number;
    safe_box: number;
    difference: { amount: number; kind: string; reason: string };
  };
  closing_balance: number;
  /** What would stop the submit now, or null. */
  problem: { error: string; to: string } | null;
};

/** What `POST /reports/submit` answers. */
export type Submitted = {
  report_id: string;
  transaction_date: string;
  status: string;
  submitted_at: string | null;
  closing_balance: number;
  next: "submitted";
};

/**
 * An amount as a difference: ANY cent counts (the owner, 2026-10-15; the Jinja pages use
 * `>= 0.005`). Rounded away from zero on its size, so -0.005 is a cent short, never "None".
 */
export function differenceOf(amount: number): Difference {
  const cents = Math.round(Math.abs(Number.isFinite(amount) ? amount : 0) * 100);
  if (cents === 0) return { amount: 0, kind: "none" };
  return amount < 0 ? { amount: -cents / 100, kind: "short" } : { amount: cents / 100, kind: "over" };
}

/** The sales rows: every method the Sales stage shows (Deliveroo left out, as there), in Settings order. */
export function salesRows(page: ClosePage): { key: string; label: string; amount: number }[] {
  return shownMethods(page.sales.methods).map((m) => ({ key: m.value_name, label: m.name, amount: m.amount ?? 0 }));
}

/** An expense row's label: "General Expenses · ParknShop" (Flask's Close: item, then supplier). */
export function expenseLabel(line: CloseExpense): string {
  const item = line.item.trim() || "Expense";
  return line.supplier.trim() ? `${item} · ${line.supplier.trim()}` : item;
}

/** "Receipts 2 of 3 expenses" - how many entries carry a receipt. */
export function receiptsText(lines: CloseExpense[]): string {
  const withReceipt = lines.filter((line) => line.receipts > 0).length;
  return `${withReceipt} of ${lines.length} ${lines.length === 1 ? "expense" : "expenses"}`;
}

/** A place to fix the day, as one link: the stage's own page, or the launch page. */
export type FixLink = { label: string; step: WizardStep } | { label: string; home: true };

/** The link a refusal or the gate offers for `to` - null for a place this stage cannot open. */
export function fixLink(to: string | null | undefined): FixLink | null {
  if (to === "dashboard") return { label: "Go to Petty Cash", home: true };
  if (to === "cash_count" || to === "deposit") return { label: "Go to Cash Count", step: "deposit" };
  const stage = stageOf(to ?? null);
  if (!stage || stage.key === "close") return null;
  return { label: `Go to ${stage.label}`, step: stage.sections[0] };
}

export type CloseGate = { title: string; message: string; action: FixLink | null; reason: string };

/**
 * The business-rule gate on arrival (15.9e: the rule, the reason, one action - the stage to fix),
 * from the API's `problem`. Submit is disabled while it stands, with `reason` beside it. A drawer
 * below zero says so in figures (Flask's Close page); any other rule is the API's sentence.
 */
export function closeGate(page: ClosePage): CloseGate | null {
  const problem = page.problem;
  if (!problem) return null;
  const action = fixLink(problem.to);
  const where = action && "step" in action ? (stageOf(action.step)?.label ?? null) : null;
  const reason = where ? `Fix ${where} first, then submit.` : "This day can't be submitted yet.";
  // The API checks the steps and the date first, so this is the drawer only when it says Cash Count.
  if (problem.to === "cash_count" && page.cash.expected < 0) {
    return {
      title: "The drawer is below zero",
      message: `Expected in drawer comes to ${signedMoney(page.cash.expected, page.currency_code)}. Lower the deposit or check the earlier stages before you submit.`,
      action,
      reason,
    };
  }
  return { title: "This day can't be submitted yet", message: problem.error, action, reason };
}

/** A refused submit (409 `{error, to}`): the sentence, and the link to where it is fixed. */
export function submitRefusal(message: string, to: unknown): { message: string; action: FixLink | null } {
  return { message, action: typeof to === "string" ? fixLink(to) : null };
}

/** The Cash Count section's Difference row: "HKD20.00 short", "HKD0.01 over", "None". */
export function closeDifference(page: ClosePage): string {
  return differenceText(differenceOf(page.cash.difference.amount), page.currency_code);
}
