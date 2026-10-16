/**
 * A report after it is submitted: what `GET /reports/<id>` and `GET /reports/<id>/outcome` answer
 * (Minty `petty_cash_api/routes/report.py` and `close.py`), and the wording Flask's ORIGINAL
 * `report/submitted.html` and `report/ending.html` choose by the report's state.
 */

import { reasonProblem, type DifferenceKind } from "@/lib/cash";
import type { ClosePage, SummarySales } from "@/lib/ending";
import { receiptProblem, type Account, type ExpenseLine, type Supplier } from "@/lib/expenses";
import type { SalesMethod } from "@/lib/sales";

/** A line as the Expenses step's read has it (`line_payload`): its item is its account's name. */
export type ReportLine = ExpenseLine;

/** `GET /reports/<id>`: the Daily Report, and what this person may do to it. */
export type DailyReport = {
  report_id: string;
  transaction_date: string;
  currency_code: string | null;
  company_name: string | null;
  status: string | null;
  status_label: string;
  status_tone: string;
  /** No report after it: only the latest can be reopened or deleted. */
  is_latest: boolean;
  submitted_at: string | null;
  submitted_by: string | null;
  published_at: string | null;
  publishing_status: string | null;
  xero_integrated: boolean;
  /** Ever sent to Xero (an edit after a publish clears `xero_integrated`, not this). */
  was_published: boolean;
  kpis: { total_sales: number; total_expenses: number; cash_position: number };
  sales: {
    /** Every method with an amount on the report - the cash row (`cash_sales`) among them. */
    methods: (Omit<SalesMethod, "type" | "amount"> & { type: string; amount: number })[];
    cash: number;
    total: number;
    /** The day before's total sales; null when that day has none. As on `GET /reports/close`. */
    yesterday_total: ClosePage["sales"]["yesterday_total"];
    /** The 30 days up to the day, the day last. As on `GET /reports/close`. */
    history: ClosePage["sales"]["history"];
  };
  expenses: { lines: ReportLine[]; total: number };
  cash: {
    opening_balance: number;
    cash_addition: number;
    cash_addition_type: string | null;
    cash_sales: number;
    expenses: number;
    bank_deposit: number;
    expected: number;
    /** Counted in the till. */
    counted: number;
    safe_box: number;
    difference: { amount: number; kind: DifferenceKind; reason: string };
  };
  closing_balance: number;
  /**
   * `edit_details`: the three edits that move no balance (the difference reason, the withdrawal
   * source, an expense line) - any submitted report not being published.
   */
  permissions: { edit: boolean; delete: boolean; publish: boolean; share: boolean; edit_details: boolean };
  /** What a line may be changed to; only with `edit_details`. */
  options: { suppliers: Supplier[]; accounts: Account[] } | null;
};

/** `GET /reports/<id>/outcome`: what the Submitted page says. */
export type ReportOutcome = {
  report_id: string;
  transaction_date: string;
  currency_code: string | null;
  company_name: string | null;
  status: string;
  submitted: boolean;
  submitted_at: string | null;
  submitted_by: string | null;
  cash_counted: number;
  difference: { amount: number; kind: DifferenceKind; has_reason: boolean };
  xero: { publishing_status: string | null; published_at: string | null; xero_integrated: boolean };
  can_publish: boolean;
  is_today: boolean;
  /** The day after, for "Continue to next day report". */
  next_day: string;
};

/**
 * The Total Sales card's methods for a submitted report: the electronic and delivery ones. The API
 * lists the cash row with them (the Ending step's read leaves it out); Total Sales takes cash from
 * `cash`, so the row would count twice.
 */
export function summarySales(sales: DailyReport["sales"]): SummarySales {
  const methods = sales.methods.filter((m): m is typeof m & { type: SalesMethod["type"] } => m.type === "electronic" || m.type === "delivery");
  return { methods, cash: sales.cash, total: sales.total };
}

