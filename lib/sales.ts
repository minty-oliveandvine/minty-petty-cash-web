/**
 * The Sales step's read: what `GET /reports/sales` answers (Minty `petty_cash_api/routes/sales.py`),
 * and the page's labels and totals as Flask's `report/sales.html` works them out.
 */

import type { OpeningPage } from "@/lib/opening";
import { parseMoney } from "@/lib/currencyInput";

export type SalesMethod = {
  sale_id: string;
  /** The catalogue's name ("WeChat Pay"); the page shows {@link flaskLabel} of it. */
  name: string;
  /** The key the save sends the amount under ("wechat_sales"). */
  value_name: string;
  type: "electronic" | "delivery";
  /** The day's amount; null when the report has none for this method. */
  amount: number | null;
};

/**
 * How the company's methods are grouped (owner, 2026-11-11; the API's `sales_groups`): one Non-cash
 * section for a retail shop, a service or a general business; Electronic and Delivery for Restaurant
 * & Food and a company from before onboarding asked. An answer without it is the second.
 */
export type SalesGroups = "non_cash" | "electronic_delivery";

export type SalesPage = {
  transaction_date: string;
  currency_code: string | null;
  /** null before Opening made the day's draft. */
  draft: OpeningPage["draft"];
  /** The company's electronic and delivery methods, in Settings order. */
  methods: SalesMethod[];
  cash_sales: number | null;
  groups?: SalesGroups;
};

/** The method the save has always skipped, so it is never offered (Flask's Ending left it out of both
 * lists; its Sales page only out of delivery, and dropped what was typed there). */
const SKIPPED = "deliveroo_sales";

/**
 * A method's label exactly as Flask's template writes it: Python's `str.title()` of the name, so
 * "WeChat Pay" shows as "Wechat Pay" and "OpenRice" as "Openrice". Every run of letters gets a
 * capital first letter and lower-case rest; anything else is a word boundary.
 */
export function flaskLabel(name: string): string {
  return name
    .replace(/_sales/g, "")
    .replace(/_/g, " ")
    .replace(/[A-Za-z]+/g, (word) => word[0].toUpperCase() + word.slice(1).toLowerCase());
}

/** The methods each section lists, in order (Deliveroo left out of both, as Flask's Ending does).
 * A Non-cash company has one section, `electronic`, holding every method - delivery ones included. */
export function sections<M extends Pick<SalesMethod, "type" | "value_name">>(
  methods: M[],
  groups: SalesGroups = "electronic_delivery",
): {
  electronic: M[];
  delivery: M[];
} {
  if (groups === "non_cash") {
    return { electronic: methods.filter((m) => m.value_name !== SKIPPED), delivery: [] };
  }
  return {
    electronic: methods.filter((m) => m.type === "electronic" && m.value_name !== SKIPPED),
    delivery: methods.filter((m) => m.type === "delivery" && m.value_name !== SKIPPED),
  };
}

/** The three totals under the sections, from what the fields show. */
export function salesTotals(
  methods: SalesMethod[],
  values: Record<string, string>,
  cash: string,
  groups: SalesGroups = "electronic_delivery",
): { electronic: number; delivery: number; cash: number } {
  const { electronic, delivery } = sections(methods, groups);
  const sum = (list: SalesMethod[]) =>
    list.reduce((total, m) => total + parseMoney(values[m.value_name] ?? ""), 0);
  return { electronic: sum(electronic), delivery: sum(delivery), cash: parseMoney(cash) };
}

/**
 * Whether a field holds something new - Flask's `hasUnsavedChanges`: a value that differs from the
 * one the page opened with, commas aside. Emptying a field does not count.
 */
export function changed(now: string, initial: string): boolean {
  const norm = (v: string) => {
    const s = v.trim().replace(/,/g, "");
    return s === "-" ? "" : s;
  };
  const current = norm(now);
  return current !== "" && current !== norm(initial);
}
