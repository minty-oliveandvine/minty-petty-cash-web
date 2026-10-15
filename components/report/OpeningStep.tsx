"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type MouseEvent } from "react";

import { PhoneCard } from "@/components/flask/PhoneCard";
import { Stepper } from "@/components/flask/Stepper";
import { useToast } from "@/components/flask/Toasts";
import { LoadingOverlay, ReportBadge } from "@/components/report/ReportChrome";
import { entityAcronym } from "@/lib/acronym";
import { ApiError, pettyCashFetch } from "@/lib/apiClient";
import { pettyCashHome } from "@/lib/companyPages";
import { groupMoney, parseMoney, sanitizeMoney } from "@/lib/currencyInput";
import { setFlash } from "@/lib/flash";
import { leaveTo } from "@/lib/handoff";
import { formatMoney } from "@/lib/money";
import { datePill, type OpeningPage } from "@/lib/opening";
import { useAuth } from "@/lib/useAuth";
import { isPorted, stepHref } from "@/lib/wizardPages";

const UNREACHABLE = "We couldn't reach Petty Cash. Check your connection, then reload the page.";
const UNSAVED = "You have unsaved changes. Please save your changes first.";

type SaveAnswer = { next: "sales" | "dashboard"; transaction_date: string };

/**
 * The report wizard's Opening step - a pixel-faithful port of Flask's `report/opening.html`: the
 * report header (date pill, initials, Draft badge), the stepper, the illustration, the Starting
 * Cash / Cash Till / Safebox box, "Addition to Cash Drawer", "Withdrawal from:", the Opening Cash
 * Balance, Save & Next / Save & Exit, and the Fix Negative Balance modal. Reads and saves through
 * `GET`/`PUT /reports/opening` (Minty `petty_cash_api/routes/opening.py`).
 */
export function OpeningStep({ day }: { day: string | null }) {
  const toast = useToast();
  const auth = useAuth();
  const [page, setPage] = useState<OpeningPage | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    pettyCashFetch<OpeningPage>("/reports/opening", { query: { transaction_date: day ?? undefined } })
      .then((answer) => live && setPage(answer))
      .catch((err: unknown) => {
        if (!live || (err instanceof ApiError && err.status === 401)) return;
        setFailed(true);
        toast(err instanceof ApiError ? err.message : UNREACHABLE, "error");
      });
    return () => {
      live = false;
    };
  }, [day, toast]);

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
  return <OpeningForm page={page} entityId={auth.entityId} entityName={auth.entityName} acronym={acronym} />;
}