/** The Submitted page's heading, two lines (Flask's `is_published_to_xero`). */
export function submittedHeading(xero: ReportOutcome["xero"]): [string, string] {
  return [xero.xero_integrated ? "Report Published to Xero" : "Report Submitted", "Successfully!"];
}

/** Flask's Xero button: "Republish to Xero" once it is in Xero, else "Publish to Xero". */
export function publishLabel(xero: ReportOutcome["xero"]): string {
  return xero.xero_integrated ? "Republish to Xero" : "Publish to Xero";
}

/** Flask's Delete Report warning, word for word. */
export const DELETE_WARNING = "Are you sure you want to delete this report? This action cannot be undone.";

/** The owner's rule (2026-10-15): a report that has been to Xero may be deleted, after this - Flask's wording. */
export const DELETE_IN_XERO = {
  title: "It is in Xero",
  body: "Deleting it here does not remove its entries in Xero, and publishing this day again adds a second copy. To change the report, use Edit report instead.",
} as const;

/** Said on the dashboard after a delete. */
export const DELETED = "That report's deleted.";

/** Flask's confirm before reopening a report that has been to Xero, word for word. */
export const EDIT_PUBLISHED_CONFIRM =
  "This report was already published to Xero.\n\n" +
  "Editing it and publishing again will create duplicate entries in Xero — " +
  "the originals are not removed automatically and must be voided in Xero by hand.\n\n" +
  "Continue?";

/** The API's limit on a line's description (`MAX_REMARKS` in `report_edits.py`). */
export const MAX_REMARKS = 300;

/**
 * The difference reason as it is typed on a submitted report, in the API's words: at most 300
 * characters, and never emptied while the cash was short or over. Null when it may be saved.
 */
export function editReasonProblem(reason: string, kind: DifferenceKind): string | null {
  const tooLong = reasonProblem(reason);
  if (tooLong) return tooLong;
  if (kind !== "none" && reason.trim() === "") return `The cash was ${kind}, so the reason is still needed. Add the reason to save it.`;
  return null;
}

/** A line's description as it is typed, in the API's words; null when it fits. */
export function remarksProblem(remarks: string): string | null {
  return remarks.trim().length > MAX_REMARKS ? `Keep the description to ${MAX_REMARKS} characters or fewer.` : null;
}

/** A replacement receipt, checked before it is sent (the Expenses step's sentences); null when fine. */
export function editReceiptProblem(file: File): string | null {
  return receiptProblem([file], "picked");
}

/** What the line editor holds: the description, the chosen ids ("" for none) and a new receipt. */
export type LineEdit = { remarks: string; supplierId: string; accountId: string; receipt: File | null };

/** The fields of `PATCH /reports/<id>/expense-lines/<line id>`. */
export type LineChanges = { remarks?: string; supplier_id?: string; account_id?: string; receipt?: File };

/**
 * Only what changed, as the API asks: a description that differs once trimmed, a supplier or an
 * account other than the line's (never an empty one - the API cannot clear them), a new receipt.
 */
export function lineChanges(line: ReportLine, edit: LineEdit): LineChanges {
  const changes: LineChanges = {};
  const remarks = edit.remarks.trim();
  if (remarks !== line.remarks.trim()) changes.remarks = remarks;
  if (edit.supplierId && edit.supplierId !== (line.supplier?.id ?? "")) changes.supplier_id = edit.supplierId;
  if (edit.accountId && edit.accountId !== (line.account?.id ?? "")) changes.account_id = edit.accountId;
  if (edit.receipt) changes.receipt = edit.receipt;
  return changes;
}

/** Flask's toasts after each edit, word for word. */
export const EDIT_SAVED = {
  reason: "Your discrepancy reason is saved.",
  withdrawal: "Your withdrawal source is saved.",
  line: "Expense updated successfully!",
} as const;

/** Flask's hold on a line editor with unsaved changes. */
export const EDIT_UNSAVED = "You have unsaved changes. Please save your changes first.";
