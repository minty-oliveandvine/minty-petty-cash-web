import { describe, expect, it } from "vitest";

import {
  belowZero,
  cashCountDirty,
  countedCash,
  countProblem,
  denominationGroups,
  denominationLabel,
  depositProblem,
  difference,
  differenceText,
  drawerTotal,
  expectedCash,
  initialValues,
  openingCash,
  parseCount,
  reasonHelper,
  reasonProblem,
  rowTotal,
  sanitizeCount,
  savePayload,
  type CashCountPage,
  type Denomination,
} from "@/lib/cashCount";

const d = (id: string, value: number, kind: string, count = 0): Denomination => ({ id, value, kind, count });

const denominations = [d("n500", 500, "note"), d("n100", 100, "note", 2), d("c5", 5, "coin"), d("c050", 0.5, "coin"), d("c010", 0.1, "coin")];

const page = (over: Partial<CashCountPage> = {}): CashCountPage => ({
  transaction_date: "2026-10-13",
  currency_code: "HKD",
  draft: { id: "d", status: "draft", current_section: "deposit", completed_sections: ["opening", "sales", "expenses"], xero_integrated: false, publishing_status: null },
  opening_balance: 500,
  cash_addition: 100,
  cash_sales: 820.5,
  expenses: 120,
  bank_deposit: 0,
  cash_on_hand: 1300.5,
  expected_cash: 1300.5,
  denominations,
  safe_box_balance: 0,
  discrepancy: { amount: 0, kind: "none", reason: "" },
  ...over,
});

describe("the figures", () => {
  it("start from the opening cash, and expect the cash on hand less the deposit as typed", () => {
    expect(openingCash(page())).toBe(600);
    expect(expectedCash(page(), "")).toBe(1300.5);
    expect(expectedCash(page(), "300.25")).toBe(1000.25);
    expect(expectedCash(page(), "1,300.50")).toBe(0);
  });

  it("total each row and the drawer in cents - a 0.50 coin and three 0.10 coins are exact", () => {
    expect(rowTotal(d("c050", 0.5, "coin"), "3")).toBe(1.5);
    expect(rowTotal(d("c010", 0.1, "coin"), "3")).toBe(0.3);
    expect(rowTotal(d("n500", 500, "note"), "")).toBe(0);
    expect(drawerTotal(denominations, { n500: "2", n100: "3", c5: "1", c050: "3", c010: "3" })).toBe(1306.8);
    expect(drawerTotal(denominations, {})).toBe(0);
  });

  it("count the safebox with the drawer", () => {
    expect(countedCash(1000, "")).toBe(1000);
    expect(countedCash(1000, "250.75")).toBe(1250.75);
  });
});

describe("the difference", () => {
  it("is counted less expected: short below zero, over above, none at zero", () => {
    expect(difference(1280.5, 1300.5)).toEqual({ amount: -20, kind: "short" });
    expect(difference(1320.5, 1300.5)).toEqual({ amount: 20, kind: "over" });
    expect(difference(1300.5, 1300.5)).toEqual({ amount: 0, kind: "none" });
  });

  it("counts a single cent either way (the owner, 2026-10-15)", () => {
    expect(difference(1300.49, 1300.5)).toEqual({ amount: -0.01, kind: "short" });
    expect(difference(1300.51, 1300.5)).toEqual({ amount: 0.01, kind: "over" });
    // float noise is not a difference
    expect(difference(0.1 + 0.2, 0.3).kind).toBe("none");
  });

  it("is said in words, never colour alone", () => {
    expect(differenceText({ amount: -20, kind: "short" }, "HKD")).toBe("HKD20.00 short");
    expect(differenceText({ amount: 0.01, kind: "over" }, "HKD")).toBe("HKD0.01 over");
    expect(differenceText({ amount: 0, kind: "none" }, "HKD")).toBe("None");
    expect(differenceText({ amount: -1234.5, kind: "short" }, null)).toBe("$1,234.50 short");
  });
});

describe("the deposit limit", () => {
  it("allows up to the cash on hand, and names the amount allowed above it", () => {
    expect(depositProblem(page(), "")).toBeNull();
    expect(depositProblem(page(), "1,300.50")).toBeNull();
    expect(depositProblem(page(), "1300.51")).toBe("The deposit can't be more than the cash on hand. Enter HKD1,300.50 or less.");
  });

  it("leaves a cash on hand below zero to the gate", () => {
    const negative = page({ cash_on_hand: -20 });
    expect(belowZero(negative)).toBe(true);
    expect(belowZero(page())).toBe(false);
    expect(belowZero(page({ cash_on_hand: 0 }))).toBe(false);
    expect(depositProblem(negative, "5")).toBeNull();
  });
});