function OpeningForm({ page, entityId, entityName, acronym }: { page: OpeningPage; entityId: string; entityName: string; acronym: string }) {
  const toast = useToast();
  const router = useRouter();
  const home = pettyCashHome(entityId, entityName);
  const initialAddition = page.cash_addition ? groupMoney(String(page.cash_addition)) : "";
  const [addition, setAddition] = useState(initialAddition);
  const [withdrawal, setWithdrawal] = useState<"company" | "personal">(page.withdrawal === "company" ? "company" : "personal");
  const [withdrawalDirty, setWithdrawalDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [negative, setNegative] = useState(page.yesterday_closing_balance < 0);
  const [imageLoaded, setImageLoaded] = useState(false);
  const field = useRef<HTMLInputElement>(null);

  const code = page.currency_code;
  const day = page.transaction_date;
  const opening = page.starting_cash_balance + parseMoney(addition);
  const progress = page.draft ?? { current_section: null, completed_sections: [] };

  function dirty(): boolean {
    if (withdrawalDirty) return true;
    const now = addition.replace(/,/g, "");
    return now !== "" && now !== "-" && now !== initialAddition.replace(/,/g, "");
  }

  function onStepClick(event: MouseEvent<HTMLAnchorElement>) {
    if (dirty()) {
      event.preventDefault();
      toast(UNSAVED, "warning");
    }
  }

  async function save(action: "next" | "exit") {
    if (opening < 0) {
      setNegative(true);
      return;
    }
    setSaving(true);
    try {
      const answer = await pettyCashFetch<SaveAnswer>("/reports/opening", {
        method: "PUT",
        json: { transaction_date: day, cash_addition: parseMoney(addition), withdrawal, action },
      });
      if (answer.next !== "sales") router.push(home);
      else if (isPorted("sales")) router.push(stepHref(entityId, entityName, "sales", answer.transaction_date));
      else leaveTo(stepHref(entityId, entityName, "sales", answer.transaction_date));
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return;
      const body = err instanceof ApiError ? (err.body as { to?: string } | null) : null;
      const message = err instanceof ApiError ? err.message : "I couldn't save that. Mind trying again?";
      if (body?.to === "dashboard") {
        // Flask sends a refused day to the dashboard and shows why there.
        setFlash(message, "error");
        router.push(home);
        return;
      }
      setSaving(false);
      toast(message, "error");
    }
  }

  const overlays = (
    <>
      {saving ? <LoadingOverlay /> : null}
      {negative ? (
        <FixNegativeBalanceModal
          balance={page.yesterday_closing_balance}
          currencyCode={code}
          onDashboard={() => {
            setNegative(false);
            setSaving(true);
            router.push(home);
          }}
        />
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
          page="opening"
          stepHref={(step) => stepHref(entityId, entityName, step, day)}
          onStepClick={onStepClick}
        />
      }
      overlays={overlays}
    >
      <div className="mb-6 text-left">
        <h2 className="text-lg font-bold text-flask-gray-700 sm:text-xl">Opening</h2>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save("next");
        }}
      >
        <div className="mb-6 rounded-flask-lg bg-flask-white p-6 shadow-flask-sm">
          <div className="mb-2">
          <div className="relative mx-auto mb-10 block w-[240px]" style={{ minHeight: imageLoaded ? "auto" : 156 }}>
            {!imageLoaded ? (
              <div className="absolute left-1/2 top-1/2 h-[170px] w-[170px] -translate-x-1/2 -translate-y-1/2 animate-pulse rounded-full bg-flask-gray-200" />
            ) : null}
            <Image
              src="/img/opening.webp"
              alt="Opening"
              width={240}
              height={156}
              unoptimized
              priority
              onLoad={() => setImageLoaded(true)}
              className={`h-auto w-[240px] transition-opacity duration-300 ${imageLoaded ? "opacity-100" : "opacity-0"}`}
            />
          </div>

          <div className="rounded-flask-2xl bg-flask-gray-100 p-4">
            <div className="flex items-center justify-between border-b border-flask-gray-300 pb-2">
              <span className="text-sm font-medium text-flask-gray-500">Starting Cash Balance</span>
              <span className="text-sm font-medium text-flask-gray-500">{formatMoney(page.starting_cash_balance, code)}</span>
            </div>
            <div className="pt-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-flask-gray-400">Cash Till Balance</span>
                <span className="text-sm font-medium text-flask-gray-400">
                  {formatMoney(page.yesterday_closing_balance - page.safebox_balance, code)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-flask-gray-400">Safebox</span>
                <span className="text-sm font-medium text-flask-gray-400">{formatMoney(page.safebox_balance, code)}</span>
              </div>
            </div>
          </div>
          </div>

          <div className="mb-4">
            <label htmlFor="additiontocashbalance" className="mb-2 block text-sm font-medium text-flask-gray-700">
              Addition to Cash Drawer
            </label>
            <div className="relative">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                <span className="text-sm text-flask-gray-500">{code || "$"}</span>
              </div>
              <input
                ref={field}
                id="additiontocashbalance"
                name="cash_addition"
                type="text"
                inputMode="decimal"
                autoComplete="off"
                placeholder="Please enter any cash addition"
                value={addition}
                onChange={(e) => setAddition(sanitizeMoney(e.target.value))}
                onBlur={() => setAddition(groupMoney(addition))}
                onFocus={() => window.setTimeout(() => field.current?.scrollIntoView({ block: "center", behavior: "smooth" }), 300)}
                className="w-full cursor-pointer rounded-flask-xl border border-flask-gray-300 bg-flask-white py-3 pl-12 pr-3 text-flask-gray-700 placeholder:text-flask-gray-500 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-flask-teal"
              />
            </div>
          </div>

          <fieldset className="mb-4">
            <legend className="mb-2 block text-sm font-medium text-flask-gray-700">Withdrawal from:</legend>
            <div className="space-y-2">
              {(
                [
                  ["company", "Company Bank"],
                  ["personal", "Personal"],
                ] as const
              ).map(([value, label]) => (
                <label key={value} className="flex items-center">
                  <input
                    type="radio"
                    name="withdrawal"
                    value={value}
                    checked={withdrawal === value}
                    onChange={() => {
                      setWithdrawal(value);
                      setWithdrawalDirty(true);
                    }}
                    className="flask-radio"
                  />
                  <span className="ml-2 text-sm text-flask-gray-700">{label}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className="flex items-center justify-between rounded-flask-2xl bg-flask-teal-soft/50 px-3 py-2">
            <span className="text-sm font-medium text-flask-teal-pill">Opening Cash Balance</span>
            <span className="text-sm font-medium text-flask-teal-pill" aria-live="polite">
              {formatMoney(opening, code)}
            </span>
          </div>
        </div>

        <div>
          <button
            type="submit"
            disabled={saving}
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
              disabled={saving}
              onClick={() => void save("exit")}
              className="flex min-h-[40px] items-center justify-center px-4 py-2 text-sm font-medium text-flask-teal transition-colors hover:text-flask-teal/80"
            >
              <span>Save &amp; Exit</span>
            </button>
          </div>
        </div>
      </form>
    </PhoneCard>
  );
}

/**
 * Flask's #fixNegativeBalanceModal: yesterday ended below zero, or this opening would. It cannot be
 * dismissed - the one way on is the dashboard.
 */
function FixNegativeBalanceModal({ balance, currencyCode, onDashboard }: { balance: number; currencyCode: string | null; onDashboard: () => void }) {
  const code = currencyCode || "$";
  const shown = balance < 0 ? `(${formatMoney(Math.abs(balance), currencyCode)})` : formatMoney(balance, currencyCode);
  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-flask-black/50 p-4">
      <div role="alertdialog" aria-modal="true" aria-labelledby="fix-negative-title" className="mx-auto w-full max-w-sm rounded-flask-lg bg-flask-white p-6">
        <div className="mb-6">
          <h2 id="fix-negative-title" className="mb-2 text-xl font-bold text-flask-gray-900">
            Fix Negative Balance
          </h2>
          <p className="mb-1 text-sm text-flask-gray-600">Current Balance</p>
          <p className={`mb-4 text-center text-3xl font-semibold ${balance < 0 ? "text-flask-red-600" : "text-flask-gray-900"}`}>{shown}</p>
          <p className="text-sm text-flask-gray-600">
            Starting cash balance is negative. The deposit amount may exceed available cash. Please go back and adjust.
          </p>
        </div>
        <div className="space-y-3">
          <button
            type="button"
            onClick={onDashboard}
            className="group flex w-full items-center justify-between rounded-flask-xl border border-flask-teal-soft bg-flask-white px-4 py-3 text-left text-flask-gray-700 transition-colors hover:bg-flask-gray-50"
          >
            <span className="flex items-center">
              Dashboard
              <span className="ml-2 text-flask-red">
                (Balance: {code} {balance.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })})
              </span>
            </span>
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="h-4 w-4 text-flask-gray-900 transition-transform group-hover:translate-x-1" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
