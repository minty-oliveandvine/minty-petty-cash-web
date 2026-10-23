/**
 * The report wizard's last step (Ending): what `GET /reports/close` answers (Minty
 * `petty_cash_api/routes/close.py`) and the summary's sums and drawings exactly as Flask's
 * `report/ending.html` (with `components/pie_chart.html` and `bar_chart.html`) works them out.
 */

import type { OpeningPage } from "@/lib/opening";
import type { DifferenceKind } from "@/lib/cash";
import type { SalesMethod } from "@/lib/sales";

export type CloseLine = {
  id: string;
  /** The account's name. */
  item: string;
  supplier: string;
  remarks: string;
  amount: number;
  receipts: unknown[];
};

export type ClosePage = {
  transaction_date: string;
  currency_code: string | null;
  draft: OpeningPage["draft"];
  opening_balance: number;
  cash_addition: number;
  sales: {
    /** The electronic and delivery methods (cash is `cash`), with the day's amounts. */
    methods: (Omit<SalesMethod, "amount"> & { amount: number })[];
    cash: number;
    total: number;
    /** The day before's total sales; null when that day has none (Flask: no figure, green arrow). */
    yesterday_total: number | null;
    /** The 30 days up to the day, the day last. */
    history: { date: string; total: number }[];
  };
  expenses: { lines: CloseLine[]; total: number };
  cash: {
    bank_deposit: number;
    /** What the count should have come to. */
    expected: number;
    /** Counted in the till. */
    counted: number;
    safe_box: number;
    difference: { amount: number; kind: DifferenceKind; reason: string };
  };
  closing_balance: number;
  /** What would stop the submit now - the sentence and the step that fixes it - or null. */
  problem: { error: string; to: string } | null;
};

/** What the summary's Total Sales card draws - the Ending step's sales, or a submitted report's. */
export type SummarySales = Pick<ClosePage["sales"], "methods" | "cash" | "total">;

