/**
 * The Daily Report (Part 15.7; Flask's report summary, `report/ending.html`): what
 * `GET /reports/<report id>` answers (Minty `petty_cash_api/routes/report.py`), and the page's
 * facts, warnings and wording as pure rules, so the page (components/closing/DailyReport.tsx)
 * only draws what this says.
 *
 * Every figure is the server's ("Report figures are computed server-side from the finalised
 * record", 15.7) - nothing is added up here, with ONE exception: the "Where the money came from
 * and went" chart's expenses by account (`expenseBars`) sums the expense lines the API already
 * sends, per account. It is a display grouping of the server's line amounts for the chart, never a
 * figure of its own - every total on the page is still the API's. Amounts are plain text, never
 * coloured; a shortage is stated as a fact, in words. The status pill is the API's own label and
 * tone (Submitted is Info, Published to Xero is Success).
 */

import type { StatusTone } from "@minty/shared/ui";

import { signedMoney } from "@/lib/addition";
import { differenceText } from "@/lib/cashCount";
import { differenceOf, salesRows, type ClosePage } from "@/lib/close";
import { formatWeekdayDay, momentText } from "@/lib/dates";
import type { ExpenseAccount, ExpenseLine, Receipt, Supplier } from "@/lib/expenses";
import { formatMoney } from "@/lib/money";

export type DailyReport = {
  report_id: string;
  transaction_date: string;
  currency_code: string | null;
  company_name: string | null;
  status: string;
  status_label: string;
  status_tone: string;
  /** No report on a later day: only the latest may be edited or deleted. */
  is_latest: boolean;
  submitted_at: string | null;
  submitted_by: string | null;
  published_at: string | null;
  publishing_status: string | null;
  xero_integrated: boolean;
  /** The report has been to Xero at some point, so Xero may hold its entries. */
  was_published: boolean;
  kpis: { total_sales: number; total_expenses: number; cash_position: number };
  sales: { methods: ClosePage["sales"]["methods"]; cash: number; total: number };
  expenses: { lines: ExpenseLine[]; total: number };
  cash: {
    opening_balance: number;
    cash_addition: number;
    cash_addition_type: string | null;
    cash_sales: number;
    expenses: number;
    bank_deposit: number;
    expected: number;
    /** In the drawer (the till) - the safebox is `safe_box`. */
    counted: number;
    safe_box: number;
    difference: { amount: number; kind: string; reason: string };
  };
  closing_balance: number;
  /** `edit_details`: the details that move no balance may be changed (lib/reportEdits.ts) - any submitted report, not only the latest. */
  permissions: { edit: boolean; delete: boolean; publish: boolean; share: boolean; edit_details: boolean };
  /** What an expense line may be changed to - only while `edit_details`, else null. */
  options: { suppliers: Supplier[]; accounts: ExpenseAccount[] } | null;
};

/** What `POST /reports/<id>/reopen` answers: the report is a draft again, at Addition to Drawer. */
export type Reopened = { report_id: string; transaction_date: string; status: "draft"; next: "opening" };

/** What `DELETE /reports/<id>` answers. */
export type Deleted = { deleted: string; transaction_date: string; next: "dashboard" };

const TONES: readonly StatusTone[] = ["success", "warning", "danger", "info", "neutral"];

/** The Status pill (the header's, and each history row's): the API's label and tone, as they stand. */
export function reportPill(report: Pick<DailyReport, "status_label" | "status_tone">): { label: string; tone: StatusTone } {
  const tone = TONES.find((t) => t === report.status_tone);
  // A tone outside Part 13's five is the API's mistake: say so, and draw it Neutral rather than guess.
  if (!tone) console.error(`Unknown status tone from the API: ${report.status_tone}`);
  return { label: report.status_label, tone: tone ?? "neutral" };
}

/** A reopened report is a draft again: it says so and points back to Close. */
export function isDraft(report: DailyReport): boolean {
  return report.status === "draft";
}

export type Kpi = { label: string; value: string; meta: string | null };

/** The KPI the outcome band draws as its one hero amount (ReportParts.tsx `OutcomeBand`). */
export const CASH_POSITION = "Cash position";

