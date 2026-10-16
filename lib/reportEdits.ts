/**
 * Editing a submitted report's details that move no balance (Wave 2i) - the difference reason,
 * where the cash added to the drawer came from, and an expense line's description, supplier,
 * account and receipt - as pure rules, so the Daily Report (components/closing/DailyReport.tsx)
 * and its edit dialogs (components/closing/ReportEdits.tsx) only draw what this says.
 *
 * The API is Minty's `petty_cash_api/routes/report.py` over `report/services/report_edits.py`:
 * `PUT /reports/<id>/difference-reason`, `PUT /reports/<id>/withdrawal` and
 * `PATCH /reports/<id>/expense-lines/<line id>`, each answering the whole Daily Report. Any
 * submitted report may be edited this way (not only the latest) while `permissions.edit_details`
 * says so; the amount is never editable; any edit takes the report out of Xero.
 *
 * The checks mirror the API's (it refuses the same): a reason or a description of at most 300
 * characters, a reason that can't be emptied while the cash was short or over, a supplier and an
 * account from the read's `options`, and one receipt - PDF, JPEG or PNG, at most 10 MB
 * (`receiptProblem`, lib/expenses.ts).
 */

import { MAX_REASON } from "@/lib/cashCount";
import { differenceOf } from "@/lib/close";
import type { Supplier } from "@/lib/expenses";
import type { DailyReport } from "@/lib/report";

export type Withdrawal = "company" | "personal";

/** What may be edited: every detail asks `edit_details` (a submitted report, not publishing, the right). */
const editable = (report: DailyReport) => Boolean(report.permissions.edit_details) && report.status !== "draft";

/** The cash was "short" or "over" (any cent counts), so a reason is needed - or null. */
export function reasonNeeded(report: DailyReport): "short" | "over" | null {
  const kind = differenceOf(report.cash.difference.amount).kind;
  return kind === "none" ? null : kind;
}

/** The reason is offered where the difference is told: only while the cash was short or over. */
export function canEditReason(report: DailyReport): boolean {
  return editable(report) && reasonNeeded(report) !== null;
}

/** Where the cash came from is offered only when cash was added (the Cash section shows it then). */
export function canEditWithdrawal(report: DailyReport): boolean {
  return editable(report) && report.cash.cash_addition > 0;
}

/** The lines' details need the read's pick-lists. */
export function canEditLines(report: DailyReport): boolean {
  return editable(report) && Boolean(report.options);
}

/** The saved source; Personal when none is saved, as the Addition to Drawer stage reads it. */
export function withdrawalOf(report: DailyReport): Withdrawal {
  return report.cash.cash_addition_type === "company" ? "company" : "personal";
}

/**
 * The reason's problem, as typed. Over 300 at once. Empty while the cash was short or over: at
 * once once the field was changed (it held the saved reason), else only after a refused Save -
 * typing never paints an untouched field red.
 */
export function reasonEditProblem(
  text: string,
  { needed, changed, submitted }: { needed: "short" | "over" | null; changed: boolean; submitted: boolean },
): string | null {
  const length = text.trim().length;
  if (length > MAX_REASON) return `The reason is ${length.toLocaleString("en-US")} characters. Shorten it to ${MAX_REASON} characters or fewer.`;
  if (length === 0 && needed && (changed || submitted)) return `The cash was ${needed}, so the reason is still needed. Add the reason to save it.`;
  return null;
}

/**
 * The line's supplier, as typed. A line that has one can't lose it (the API keeps a supplier, it
 * never clears one), so emptying says so at once; a line without one may stay without. A name
 * that is not a supplier yet is "not finished" until the field is left. No new supplier is made
 * here: the Expenses stage makes them.
 */
export function lineSupplierProblem(
  query: string,
  chosen: Supplier | null,
  { required, touched, submitted }: { required: boolean; touched: boolean; submitted: boolean },
): string | null {
  if (chosen) return null;
  if (query.trim() === "") return required ? "The supplier is still empty. Choose a supplier from the list to save it." : null;
  if (!(touched || submitted)) return null;
  return `"${query.trim()}" is not a supplier yet. Choose one from the list.`;
}

/** The edit form's values: the description as typed, the supplier chosen, the account's id, a new receipt. */
export type LineValues = { remarks: string; supplier: Supplier | null; accountId: string; receipt: File | null };

/** What the PATCH sends: each field only when it changed. */
export type LineChanges = { remarks?: string; supplier_id?: string; account_id?: string; receipt?: File };

/** The changes from the line as saved - nothing for what is the same, never an empty supplier or account. */
export function lineChanges(
  line: { remarks: string; supplier: Supplier | null; account: { id: string } | null },
  values: LineValues,
): LineChanges {
  const changes: LineChanges = {};
  const remarks = values.remarks.trim();
  if (remarks !== (line.remarks ?? "").trim()) changes.remarks = remarks;
  if (values.supplier && values.supplier.id !== line.supplier?.id) changes.supplier_id = values.supplier.id;
  if (values.accountId && values.accountId !== line.account?.id) changes.account_id = values.accountId;
  if (values.receipt) changes.receipt = values.receipt;
  return changes;
}

/** The multipart body of `PATCH /reports/<id>/expense-lines/<line id>`: the changes alone. */
export function lineEditForm(changes: LineChanges): FormData {
  const body = new FormData();
  if (changes.remarks !== undefined) body.set("remarks", changes.remarks);
  if (changes.supplier_id) body.set("supplier_id", changes.supplier_id);
  if (changes.account_id) body.set("account_id", changes.account_id);
  if (changes.receipt) body.set("receipt", changes.receipt, changes.receipt.name);
  return body;
}

/**
 * Said before a save, inside the dialog, when the report has been to Xero: any edit takes it out
 * of Xero (the API's `mark_diverged_from_xero`), and publishing again does not remove what is there.
 */
export function xeroNotice(report: Pick<DailyReport, "was_published">): { title: string; body: string } | null {
  if (!report.was_published) return null;
  return {
    title: "It will need publishing to Xero again",
    body: "Saving takes this report out of Xero. Publish it again afterwards. The entries in Xero now are not removed: void them in Xero by hand.",
  };
}

/** The toast after a save that went through (Flask's words for the first two). */
export function savedMessage(what: "reason" | "withdrawal" | "line"): string {
  return what === "reason" ? "The reason is saved." : what === "withdrawal" ? "Where the cash came from is saved." : "The expense is saved.";
}
