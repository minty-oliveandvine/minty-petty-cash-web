"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type MouseEvent } from "react";

import { PhoneCard } from "@/components/flask/PhoneCard";
import { Stepper } from "@/components/flask/Stepper";
import { useToast } from "@/components/flask/Toasts";
import { AddExpenseCard } from "@/components/report/AddExpenseCard";
import { ReceiptViewer, useReceiptUrls, type ShownReceipt } from "@/components/report/ReceiptViewer";
import { LoadingOverlay, Modal, ReportBadge } from "@/components/report/ReportChrome";
import { sentenceOf, toOpening, useBackToOpening } from "@/components/report/stepErrors";
import { entityAcronym } from "@/lib/acronym";
import { ApiError, pettyCashFetch } from "@/lib/apiClient";
import { pettyCashHome } from "@/lib/companyPages";
import { detailRows, receiptKind, type ExpenseLine, type ExpensesPage, type Supplier } from "@/lib/expenses";
import { leaveTo } from "@/lib/handoff";
import { formatMoney } from "@/lib/money";
import { datePill } from "@/lib/opening";
import { useAuth } from "@/lib/useAuth";
import { isPorted, stepHref } from "@/lib/wizardPages";

const UNREACHABLE = "We couldn't reach Petty Cash. Check your connection, then reload the page.";
const UNSAVED = "You have an unsaved expense. Please save before navigating.";
const SAVE_FAILED = "I couldn't save that expense. Mind trying again?";
const DELETE_FAILED = "I couldn't delete that expense. Mind trying again?";

type SaveAnswer = { next: "deposit" | "dashboard"; transaction_date: string };

/**
 * The report wizard's Expenses step - a pixel-faithful port of Flask's `report/expense.html`: the
 * report header, the stepper, "Expenses", one card listing the day's lines with "Total Expense"
 * and "+ Add New Expense", the inline add card (components/report/AddExpenseCard.tsx), Expense
 * Details and Delete Expense, then Save & Next / Save & Exit. Reads and writes through
 * `GET`/`PUT /reports/expenses`, `POST /reports/expenses/lines`, `DELETE /expense-lines/<id>` and
 * `POST /suppliers` (Minty `petty_cash_api/routes/expenses.py`).
 *
 * Left out on purpose: Flask's edit of a saved line (the page has no way into it), its dead
 * "submit all" path, the receipt reader (`expense_ai.js`, behind a flag) and the read-only view
 * of a submitted report.
 */
export function ExpensesStep({ day }: { day: string | null }) {
  const toast = useToast();
  const auth = useAuth();
  const backToOpening = useBackToOpening();
  const [page, setPage] = useState<ExpensesPage | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    pettyCashFetch<ExpensesPage>("/reports/expenses", { query: { transaction_date: day ?? undefined } })
      .then((answer) => live && setPage(answer))
      .catch((err: unknown) => {
        if (!live || (err instanceof ApiError && err.status === 401)) return;
        setFailed(true);
        const message = err instanceof ApiError ? err.message : UNREACHABLE;
        // Flask's page redirects to Opening when the day has no draft, with this sentence
        if (toOpening(err) && day) backToOpening(message, day);
        else toast(message, "error");
      });
    return () => {
      live = false;
    };
  }, [day, toast, backToOpening]);

  const acronym = entityAcronym(auth?.entityName);
  if (!page || !auth) {
    return (
      <PhoneCard acronym={acronym} datePill="">
        {!failed ? (
          <p className="text-sm text-flask-gray-500" role="status">
            Loading…
          </p>
        ) : null}
      </PhoneCard>
    );
  }
  return <ExpensesForm page={page} entityId={auth.entityId} entityName={auth.entityName} acronym={acronym} />;
}

