"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type MouseEvent } from "react";

import { useAmountInput } from "@minty/shared/amountInput";
import { formatAmount } from "@minty/shared/money";

import { PhoneCard } from "@/components/flask/PhoneCard";
import { Stepper } from "@/components/flask/Stepper";
import { useToast } from "@/components/flask/Toasts";
import {
  FieldMessage,
  FixNegativeBalanceModal,
  FixStepButton,
  LoadingOverlay,
  ReportBadge,
  SaveButtons,
  StepImage,
  fixNote,
} from "@/components/report/ReportChrome";
import { fieldOf, sentenceOf, toOpening, useBackToOpening } from "@/components/report/stepErrors";
import { entityAcronym } from "@/lib/acronym";
import { ApiError, pettyCashFetch } from "@/lib/apiClient";
import { depositProblem, type DepositPage } from "@/lib/cash";
import { pettyCashHome } from "@/lib/companyPages";
import { parseMoney } from "@/lib/currencyInput";
import { formatMoney } from "@/lib/money";
import { datePill } from "@/lib/opening";
import { changed } from "@/lib/sales";
import { useAuth } from "@/lib/useAuth";
import { stepHref, type WizardStep } from "@/lib/wizardPages";

const UNREACHABLE = "We couldn't reach Petty Cash. Check your connection, then reload the page.";
const UNSAVED = "You have unsaved changes. Please save your changes first.";
const SAVE_FAILED = "I couldn't save that. Mind trying again?";

type SaveAnswer = { next: "cash_count" | "dashboard"; transaction_date: string };

/**
 * The report wizard's Bank Deposit step - a pixel-faithful port of Flask's `report/deposit.html`:
 * the report header, the stepper, "Deposit to Bank", one card with the illustration, "Current
 * Balance" (the cash on hand before the deposit) and "Deposit Amount", then Save & Next / Save &
 * Exit, and the "Fix Negative Balance" modal when the cash on hand is already below zero. Reads and
 * saves through `GET`/`PUT /reports/deposit` (Minty `petty_cash_api/routes/cash.py`).
 *
 * The owner's rule (2026-10-15): the deposit can't be more than the cash on hand - said under the
 * field as it is typed, and refused by the API (422) whatever the page does.
 */
export function DepositStep({ day }: { day: string | null }) {
  const toast = useToast();
  const auth = useAuth();
  const backToOpening = useBackToOpening();
  const [page, setPage] = useState<DepositPage | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    pettyCashFetch<DepositPage>("/reports/deposit", {
      query: { transaction_date: day ?? undefined },
    })
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
  return (
    <DepositForm
      page={page}
      entityId={auth.entityId}
      entityName={auth.entityName}
      acronym={acronym}
    />
  );
}

