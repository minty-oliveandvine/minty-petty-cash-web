"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

import { useFitText } from "@/components/report/ReportChrome";
import { cents } from "@/lib/cash";
import {
  arcPath,
  barDate,
  barLayout,
  barValue,
  expenseGroups,
  expenseName,
  pieArcs,
  pieSlices,
  plain,
  plainOrDash,
  salesSplit,
  versusYesterday,
  type CloseLine,
  type ClosePage,
  type Slice,
  type SummarySales,
} from "@/lib/ending";
import { formatMoney } from "@/lib/money";
import { flaskLabel, sections } from "@/lib/sales";

/** Flask's slice colours, in its order, as whole class names (Tailwind reads them from here). */
const PIE_FILL = ["fill-flask-pie-1", "fill-flask-pie-2", "fill-flask-pie-3", "fill-flask-pie-4", "fill-flask-pie-5", "fill-flask-pie-6", "fill-flask-pie-7"];
const PIE_DOT = ["bg-flask-pie-1", "bg-flask-pie-2", "bg-flask-pie-3", "bg-flask-pie-4", "bg-flask-pie-5", "bg-flask-pie-6", "bg-flask-pie-7"];
const pieFill = (s: Slice, i: number) => (s.other ? "fill-flask-pie-other" : PIE_FILL[i % PIE_FILL.length]);
const pieDot = (s: Slice, i: number) => (s.other ? "bg-flask-pie-other" : PIE_DOT[i % PIE_DOT.length]);

const CARD = "mb-6 rounded-flask-lg bg-flask-white p-6 shadow-flask-sm";
const CARD_TITLE = "text-sm font-semibold text-flask-gray-900 sm:text-lg";
/** A breakdown row's label and figure (Flask's `text-[12px] sm:text-lg font-base text-gray-400`). */
const ROW_TEXT = "text-[12px] text-flask-gray-400 sm:text-lg";

/**
 * The Daily Report's summary as Flask's ORIGINAL `report/ending.html` draws it - the same in the
 * wizard's Ending step and in a submitted report's own view: "Summary" with the currency, Total
 * Sales, Sales History, Total Expenses, Cash Balance, then the shortage or surplus box.
 *
 * `yesterday` and `history` come from `GET /reports/close` (Ending) or `GET /reports/<id>` (the
 * submitted view), the same shape and rules in both.
 */
export function ReportSummary({
  code,
  sales,
  yesterday,
  history,
  lines,
  cash,
}: {
  code: string | null;
  sales: SummarySales;
  /** The day before's total sales (null: none, the green arrow alone). */
  yesterday: number | null;
  /** The 30 days up to the day, the day last. */
  history: ClosePage["sales"]["history"];
  lines: Pick<CloseLine, "item" | "amount">[];
  cash: Pick<ClosePage["cash"], "counted" | "safe_box" | "difference">;
}) {
  return (
    <>
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-lg font-bold text-flask-gray-700 sm:text-xl">Summary</h2>
        <span className="text-sm text-flask-gray-300">{code || "$"}</span>
      </div>

      <TotalSales sales={sales} yesterday={yesterday} />
      <SalesHistory history={history} />
      <TotalExpenses lines={lines} />
      <CashBalance till={cash.counted} safeBox={cash.safe_box} />
      <DifferenceBox difference={cash.difference} code={code} />
    </>
  );
}

/** Flask's red "Cash Shortage" or green "Cash Surplus" box with the reason; nothing when the count balanced. */
function DifferenceBox({ difference, code }: { difference: ClosePage["cash"]["difference"]; code: string | null }) {
  if (difference.amount === 0) return null;
  const short = difference.amount < 0;
  return (
    <div className={`mb-6 rounded-flask-lg p-4 ${short ? "bg-flask-danger-bg" : "bg-flask-success-bg"}`}>
      <div className="flex items-start">
        <div className="flex-shrink-0">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth="2"
            stroke="currentColor"
            className={`size-6 ${short ? "text-flask-danger" : "text-flask-green-500"}`}
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
          </svg>
        </div>
        <div className="ml-3 min-w-0 flex-1">
          <h3 className={`text-sm font-medium ${short ? "text-flask-red-800" : "text-flask-success-ink"}`}>
            {short ? "Cash Shortage: " : "Cash Surplus: "}
            <span className="break-all">{formatMoney(Math.abs(difference.amount), code)}</span>
          </h3>
          {difference.reason ? <p className="mt-1 text-sm text-flask-gray-600 [overflow-wrap:anywhere]">{difference.reason}</p> : null}
        </div>
      </div>
    </div>
  );
}

