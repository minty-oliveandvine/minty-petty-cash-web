"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FocusEvent, type ReactNode, type Ref } from "react";

import {
  Button,
  buttonClass,
  Drawer,
  ErrorSummary,
  Field,
  Icon,
  InlineAlert,
  inputClass,
  PageBanner,
} from "@minty/shared/ui";
import { parseAmount } from "@minty/shared/money";

import {
  AmountInput,
  openStep,
  refused,
  StageActions,
  StagePage,
  stageSteps,
  useLeaveHold,
  WorkflowHeader,
  type StageContext,
} from "@/components/closing/Stage";
import { ApiError, pettyCashFetch } from "@/lib/apiClient";
import {
  belowZero,
  cashCountDirty,
  cashGuidance,
  countedCash,
  countProblem,
  currentTask,
  denominationGroups,
  denominationLabel,
  depositProblem,
  depositResult,
  difference,
  differenceText,
  drawerTotal,
  expectedCash,
  initialTasks,
  initialValues,
  kindNoun,
  nextGate,
  openingCash,
  reasonHelper,
  reasonProblem,
  rowTotalText,
  sanitizeCount,
  savePayload,
  sheetProblem,
  TASK_NEXT,
  taskState,
  type CashCountPage,
  type CashCountSaved,
  type CashCountValues,
  type CashTask,
  type Denomination,
  type TasksDone,
  type TaskState,
} from "@/lib/cashCount";
import { money } from "@/lib/money";
import { reportStatus } from "@/lib/reportStatus";
import { stepHref } from "@/lib/wizardPages";

const STAGE = "Cash Count";
const GUIDANCE = "Three quick checks. We'll go one at a time.";

/** The fields' ids - the error summary links to them, and a refusal moves the focus to one. */
const DEPOSIT = "cash-deposit";
const SAFEBOX = "cash-safebox";
const REASON = "cash-reason";
const COUNT_OPEN = "cash-open-count";
const countId = (d: Denomination) => `cash-count-${d.id}`;

/**
 * The Daily Closing's fourth stage, "Cash Count" (Part 15.9 / 15.15d, D15-05), as Flask's Daily
 * Closing Phase 1 (Minty 4e004d2, 2026-10-16): three task cards, one open at a time - the cash
 * taken to the bank (optional, first: A15-02), the count by notes and coins in the focused
 * "Count the drawer" sheet (a Drawer: 480 on a desktop, full screen on a phone), the safe box.
 * Only the first task not done is open; a done one shows its result with Change / Edit, a waiting
 * one says what it waits for. Once the drawer is counted, the Check: "The numbers match", or the
 * difference in words and the reason it needs. Save & Next waits for the count, then for that
 * reason, and says so above it. In Stage.tsx's frame.
 *
 * Reads through `GET /reports/cash-count` and saves the deposit and the count TOGETHER through
 * `PUT /reports/cash-count` (one transaction; Minty `petty_cash_api/routes/cash.py`). Its rules
 * are lib/cashCount.ts.
 */
export function CashCount({ day }: { day: string | null }) {
  return (
    <StagePage<CashCountPage>
      path="/reports/cash-count"
      day={day}
      title={STAGE}
      guidance={GUIDANCE}
      here="cash_count"
    >
      {(page, context) => <CashCountForm page={page} {...context} />}
    </StagePage>
  );
}

type FieldError = { field: string; message: string } | null;

