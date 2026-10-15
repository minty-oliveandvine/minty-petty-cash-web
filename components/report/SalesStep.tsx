"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type MouseEvent, type ReactNode } from "react";

import { PhoneCard } from "@/components/flask/PhoneCard";
import { Stepper } from "@/components/flask/Stepper";
import { useToast } from "@/components/flask/Toasts";
import { LoadingOverlay, ReportBadge } from "@/components/report/ReportChrome";
import { entityAcronym } from "@/lib/acronym";
import { ApiError, pettyCashFetch } from "@/lib/apiClient";
import { pettyCashHome } from "@/lib/companyPages";
import { groupMoney, parseMoney, sanitizeMoney } from "@/lib/currencyInput";
import { leaveTo } from "@/lib/handoff";
import { formatMoney } from "@/lib/money";
import { datePill } from "@/lib/opening";
import { changed, flaskLabel, salesTotals, sections, type SalesMethod, type SalesPage } from "@/lib/sales";
import { useAuth } from "@/lib/useAuth";
import { isPorted, stepHref } from "@/lib/wizardPages";

const UNREACHABLE = "We couldn't reach Petty Cash. Check your connection, then reload the page.";
const UNSAVED = "You have unsaved changes. Please save your changes first.";

type SaveAnswer = { next: "expenses" | "dashboard"; transaction_date: string };

/**
 * The report wizard's Sales step - a pixel-faithful port of Flask's `report/sales.html`: the
 * report header, the stepper, "Sales Entry", one card with Electronic Payments and Delivery Sales
 * (a field per method the company switched on, in Settings order) and Cash Sales, each with its
 * running total, then Save & Next / Save & Exit. Reads and saves through `GET`/`PUT /reports/sales`
 * (Minty `petty_cash_api/routes/sales.py`).
 *
 * Flask's stand-in Visa / Mastercard / Food Panda fields for a company with no methods are left out
 * on purpose: Flask's save drops whatever is typed in them.
 */
export function SalesStep({ day }: { day: string | null }) {
  const toast = useToast();
  const auth = useAuth();
  const [page, setPage] = useState<SalesPage | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    pettyCashFetch<SalesPage>("/reports/sales", { query: { transaction_date: day ?? undefined } })
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
  return <SalesForm page={page} entityId={auth.entityId} entityName={auth.entityName} acronym={acronym} />;
}

/** How a saved amount first shows: grouped, and a zero or none as an empty field (the placeholder). */
function shown(amount: number | null): string {
  return amount ? groupMoney(String(amount)) : "";
}

function SalesForm({ page, entityId, entityName, acronym }: { page: SalesPage; entityId: string; entityName: string; acronym: string }) {
  const toast = useToast();
  const router = useRouter();
  const home = pettyCashHome(entityId, entityName);
  const [initial] = useState(() => ({
    values: Object.fromEntries(page.methods.map((m) => [m.value_name, shown(m.amount)])) as Record<string, string>,
    cash: shown(page.cash_sales),
  }));
  const [values, setValues] = useState(initial.values);
  const [cash, setCash] = useState(initial.cash);
  const [saving, setSaving] = useState(false);

  const code = page.currency_code;
  const day = page.transaction_date;
  const progress = page.draft ?? { current_section: null, completed_sections: [] };
  const { electronic, delivery } = sections(page.methods);
  const totals = salesTotals(page.methods, values, cash);

  function dirty(): boolean {
    return changed(cash, initial.cash) || page.methods.some((m) => changed(values[m.value_name] ?? "", initial.values[m.value_name] ?? ""));
  }

  function onStepClick(event: MouseEvent<HTMLAnchorElement>) {
    if (dirty()) {
      event.preventDefault();
      toast(UNSAVED, "warning");
    }
  }

  async function save(action: "next" | "exit") {
    setSaving(true);
    try {
      const amounts = Object.fromEntries(
        page.methods.filter((m) => (values[m.value_name] ?? "") !== "").map((m) => [m.value_name, parseMoney(values[m.value_name])]),
      );
      const answer = await pettyCashFetch<SaveAnswer>("/reports/sales", {
        method: "PUT",
        json: { transaction_date: day, cash_sales: parseMoney(cash), amounts, action },
      });
      if (answer.next === "dashboard") {
        router.push(home);
        return;
      }
      const next = stepHref(entityId, entityName, "expenses", answer.transaction_date);
      if (isPorted("expenses")) router.push(next);
      else leaveTo(next);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return;
      const body = err instanceof ApiError ? (err.body as { to?: string } | null) : null;
      const message = err instanceof ApiError ? err.message : "I couldn't save that. Mind trying again?";
      toast(message, "error");
      if (body?.to === "opening") {
        // Flask sends a save with no draft back to Opening, and says why there.
        router.push(stepHref(entityId, entityName, "opening", day));
        return;
      }
      setSaving(false);
    }
  }

  function field(method: SalesMethod) {
    const value = values[method.value_name] ?? "";
    return (
      <MoneyField
        key={method.value_name}
        id={`sales_${method.value_name}`}
        label={flaskLabel(method.name)}
        code={code}
        value={value}
        onChange={(v) => setValues((all) => ({ ...all, [method.value_name]: v }))}
      />
    );
  }

  return (
    <PhoneCard
      acronym={acronym}
      datePill={datePill(day)}
      badge={<ReportBadge draft={page.draft} />}
      backHref={home}
      stepper={
        <Stepper
          draft={progress}
          page="sales"
          stepHref={(step) => stepHref(entityId, entityName, step, day)}
          onStepClick={onStepClick}
        />
      }
      overlays={saving ? <LoadingOverlay /> : null}
    >
      <div className="mb-6 text-left">
        <h2 className="text-lg font-bold text-flask-gray-700 sm:text-xl">Sales Entry</h2>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save("next");
        }}
      >
        <div className="mb-6 rounded-flask-lg bg-flask-white p-6 shadow-flask-sm">
          <Section icon={<CardIcon />} title="Electronic Payments" smallTitle>
            <div className="mb-4 grid grid-cols-2 gap-4">{electronic.map(field)}</div>
            <Total label="Total Electronic Payment Sales" amount={formatMoney(totals.electronic, code)} />
          </Section>

          <Section icon={<TruckIcon />} title="Delivery Sales">
            <div className="mb-4 grid grid-cols-2 gap-4">{delivery.map(field)}</div>
            <Total label="Total Delivery Sales" amount={formatMoney(totals.delivery, code)} />
          </Section>

          <Section icon={<CashIcon />} title="Cash Sales">
            <div className="mb-3">
              <MoneyInput id="sales_cash_sales" ariaLabel="Cash Sales" code={code} value={cash} onChange={setCash} />
            </div>
            <Total label="Total Cash Sales" amount={formatMoney(totals.cash, code)} />
          </Section>
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

