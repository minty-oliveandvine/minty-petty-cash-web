"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";

import { formatDay } from "@/lib/dates";
import { formatMoney } from "@/lib/money";

export type Confirmation = "yes" | "change" | "no";

const BACK_BUTTON =
  "flex flex-1 items-center justify-center gap-2 rounded-flask-xl border-2 border-flask-teal px-4 py-3 font-medium text-flask-teal transition-colors hover:bg-flask-teal/10 disabled:cursor-not-allowed disabled:opacity-50";
const PROCEED_BUTTON =
  "flex flex-1 items-center justify-center gap-2 rounded-flask-xl bg-flask-teal px-4 py-3 font-medium text-flask-white transition-colors hover:bg-flask-teal/80 disabled:cursor-not-allowed disabled:opacity-70";

const CLOSE_ICON = (
  <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
  </svg>
);

const NOTE_ICON = (tone: string) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor" className={`h-5 w-5 ${tone}`} aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
  </svg>
);

/**
 * Flask's modal frame: a half-black backdrop over the phone card (`absolute inset-0`, not the
 * whole window) with a white panel - 384px, 448px from 640px up, at most 90% / 80% of the height.
 * `onBackdrop` closes on a click outside the panel, as "Before You Start" does; Escape closes too
 * when there is a way to close.
 */
function Frame({
  title,
  z,
  onClose,
  onBackdrop,
  narrow = false,
  children,
}: {
  title: string;
  z: "z-30" | "z-50";
  onClose?: () => void;
  onBackdrop?: () => void;
  narrow?: boolean;
  children: ReactNode;
}) {
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    panel.current?.focus();
    if (!onClose) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div
      className={`absolute inset-0 ${z} flex items-center justify-center bg-flask-black/50 p-4`}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onBackdrop?.();
      }}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`max-h-[90vh] w-full min-w-0 overflow-y-auto rounded-flask-lg bg-flask-white p-4 outline-none sm:p-6 ${
          narrow ? "mx-auto max-w-sm" : "max-w-sm sm:max-h-[80vh] sm:max-w-md"
        }`}
      >
        <span id={titleId} className="sr-only">
          {title}
        </span>
        {children}
      </div>
    </div>
  );
}

/**
 * Flask's "Before You Start" (#startNewReportModal), exactly: before a report whose previous day put
 * cash in the bank, confirm that deposit - as stated, changed, or none. Changed or none reverses it
 * in Xero, so they are greyed out when the company lacks the accounts for that (the red box says
 * which) or the person lacks the right.
 */