function ExpensesForm({ page, entityId, entityName, acronym }: { page: ExpensesPage; entityId: string; entityName: string; acronym: string }) {
  const toast = useToast();
  const router = useRouter();
  const backToOpening = useBackToOpening();
  const home = pettyCashHome(entityId, entityName);
  const day = page.transaction_date;
  const code = page.currency_code;
  const progress = page.draft ?? { current_section: null, completed_sections: [] };

  const [lines, setLines] = useState<ExpenseLine[]>(page.lines);
  const [total, setTotal] = useState(page.total);
  const [suppliers, setSuppliers] = useState<Supplier[]>(page.suppliers);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [viewing, setViewing] = useState<ExpenseLine | null>(null);
  const [deleting, setDeleting] = useState<ExpenseLine | null>(null);

  function onStepClick(event: MouseEvent<HTMLAnchorElement>) {
    if (adding) {
      event.preventDefault();
      toast(UNSAVED, "warning");
    }
  }

  async function save(action: "next" | "exit") {
    setBusy("Saving...");
    try {
      const answer = await pettyCashFetch<SaveAnswer>("/reports/expenses", { method: "PUT", json: { transaction_date: day, action } });
      if (answer.next === "dashboard") {
        router.push(home);
        return;
      }
      const next = stepHref(entityId, entityName, "deposit", answer.transaction_date);
      if (isPorted("deposit")) router.push(next);
      else leaveTo(next);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return;
      setBusy(null);
      if (toOpening(err)) backToOpening(sentenceOf(err) ?? SAVE_FAILED, day);
      else toast(sentenceOf(err) ?? SAVE_FAILED, "error");
    }
  }

  async function confirmDelete() {
    const line = deleting;
    if (!line) return;
    setDeleting(null);
    setBusy("Deleting Expense...");
    try {
      const answer = await pettyCashFetch<{ total: number }>(`/expense-lines/${encodeURIComponent(line.id)}`, { method: "DELETE" });
      setLines((all) => all.filter((l) => l.id !== line.id));
      setTotal(answer.total);
      toast("Expense deleted successfully!", "success");
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return;
      toast(sentenceOf(err) ?? DELETE_FAILED, "error");
    } finally {
      setBusy(null);
    }
  }

  const overlays = (
    <>
      {viewing ? <ExpenseDetailsModal line={viewing} code={code} onClose={() => setViewing(null)} /> : null}
      {deleting ? <DeleteExpenseModal onCancel={() => setDeleting(null)} onDelete={() => void confirmDelete()} /> : null}
      {busy ? <LoadingOverlay text={busy} /> : null}
    </>
  );

  return (
    <PhoneCard
      acronym={acronym}
      datePill={datePill(day)}
      badge={<ReportBadge draft={page.draft} />}
      backHref={home}
      stepper={
        <Stepper draft={progress} page="expenses" stepHref={(step) => stepHref(entityId, entityName, step, day)} onStepClick={onStepClick} />
      }
      overlays={overlays}
    >
      <div className="mb-6 text-left">
        <h2 className="text-lg font-bold text-flask-gray-700 sm:text-xl">Expenses</h2>
      </div>

      <div>
        <div className="mb-6 rounded-flask-lg bg-flask-white p-6 shadow-flask-sm">
          <div>
            {/* block, not flex: Flask's rows overlap by their -12px margins, which only collapse in block flow */}
            <div>
              {lines.map((line) => (
                <ExpenseRow key={line.id} line={line} code={code} onOpen={() => setViewing(line)} onDelete={() => setDeleting(line)} />
              ))}
            </div>
            {lines.length === 0 ? <p className="py-8 text-center text-flask-gray-500">No expenses added yet</p> : null}
            <div className="mt-4 flex items-center justify-between rounded-flask-2xl bg-flask-teal-soft/50 p-3 py-2">
              <span className="text-sm font-medium text-flask-teal-pill">Total Expense</span>
              <span className="text-sm font-medium text-flask-teal-pill" aria-live="polite">
                {formatMoney(total, code)}
              </span>
            </div>
            {!adding ? (
              <div>
                <button
                  type="button"
                  onClick={() => setAdding(true)}
                  className="group mt-6 flex w-full cursor-pointer items-center justify-center gap-2 rounded-flask-xl border-2 border-flask-teal px-4 py-3 font-medium text-flask-teal transition-colors hover:bg-flask-teal/10"
                >
                  <svg
                    className="transition-transform duration-300 ease-in-out group-hover:scale-[1.2]"
                    width="13"
                    height="14"
                    viewBox="0 0 13 14"
                    fill="none"
                    aria-hidden="true"
                  >
                    <path d="M5.57143 5.69643V0.125H7.42857V5.69643H13V7.55357H7.42857V13.125H5.57143V7.55357H0V5.69643H5.57143Z" fill="currentColor" />
                  </svg>
                  <span>Add New Expense</span>
                </button>
              </div>
            ) : null}
          </div>
        </div>

        {adding ? (
          <AddExpenseCard
            day={day}
            code={code}
            suppliers={suppliers}
            accounts={page.accounts}
            canCreateSupplier={page.permissions.create_supplier}
            onSupplierCreated={(s) => setSuppliers((all) => (all.some((x) => x.id === s.id) ? all : [...all, s]))}
            onAdded={(line, newTotal) => {
              setLines((all) => [...all, line]);
              setTotal(newTotal);
              setAdding(false);
            }}
            onCancel={() => setAdding(false)}
            setBusy={setBusy}
            onNoDraft={(sentence) => backToOpening(sentence, day)}
          />
        ) : null}
      </div>

      <button
        type="button"
        disabled={busy !== null}
        onClick={() => void save("next")}
        className="group flex w-full items-center justify-center gap-4 rounded-flask-xl bg-flask-teal px-4 py-3 font-medium text-flask-white shadow-flask-md transition-colors hover:bg-flask-teal/80 disabled:opacity-70"
      >
        <span>Save &amp; Next</span>
        <svg className="transition-transform group-hover:translate-x-1" width="14" height="13" viewBox="0 0 14 13" fill="none" aria-hidden="true">
          <path
            d="M10.534 5.66477L6.16282 1.18659L7.31648 -9.53674e-07L13.6377 6.50026L7.31648 13L6.16282 11.8139L10.534 7.33576H0.637695V5.66477H10.534Z"
            className="fill-flask-white"
          />
        </svg>
      </button>
      <div className="mt-2 flex justify-center">
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => void save("exit")}
          className="flex min-h-[40px] items-center justify-center px-4 py-2 text-sm font-medium text-flask-teal transition-colors hover:text-flask-teal/80"
        >
          <span>Save &amp; Exit</span>
        </button>
      </div>
    </PhoneCard>
  );
}

