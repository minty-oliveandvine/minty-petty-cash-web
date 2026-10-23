import { describe, expect, it } from "vitest";

import {
  cents,
  countProblem,
  denominationLabel,
  depositProblem,
  difference,
  differenceKind,
  parseCount,
  reasonNeeded,
  reasonProblem,
  rowTotal,
  sanitizeCount,
  tillTotal,
} from "@/lib/cash";

const HKD = [
  { id: "n1000", value: 1000 },
  { id: "n100", value: 100 },
  { id: "c1", value: 1 },
  { id: "c050", value: 0.5 },
  { id: "c020", value: 0.2 },
  { id: "c010", value: 0.1 },
];

describe("cents", () => {
  it("rounds to the cent, as the service's cents() does", () => {
    expect(cents(0.1 + 0.2)).toBe(0.3);
    expect(cents(1.005)).toBe(1.01);
    expect(cents(-11.499999999)).toBe(-11.5);
    expect(cents(Number.NaN)).toBe(0);
  });
});

describe("the deposit's limit", () => {
  it("allows up to the cash on hand, to the cent", () => {
    expect(depositProblem(0, 155, "HKD")).toBeNull();
    expect(depositProblem(155, 155, "HKD")).toBeNull();
    expect(depositProblem(0.1 + 0.2, 0.3, "HKD")).toBeNull();
  });

  it("names the amount allowed when it is more", () => {
    expect(depositProblem(155.01, 155, "HKD")).toBe(
      "The deposit can't be more than the cash on hand. Enter HKD\u00a0155.00 or less.",
    );
    expect(depositProblem(2000, 1234.5, null)).toBe(
      "The deposit can't be more than the cash on hand. Enter 1,234.50 (No currency selected) or less.",
    );
  });
});

describe("denomination labels", () => {
  it("are the currency code, a space and the denomination's name (cash_info.cash_name) without its symbol", () => {
    expect(denominationLabel(1000, "HKD", "$1,000")).toBe("HKD\u00a01,000");
    expect(denominationLabel(10, "SGD", "S$10")).toBe("SGD\u00a010");
    expect(denominationLabel(0.5, "HKD", "50c")).toBe("HKD\u00a050c");
  });

  it('are just the figure with no currency - never a "$" (the dashboard keeps a report from starting without one)', () => {
    expect(denominationLabel(5, null, "$5")).toBe("5");
    expect(denominationLabel(1000, null, "$1,000")).toBe("1,000");
    expect(denominationLabel(0.1, null)).toBe("0.10");
    expect(denominationLabel(20, "", null)).toBe("20");
  });

  it("without a name, keep Flask's whole-number label for notes and name coins under 1 by their value", () => {
    expect(denominationLabel(1000, "HKD")).toBe("HKD\u00a01000");
    expect(denominationLabel(1, "HKD")).toBe("HKD\u00a01");
    expect(denominationLabel(0.5, "HKD")).toBe("HKD\u00a00.50");
    expect(denominationLabel(0.2, "HKD")).toBe("HKD\u00a00.20");
    expect(denominationLabel(100, "HKD", null)).toBe("HKD\u00a0100");
    expect(denominationLabel(100, "HKD", "")).toBe("HKD\u00a0100");
  });
});

describe("counts", () => {
  it("take whole numbers only", () => {
    expect(sanitizeCount("12")).toBe("12");
    expect(sanitizeCount("1.5")).toBe("15");
    expect(sanitizeCount("-3e2")).toBe("32");
    expect(sanitizeCount("007")).toBe("7");
    expect(sanitizeCount("0")).toBe("0");
    expect(sanitizeCount("123456789")).toBe("1234567");
    expect(parseCount("")).toBe(0);
    expect(parseCount("42")).toBe(42);
  });

  it("refuse more than the API's limit, naming it", () => {
    expect(countProblem("1000000")).toBeNull();
    expect(countProblem("1000001")).toBe(
      "A count can't be more than 1,000,000. Enter 1,000,000 or less.",
    );
  });

  it("total by row and for the till, coins included", () => {
    expect(rowTotal(0.5, 3)).toBe(1.5);
    expect(rowTotal(0.1, 3)).toBe(0.3);
    expect(tillTotal(HKD, { n1000: 1, n100: 2, c050: 1, c010: 3 })).toBe(1200.8);
    expect(tillTotal(HKD, {})).toBe(0);
  });
});

describe("the difference", () => {
  it("is (till + safebox) - expected, to the cent", () => {
    expect(difference(1000, 200, 1211.5)).toBe(-11.5);
    expect(difference(1000.3, 0, 1000.1)).toBe(0.2);
    expect(difference(0.1 + 0.2, 0, 0.3)).toBe(0);
  });

  it("counts any cent - short, over or none", () => {
    expect(differenceKind(difference(1000, 0, 1000.01))).toBe("short");
    expect(differenceKind(difference(1000.01, 0, 1000))).toBe("over");
    expect(differenceKind(difference(1000, 0, 1000))).toBe("none");
    expect(differenceKind(-0.004)).toBe("none");
  });

  it("asks for a reason in the API's words", () => {
    expect(reasonNeeded(-0.01, "HKD")).toBe(
      "The count is HKD\u00a00.01 short. Add the reason to continue.",
    );
    expect(reasonNeeded(25, "HKD")).toBe(
      "The count is HKD\u00a025.00 over. Add the reason to continue.",
    );
  });

  it("keeps the reason to 300 characters", () => {
    expect(reasonProblem("x".repeat(300))).toBeNull();
    expect(reasonProblem(` ${"x".repeat(300)} `)).toBeNull();
    expect(reasonProblem("x".repeat(301))).toBe("Keep the reason to 300 characters or fewer.");
  });
});
