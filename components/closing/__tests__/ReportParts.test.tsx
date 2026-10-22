import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { MoneyFlow, OutcomeBand } from "@/components/closing/ReportParts";
import { kpiCards, type ExpenseBar, type MixSegment } from "@/lib/report";

// Amounts read "HKD 760.00" - owner 2026-10-21: one money rule (@minty/shared/money); they were "HKD760.00".

// The Daily Report's outcome band and "Where the money came from and went" (Part 15.7; the
// owner's brief 2026-10-19). The figures' rules are lib/__tests__/report.test.ts.

const KPIS = kpiCards({ total_sales: 1070.5, total_expenses: 240.5, cash_position: 760 }, 2, "HKD");

describe("the outcome band", () => {
  it("makes Cash position the one hero amount, with sales and expenses secondary", () => {
    render(<OutcomeBand kpis={KPIS} />);
    // One list, so each value is read with its label: the hero first.
    const lists = document.querySelectorAll("dl");
    expect(lists).toHaveLength(1);
    expect(within(lists[0]).getAllByRole("term").map((dt) => dt.textContent)).toEqual(["Cash position", "Total sales", "Total expenses"]);
    const hero = screen.getByText("HKD 760.00");
    expect(hero.tagName).toBe("DD");
    expect(hero).toHaveClass("text-display-xl");
    expect(document.querySelectorAll(".text-display-xl")).toHaveLength(1);
    expect(screen.getByText("HKD 1,070.50")).toHaveClass("text-title-l");
    expect(screen.getByText("HKD 240.50")).toHaveClass("text-title-l");
    expect(screen.getByText("2 expenses")).toBeInTheDocument();
    expect(screen.getByText("Counted, with the safe box")).toBeInTheDocument();
  });

  it("carries the Petty Cash chip and the decorative safe box, never coloured amounts", () => {
    const { container } = render(<OutcomeBand kpis={KPIS} />);
    // the label sits in its own span beside the icon, so the chip is its parent
    expect(screen.getByText("Petty Cash").parentElement).toHaveClass("bg-module-pettycash-wash", "text-module-pettycash-ink");
    const art = container.querySelector("img")!;
    expect(art).toHaveAttribute("alt", "");
    expect(art.getAttribute("src")).toContain("safebox.webp");
    expect(art).toHaveClass("hidden", "sm:block");
    for (const dd of container.querySelectorAll("dd[translate='no']")) expect(dd).toHaveClass("text-text-primary");
  });

  it("draws only the KPIs that arrived, and nothing for none", () => {
    render(<OutcomeBand kpis={kpiCards({ total_sales: 5 }, null, "HKD")} />);
    expect(screen.getAllByRole("term").map((dt) => dt.textContent)).toEqual(["Total sales"]);
    expect(document.querySelector(".text-display-xl")).toBeNull();
    const { container } = render(<OutcomeBand kpis={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});

const SALES: MixSegment[] = [
  { key: "cash", label: "Cash", amount: 300, pct: 71, width: 71.43, tone: 1 },
  { key: "visa_sales", label: "Visa", amount: 120, pct: 29, width: 28.57, tone: 2 },
];
const EXPENSES: ExpenseBar[] = [
  { name: "Staff meals", amount: 40, width: 100 },
  { name: "Office supplies", amount: 35, width: 87.5 },
];

describe("where the money came from and went", () => {
  it("draws the sales mix as one proportion bar and a legend, read as text", () => {
    render(<MoneyFlow sales={SALES} expenses={EXPENSES} code="HKD" />);
    expect(screen.getByRole("heading", { level: 2, name: "Where the money came from and went" })).toBeInTheDocument();
    const bar = screen.getByRole("img", { name: "Sales by method: Cash HKD\u00a0300.00, 71%; Visa HKD\u00a0120.00, 29%" });
    const segments = bar.querySelectorAll("[data-chart-tone]");
    expect([...segments].map((s) => s.getAttribute("data-chart-tone"))).toEqual(["1", "2"]);
    expect((segments[0] as HTMLElement).style.flexGrow).toBe("71.43");
    const legend = screen.getAllByRole("listitem").map((li) => li.textContent);
    expect(legend).toEqual(["CashHKD\u00a0300.00· 71%", "VisaHKD\u00a0120.00· 29%"]);
  });

  it("draws the expenses by account as bar rows against the largest, read as text", () => {
    render(<MoneyFlow sales={SALES} expenses={EXPENSES} code="HKD" />);
    const rows = screen.getByRole("img", { name: "Expenses by account: Staff meals HKD\u00a040.00; Office supplies HKD\u00a035.00" });
    const fills = rows.querySelectorAll<HTMLElement>(".bg-brand-primary");
    expect([...fills].map((f) => f.style.width)).toEqual(["100%", "87.5%"]);
  });

  it("says so when the day had no sales or no expenses", () => {
    render(<MoneyFlow sales={[]} expenses={[]} code="HKD" />);
    expect(screen.getByText("No sales this day.")).toBeInTheDocument();
    expect(screen.getByText("No expenses this day.")).toBeInTheDocument();
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("draws a single method as one full bar", () => {
    render(<MoneyFlow sales={[{ key: "cash", label: "Cash", amount: 300, pct: 100, width: 100, tone: 1 }]} expenses={[]} code="HKD" />);
    const bar = screen.getByRole("img", { name: "Sales by method: Cash HKD\u00a0300.00, 100%" });
    expect(bar.querySelectorAll("[data-chart-tone]")).toHaveLength(1);
  });
});