const TRASH = (
  <svg className="h-4 w-4" viewBox="0 0 16 15" fill="none" aria-hidden="true">
    <path
      d="M10.9156 4.00065H13.8312V5.16732H12.665V12.7507C12.665 12.914 12.6086 13.052 12.4958 13.1648C12.3831 13.2776 12.2451 13.334 12.0818 13.334H3.91808C3.7548 13.334 3.61679 13.2776 3.50406 13.1648C3.39132 13.052 3.33495 12.914 3.33495 12.7507V5.16732H2.1687V4.00065H5.08433V2.25065C5.08433 2.08732 5.14069 1.94926 5.25343 1.83648C5.36617 1.72371 5.50418 1.66732 5.66745 1.66732H10.3325C10.4957 1.66732 10.6337 1.72371 10.7465 1.83648C10.8592 1.94926 10.9156 2.08732 10.9156 2.25065V4.00065ZM11.4987 5.16732H4.5012V12.1673H11.4987V5.16732ZM6.25058 6.91732H7.41683V10.4173H6.25058V6.91732ZM8.58308 6.91732H9.74933V10.4173H8.58308V6.91732ZM6.25058 2.83398V4.00065H9.74933V2.83398H6.25058Z"
      fill="currentColor"
    />
  </svg>
);

/**
 * A line as Flask's server-drawn row has it: the account's name in bold ("N/A" without one), the
 * supplier, the description, then the amount in red and the bin. The row opens Expense Details.
 */
