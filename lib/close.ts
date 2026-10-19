/**
 * The Daily Closing's fifth stage, "Close" (Part 15.9g / 15.15e; Flask's Ending section): what
 * `GET /reports/close` and `POST /reports/submit` answer (Minty `petty_cash_api/routes/close.py`),
 * and the stage's read-only summary, gate and refusals as pure rules, so the stage page
 * (components/closing/Close.tsx) only draws what this says.
 *
 * Close is a Work Verification (15.9g): every figure is the API's - nothing is added up here - with
 * an Edit link per stage, and one action, Submit Daily Report. Since Daily Closing Phase 1 (Flask
 * 4e004d2) it is a readiness banner and ONE summary card, a row per stage with its total; the
 * per-item breakdowns are the stages' own. No KPIs or trends (D15-03): the
 * read's `yesterday_total` and `history` are the Daily Report's, not this stage's.
 */

import { signedMoney } from "@/lib/addition";
import { differenceText, type Difference } from "@/lib/cashCount";
import { stageOf } from "@/lib/dailyClosing";
import { formatMoney } from "@/lib/money";
import type { WizardStep } from "@/lib/wizardPages";
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

/**
 * The sales rows: every method the Sales stage shows (Deliveroo left out, as there), in Settings
 * order - Close's and the Daily Report's (lib/report.ts).
 */
export function salesRows(page: { sales: { methods: ClosePage["sales"]["methods"] } }): { key: string; label: string; amount: number }[] {
  return shownMethods(page.sales.methods).map((m) => ({ key: m.value_name, label: m.name, amount: m.amount ?? 0 }));
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * The Sales row's line (Daily Closing Phase 1: one row per stage, totals not each method):
 * "3 methods · Cash HKD820.50" - the methods that took money, cash among them.
 */
export function salesSummary(page: Pick<ClosePage, "sales" | "currency_code">): string {
  const methods = salesRows(page).filter((row) => row.amount > 0).length + (page.sales.cash > 0 ? 1 : 0);
  return `${plural(methods, "method", "methods")} · Cash ${formatMoney(page.sales.cash, page.currency_code)}`;
}

/** The Expenses row's line: "2 expenses · 3 receipts" (every receipt file, as Flask's). */
export function expensesSummary(lines: CloseExpense[]): string {
  const receipts = lines.reduce((n, line) => n + line.receipts, 0);
  return `${plural(lines.length, "expense", "expenses")} · ${plural(receipts, "receipt", "receipts")}`;
}

/** The Cash Count row's line: "HKD300.00 to the bank · Counted in the drawer", or "None today · ...". */
export function cashSummary(page: Pick<ClosePage, "cash" | "currency_code">): string {
  const deposit = page.cash.bank_deposit > 0 ? `${formatMoney(page.cash.bank_deposit, page.currency_code)} to the bank` : "None today";
  return `${deposit} · Counted in the drawer`;
}

export type Readiness =
  | { kind: "gate" }
  | { kind: "no-reason"; title: string }
  | { kind: "ready"; text: string };

/**
 * "Is this correct and ready to submit?" - the banner over the summary: the business-rule gate
 * when the API names one (closeGate); a difference without a reason as a Warning with the way to
 * Cash Count (Submit stays on - the API takes it, as Flask's page does); else "Ready to submit",
 * with a word that the reviewer has a note when there is a difference.
 */
export function closeReadiness(page: ClosePage): Readiness {
  if (page.problem) return { kind: "gate" };
  const diff = differenceOf(page.cash.difference.amount);
  if (diff.kind !== "none" && !page.cash.difference.reason.trim()) {
    return { kind: "no-reason", title: `The count is ${differenceText(diff, page.currency_code)}` };
  }
  return { kind: "ready", text: `All five stages are filled in.${diff.kind !== "none" ? " One note for the reviewer below." : ""}` };
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

/** The difference in the Cash Count row's pill: "HKD20.00 short", "HKD0.01 over", "None". */
export function closeDifference(page: ClosePage): string {
  return differenceText(differenceOf(page.cash.difference.amount), page.currency_code);
}