export function BeforeYouStartModal({
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
  onProceed,
}: {
  onClose: () => void;
  day: string;
  amount: number;
  bankName: string;
  bankNumber: string;
  submitter: string | null;
  currencyCode: string | null;
  blockedBy: string[];
  mayCorrect: boolean;
  settingsHref: string;
  onProceed: (choice: Confirmation | null) => void;
}) {
  const [choice, setChoice] = useState<Confirmation | null>(null);
  const blocked = blockedBy.length > 0;
  const correctionOff = blocked || !mayCorrect;
  const to = amount > 0 ? (bankNumber ? `${bankName} (${bankNumber})` : bankName) : "No deposit";

  const radio = (value: Confirmation, label: string, disabled: boolean) => (
    <div className="flex items-center">
      <input
        type="radio"
        id={`confirm-${value}`}
        name="confirmation"
        value={value}
        checked={choice === value}
        disabled={disabled}
        onChange={() => setChoice(value)}
        className="flask-radio flask-radio-grey"
      />
      <label htmlFor={`confirm-${value}`} className={`ml-2 text-sm ${disabled ? "text-flask-gray-400" : "text-flask-gray-700"}`}>
        {label}
      </label>
    </div>
  );

  return (
    <Frame title="Before You Start" z="z-30" onClose={onClose} onBackdrop={onClose} narrow={choice === "change"}>
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-flask-gray-900">Before You Start</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="text-flask-gray-400 hover:text-flask-gray-600">
            {CLOSE_ICON}
          </button>
        </div>
        <p className="mt-1 text-sm text-flask-gray-500">Previous report submitted by {submitter || "—"}</p>
      </div>

      <div className="space-y-6">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-flask-gray-600">Deposited</span>
            <span className="text-sm font-bold text-flask-gray-900">{formatMoney(amount, currencyCode)}</span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-flask-gray-600">To</span>
            <span className="min-w-0 break-words text-right text-sm text-flask-gray-900">{to}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-flask-gray-600">On</span>
            <span className="text-sm text-flask-gray-900">{formatDay(day)}</span>
          </div>
        </div>

        {blocked ? (
          <div className="rounded-flask-lg border border-flask-danger-edge bg-flask-danger-bg p-4">
            <div className="flex items-start">
              <div className="flex-shrink-0">{NOTE_ICON("text-flask-danger")}</div>
              <div className="ml-3">
                <p className="text-sm font-bold text-flask-danger-ink">Deposit cannot be corrected</p>
                <p className="mt-1 text-sm text-flask-danger-ink">
                  The following entity setting(s) are not configured: <span className="font-semibold">{blockedBy.join(", ")}</span>. Configure them in{" "}
                  <a href={settingsHref} className="font-semibold underline">
                    Settings → Petty Cash
                  </a>{" "}
                  before changing or removing this deposit.
                </p>
              </div>
            </div>
          </div>
        ) : null}

        <fieldset className="space-y-3">
          <legend className="sr-only">Was the deposit made as stated?</legend>
          {radio("yes", "Yes, amount deposited as stated", false)}
          {radio("change", "No, there was a change in the details", correctionOff)}
          {radio("no", "No, there was no deposit", correctionOff)}
        </fieldset>

        {choice === "yes" ? (
          <div className="rounded-flask-lg bg-flask-amber-bg p-4">
            <div className="flex items-start">
              <div className="flex-shrink-0">{NOTE_ICON("text-flask-amber")}</div>
              <div className="ml-3">
                <p className="text-sm text-flask-amber-ink">
                  <span className="font-bold">Please Note:</span>
                </p>
                <p className="mt-1 text-sm text-flask-amber-ink">
                  By proceeding, you confirm that the stated deposit is accurate and has been deposited to the specified bank.
                </p>
              </div>
            </div>
          </div>
        ) : choice ? (
          <div className="rounded-flask-lg border border-flask-danger-edge bg-flask-danger-bg p-4">
            <div className="flex items-start">
              <div className="flex-shrink-0">{NOTE_ICON("text-flask-danger")}</div>
              <div className="ml-3">
                <p className="text-sm text-flask-danger-ink">
                  <span className="font-bold">Please Note:</span>
                </p>
                <p className="mt-1 text-sm text-flask-danger-ink">By proceeding, you confirm that stated deposit amount will be reversed in Xero.</p>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      <div className="mt-6 flex gap-3">
        <button type="button" onClick={onClose} className={BACK_BUTTON}>
          Back
        </button>
        <button type="button" onClick={() => onProceed(choice)} className={PROCEED_BUTTON}>
          Proceed
        </button>
      </div>
    </Frame>
  );
}

/**
 * Flask's `formatCurrencyModal` as you type: digits and one point, two decimals at most, thousands
 * commas. (Flask also turned a zero into "-", which made "0.50" impossible to type - not kept.)
 */
export function formatAmountTyping(raw: string): string {
  const digits = raw.replace(/[^\d.]/g, "");
  if (!digits) return "";
  const [whole, ...rest] = digits.split(".");
  const wholeNumber = whole.replace(/^0+(?=\d)/, "") || (rest.length ? "0" : "");
  const grouped = wholeNumber.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return rest.length ? `${grouped}.${rest.join("").slice(0, 2)}` : grouped;
}

/** Flask's `formatWithCommasModal` on blur: two decimals always. */
export function formatAmountBlur(text: string): string {
  if (text === "") return text;
  const [whole, decimals = ""] = text.split(".");
  return `${whole || "0"}.${decimals.padEnd(2, "0")}`;
}

export function parseAmount(text: string): number {
  return Number(text.replace(/,/g, "")) || 0;
}

/**
 * Flask's "Deposit to Bank" (#depositModal), reached by "No, there was a change": the amount really
 * deposited. Its Bank Account and Deposit Date fields were always hidden in Flask and are not drawn.
 */
export function DepositModal({
  onBack,
  onClose,
  currencyCode,
  busy,
  onProceed,
}: {
  onBack: () => void;
  onClose: () => void;
  currencyCode: string | null;
  busy: boolean;
  onProceed: (amount: number) => void;
}) {
  const [value, setValue] = useState("");
  const fieldId = useId();
  return (
    <Frame title="Deposit to Bank" z="z-50" onClose={busy ? undefined : onClose}>
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-xl font-bold text-flask-gray-900">Deposit to Bank</h2>
        <button type="button" onClick={onClose} aria-label="Close" className="text-flask-gray-400 hover:text-flask-gray-600">
          {CLOSE_ICON}
        </button>
      </div>
      <div className="space-y-6">
        <div>
          <label htmlFor={fieldId} className="mb-2 block text-sm font-medium text-flask-gray-700">
            Deposit Amount <span className="text-flask-red-500">*</span>
          </label>
          <div className="relative">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
              <span className="text-sm text-flask-gray-500">{currencyCode || "$"}</span>
            </div>
            <input
              id={fieldId}
              type="text"
              inputMode="decimal"
              autoComplete="off"
              placeholder="Enter amount deposited to bank"
              value={value}
              onChange={(e) => setValue(formatAmountTyping(e.target.value))}
              onBlur={() => setValue(formatAmountBlur(value))}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !busy) onProceed(parseAmount(value));
              }}
              className="w-full rounded-flask-2xl border border-flask-gray-300 bg-flask-white py-3 pl-12 pr-3 text-flask-gray-700 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-flask-teal"
            />
          </div>
        </div>
      </div>
      <div className="mt-6 flex gap-3">
        <button type="button" onClick={onBack} disabled={busy} className={BACK_BUTTON}>
          Back
        </button>
        <button type="button" onClick={() => onProceed(parseAmount(value))} disabled={busy} className={PROCEED_BUTTON}>
          {busy ? (
            <>
              <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-flask-white border-t-transparent" aria-hidden="true" />
              Please wait...
            </>
          ) : (
            "Proceed"
          )}
        </button>
      </div>
    </Frame>
  );
}

