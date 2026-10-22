"use client";

/**
 * Editing a submitted report's details that move no balance (Wave 2i), from the Daily Report
 * (DailyReport.tsx): the difference reason and where the cash added came from, each a Part 14
 * modal with its own Save, and an expense line's description, supplier, account and receipt in a
 * Part 14 Drawer (480 on a computer, a full-screen sheet on a phone) - the Expenses stage's
 * pickers and receipt capture (ExpenseForm.tsx). The amount is never editable.
 *
 * Each save answers the whole Daily Report, which the page redraws from (`onSaved`), then a
 * toast. A report that has been to Xero says first that it will need publishing again. A refusal
 * shows the API's sentence inside the dialog, which stays open - never a false success. Fields
 * check themselves as typed (CLAUDE.md); the rules are lib/reportEdits.ts.
 */

import { useId, useRef, useState } from "react";

import { Button, Drawer, ErrorSummary, Field, Icon, InlineAlert, inputClass, Modal } from "@minty/shared/ui";

import { ReceiptField, SupplierPicker } from "@/components/closing/ExpenseForm";
import type { ViewerFile } from "@/components/closing/ReceiptViewer";
import { ApiError, pettyCashBlob, pettyCashFetch, type ApiRequest } from "@/lib/apiClient";
import { differenceText, reasonHelper } from "@/lib/cashCount";
import { differenceOf } from "@/lib/close";
import { accountLabel, receiptKind, receiptProblem, remarksHelper, remarksProblem, type ExpenseLine, type Supplier } from "@/lib/expenses";
import { money } from "@/lib/money";
import { expenseTitle, type DailyReport } from "@/lib/report";
import {
  lineChanges,
  lineEditForm,
  lineSupplierProblem,
  reasonEditProblem,
  reasonNeeded,
  savedMessage,
  withdrawalOf,
  xeroNotice,
  type Withdrawal,
} from "@/lib/reportEdits";

const NOT_SAVED = "We couldn't save the change. Check your connection, then try again.";

type Saved = (report: DailyReport, message: string) => void;

/**
 * One save at a time (a ref: a double press lands twice before React re-renders); the answer is
 * the Daily Report. A 401 has already gone back through the hand-off.
 */
function useSave(path: string, onSaved: Saved) {
  const inFlight = useRef(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function save(init: ApiRequest, message: string) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setProblem(null);
    try {
      onSaved(await pettyCashFetch<DailyReport>(path, init), message);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return;
      inFlight.current = false;
      setBusy(false);
      setProblem(err instanceof ApiError ? err.message : NOT_SAVED);
    }
  }

  return { busy, problem, save };
}

const reportPath = (report: DailyReport) => `/reports/${encodeURIComponent(report.report_id)}`;

/** The top of a dialog: the Xero notice before a save, then a refusal's sentence. */
function Notices({ report, problem }: { report: DailyReport; problem: string | null }) {
  const notice = xeroNotice(report);
  if (!notice && !problem) return null;
  return (
    <div className="flex flex-col gap-3">
      {notice ? (
        <InlineAlert tone="warning" title={notice.title}>
          {notice.body}
        </InlineAlert>
      ) : null}
      {problem ? <InlineAlert tone="danger">{problem}</InlineAlert> : null}
    </div>
  );
}

function SaveFooter({ form, busy, onCancel }: { form: string; busy: boolean; onCancel: () => void }) {
  return (
    <>
      <Button kind="secondary" onClick={onCancel} disabled={busy}>
        Cancel
      </Button>
      <Button type="submit" form={form} kind="primary" processing={busy} processingLabel="Saving…">
        Save
      </Button>
    </>
  );
}

/** The difference reason (`PUT difference-reason`): it can't be emptied while the cash was short or over. */
export function EditReasonDialog({ report, onCancel, onSaved }: { report: DailyReport; onCancel: () => void; onSaved: Saved }) {
  const formId = useId().replace(/:/g, "");
  const field = useRef<HTMLTextAreaElement>(null);
  const saved = report.cash.difference.reason ?? "";
  const needed = reasonNeeded(report);
  const [text, setText] = useState(saved);
  const [submitted, setSubmitted] = useState(false);
  const { busy, problem: refusal, save } = useSave(`${reportPath(report)}/difference-reason`, onSaved);
  const problem = reasonEditProblem(text, { needed, changed: text !== saved, submitted });

  function submit() {
    if (busy) return;
    setSubmitted(true);
    if (reasonEditProblem(text, { needed, changed: true, submitted: true })) {
      field.current?.focus();
      return;
    }
    // Nothing changed: nothing to send.
    if (text.trim() === saved.trim()) return onCancel();
    void save({ method: "PUT", body: { reason: text.trim() } }, savedMessage("reason"));
  }

  return (
    <Modal
      open
      onRequestClose={() => !busy && onCancel()}
      initialFocus={field}
      title="Edit the reason"
      description={`Cash was ${differenceText(differenceOf(report.cash.difference.amount), report.currency_code)}.`}
      footer={<SaveFooter form={formId} busy={busy} onCancel={onCancel} />}
    >
      <form
        id={formId}
        noValidate
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <Notices report={report} problem={refusal} />
        <Field label="Reason for the difference" required={needed !== null} error={problem} helper={reasonHelper(text)}>
          {(a11y) => (
            <textarea
              {...a11y}
              ref={field}
              name="reason"
              rows={3}
              value={text}
              disabled={busy}
              placeholder="For example: change given twice by mistake"
              onChange={(e) => setText(e.target.value)}
              className={`${inputClass(Boolean(problem), { multiline: true })} max-h-60 resize-y`}
            />
          )}
        </Field>
      </form>
    </Modal>
  );
}

