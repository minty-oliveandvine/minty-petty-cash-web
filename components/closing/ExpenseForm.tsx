"use client";

/**
 * Add expense (Part 15.15c individual entry; 15.3c document-supported form): a 480 Drawer on a
 * computer, a full-screen sheet on a phone (Part 14 Drawer). The receipt comes first - Part 15.13
 * "Mobile: Camera capture first" - then the facts in the order a receipt shows them: supplier,
 * amount; then the account it is recorded under, and the optional description last.
 *
 * Every field checks itself as it is typed (CLAUDE.md, Validation while typing): the receipt the
 * moment it is picked; the description over its limit at once; a supplier or an amount that is
 * only "not finished yet" when the field is left; an empty required field only after a refused
 * Add expense, which also shows the error summary for two or more problems (one problem takes
 * focus instead). The API checks everything again, and its sentence shows at the top.
 *
 * Rendered only while open, so every opening starts empty. Closing with something entered asks
 * first, inline (Part 14 Drawer: `onRequestClose` may refuse).
 */

import { useCallback, useEffect, useId, useRef, useState, type ChangeEvent, type DragEvent, type KeyboardEvent } from "react";

import { Button, buttonClass, Drawer, ErrorSummary, Field, Icon, InlineAlert, inputClass } from "@minty/shared/ui";

import { AmountInput, refused } from "@/components/closing/Stage";
import type { ViewerFile } from "@/components/closing/ReceiptViewer";
import { ApiError, pettyCashFetch } from "@/lib/apiClient";
import { parseMoney } from "@/lib/currencyInput";
import {
  accountLabel,
  accountProblem,
  amountProblem,
  exactSupplier,
  fileSize,
  missingReceipt,
  newSupplierProblem,
  offersNewSupplier,
  RECEIPT_ACCEPT,
  RECEIPT_LIMITS,
  receiptKind,
  receiptProblem,
  remarksHelper,
  remarksProblem,
  supplierMatches,
  supplierProblem,
  withSupplier,
  type ExpenseAccount,
  type ExpenseAdded,
  type Supplier,
} from "@/lib/expenses";

const NOT_ADDED = "We couldn't add this expense. Check your connection, then try again.";
const SUPPLIER_NOT_ADDED = "We couldn't add this supplier. Check your connection, then try again.";

export type ExpenseFormProps = {
  code: string | null;
  day: string;
  suppliers: Supplier[];
  /** A supplier added here joins the page's list (it is in Xero now). */
  onSuppliers: (suppliers: Supplier[]) => void;
  accounts: ExpenseAccount[];
  canCreateSupplier: boolean;
  onAdded: (added: ExpenseAdded) => void;
  onClose: () => void;
  onView: (file: ViewerFile) => void;
  /** Where a refusal that names another place goes (Stage.tsx `refused`). */
  route: { push: (href: string) => void; entityId: string; entityName: string; home: string };
};