function ExpenseRow({ line, code, onOpen, onDelete }: { line: ExpenseLine; code: string | null; onOpen: () => void; onDelete: () => void }) {
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`${line.item || "N/A"}, ${formatMoney(line.amount, code)}`}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      className="-m-3 cursor-pointer rounded-flask-lg p-2 px-3 transition-colors hover:bg-flask-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-flask-teal"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="break-words text-base font-semibold text-flask-gray-900">{line.item || "N/A"}</p>
          {line.supplier?.name ? <p className="mt-1 break-words text-sm text-flask-gray-700">{line.supplier.name}</p> : null}
          {line.remarks ? <p className="mt-1 break-words text-sm text-flask-gray-500">{line.remarks}</p> : null}
        </div>
        <div className="text-right">
          <div className="flex items-center justify-end gap-3">
            <div className="font-medium text-flask-red-600">{formatMoney(line.amount, code)}</div>
            <button
              type="button"
              aria-label="Delete expense"
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              className="flask-hover-bounce -m-2 cursor-pointer rounded-full p-2 text-flask-gray-400 hover:text-flask-red-600"
            >
              {TRASH}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const EXPAND = (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="h-8 w-8 text-flask-white opacity-0 transition-opacity group-hover:opacity-100" aria-hidden="true">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15"
    />
  </svg>
);

/**
 * Flask's "Expense Details" (#viewExpenseModal): the receipt first (a picture as a 256px tile that
 * opens full screen; a PDF as a tile with its name and "Open"), "Amount Paid", then Contact Name,
 * Description and Account in a grey box, and Close.
 */