/** Flask's `"{:,.2f}"`: two decimals, thousands grouped, no currency. */
export function plain(amount: number): string {
  return (Number.isFinite(amount) ? amount : 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** A breakdown row's figure: Flask writes "-" for nothing. */
export function plainOrDash(amount: number | null | undefined): string {
  return !amount ? "-" : plain(amount);
}

/**
 * "Compared to Yesterday": with no sales the day before, nothing to compare (Flask: the green arrow
 * alone); else the change in percent, one decimal, up only when it grew - Flask's
 * `is_sales_increase = difference > 0`, so an unchanged day is a red 0.0%.
 */
export function versusYesterday(
  today: number,
  yesterday: number | null,
): { up: boolean; percent: string | null } {
  if (!yesterday || yesterday <= 0) return { up: true, percent: null };
  const change = today - yesterday;
  return { up: change > 0, percent: `${Math.abs((change / yesterday) * 100).toFixed(1)}%` };
}

/** The Total Sales card's three figures: electronic and delivery from the method rows, cash its own. */
export function salesSplit(page: Pick<SummarySales, "methods" | "cash">): {
  electronic: number;
  delivery: number;
  cash: number;
} {
  let electronic = 0;
  let delivery = 0;
  for (const m of page.methods) {
    if (m.type === "delivery") delivery += m.amount || 0;
    else electronic += m.amount || 0;
  }
  return { electronic, delivery, cash: page.cash || 0 };
}

/** An expense's name as Flask shows it: "N/A" without one, "&" written "and". */
export function expenseName(item: string): string {
  return (item || "N/A").replace(/&/g, "and");
}

export type ExpenseGroup = { item: string; amount: number };

/**
 * The day's expenses by account, largest first - Flask groups the lines by account and sorts the
 * sums (a stable sort, so equal sums keep the lines' order).
 */
export function expenseGroups(lines: Pick<CloseLine, "item" | "amount">[]): ExpenseGroup[] {
  const groups = new Map<string, ExpenseGroup>();
  for (const line of lines) {
    const key = line.item || "";
    const group = groups.get(key) ?? { item: key, amount: 0 };
    group.amount += line.amount || 0;
    groups.set(key, group);
  }
  return [...groups.values()].sort((a, b) => b.amount - a.amount);
}

export const OTHER_EXPENSES = "Other expenses";
/** How many accounts the pie names before the rest become "Other expenses". */
export const TOP_EXPENSES = 7;

export type Slice = { name: string; amount: number; other: boolean };

/**
 * The pie's slices: the top seven accounts, then "Other expenses" (the rest, summed) - shown only
 * when the rest come to more than zero, as Flask's chart does.
 */
export function pieSlices(groups: ExpenseGroup[]): Slice[] {
  const top: Slice[] = groups
    .slice(0, TOP_EXPENSES)
    .map((g) => ({ name: expenseName(g.item), amount: g.amount, other: false }));
  const rest = groups.slice(TOP_EXPENSES).reduce((sum, g) => sum + (g.amount || 0), 0);
  if (rest > 0) top.push({ name: OTHER_EXPENSES, amount: rest, other: true });
  return top;
}

export type Arc = { slice: Slice; index: number; start: number; end: number };

/**
 * Flask's donut (`initializePieChart`): from the top, clockwise, a 0.03-radian gap after every
 * slice; a slice never thinner than 1% of the circle; "Other expenses" drawn as at least 2% of
 * the total. Slices of zero or less are skipped (their gap kept). Angles in radians.
 */
export function pieArcs(slices: Slice[]): Arc[] {
  const PAD = 0.03;
  const original = slices.reduce((sum, s) => sum + s.amount, 0);
  if (original <= 0) return [];
  const minOther = original * 0.02;
  const other = slices.find((s) => s.other);
  let total = original;
  if (other) {
    if (other.amount <= 0) total = original + minOther;
    else if (other.amount < minOther) total = original - other.amount + minOther;
  }
  const available = Math.PI * 2 - PAD * slices.length;
  const minAngle = Math.PI * 2 * 0.01;
  const arcs: Arc[] = [];
  let at = -Math.PI / 2;
  slices.forEach((slice, index) => {
    if (slice.amount <= 0 && !slice.other) {
      at += PAD;
      return;
    }
    const value = slice.other ? Math.max(slice.amount, minOther) : slice.amount;
    let angle = (value / total) * available;
    if (slice.other || (angle > 0 && angle < minAngle)) angle = Math.max(angle, minAngle);
    arcs.push({ slice, index, start: at, end: at + angle });
    at += angle + PAD;
  });
  return arcs;
}

/** One donut segment's path (Flask's: outer arc, inner arc back; a sliver as a thin wedge). */
export function arcPath(
  arc: Pick<Arc, "start" | "end">,
  cx: number,
  cy: number,
  inner: number,
  outer: number,
): string {
  const { start, end } = arc;
  const angle = end - start;
  const pt = (r: number, a: number) => `${cx + r * Math.cos(a)} ${cy + r * Math.sin(a)}`;
  if (angle < 0.01) {
    const mid = start + angle / 2;
    return `M ${pt(inner, start)} L ${pt(outer, start)} L ${pt(outer, mid)} L ${pt(inner, mid)} L ${pt(inner, start)} Z`;
  }
  const large = angle > Math.PI ? 1 : 0;
  return [
    `M ${pt(inner, start)}`,
    `L ${pt(outer, start)}`,
    `A ${outer} ${outer} 0 ${large} 1 ${pt(outer, end)}`,
    `L ${pt(inner, end)}`,
    `A ${inner} ${inner} 0 ${large} 0 ${pt(inner, start)}`,
    "Z",
  ].join(" ");
}

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const DAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

/** A history day's two label lines: "13 OCT" and "TUE" (Flask's `"%-d %b %a"`, upper case). */
export function barDate(iso: string): { day: string; weekday: string } {
  const [y, m, d] = iso.split("-").map(Number);
  const weekday = DAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return { day: `${d} ${MONTHS[m - 1]}`, weekday };
}

/** The figure over a bar: "1.2k" from a thousand up, else the number as JavaScript writes it. */
export function barValue(value: number): string {
  return value >= 1000 ? `${(value / 1000).toFixed(1)}k` : value.toString();
}

export type Bar = {
  x: number;
  y: number;
  width: number;
  height: number;
  value: number;
  date: string;
  highlight: boolean;
};

/**
 * Flask's Sales History (`initializeBarChart`, scrollable, seven bars to a view): every bar scaled
 * so the tallest reaches the top of the drawing area, the day itself highlighted. `width` and
 * `height` are the box's, px; `phone` is a viewport under 640px. No bars at all when every day is
 * zero (Flask draws nothing then).
 */
export function barLayout(
  history: { date: string; total: number }[],
  width: number,
  height: number,
  phone: boolean,
): {
  bars: Bar[];
  svgWidth: number;
  chartHeight: number;
  top: number;
  radius: number;
  font: number;
} {
  const top = phone ? 25 : 30;
  const bottom = phone ? 30 : 35;
  const chartHeight = Math.max(height - top - bottom, 0);
  const values = history.map((h) => h.total || 0);
  const max = Math.max(0, ...values);
  const spacing = width / 7;
  const barWidth = spacing * (phone ? 0.85 : 0.9);
  const svgWidth = Math.max((values.length - 1) * spacing + barWidth, 0);
  const base = { svgWidth, chartHeight, top, radius: phone ? 8 : 12, font: phone ? 10 : 12 };
  if (max === 0 || width <= 0) return { bars: [], ...base };
  const scale = chartHeight / max;
  const bars = values.map((value, i) => {
    const h = value * scale;
    return {
      x: i * spacing,
      y: chartHeight - h,
      width: barWidth,
      height: h,
      value,
      date: history[i].date,
      highlight: i === values.length - 1,
    };
  });
  return { bars, ...base };
}
