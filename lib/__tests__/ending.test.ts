import { describe, expect, it } from "vitest";

import {
  OTHER_EXPENSES,
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
} from "@/lib/ending";

describe("Compared to Yesterday (Flask's sales_percentage_abs, is_sales_increase)", () => {
  it("has nothing to compare without a day before: the green arrow alone", () => {
    expect(versusYesterday(500, null)).toEqual({ up: true, percent: null });
    expect(versusYesterday(500, 0)).toEqual({ up: true, percent: null });
  });
  it("says the rise in percent, one decimal", () => {
    expect(versusYesterday(150, 100)).toEqual({ up: true, percent: "50.0%" });
    expect(versusYesterday(1234.5, 1000)).toEqual({ up: true, percent: "23.4%" });
  });
  it("says a fall as a positive percent, pointing down", () => {
    expect(versusYesterday(80, 100)).toEqual({ up: false, percent: "20.0%" });
    expect(versusYesterday(0, 250)).toEqual({ up: false, percent: "100.0%" });
  });
  it("calls an unchanged day a red 0.0%, as Flask does (only a rise is up)", () => {
    expect(versusYesterday(100, 100)).toEqual({ up: false, percent: "0.0%" });
  });
});

describe("the Total Sales figures", () => {
  it("sums electronic and delivery from the method rows, cash its own", () => {
    const sales = {
      methods: [
        {
          sale_id: "1",
          name: "Visa",
          value_name: "visa_sales",
          type: "electronic" as const,
          amount: 100.1,
        },
        {
          sale_id: "2",
          name: "Alipay",
          value_name: "alipay_sales",
          type: "electronic" as const,
          amount: 0.2,
        },
        {
          sale_id: "3",
          name: "Keeta",
          value_name: "keeta_sales",
          type: "delivery" as const,
          amount: 50,
        },
      ],
      cash: 600,
      total: 750.3,
      yesterday_total: null,
      history: [],
    };
    const split = salesSplit(sales);
    expect(split.electronic).toBeCloseTo(100.3, 10);
    expect(split.delivery).toBe(50);
    expect(split.cash).toBe(600);
  });
  it("writes figures as Flask's {:,.2f}, and nothing as -", () => {
    expect(plain(1234567.5)).toBe("1,234,567.50");
    expect(plain(0)).toBe("0.00");
    expect(plainOrDash(0)).toBe("-");
    expect(plainOrDash(null)).toBe("-");
    expect(plainOrDash(12)).toBe("12.00");
  });
});

describe("expenses by account (Flask's grouping, the pie's top seven and Other expenses)", () => {
  const line = (item: string, amount: number) => ({ item, amount });

  it("adds up an account's lines and puts the largest first", () => {
    expect(
      expenseGroups([line("Food", 10), line("Rent", 100), line("Food", 15.5), line("Fuel", 25.5)]),
    ).toEqual([
      { item: "Rent", amount: 100 },
      { item: "Food", amount: 25.5 },
      { item: "Fuel", amount: 25.5 },
    ]);
  });
  it("names a line with no account N/A and writes & as and", () => {
    expect(expenseName("")).toBe("N/A");
    expect(expenseName("Food & Drink")).toBe("Food and Drink");
  });
  it("names seven accounts and sums the rest as Other expenses", () => {
    const groups = expenseGroups(Array.from({ length: 10 }, (_, i) => line(`A${i}`, 100 - i)));
    const slices = pieSlices(groups);
    expect(slices).toHaveLength(8);
    expect(slices.slice(0, 7).map((s) => s.name)).toEqual([
      "A0",
      "A1",
      "A2",
      "A3",
      "A4",
      "A5",
      "A6",
    ]);
    expect(slices[7]).toEqual({ name: OTHER_EXPENSES, amount: 93 + 92 + 91, other: true });
  });
  it("has no Other expenses with seven accounts or fewer", () => {
    const slices = pieSlices(expenseGroups(Array.from({ length: 7 }, (_, i) => line(`A${i}`, 10))));
    expect(slices.some((s) => s.other)).toBe(false);
  });
});

