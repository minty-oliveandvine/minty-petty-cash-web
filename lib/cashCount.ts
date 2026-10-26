/**
 * The Daily Closing's fourth stage, "Cash Count" (Part 15.15d; Flask's Bank Deposit and Cash Count
 * sections, folded into one stage by D15-05 - the deposit first, A15-02): what
 * `GET /reports/cash-count` answers (Minty `petty_cash_api/routes/cash.py`), and the stage's
 * figures, checks and save as pure rules, so the stage page (components/closing/CashCount.tsx)
 * only draws what this says.
 *
 * The formulas are the API's (Minty `report/services/cash.py`, A15-01):
 * - cash on hand = opening + cash added + cash sales - expenses (the API's own figure);
 * - expected in the drawer = cash on hand - the bank deposit (recomputed here as it is typed);
 * - difference = (drawer + safebox) - expected, to the cent; below zero is short, above is over -
 *   and ANY cent counts (the owner, 2026-10-15).
 *
 * The owner's rules (2026-10-15), which the API enforces too: the deposit can't be more than the
 * cash on hand; Save & Next with a difference needs a reason (Save & Exit doesn't).
 */

import { CODE_SPACE, formatAmount, formatPrice, parseAmount } from "@minty/shared/money";

import { money } from "@/lib/money";
import type { OpeningPage } from "@/lib/opening";

export type Denomination = {
  id: string;
  /** Its face value ("1000", "0.5"). */
  value: number;
  /** "note" or "coin" (the catalogue's `type`). */
  kind: string;
  /** The catalogue's `cash_name` ("$1,000"); null when it has none, absent from an API without the field. */
  name?: string | null;
  /** The saved count; 0 when none. */
  count: number;
};

export type CashCountPage = {
  transaction_date: string;
  currency_code: string | null;
  draft: OpeningPage["draft"];
  opening_balance: number;
  cash_addition: number;
  cash_sales: number;
  expenses: number;
  /** The saved deposit. */
  bank_deposit: number;
  /** Before the deposit. */
  cash_on_hand: number;
  /** After the saved deposit. */
  expected_cash: number;
  /** The company's notes and coins, in its order, with the saved counts. */
  denominations: Denomination[];
  safe_box_balance: number;
  /** The saved difference (amount below zero = short). */
  discrepancy: { amount: number; kind: string; reason: string };
};

/** What `PUT /reports/cash-count` answers on a save. */
export type CashCountSaved = {
  draft_id: string;
  transaction_date: string;
  current_section: string | null;
  completed_sections: string[];
  next: "ending" | "dashboard";
  discrepancy: { amount: number; kind: string };
};

/** The API's limits: a count is a whole number up to a million; a reason up to 300 characters. */
export const MAX_COUNT = 1_000_000;
export const MAX_REASON = 300;
export const MAX_COUNT_DIGITS = String(MAX_COUNT).length;

const cents = (amount: number) => Math.round(amount * 100) / 100;
const count = (n: number) => n.toLocaleString("en-US");

/** The opening cash the stage starts from: what Addition to Drawer summed up. */
export function openingCash(page: CashCountPage): number {
  return cents(page.opening_balance + page.cash_addition);
}

/** The business-rule gate (15.9e): the cash on hand is already below zero, so nothing here can be counted against it. */
export function belowZero(page: CashCountPage): boolean {
  return page.cash_on_hand < 0;
}

/** Expected in the drawer: the cash on hand less the deposit as typed. */
export function expectedCash(page: CashCountPage, depositText: string): number {
  return cents(page.cash_on_hand - (parseAmount(depositText) ?? 0));
}

/**
 * The deposit's problem, as typed: more than the cash on hand, naming the amount allowed (the
 * API's own sentence). An optional field otherwise never warns.
 */
export function depositProblem(page: CashCountPage, depositText: string): string | null {
  if (belowZero(page) || (parseAmount(depositText) ?? 0) <= page.cash_on_hand) return null;
  return `The deposit can't be more than the cash on hand. Enter ${money(page.cash_on_hand, page.currency_code)} or less.`;
}

/**
 * A count's text as a number - grouped as it is typed ("1,000"; @minty/shared/amountInput's
 * `kind: "count"`, at most MAX_COUNT_DIGITS digits), empty is 0.
 */
export function parseCount(text: string): number {
  const digits = text.replace(/,/g, "");
  return digits === "" ? 0 : Number.parseInt(digits, 10) || 0;
}

/** A count's problem, as typed: above the API's limit, naming it. */
export function countProblem(text: string): string | null {
  const n = parseCount(text);
  return n > MAX_COUNT ? `The count is ${count(n)}. Enter ${count(MAX_COUNT)} or fewer.` : null;
}

/** In cents, so 3 × 0.10 is exactly 0.30. */
const valueCents = (d: Denomination) => Math.round(d.value * 100);