/** A section of the card: its icon and heading (Electronic Payments' heading has no `sm:text-xl` in Flask). */
function Section({ icon, title, smallTitle, children }: { icon: ReactNode; title: string; smallTitle?: boolean; children: ReactNode }) {
  return (
    <div className="mb-6">
      <div className="mb-4 flex items-center gap-3 pl-2">
        {icon}
        <h3 className={`text-lg font-semibold text-flask-gray-700 ${smallTitle ? "" : "sm:text-xl"}`}>{title}</h3>
      </div>
      {children}
    </div>
  );
}

function Total({ label, amount }: { label: string; amount: string }) {
  return (
    <div className="flex items-center justify-between rounded-flask-2xl bg-flask-teal-soft/50 p-3 py-2">
      <span className="text-sm font-medium text-flask-teal-pill">{label}</span>
      <span className="text-sm font-medium text-flask-teal-pill" aria-live="polite">
        {amount}
      </span>
    </div>
  );
}

function MoneyField({ id, label, code, value, onChange }: { id: string; label: string; code: string | null; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label htmlFor={id} className="mb-2 block text-sm font-medium text-flask-gray-500">
        {label}
      </label>
      <MoneyInput id={id} code={code} value={value} onChange={onChange} />
    </div>
  );
}

/** Flask's sales input: the currency code inside on the left, cleaned as typed, grouped on leaving. */
function MoneyInput({ id, ariaLabel, code, value, onChange }: { id: string; ariaLabel?: string; code: string | null; value: string; onChange: (v: string) => void }) {
  return (
    <div className="relative">
      <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
        <span className="text-sm text-flask-gray-500">{code || "$"}</span>
      </div>
      <input
        id={id}
        aria-label={ariaLabel}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        placeholder="0.00"
        value={value}
        onChange={(e) => onChange(sanitizeMoney(e.target.value))}
        onBlur={() => onChange(groupMoney(value))}
        onFocus={(e) => {
          const input = e.currentTarget;
          window.setTimeout(() => input.scrollIntoView({ block: "center", behavior: "smooth" }), 300);
        }}
        className="w-full cursor-pointer rounded-flask-2xl border border-flask-gray-300 bg-flask-white py-3 pl-12 pr-3 text-flask-black focus:border-transparent focus:outline-none focus:ring-2 focus:ring-flask-teal"
      />
    </div>
  );
}

function CardIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="size-5 text-flask-gray-500" aria-hidden="true">
      <path d="M4.5 3.75a3 3 0 0 0-3 3v.75h21v-.75a3 3 0 0 0-3-3h-15Z" />
      <path
        fillRule="evenodd"
        d="M22.5 9.75h-21v7.5a3 3 0 0 0 3 3h15a3 3 0 0 0 3-3v-7.5Zm-18 3.75a.75.75 0 0 1 .75-.75h6a.75.75 0 0 1 0 1.5h-6a.75.75 0 0 1-.75-.75Zm.75 2.25a.75.75 0 0 0 0 1.5h3a.75.75 0 0 0 0-1.5h-3Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function TruckIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="size-5 text-flask-gray-500" aria-hidden="true">
      <path d="M3.375 4.5C2.339 4.5 1.5 5.34 1.5 6.375V13.5h12V6.375c0-1.036-.84-1.875-1.875-1.875h-8.25ZM13.5 15h-12v2.625c0 1.035.84 1.875 1.875 1.875h.375a3 3 0 1 1 6 0h3a.75.75 0 0 0 .75-.75V15Z" />
      <path d="M8.25 19.5a1.5 1.5 0 1 0-3 0 1.5 1.5 0 0 0 3 0ZM15.75 6.75a.75.75 0 0 0-.75.75v11.25c0 .087.015.17.042.248a3 3 0 0 1 5.958.464c.853-.175 1.522-.935 1.464-1.883a18.659 18.659 0 0 0-3.732-10.104 1.837 1.837 0 0 0-1.47-.725H15.75Z" />
      <path d="M19.5 19.5a1.5 1.5 0 1 0-3 0 1.5 1.5 0 0 0 3 0Z" />
    </svg>
  );
}

function CashIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor" className="size-5 text-flask-gray-500" aria-hidden="true">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 6v12m-3-2.818.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
      />
    </svg>
  );
}