/**
 * The three KPIs (15.7), each a label, the server's figure and one line of meta - drawn as one
 * outcome band: Cash position the hero, Total sales and Total expenses secondary.
 */
export function reportKpis(report: DailyReport): Kpi[] {
  return kpiCards(report.kpis, report.expenses.lines.length, report.currency_code);
}

/**
 * The KPI cards from whichever figures arrived - all three on the Daily Report, only those sent on
 * a shared one (lib/share.ts). `expenseCount` null: the expenses' meta line is left out.
 */
export function kpiCards(kpis: Partial<DailyReport["kpis"]>, expenseCount: number | null, code: string | null): Kpi[] {
  const cards: Kpi[] = [];
  if (typeof kpis.total_sales === "number") cards.push({ label: "Total sales", value: formatMoney(kpis.total_sales, code), meta: null });
  if (typeof kpis.total_expenses === "number") {
    const meta = expenseCount === null ? null : `${expenseCount} ${expenseCount === 1 ? "expense" : "expenses"}`;
    cards.push({ label: "Total expenses", value: formatMoney(kpis.total_expenses, code), meta });
  }
  if (typeof kpis.cash_position === "number") cards.push({ label: CASH_POSITION, value: signedMoney(kpis.cash_position, code), meta: "Counted, with the safe box" });
  return cards;
}

/*
 * "Where the money came from and went" (15.7: charts optional, brand + neutral only, each with a
 * table alternative - the disclosures under them). The same rules as Flask's
 * `blueprints/report/services/report_page.py` `sales_mix` / `expense_bars`.
 */

/** The six chart tones (app/globals.css `--color-chart-*`), cycled so neighbours never share one. */
export const CHART_TONES = 6;

export type MixSegment = {
  key: string;
  label: string;
  amount: number;
  /** A whole percentage; the segments' add up to exactly 100. */
  pct: number;
  /** The exact share, 0-100 to two places - the segment's width. */
  width: number;
  /** 1..CHART_TONES, in order, largest first. */
  tone: number;
};

export type ExpenseBar = {
  name: string;
  amount: number;
  /** Its share of the largest, 0-100 to two places: the largest fills the track. */
  width: number;
};

const toCents = (amount: number | null | undefined) => (typeof amount === "number" && Number.isFinite(amount) ? Math.round(amount * 100) : 0);
const twoPlaces = (n: number) => Math.round(n * 100) / 100;

/** Whole percentages of the total that add up to exactly 100 (largest remainder), in integer cents. */
function wholePercents(cents: number[]): number[] {
  const total = cents.reduce((a, b) => a + b, 0);
  const shares = cents.map((c) => Math.floor((c * 100) / total));
  const remainders = cents.map((c) => (c * 100) % total);
  const order = cents.map((_, i) => i).sort((a, b) => remainders[b] - remainders[a] || cents[b] - cents[a]);
  const left = 100 - shares.reduce((a, b) => a + b, 0);
  for (const i of order.slice(0, left)) shares[i] += 1;
  return shares;
}

/**
 * The stacked proportion bar of sales by method: EXACTLY the rows the "Sales by method" list shows
 * (`salesRows` - the Sales stage's methods, Deliveroo left out - then Cash), so bar and list agree.
 * A row with nothing sold is left out; the rest run largest first (equal amounts keep the list's
 * order), each with its whole percentage and a tone. No sales: an empty list.
 */
export function salesMix(report: { sales: { methods: DailyReport["sales"]["methods"]; cash?: number | null } }): MixSegment[] {
  const rows = [...salesRows(report), { key: "cash", label: "Cash", amount: report.sales.cash ?? 0 }];
  const kept = rows.map((row) => ({ ...row, cents: toCents(row.amount) })).filter((row) => row.cents > 0);
  if (!kept.length) return [];
  kept.sort((a, b) => b.cents - a.cents);
  const total = kept.reduce((sum, row) => sum + row.cents, 0);
  const pcts = wholePercents(kept.map((row) => row.cents));
  return kept.map((row, i) => ({
    key: row.key,
    label: row.label,
    amount: row.cents / 100,
    pct: pcts[i],
    width: twoPlaces((row.cents * 100) / total),
    tone: (i % CHART_TONES) + 1,
  }));
}