export default function ExpenseForm({
  code,
  day,
  suppliers,
  onSuppliers,
  accounts,
  canCreateSupplier,
  onAdded,
  onClose,
  onView,
  route,
}: ExpenseFormProps) {
  const formId = useId();
  const ids = {
    receipt: `${formId}-receipt`.replace(/:/g, ""),
    supplier: `${formId}-supplier`.replace(/:/g, ""),
    amount: `${formId}-amount`.replace(/:/g, ""),
    account: `${formId}-account`.replace(/:/g, ""),
    remarks: `${formId}-remarks`.replace(/:/g, ""),
  };

  const [file, setFile] = useState<File | null>(null);
  const [fileProblem, setFileProblem] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [amount, setAmount] = useState("");
  const [accountId, setAccountId] = useState("");
  const [remarks, setRemarks] = useState("");
  const [touched, setTouched] = useState({ supplier: false, amount: false });
  const [submitted, setSubmitted] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [adding, setAdding] = useState(false);
  const [serverProblem, setServerProblem] = useState<string | null>(null);
  const [askDiscard, setAskDiscard] = useState(false);
  const top = useRef<HTMLDivElement>(null);

  const problems = {
    receipt: fileProblem ?? missingReceipt(file, submitted),
    supplier: supplierProblem(query, supplier, { touched: touched.supplier, submitted, canCreate: canCreateSupplier }),
    amount: amountProblem(amount, { touched: touched.amount, submitted, code }),
    account: accountProblem(accountId, submitted),
    remarks: remarksProblem(remarks),
  };
  const summary = submitted
    ? (Object.keys(ids) as (keyof typeof ids)[]).flatMap((key) => (problems[key] ? [{ fieldId: ids[key], message: problems[key] as string }] : []))
    : [];
  const dirty = Boolean(file || query.trim() || amount || accountId || remarks.trim());

  function requestClose() {
    if (adding) return;
    if (dirty) setAskDiscard(true);
    else onClose();
  }

  async function add() {
    if (adding) return;
    setServerProblem(null);
    setAskDiscard(false);
    // Every check, as if every field had been left and the submit refused.
    const all = {
      receipt: fileProblem ?? missingReceipt(file, true),
      supplier: supplierProblem(query, supplier, { touched: true, submitted: true, canCreate: canCreateSupplier }),
      amount: amountProblem(amount, { touched: true, submitted: true, code }),
      account: accountProblem(accountId, true),
      remarks: remarksProblem(remarks),
    };
    const failing = (Object.keys(ids) as (keyof typeof ids)[]).filter((key) => all[key]);
    if (failing.length) {
      setSubmitted(true);
      setTouched({ supplier: true, amount: true });
      setAttempt((n) => n + 1);
      // One problem: its field takes focus. Two or more: the summary does (ErrorSummary).
      if (failing.length === 1) document.getElementById(ids[failing[0]])?.focus();
      return;
    }
    const body = new FormData();
    body.set("transaction_date", day);
    body.set("amount", String(parseMoney(amount)));
    body.set("remarks", remarks.trim());
    body.set("supplier_id", supplier?.id ?? "");
    body.set("account_id", accountId);
    body.set("receipt", file as File, (file as File).name);
    setAdding(true);
    try {
      const added = await pettyCashFetch<ExpenseAdded>("/reports/expenses/lines", { method: "POST", form: body });
      onAdded(added);
    } catch (err) {
      // No draft for the day any more: to Addition to Drawer, which says why.
      const message = err instanceof ApiError ? refused(err, { here: "expenses", day, ...route }) : NOT_ADDED;
      if (message === undefined) return;
      setAdding(false);
      setServerProblem(message);
      top.current?.scrollIntoView({ block: "start" });
    }
  }

  return (
    <Drawer
      open
      onRequestClose={requestClose}
      title="Add expense"
      description="Fill it in from the receipt."
      footer={
        <>
          <Button kind="ghost" onClick={requestClose} disabled={adding}>
            Cancel
          </Button>
          <Button type="submit" form={formId} kind="primary" processing={adding} processingLabel="Adding…">
            Add expense
          </Button>
        </>
      }
    >
      <form
        id={formId}
        noValidate
        className="flex flex-col gap-5"
        onSubmit={(e) => {
          e.preventDefault();
          void add();
        }}
      >
        <div ref={top} className="flex flex-col gap-3 empty:hidden">
          {askDiscard ? (
            <InlineAlert
              tone="warning"
              title="This expense isn't added yet"
              action={
                <Button kind="link" onClick={onClose}>
                  Discard it
                </Button>
              }
            >
              Add it with Add expense, or discard what you entered.
            </InlineAlert>
          ) : null}
          {serverProblem ? <InlineAlert tone="danger">{serverProblem}</InlineAlert> : null}
          <ErrorSummary items={summary} attempt={attempt} />
        </div>

        <ReceiptField
          id={ids.receipt}
          file={file}
          problem={problems.receipt}
          disabled={adding}
          onPick={(picked) => {
            const why = receiptProblem(picked);
            setFileProblem(why);
            setFile(why ? null : picked);
          }}
          onRemove={() => {
            setFile(null);
            setFileProblem(null);
          }}
          onView={() => file && onView({ name: file.name, mime: file.type, source: file })}
        />

        <SupplierPicker
          id={ids.supplier}
          suppliers={suppliers}
          onSuppliers={onSuppliers}
          canCreate={canCreateSupplier}
          query={query}
          chosen={supplier}
          problem={problems.supplier}
          disabled={adding}
          onQuery={(text) => {
            setQuery(text);
            setSupplier(supplier && text === supplier.name ? supplier : null);
          }}
          onChoose={(s) => {
            setSupplier(s);
            setQuery(s.name);
          }}
          onLeave={() => setTouched((t) => ({ ...t, supplier: true }))}
        />

        <AmountInput
          id={ids.amount}
          label="Amount"
          name="amount"
          code={code}
          value={amount}
          onChange={setAmount}
          onBlur={() => setTouched((t) => ({ ...t, amount: true }))}
          required
          error={problems.amount}
          disabled={adding}
        />

        <Field id={ids.account} label="Account" required error={problems.account} helper="Where Minty records this expense in Xero.">
          {(a11y) => (
            <div className="relative">
              <select
                {...a11y}
                name="account_id"
                value={accountId}
                disabled={adding}
                onChange={(e) => setAccountId(e.target.value)}
                className={`${inputClass(Boolean(problems.account))} cursor-pointer appearance-none pr-10`}
              >
                <option value="">Choose an account</option>
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {accountLabel(account)}
                  </option>
                ))}
              </select>
              <Icon name="expand_more" className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-text-secondary" />
            </div>
          )}
        </Field>

        <Field id={ids.remarks} label="Description" error={problems.remarks} helper={remarksHelper(remarks)}>
          {(a11y) => (
            <input
              {...a11y}
              name="remarks"
              type="text"
              autoComplete="off"
              placeholder="For example: printer paper"
              value={remarks}
              disabled={adding}
              onChange={(e) => setRemarks(e.target.value)}
              className={inputClass(Boolean(problems.remarks))}
            />
          )}
        </Field>
      </form>
    </Drawer>
  );
}