/** One row's amount: the face value times the count. */
export function rowTotal(denomination: Denomination, text: string): number {
  return (valueCents(denomination) * parseCount(text)) / 100;
}

/** The drawer's total: every row together. */
export function drawerTotal(denominations: Denomination[], counts: Record<string, string>): number {
  return (
    denominations.reduce((total, d) => total + valueCents(d) * parseCount(counts[d.id] ?? ""), 0) /
    100
  );
}

/** Counted: the drawer and the safebox together. */
export function countedCash(drawer: number, safeboxText: string): number {
  return cents(drawer + (parseAmount(safeboxText) ?? 0));
}

export type Difference = { amount: number; kind: "short" | "over" | "none" };

/** Counted against expected, to the cent - a single cent is a difference. */
export function difference(counted: number, expected: number): Difference {
  const amount = cents(counted - expected);
  return { amount, kind: amount < 0 ? "short" : amount > 0 ? "over" : "none" };
}

/** The difference in words, never in colour alone (15.15): "HKD 20.00 short", "HKD 0.01 over", "None". */
export function differenceText(diff: Difference, code: string | null): string {
  if (diff.kind === "none") return "None";
  return `${money(Math.abs(diff.amount), code)} ${diff.kind}`;
}

/**
 * The reason's problem. Too long shows at once; missing while there is a difference only after a
 * refused Save & Next (the API's sentence) - Save & Exit keeps a difference without one.
 */
export function reasonProblem(
  reason: string,
  diff: Difference,
  code: string | null,
  { submitted }: { submitted: boolean },
): string | null {
  const length = reason.trim().length;
  if (length > MAX_REASON)
    return `The reason is ${count(length)} characters. Shorten it to ${MAX_REASON} characters or fewer.`;
  if (submitted && diff.kind !== "none" && length === 0)
    return `The count is ${differenceText(diff, code)}. Add the reason to continue.`;
  return null;
}

/** The reason's helper: why it matters (Part 14 Textarea) and the live counter. */
export function reasonHelper(reason: string): string {
  return `So the reviewer knows what happened. ${reason.trim().length} of ${MAX_REASON} characters.`;
}

/**
 * A denomination's name: the currency code, a non-breaking space and its `cash_name` without the
 * symbol ("$1,000" -> "HKD 1,000", "S$50" -> "HKD 50"); without a name, its value - a whole note
 * without its ".00" ("HKD 1,000", "HKD 0.50"). With no currency, the figure alone, never "$".
 */
export function denominationLabel(denomination: Denomination, code: string | null): string {
  const figure = denomination.name?.replace(/^\D*\$/, "").trim();
  if (!figure) return formatPrice(denomination.value, code);
  const currency = (code ?? "").trim().toUpperCase();
  return currency ? `${currency}${CODE_SPACE}${figure}` : figure;
}

/** The denominations by kind, in the company's order: notes, then coins, then anything else. */
export function denominationGroups(
  denominations: Denomination[],
): { kind: string; title: string; items: Denomination[] }[] {
  const order = ["note", "coin"];
  const kinds = [
    ...order.filter((k) => denominations.some((d) => d.kind === k)),
    ...Array.from(new Set(denominations.map((d) => d.kind).filter((k) => !order.includes(k)))),
  ];
  const title = (kind: string) =>
    kind === "note" ? "Notes" : kind === "coin" ? "Coins" : "Other cash";
  return kinds.map((kind) => ({
    kind,
    title: title(kind),
    items: denominations.filter((d) => d.kind === kind),
  }));
}

/** "notes", "coins" - for a count's accessible name ("Number of HKD 1,000 notes"). */
export function kindNoun(kind: string): string {
  return kind === "note" ? "notes" : kind === "coin" ? "coins" : "pieces";
}

export type CashCountValues = {
  deposit: string;
  counts: Record<string, string>;
  safebox: string;
  reason: string;
};

/** The fields as the page first shows them: saved amounts grouped, a zero as an empty field. */
export function initialValues(page: CashCountPage): CashCountValues {
  const field = (n: number) => (n ? formatAmount(n) : "");
  return {
    deposit: field(page.bank_deposit),
    counts: Object.fromEntries(
      page.denominations.map((d) => [d.id, d.count ? String(d.count) : ""]),
    ),
    safebox: field(page.safe_box_balance),
    reason: page.discrepancy.reason ?? "",
  };
}

/** Whether anything differs from what was saved - by value, so grouping does not count. */
export function cashCountDirty(page: CashCountPage, values: CashCountValues): boolean {
  if ((parseAmount(values.deposit) ?? 0) !== page.bank_deposit) return true;
  if ((parseAmount(values.safebox) ?? 0) !== page.safe_box_balance) return true;
  if (values.reason.trim() !== (page.discrepancy.reason ?? "").trim()) return true;
  return page.denominations.some((d) => parseCount(values.counts[d.id] ?? "") !== d.count);
}

