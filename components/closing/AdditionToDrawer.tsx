"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { buttonClass, InlineAlert, PageBanner } from "@minty/shared/ui";

import { AmountInput, openStep, refused, StageActions, StagePage, stageSteps, useLeaveHold, WorkflowHeader, type StageContext } from "@/components/closing/Stage";
import { negativeGate, openingCash, signedMoney, startingSource, startingSplit } from "@/lib/addition";
import { pettyCashFetch } from "@/lib/apiClient";
import { groupMoney, parseMoney } from "@/lib/currencyInput";
import { formatMoney } from "@/lib/money";
import type { OpeningPage, OpeningSaved } from "@/lib/opening";
import { reportStatus } from "@/lib/reportStatus";

const STAGE = "Addition to Drawer";
const GUIDANCE = "Add any cash you put into the drawer before the day starts.";

type Withdrawal = "company" | "personal";

/**
 * The Daily Closing's first stage, "Addition to Drawer" (Part 15.9a operational workflow, 15.15b;
 * Flask's Opening section, renamed): the Workflow header (the day, its status, the five stages,
 * the stage title and one line of guidance), the starting cash as read-only facts, the cash added
 * to the drawer and where it came from, the opening cash as the stage summary, then Save & Next /
 * Save & Exit - in a 720 column, phone first (components/closing/Stage.tsx). Reads and saves
 * through `GET`/`PUT /reports/opening` (Minty `petty_cash_api/routes/opening.py`); its rules are
 * lib/addition.ts.
 */
export function AdditionToDrawer({ day }: { day: string | null }) {
  return (
    <StagePage<OpeningPage> path="/reports/opening" day={day} title={STAGE} guidance={GUIDANCE}>
      {(page, context) => <StageForm page={page} {...context} />}
    </StagePage>
  );
}

