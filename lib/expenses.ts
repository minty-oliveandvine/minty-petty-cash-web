/**
 * The Expenses step's read: what `GET /reports/expenses` answers (Minty
 * `petty_cash_api/routes/expenses.py`), and the page's rules as Flask's `report/expense.html` has
 * them - the supplier and account searches, the receipt checks, the required fields and the
 * Expense Details rows.
 */

import { parseMoney } from "@/lib/currencyInput";
import type { OpeningPage } from "@/lib/opening";

export type Supplier = { id: string; name: string };
export type Account = { id: string; code: string; name: string };
export type Receipt = { id: string; name: string; mime_type: string | null };

export type ExpenseLine = {
  id: string;
  /** The account's name, as the line was saved ("" when none). */
  item: string;
  amount: number;
  remarks: string;
  supplier: Supplier | null;
  account: Account | null;
  receipts: Receipt[];
};

export type ExpensesPage = {
  transaction_date: string;
  currency_code: string | null;
  draft: OpeningPage["draft"];
  lines: ExpenseLine[];
  total: number;
  /** The company's synced Xero contacts, A to Z. */
  suppliers: Supplier[];
  /** The accounts switched on for Petty Cash, in the API's order. */
  accounts: Account[];
  permissions: { create_supplier: boolean };
};

/**
 * The supplier dropdown for what is typed (Flask's `initializeContactSearch`): every supplier when
 * nothing is typed, else those whose name holds the text, any case - always A to Z. `offerNew` is
 * the text to offer as a new contact: there are matches but none is exactly the text, or there
 * are none at all (Flask's "No Xero contact found" state).
 */
export function searchSuppliers(
  suppliers: Supplier[],
  typed: string,
): { matches: Supplier[]; offerNew: string | null } {
  const query = typed.trim();
  const sorted = (list: Supplier[]) => [...list].sort((a, b) => a.name.localeCompare(b.name));
  if (!query) return { matches: sorted(suppliers), offerNew: null };
  const q = query.toLowerCase();
  const matches = sorted(suppliers.filter((s) => s.name.toLowerCase().includes(q)));
  const exact = suppliers.some((s) => s.name.toLowerCase() === q);
  return { matches, offerNew: exact ? null : query };
}

/** The account dropdown for what is typed (Flask's `initializeAccountSearch`): by name, any case, in order. */
export function searchAccounts(accounts: Account[], typed: string): Account[] {
  const q = typed.trim().toLowerCase();
  if (!q) return accounts;
  return accounts.filter((a) => a.name.toLowerCase().includes(q));
}

export const MAX_RECEIPT_BYTES = 10 * 1024 * 1024;
const RECEIPT_TYPES = ["application/pdf", "image/jpeg", "image/jpg", "image/png"];

type PickedFile = { name: string; size: number; type: string };

/**
 * Why a picked or dropped receipt is refused, in Flask's words, or null. A drop names the file, as
 * Flask's drop handler does; more than one file is refused only on a drop (the picker takes one).
 */
export function receiptProblem(files: PickedFile[], how: "picked" | "dropped"): string | null {
  if (how === "dropped" && files.length > 1) return "Only one file is allowed per expense.";
  const say = (sentence: string, file: PickedFile) =>
    how === "dropped" ? `${sentence}: ${file.name}` : `${sentence}.`;
  for (const file of files) {
    if (file.size > MAX_RECEIPT_BYTES) return say("Files need to be under 10MB", file);
    if (!RECEIPT_TYPES.includes(file.type)) return say("I can take PDF, JPEG, or PNG files", file);
  }
  return null;
}

/** A receipt's file name in the upload box: cut to 27 characters and "..." past 30. */
export function uploadName(name: string): string {
  return name.length > 30 ? `${name.slice(0, 27)}...` : name;
}

/** How a receipt can be drawn (Flask's `ReceiptPreview.kind`), from its type, else its name. */
export function receiptKind(
  typeOrName: string | null | undefined,
  name?: string,
): "image" | "pdf" | "other" {
  const of = (raw: string | null | undefined) => {
    const v = String(raw ?? "")
      .toLowerCase()
      .split("?")[0];
    if (v.startsWith("application/pdf") || /\.pdf$/.test(v)) return "pdf";
    if (v.startsWith("image/") || /\.(jpe?g|png|gif|webp)$/.test(v)) return "image";
    return "other";
  };
  const kind = of(typeOrName);
  return kind === "other" && name !== undefined ? of(name) : kind;
}

export type AddForm = {
  amount: string;
  supplierText: string;
  supplier: Supplier | null;
  accountText: string;
  account: Account | null;
  file: File | null;
};

export type RequiredField = "amount" | "supplier" | "account" | "file";

/**
 * The fields Add refuses (Flask's `addExpense`), each drawn with a red border: an amount of 0, a
 * supplier or an account not chosen from its list (or its text changed since), no receipt.
 */
export function missingFields(form: AddForm): RequiredField[] {
  const missing: RequiredField[] = [];
  if (parseMoney(form.amount) === 0) missing.push("amount");
  if (!form.supplier || form.supplierText.trim() !== form.supplier.name) missing.push("supplier");
  if (!form.account || form.accountText.trim() !== form.account.name) missing.push("account");
  if (!form.file || form.file.size === 0) missing.push("file");
  return missing;
}

/** Expense Details' rows, as Flask writes them: "N/A" and "-" for what a line lacks. */
export function detailRows(line: ExpenseLine): {
  contact: string;
  description: string;
  account: string;
} {
  return {
    contact: line.supplier?.name || "N/A",
    description: line.remarks || "-",
    account: `${line.account?.code || "N/A"} ${line.item}`,
  };
}