/** The stage's form once the read has answered (exported for its component tests). */
export function CashCountForm({
  page,
  entityId,
  entityName,
  home,
  notice,
}: { page: CashCountPage } & StageContext) {
  const router = useRouter();
  const [values, setValues] = useState<CashCountValues>(() => initialValues(page));
  const [done, setDone] = useState<TasksDone>(() => initialTasks(page));
  // The count sheet: open, and the row to focus when it opens on a problem.
  const [sheet, setSheet] = useState<{ open: boolean; focus: string | null }>({
    open: false,
    focus: null,
  });
  const [submitted, setSubmitted] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [saving, setSaving] = useState<"next" | "exit" | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  // A 422 from the API names its field: shown there until that field changes.
  const [serverError, setServerError] = useState<FieldError>(null);

  const code = page.currency_code;
  const day = page.transaction_date;
  const expected = expectedCash(page, values.deposit);
  const drawer = drawerTotal(page.denominations, values.counts);
  const counted = countedCash(drawer, values.safebox);
  const diff = difference(counted, expected);
  const gate = nextGate(done, diff, values.reason);
  const hold = useLeaveHold(cashCountDirty(page, values), saving !== null);
  const progress = page.draft ?? { current_section: null, completed_sections: [] };
  const push = (href: string) => router.push(href);
  const busy = saving !== null;

  const server = (field: string) => (serverError?.field === field ? serverError.message : null);
  const problems = (asSubmitted: boolean, action: "next" | "exit") => {
    const list: { fieldId: string; message: string }[] = [];
    const add = (fieldId: string, message: string | null) =>
      message && list.push({ fieldId, message });
    add(DEPOSIT, depositProblem(page, values.deposit) ?? server("bank_deposit"));
    for (const d of page.denominations)
      add(countId(d), countProblem(values.counts[d.id] ?? "") ?? server(d.id));
    add(SAFEBOX, server("safe_box_balance"));
    add(
      REASON,
      reasonProblem(values.reason, diff, code, { submitted: asSubmitted && action === "next" }) ??
        server("discrepancy_reason"),
    );
    return list;
  };
  // Shown now: as typed, plus what a refused Save & Next found.
  const shown = problems(submitted, "next");
  const errorOf = (fieldId: string) => shown.find((p) => p.fieldId === fieldId)?.message;
  const reasonShown = diff.kind !== "none" || Boolean(server("discrepancy_reason"));
  // The summary's links focus their field; a count's is in the closed sheet, so its link goes to
  // the button that opens it - once, however many counts have a problem.
  const summaryItems = (list: { fieldId: string; message: string }[]) => {
    const inSheet = (id: string) => id.startsWith("cash-count-");
    const firstCount = list.find((p) => inSheet(p.fieldId));
    return list
      .filter((p) => !inSheet(p.fieldId) || p === firstCount)
      .map((p) => (inSheet(p.fieldId) ? { ...p, fieldId: COUNT_OPEN } : p));
  };

  const set = (patch: Partial<CashCountValues>, field: string) => {
    setValues((all) => ({ ...all, ...patch }));
    if (serverError?.field === field) setServerError(null);
  };

  // Where the focus goes once a task moves: the open task's control, else the reason a
  // difference still needs, else Save & Next. After React has drawn the new state.
  const [focusAfter, setFocusAfter] = useState<{ to: "current" | CashTask; n: number } | null>(
    null,
  );
  const reasonEmpty = values.reason.trim() === "";
  useEffect(() => {
    if (!focusAfter) return;
    const task = focusAfter.to === "current" ? currentTask(done) : focusAfter.to;
    const id =
      task === "deposit"
        ? DEPOSIT
        : task === "count"
          ? COUNT_OPEN
          : task === "safe"
            ? SAFEBOX
            : reasonShown && reasonEmpty
              ? REASON
              : null;
    const target = id
      ? document.getElementById(id)
      : document.querySelector<HTMLElement>('[data-stage-save="next"]:not([disabled])');
    target?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when a move asks for it
  }, [focusAfter]);
  const moveFocus = (to: "current" | CashTask) =>
    setFocusAfter((f) => ({ to, n: (f?.n ?? 0) + 1 }));

  /** A typed task is done once it is left with a valid value (or empty: "none"). */
  function finish(task: "deposit" | "safe", focus: boolean): boolean {
    if (task === "deposit" && depositProblem(page, values.deposit)) return false;
    setDone((d) => ({ ...d, [task]: true }));
    if (focus) moveFocus("current");
    return true;
  }

  /** Leaving a typed task's card finishes it - unless the focus stays in it, or is on its way to Save. */
  const leaveCard = (task: "deposit" | "safe") => (event: FocusEvent<HTMLElement>) => {
    if (busy || taskState(task, done) !== "current") return;
    const to = event.relatedTarget instanceof HTMLElement ? event.relatedTarget : null;
    if (to && (event.currentTarget.contains(to) || to.closest("[data-stage-save]"))) return;
    finish(task, !to || !to.closest("[data-task]"));
  };

  function reopen(task: "deposit" | "safe") {
    setDone((d) => ({ ...d, [task]: false }));
    moveFocus(task);
  }

  function saveCount() {
    const bad = sheetProblem(page.denominations, values.counts);
    if (bad) {
      document.getElementById(countId(bad))?.focus();
      return;
    }
    setSheet({ open: false, focus: null });
    setDone((d) => ({ ...d, count: true }));
    moveFocus("current");
  }

  /** Brings a field with a problem into view - its task opens, or the sheet does on its row - and focuses it. */
  function reveal(fieldId: string, focus = true) {
    if (fieldId === DEPOSIT) setDone((d) => ({ ...d, deposit: false }));
    else if (fieldId === SAFEBOX) setDone((d) => ({ ...d, safe: false }));
    else if (fieldId.startsWith("cash-count-")) {
      setSheet({ open: true, focus: fieldId });
      return;
    }
    if (focus) requestAnimationFrame(() => document.getElementById(fieldId)?.focus());
  }

  async function save(action: "next" | "exit") {
    if (saving) return;
    // Enter in a field submits the form: Save & Next still waits for its gate.
    if (action === "next" && gate) {
      moveFocus("current");
      return;
    }
    setProblem(null);
    hold.release();
    const failing = problems(true, action);
    if (failing.length) {
      // A reason is asked for only by Save & Next; Save & Exit keeps a difference without one.
      if (action === "next") setSubmitted(true);
      setAttempt((n) => n + 1);
      // Every task with a problem opens; a count's opens the sheet on its row, over the summary.
      for (const p of failing)
        if (p.fieldId === DEPOSIT || p.fieldId === SAFEBOX) reveal(p.fieldId, false);
      const badCount = failing.find((p) => p.fieldId.startsWith("cash-count-"));
      if (badCount) reveal(badCount.fieldId);
      // One problem: its field takes focus. Two or more: the summary does (ErrorSummary).
      else if (failing.length === 1) reveal(failing[0].fieldId);
      return;
    }
    setSaving(action);
    try {
      const answer = await pettyCashFetch<CashCountSaved>("/reports/cash-count", {
        method: "PUT",
        body: savePayload(day, page, values, diff, action),
      });
      if (answer.next === "ending")
        openStep(push, entityId, entityName, "ending", answer.transaction_date);
      else push(home);
    } catch (err) {
      const field =
        err instanceof ApiError && err.status === 422
          ? (err.body as { field?: unknown } | null)?.field
          : undefined;
      if (typeof field === "string" && err instanceof ApiError) {
        // A rule about one input: on that input, which takes the focus.
        setSaving(null);
        setServerError({ field, message: err.message });
        reveal(
          field === "bank_deposit"
            ? DEPOSIT
            : field === "safe_box_balance"
              ? SAFEBOX
              : field === "discrepancy_reason"
                ? REASON
                : `cash-count-${field}`,
        );
        return;
      }
      // No draft any more: to Addition to Drawer, which says why (`to: "opening"`).
      const message = refused(err, { here: "cash_count", push, entityId, entityName, home, day });
      if (message === undefined) return;
      setSaving(null);
      setProblem(message);
    }
  }

  const guidance = cashGuidance(done);
  const header = (
    <>
      <WorkflowHeader
        home={home}
        day={day}
        title={STAGE}
        guidance={guidance}
        status={reportStatus(page.draft)}
        steps={stageSteps(entityId, entityName, progress, "cash_count", day)}
        onLeave={hold.onLeave}
        held={hold.held}
      />
      {notice}
    </>
  );

  if (belowZero(page)) {
    // Part 15.9e business-rule gate (Flask's "Fix Negative Balance"): the rule, the reason, one
    // action. Nothing on this stage can fix it - the figures come from the earlier stages.
    return (
      <>
        {header}
        <PageBanner
          tone="warning"
          title="The cash on hand is below zero"
          action={
            <Link
              href={stepHref(entityId, entityName, "expenses", day)}
              className={buttonClass("link")}
            >
              Go to Expenses
            </Link>
          }
        >
          Opening cash{" "}
          <span translate="no" className="whitespace-nowrap">
            {money(openingCash(page), code)}
          </span>{" "}
          plus cash sales{" "}
          <span translate="no" className="whitespace-nowrap">
            {money(page.cash_sales, code)}
          </span>
          , less expenses{" "}
          <span translate="no" className="whitespace-nowrap">
            {money(page.expenses, code)}
          </span>
          , comes to{" "}
          <span translate="no" className="whitespace-nowrap">
            {money(page.cash_on_hand, code)}
          </span>
          , and cash can&apos;t be counted against less than zero. Check the expenses and the cash
          sales, then come back to Cash Count.
        </PageBanner>
      </>
    );
  }

  return (
    <>
      {header}
      <form
        className="flex flex-col gap-6"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void save("next");
        }}
      >
        <ErrorSummary
          items={shown.length > 1 && attempt > 0 ? summaryItems(shown) : []}
          attempt={attempt}
        />

        {/* The three tasks; a polite live region, so a task opening or closing is announced. */}
        <div className="flex flex-col gap-3" aria-live="polite">
          {/* 1. The cash taken to the bank - optional, and first (A15-02). */}
          <TaskCard
            task="deposit"
            number={1}
            title="Cash taken to the bank"
            state={taskState("deposit", done)}
            onBlur={leaveCard("deposit")}
          >
            {{
              body: (
                <>
                  <TotalBand
                    label="In the drawer before any deposit"
                    amount={money(page.cash_on_hand, code)}
                    onCard
                  />
                  <AmountInput
                    id={DEPOSIT}
                    label="Deposit amount"
                    name="bank_deposit"
                    code={code}
                    value={values.deposit}
                    onChange={(deposit) => set({ deposit }, "bank_deposit")}
                    helper="Leave it empty when no cash went to the bank."
                    error={errorOf(DEPOSIT)}
                    disabled={busy}
                  />
                  <div>
                    <Button
                      kind="secondary"
                      disabled={busy}
                      onClick={() =>
                        finish("deposit", true) || document.getElementById(DEPOSIT)?.focus()
                      }
                    >
                      Continue
                    </Button>
                  </div>
                </>
              ),
              result: (
                <>
                  <p className="min-w-0 text-body-m text-text-secondary">
                    {(parseAmount(values.deposit) ?? 0) > 0 ? (
                      <>
                        <span translate="no">{money(parseAmount(values.deposit) ?? 0, code)}</span>{" "}
                        to the bank
                      </>
                    ) : (
                      depositResult(values.deposit, code)
                    )}
                  </p>
                  <Button
                    kind="link"
                    disabled={busy}
                    aria-label="Change the cash taken to the bank"
                    onClick={() => reopen("deposit")}
                  >
                    Change
                  </Button>
                </>
              ),
            }}
          </TaskCard>

          {/* 2. The count, in the sheet. */}
          <TaskCard
            task="count"
            number={2}
            title="Count the drawer"
            sub="Notes and coins in the till right now"
            state={taskState("count", done)}
            next={TASK_NEXT.count}
          >
            {{
              body: (
                <>
                  <Scene src="/cash-register.webp" size={128} />
                  {page.denominations.length ? (
                    <Button
                      id={COUNT_OPEN}
                      kind="primary"
                      full
                      disabled={busy}
                      onClick={() => setSheet({ open: true, focus: null })}
                    >
                      Count notes and coins
                    </Button>
                  ) : (
                    <InlineAlert tone="info">
                      This company has no notes or coins set up yet, so the drawer can&apos;t be
                      counted here. Check the company&apos;s country in Settings.
                    </InlineAlert>
                  )}
                </>
              ),
              result: (
                <>
                  <TotalBand label="Counted in the drawer" amount={money(drawer, code)} />
                  <Button
                    id={COUNT_OPEN}
                    kind="link"
                    disabled={busy}
                    aria-label="Edit the count"
                    onClick={() => setSheet({ open: true, focus: null })}
                  >
                    Edit
                  </Button>
                </>
              ),
            }}
          </TaskCard>

          {/* 3. The safe box - part of the cash counted. */}
          <TaskCard
            task="safe"
            number={3}
            title="Safe box"
            state={taskState("safe", done)}
            next={TASK_NEXT.safe}
            onBlur={leaveCard("safe")}
          >
            {{
              body: (
                <div className="flex min-w-0 items-center gap-3">
                  <Scene src="/safebox.webp" size={56} />
                  <div className="min-w-0 flex-1">
                    <AmountInput
                      id={SAFEBOX}
                      label="Cash in the safe box"
                      name="safe_box_balance"
                      code={code}
                      value={values.safebox}
                      onChange={(safebox) => set({ safebox }, "safe_box_balance")}
                      helper="Leave it empty when the safe box is empty."
                      error={errorOf(SAFEBOX)}
                      disabled={busy}
                    />
                  </div>
                </div>
              ),
              result: (
                <>
                  <p className="min-w-0 text-body-m text-text-secondary" translate="no">
                    {money(parseAmount(values.safebox) ?? 0, code)}
                  </p>
                  <Button
                    kind="link"
                    disabled={busy}
                    aria-label="Edit the safe box"
                    onClick={() => reopen("safe")}
                  >
                    Edit
                  </Button>
                </>
              ),
            }}
          </TaskCard>
        </div>

        {/* The Check: only once the drawer has been counted - the expected amount stays out of sight until then. */}
        {done.count ? (
          <section aria-labelledby="cash-check" className="flex flex-col gap-4">
            <h2 id="cash-check" className="sr-only">
              Check
            </h2>
            {diff.kind === "none" ? (
              <div
                className="flex items-start gap-3 rounded-lg bg-status-success-bg p-4 text-status-success-ink"
                role="status"
              >
                <span
                  className="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-surface-card"
                  aria-hidden
                >
                  <Icon name="check" size="md" />
                </span>
                <div className="min-w-0">
                  <p className="font-semibold">The numbers match</p>
                  <p className="mt-0.5 text-body-s">
                    Counted <span translate="no">{money(counted, code)}</span> &middot; expected{" "}
                    <span translate="no">{money(expected, code)}</span>
                  </p>
                </div>
              </div>
            ) : (
              // 15.10b: short/over in words, Warning tone, never a red number.
              <InlineAlert tone="warning" title={`The count is ${differenceText(diff, code)}.`}>
                Add a reason so the reviewer knows what happened.
              </InlineAlert>
            )}
            {reasonShown ? (
              <Field
                id={REASON}
                label="Reason for the difference"
                required={diff.kind !== "none"}
                error={errorOf(REASON)}
                helper={reasonHelper(values.reason)}
              >
                {(a11y) => (
                  <textarea
                    {...a11y}
                    name="discrepancy_reason"
                    rows={3}
                    value={values.reason}
                    disabled={busy}
                    placeholder="For example: change given twice by mistake"
                    onChange={(e) => set({ reason: e.target.value }, "discrepancy_reason")}
                    className={`${inputClass(Boolean(errorOf(REASON)), { multiline: true })} max-h-60 resize-y`}
                  />
                )}
              </Field>
            ) : null}
          </section>
        ) : null}

        {problem ? <InlineAlert tone="danger">{problem}</InlineAlert> : null}

        <StageActions saving={saving} onExit={() => void save("exit")} gate={gate} />
      </form>

      <CountSheet
        open={sheet.open}
        focusId={sheet.focus}
        page={page}
        counts={values.counts}
        errorOf={errorOf}
        onCount={(id, text) => set({ counts: { ...values.counts, [id]: text } }, id)}
        onClose={() => setSheet({ open: false, focus: null })}
        onSave={saveCount}
        total={money(drawer, code)}
      />
    </>
  );
}

