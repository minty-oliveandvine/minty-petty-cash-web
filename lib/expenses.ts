/**
 * The Daily Closing's Expenses stage (Part 15.15b/c; Flask's Expenses section): what
 * `GET /reports/expenses` answers (Minty `petty_cash_api/routes/expenses.py`), and the entry
 * form's rules - the as-you-type checks, the supplier search and the error summary - as pure
 * functions, so the stage (components/closing/Expenses.tsx) and its entry form
 * (components/closing/ExpenseForm.tsx) only draw what this says.
 *
 * The checks mirror the API's (it refuses the same things with a 422): an amount above 0 and up
 * to 99,999,999,999.99, a supplier and an account from the lists the read handed out, a
 * description of at most 300 characters, and one receipt - a PDF, JPEG or PNG of at most 10 MB.
 * Wording is Part 11's: the issue, then the action; never "Error", "Invalid" or "required field".
 */

import { parseAmount } from "@minty/shared/money";

import { money } from "@/lib/money";
import type { OpeningPage } from "@/lib/opening";

export type Supplier = { id: string; name: string };
export type ExpenseAccount = { id: string; code: string; name: string };
export type Receipt = { id: string; name: string; mime_type: string | null };

export type ExpenseLine = {
  id: string;
  /** The account's name, as Flask's list showed it. */
  item: string;
  amount: number;
  remarks: string;
  supplier: Supplier | null;
  account: ExpenseAccount | null;
  receipts: Receipt[];
};

export type ExpensesPage = {
  transaction_date: string;
  currency_code: string | null;
  draft: OpeningPage["draft"];
  lines: ExpenseLine[];
  total: number;
  /** The company's synced Xero contacts, A to Z - a line can only be saved with one of these. */
  suppliers: Supplier[];
  /** The accounts switched on for Petty Cash. */
  accounts: ExpenseAccount[];
  permissions: { create_supplier: boolean };
};

/** What `POST /reports/expenses/lines` answers. */
export type ExpenseAdded = { line: ExpenseLine; total: number };

/** What `PUT /reports/expenses` answers on a save. */
export type ExpensesSaved = {
  draft_id: string;
  transaction_date: string;
  current_section: string | null;
  completed_sections: string[];
  next: "deposit" | "dashboard";
};

export const MAX_AMOUNT = 99_999_999_999.99;
export const MAX_REMARKS = 300;
export const MAX_RECEIPT_BYTES = 10 * 1024 * 1024;
/** Flask's `MAX_NAME` for a new supplier (`entity/services/suppliers.py`). */
export const MAX_SUPPLIER_NAME = 150;

/** The picker's `accept`: what a phone offers (camera, photos, files). The bytes are checked again. */
export const RECEIPT_ACCEPT = "image/*,application/pdf";
export const RECEIPT_LIMITS = "PDF, JPEG or PNG, up to 10 MB.";

// ---------------------------------------------------------------------------------------------
// The fields

/**
 * The amount's problem, or null. Empty is a problem only once a submit was refused (`submitted`);
 * zero is "not finished yet" while it is being typed ("0" on the way to "0.50"), so it waits for
 * the field to be left (`touched`). Above the limit cannot be typed (11 whole digits), but the
 * rule says so anyway.
 */
export function amountProblem(text: string, { touched, submitted, code }: { touched: boolean; submitted: boolean; code: string | null }): string | null {
  if (text.trim() === "") return submitted ? "The amount is still empty. Add the amount to continue." : null;
  const amount = parseAmount(text) ?? 0;
  if (amount > MAX_AMOUNT) return `The amount is above ${money(MAX_AMOUNT, code)}. Enter ${money(MAX_AMOUNT, code)} or less.`;
  if (amount <= 0 && (touched || submitted)) return "The amount is 0. Enter an amount above 0.";
  return null;
}

/** The description's problem: only above the limit (an optional field never warns otherwise). */
export function remarksProblem(text: string): string | null {
  const length = text.trim().length;
  return length > MAX_REMARKS ? `The description is ${length} characters. Shorten it to ${MAX_REMARKS} characters or fewer.` : null;
}

/** The description's helper: "Optional" and the live count - the counter Part 14's Textarea asks for. */
export function remarksHelper(text: string): string {
  return `Optional. ${text.trim().length} of ${MAX_REMARKS} characters.`;
}

/**
 * The supplier's problem. Nothing chosen and nothing typed is a problem only after a refused
 * submit; typed text that is not a supplier yet is "not finished" until the field is left.
 */
export function supplierProblem(
  query: string,
  chosen: Supplier | null,
  { touched, submitted, canCreate }: { touched: boolean; submitted: boolean; canCreate: boolean },
): string | null {
  if (chosen) return null;
  if (query.trim() === "") return submitted ? "The supplier is still empty. Choose a supplier from the list to continue." : null;
  if (!(touched || submitted)) return null;
  return canCreate
    ? `"${query.trim()}" is not a supplier yet. Choose one from the list, or add it as a new supplier.`
    : `"${query.trim()}" is not a supplier yet. Choose one from the list.`;
}

