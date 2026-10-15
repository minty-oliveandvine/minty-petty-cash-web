"use client";

import { useEffect, useRef, useState, type DragEvent, type FormEvent, type KeyboardEvent, type ReactNode } from "react";

import { useToast } from "@/components/flask/Toasts";
import { ReceiptViewer, type ShownReceipt } from "@/components/report/ReceiptViewer";
import { ApiError, pettyCashFetch } from "@/lib/apiClient";
import { groupMoney, parseMoney, sanitizeMoney } from "@/lib/currencyInput";
import {
  missingFields,
  receiptKind,
  receiptProblem,
  searchAccounts,
  searchSuppliers,
  uploadName,
  type Account,
  type ExpenseLine,
  type RequiredField,
  type Supplier,
} from "@/lib/expenses";

const FIELD =
  "w-full rounded-flask-2xl border bg-flask-white py-3 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-flask-teal cursor-pointer";
const LABEL = "mb-2 block text-sm font-medium text-flask-gray-700";
const OUTLINE_BUTTON =
  "flex flex-1 items-center justify-center gap-2 rounded-flask-xl border-2 border-flask-teal px-4 py-3 font-medium text-flask-teal transition-colors hover:bg-flask-teal/10";
const FILLED_BUTTON =
  "flex flex-1 items-center justify-center gap-2 rounded-flask-xl bg-flask-teal px-4 py-3 font-medium text-flask-white transition-colors hover:bg-flask-teal/80 disabled:opacity-70";
const ADD_FAILED = "An error occurred while adding the expense. Please try again.";

const Star = () => (
  <>
    <span className="text-flask-red-500" aria-hidden="true">
      *
    </span>
    <span className="sr-only">(required)</span>
  </>
);

/** The sentence a refusal carried, or null when the API gave none (Flask's `fromServer`). */
function sentenceOf(err: unknown): string | null {
  if (!(err instanceof ApiError)) return null;
  const body = err.body as { error?: unknown } | null;
  return body && typeof body.error === "string" ? body.error : null;
}

export type AddExpenseProps = {
  day: string;
  code: string | null;
  suppliers: Supplier[];
  accounts: Account[];
  canCreateSupplier: boolean;
  /** A supplier made here, for the page's list (Flask pushes it onto `allContacts`). */
  onSupplierCreated: (supplier: Supplier) => void;
  onAdded: (line: ExpenseLine, total: number) => void;
  onCancel: () => void;
  /** The phone card's overlay: its text while something is sent, null when done. */
  setBusy: (text: string | null) => void;
  /** The API found no draft for the day: back to Opening with its sentence. */
  onNoDraft: (sentence: string) => void;
};

/**
 * Flask's "Add New Expense" card (`#addExpenseForm` in `report/expense.html`), inline below the
 * list: the receipt drop zone, Expense Amount, Description, the searchable Suppliers dropdown with
 * its "New Contact" panel, the Account Code dropdown, and Cancel / Add. Add checks the four
 * required fields as Flask does (red borders and one toast), then sends the line with its receipt
 * as one multipart `POST /reports/expenses/lines`; the server checks it all again.
 */
