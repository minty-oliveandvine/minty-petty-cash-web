import { describe, expect, it } from "vitest";

import {
  denominationLabel,
  depositResult,
  differenceText,
  expectedCash,
  type CashCountPage,
  type Denomination,
} from "@/lib/cashCount";
import { money } from "@/lib/money";
import { kpiCards } from "@/lib/report";
import { salesTotals } from "@/lib/sales";

// How this app writes and reads an amount, through its own call sites. owner 2026-10-21: one money
// rule (@minty/shared/money) - "HKD 1,234.50": the ISO code, a non-breaking space, the currency's
// places; never "$" or "HK$"; with no currency the amount says so - "12.00 (No currency selected)"
// (owner 2026-10-22: no silent fallback); extra decimals are cut, not rounded;
// an empty field parses to null, and each call site says what that counts as.

const kpi = (kpis: Parameters<typeof kpiCards>[0], code: string | null = "HKD") =>
  kpiCards(kpis, null, code).map((k) => k.value);
const note = (value: number): Denomination => ({
  id: String(value),
  value,
  kind: value >= 10 ? "note" : "coin",
  count: 0,
});

describe("an amount on the page", () => {
  it("is the code, a non-breaking space, then the number grouped in threes with two places", () => {
    // owner 2026-10-21: one money rule (@minty/shared/money) - was "HKD1,234.50", no space
    expect(kpi({ total_sales: 1234.5, total_expenses: 0 })).toEqual([
      "HKD\u00a01,234.50",
      "HKD\u00a00.00",
    ]);
    expect(kpi({ total_sales: 99999999999.99 })).toEqual(["HKD\u00a099,999,999,999.99"]);
  });

  it("says so when the company has no currency - never $, never a bare number", () => {
    // owner 2026-10-22: no silent fallback - was "$12.00", then "12.00"
    expect(kpi({ total_sales: 12 }, null)).toEqual(["12.00 (No currency selected)"]);
    expect(kpi({ total_sales: 12 }, "")).toEqual(["12.00 (No currency selected)"]);
  });

  it("leads with the sign below zero", () => {
    expect(kpi({ cash_position: -120 })).toEqual(["-HKD\u00a0120.00"]);
    expect(kpi({ cash_position: 1250.5 })).toEqual(["HKD\u00a01,250.50"]);
  });

  it("cuts a third decimal rather than rounding it", () => {
    // owner 2026-10-21: one money rule (@minty/shared/money) - was rounded: "HKD10.00", "HKD1.01"
    expect(kpi({ total_sales: 9.999 })).toEqual(["HKD\u00a09.99"]);
    expect(kpi({ total_sales: 1.005 })).toEqual(["HKD\u00a01.00"]);
    // ...but a float sum's noise is not a cent short
    expect(kpi({ total_sales: 0.1 + 0.2 })).toEqual(["HKD\u00a00.30"]);
  });

  it("is empty for a non-number", () => {
    // owner 2026-10-21: one money rule (@minty/shared/money) - was "HKD0.00"
    expect(kpi({ total_sales: Number.NaN })).toEqual([""]);
    expect(kpi({ total_sales: Number.POSITIVE_INFINITY })).toEqual([""]);
  });

  // A fixed 8dp render once lost a cent here (12345678901.98999977); the package renders at 15
  // significant digits now.
  it("keeps every digit of an 11-digit amount", () => {
    expect(kpi({ total_sales: 12345678901.99 })).toEqual(["HKD\u00a012,345,678,901.99"]);
  });

  it("names a denomination without a whole note's .00", () => {
    // owner 2026-10-21: one money rule (@minty/shared/money) - was "HKD1,000" / "HKD0.50"; "$1,000" with no code
    expect(denominationLabel(note(1000), "HKD")).toBe("HKD\u00a01,000");
    expect(denominationLabel(note(0.5), "HKD")).toBe("HKD\u00a00.50");
    expect(denominationLabel(note(0.1), "HKD")).toBe("HKD\u00a00.10");
    expect(denominationLabel(note(1000), null)).toBe("1,000");
  });

  it("writes the difference and the deposit in words with the spaced form", () => {
    expect(differenceText({ amount: -20, kind: "short" }, "HKD")).toBe("HKD\u00a020.00 short");
    expect(differenceText({ amount: 0.01, kind: "over" }, "HKD")).toBe("HKD\u00a00.01 over");
    expect(depositResult("1,300.5", "HKD")).toBe("HKD\u00a01,300.50 to the bank");
  });
});

describe("money(), the app's one display helper", () => {
  it("is the shared format with a currency", () => {
    expect(money(1234.5, "HKD")).toBe("HKD\u00a01,234.50");
    expect(money(-120, "hkd ")).toBe("-HKD\u00a0120.00");
    expect(money("0.5", "SGD")).toBe("SGD\u00a00.50");
  });

  it("says no currency is selected rather than guess one", () => {
    expect(money(1234.5, null)).toBe("1,234.50 (No currency selected)");
    expect(money(-120, undefined)).toBe("-120.00 (No currency selected)");
    expect(money(0, "  ")).toBe("0.00 (No currency selected)");
  });

  it("stays empty when there is no number, with or without a currency", () => {
    for (const code of ["HKD", null]) {
      expect(money(null, code)).toBe("");
      expect(money(undefined, code)).toBe("");
      expect(money("", code)).toBe("");
      expect(money(Number.NaN, code)).toBe("");
    }
  });
});

describe("a typed amount read back", () => {
  const page = { cash_on_hand: 500 } as CashCountPage;

  it("counts an empty field as nothing at each call site (the shared parser says null, never a silent 0)", () => {
    expect(expectedCash(page, "")).toBe(500);
    expect(expectedCash(page, ".")).toBe(500);
    expect(expectedCash(page, "120.50")).toBe(379.5);
    expect(depositResult("", "HKD")).toBe("None today");
    expect(salesTotals([], {}, "")).toEqual({ electronic: 0, delivery: 0, cash: 0, total: 0 });
    expect(salesTotals([], {}, "1,234.50").cash).toBe(1234.5);
  });
});