const SOURCES: readonly (readonly [Withdrawal, string])[] = [
  ["company", "Company bank"],
  ["personal", "Personal"],
];

/** Where the cash added came from (`PUT withdrawal`): the amount stays. */
export function EditWithdrawalDialog({ report, onCancel, onSaved }: { report: DailyReport; onCancel: () => void; onSaved: Saved }) {
  const formId = useId().replace(/:/g, "");
  const saved = withdrawalOf(report);
  const [source, setSource] = useState<Withdrawal>(saved);
  const { busy, problem, save } = useSave(`${reportPath(report)}/withdrawal`, onSaved);

  function submit() {
    if (busy) return;
    if (source === saved) return onCancel();
    void save({ method: "PUT", body: { withdrawal_type: source } }, savedMessage("withdrawal"));
  }

  return (
    <Modal
      open
      onRequestClose={() => !busy && onCancel()}
      title="Where the cash came from"
      description={`${money(report.cash.cash_addition, report.currency_code)} was added to the drawer. The amount stays as it is.`}
      footer={<SaveFooter form={formId} busy={busy} onCancel={onCancel} />}
    >
      <form
        id={formId}
        noValidate
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <Notices report={report} problem={problem} />
        <fieldset className="flex min-w-0 flex-col gap-1.5">
          <legend className="mb-1.5 text-label text-text-secondary">Where the cash came from</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {SOURCES.map(([value, label]) => (
              <label
                key={value}
                className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-3 text-body-m text-text-primary has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-border-focus ${
                  source === value ? "border-2 border-border-focus bg-state-selected" : "border border-border-default hover:bg-state-hover"
                }`}
              >
                <input
                  type="radio"
                  name="withdrawal"
                  value={value}
                  checked={source === value}
                  disabled={busy}
                  onChange={() => setSource(value)}
                  className="size-5 shrink-0 accent-action-primary"
                />
                {label}
              </label>
            ))}
          </div>
        </fieldset>
      </form>
    </Modal>
  );
}

/**
 * An expense line's details (`PATCH expense-lines/<id>`, multipart, each field only when it
 * changed): the receipt (a new one replaces the saved one), the supplier (the read's synced Xero
 * suppliers; no new one here), the account (a new one renames the line to it) and the
 * description. The amount is a fact. Closing with changes asks first, inline.
 */
export function EditLineDrawer({
  report,
  line,
  onCancel,
  onSaved,
  onView,
}: {
  report: DailyReport;
  line: ExpenseLine;
  onCancel: () => void;
  onSaved: Saved;
  onView: (file: ViewerFile) => void;
}) {
  const formId = useId().replace(/:/g, "");
  const ids = { receipt: `${formId}-receipt`, supplier: `${formId}-supplier`, remarks: `${formId}-remarks` };
  const code = report.currency_code;
  const options = report.options ?? { suppliers: [], accounts: [] };
  // The line's own account stays choosable even when it is no longer switched on for Petty Cash.
  const accounts = line.account && !options.accounts.some((a) => a.id === line.account?.id) ? [line.account, ...options.accounts] : options.accounts;

  const [file, setFile] = useState<File | null>(null);
  const [fileProblem, setFileProblem] = useState<string | null>(null);
  const [query, setQuery] = useState(line.supplier?.name ?? "");
  const [supplier, setSupplier] = useState<Supplier | null>(line.supplier);
  const [accountId, setAccountId] = useState(line.account?.id ?? "");
  const [remarks, setRemarks] = useState(line.remarks ?? "");
  const [touched, setTouched] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [askDiscard, setAskDiscard] = useState(false);
  const top = useRef<HTMLDivElement>(null);
  const { busy, problem: refusal, save } = useSave(`${reportPath(report)}/expense-lines/${encodeURIComponent(line.id)}`, onSaved);

  const required = Boolean(line.supplier);
  const problems = {
    receipt: fileProblem,
    supplier: lineSupplierProblem(query, supplier, { required, touched, submitted }),
    remarks: remarksProblem(remarks),
  };
  const summary = submitted
    ? (Object.keys(ids) as (keyof typeof ids)[]).flatMap((key) => (problems[key] ? [{ fieldId: ids[key], message: problems[key] as string }] : []))
    : [];
  const changes = lineChanges(line, { remarks, supplier, accountId, receipt: file });
  const dirty = Object.keys(changes).length > 0 || query !== (line.supplier?.name ?? "");

  function requestClose() {
    if (busy) return;
    if (dirty) setAskDiscard(true);
    else onCancel();
  }

  function submit() {
    if (busy) return;
    setAskDiscard(false);
    const all = { ...problems, supplier: lineSupplierProblem(query, supplier, { required, touched: true, submitted: true }) };
    const failing = (Object.keys(ids) as (keyof typeof ids)[]).filter((key) => all[key]);
    if (failing.length) {
      setSubmitted(true);
      setTouched(true);
      setAttempt((n) => n + 1);
      // One problem: its field takes focus. Two or more: the summary does (ErrorSummary).
      if (failing.length === 1) document.getElementById(ids[failing[0]])?.focus();
      return;
    }
    // Nothing changed: nothing to send.
    if (Object.keys(changes).length === 0) return onCancel();
    void save({ method: "PATCH", form: lineEditForm(changes) }, savedMessage("line")).then(() => top.current?.scrollIntoView({ block: "start" }));
  }

  return (
    <Drawer
      open
      onRequestClose={requestClose}
      title="Edit expense"
      description={`${expenseTitle(line)} · ${money(line.amount, code)}`}
      footer={
        <>
          <Button kind="ghost" onClick={requestClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" form={formId} kind="primary" processing={busy} processingLabel="Saving…">
            Save
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
          submit();
        }}
      >
        <div ref={top} className="flex flex-col gap-3 empty:hidden">
          {askDiscard ? (
            <InlineAlert
              tone="warning"
              title="These changes aren't saved yet"
              action={
                <Button kind="link" onClick={onCancel}>
                  Discard them
                </Button>
              }
            >
              Save them with Save, or discard what you changed.
            </InlineAlert>
          ) : null}
          <Notices report={report} problem={refusal} />
          <ErrorSummary items={summary} attempt={attempt} />
        </div>

        <div className="flex min-w-0 flex-col gap-1.5">
          <p className="text-label text-text-secondary">Amount</p>
          <p className="break-all text-body-m font-semibold text-text-primary" translate="no">
            {money(line.amount, code)}
          </p>
          <p className="text-caption text-text-muted">The amount can&apos;t be changed here.</p>
        </div>

        {line.receipts.length ? (
          <div className="flex min-w-0 flex-col gap-1.5">
            <p className="text-label text-text-secondary">{file ? "Saved receipt, replaced when you save" : "Saved receipt"}</p>
            <ul className="flex flex-col gap-2">
              {line.receipts.map((receipt) => (
                <li key={receipt.id}>
                  <button
                    type="button"
                    onClick={() =>
                      onView({
                        name: receipt.name,
                        mime: receipt.mime_type,
                        source: () => pettyCashBlob(`/expense-lines/${encodeURIComponent(line.id)}/receipts/${encodeURIComponent(receipt.id)}`),
                      })
                    }
                    aria-label={`View receipt ${receipt.name}`}
                    className="flex min-h-11 w-full min-w-0 cursor-pointer items-center gap-3 rounded-lg border border-border-default bg-surface-card px-3 py-2 text-left hover:bg-state-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus"
                  >
                    <Icon name={receiptKind(receipt.mime_type) === "pdf" ? "picture_as_pdf" : "image"} className="text-text-secondary" />
                    <span className="min-w-0 flex-1 truncate text-body-m text-text-primary">{receipt.name}</span>
                    <span className="shrink-0 text-body-s font-medium text-text-link">View</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <ReceiptField
          id={ids.receipt}
          file={file}
          problem={problems.receipt}
          disabled={busy}
          required={false}
          prompt={line.receipts.length ? "Replace the receipt" : "Add the receipt"}
          note={line.receipts.length ? "Optional. A new receipt replaces the saved one." : "Optional. One receipt for each expense."}
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
          suppliers={options.suppliers}
          onSuppliers={() => undefined}
          canCreate={false}
          required={required}
          query={query}
          chosen={supplier}
          problem={problems.supplier}
          disabled={busy}
          onQuery={(text) => {
            setQuery(text);
            setSupplier(supplier && text === supplier.name ? supplier : null);
          }}
          onChoose={(s) => {
            setSupplier(s);
            setQuery(s.name);
          }}
          onLeave={() => setTouched(true)}
        />

        <Field label="Account" required={Boolean(line.account)} helper="Choosing another account renames the expense to it.">
          {(a11y) => (
            <div className="relative">
              <select
                {...a11y}
                name="account_id"
                value={accountId}
                disabled={busy}
                onChange={(e) => setAccountId(e.target.value)}
                className={`${inputClass(false)} cursor-pointer appearance-none pr-10`}
              >
                {/* A line saved with an account keeps one: there is no empty choice. */}
                {line.account ? null : <option value="">Choose an account</option>}
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
              disabled={busy}
              onChange={(e) => setRemarks(e.target.value)}
              className={inputClass(Boolean(problems.remarks))}
            />
          )}
        </Field>
      </form>
    </Drawer>
  );
}
