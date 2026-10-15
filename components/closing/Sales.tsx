"use client";

import { useRouter } from "next/navigation";
import { useId, useState, type ReactNode } from "react";

import { InlineAlert } from "@minty/shared/ui";

import { AmountInput, openStep, refused, StageActions, StagePage, stageSteps, useLeaveHold, WorkflowHeader, type StageContext } from "@/components/closing/Stage";
import { pettyCashFetch } from "@/lib/apiClient";
import { parseMoney } from "@/lib/currencyInput";
import { formatMoney } from "@/lib/money";
import { reportStatus } from "@/lib/reportStatus";
import { initialValues, salesAmounts, salesDirty, salesTotals, sections, type SalesMethod, type SalesPage, type SalesSaved } from "@/lib/sales";

const STAGE = "Sales";
const GUIDANCE = "Add the day's sales for each way your customers paid. Leave a method empty if it had no sales.";

/**
 * The Daily Closing's second stage, "Sales" (Part 15.15b; Flask's Sales section): a grouped form
 * (15.3b) - Electronic payments and Delivery, a field per method the company switched on, in
 * Settings order, each section with its running subtotal, then Cash - and the day's total sales as
 * the stage summary, all live as the amounts are typed. Reads and saves through
 * `GET`/`PUT /reports/sales` (Minty `petty_cash_api/routes/sales.py`); its rules are lib/sales.ts.
 */
export function Sales({ day }: { day: string | null }) {
  return (
    <StagePage<SalesPage> path="/reports/sales" day={day} title={STAGE} guidance={GUIDANCE}>
      {(page, context) => <StageForm page={page} {...context} />}
    </StagePage>
  );
}

function StageForm({ page, entityId, entityName, home, notice }: { page: SalesPage } & StageContext) {
  const router = useRouter();
  const [initial] = useState(() => initialValues(page));
  const [values, setValues] = useState(initial.values);
  const [cash, setCash] = useState(initial.cash);
  const [saving, setSaving] = useState<"next" | "exit" | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const code = page.currency_code;
  const day = page.transaction_date;
  const { electronic, delivery } = sections(page.methods);
  const totals = salesTotals(page.methods, values, cash);
  const hold = useLeaveHold(salesDirty(page, values, cash), saving !== null);
  const progress = page.draft ?? { current_section: null, completed_sections: [] };
  const push = (href: string) => router.push(href);

  async function save(action: "next" | "exit") {
    if (saving) return;
    setProblem(null);
    hold.release();
    setSaving(action);
    try {
      const answer = await pettyCashFetch<SalesSaved>("/reports/sales", {
        method: "PUT",
        json: { transaction_date: day, cash_sales: parseMoney(cash), amounts: salesAmounts(page.methods, values), action },
      });
      if (answer.next === "expenses") openStep(push, entityId, entityName, "expenses", answer.transaction_date);
      else push(home);
    } catch (err) {
      // No draft for the day yet: back to Addition to Drawer, which says why (`to: "opening"`).
      const message = refused(err, { here: "sales", push, entityId, entityName, home, day });
      if (message === undefined) return;
      setSaving(null);
      setProblem(message);
    }
  }

  const field = (method: SalesMethod) => (
    <AmountInput
      key={method.value_name}
      label={method.name}
      name={method.value_name}
      code={code}
      value={values[method.value_name] ?? ""}
      onChange={(value) => setValues((all) => ({ ...all, [method.value_name]: value }))}
      disabled={saving !== null}
    />
  );

  return (
    <>
      <WorkflowHeader
        home={home}
        day={day}
        title={STAGE}
        guidance={GUIDANCE}
        status={reportStatus(page.draft)}
        steps={stageSteps(entityId, entityName, progress, "sales", day)}
        onLeave={hold.onLeave}
        held={hold.held}
      />
      {notice}
      <form
        className="flex flex-col gap-6"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void save("next");
        }}
      >
        {/* Part 15.3b grouped form: Section headers, the fields, a running subtotal per section. */}
        <section aria-label={STAGE} className="flex flex-col gap-6 rounded-xl border border-border-subtle bg-surface-card p-4 sm:p-6">
          {electronic.length ? (
            <SalesSection
              title="Electronic payments"
              description="Card and e-wallet sales, as each terminal or app shows them."
              subtotal={{ label: "Electronic payments total", amount: formatMoney(totals.electronic, code) }}
            >
              {electronic.map(field)}
            </SalesSection>
          ) : null}
          {delivery.length ? (
            <SalesSection
              title="Delivery"
              description="Sales through each delivery platform."
              subtotal={{ label: "Delivery total", amount: formatMoney(totals.delivery, code) }}
              divided={electronic.length > 0}
            >
              {delivery.map(field)}
            </SalesSection>
          ) : null}
          <SalesSection
            title="Cash"
            description="Cash your customers paid. It goes into the drawer."
            divided={electronic.length + delivery.length > 0}
          >
            <AmountInput label="Cash sales" name="cash_sales" code={code} value={cash} onChange={setCash} disabled={saving !== null} />
          </SalesSection>
        </section>

        {/* The stage summary (15.9 / 15.15): the running total, as plain text, never coloured. */}
        <div className="flex flex-col gap-3">
          <dl className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 rounded-lg bg-surface-sunk px-4 py-3">
            <dt className="min-w-0 text-title-m text-text-primary">Total sales</dt>
            <dd className="shrink-0 text-title-m text-text-primary" translate="no" aria-live="polite">
              {formatMoney(totals.total, code)}
            </dd>
            <dd className="basis-full text-body-s text-text-secondary">Electronic payments, delivery and cash sales together.</dd>
          </dl>
          {problem ? <InlineAlert tone="danger">{problem}</InlineAlert> : null}
        </div>

        <StageActions saving={saving} onExit={() => void save("exit")} />
      </form>
    </>
  );
}

/**
 * One group of the form: a Part 14 Section header (h2 title + why the section exists), its fields
 * - one column on a phone, so a long amount is never clipped; two from 640 - and its subtotal as a
 * Description row, live (15.15: totals are a polite live region).
 */
function SalesSection({
  title,
  description,
  subtotal,
  divided = false,
  children,
}: {
  title: string;
  description: string;
  subtotal?: { label: string; amount: string };
  divided?: boolean;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <div role="group" aria-labelledby={id} className={`flex min-w-0 flex-col gap-3 ${divided ? "border-t border-border-subtle pt-6" : ""}`}>
      <div className="flex flex-col gap-0.5">
        <h2 id={id} className="text-title-m text-text-primary">
          {title}
        </h2>
        <p className="text-body-s text-text-secondary">{description}</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
      {subtotal ? (
        <dl className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 border-t border-border-subtle pt-3">
          <dt className="min-w-0 text-body-m text-text-secondary">{subtotal.label}</dt>
          <dd className="shrink-0 text-body-m font-semibold text-text-primary" translate="no" aria-live="polite">
            {subtotal.amount}
          </dd>
        </dl>
      ) : null}
    </div>
  );
}