/**
 * A task card (Flask's `ui.task`): the number (a check once done), the title, then the part its
 * state shows - the inputs (current), one line with the result and Change / Edit (done), or what
 * it waits for (next). Only the current task is marked in mint.
 */
function TaskCard({
  task,
  number,
  title,
  sub,
  state,
  next,
  onBlur,
  children,
}: {
  task: CashTask;
  number: number;
  title: string;
  sub?: string;
  state: TaskState;
  next?: string;
  onBlur?: (event: FocusEvent<HTMLElement>) => void;
  children: { body: ReactNode; result: ReactNode };
}) {
  const titleId = `task-${task}-title`;
  const frame =
    state === "current"
      ? "border-2 border-border-selected bg-state-selected p-5"
      : "border border-border-subtle bg-surface-card p-4";
  const mark =
    state === "done"
      ? "bg-border-selected text-action-on-primary"
      : state === "current"
        ? "bg-brand-primary text-text-primary"
        : "bg-surface-sunk text-text-muted";
  return (
    <section
      id={`task-${task}`}
      data-task={task}
      data-state={state}
      aria-labelledby={titleId}
      aria-current={state === "current" ? "step" : undefined}
      onBlur={onBlur}
      className={`flex min-w-0 flex-col gap-4 rounded-xl ${frame}`}
    >
      <div className="flex min-w-0 items-start gap-3">
        <span
          className={`inline-flex size-7 shrink-0 items-center justify-center rounded-full text-label font-bold ${mark}`}
          aria-hidden
        >
          {state === "done" ? <Icon name="check" size="sm" /> : number}
        </span>
        <div className="min-w-0 flex-1 pt-0.5">
          <h2
            id={titleId}
            className={`text-title-m ${state === "next" ? "text-text-muted" : "text-text-primary"}`}
          >
            {title}
          </h2>
          {sub && state === "current" ? (
            <p className="mt-0.5 text-body-s text-text-secondary">{sub}</p>
          ) : null}
        </div>
      </div>
      {state === "current" ? (
        <div className="flex min-w-0 flex-col gap-4">{children.body}</div>
      ) : null}
      {state === "done" ? (
        <div className="-mt-2 flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-1 pl-10">
          {children.result}
        </div>
      ) : null}
      {state === "next" && next ? (
        <p className="-mt-2 ml-10 text-body-s text-text-muted">{next}</p>
      ) : null}
    </section>
  );
}