/**
 * The receipt: Part 14 Camera capture while empty (Take photo on a phone - the camera, through
 * `capture` - and Choose file everywhere, with the limits shown before anything is picked; a file
 * can also be dropped on it), then a File card with View and Remove. The file inputs themselves
 * are the controls (visually hidden, inside their button-looking labels), so they carry the
 * field's name, `aria-required` and the problem.
 */
function ReceiptField({
  id,
  file,
  problem,
  disabled,
  onPick,
  onRemove,
  onView,
}: {
  id: string;
  file: File | null;
  problem: string | null;
  disabled: boolean;
  onPick: (file: File) => void;
  onRemove: () => void;
  onView: () => void;
}) {
  const legendId = `${id}-legend`;
  const noteId = `${id}-note`;
  // A photo's thumbnail from an object URL that lives exactly as long as its <img> (React 19 ref cleanup).
  const thumb = useCallback(
    (img: HTMLImageElement | null) => {
      if (!img || !file) return;
      const url = URL.createObjectURL(file);
      img.src = url;
      return () => URL.revokeObjectURL(url);
    },
    [file],
  );

  const picked = (e: ChangeEvent<HTMLInputElement>) => {
    const chosen = e.target.files?.[0];
    e.target.value = "";
    if (chosen) onPick(chosen);
  };
  const dropped = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const chosen = e.dataTransfer.files?.[0];
    if (chosen && !disabled) onPick(chosen);
  };
  const control = {
    type: "file" as const,
    accept: RECEIPT_ACCEPT,
    className: "sr-only",
    disabled,
    onChange: picked,
    "aria-required": true as const,
    "aria-describedby": noteId,
    ...(problem ? { "aria-invalid": true as const } : {}),
  };
  const labelClass = `${buttonClass("secondary")} w-full sm:w-auto has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-border-focus${
    disabled ? " pointer-events-none opacity-60" : ""
  }`;

  return (
    <div role="group" aria-labelledby={legendId} className="flex min-w-0 flex-col gap-1.5">
      <p id={legendId} className="text-label text-text-secondary">
        Receipt
        <span className="text-action-danger" aria-hidden>
          {" *"}
        </span>
        <span className="sr-only"> (required)</span>
      </p>
      {file ? (
        // Part 14 File card: thumbnail, name (truncated at the end), size and type, View and Remove.
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-border-default bg-surface-card p-2">
          <span className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-md bg-surface-sunk text-text-secondary">
            {receiptKind(file.type) === "image" ? (
              // eslint-disable-next-line @next/next/no-img-element -- an object URL; next/image cannot optimise it
              <img ref={thumb} alt="Receipt photo" className="size-12 object-cover" />
            ) : (
              <Icon name={receiptKind(file.type) === "pdf" ? "picture_as_pdf" : "description"} size="lg" />
            )}
          </span>
          <div className="min-w-0 flex-1 basis-32">
            <p className="truncate text-body-m font-medium text-text-primary" title={file.name}>
              {file.name}
            </p>
            <p className="text-caption text-text-muted">
              {fileSize(file.size)} · {receiptKind(file.type) === "pdf" ? "PDF" : "Photo"}
            </p>
          </div>
          <div className="flex shrink-0 gap-1">
            <Button kind="ghost" onClick={onView} disabled={disabled} aria-label={`View ${file.name}`}>
              View
            </Button>
            <Button id={id} kind="ghost" onClick={onRemove} disabled={disabled} aria-label={`Remove ${file.name}`}>
              Remove
            </Button>
          </div>
        </div>
      ) : (
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={dropped}
          className={`flex flex-col items-center gap-3 rounded-lg border-2 border-dashed bg-surface-sunk px-4 py-5 text-center ${
            problem ? "border-action-danger" : "border-border-default"
          }`}
        >
          <Icon name="receipt_long" size="lg" className="text-text-secondary" />
          <div className="flex flex-col gap-0.5">
            <p className="text-body-m font-semibold text-text-primary">Add the receipt</p>
            <p className="text-body-s text-text-secondary">Keep the total and the date in view. {RECEIPT_LIMITS}</p>
          </div>
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            {/* The camera, on a phone only (Part 14 Camera capture: on a computer, Choose file). */}
            <label className={`${labelClass} sm:hidden`}>
              <input {...control} capture="environment" aria-labelledby={`${legendId} ${id}-camera`} />
              <Icon name="photo_camera" />
              <span id={`${id}-camera`}>Take photo</span>
            </label>
            <label className={labelClass}>
              <input {...control} id={id} aria-labelledby={`${legendId} ${id}-choose`} />
              <Icon name="upload_file" />
              <span id={`${id}-choose`}>Choose file</span>
            </label>
          </div>
        </div>
      )}
      <p id={noteId} className={`text-caption ${problem ? "text-status-danger-ink" : "text-text-muted"}`} {...(problem ? { role: "alert" } : {})}>
        {problem ?? "One receipt for each expense."}
      </p>
    </div>
  );
}