function DepositForm({
  page,
  entityId,
  entityName,
  acronym,
}: {
  page: DepositPage;
  entityId: string;
  entityName: string;
  acronym: string;
}) {
  const toast = useToast();
  const router = useRouter();
  const backToOpening = useBackToOpening();
  const home = pettyCashHome(entityId, entityName);
  const code = page.currency_code;
  const day = page.transaction_date;
  const progress = page.draft ?? { current_section: null, completed_sections: [] };
  const [initial] = useState(() => (page.bank_deposit > 0 ? formatAmount(page.bank_deposit) : ""));
  const [amount, setAmount] = useState(initial);
  // the API's refusal of the value it was sent; cleared as soon as the value changes
  const [refused, setRefused] = useState<string | null>(null);
  const amountInput = useAmountInput({
    value: amount,
    onValue: (v) => {
      setAmount(v);
      setRefused(null);
    },
  });
  const [busy, setBusy] = useState<string | null>(null);
  const [negative, setNegative] = useState(page.cash_on_hand < 0);
  const field = useRef<HTMLInputElement>(null);

  // with the cash on hand already below zero, Fix Negative Balance is the message
  const problem =
    refused ??
    (page.cash_on_hand < 0 ? null : depositProblem(parseMoney(amount), page.cash_on_hand, code));

  function onStepClick(event: MouseEvent<HTMLAnchorElement>) {
    if (changed(amount, initial)) {
      event.preventDefault();
      toast(UNSAVED, "warning");
    }
  }

  function go(step: WizardStep) {
    router.push(stepHref(entityId, entityName, step, day));
  }

  async function save(action: "next" | "exit") {
    if (page.cash_on_hand < 0) {
      setNegative(true);
      return;
    }
    if (problem) {
      field.current?.focus();
      return;
    }
    setBusy("Saving...");
    try {
      const answer = await pettyCashFetch<SaveAnswer>("/reports/deposit", {
        method: "PUT",
        json: { transaction_date: day, bank_deposit: parseMoney(amount), action },
      });
      if (answer.next === "dashboard") router.push(home);
      else go("cash_count");
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return;
      setBusy(null);
      const sentence = sentenceOf(err) ?? SAVE_FAILED;
      if (toOpening(err)) backToOpening(sentence, day);
      else if (fieldOf(err) === "bank_deposit") {
        setRefused(sentence);
        field.current?.focus();
      } else toast(sentence, "error");
    }
  }

  function fix(step: WizardStep) {
    setNegative(false);
    setBusy("Redirecting...");
    go(step);
  }

  const overlays = (
    <>
      {busy ? <LoadingOverlay text={busy} /> : null}
      {negative ? (
        <FixNegativeBalanceModal
          balance={page.cash_on_hand}
          currencyCode={code}
          message="Cash balance cannot be negative. Choose from below to edit the error:"
          window
        >
          <FixStepButton
            label="Opening"
            note={fixNote("Cash in", page.cash_addition, code)}
            noteClass="text-flask-green"
            onClick={() => fix("opening")}
          />
          <FixStepButton
            label="Sales"
            note={fixNote("Cash in", page.cash_sales, code)}
            noteClass="text-flask-green"
            onClick={() => fix("sales")}
          />
          <FixStepButton
            label="Expenses"
            note={fixNote("Cash out", page.expenses, code)}
            noteClass="text-flask-red"
            onClick={() => fix("expenses")}
          />
        </FixNegativeBalanceModal>
      ) : null}
    </>
  );

  return (
    <PhoneCard
      acronym={acronym}
      datePill={datePill(day)}
      badge={<ReportBadge draft={page.draft} />}
      backHref={home}
      stepper={
        <Stepper
          draft={progress}
          page="deposit"
          stepHref={(step) => stepHref(entityId, entityName, step, day)}
          onStepClick={onStepClick}
        />
      }
      overlays={overlays}
    >
      <div className="mb-6 text-left">
        <h2 className="text-lg font-bold text-flask-gray-700 sm:text-xl">Deposit to Bank</h2>
      </div>

      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void save("next");
        }}
      >
        <div className="mb-6 rounded-flask-lg bg-flask-white p-6 shadow-flask-sm">
          <StepImage
            src="/img/deposit.webp"
            alt="Deposit"
            width={240}
            height={282}
            boxClass="mb-10 w-[240px]"
            minHeight={164}
            skeleton={170}
          />

          <div className="mb-6">
            <p className="text-sm text-flask-gray-600">
              <span>Current Balance: </span>
              <span className="font-semibold break-all">
                {formatMoney(page.cash_on_hand, code)}
              </span>
            </p>
          </div>

          <div className="mb-6">
            <label
              htmlFor="bank_deposit"
              className="mb-2 block text-sm font-medium text-flask-gray-700"
            >
              Deposit Amount
            </label>
            <div className="relative">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                <span className="text-sm text-flask-gray-500">{code}</span>
              </div>
              <input
                ref={field}
                id="bank_deposit"
                name="bank_deposit"
                autoComplete="off"
                placeholder="0.00"
                {...amountInput}
                aria-invalid={problem ? true : undefined}
                aria-describedby={problem ? "bank_deposit_message" : undefined}
                onFocus={(e) => {
                  const input = e.currentTarget;
                  window.setTimeout(
                    () => input.scrollIntoView({ block: "center", behavior: "smooth" }),
                    300,
                  );
                }}
                className={`w-full cursor-pointer rounded-flask-2xl border bg-flask-white py-3 pl-12 pr-3 text-flask-black focus:border-transparent focus:outline-none focus:ring-2 focus:ring-flask-teal ${
                  problem ? "border-flask-red-500" : "border-flask-gray-300"
                }`}
              />
            </div>
            {problem ? <FieldMessage id="bank_deposit_message">{problem}</FieldMessage> : null}
          </div>
        </div>

        <SaveButtons disabled={busy !== null} onExit={() => void save("exit")} />
      </form>
    </PhoneCard>
  );
}