/** A total band: a mint tint for a total (never on a warning or an error); white on the open task's mint. */
function TotalBand({
  label,
  amount,
  onCard = false,
}: {
  label: string;
  amount: string;
  onCard?: boolean;
}) {
  return (
    <div
      className={`flex min-w-0 flex-[1_1_220px] flex-wrap items-baseline justify-between gap-x-3 rounded-lg px-4 py-3 ${onCard ? "bg-surface-card" : "bg-state-selected"}`}
    >
      <span className="min-w-0 text-body-m text-text-secondary">{label}</span>
      <span
        className="ml-auto min-w-0 break-all text-right text-title-l font-bold text-text-primary"
        translate="no"
      >
        {amount}
      </span>
    </div>
  );
}

/** A step scene (Part 13 §13.11): decorative, sized to its slot, never inside a field. */
function Scene({ src, size }: { src: string; size: 44 | 56 | 128 }) {
  return (
    <Image
      src={src}
      alt=""
      width={size}
      height={size}
      unoptimized
      className={`shrink-0 object-contain ${size === 128 ? "mx-auto h-auto max-h-32 w-auto" : size === 56 ? "size-14" : "size-11"}`}
    />
  );
}

/**
 * The "Count the drawer" sheet (Flask's `#countSheet`; a Drawer - 480 at the right, full screen on
 * a phone): the notes, then the coins, each row "face = count -> line total" ("—" while empty),
 * the live total, and Save count. Enter in a row is Save count, never the page's Save & Next.
 * Closing it keeps what was typed, but the count is done only by Save count.
 */
