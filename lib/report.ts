/**
 * The Daily Report (Part 15.7; Flask's report summary, `report/ending.html`): what
 * `GET /reports/<report id>` answers (Minty `petty_cash_api/routes/report.py`), and the page's
 * facts, warnings and wording as pure rules, so the page (components/closing/DailyReport.tsx)
 * only draws what this says.
 *
 * Every figure is the server's ("Report figures are computed server-side from the finalised
 * record", 15.7) - nothing is added up here. Amounts are plain text, never coloured; a shortage is
 * stated as a fact, in words. The status pill is the API's own label and tone (Submitted is Info,
 * Published to Xero is Success).
 */

import type { StatusTone } from "@minty/shared/ui";

import { signedMoney } from "@/lib/addition";
import { differenceText } from "@/lib/cashCount";
import { differenceOf, type ClosePage } from "@/lib/close";
import { formatWeekdayDay, momentText } from "@/lib/dates";
import type { ExpenseLine, Receipt } from "@/lib/expenses";
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
  permissions: { edit: boolean; delete: boolean; publish: boolean; share: boolean };
};

/** What `POST /reports/<id>/reopen` answers: the report is a draft again, at Addition to Drawer. */
export type Reopened = { report_id: string; transaction_date: string; status: "draft"; next: "opening" };

/** What `DELETE /reports/<id>` answers. */
export type Deleted = { deleted: string; transaction_date: string; next: "dashboard" };

const TONES: readonly StatusTone[] = ["success", "warning", "danger", "info", "neutral"];

/** The header's Status pill: the API's label and tone, as they stand. */
export function reportPill(report: DailyReport): { label: string; tone: StatusTone } {
  const tone = TONES.find((t) => t === report.status_tone);
  // A tone outside Part 13's five is the API's mistake: say so, and draw it Neutral rather than guess.
  if (!tone) console.error(`Unknown status tone from the API: ${report.status_tone}`);
  return { label: report.status_label, tone: tone ?? "neutral" };
}

/** A reopened report is a draft again: it says so and points back to Close. */
export function isDraft(report: DailyReport): boolean {
  return report.status === "draft";
}

/** The three KPIs (15.7: exactly these), each a label, the server's figure and one line of meta. */
export function reportKpis(report: DailyReport): { label: string; value: string; meta: string | null }[] {
  const code = report.currency_code;
  const count = report.expenses.lines.length;
  return [
    { label: "Total sales", value: formatMoney(report.kpis.total_sales, code), meta: null },
    { label: "Total expenses", value: formatMoney(report.kpis.total_expenses, code), meta: `${count} ${count === 1 ? "expense" : "expenses"}` },
    { label: "Cash position", value: signedMoney(report.kpis.cash_position, code), meta: "Counted, with the safe box" },
  ];
}

/**
 * The difference as a section issue (15.7: "Cash was HK$120.00 short - note: evening float swap"),
 * stated as a fact, any cent counting (the owner, 2026-10-15) - or null when the count matched.
 */
export function differenceAlert(report: DailyReport): { title: string; body: string } | null {
  const diff = differenceOf(report.cash.difference.amount);
  if (diff.kind === "none") return null;
  const reason = report.cash.difference.reason.trim();
  return { title: `Cash was ${differenceText(diff, report.currency_code)}`, body: reason ? `Note: ${reason}` : "No reason was given." };
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

/** The Cash section's rows, in the order the day ran; `total` is the last, bold row; `words` a value in words. */
export function cashRows(report: DailyReport): { label: string; value: string; total?: boolean; words?: boolean }[] {
  const code = report.currency_code;
  const cash = report.cash;
  const money = (amount: number) => formatMoney(amount, code);
  const source = cash.cash_addition > 0 && cash.cash_addition_type ? (ADDITION_SOURCE[cash.cash_addition_type] ?? cash.cash_addition_type) : null;
  return [
    { label: "Starting cash balance", value: money(cash.opening_balance) },
    { label: "Added to the drawer", value: money(cash.cash_addition) },
    ...(source ? [{ label: "Where the cash came from", value: source, words: true }] : []),
    { label: "Cash sales", value: money(cash.cash_sales) },
    { label: "Expenses", value: money(cash.expenses) },
    { label: "Cash taken for bank deposit", value: money(cash.bank_deposit) },
    { label: "Expected in drawer", value: signedMoney(cash.expected, code) },
    { label: "Counted in the drawer", value: money(cash.counted) },
    { label: "In the safe box", value: money(cash.safe_box) },
    { label: "Difference", value: differenceText(differenceOf(cash.difference.amount), code), total: true, words: true },
  ];
}

function moment(iso: string | null): string | null {
  if (!iso) return null;
  const at = new Date(iso);
  return Number.isNaN(at.getTime()) ? null : momentText(at);
}

/** The audit facts (Part 14 Audit meta: a real name and the exact time), at the bottom of the page. */
export function auditFacts(report: DailyReport): string[] {
  const facts: string[] = [];
  if (!isDraft(report)) {
    const by = report.submitted_by ? ` by ${report.submitted_by}` : "";
    const at = moment(report.submitted_at);
    facts.push(`Submitted${by}${at ? ` · ${at}` : ""}`);
  }
  facts.push(xeroFact(report));
  return facts;
}

/** Where the report stands with Xero: "Sent to Xero · <when>", "Publishing to Xero", "Xero publish failed", "Not in Xero yet". */
export function xeroFact(report: DailyReport): string {
  if (report.xero_integrated) {
    const at = moment(report.published_at);
    return at ? `Sent to Xero · ${at}` : "Sent to Xero";
  }
  if (report.publishing_status === "publishing") return "Publishing to Xero";
  if (report.publishing_status === "failed") return "Xero publish failed";
  return "Not in Xero yet";
}

/** The Publish to Xero link's label - Flask's own page publishes (it is not ported). */
export function publishLabel(report: DailyReport): string {
  return report.xero_integrated ? "Publish to Xero again" : "Publish to Xero";
}

type Warning = { title: string; body: string };

/** Edit report's warning for a report that has been to Xero (Flask's page, word for word). */
export function editWarning(report: DailyReport): Warning | null {
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
export function deleteWarning(report: DailyReport): Warning | null {
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