/**
 * Part 14 Supplier picker: an ARIA combobox over the company's synced Xero suppliers, A to Z,
 * narrowed as it is typed (name, trimmed, any case), with the result count announced and
 * 'Add "…" as a new supplier' last when no supplier has that name and the person may add one.
 * Adding is never automatic: it opens the New supplier panel, and only Add supplier creates it
 * in Xero (`POST /suppliers`). The list is in the flow (never clipped by the sheet), options 52
 * tall; ↑ ↓ move, Enter chooses, Escape closes the list (and only the list).
 */
function SupplierPicker({
  id,
  suppliers,
  onSuppliers,
  canCreate,
  query,
  chosen,
  problem,
  disabled,
  onQuery,
  onChoose,
  onLeave,
}: {
  id: string;
  suppliers: Supplier[];
  onSuppliers: (suppliers: Supplier[]) => void;
  canCreate: boolean;
  query: string;
  chosen: Supplier | null;
  problem: string | null;
  disabled: boolean;
  onQuery: (text: string) => void;
  onChoose: (supplier: Supplier) => void;
  onLeave: () => void;
}) {
  const listId = `${id}-list`;
  const input = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [newName, setNewName] = useState<string | null>(null);
  const [announce, setAnnounce] = useState("");

  const matches = supplierMatches(suppliers, query);
  const offerNew = offersNewSupplier(suppliers, query, canCreate);
  const options = matches.length + (offerNew ? 1 : 0);

  // Escape closes the list first: the Drawer listens on `document` in the capture phase, so this
  // listens on `window`, which runs before it.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      setOpen(false);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open]);

  function choose(s: Supplier) {
    onChoose(s);
    setOpen(false);
    setActive(-1);
  }

  function pick(index: number) {
    if (index < matches.length) choose(matches[index]);
    else if (offerNew) {
      setOpen(false);
      setNewName(query.trim());
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) setOpen(true);
      if (options === 0) return;
      setActive((i) => (e.key === "ArrowDown" ? (i + 1) % options : i <= 0 ? options - 1 : i - 1));
    } else if (e.key === "Enter" && open && active >= 0) {
      // Enter chooses the highlighted option; with none highlighted it submits the form.
      e.preventDefault();
      pick(active);
    }
  }

  const status = !open
    ? ""
    : matches.length
      ? `${matches.length} ${matches.length === 1 ? "supplier" : "suppliers"} found.`
      : offerNew
        ? `No supplier is called ${query.trim()}. You can add it as a new supplier.`
        : "No supplier matches.";

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <Field
        id={id}
        label="Supplier"
        required
        // While the New supplier panel is open, the panel is the answer to "not a supplier yet".
        error={newName === null ? problem : undefined}
        helper={chosen ? undefined : "Search your Xero suppliers by name."}
      >
        {(a11y) => (
          <div className="flex min-w-0 flex-col gap-1">
            <div className="relative">
              <input
                {...a11y}
                ref={input}
                name="supplier"
                type="text"
                role="combobox"
                aria-autocomplete="list"
                aria-expanded={open}
                aria-controls={listId}
                aria-activedescendant={open && active >= 0 ? `${listId}-${active}` : undefined}
                autoComplete="off"
                placeholder="Start typing a name"
                value={query}
                disabled={disabled}
                onChange={(e) => {
                  onQuery(e.target.value);
                  setOpen(true);
                  setActive(-1);
                  setNewName(null);
                }}
                onFocus={() => setOpen(true)}
                onClick={() => setOpen(true)}
                onBlur={() => {
                  setOpen(false);
                  setActive(-1);
                  // A name typed in full is that supplier - matching, not creating.
                  const same = chosen ? null : exactSupplier(suppliers, query);
                  if (same) onChoose(same);
                  onLeave();
                }}
                onKeyDown={onKeyDown}
                className={`${inputClass(Boolean(problem))} pr-10`}
              />
              <Icon name="search" className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-text-secondary" />
            </div>
            {open ? (
              <ul
                id={listId}
                role="listbox"
                aria-label="Suppliers"
                className="max-h-[264px] overflow-y-auto rounded-lg border border-border-default bg-surface-raised py-1 shadow-modal"
              >
                {matches.map((s, i) => (
                  <li
                    key={s.id}
                    id={`${listId}-${i}`}
                    role="option"
                    aria-selected={chosen?.id === s.id}
                    // Keep the focus in the field, so choosing never blurs it first.
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => choose(s)}
                    className={`flex min-h-[52px] cursor-pointer items-center gap-2 px-3 text-body-m text-text-primary hover:bg-state-hover ${
                      i === active ? "bg-state-selected" : ""
                    }`}
                  >
                    <span className="min-w-0 flex-1 break-words">{s.name}</span>
                    {chosen?.id === s.id ? <Icon name="check" className="text-text-link" /> : null}
                  </li>
                ))}
                {offerNew ? (
                  <li
                    id={`${listId}-${matches.length}`}
                    role="option"
                    aria-selected={false}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => pick(matches.length)}
                    className={`flex min-h-[52px] cursor-pointer items-center gap-2 px-3 text-body-m text-text-link hover:bg-state-hover ${
                      matches.length ? "border-t border-border-subtle" : ""
                    } ${active === matches.length ? "bg-state-selected" : ""}`}
                  >
                    <Icon name="add" />
                    <span className="min-w-0 flex-1 break-words">Add &ldquo;{query.trim()}&rdquo; as a new supplier</span>
                  </li>
                ) : null}
                {options === 0 ? (
                  <li role="presentation" className="px-3 py-3 text-body-m text-text-secondary">
                    {suppliers.length ? "No supplier matches that name." : "No suppliers are synced from Xero yet."}
                  </li>
                ) : null}
              </ul>
            ) : null}
            <p className="sr-only" aria-live="polite">
              {status || announce}
            </p>
          </div>
        )}
      </Field>
      {newName !== null ? (
        <NewSupplier
          initial={newName}
          suppliers={suppliers}
          onCancel={() => {
            setNewName(null);
            input.current?.focus();
          }}
          onAdded={(added) => {
            onSuppliers(withSupplier(suppliers, added));
            onChoose(added);
            setNewName(null);
            setAnnounce(`${added.name} is added as a supplier.`);
            input.current?.focus();
          }}
        />
      ) : null}
    </div>
  );
}

