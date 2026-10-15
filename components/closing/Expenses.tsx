"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { Button, EmptyState, Icon, InlineAlert, Modal } from "@minty/shared/ui";

import type { ViewerFile } from "@/components/closing/ReceiptViewer";
import { openStep, refused, StageActions, StagePage, stageSteps, WorkflowHeader, type StageContext } from "@/components/closing/Stage";
import { ApiError, pettyCashBlob, pettyCashFetch } from "@/lib/apiClient";
import { canEditLines, expenseCount, receiptKind, withoutLine, type ExpenseLine, type ExpensesPage, type ExpensesSaved, type Supplier } from "@/lib/expenses";
import { formatMoney } from "@/lib/money";
import { reportStatus } from "@/lib/reportStatus";

// The heavy bits load when first opened: the entry form and the full-screen receipt view.
const ExpenseForm = dynamic(() => import("@/components/closing/ExpenseForm"), { ssr: false });
const ReceiptViewer = dynamic(() => import("@/components/closing/ReceiptViewer"), { ssr: false });

const STAGE = "Expenses";
const GUIDANCE = "Add each expense paid from the cash drawer, with its receipt.";
const NOT_DELETED = "We couldn't delete this expense. Check your connection, then try again.";

/**
 * The Daily Closing's third stage, "Expenses" (Part 15.15b/c; Flask's Expenses section): the
 * day's entries as Record rows - the account, the supplier, the description, the receipt (opened
 * full screen) and the amount as plain text - with Add expense (the entry form, a Drawer or a
 * full-screen sheet) and Delete (a Danger confirmation); then the day's total expenses as the
 * stage summary and Save & Next / Save & Exit, in Stage.tsx's frame.
 *
 * Reads through `GET /reports/expenses`, adds and deletes one entry at a time
 * (`POST /reports/expenses/lines`, `DELETE /expense-lines/<id>`) - each saved at once, so the
 * stage itself never holds unsaved changes - and moves on with `PUT /reports/expenses`
 * (Minty `petty_cash_api/routes/expenses.py`). The API has no edit: an entry is changed by
 * deleting it and adding it again, and the list says so. Its rules are lib/expenses.ts.
 */
export function Expenses({ day }: { day: string | null }) {
  return (
    <StagePage<ExpensesPage> path="/reports/expenses" day={day} title={STAGE} guidance={GUIDANCE} here="expenses">
      {(page, context) => <StageBody page={page} {...context} />}
    </StagePage>
  );
}