export function AddExpenseCard(props: AddExpenseProps) {
  const { day, code, suppliers, accounts, canCreateSupplier, onSupplierCreated, onAdded, onCancel, setBusy, onNoDraft } = props;
  const toast = useToast();
  const card = useRef<HTMLFormElement>(null);
  const [amount, setAmount] = useState("");
  const [remarks, setRemarks] = useState("");
  const [supplierText, setSupplierText] = useState("");
  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [accountText, setAccountText] = useState("");
  const [account, setAccount] = useState<Account | null>(null);
  // the receipt and an object URL of it, made when it is picked and let go when it is replaced
  const [picked, setPicked] = useState<Picked | null>(null);
  const pickedRef = useRef<Picked | null>(null);
  useEffect(() => () => revoke(pickedRef.current), []);
  const file = picked?.file ?? null;
  const [newContact, setNewContact] = useState<string | null>(null);
  const [errors, setErrors] = useState<Set<RequiredField>>(new Set());
  const [sending, setSending] = useState(false);

  // Flask scrolls the card into view as it opens.
  useEffect(() => {
    const timer = window.setTimeout(() => card.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
    return () => window.clearTimeout(timer);
  }, []);

  const clearError = (field: RequiredField) =>
    setErrors((all) => {
      if (!all.has(field)) return all;
      const next = new Set(all);
      next.delete(field);
      return next;
    });

  function pickSupplier(s: Supplier) {
    setSupplier(s);
    setSupplierText(s.name);
    clearError("supplier");
  }

  function pickAccount(a: Account) {
    setAccount(a);
    setAccountText(a.name);
    clearError("account");
  }

  async function createSupplier() {
    const name = (newContact ?? "").trim();
    setNewContact(name);
    if (!name) {
      toast("Who should I put down as the contact?", "error");
      return;
    }
    setBusy("Creating Contact...");
    try {
      const made = await pettyCashFetch<Supplier>("/suppliers", { method: "POST", json: { name } });
      onSupplierCreated(made);
      pickSupplier(made);
      setNewContact(null);
      toast("That contact's added!", "success");
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return;
      toast(sentenceOf(err) ?? "I couldn't add that contact. Mind trying again?", "error");
    } finally {
      setBusy(null);
    }
  }

  async function add(event: FormEvent) {
    event.preventDefault();
    if (sending) return;
    const missing = missingFields({ amount, supplierText, supplier, accountText, account, file });
    setErrors(new Set(missing));
    if (missing.length > 0 || !supplier || !account || !file) {
      toast("Please fill out the Required Fields", "error");
      return;
    }
    const form = new FormData();
    form.append("transaction_date", day);
    form.append("amount", String(parseMoney(amount)));
    form.append("remarks", remarks);
    form.append("supplier_id", supplier.id);
    form.append("account_id", account.id);
    form.append("receipt", file, file.name);
    setSending(true);
    setBusy("Saving...");
    try {
      const answer = await pettyCashFetch<{ line: ExpenseLine; total: number }>("/reports/expenses/lines", { method: "POST", form });
      setBusy(null);
      onAdded(answer.line, answer.total);
      toast("Expense added successfully!", "success");
    } catch (err) {
      setBusy(null);
      setSending(false);
      if (err instanceof ApiError && err.status === 401) return;
      const body = err instanceof ApiError ? (err.body as { to?: string } | null) : null;
      if (body?.to === "opening") {
        onNoDraft(err instanceof ApiError ? err.message : ADD_FAILED);
        return;
      }
      toast(sentenceOf(err) ?? ADD_FAILED, "error");
    }
  }

  const border = (field: RequiredField) => (errors.has(field) ? "border-flask-red-500" : "border-flask-gray-300");

  return (
    <form ref={card} noValidate onSubmit={add} className="mb-6 rounded-flask-lg bg-flask-white p-6 shadow-flask-sm" aria-labelledby="addExpenseTitle">
      <h2 id="addExpenseTitle" className="mb-6 text-xl font-bold text-flask-gray-900">
        Add New Expense
      </h2>

      <ReceiptDrop
        picked={picked}
        invalid={errors.has("file")}
        onFile={(f) => {
          revoke(pickedRef.current);
          const next = f ? { file: f, url: URL.createObjectURL(f) } : null;
          pickedRef.current = next;
          setPicked(next);
          if (f) clearError("file");
        }}
      />

      <div className="mb-4">
        <label htmlFor="expense_amount" className={LABEL}>
          Expense Amount <Star />
        </label>
        <div className="relative">
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
            <span className="text-sm text-flask-gray-500">{code || "$"}</span>
          </div>
          <input
            id="expense_amount"
            type="text"
            inputMode="decimal"
            autoComplete="off"
            placeholder="0.00"
            aria-required="true"
            aria-invalid={errors.has("amount") || undefined}
            value={amount}
            onChange={(e) => {
              setAmount(sanitizeMoney(e.target.value));
              clearError("amount");
            }}
            onBlur={() => setAmount((v) => groupMoney(v))}
            className={`${FIELD} ${border("amount")} pl-12 pr-3 text-flask-black`}
          />
        </div>
      </div>

      <div>
        <label htmlFor="expense_remarks" className={LABEL}>
          Description
        </label>
        <input
          id="expense_remarks"
          type="text"
          autoComplete="off"
          placeholder="Description (Optional)"
          value={remarks}
          onChange={(e) => setRemarks(e.target.value)}
          className={`${FIELD} mb-4 border-flask-gray-300 pl-3 pr-3 text-flask-gray-700`}
        />
      </div>

      {newContact === null ? (
        <div className="mb-4">
          <SearchField
            id="expense_contact"
            label={
              <>
                Suppliers <Star />
              </>
            }
            placeholder="Select a contact"
            text={supplierText}
            invalid={errors.has("supplier")}
            onText={(text) => {
              setSupplierText(text);
              clearError("supplier");
              if (supplier && text.trim() !== supplier.name) setSupplier(null);
            }}
            listFor={(text, how) => {
              if (how === "click" || !text.trim()) {
                return suppliers.length > 0 ? supplierOptions(searchSuppliers(suppliers, "").matches, null, pickSupplier, setNewContact) : null;
              }
              const { matches, offerNew } = searchSuppliers(suppliers, text);
              const offer = canCreateSupplier ? offerNew : null;
              if (matches.length > 0) return supplierOptions(matches, offer, pickSupplier, setNewContact);
              return noSupplierOptions(offer, setNewContact);
            }}
          />
        </div>
      ) : (
        <div className="mb-4 rounded-flask-xl border border-flask-gray-300 bg-flask-white p-6 shadow-flask-lg">
          <label htmlFor="new_contact" className={LABEL}>
            New Contact <Star />
          </label>
          <input
            id="new_contact"
            type="text"
            autoComplete="off"
            placeholder="Enter a New Contact"
            aria-required="true"
            value={newContact}
            onChange={(e) => setNewContact(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void createSupplier();
              }
            }}
            className={`${FIELD} border-flask-gray-300 pl-3 pr-3 text-flask-gray-700`}
          />
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={() => {
                setNewContact(null);
                setSupplierText("");
                setSupplier(null);
              }}
              className="flex-1 rounded-flask-xl border-2 border-flask-teal px-4 py-2 text-sm font-medium text-flask-teal transition-colors hover:bg-flask-teal/10"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void createSupplier()}
              className="flex-1 rounded-flask-xl bg-flask-teal px-4 py-2 text-sm font-medium text-flask-white transition-colors hover:bg-flask-teal/80"
            >
              Create
            </button>
          </div>
        </div>
      )}

      <div className="mb-4">
        <SearchField
          id="expense_account_code"
          label={
            <>
              Account Code <Star />
            </>
          }
          placeholder="Select an account code"
          text={accountText}
          invalid={errors.has("account")}
          onText={(text) => {
            setAccountText(text);
            clearError("account");
            if (account && text.trim() !== account.name) setAccount(null);
          }}
          listFor={(text, how) => {
            const list = how === "click" ? accounts : searchAccounts(accounts, text);
            return list.length > 0 ? accountOptions(list, pickAccount) : null;
          }}
        />
      </div>

      <div className="flex gap-3">
        <button type="button" onClick={onCancel} className={OUTLINE_BUTTON}>
          <span>Cancel</span>
        </button>
        <button type="submit" disabled={sending} className={FILLED_BUTTON}>
          <span>Add</span>
        </button>
      </div>
    </form>
  );
}