/** The New supplier panel: its name (checked as typed, duplicates refused), then Add supplier. */
function NewSupplier({
  initial,
  suppliers,
  onCancel,
  onAdded,
}: {
  initial: string;
  suppliers: Supplier[];
  onCancel: () => void;
  onAdded: (supplier: Supplier) => void;
}) {
  const titleId = useId();
  const field = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(initial);
  const [attempted, setAttempted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [serverProblem, setServerProblem] = useState<string | null>(null);
  const problem = newSupplierProblem(name, suppliers, attempted);

  useEffect(() => {
    field.current?.focus();
  }, []);

  async function create() {
    if (saving) return;
    setAttempted(true);
    setServerProblem(null);
    if (newSupplierProblem(name, suppliers, true)) {
      field.current?.focus();
      return;
    }
    setSaving(true);
    try {
      onAdded(await pettyCashFetch<Supplier>("/suppliers", { method: "POST", json: { name: name.trim() } }));
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return;
      setSaving(false);
      setServerProblem(err instanceof ApiError ? err.message : SUPPLIER_NOT_ADDED);
    }
  }

  return (
    <div role="group" aria-labelledby={titleId} className="flex min-w-0 flex-col gap-3 rounded-lg border border-border-default bg-surface-card p-4">
      <h3 id={titleId} className="text-title-m text-text-primary">
        New supplier
      </h3>
      <Field label="Supplier's name" required error={problem} helper="It's added to your Xero contacts, so you can choose it next time.">
        {(a11y) => (
          <input
            {...a11y}
            ref={field}
            type="text"
            autoComplete="off"
            value={name}
            disabled={saving}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              // Enter here adds the supplier, never the expense.
              if (e.key === "Enter") {
                e.preventDefault();
                void create();
              }
            }}
            className={inputClass(Boolean(problem))}
          />
        )}
      </Field>
      {serverProblem ? <InlineAlert tone="danger">{serverProblem}</InlineAlert> : null}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button kind="ghost" onClick={onCancel} disabled={saving} className="w-full sm:w-auto">
          Cancel
        </Button>
        <Button kind="secondary" onClick={() => void create()} processing={saving} processingLabel="Adding…" className="w-full sm:w-auto">
          Add supplier
        </Button>
      </div>
    </div>
  );
}