/**
 * Flask's "Show more" (teal, its chevron pointing up while closed, down while open). The button
 * keeps Flask's 20px line in the layout and reaches 44px for a finger through negative margins.
 */
function ShowMore({ open, controls, onToggle }: { open: boolean; controls: string; onToggle: () => void }) {
  return (
    <div className="mt-4 flex justify-end">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={controls}
        className="-my-3 flex min-h-[44px] items-center gap-1 text-sm text-flask-teal transition-colors hover:text-flask-teal/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-flask-teal"
      >
        <span>Show more</span>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth="2"
          stroke="currentColor"
          className={`h-4 w-4 text-flask-teal transition-transform duration-200 ${open ? "" : "rotate-180"}`}
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 15.75 7.5-7.5 7.5 7.5" />
        </svg>
      </button>
    </div>
  );
}

/** A breakdown line: the name on the left, the figure on the right - under the name when both don't fit. */
function Row({ label, value }: { label: ReactNode; value: string }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-2">
      <span className={`min-w-0 break-words ${ROW_TEXT}`}>{label}</span>
      <span className={`ml-auto shrink-0 text-right ${ROW_TEXT}`}>{value}</span>
    </div>
  );
}

/** A figure on one line, shrunk to fit its column when it would not (Flask's `fitBalanceText`, never under 12px). */
function Figure({ className, children }: { className: string; children: string }) {
  const ref = useFitText<HTMLSpanElement>(true);
  return (
    <span ref={ref} className={`whitespace-nowrap ${className}`}>
      {children}
    </span>
  );
}

const UP_ARROW = "M3.66137 2.29115C4.05567 1.68409 4.94433 1.68409 5.33863 2.29115L7.3938 5.45529C7.8259 6.12057 7.34846 7 6.55517 7H2.44483C1.65154 7 1.17409 6.12057 1.6062 5.4553L3.66137 2.29115Z";

function TotalSales({ sales, yesterday }: { sales: SummarySales; yesterday: number | null }) {
  const [open, setOpen] = useState(false);
  const split = salesSplit(sales);
  const compare = versusYesterday(sales.total, yesterday);
  const { electronic, delivery } = sections(sales.methods);
  const arrow = (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className={`h-[7px] w-[9px] flex-shrink-0 self-center sm:h-[9px] sm:w-[12px] md:h-[11px] md:w-[14px] ${compare.up ? "" : "rotate-180"}`}
      viewBox="0 0 9 7"
      fill="none"
      aria-hidden="true"
    >
      <path d={UP_ARROW} className={compare.up ? "fill-flask-green" : "fill-flask-red-500"} />
    </svg>
  );
  const totals: [string, number][] = [
    ["Electronic Sales", split.electronic],
    ["Delivery Sales", split.delivery],
    ["Cash Sales", split.cash],
  ];
  return (
    <div className={CARD}>
      <div className="flex flex-col">
        <div className="flex items-center justify-between">
          <h3 className={CARD_TITLE}>Total Sales</h3>
        </div>
        <Figure className="text-[30px] font-semibold text-flask-gray-900 sm:text-[45px]">{plain(sales.total)}</Figure>
        <div className="flex flex-wrap items-center gap-x-2">
          {compare.percent ? (
            <span className="flex items-center">
              {arrow}
              <span className={`text-sm font-semibold sm:text-xl ${compare.up ? "text-flask-green" : "text-flask-red-500"}`}>
                <span className="sr-only">{compare.up ? "Up " : "Down "}</span>
                {compare.percent}
              </span>
            </span>
          ) : (
            arrow
          )}
          <span className="text-sm font-semibold text-flask-gray-400 sm:text-xl">Compared to Yesterday</span>
        </div>
      </div>
      <div className="mt-6">
        <div className="flex items-center justify-between">
          {totals.map(([label, amount], i) => (
            <div key={label} className="contents">
              {i > 0 ? <div className="mx-2 h-12 w-px shrink-0 bg-flask-gray-100" /> : null}
              <div className="flex min-w-0 flex-1 flex-col items-start">
                <span className="text-[12px] text-flask-gray-400 sm:text-lg">{label}</span>
                <Figure className="mt-1 text-[16px] font-bold text-flask-gray-600 sm:text-[20px]">{plain(amount)}</Figure>
              </div>
            </div>
          ))}
        </div>
        <div hidden={!open}>
          <div className="mb-4 mt-4 border-t border-flask-gray-100" />
          <div id="sales_breakdown" className="flex gap-6">
            <div className="min-w-0 flex-1">
              {electronic.map((m) => (
                <Row key={m.value_name} label={flaskLabel(m.name)} value={plainOrDash(m.amount)} />
              ))}
            </div>
            <div className="min-w-0 flex-1 space-y-4">
              <div>
                {delivery.map((m) => (
                  <Row key={m.value_name} label={flaskLabel(m.name)} value={plainOrDash(m.amount)} />
                ))}
              </div>
              <div>
                <Row label="Cash Sales" value={plainOrDash(split.cash)} />
              </div>
            </div>
          </div>
        </div>
        <ShowMore open={open} controls="sales_breakdown" onToggle={() => setOpen((o) => !o)} />
      </div>
    </div>
  );
}

