/**
 * The Daily Closing's Sales stage (Part 15.15b; Flask's Sales section): what `GET /reports/sales`
 * answers (Minty `petty_cash_api/routes/sales.py`), and the stage's sections, totals and save as
 * pure rules, so the stage page (components/closing/Sales.tsx) only draws what this says. Method
 * names are the catalogue's, shown as they stand (Flask's page title-cased them: "Wechat Pay").
 */

import { formatAmount, parseAmount } from "@minty/shared/money";

import type { OpeningPage } from "@/lib/opening";

export type SalesMethod = {
  sale_id: string;
  /** The catalogue's name ("WeChat Pay") - the field's label, as it stands. */
  name: string;
  /** The key the save sends the amount under ("wechat_sales"). */
  value_name: string;
  type: "electronic" | "delivery";
  /** The day's amount; null when the report has none for this method. */
  amount: number | null;
};

export type SalesPage = {
  transaction_date: string;
  currency_code: string | null;
  /** null before Addition to Drawer made the day's draft. */
  draft: OpeningPage["draft"];
  /** The company's electronic and delivery methods, in Settings order (Cash is `cash_sales`). */
  methods: SalesMethod[];
  cash_sales: number | null;
};

/** What `PUT /reports/sales` answers on a save. */
export type SalesSaved = {
  draft_id: string;
  transaction_date: string;
  current_section: string | null;
  completed_sections: string[];
  next: "expenses" | "dashboard";
};

/** The method the save has always skipped (the old Deliveroo column); Flask's page leaves it out. */
const SKIPPED = "deliveroo_sales";

const cents = (amount: number) => Math.round(amount * 100) / 100;

/** The methods each section lists, in Settings order (Deliveroo dropped from delivery, as Flask does). */
export function sections(methods: SalesMethod[]): { electronic: SalesMethod[]; delivery: SalesMethod[] } {
  return {
    electronic: methods.filter((m) => m.type === "electronic"),
    delivery: methods.filter((m) => m.type === "delivery" && m.value_name !== SKIPPED),
  };
}

/** The methods the stage has a field for, in the order they show. */
export function shownMethods(methods: SalesMethod[]): SalesMethod[] {
  const { electronic, delivery } = sections(methods);
  return [...electronic, ...delivery];
}

export type SalesTotals = { electronic: number; delivery: number; cash: number; total: number };

/** The running subtotals and the day's total sales, from what the fields show. */
export function salesTotals(methods: SalesMethod[], values: Record<string, string>, cash: string): SalesTotals {
  const { electronic, delivery } = sections(methods);
  const sum = (list: SalesMethod[]) => cents(list.reduce((total, m) => total + (parseAmount(values[m.value_name] ?? "") ?? 0), 0));
  const totals = { electronic: sum(electronic), delivery: sum(delivery), cash: cents(parseAmount(cash) ?? 0) };
  return { ...totals, total: cents(totals.electronic + totals.delivery + totals.cash) };
}

/** How a saved amount first shows: grouped, and a zero or none as an empty field (the placeholder). */
export function shownAmount(amount: number | null): string {
  return amount ? formatAmount(amount) : "";
}

/** The fields as the page first shows them. */
export function initialValues(page: SalesPage): { values: Record<string, string>; cash: string } {
  return {
    values: Object.fromEntries(shownMethods(page.methods).map((m) => [m.value_name, shownAmount(m.amount)])),
    cash: shownAmount(page.cash_sales),
  };
}

/**
 * Whether anything differs from what was saved - by amount, so grouping does not count, an
 * emptied field is a change (it saves as zero) and putting a value back clears it.
 */
export function salesDirty(page: SalesPage, values: Record<string, string>, cash: string): boolean {
  if ((parseAmount(cash) ?? 0) !== (page.cash_sales ?? 0)) return true;
  return shownMethods(page.methods).some((m) => (parseAmount(values[m.value_name] ?? "") ?? 0) !== (m.amount ?? 0));
}

/** The save's `amounts`: every method the stage shows, an empty field as zero. */
export function salesAmounts(methods: SalesMethod[], values: Record<string, string>): Record<string, number> {
  return Object.fromEntries(shownMethods(methods).map((m) => [m.value_name, parseAmount(values[m.value_name] ?? "") ?? 0]));
}