/** What an expense without an account is grouped under. */
export const NO_ACCOUNT = "No account";

/**
 * The bar rows of expenses by account: the API's lines summed per account name (the one display
 * grouping this file makes - the note at the top), "No account" for a line without one; a zero
 * total left out; largest first, then by name.
 */
export function expenseBars(report: { expenses: { lines: Pick<ExpenseLine, "account" | "amount">[] } }): ExpenseBar[] {
  const sums = new Map<string, number>();
  for (const line of report.expenses.lines) {
    const name = line.account?.name?.trim() || NO_ACCOUNT;
    sums.set(name, (sums.get(name) ?? 0) + toCents(line.amount));
  }
  const rows = [...sums].filter(([, cents]) => cents > 0).sort(([an, a], [bn, b]) => b - a || (an < bn ? -1 : an > bn ? 1 : 0));
  if (!rows.length) return [];
  const top = rows[0][1];
  return rows.map(([name, cents]) => ({ name, amount: cents / 100, width: twoPlaces((cents * 100) / top) }));
}

/** The proportion bar as text (its `role="img"` label): "Sales by method: Cash HKD300.00, 71%; Visa HKD120.00, 29%". */
export function salesMixSummary(segments: MixSegment[], code: string | null): string {
  return `Sales by method: ${segments.map((s) => `${s.label} ${formatMoney(s.amount, code)}, ${s.pct}%`).join("; ")}`;
}

/** The bar rows as text (their `role="img"` label): "Expenses by account: Staff meals HKD40.00; Office supplies HKD35.00". */
export function expenseBarsSummary(bars: ExpenseBar[], code: string | null): string {
  return `Expenses by account: ${bars.map((b) => `${b.name} ${formatMoney(b.amount, code)}`).join("; ")}`;
}

/**
 * The difference as a section issue (15.7: "Cash was HK$120.00 short - note: evening float swap"),
 * stated as a fact, any cent counting (the owner, 2026-10-15) - or null when the count matched.
 */
export function differenceAlert(report: DailyReport): { title: string; body: string } | null {
  return differenceAlertOf(report.cash.difference, report.currency_code);
}

/** `differenceAlert` from the difference alone (a shared report's may come without its reason). */
export function differenceAlertOf(difference: { amount?: number; reason?: string | null } | null | undefined, code: string | null): { title: string; body: string } | null {
  if (typeof difference?.amount !== "number") return null;
  const diff = differenceOf(difference.amount);
  if (diff.kind === "none") return null;
  const reason = (difference.reason ?? "").trim();
  return { title: `Cash was ${differenceText(diff, code)}`, body: reason ? `Note: ${reason}` : "No reason was given." };
}

/** An expense row's title: the account's name, as the Expenses stage shows it. */
export function expenseTitle(line: ExpenseLine): string {
  return line.account?.name || line.item || "Expense";
}

/** An expense row's meta line: "ParknShop · Account 429" (or "No supplier"). */
export function expenseMeta(line: ExpenseLine): string {
  return [line.supplier?.name, line.account?.code ? `Account ${line.account.code}` : null].filter(Boolean).join(" · ") || "No supplier";
}

/** Every receipt of the day, with the expense it belongs to - the Receipts section's File cards. */
export function reportReceipts(report: DailyReport): { line: ExpenseLine; receipt: Receipt }[] {
  return report.expenses.lines.flatMap((line) => line.receipts.map((receipt) => ({ line, receipt })));
}

/** Where the cash added came from, in the Addition to Drawer stage's words. */
const ADDITION_SOURCE: Record<string, string> = { company: "Company bank", personal: "Personal" };

export type CashRow = { label: string; value: string; total?: boolean; words?: boolean };

/** The Cash section's rows, in the order the day ran; `total` is the last, bold row; `words` a value in words. */
export function cashRows(report: DailyReport): CashRow[] {
  return cashRowsOf(report.cash, report.currency_code);
}