/** The box's size, px, and whether the viewport is a phone's (< 640px) - read in the browser. */
function useBox<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [box, setBox] = useState({ width: 0, height: 0, phone: true });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const phoneQuery = window.matchMedia("(max-width: 639.98px)");
    const read = () => setBox({ width: el.clientWidth, height: el.clientHeight, phone: phoneQuery.matches });
    read();
    const observer = new ResizeObserver(read);
    observer.observe(el);
    phoneQuery.addEventListener("change", read);
    return () => {
      observer.disconnect();
      phoneQuery.removeEventListener("change", read);
    };
  }, []);
  return [ref, box] as const;
}

/** Flask's Sales History: 30 bars, seven to a view, scrolled to the day (the red one, on the right). */
function SalesHistory({ history }: { history: ClosePage["sales"]["history"] }) {
  const [ref, box] = useBox<HTMLDivElement>();
  const chart = barLayout(history, box.width, box.height, box.phone);
  const last = history[history.length - 1];
  useLayoutEffect(() => {
    const el = ref.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [ref, chart.svgWidth, chart.bars.length]);
  const label = last ? `Sales for the 30 days to ${barDate(last.date).day}; that day ${plain(last.total)}` : "Sales History";
  return (
    <div className={CARD}>
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className={CARD_TITLE}>Sales History</h3>
        </div>
      </div>
      <div ref={ref} className="h-[120px] w-full overflow-x-auto overflow-y-hidden sm:h-[240px]" role="img" aria-label={label}>
        {chart.bars.length ? (
          <svg
            width={chart.svgWidth}
            height="100%"
            viewBox={`0 0 ${chart.svgWidth} ${box.height}`}
            preserveAspectRatio="none"
            className="block overflow-visible"
            aria-hidden="true"
          >
            <g transform={`translate(0, ${chart.top})`}>
              {chart.bars.map((bar) => {
                const { day, weekday } = barDate(bar.date);
                const mid = bar.x + bar.width / 2;
                return (
                  <g key={bar.date}>
                    <rect
                      x={bar.x}
                      y={bar.y}
                      width={bar.width}
                      height={bar.height}
                      rx={chart.radius}
                      ry={chart.radius}
                      className={bar.highlight ? "fill-flask-red" : "fill-flask-chart-bar"}
                    />
                    <text x={mid} y={bar.y - 5} textAnchor="middle" fontSize={chart.font} fontWeight={500} className={bar.highlight ? "fill-flask-red-500" : "fill-flask-chart-label"}>
                      {barValue(bar.value)}
                    </text>
                    <text x={mid} y={chart.chartHeight + (box.phone ? 12 : 15)} textAnchor="middle" fontSize={chart.font} className="fill-flask-gray-500">
                      {day}
                    </text>
                    <text x={mid} y={chart.chartHeight + (box.phone ? 24 : 28)} textAnchor="middle" fontSize={chart.font} className="fill-flask-gray-500">
                      {weekday}
                    </text>
                  </g>
                );
              })}
            </g>
          </svg>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Flask's donut: the slices, and in the hole the total - or the slice under the pointer (on the
 * chart or its name in the list) - at 20px, shrunk 5% at a time to fit, never under 12px.
 */
function ExpensePie({ slices, total, active, onActive }: { slices: Slice[]; total: number; active: number | null; onActive: (i: number | null) => void }) {
  const [ref, box] = useBox<HTMLDivElement>();
  const text = useRef<SVGTextElement>(null);
  const size = box.width || 200;
  const inner = size * 0.3;
  const outer = size * 0.4;
  const arcs = pieArcs(slices);
  const shown = active !== null && slices[active] ? slices[active].amount : total;
  const label = plain(shown);
  useLayoutEffect(() => {
    const el = text.current;
    if (!el || typeof el.getComputedTextLength !== "function") return;
    const max = inner * 2 * 0.85;
    let font = 20;
    el.setAttribute("font-size", String(font));
    for (let i = 0; i < 30 && el.getComputedTextLength() > max; i++) {
      font *= 0.95;
      el.setAttribute("font-size", String(font));
    }
    el.setAttribute("font-size", String(Math.max(font, 12)));
  }, [label, inner]);
  return (
    <div ref={ref} className="aspect-square w-full max-w-[200px] sm:max-w-[340px]">
      <svg width="100%" height="100%" viewBox={`0 0 ${size} ${size}`} className="overflow-visible" role="img" aria-label={`Expenses by account, ${plain(total)} in all`}>
        {arcs.map((arc) => (
          <path
            key={arc.index}
            d={arcPath(arc, size / 2, size / 2, inner, outer)}
            className={`${pieFill(arc.slice, arc.index)} cursor-pointer stroke-flask-white transition-transform duration-200 [transform-box:view-box] [transform-origin:center]`}
            style={{ transform: active === arc.index ? "scale(1.05)" : "scale(1)" }}
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
            onMouseEnter={() => onActive(arc.index)}
            onMouseLeave={() => onActive(null)}
          />
        ))}
        <text ref={text} x={size / 2} y={size / 2} textAnchor="middle" dominantBaseline="middle" fontSize={20} fontWeight={600} className="fill-flask-gray-900">
          {label}
        </text>
      </svg>
    </div>
  );
}

function TotalExpenses({ lines }: { lines: Pick<CloseLine, "item" | "amount">[] }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<number | null>(null);
  const groups = expenseGroups(lines);
  const slices = pieSlices(groups);
  const total = groups.reduce((sum, g) => sum + g.amount, 0);
  return (
    <div className={CARD}>
      <div className="flex items-center">
        <div className="flex items-center gap-2">
          <h3 className={CARD_TITLE}>Total Expenses</h3>
        </div>
      </div>
      <div>
        {lines.length > 0 ? (
          <>
            <div className="flex flex-row">
              <div className="min-w-0 flex-1">
                <div className="flex h-full items-center justify-center">
                  <ExpensePie slices={slices} total={total} active={active} onActive={setActive} />
                </div>
              </div>
              <div className="min-w-0 max-w-[50%] flex-1 sm:max-w-none">
                <div className="flex h-full flex-col items-center justify-center">
                  <ul className="flex w-full flex-col gap-1">
                    {slices.map((slice, i) => (
                      <li
                        key={`${slice.name}-${i}`}
                        className={`flex w-full cursor-pointer items-center gap-2 transition duration-200 ${active === i ? "scale-[1.02] opacity-80" : ""}`}
                        onMouseEnter={() => setActive(i)}
                        onMouseLeave={() => setActive(null)}
                        title={slice.name}
                      >
                        <span className={`h-1 w-1 flex-shrink-0 rounded-full ${pieDot(slice, i)}`} aria-hidden="true" />
                        <span className="flex min-w-0 flex-1 flex-col overflow-hidden">
                          <span className="block truncate text-[12px] font-semibold text-flask-gray-700 sm:text-lg">{slice.name}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
            <div hidden={!open}>
              <div className="mb-4 mt-4 border-t border-flask-gray-100" />
              <div id="expenses_breakdown">
                {groups.map((g, i) => (
                  <Row key={`${g.item}-${i}`} label={expenseName(g.item)} value={plain(g.amount)} />
                ))}
              </div>
            </div>
            <ShowMore open={open} controls="expenses_breakdown" onToggle={() => setOpen((o) => !o)} />
          </>
        ) : (
          <div className="py-4 text-center">
            <p className="text-sm text-flask-gray-500">No expenses recorded</p>
          </div>
        )}
      </div>
    </div>
  );
}

/** Flask's Cash Balance: what was counted (till + safebox); Show more splits it. */
function CashBalance({ till, safeBox }: { till: number; safeBox: number }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={CARD}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h3 className={CARD_TITLE}>Cash Balance</h3>
        </div>
        <span className="min-w-0 text-right text-lg font-semibold text-flask-gray-900 [overflow-wrap:anywhere] sm:text-2xl">{plain(cents(till + safeBox))}</span>
      </div>
      <div hidden={!open}>
        <div className="mb-4 mt-4 border-t border-flask-gray-100" />
        <div id="cash_breakdown">
          <Row label="Cash Till Balance" value={plainOrDash(till)} />
          <Row label="Safebox" value={plainOrDash(safeBox)} />
        </div>
      </div>
      <ShowMore open={open} controls="cash_breakdown" onToggle={() => setOpen((o) => !o)} />
    </div>
  );
}