/* ---------- the two dropdowns ---------- */

type Option = { key: string; content: ReactNode; className: string; pick?: () => void };

const ITEM = "cursor-pointer px-4 py-2 hover:bg-flask-gray-100";

function supplierOptions(matches: Supplier[], offerNew: string | null, pick: (s: Supplier) => void, offer: (name: string) => void): Option[] {
  const options: Option[] = matches.map((s, i) => ({
    key: s.id,
    // every row ruled off but the last contact (Flask: border-b, none before the "+ Add" row)
    className: `${ITEM} ${i < matches.length - 1 ? "border-b border-flask-gray-100" : ""}`,
    content: <div className="text-sm font-medium text-flask-gray-900">{s.name}</div>,
    pick: () => pick(s),
  }));
  if (offerNew) {
    options.push({
      key: "add-new",
      className: `${ITEM} border-t border-flask-gray-200`,
      content: <div className="text-flask-gray-600 hover:text-flask-gray-800">+ Add &apos;{offerNew}&apos; as a new contact</div>,
      pick: () => offer(offerNew),
    });
  }
  return options;
}

function noSupplierOptions(offerNew: string | null, offer: (name: string) => void): Option[] {
  const options: Option[] = [
    {
      key: "none",
      className: `px-4 py-2 text-flask-gray-600 ${offerNew ? "border-b border-flask-gray-100" : ""}`,
      content: <div className="text-sm">No Xero contact found</div>,
    },
  ];
  if (offerNew) {
    options.push({
      key: "add-new",
      className: ITEM,
      content: <div className="text-flask-gray-600 hover:text-flask-gray-800">+ Add &apos;{offerNew}&apos; as a new contact</div>,
      pick: () => offer(offerNew),
    });
  }
  return options;
}