function StageForm({ page, entityId, entityName, home, notice }: { page: OpeningPage } & StageContext) {
  const router = useRouter();
  const savedAddition = page.cash_addition ?? 0;
  const savedWithdrawal: Withdrawal = page.withdrawal === "company" ? "company" : "personal";
  const [addition, setAddition] = useState(page.cash_addition ? groupMoney(String(page.cash_addition)) : "");
  const [withdrawal, setWithdrawal] = useState<Withdrawal>(savedWithdrawal);
  const [saving, setSaving] = useState<"next" | "exit" | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const field = useRef<HTMLInputElement>(null);

  const code = page.currency_code;
  const day = page.transaction_date;
  const opening = openingCash(page, addition);
  const gate = negativeGate(page, opening);
  const source = startingSource(page);
  const split = startingSplit(page);
  const dirty = parseMoney(addition) !== savedAddition || withdrawal !== savedWithdrawal;
  const hold = useLeaveHold(dirty, saving !== null);
  const progress = page.draft ?? { current_section: null, completed_sections: [] };
  const push = (href: string) => router.push(href);

  async function save(action: "next" | "exit") {
    if (saving) return;
    setProblem(null);
    hold.release();
    if (gate) {
      // The rule is already on screen beside the amount; take the person to it.
      field.current?.focus();
      return;
    }
    setSaving(action);
    try {
      const answer = await pettyCashFetch<OpeningSaved>("/reports/opening", {
        method: "PUT",
        json: { transaction_date: day, cash_addition: parseMoney(addition), withdrawal, action },
      });
      if (answer.next === "sales") openStep(push, entityId, entityName, "sales", answer.transaction_date);
      else push(home);
    } catch (err) {
      const message = refused(err, { here: "drawer", push, entityId, entityName, home, day });
      if (message === undefined) return;
      setSaving(null);
      setProblem(message);
    }
  }

  const header = (
    <>
      <WorkflowHeader
        home={home}
        day={day}
        title={STAGE}
        guidance={GUIDANCE}
        status={reportStatus(page.draft)}
        steps={stageSteps(entityId, entityName, progress, "drawer", day)}
        onLeave={hold.onLeave}
        held={hold.held}
      />
      {notice}
    </>
  );

  if (gate?.kind === "last-closing") {
    // Part 15.9e business-rule gate: the rule, the reason, one action. Nothing here can fix it.
    return (
      <>
        {header}
        <PageBanner
          tone="warning"
          title="Your last closing ended below zero"
          action={
            <Link href={home} className={buttonClass("link")}>
              Go to Petty Cash
            </Link>
          }
        >
          It closed at <span translate="no">{signedMoney(gate.balance, code)}</span>, and a day can&apos;t start from
          negative cash. This usually means the bank deposit was more than the cash in the drawer. Correct the deposit
          from Petty Cash, then start this day again.
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
        <section aria-label={STAGE} className="flex flex-col gap-5 rounded-xl border border-border-subtle bg-surface-card p-4 sm:p-6">
          <dl className="flex flex-col gap-2">
            <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5">
              <dt className="min-w-0 text-body-m font-semibold text-text-primary">Starting cash</dt>
              <dd className="shrink-0 text-body-m font-semibold text-text-primary" translate="no">
                {signedMoney(page.starting_cash_balance, code)}
              </dd>
              {source !== "none" ? (
                <dd className="basis-full text-body-s text-text-secondary">
                  {source === "last-closing" ? "Carried over from your last Daily Closing." : "Your opening balance from setup."}
                </dd>
              ) : null}
            </div>
            {split ? (
              <>
                <div className="flex min-w-0 items-baseline justify-between gap-4">
                  <dt className="min-w-0 text-body-m text-text-secondary">In the cash drawer</dt>
                  <dd className="shrink-0 text-body-m text-text-secondary" translate="no">
                    {signedMoney(split.drawer, code)}
                  </dd>
                </div>
                <div className="flex min-w-0 items-baseline justify-between gap-4">
                  <dt className="min-w-0 text-body-m text-text-secondary">In the safebox</dt>
                  <dd className="shrink-0 text-body-m text-text-secondary" translate="no">
                    {signedMoney(split.safebox, code)}
                  </dd>
                </div>
              </>
            ) : null}
          </dl>

          <hr className="border-border-subtle" />

          <AmountInput
            label="Cash added to the drawer"
            name="cash_addition"
            code={code}
            value={addition}
            onChange={setAddition}
            helper="Optional. Leave it empty when no cash was added."
            disabled={saving !== null}
            inputRef={field}
          />

          <fieldset className="flex min-w-0 flex-col gap-1.5">
            <legend className="mb-1.5 text-label text-text-secondary">Where the cash came from</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {(
                [
                  ["company", "Company bank"],
                  ["personal", "Personal"],
                ] as const
              ).map(([value, label]) => (
                <label
                  key={value}
                  className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-3 text-body-m text-text-primary has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-border-focus ${
                    withdrawal === value ? "border-2 border-border-focus bg-state-selected" : "border border-border-default hover:bg-state-hover"
                  }`}
                >
                  <input
                    type="radio"
                    name="withdrawal"
                    value={value}
                    checked={withdrawal === value}
                    disabled={saving !== null}
                    onChange={() => setWithdrawal(value)}
                    className="size-5 shrink-0 accent-action-primary"
                  />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>
        </section>

        {/* The stage summary (15.9 / 15.15): the running total, as plain text, never coloured. */}
        <div className="flex flex-col gap-3">
          <dl className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 rounded-lg bg-surface-sunk px-4 py-3">
            <dt className="min-w-0 text-title-m text-text-primary">Opening cash</dt>
            <dd className="shrink-0 text-title-m text-text-primary" translate="no" aria-live="polite">
              {signedMoney(opening, code)}
            </dd>
            <dd className="basis-full text-body-s text-text-secondary">Starting cash plus the cash added.</dd>
          </dl>
          {gate?.kind === "short" ? (
            <InlineAlert tone="warning" title="Opening cash is below zero">
              Add at least <span translate="no">{formatMoney(gate.addAtLeast, code)}</span> to the drawer to continue.
            </InlineAlert>
          ) : null}
          {problem ? <InlineAlert tone="danger">{problem}</InlineAlert> : null}
        </div>

        <StageActions saving={saving} onExit={() => void save("exit")} />
      </form>
    </>
  );
}
