"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";

import { useToast } from "@/components/flask/Toasts";
import { ExpenseDetailsModal, ExpenseRow } from "@/components/report/ExpensesStep";
import { FieldMessage } from "@/components/report/ReportChrome";
import { ApiError, pettyCashFetch } from "@/lib/apiClient";
import { uploadName, type Account, type Supplier } from "@/lib/expenses";
import { formatMoney } from "@/lib/money";
import {
  EDIT_SAVED,
  EDIT_UNSAVED,
  editReasonProblem,
  editReceiptProblem,
  lineChanges,
  remarksProblem,
  type DailyReport,
  type ReportLine,
} from "@/lib/report";

/**
 * A submitted report's Edit Details - Flask's ORIGINAL constrained "report_edit" mode (Minty
 * `1c25b35^1`), which changed the three details that move no balance on the step pages:
 * - the difference reason (`report/cash_count.html`'s box and "Save changes");
 * - where the addition to the drawer came from (`report/opening.html`'s "Withdrawal from:");
 * - an expense line's description, supplier, account and receipt (`report/expense.html`'s
 *   editor inside Expense Details).
 *
 * Here they are drawn in the report's own view. Each sends one call (`PUT
 * /reports/<id>/difference-reason`, `PUT /reports/<id>/withdrawal`, `PATCH
 * /reports/<id>/expense-lines/<line id>`; Minty `petty_cash_api/routes/report.py`), which answers
 * the whole Daily Report: the page is drawn again from it (`onSaved`). A refusal shows the API's
 * sentence at the field and changes nothing; Flask's success toasts, word for word, only after
 * the API said yes.
 */

const UNREACHABLE = "We couldn't reach Petty Cash. Check your connection, then reload the page.";
const NOTHING_CHANGED = "Nothing has changed yet. Change a detail to save it.";

/** Flask's small "Save changes" (`text-sm px-4 py-2 rounded-lg`), 44px tall on a phone. */
const SAVE_SMALL =
  "min-h-[44px] rounded-flask-lg bg-flask-teal px-4 py-2 text-sm font-medium text-flask-white transition-colors hover:bg-flask-teal/80 disabled:opacity-70 sm:min-h-0";
const CARD = "mb-6 rounded-flask-lg bg-flask-white p-6 shadow-flask-sm";
const CARD_TITLE = "text-sm font-semibold text-flask-gray-900 sm:text-lg";
/** The line editor's fields, as Flask's (`px-3 py-2 border rounded-lg text-sm`). */
const EDIT_FIELD =
  "w-full rounded-flask-lg border bg-flask-white px-3 py-2 text-sm text-flask-gray-700 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-flask-teal";
const EDIT_LABEL = "mb-1 block text-sm font-medium text-flask-gray-700";

type Saved = (report: DailyReport) => void;

/** The sentence a refusal carried (the API's own), or the connection's. */
function refusalOf(err: unknown): string {
  return err instanceof ApiError ? err.message : UNREACHABLE;
}

const reportPath = (report: DailyReport) => `/reports/${encodeURIComponent(report.report_id)}`;

/**
 * The difference reason, edited in the shortage or surplus box: Flask's rounded box and its
 * "Save changes". Checked as it is typed - at most 300 characters, never emptied while the cash
 * was short or over.
 */
