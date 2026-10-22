import { describe, expect, it } from "vitest";

import { addDays, formatDay, formatDayWithWeekday, formatMonth, monthGrid, shiftMonth } from "@/lib/dates";
import { formatMoney } from "@/lib/money";

describe("report days", () => {
  it("add across months and years", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
  });

  it("read as Flask wrote them", () => {
    expect(formatDay("2026-10-04")).toBe("04 Oct 2026");
    expect(formatDayWithWeekday("2026-10-14")).toBe("14 Oct 2026 Wed");
    expect(formatMonth(2026, 9)).toBe("October 2026");
  });

  it("make a six-week grid starting on Sunday", () => {
    const grid = monthGrid(2026, 9); // October 2026 starts on a Thursday
    expect(grid).toHaveLength(42);
    expect(grid[0]).toEqual({ iso: "2026-09-27", inMonth: false });
    expect(grid[4]).toEqual({ iso: "2026-10-01", inMonth: true });
    expect(grid.filter((d) => d.inMonth)).toHaveLength(31);
  });

  it("move between months", () => {
    expect(shiftMonth(2026, 11, 1)).toEqual({ year: 2027, month: 0 });
    expect(shiftMonth(2026, 0, -1)).toEqual({ year: 2025, month: 11 });
  });
});

describe("money", () => {
  it("is the currency code, a non-breaking space, then the amount", () => {
    expect(formatMoney(1234.5, "HKD")).toBe("HKD\u00a01,234.50");
    expect(formatMoney(1234567, "HKD")).toBe("HKD\u00a01,234,567.00");
    expect(formatMoney(-12.5, "HKD")).toBe("HKD\u00a0-12.50");
  });

  it("is never a \"$\": with no currency the amount says so (owner, 2026-10-21)", () => {
    expect(formatMoney(12, null)).toBe("12.00 (No currency selected)");
    expect(formatMoney(0, null)).toBe("0.00 (No currency selected)");
    expect(formatMoney(1234.5, "")).toBe("1,234.50 (No currency selected)");
  });

  it("cuts extra decimals, never rounds them", () => {
    expect(formatMoney(1.239, "HKD")).toBe("HKD\u00a01.23");
    expect(formatMoney(1234567.899, "HKD")).toBe("HKD\u00a01,234,567.89");
    expect(formatMoney(-12.349, "HKD")).toBe("HKD\u00a0-12.34");
    // float noise is not a decimal to cut
    expect(formatMoney(0.29, "HKD")).toBe("HKD\u00a00.29");
    expect(formatMoney(0.3 - 0.1, "HKD")).toBe("HKD\u00a00.20");
    expect(formatMoney(-0.001, "HKD")).toBe("HKD\u00a00.00");
  });

  it("is empty for a non-number", () => {
    expect(formatMoney(Number.NaN, "HKD")).toBe("");
    expect(formatMoney(Number.POSITIVE_INFINITY, null)).toBe("");
  });
});