function accountOptions(list: Account[], pick: (a: Account) => void): Option[] {
  return list.map((a, i) => ({
    key: a.id,
    className: `${ITEM} ${i < list.length - 1 ? "border-b border-flask-gray-100" : ""}`,
    content: (
      <>
        <div className="text-sm font-medium text-flask-gray-900">{a.name}</div>
        <div className="text-xs text-flask-gray-500">{a.code}</div>
      </>
    ),
    pick: () => pick(a),
  }));
}

/**
 * Flask's searchable dropdown field (`#expense_contact`, `#expense_account_code`): a text input with
 * a chevron that turns over while the list is open. A click lists everything; typing filters; a
 * focus with text filters; leaving closes it (after 200ms, as Flask does). ↑/↓ move through the
 * rows that can be picked, Enter picks the highlighted one or the first, Escape closes.
 */
function SearchField({
  id,
  label,
  placeholder,
  text,
  invalid,
  onText,
  listFor,
}: {
  id: string;
  label: ReactNode;
  placeholder: string;
  text: string;
  invalid: boolean;
  onText: (text: string) => void;
  /** The rows for `text`, or null for a closed list. */
  listFor: (text: string, how: "click" | "typed") => Option[] | null;
}) {
  const [options, setOptions] = useState<Option[] | null>(null);
  const [active, setActive] = useState(-1);
  const blurTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(blurTimer.current), []);

  const open = options !== null;
  const pickable = (options ?? []).filter((o) => o.pick);
  const show = (next: Option[] | null) => {
    setOptions(next);
    setActive(-1);
  };

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (!open || pickable.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (i + 1) % pickable.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (i <= 0 ? pickable.length - 1 : i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      pickable[active < 0 ? 0 : active].pick?.();
      show(null);
    } else if (e.key === "Escape") {
      e.preventDefault();
      show(null);
    }
  }

  const listId = `${id}_list`;
  const activeOption = active >= 0 ? pickable[active] : undefined;
  return (
    <>
      <label htmlFor={id} className={LABEL}>
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-required="true"
          aria-invalid={invalid || undefined}
          aria-activedescendant={activeOption ? `${listId}_${activeOption.key}` : undefined}
          autoComplete="off"
          placeholder={placeholder}
          value={text}
          onClick={() => show(listFor("", "click"))}
          onChange={(e) => {
            onText(e.target.value);
            show(listFor(e.target.value, "typed"));
          }}
          onFocus={() => {
            window.clearTimeout(blurTimer.current);
            if (text.trim()) show(listFor(text, "typed"));
          }}
          onBlur={() => {
            blurTimer.current = window.setTimeout(() => show(null), 200);
          }}
          onKeyDown={onKeyDown}
          className={`${FIELD} ${invalid ? "border-flask-red-500" : "border-flask-gray-300"} pl-3 pr-10 text-flask-gray-700 placeholder:text-flask-gray-700`}
        />
        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3">
          <svg
            className={`h-5 w-5 text-flask-gray-400 transition-transform duration-200 ease-in-out ${open ? "rotate-180" : ""}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
        {open ? (
          <div id={listId} role="listbox" className="absolute z-50 mt-1 max-h-60 w-full overflow-y-auto rounded-flask-lg border border-flask-gray-300 bg-flask-white shadow-flask-lg">
            {options.map((o) => {
              const highlighted = o === activeOption;
              return (
                <div
                  key={o.key}
                  id={`${listId}_${o.key}`}
                  role={o.pick ? "option" : "presentation"}
                  aria-selected={o.pick ? highlighted : undefined}
                  ref={(el) => {
                    if (el && highlighted) el.scrollIntoView({ block: "nearest", behavior: "smooth" });
                  }}
                  className={`${o.className} ${highlighted ? "bg-flask-gray-100" : ""}`}
                  onMouseDown={(e) => {
                    // keep the focus in the input, so its blur does not close the list first
                    e.preventDefault();
                    if (!o.pick) return;
                    o.pick();
                    show(null);
                  }}
                >
                  {o.content}
                </div>
              );
            })}
          </div>
        ) : null}
      </div>
    </>
  );
}

/* ---------- the receipt drop zone ---------- */

type Picked = { file: File; url: string };

function revoke(picked: Picked | null) {
  if (picked) URL.revokeObjectURL(picked.url);
}

const UPLOAD_ICON = "M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12";
const DONE_ICON = "M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z";

/**
 * Flask's `#uploadArea`: a dashed box to click or drop a receipt on, PDF / JPEG / PNG up to 10MB.
 * With a picture it shows the picture (borderless, 256 x 192); with a PDF it turns green and names
 * it. The expand button in its corner opens the picked file full screen.
 */
function ReceiptDrop({ picked, invalid, onFile }: { picked: Picked | null; invalid: boolean; onFile: (file: File | null) => void }) {
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [viewing, setViewing] = useState<ShownReceipt | null>(null);
  const file = picked?.file ?? null;
  const url = picked?.url ?? null;
  const kind = file ? receiptKind(file.type, file.name) : null;

  function take(files: File[], how: "picked" | "dropped") {
    if (files.length === 0) return; // the picker was cancelled: the file stays
    const problem = receiptProblem(files, how);
    if (problem) {
      toast(problem, "error");
      // Flask's picker clears what was there; a refused drop leaves it be
      if (how === "picked") onFile(null);
      return;
    }
    onFile(files[0]);
  }

  const isFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes("Files");

  let look: string;
  if (dragging) look = "border-2 border-dashed border-flask-blue-500 bg-flask-blue-50 p-6";
  else if (file && kind === "image") look = "border-0 bg-transparent p-0";
  else if (file) look = "border-2 border-dashed border-flask-upload-ok bg-flask-upload-ok-bg p-6";
  else look = `border-2 border-dashed ${invalid ? "border-flask-red-500" : "border-flask-gray-300"} bg-flask-gray-50 p-6 hover:bg-flask-gray-100`;

  return (
    <div className="mb-6">
      <span id="receipt_label" className={LABEL}>
        Receipt/Document <Star />
      </span>
      <div
        role="button"
        tabIndex={0}
        aria-labelledby="receipt_label"
        aria-describedby="receipt_hint"
        onClick={() => input.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            input.current?.click();
          }
        }}
        onDragEnter={(e) => {
          e.preventDefault();
          if (isFiles(e)) setDragging(true);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          if (isFiles(e)) {
            setDragging(true);
            e.dataTransfer.dropEffect = "copy";
          }
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          take(Array.from(e.dataTransfer.files), "dropped");
        }}
        className={`relative cursor-pointer overflow-hidden rounded-flask-md text-center transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-flask-teal ${look}`}
      >
        <button
          type="button"
          aria-label="Preview receipt"
          disabled={!file || !url}
          onClick={(e) => {
            e.stopPropagation();
            if (file && url && kind) setViewing({ url, kind, name: file.name });
          }}
          className={`absolute bottom-2 right-2 z-10 rounded-full bg-flask-white p-2 shadow-flask-sm ${
            file && url ? "cursor-pointer text-flask-gray-500 hover:text-flask-gray-500/80" : "cursor-not-allowed text-flask-gray-400 opacity-50"
          }`}
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="size-6 transition-colors" aria-hidden="true">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15"
            />
          </svg>
        </button>

        {file && kind === "image" && url && !dragging ? (
          <div className="m-0 p-0 leading-[0]">
            {/* eslint-disable-next-line @next/next/no-img-element -- an object URL of the picked file */}
            <img src={url} alt="Uploaded receipt" className="mx-auto h-48 w-64 max-w-full object-contain" />
            <span id="receipt_hint" className="sr-only">
              Click to change files
            </span>
          </div>
        ) : (
          <>
            <svg
              className={`mx-auto mb-4 h-12 w-12 ${file && !dragging ? "text-flask-upload-ok" : "text-flask-gray-400"}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              {file && !dragging ? (
                <path strokeLinecap="round" strokeLinejoin="round" d={DONE_ICON} />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d={UPLOAD_ICON} />
              )}
            </svg>
            {file && !dragging ? (
              <>
                <p className="text-sm font-medium text-flask-upload-ok [overflow-wrap:anywhere]">&quot;{uploadName(file.name)}&quot; Uploaded</p>
                <p id="receipt_hint" className="mt-1 text-xs text-flask-gray-500">
                  Click to change files
                </p>
              </>
            ) : (
              <>
                <p className="text-sm font-medium text-flask-gray-700">Click to upload or drag and drop</p>
                <p id="receipt_hint" className="mt-1 text-xs text-flask-gray-500">
                  PDF, JPEG, PNG (Max 10MB)
                </p>
              </>
            )}
          </>
        )}
        <input
          ref={input}
          type="file"
          className="hidden"
          accept=".pdf,.jpg,.jpeg,.png"
          data-testid="expense_files"
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => {
            take(Array.from(e.target.files ?? []), "picked");
            e.target.value = "";
          }}
        />
      </div>
      {viewing ? <ReceiptViewer receipt={viewing} onClose={() => setViewing(null)} /> : null}
    </div>
  );
}