function StageBody({ page, entityId, entityName, home, notice }: { page: ExpensesPage } & StageContext) {
  const router = useRouter();
  const [lines, setLines] = useState(page.lines);
  const [total, setTotal] = useState(page.total);
  const [suppliers, setSuppliers] = useState<Supplier[]>(page.suppliers);
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState<ExpenseLine | null>(null);
  const [viewing, setViewing] = useState<ViewerFile | null>(null);
  const [announce, setAnnounce] = useState("");
  const [saving, setSaving] = useState<"next" | "exit" | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const addButton = useRef<HTMLButtonElement>(null);

  const code = page.currency_code;
  const day = page.transaction_date;
  const editable = canEditLines(page.draft);
  const progress = page.draft ?? { current_section: null, completed_sections: [] };
  const push = (href: string) => router.push(href);
  const route = { push, entityId, entityName, home };

  async function save(action: "next" | "exit") {
    if (saving) return;
    setProblem(null);
    setSaving(action);
    try {
      const answer = await pettyCashFetch<ExpensesSaved>("/reports/expenses", { method: "PUT", json: { transaction_date: day, action } });
      // Next is Cash Count, which opens at the deposit - still Flask's page.
      if (answer.next === "deposit") openStep(push, entityId, entityName, "deposit", answer.transaction_date);
      else push(home);
    } catch (err) {
      const message = refused(err, { here: "expenses", day, ...route });
      if (message === undefined) return;
      setSaving(null);
      setProblem(message);
    }
  }

  const viewReceipt = (line: ExpenseLine, receipt: ExpenseLine["receipts"][number]) =>
    setViewing({
      name: receipt.name,
      mime: receipt.mime_type,
      source: () => pettyCashBlob(`/expense-lines/${encodeURIComponent(line.id)}/receipts/${encodeURIComponent(receipt.id)}`),
    });

  return (
    <>
      <WorkflowHeader
        home={home}
        day={day}
        title={STAGE}
        guidance={GUIDANCE}
        status={reportStatus(page.draft)}
        steps={stageSteps(entityId, entityName, progress, "expenses", day)}
      />
      {notice}

      {/* Part 15.15c: the day's entries, each a Record row (stacked on a phone). */}
      <section aria-labelledby="expenses-list" className="flex flex-col gap-4 rounded-xl border border-border-subtle bg-surface-card p-4 sm:p-6">
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-4 gap-y-3">
          <div className="flex min-w-0 flex-col gap-0.5">
            <h2 id="expenses-list" className="text-title-m text-text-primary">
              {lines.length ? expenseCount(lines.length) : "Expenses added"}
            </h2>
            {lines.length && editable ? (
              <p className="text-body-s text-text-secondary">To change an expense, delete it and add it again.</p>
            ) : null}
          </div>
          {editable && lines.length ? (
            <Button ref={addButton} kind="secondary" icon={<Icon name="add" />} className="w-full sm:w-auto" onClick={() => setAdding(true)}>
              Add expense
            </Button>
          ) : null}
        </div>

        {lines.length ? (
          <ul className="flex flex-col">
            {lines.map((line) => (
              <ExpenseRow
                key={line.id}
                line={line}
                code={code}
                editable={editable}
                onView={(receipt) => viewReceipt(line, receipt)}
                onDelete={() => setDeleting(line)}
              />
            ))}
          </ul>
        ) : (
          // Part 11 §11.16 empty state: what exists here, why it is empty, what can happen next.
          <EmptyState
            title="No expenses added yet."
            className="py-6"
            action={
              editable ? (
                <Button ref={addButton} kind="secondary" icon={<Icon name="add" />} onClick={() => setAdding(true)}>
                  Add expense
                </Button>
              ) : null
            }
          >
            Add an expense when you&apos;re ready. A day with no expenses can go straight on with Save &amp; Next.
          </EmptyState>
        )}
        <p className="sr-only" aria-live="polite">
          {announce}
        </p>
      </section>

      <form
        className="flex flex-col gap-6"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void save("next");
        }}
      >
        {/* The stage summary (15.9 / 15.15): the running total, as plain text, never coloured. */}
        <div className="flex flex-col gap-3">
          <dl className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 rounded-lg bg-surface-sunk px-4 py-3">
            <dt className="min-w-0 text-title-m text-text-primary">Total expenses</dt>
            <dd className="shrink-0 text-title-m text-text-primary" translate="no" aria-live="polite">
              {formatMoney(total, code)}
            </dd>
            <dd className="basis-full text-body-s text-text-secondary">Every expense above, paid from the cash drawer.</dd>
          </dl>
          {problem ? <InlineAlert tone="danger">{problem}</InlineAlert> : null}
        </div>
        <StageActions saving={saving} onExit={() => void save("exit")} />
      </form>

      {adding ? (
        <ExpenseForm
          code={code}
          day={day}
          suppliers={suppliers}
          onSuppliers={setSuppliers}
          accounts={page.accounts}
          canCreateSupplier={page.permissions.create_supplier}
          route={route}
          onView={setViewing}
          onClose={() => setAdding(false)}
          onAdded={({ line, total: newTotal }) => {
            setLines((all) => [...all, line]);
            setTotal(newTotal);
            setAdding(false);
            setAnnounce(`Expense added. Total expenses ${formatMoney(newTotal, code)}.`);
          }}
        />
      ) : null}

      {deleting ? (
        <DeleteExpense
          line={deleting}
          code={code}
          onCancel={() => setDeleting(null)}
          onDeleted={(newTotal) => {
            setLines((all) => withoutLine(all, deleting.id));
            setTotal(newTotal);
            setDeleting(null);
            setAnnounce(`Expense deleted. Total expenses ${formatMoney(newTotal, code)}.`);
            // The row (and its Delete) is gone: the focus goes to the list's way on.
            requestAnimationFrame(() => (addButton.current ?? document.getElementById("expenses-list"))?.focus());
          }}
        />
      ) : null}

      {viewing ? <ReceiptViewer file={viewing} onClose={() => setViewing(null)} /> : null}
    </>
  );
}

