/**
 * A report after it is submitted: what `GET /reports/<id>` and `GET /reports/<id>/outcome` answer
 * (Minty `petty_cash_api/routes/report.py` and `close.py`), and the wording Flask's ORIGINAL
 * `report/submitted.html` and `report/ending.html` choose by the report's state.
 */

import type { DifferenceKind } from "@/lib/cash";
import type { ClosePage, SummarySales } from "@/lib/ending";
import type { SalesMethod } from "@/lib/sales";

export type ReportLine = {
  id: string;
  /** The account's name. */
  item: string;
  supplier: { id: string; name: string } | null;
  remarks: string;
  amount: number;
  receipts: { id: string; name: string; mime_type: string | null }[];
};

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
  permissions: { edit: boolean; delete: boolean; publish: boolean; share: boolean };
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
