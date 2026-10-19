/**
 * Editing a line of the day's DRAFT in the Expenses stage (`PATCH /expense-lines/<id>`, Minty
 * `petty_cash_api/routes/expenses.py` over `report/services/expenses.py::update_expense`; Flask's
 * `pc_expenses.js` edit mode): multipart, each field only when it changed - `amount`, `remarks`
 * (an empty one clears it), `supplier_id`, `account_id`, one `receipt` (replaces ALL the line's
 * receipts) and `remove_receipt_ids` (repeatable). The answer is `{line, total}`.
 *
 * Unlike the submitted report's edit (lib/reportEdits.ts, which this builds on) the amount moves.
 * The API refuses removing the last receipt without a new one; the form never offers it - Remove
 * shows only while another saved receipt would stay.
 */

import { parseMoney } from "@/lib/currencyInput";
import type { ExpenseAccount, ExpenseLine, Receipt } from "@/lib/expenses";
import { lineChanges, lineEditForm, type LineChanges, type LineValues } from "@/lib/reportEdits";

export type DraftLineValues = LineValues & { amount: string; removeReceiptIds: string[] };
export type DraftLineChanges = LineChanges & { amount?: string; remove_receipt_ids?: string[] };

/** The changes from the line as saved - nothing for what is the same. */
export function draftLineChanges(line: ExpenseLine, values: DraftLineValues): DraftLineChanges {
  const changes: DraftLineChanges = lineChanges(line, values);
  const amount = parseMoney(values.amount);
  if (Math.round(amount * 100) !== Math.round(line.amount * 100)) changes.amount = String(amount);
  // A new receipt replaces them all, so a removal only travels without one.
  const removing = values.removeReceiptIds.filter((id) => line.receipts.some((r) => r.id === id));
  if (!values.receipt && removing.length) changes.remove_receipt_ids = removing;
  return changes;
}

/** The PATCH's multipart body: the changes alone. */
export function draftLineForm(changes: DraftLineChanges): FormData {
  const body = lineEditForm(changes);
  if (changes.amount !== undefined) body.set("amount", changes.amount);
  for (const id of changes.remove_receipt_ids ?? []) body.append("remove_receipt_ids", id);
  return body;
}

/** The saved receipts still kept: those not removed. */
export function keptReceipts(line: ExpenseLine, removed: string[]): Receipt[] {
  return line.receipts.filter((r) => !removed.includes(r.id));
}

/** Remove is offered on a saved receipt only while another would stay (and no new one replaces them all). */
export function canRemoveReceipt(kept: Receipt[], replacing: boolean): boolean {
  return !replacing && kept.length > 1;
}

/** The account list for an edit: the line's own account stays choosable even when it is no longer switched on. */
export function accountsFor(line: ExpenseLine | null, accounts: ExpenseAccount[]): ExpenseAccount[] {
  if (!line?.account || accounts.some((a) => a.id === line.account?.id)) return accounts;
  return [line.account, ...accounts];
}

/** The list with a saved line replaced by the API's answer, in place. */
export function withLine(lines: ExpenseLine[], saved: ExpenseLine): ExpenseLine[] {
  return lines.map((line) => (line.id === saved.id ? saved : line));
}