function CountSheet({
  open,
  focusId,
  page,
  counts,
  errorOf,
  onCount,
  onClose,
  onSave,
  total,
}: {
  open: boolean;
  focusId: string | null;
  page: CashCountPage;
  counts: Record<string, string>;
  errorOf: (fieldId: string) => string | undefined;
  onCount: (id: string, text: string) => void;
  onClose: () => void;
  onSave: () => void;
  total: string;
}) {
  const first = useRef<HTMLInputElement>(null);
  // After the Drawer's own first focus (a child's effect runs first): a row with a problem.
  useEffect(() => {
    if (open && focusId) document.getElementById(focusId)?.focus();
  }, [open, focusId]);
  const code = page.currency_code;
  const firstId = page.denominations[0]?.id;
  return (
    <Drawer
      open={open}
      onRequestClose={onClose}
      initialFocus={first}
      title={
        <span className="flex items-center gap-3">
          <Scene src="/cash-register.webp" size={44} />
          Count the drawer
        </span>
      }
      description="How many of each? Leave a row empty for none."
      footer={
        <div className="flex min-w-0 flex-col gap-3 sm:flex-1">
          <div aria-live="polite">
            <TotalBand label="Total in the drawer" amount={total} />
          </div>
          <Button kind="primary" full onClick={onSave}>
            Save count
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-6">
        {denominationGroups(page.denominations).map((group) => (
          <fieldset key={group.kind} className="flex min-w-0 flex-col">
            <legend className="mb-1 text-label font-semibold uppercase tracking-wider text-text-secondary">
              {group.title}
            </legend>
            {group.items.map((d) => (
              <CountRow
                key={d.id}
                denomination={d}
                code={code}
                value={counts[d.id] ?? ""}
                error={errorOf(countId(d))}
                inputRef={d.id === firstId ? first : undefined}
                onChange={(text) => onCount(d.id, text)}
                onEnter={onSave}
              />
            ))}
          </fieldset>
        ))}
      </div>
    </Drawer>
  );
}

/**
 * One sheet row (15.15: a label per denomination): "HKD 1,000", the count (whole numbers, the
 * numeric keypad), "=", and the row's amount. Its problem - above a million - shows as typed.
 */
function CountRow({
  denomination,
  code,
  value,
  error,
  inputRef,
  onChange,
  onEnter,
}: {
  denomination: Denomination;
  code: string | null;
  value: string;
  error?: string;
  inputRef?: Ref<HTMLInputElement>;
  onChange: (text: string) => void;
  onEnter: () => void;
}) {
  const id = countId(denomination);
  const label = denominationLabel(denomination, code);
  return (
    <div className="grid min-w-0 grid-cols-[minmax(64px,1fr)_88px_16px_minmax(88px,1fr)] items-center gap-x-2 border-b border-border-subtle py-2 last:border-b-0">
      <label htmlFor={id} className="min-w-0 text-title-m text-text-primary" translate="no">
        <span className="sr-only">Number of </span>
        {label}
        <span className="sr-only"> {kindNoun(denomination.kind)}</span>
      </label>
      <input
        ref={inputRef}
        id={id}
        name={`count-${denomination.id}`}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        placeholder="0"
        value={value}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-note` : undefined}
        onChange={(e) => onChange(sanitizeCount(e.target.value))}
        onKeyDown={(e) => {
          if (e.key !== "Enter") return;
          e.preventDefault();
          onEnter();
        }}
        className={`${inputClass(Boolean(error))} text-right`}
      />
      <span className="text-center text-text-muted" aria-hidden>
        =
      </span>
      <span
        className="min-w-0 break-all text-right text-body-m text-text-secondary"
        translate="no"
        aria-hidden
      >
        {rowTotalText(denomination, value, code)}
      </span>
      {error ? (
        <p
          id={`${id}-note`}
          role="alert"
          className="col-span-full mt-1 text-caption text-status-danger-ink"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}
