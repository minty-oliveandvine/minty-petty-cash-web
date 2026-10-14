"use client";

import { useId, useState } from "react";

import { Button, buttonClass, Field, InlineAlert, inputClass, Modal } from "@minty/shared/ui";

import { formatDay } from "@/lib/dates";
import { formatMoney } from "@/lib/money";

export type Confirmation = "yes" | "change" | "no";

/**
 * Flask's "Before You Start" (#startNewReportModal): before a report whose previous day put cash
 * in the bank, the person confirms that deposit - as stated, changed, or none. Changed or none is
 * reversed in Xero, so it is blocked (with the reason) when the company lacks the accounts to do
 * that, or the person lacks the right.
 */
export function BeforeYouStartModal({
  open,
  onClose,
  day,
  amount,
  bankName,
  bankNumber,
  submitter,
  currencyCode,
  blockedBy,
  mayCorrect,
  settingsHref,
  busy,
  problem,
  onProceed,
}: {
  open: boolean;
  onClose: () => void;
  /** The previous day - the one whose deposit is confirmed. */
  day: string;
  amount: number;
  bankName: string;
  bankNumber: string;
  submitter: string | null;
  currencyCode: string | null;
  /** Settings missing for a correction ("Deposit Bank Account", "Petty Cash Account"). */
  blockedBy: string[];
  /** REPORT_EDIT_ENTITY - without it only "Yes" is offered. */
  mayCorrect: boolean;
  settingsHref: string;
  busy: boolean;
  problem: string | null;
  onProceed: (choice: Confirmation) => void;
}) {
  const [choice, setChoice] = useState<Confirmation | null>(null);
  const [tried, setTried] = useState(false);
  const name = useId();
  const blocked = blockedBy.length > 0;
  const to = amount > 0 ? (bankNumber ? `${bankName} (${bankNumber})` : bankName) : "No deposit";

  const option = (value: Confirmation, label: string, disabled: boolean) => (
    <label
      className={`flex min-h-11 items-center gap-3 rounded-lg border px-3 ${
        choice === value ? "border-2 border-border-focus bg-state-selected" : "border-border-default"
      } ${disabled ? "cursor-not-allowed text-text-disabled" : "cursor-pointer text-text-primary"}`}
    >
      <input
        type="radio"
        name={name}
        value={value}
        checked={choice === value}
        disabled={disabled}
        onChange={() => setChoice(value)}
        className="size-5 accent-action-primary"
      />
      <span className="text-body-m">{label}</span>
    </label>
  );

  return (
    <Modal
      open={open}
      onRequestClose={onClose}
      title="Before You Start"
      description={`Previous report submitted by ${submitter || "—"}`}
      footer={
        <>
          <Button kind="secondary" onClick={onClose} disabled={busy}>
            Back
          </Button>
          <Button
            kind="primary"
            processing={busy}
            processingLabel="Please wait…"
            onClick={() => {
              setTried(true);
              if (choice) onProceed(choice);
            }}
          >
            Proceed
          </Button>
        </>
      }
    >
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-body-m">
        <dt className="text-text-secondary">Deposited</dt>
        <dd className="text-right text-text-primary">{formatMoney(amount, currencyCode)}</dd>
        <dt className="text-text-secondary">To</dt>
        <dd className="min-w-0 break-words text-right text-text-primary">{to}</dd>
        <dt className="text-text-secondary">On</dt>
        <dd className="text-right text-text-primary">{formatDay(day)}</dd>
      </dl>

      {blocked ? (
        <InlineAlert tone="danger" title="Deposit cannot be corrected" className="mt-4">
          The following entity setting(s) are not configured: <strong>{blockedBy.join(", ")}</strong>. Configure them in{" "}
          <a href={settingsHref} className="underline">
            Settings → Petty Cash
          </a>{" "}
          before changing or removing this deposit.
        </InlineAlert>
      ) : null}

      <fieldset className="mt-4 flex flex-col gap-2">
        <legend className="sr-only">Was the deposit made as stated?</legend>
        {option("yes", "Yes, amount deposited as stated", false)}
        {option("change", "No, there was a change in the details", blocked || !mayCorrect)}
        {option("no", "No, there was no deposit", blocked || !mayCorrect)}
      </fieldset>
      {!mayCorrect && !blocked ? (
        <p className="mt-2 text-body-s text-text-secondary">Only a shop manager or above can change or remove a deposit.</p>
      ) : null}

      {choice === "yes" ? (
        <InlineAlert tone="warning" title="Please Note:" className="mt-4">
          By proceeding, you confirm that the stated deposit is accurate and has been deposited to the specified bank.
        </InlineAlert>
      ) : choice ? (
        <InlineAlert tone="danger" title="Please Note:" className="mt-4">
          By proceeding, you confirm that stated deposit amount will be reversed in Xero.
        </InlineAlert>
      ) : tried ? (
        <p className="mt-3 text-body-s text-status-danger-ink" role="alert">
          Choose one of the answers above to continue.
        </p>
      ) : null}

      {problem ? (
        <InlineAlert tone="danger" className="mt-4">
          {problem}
        </InlineAlert>
      ) : null}
    </Modal>
  );
}