/** The account's problem: only none chosen, after a refused submit (the list holds nothing else). */
export function accountProblem(accountId: string, submitted: boolean): string | null {
  return accountId === "" && submitted ? "The account is still empty. Choose where to record this expense to continue." : null;
}

/** The receipt's problem when none is attached - after a refused submit only. */
export function missingReceipt(file: File | null, submitted: boolean): string | null {
  return !file && submitted ? "The receipt is still missing. Take a photo of it or choose its file to continue." : null;
}

const RECEIPT_TYPES = ["application/pdf", "image/jpeg", "image/png"];
const RECEIPT_EXTENSIONS = /\.(pdf|jpe?g|png)$/i;

/**
 * Whether a picked file can be the receipt - checked the moment it is picked, so nobody learns
 * on submit that it was the wrong one. The message names the file and the limit (Part 14 File
 * card: "say which file failed and why"). The API judges the bytes again.
 */
export function receiptProblem(file: { name: string; size: number; type: string }): string | null {
  const known = RECEIPT_TYPES.includes(file.type.toLowerCase()) || (!file.type && RECEIPT_EXTENSIONS.test(file.name));
  if (!known) return `${file.name} isn't a PDF, JPEG or PNG. Attach the receipt as one of those.`;
  if (file.size === 0) return `${file.name} is empty. Attach the receipt again.`;
  if (file.size > MAX_RECEIPT_BYTES) return `${file.name} is ${fileSize(file.size)}. Attach a file of 10 MB or less.`;
  return null;
}

/** A file's size as people read it: "860 KB", "2.4 MB". */
export function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** What kind of file a receipt is, for its File card ("PDF", "Photo"). */
export function receiptKind(mime: string | null | undefined): "pdf" | "image" | "file" {
  const type = (mime ?? "").toLowerCase();
  if (type === "application/pdf") return "pdf";
  if (type.startsWith("image/")) return "image";
  return "file";
}

/** An account as the list shows it: the business label first, the Xero code kept visible (Part 14 Select). */
export function accountLabel(account: ExpenseAccount): string {
  return account.code ? `${account.name} · ${account.code}` : account.name;
}

// ---------------------------------------------------------------------------------------------
// The supplier picker (Part 14 Supplier picker)

const normal = (text: string) => text.trim().replace(/\s+/g, " ").toLowerCase();

/** The suppliers whose name holds what was typed, A to Z; all of them for an empty search. */
export function supplierMatches(suppliers: Supplier[], query: string): Supplier[] {
  const q = normal(query);
  const list = q ? suppliers.filter((s) => normal(s.name).includes(q)) : suppliers;
  return [...list].sort((a, b) => a.name.localeCompare(b.name));
}

/** The supplier whose name IS what was typed - trimmed, spaces collapsed, any case - so no duplicate is made. */
export function exactSupplier(suppliers: Supplier[], query: string): Supplier | null {
  const q = normal(query);
  return q ? (suppliers.find((s) => normal(s.name) === q) ?? null) : null;
}

/** Whether the list ends with 'Add "…" as a new supplier': allowed, something typed, and no supplier has that name. */
export function offersNewSupplier(suppliers: Supplier[], query: string, canCreate: boolean): boolean {
  return canCreate && query.trim() !== "" && exactSupplier(suppliers, query) === null;
}

/** A new supplier's name problem, as it is typed. Empty waits for the Add supplier press. */
export function newSupplierProblem(name: string, suppliers: Supplier[], attempted: boolean): string | null {
  const trimmed = name.trim();
  if (trimmed === "") return attempted ? "The supplier's name is still empty. Add the name to continue." : null;
  if (trimmed.length > MAX_SUPPLIER_NAME) return `The name is ${trimmed.length} characters. Keep it to ${MAX_SUPPLIER_NAME} characters or fewer.`;
  const same = exactSupplier(suppliers, trimmed);
  if (same) return `${same.name} is already a supplier. Choose it from the list.`;
  return null;
}

/** The list with a new supplier in it, A to Z (as the read gives them). */
export function withSupplier(suppliers: Supplier[], added: Supplier): Supplier[] {
  return [...suppliers.filter((s) => s.id !== added.id), added].sort((a, b) => a.name.localeCompare(b.name));
}

// ---------------------------------------------------------------------------------------------
// The list

/** "1 expense", "3 expenses". */
export function expenseCount(count: number): string {
  return `${count} ${count === 1 ? "expense" : "expenses"}`;
}

/** The list without a deleted line. */
export function withoutLine(lines: ExpenseLine[], id: string): ExpenseLine[] {
  return lines.filter((line) => line.id !== id);
}

/** Whether lines can still be added and deleted: the day's report is a draft (Flask hid both otherwise). */
export function canEditLines(draft: ExpensesPage["draft"]): boolean {
  return !draft || draft.status === "draft";
}
