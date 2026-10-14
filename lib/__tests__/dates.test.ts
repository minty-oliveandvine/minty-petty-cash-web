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
  it("is the currency code, then the amount", () => {
    expect(formatMoney(1234.5, "HKD")).toBe("HKD1,234.50");
    expect(formatMoney(0, null)).toBe("$0.00");
  });
});