/**
 * The save's body. `bank_deposit` is sent EVERY time: the API saves the deposit and the count in
 * one transaction, and a refusal of either writes nothing. Every denomination is sent (an empty
 * field as 0). The reason is sent only while there is a difference - a note about a difference
 * the count no longer has would be wrong.
 */
export function savePayload(
  day: string,
  page: CashCountPage,
  values: CashCountValues,
  diff: Difference,
  action: "next" | "exit",
) {
  return {
    transaction_date: day,
    bank_deposit: parseAmount(values.deposit) ?? 0,
    counts: Object.fromEntries(
      page.denominations.map((d) => [d.id, parseCount(values.counts[d.id] ?? "")]),
    ),
    safe_box_balance: parseAmount(values.safebox) ?? 0,
    discrepancy_reason: diff.kind === "none" ? "" : values.reason.trim(),
    action,
  };
}

/*
 * Daily Closing Phase 1 (Flask 4e004d2, 2026-10-16): the stage is three task cards, one open at a
 * time - the cash taken to the bank, the count (in the "Count the drawer" sheet), the safe box.
 * Only the first task not yet done is open; the others show their result (done) or wait ("Next,
 * after ..."). The Check (the numbers match, or the difference and its reason) appears only once
 * the drawer has been counted, and Save & Next waits for the count, then for that reason.
 */

export type CashTask = "deposit" | "count" | "safe";
export type TaskState = "current" | "done" | "next";
export type TasksDone = Record<CashTask, boolean>;

/** The tasks, in the order they are done. */
export const CASH_TASKS: readonly CashTask[] = ["deposit", "count", "safe"];

/** Under each waiting task: what it waits for. */
export const TASK_NEXT: Record<Exclude<CashTask, "deposit">, string> = {
  count: "Next, after the bank deposit.",
  safe: "Next, after the count.",
};

/** Save & Next's reason while the drawer is not counted yet - Flask's words. */
export const COUNT_FIRST = "Count the drawer to continue";
/** Save & Next's reason while a difference has no reason - Flask's words. */
export const REASON_FIRST = "Add a reason for the difference to continue.";

/**
 * Whether the stage was saved before (Save & Next or Save & Exit): Cash Count is a completed
 * section, or a note or coin was counted. Then every task opens done (Flask's `stage_done`).
 */
export function countSaved(page: CashCountPage): boolean {
  return (
    (page.draft?.completed_sections ?? []).includes("cash_count") ||
    page.denominations.some((d) => d.count > 0)
  );
}

/** The tasks as the page opens: all done once saved; else a saved deposit or safe box is done. */
export function initialTasks(page: CashCountPage): TasksDone {
  const saved = countSaved(page);
  return {
    deposit: saved || page.bank_deposit > 0,
    count: saved,
    safe: saved || page.safe_box_balance > 0,
  };
}

/** The open task: the first one not done, or null once all three are. */
export function currentTask(done: TasksDone): CashTask | null {
  return CASH_TASKS.find((task) => !done[task]) ?? null;
}

/** A task's card state: done, the open one, or waiting its turn. */
export function taskState(task: CashTask, done: TasksDone): TaskState {
  if (done[task]) return "done";
  return currentTask(done) === task ? "current" : "next";
}

/** The stage's guidance line, as the tasks move. */
export function cashGuidance(done: TasksDone): string {
  return currentTask(done)
    ? "Three quick checks. We'll go one at a time."
    : "All three checks are done.";
}

/** The deposit task's result line: "HKD 300.00 to the bank", or "None today". */
export function depositResult(depositText: string, code: string | null): string {
  const taken = parseAmount(depositText) ?? 0;
  return taken > 0 ? `${money(taken, code)} to the bank` : "None today";
}

/** A sheet row's line total: "—" while the row is empty, else the face value times the count. */
export function rowTotalText(
  denomination: Denomination,
  text: string,
  code: string | null,
): string {
  return text.trim() === "" ? "—" : money(rowTotal(denomination, text), code);
}

/** Save count: the first row with a problem (the sheet stays open on it), or null. */
export function sheetProblem(
  denominations: Denomination[],
  counts: Record<string, string>,
): Denomination | null {
  return denominations.find((d) => countProblem(counts[d.id] ?? "") !== null) ?? null;
}

/**
 * Why Save & Next waits, or null: the drawer must be counted first, then any difference needs a
 * reason (Part 15.2: a gated button says why beside it). Save & Exit never waits.
 */
export function nextGate(done: TasksDone, diff: Difference, reason: string): string | null {
  if (!done.count) return COUNT_FIRST;
  if (diff.kind !== "none" && reason.trim() === "") return REASON_FIRST;
  return null;
}