/**
 * Part 14 Record row: the identity (the account, then the supplier and the description), the
 * amount as plain text - wrapping under the name before it is ever clipped - the receipt as a
 * File card that opens full screen, and Delete.
 */
function ExpenseRow({
  line,
  code,
  editable,
  onView,
  onDelete,
}: {
  line: ExpenseLine;
  code: string | null;
  editable: boolean;
  onView: (receipt: ExpenseLine["receipts"][number]) => void;
  onDelete: () => void;
}) {
  const title = line.account?.name || line.item || "Expense";
  const amount = formatMoney(line.amount, code);
  return (
    <li className="flex min-w-0 flex-col gap-2 border-t border-border-subtle py-4 first:border-t-0 first:pt-0 last:pb-0">
      <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5">
        <p className="min-w-0 flex-1 basis-40 break-words text-body-m font-semibold text-text-primary">{title}</p>
        <p className="shrink-0 text-body-m font-semibold text-text-primary" translate="no">
          {amount}
        </p>
      </div>
      <p className="min-w-0 break-words text-body-s text-text-secondary">
        {[line.supplier?.name, line.account?.code ? `Account ${line.account.code}` : null].filter(Boolean).join(" · ") || "No supplier"}
      </p>
      {line.remarks ? <p className="min-w-0 break-words text-body-s text-text-muted">{line.remarks}</p> : null}
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-1 basis-48 flex-col gap-1">
          {line.receipts.map((receipt) => (
            <button
              key={receipt.id}
              type="button"
              onClick={() => onView(receipt)}
              aria-label={`View receipt ${receipt.name}`}
              className="flex min-h-11 w-full min-w-0 cursor-pointer items-center gap-2 rounded-lg border border-border-default bg-surface-card px-3 text-left hover:bg-state-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus sm:w-fit sm:max-w-full"
            >
              <Icon name={receiptKind(receipt.mime_type) === "pdf" ? "picture_as_pdf" : "image"} className="text-text-secondary" />
              <span className="min-w-0 flex-1 truncate text-body-s text-text-primary">{receipt.name}</span>
              <span className="shrink-0 text-body-s font-medium text-text-link">View</span>
            </button>
          ))}
        </div>
        {editable ? (
          <Button kind="ghost" icon={<Icon name="delete" />} onClick={onDelete} aria-label={`Delete expense: ${line.account?.name || line.item}, ${amount}`}>
            Delete
          </Button>
        ) : null}
      </div>
    </li>
  );
}

/** Part 14 Confirmation modal, Destructive: what goes, that it can't be undone, Cancel first. */
function DeleteExpense({
  line,
  code,
  onCancel,
  onDeleted,
}: {
  line: ExpenseLine;
  code: string | null;
  onCancel: () => void;
  onDeleted: (total: number) => void;
}) {
  const cancel = useRef<HTMLButtonElement>(null);
  const [deleting, setDeleting] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const name = line.account?.name || line.item || "This expense";

  async function confirm() {
    if (deleting) return;
    setProblem(null);
    setDeleting(true);
    try {
      const answer = await pettyCashFetch<{ total: number }>(`/expense-lines/${encodeURIComponent(line.id)}`, { method: "DELETE" });
      onDeleted(answer.total);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return;
      setDeleting(false);
      setProblem(err instanceof ApiError ? err.message : NOT_DELETED);
    }
  }

  return (
    <Modal
      open
      role="alertdialog"
      onRequestClose={() => !deleting && onCancel()}
      initialFocus={cancel}
      title="Delete this expense?"
      description={
        <>
          <span className="font-semibold">
            {name}, <span translate="no">{formatMoney(line.amount, code)}</span>
            {line.supplier ? ` from ${line.supplier.name}` : ""}, and its receipt will be deleted.
          </span>{" "}
          This can&apos;t be undone.
        </>
      }
      footer={
        <>
          <Button ref={cancel} kind="secondary" onClick={onCancel} disabled={deleting}>
            Cancel
          </Button>
          <Button kind="danger" onClick={() => void confirm()} processing={deleting} processingLabel="Deleting…">
            Delete expense
          </Button>
        </>
      }
    >
      {problem ? <InlineAlert tone="danger">{problem}</InlineAlert> : null}
    </Modal>
  );
}