/** Flask's "Setup Required" (#setupSettingsModal), exactly: it cannot be dismissed - the only way on is the settings. */
export function SetupRequiredModal({ missing, settingsHref }: { missing: string[]; settingsHref: string }) {
  return (
    <Frame title="Setup Required" z="z-50">
      <div className="mb-6">
        <h2 className="text-xl font-bold text-flask-gray-900">Setup Required</h2>
        <p className="mt-2 text-sm text-flask-gray-600">Please complete your entity settings before proceeding.</p>
      </div>
      <div className="space-y-4">
        <div className="rounded-flask-lg border-l-4 border-l-flask-amber bg-flask-amber-bg p-4">
          <div className="flex items-start">
            <div className="flex-shrink-0">{NOTE_ICON("text-flask-amber")}</div>
            <div className="ml-3 flex-1">
              <p className="mb-2 text-sm font-semibold text-flask-amber-ink">Missing Settings:</p>
              <ul className="list-inside list-disc space-y-1 text-sm text-flask-amber-ink">
                {missing.length ? missing.map((m) => <li key={m}>{m}</li>) : <li>One or more required settings are missing</li>}
              </ul>
            </div>
          </div>
        </div>
      </div>
      <div className="mt-6">
        <a
          href={settingsHref}
          className="flex w-full items-center justify-center gap-2 rounded-flask-xl bg-flask-teal px-4 py-3 font-medium text-flask-white transition-colors hover:bg-flask-teal/80"
        >
          Set Up Settings
        </a>
      </div>
    </Frame>
  );
}