describe("the counts", () => {
  it("take whole numbers only, at most seven digits", () => {
    expect(sanitizeCount("1a2.5-")).toBe("125");
    expect(sanitizeCount("123456789")).toBe("1234567");
    expect(parseCount("")).toBe(0);
    expect(parseCount("007")).toBe(7);
  });

  it("refuse more than a million as typed, naming the limit", () => {
    expect(countProblem("1000000")).toBeNull();
    expect(countProblem("1000001")).toBe("The count is 1,000,001. Enter 1,000,000 or fewer.");
    expect(countProblem("")).toBeNull();
  });
});

describe("the reason", () => {
  const short = { amount: -20, kind: "short" as const };
  const none = { amount: 0, kind: "none" as const };

  it("is asked for only after a refused Save & Next, and only while there is a difference", () => {
    expect(reasonProblem("", short, "HKD", { submitted: false })).toBeNull();
    expect(reasonProblem("", short, "HKD", { submitted: true })).toBe("The count is HKD20.00 short. Add the reason to continue.");
    expect(reasonProblem("   ", short, "HKD", { submitted: true })).toBe("The count is HKD20.00 short. Add the reason to continue.");
    expect(reasonProblem("Float swap", short, "HKD", { submitted: true })).toBeNull();
    expect(reasonProblem("", none, "HKD", { submitted: true })).toBeNull();
    expect(reasonProblem("", { amount: 0.01, kind: "over" }, "HKD", { submitted: true })).toBe("The count is HKD0.01 over. Add the reason to continue.");
  });

  it("over 300 characters says so at once; the helper counts live", () => {
    expect(reasonProblem("x".repeat(300), short, "HKD", { submitted: false })).toBeNull();
    expect(reasonProblem("x".repeat(301), none, "HKD", { submitted: false })).toBe("The reason is 301 characters. Shorten it to 300 characters or fewer.");
    expect(reasonHelper(" Float swap ")).toBe("So the reviewer knows what happened. 10 of 300 characters.");
  });
});

describe("the denominations", () => {
  it("are named by their value, a coin under one with its cents", () => {
    expect(denominationLabel(d("a", 1000, "note"), "HKD")).toBe("HKD1,000");
    expect(denominationLabel(d("b", 0.5, "coin"), "HKD")).toBe("HKD0.50");
    expect(denominationLabel(d("c", 2, "coin"), null)).toBe("$2");
  });

  it("group notes, then coins, then anything else, in the company's order", () => {
    const groups = denominationGroups([d("c1", 1, "coin"), d("x", 3, "token"), d("n1", 20, "note"), d("n2", 10, "note")]);
    expect(groups.map((g) => [g.title, g.items.map((i) => i.id)])).toEqual([
      ["Notes", ["n1", "n2"]],
      ["Coins", ["c1"]],
      ["Other cash", ["x"]],
    ]);
  });
});

describe("the fields and the save", () => {
  it("show the saved values grouped, a zero as an empty field", () => {
    const values = initialValues(page({ bank_deposit: 300, safe_box_balance: 1200, discrepancy: { amount: -5, kind: "short", reason: "Float" } }));
    expect(values).toEqual({ deposit: "300.00", counts: { n500: "", n100: "2", c5: "", c050: "", c010: "" }, safebox: "1,200.00", reason: "Float" });
  });

  it("count a change by value - grouping is no change, putting a value back clears it", () => {
    const p = page();
    const values = initialValues(p);
    expect(cashCountDirty(p, values)).toBe(false);
    expect(cashCountDirty(p, { ...values, counts: { ...values.counts, n100: "02" } })).toBe(false);
    expect(cashCountDirty(p, { ...values, counts: { ...values.counts, c050: "1" } })).toBe(true);
    expect(cashCountDirty(p, { ...values, deposit: "0.00" })).toBe(false);
    expect(cashCountDirty(p, { ...values, deposit: "1" })).toBe(true);
    expect(cashCountDirty(p, { ...values, reason: "x" })).toBe(true);
  });

  it("send the deposit every time, every denomination, and the reason only while there is a difference", () => {
    const p = page();
    const values = { deposit: "1,000.00", counts: { n100: "3", c050: "1" }, safebox: "", reason: "  Float swap " };
    expect(savePayload("2026-10-13", p, values, { amount: -0.5, kind: "short" }, "next")).toEqual({
      transaction_date: "2026-10-13",
      bank_deposit: 1000,
      counts: { n500: 0, n100: 3, c5: 0, c050: 1, c010: 0 },
      safe_box_balance: 0,
      discrepancy_reason: "Float swap",
      action: "next",
    });
    expect(savePayload("2026-10-13", p, { ...values, deposit: "" }, { amount: 0, kind: "none" }, "exit")).toMatchObject({
      bank_deposit: 0,
      discrepancy_reason: "",
      action: "exit",
    });
  });
});