/** `cashRows` from whichever figures arrived: a figure a shared report leaves out has no row. */
export function cashRowsOf(cash: Partial<DailyReport["cash"]>, code: string | null): CashRow[] {
  const money = (amount: number) => formatMoney(amount, code);
  const has = (n: unknown): n is number => typeof n === "number";
  const added = cash.cash_addition;
  const source = has(added) && added > 0 && cash.cash_addition_type ? (ADDITION_SOURCE[cash.cash_addition_type] ?? cash.cash_addition_type) : null;
  const rows: (CashRow | null)[] = [
    has(cash.opening_balance) ? { label: "Starting cash balance", value: money(cash.opening_balance) } : null,
    has(added) ? { label: "Added to the drawer", value: money(added) } : null,
    source ? { label: "Where the cash came from", value: source, words: true } : null,
    has(cash.cash_sales) ? { label: "Cash sales", value: money(cash.cash_sales) } : null,
    has(cash.expenses) ? { label: "Expenses", value: money(cash.expenses) } : null,
    has(cash.bank_deposit) ? { label: "Cash taken for bank deposit", value: money(cash.bank_deposit) } : null,
    has(cash.expected) ? { label: "Expected in drawer", value: signedMoney(cash.expected, code) } : null,
    has(cash.counted) ? { label: "Counted in the drawer", value: money(cash.counted) } : null,
    has(cash.safe_box) ? { label: "In the safe box", value: money(cash.safe_box) } : null,
    has(cash.difference?.amount)
      ? { label: "Difference", value: differenceText(differenceOf(cash.difference.amount), code), total: true, words: true }
      : null,
  ];
  return rows.filter((row): row is CashRow => row !== null);
}

export function isoMoment(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const at = new Date(iso);
  return Number.isNaN(at.getTime()) ? null : momentText(at);
}

/** The audit facts (Part 14 Audit meta: a real name and the exact time), at the bottom of the page. */
export function auditFacts(report: DailyReport): string[] {
  const facts: string[] = [];
  if (!isDraft(report)) {
    const by = report.submitted_by ? ` by ${report.submitted_by}` : "";
    const at = isoMoment(report.submitted_at);
    facts.push(`Submitted${by}${at ? ` · ${at}` : ""}`);
  }
  facts.push(xeroFact(report));
  return facts;
}

/** Where the report stands with Xero: "Sent to Xero · <when>", "Publishing to Xero", "Xero publish failed", "Not in Xero yet". */
export function xeroFact(report: DailyReport): string {
  if (report.xero_integrated) {
    const at = isoMoment(report.published_at);
    return at ? `Sent to Xero · ${at}` : "Sent to Xero";
  }
  if (report.publishing_status === "publishing") return "Publishing to Xero";
  if (report.publishing_status === "failed") return "Xero publish failed";
  return "Not in Xero yet";
}

/** Publish to Xero's label - "again" once the report is in Xero (components/closing/Publish.tsx publishes). */
export function publishLabel(report: Pick<DailyReport, "xero_integrated">): string {
  return report.xero_integrated ? "Publish to Xero again" : "Publish to Xero";
}

type Warning = { title: string; body: string };

/** Edit report's warning for a report that has been to Xero (Flask's page, word for word). */
export function editWarning(report: Pick<DailyReport, "was_published">): Warning | null {
  if (!report.was_published) return null;
  return {
    title: "It is already in Xero",
    body: "Publishing it again adds new entries in Xero. The ones there now are not removed: void them in Xero by hand.",
  };
}

/**
 * Delete's warning for a report that has been to Xero. The owner's rule (2026-10-15): such a
 * report MAY be deleted, but the dialog says first what stays in Xero and points to Edit report.
 */
export function deleteWarning(report: Pick<DailyReport, "was_published">): Warning | null {
  if (!report.was_published) return null;
  return {
    title: "It is in Xero",
    body: "Deleting it here does not remove its entries in Xero, and publishing this day again adds a second copy. To change the report, use Edit report instead.",
  };
}

/** What the launch page says after a delete (a Page banner, read once - lib/flash.ts). */
export function deletedMessage(day: string): string {
  return `The Daily Report for ${formatWeekdayDay(day)} is deleted.`;
}

/** A report id from its address segment: percent-decoded; a malformed escape stays as written (the API 404s it). */
export function reportIdFromSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}