/** Digits and one point, at most two decimals - Flask's `formatCurrencyModal`, without the commas. */
function cleanAmount(raw: string): string {
  const digits = raw.replace(/[^\d.]/g, "");
  const [whole, ...rest] = digits.split(".");
  return rest.length ? `${whole}.${rest.join("").slice(0, 2)}` : whole;
}

/**
 * Flask's "Deposit to Bank" (#depositModal), reached by "No, there was a change": the amount
 * that was really deposited, never more than the stated one. Checked as it is typed.
 */
export function DepositModal({
  open,
  onBack,
  previousAmount,
  currencyCode,
  busy,
  problem,
  onProceed,
}: {
  open: boolean;
  onBack: () => void;
  previousAmount: number;
  currencyCode: string | null;
  busy: boolean;
  problem: string | null;
  onProceed: (amount: number) => void;
}) {
  const [value, setValue] = useState("");
  const [refused, setRefused] = useState(false);
  const amount = value === "" || value === "." ? 0 : Number(value);
  const tooHigh = amount > previousAmount;
  const empty = value === "";
  const error = tooHigh
    ? `The deposit can't be higher than the previous one. Enter ${formatMoney(previousAmount, currencyCode)} or less.`
    : refused && empty
      ? "The deposit amount is still empty. Enter the amount deposited, or 0."
      : null;

  return (
    <Modal
      open={open}
      onRequestClose={onBack}
      title="Deposit to Bank"
      footer={
        <>
          <Button kind="secondary" onClick={onBack} disabled={busy}>
            Back
          </Button>
          <Button
            kind="primary"
            processing={busy}
            processingLabel="Please wait…"
            onClick={() => {
              if (empty || tooHigh) {
                setRefused(true);
                return;
              }
              onProceed(amount);
            }}
          >
            Proceed
          </Button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (empty || tooHigh) setRefused(true);
          else onProceed(amount);
        }}
      >
        <Field label="Deposit Amount" required error={error}>
          {(a11y) => (
            <div className="relative">
              <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-body-m text-text-secondary">
                {currencyCode || "$"}
              </span>
              <input
                {...a11y}
                type="text"
                inputMode="decimal"
                autoComplete="off"
                placeholder="Enter amount deposited to bank"
                value={value}
                onChange={(e) => setValue(cleanAmount(e.target.value))}
                className={`${inputClass(!!error)} pl-14`}
              />
            </div>
          )}
        </Field>
      </form>
      {problem ? (
        <InlineAlert tone="danger" className="mt-4">
          {problem}
        </InlineAlert>
      ) : null}
    </Modal>
  );
}

/**
 * Flask's "Setup Required" (#setupSettingsModal): the company's Xero account settings are not
 * complete, so the dashboard is held until they are. It cannot be dismissed - only the way to
 * the settings is offered.
 */
export function SetupRequiredModal({ open, missing, settingsHref }: { open: boolean; missing: string[]; settingsHref: string }) {
  return (
    <Modal
      open={open}
      onRequestClose={() => undefined}
      role="alertdialog"
      title="Setup Required"
      description="Please complete your entity settings before proceeding."
      footer={
        <a href={settingsHref} className={buttonClass("primary")}>
          Set Up Settings
        </a>
      }
    >
      <InlineAlert tone="warning" title="Missing Settings:">
        {missing.length ? (
          <ul className="list-disc pl-5">
            {missing.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        ) : (
          "One or more required settings are missing"
        )}
      </InlineAlert>
    </Modal>
  );
}