describe("the donut (Flask's initializePieChart)", () => {
  const slice = (amount: number, other = false) => ({
    name: other ? OTHER_EXPENSES : "x",
    amount,
    other,
  });

  it("shares the circle by amount, from the top, with a 0.03 gap after each slice", () => {
    const arcs = pieArcs([slice(300), slice(100)]);
    const available = Math.PI * 2 - 0.06;
    expect(arcs[0].start).toBeCloseTo(-Math.PI / 2, 10);
    expect(arcs[0].end - arcs[0].start).toBeCloseTo(available * 0.75, 10);
    expect(arcs[1].start).toBeCloseTo(arcs[0].end + 0.03, 10);
    expect(arcs[1].end - arcs[1].start).toBeCloseTo(available * 0.25, 10);
  });
  it("draws a tiny slice at 1% of the circle at least", () => {
    const arcs = pieArcs([slice(100000), slice(1)]);
    expect(arcs[1].end - arcs[1].start).toBeCloseTo(Math.PI * 2 * 0.01, 10);
  });
  it("draws Other expenses as 2% of the total at least", () => {
    const arcs = pieArcs([slice(1000), slice(0.5, true)]);
    // 0.50 of 1,000.50 is swapped for 2% of it (20.01), and the total grows to match
    const shown = 1000.5 * 0.02;
    const total = 1000.5 - 0.5 + shown;
    expect(arcs[1].end - arcs[1].start).toBeCloseTo((shown / total) * (Math.PI * 2 - 0.06), 10);
    expect(arcs[0].end - arcs[0].start).toBeCloseTo((1000 / total) * (Math.PI * 2 - 0.06), 10);
  });
  it("skips a zero slice but keeps its gap, and draws nothing for no money", () => {
    const arcs = pieArcs([slice(100), slice(0), slice(100)]);
    expect(arcs.map((a) => a.index)).toEqual([0, 2]);
    expect(arcs[1].start).toBeCloseTo(arcs[0].end + 0.06, 10);
    expect(pieArcs([slice(0)])).toEqual([]);
  });
  it("closes every segment's path", () => {
    expect(arcPath({ start: 0, end: 1 }, 100, 100, 60, 80)).toMatch(
      /^M .* A 80 80 0 0 1 .* A 60 60 0 0 0 .* Z$/,
    );
    expect(arcPath({ start: 0, end: 4 }, 100, 100, 60, 80)).toContain("A 80 80 0 1 1");
    expect(arcPath({ start: 0, end: 0.005 }, 100, 100, 60, 80)).not.toContain(" A ");
  });
});

describe("Sales History (Flask's initializeBarChart, scrollable, seven to a view)", () => {
  const days = (totals: number[]) =>
    totals.map((total, i) => ({ date: `2026-10-${String(i + 1).padStart(2, "0")}`, total }));

  it("scales the tallest bar to the full drawing height, the others in proportion", () => {
    const { bars, chartHeight, top } = barLayout(days([50, 200, 100]), 700, 240, false);
    expect(top).toBe(30);
    expect(chartHeight).toBe(240 - 30 - 35);
    expect(bars[1].height).toBe(chartHeight);
    expect(bars[1].y).toBe(0);
    expect(bars[0].height).toBeCloseTo(chartHeight / 4, 10);
    expect(bars[2].y).toBeCloseTo(chartHeight / 2, 10);
  });
  it("spaces seven bars to the box's width and runs the rest past it, the day highlighted", () => {
    const history = days(Array.from({ length: 30 }, (_, i) => i + 1));
    const { bars, svgWidth } = barLayout(history, 700, 240, false);
    expect(bars[1].x - bars[0].x).toBe(100);
    expect(bars[0].width).toBe(90);
    expect(svgWidth).toBe(29 * 100 + 90);
    expect(bars.filter((b) => b.highlight).map((b) => b.date)).toEqual(["2026-10-30"]);
  });
  it("uses the phone's margins, bar width and corner on a phone", () => {
    const chart = barLayout(days([10, 20]), 280, 120, true);
    expect(chart.top).toBe(25);
    expect(chart.chartHeight).toBe(120 - 25 - 30);
    expect(chart.bars[0].width).toBeCloseTo((280 / 7) * 0.85, 10);
    expect(chart.radius).toBe(8);
    expect(chart.font).toBe(10);
  });
  it("draws nothing when every day is zero (Flask returns early)", () => {
    expect(barLayout(days([0, 0, 0]), 700, 240, false).bars).toEqual([]);
  });
  it("labels a bar as Flask does", () => {
    expect(barValue(1234.5)).toBe("1.2k");
    expect(barValue(1000)).toBe("1.0k");
    expect(barValue(88.5)).toBe("88.5");
    expect(barValue(0)).toBe("0");
    expect(barDate("2026-10-13")).toEqual({ day: "13 OCT", weekday: "TUE" });
    expect(barDate("2026-09-01")).toEqual({ day: "1 SEP", weekday: "TUE" });
  });
});