function ExpenseDetailsModal({ line, code, onClose }: { line: ExpenseLine; code: string | null; onClose: () => void }) {
  const urls = useReceiptUrls(line);
  const [shown, setShown] = useState<ShownReceipt | null>(null);
  const rows = detailRows(line);
  const closeViewer = useCallback(() => setShown(null), []);
  // while the receipt is open full screen, Escape and outside clicks belong to it
  const close = useCallback(() => {
    if (!shown) onClose();
  }, [shown, onClose]);

  return (
    <Modal titleId="viewExpenseTitle" onClose={close} className="max-h-[90vh] overflow-y-auto rounded-flask-lg bg-flask-white p-6 shadow-flask-xl">
      <div className="mb-6 flex items-center justify-between">
        <h2 id="viewExpenseTitle" className="text-xl font-bold text-flask-gray-900">
          Expense Details
        </h2>
      </div>

      <div className="mb-2">
        {line.receipts.length > 0 ? (
          <div className="mb-4">
            <div className={`grid gap-2 ${line.receipts.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>
              {line.receipts.map((receipt) => {
                const kind = receiptKind(receipt.mime_type, receipt.name);
                const got = urls[receipt.id];
                const open = () => got?.url && setShown({ url: got.url, kind, name: receipt.name });
                if (kind === "image") {
                  return (
                    <button
                      key={receipt.id}
                      type="button"
                      onClick={open}
                      aria-label={`Open ${receipt.name}`}
                      className="group relative block w-full cursor-pointer"
                    >
                      {got?.url ? (
                        // eslint-disable-next-line @next/next/no-img-element -- an object URL of the receipt's bytes
                        <img
                          src={got.url}
                          alt={receipt.name}
                          className="pointer-events-none h-64 w-full rounded-flask-lg border border-flask-gray-200 object-cover transition-colors group-hover:border-flask-teal"
                        />
                      ) : (
                        <div className="flex h-64 w-full items-center justify-center rounded-flask-lg border border-flask-gray-200 bg-flask-gray-50 px-4 text-center text-sm text-flask-gray-500">
                          {got?.failed ? "This image can't be previewed here." : "Loading…"}
                        </div>
                      )}
                      <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-flask-lg bg-flask-black/0 transition-opacity group-hover:bg-flask-black/20">
                        {EXPAND}
                      </div>
                    </button>
                  );
                }
                if (kind === "pdf") {
                  return (
                    <button
                      key={receipt.id}
                      type="button"
                      onClick={open}
                      className="group relative flex h-64 w-full cursor-pointer flex-col items-center justify-center gap-2 overflow-hidden rounded-flask-lg border border-flask-gray-200 bg-flask-gray-50 px-4 text-center transition-colors hover:border-flask-teal"
                    >
                      <PdfIcon />
                      <span className="w-full truncate text-sm text-flask-gray-700">{receipt.name}</span>
                      <span className="text-sm font-medium text-flask-teal">{got?.failed ? "This PDF can't be previewed here." : "Open"}</span>
                    </button>
                  );
                }
                return (
                  <div key={receipt.id} className="rounded-flask-lg border border-flask-gray-200 p-2">
                    <button
                      type="button"
                      onClick={() => got?.url && setShown({ url: got.url, kind: "other", name: receipt.name })}
                      className="flex min-h-[44px] w-full items-center text-left text-sm text-flask-blue-600 hover:text-flask-blue-800"
                    >
                      <svg className="mr-2 h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="2"
                          d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"
                        />
                      </svg>
                      <span className="min-w-0 [overflow-wrap:anywhere]">{receipt.name}</span>
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}

        <div className="text-center">
          <p className="mb-1 text-sm text-flask-gray-400">Amount Paid</p>
          <p className="text-3xl font-bold text-flask-detail-ink [overflow-wrap:anywhere]">{formatMoney(line.amount, code)}</p>
        </div>
        <div className="mt-4 rounded-flask-xl bg-flask-gray-50 px-4 py-2">
          <DetailRow label="Contact Name" value={rows.contact} />
          <DetailRow label="Description" value={rows.description} />
          <DetailRow label="Account" value={rows.account} />
        </div>
      </div>

      <div className="flex justify-center gap-3">
        <button
          type="button"
          onClick={onClose}
          className="flex flex-1 items-center justify-center gap-2 rounded-flask-xl bg-flask-teal px-4 py-3 font-medium text-flask-white transition-colors hover:bg-flask-teal/80"
        >
          <span>Close</span>
        </button>
      </div>
      {shown ? <ReceiptViewer receipt={shown} onClose={closeViewer} /> : null}
    </Modal>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2">
      <span className="shrink-0 text-sm text-flask-gray-400">{label}</span>
      <span className="min-w-0 break-words text-right text-sm font-semibold text-flask-detail-ink">{value}</span>
    </div>
  );
}

function PdfIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="h-12 w-12 text-flask-gray-400" aria-hidden="true">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"
      />
    </svg>
  );
}

/** Flask's "Delete Expense" (#deleteExpenseModal): the red warning, then Cancel / Delete. */
function DeleteExpenseModal({ onCancel, onDelete }: { onCancel: () => void; onDelete: () => void }) {
  return (
    <Modal titleId="deleteExpenseTitle" onClose={onCancel} className="rounded-flask-lg bg-flask-white p-6">
      <div className="mb-6 flex items-center justify-between">
        <h2 id="deleteExpenseTitle" className="text-xl font-bold text-flask-gray-900">
          Delete Expense
        </h2>
        <button type="button" onClick={onCancel} aria-label="Close" className="text-flask-gray-400 hover:text-flask-gray-600">
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="mb-6 rounded-flask-lg border border-flask-danger-edge bg-flask-danger-bg p-4">
        <div className="flex items-start">
          <div className="flex-shrink-0">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor" className="h-5 w-5 text-flask-danger" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
            </svg>
          </div>
          <div className="ml-3">
            <p className="text-sm text-flask-danger-ink">
              <span className="font-bold">Warning:</span>
            </p>
            <p className="mt-1 text-sm text-flask-danger-ink">Are you sure you want to delete this expense? This action cannot be undone.</p>
          </div>
        </div>
      </div>

      <div className="flex gap-3">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 rounded-flask-xl border-2 border-flask-teal px-4 py-3 font-medium text-flask-teal transition-colors hover:bg-flask-teal/10"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="flex-1 rounded-flask-xl bg-flask-teal px-4 py-3 font-medium text-flask-white transition-colors hover:bg-flask-teal/80"
        >
          Delete
        </button>
      </div>
    </Modal>
  );
}