export function ReasonEditor({ report, onSaved }: { report: DailyReport; onSaved: Saved }) {
  const toast = useToast();
  const field = useRef<HTMLTextAreaElement>(null);
  const { kind } = report.cash.difference;
  const [reason, setReason] = useState(report.cash.difference.reason);
  const [refused, setRefused] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const problem = editReasonProblem(reason, kind);
  const message = refused ?? problem;

  async function save(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    if (problem) {
      field.current?.focus();
      return;
    }
    setSaving(true);
    try {
      const answer = await pettyCashFetch<DailyReport>(`${reportPath(report)}/difference-reason`, {
        method: "PUT",
        json: { reason },
      });
      setReason(answer.cash.difference.reason);
      onSaved(answer);
      toast(EDIT_SAVED.reason, "success");
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return;
      setRefused(refusalOf(err));
      field.current?.focus();
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={(e) => void save(e)} className="mt-2" noValidate>
      <textarea
        ref={field}
        name="discrepancy_reason"
        aria-label="Reason (required)"
        aria-required={kind !== "none" ? true : undefined}
        aria-invalid={message ? true : undefined}
        aria-describedby={message ? "reason_message" : undefined}
        rows={2}
        placeholder="Description"
        value={reason}
        onChange={(e) => {
          setReason(e.target.value);
          setRefused(null);
        }}
        className={`block w-full resize-none rounded-flask-2xl border bg-flask-white px-3 py-3 text-sm text-flask-gray-700 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-flask-teal ${
          message ? "border-flask-red-500" : "border-flask-gray-300"
        }`}
      />
      {message ? <FieldMessage id="reason_message">{message}</FieldMessage> : null}
      <div className="mt-3 flex justify-end">
        <button type="submit" disabled={saving} className={SAVE_SMALL}>
          {saving ? "Saving..." : "Save changes"}
        </button>
      </div>
    </form>
  );
}

/**
 * "Addition to Cash Drawer": the amount (never editable), then Flask's "Withdrawal from:" -
 * Company Bank or Personal (Personal when none was saved, as Flask checked it) - and "Save changes".
 */
export function WithdrawalCard({ report, onSaved }: { report: DailyReport; onSaved: Saved }) {
  const toast = useToast();
  const saved = report.cash.cash_addition_type === "company" ? "company" : "personal";
  const [choice, setChoice] = useState<"company" | "personal">(saved);
  const [refused, setRefused] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    try {
      const answer = await pettyCashFetch<DailyReport>(`${reportPath(report)}/withdrawal`, {
        method: "PUT",
        json: { withdrawal_type: choice },
      });
      onSaved(answer);
      toast(EDIT_SAVED.withdrawal, "success");
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return;
      setRefused(refusalOf(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={(e) => void save(e)} className={CARD} noValidate>
      <h3 className={`mb-4 ${CARD_TITLE}`}>Addition to Cash Drawer</h3>
      <div className="mb-4 w-full rounded-flask-xl border border-flask-gray-300 bg-flask-gray-200 px-3 py-3 text-flask-gray-500 [overflow-wrap:anywhere]">
        {formatMoney(report.cash.cash_addition, report.currency_code)}
      </div>
      <fieldset aria-describedby={refused ? "withdrawal_message" : undefined}>
        <legend className="mb-2 block text-sm font-medium text-flask-gray-700">
          Withdrawal from:
        </legend>
        <div className="space-y-2">
          {(
            [
              ["company", "Company Bank"],
              ["personal", "Personal"],
            ] as const
          ).map(([value, label]) => (
            <label key={value} className="flex items-center">
              <input
                type="radio"
                name="withdrawal_edit"
                value={value}
                checked={choice === value}
                onChange={() => {
                  setChoice(value);
                  setRefused(null);
                }}
                className="flask-radio"
              />
              <span className="ml-2 text-sm text-flask-gray-700">{label}</span>
            </label>
          ))}
        </div>
      </fieldset>
      {refused ? <FieldMessage id="withdrawal_message">{refused}</FieldMessage> : null}
      <div className="mt-3 flex justify-end">
        <button type="submit" disabled={saving} className={SAVE_SMALL}>
          {saving ? "Saving..." : "Save changes"}
        </button>
      </div>
    </form>
  );
}

/** The day's lines as the Expenses step lists them (no bin); a tap opens the line's editor. */
export function EditLinesCard({
  report,
  onOpen,
}: {
  report: DailyReport;
  onOpen: (line: ReportLine) => void;
}) {
  return (
    <div className={CARD}>
      <h3 className={`mb-4 ${CARD_TITLE}`}>Expenses</h3>
      {/* block, not flex: the rows overlap by their -12px margins, as on the Expenses step */}
      <div>
        {report.expenses.lines.map((line) => (
          <ExpenseRow
            key={line.id}
            line={line}
            code={report.currency_code}
            onOpen={() => onOpen(line)}
          />
        ))}
      </div>
    </div>
  );
}

type LineField = "remarks" | "supplier" | "account" | "receipt" | "form";

/** Which field an API refusal belongs to, by its sentence (`report_edits.py`, `checked_receipt`). */
function fieldOf(sentence: string): LineField {
  if (sentence.startsWith("Choose a supplier")) return "supplier";
  if (sentence.startsWith("Choose an account")) return "account";
  if (sentence.startsWith("Keep the description")) return "remarks";
  if (sentence.startsWith("Attach") || sentence.startsWith("That file is empty")) return "receipt";
  return "form";
}

/** The line's own choice, kept in the list even when it is no longer among the options. */
function withCurrent<T extends { id: string }>(list: T[], current: T | null): T[] {
  return current && !list.some((x) => x.id === current.id) ? [current, ...list] : list;
}

/**
 * Expense Details with Flask's editor in place of the grey box: the receipt and "Amount Paid"
 * (never editable), then Description, Supplier and Account Code (Flask's selects, from the read's
 * `options`), Receipt/Document ("Click to change files", one PDF, JPEG or PNG of 10 MB at most,
 * checked before it is sent) and "Save changes". Only what changed is sent. Escape or a click
 * outside keeps an editor with changes open (Flask's toast); Close discards them.
 */
export function LineEditor({
  report,
  line,
  onSaved,
  onClose,
}: {
  report: DailyReport;
  line: ReportLine;
  onSaved: Saved;
  onClose: () => void;
}) {
  const toast = useToast();
  const options = report.options ?? { suppliers: [], accounts: [] };
  const suppliers = withCurrent<Supplier>(options.suppliers, line.supplier);
  const accounts = withCurrent<Account>(options.accounts, line.account);
  const fileInput = useRef<HTMLInputElement>(null);
  const remarksField = useRef<HTMLTextAreaElement>(null);
  const receiptBox = useRef<HTMLButtonElement>(null);
  const [remarks, setRemarks] = useState(line.remarks);
  const [supplierId, setSupplierId] = useState(line.supplier?.id ?? "");
  const [accountId, setAccountId] = useState(line.account?.id ?? "");
  const [receipt, setReceipt] = useState<File | null>(null);
  const [receiptRefused, setReceiptRefused] = useState<string | null>(null);
  const [refused, setRefused] = useState<{ field: LineField; message: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const changes = lineChanges(line, { remarks, supplierId, accountId, receipt });
  const dirty = Object.keys(changes).length > 0;
  // read when Escape or a click outside asks: the modal's handler must keep one identity, or it
  // takes the focus back from the field being typed in
  const dirtyRef = useRef(dirty);
  useEffect(() => {
    dirtyRef.current = dirty;
  }, [dirty]);
  const dismiss = useCallback(() => {
    if (dirtyRef.current) toast(EDIT_UNSAVED, "warning");
    else onClose();
  }, [toast, onClose]);
  const say = (field: LineField) => (refused?.field === field ? refused.message : null);
  const remarksMessage = say("remarks") ?? remarksProblem(remarks);
  const receiptMessage = say("receipt") ?? receiptRefused;
  const supplierMessage = say("supplier");
  const accountMessage = say("account");
  const formMessage = say("form");

  function pick(files: FileList | null) {
    const file = files?.[0];
    if (!file) return; // the picker was cancelled: what was picked stays
    const problem = editReceiptProblem(file);
    setRefused(null);
    setReceiptRefused(problem);
    setReceipt(problem ? null : file);
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    if (remarksProblem(remarks)) {
      remarksField.current?.focus();
      return;
    }
    if (!dirty) {
      setRefused({ field: "form", message: NOTHING_CHANGED });
      return;
    }
    const form = new FormData();
    if (changes.remarks !== undefined) form.append("remarks", changes.remarks);
    if (changes.supplier_id) form.append("supplier_id", changes.supplier_id);
    if (changes.account_id) form.append("account_id", changes.account_id);
    if (changes.receipt) form.append("receipt", changes.receipt, changes.receipt.name);
    setSaving(true);
    setRefused(null);
    try {
      const answer = await pettyCashFetch<DailyReport>(
        `${reportPath(report)}/expense-lines/${encodeURIComponent(line.id)}`,
        { method: "PATCH", form },
      );
      onSaved(answer);
      toast(EDIT_SAVED.line, "success");
      onClose();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return;
      const message = refusalOf(err);
      const field = err instanceof ApiError ? fieldOf(message) : "form";
      setRefused({ field, message });
      if (field === "remarks") remarksField.current?.focus();
      if (field === "receipt") receiptBox.current?.focus();
    } finally {
      setSaving(false);
    }
  }

  const editor = (
    <form onSubmit={(e) => void save(e)} className="mt-4 space-y-3 text-left" noValidate>
      <div>
        <label htmlFor="editExpDescription" className={EDIT_LABEL}>
          Description
        </label>
        <textarea
          ref={remarksField}
          id="editExpDescription"
          rows={2}
          value={remarks}
          aria-invalid={remarksMessage ? true : undefined}
          aria-describedby={remarksMessage ? "editExpDescription_message" : undefined}
          onChange={(e) => {
            setRemarks(e.target.value);
            if (refused?.field === "remarks" || refused?.field === "form") setRefused(null);
          }}
          className={`${EDIT_FIELD} ${remarksMessage ? "border-flask-red-500" : "border-flask-gray-300"}`}
        />
        {remarksMessage ? (
          <FieldMessage id="editExpDescription_message">{remarksMessage}</FieldMessage>
        ) : null}
      </div>
      <div>
        <label htmlFor="editExpContact" className={EDIT_LABEL}>
          Supplier
        </label>
        <select
          id="editExpContact"
          value={supplierId}
          aria-invalid={supplierMessage ? true : undefined}
          aria-describedby={supplierMessage ? "editExpContact_message" : undefined}
          onChange={(e) => {
            setSupplierId(e.target.value);
            setRefused(null);
          }}
          className={`${EDIT_FIELD} min-h-[44px] sm:min-h-0 ${supplierMessage ? "border-flask-red-500" : "border-flask-gray-300"}`}
        >
          <option value="" disabled>
            — Select supplier —
          </option>
          {suppliers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        {supplierMessage ? (
          <FieldMessage id="editExpContact_message">{supplierMessage}</FieldMessage>
        ) : null}
      </div>
      <div>
        <label htmlFor="editExpAccount" className={EDIT_LABEL}>
          Account Code
        </label>
        <select
          id="editExpAccount"
          value={accountId}
          aria-invalid={accountMessage ? true : undefined}
          aria-describedby={accountMessage ? "editExpAccount_message" : undefined}
          onChange={(e) => {
            setAccountId(e.target.value);
            setRefused(null);
          }}
          className={`${EDIT_FIELD} min-h-[44px] sm:min-h-0 ${accountMessage ? "border-flask-red-500" : "border-flask-gray-300"}`}
        >
          <option value="" disabled>
            — Select account —
          </option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {`${a.code} ${a.name}`.trim()}
            </option>
          ))}
        </select>
        {accountMessage ? (
          <FieldMessage id="editExpAccount_message">{accountMessage}</FieldMessage>
        ) : null}
      </div>
      <div>
        <span id="editExpFiles_label" className={EDIT_LABEL}>
          Receipt/Document
        </span>
        <button
          ref={receiptBox}
          type="button"
          aria-labelledby="editExpFiles_label editExpFileText"
          aria-describedby={receiptMessage ? "editExpFiles_message" : "editExpFiles_hint"}
          onClick={() => fileInput.current?.click()}
          className={`block w-full cursor-pointer rounded-flask-lg border-2 border-dashed p-4 text-center transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-flask-teal ${
            receiptMessage
              ? "border-flask-red-500 bg-flask-gray-50 hover:bg-flask-gray-100"
              : receipt
                ? "border-flask-upload-ok bg-flask-upload-ok-bg"
                : "border-flask-gray-300 bg-flask-gray-50 hover:bg-flask-gray-100"
          }`}
        >
          <span
            id="editExpFileText"
            className="block text-sm text-flask-gray-500 [overflow-wrap:anywhere]"
          >
            {receipt ? uploadName(receipt.name) : "Click to change files"}
          </span>
          <span id="editExpFiles_hint" className="mt-1 block text-xs text-flask-gray-400">
            PDF, JPEG, PNG (Max 10MB)
          </span>
        </button>
        <input
          ref={fileInput}
          type="file"
          className="hidden"
          accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
          aria-label="Choose a new receipt"
          onChange={(e) => {
            pick(e.target.files);
            e.target.value = "";
          }}
        />
        {receiptMessage ? (
          <FieldMessage id="editExpFiles_message">{receiptMessage}</FieldMessage>
        ) : null}
      </div>
      <div className="pt-1">
        <button
          type="submit"
          disabled={saving}
          className="w-full rounded-flask-xl bg-flask-teal px-4 py-3 font-medium text-flask-white transition-colors hover:bg-flask-teal/80 disabled:opacity-70"
        >
          {saving ? "Saving..." : "Save changes"}
        </button>
        {formMessage ? <FieldMessage id="editExp_message">{formMessage}</FieldMessage> : null}
      </div>
    </form>
  );

  return (
    <ExpenseDetailsModal
      line={line}
      code={report.currency_code}
      onClose={onClose}
      onDismiss={dismiss}
      editor={editor}
    />
  );
}
