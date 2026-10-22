import { describe, expect, it } from "vitest";

import {
  belowZero,
  cashCountDirty,
  cashGuidance,
  COUNT_FIRST,
  countSaved,
  currentTask,
  depositResult,
  initialTasks,
  nextGate,
  REASON_FIRST,
  rowTotalText,
  sheetProblem,
  taskState,
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

// Amounts read "HKD 760.00" - owner 2026-10-21: one money rule (@minty/shared/money); they were "HKD760.00".

const d = (id: string, value: number, kind: string, count = 0): Denomination => ({
  id,
  value,
  kind,
  count,
});

const denominations = [
  d("n500", 500, "note"),
  d("n100", 100, "note", 2),
  d("c5", 5, "coin"),
  d("c050", 0.5, "coin"),
  d("c010", 0.1, "coin"),
];

const page = (over: Partial<CashCountPage> = {}): CashCountPage => ({
  transaction_date: "2026-10-13",
  currency_code: "HKD",
  draft: {
    id: "d",
    status: "draft",
    current_section: "deposit",
    completed_sections: ["opening", "sales", "expenses"],
    xero_integrated: false,
    publishing_status: null,
  },
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
    expect(
      drawerTotal(denominations, { n500: "2", n100: "3", c5: "1", c050: "3", c010: "3" }),
    ).toBe(1306.8);
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
    expect(differenceText({ amount: -20, kind: "short" }, "HKD")).toBe("HKD\u00a020.00 short");
    expect(differenceText({ amount: 0.01, kind: "over" }, "HKD")).toBe("HKD\u00a00.01 over");
    expect(differenceText({ amount: 0, kind: "none" }, "HKD")).toBe("None");
    // owner 2026-10-21: one money rule (@minty/shared/money) - was "HKD20.00", and "$1,234.50" with no currency;
    // owner 2026-10-22: no silent fallback - an amount with no currency says so
    expect(differenceText({ amount: -1234.5, kind: "short" }, null)).toBe(
      "1,234.50 (No currency selected) short",
    );
  });
});

describe("the deposit limit", () => {
  it("allows up to the cash on hand, and names the amount allowed above it", () => {
    expect(depositProblem(page(), "")).toBeNull();
    expect(depositProblem(page(), "1,300.50")).toBeNull();
    expect(depositProblem(page(), "1300.51")).toBe(
      "The deposit can't be more than the cash on hand. Enter HKD\u00a01,300.50 or less.",
    );
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
    expect(reasonProblem("", short, "HKD", { submitted: true })).toBe(
      "The count is HKD\u00a020.00 short. Add the reason to continue.",
    );
    expect(reasonProblem("   ", short, "HKD", { submitted: true })).toBe(
      "The count is HKD\u00a020.00 short. Add the reason to continue.",
    );
    expect(reasonProblem("Float swap", short, "HKD", { submitted: true })).toBeNull();
    expect(reasonProblem("", none, "HKD", { submitted: true })).toBeNull();
    expect(reasonProblem("", { amount: 0.01, kind: "over" }, "HKD", { submitted: true })).toBe(
      "The count is HKD\u00a00.01 over. Add the reason to continue.",
    );
  });

  it("over 300 characters says so at once; the helper counts live", () => {
    expect(reasonProblem("x".repeat(300), short, "HKD", { submitted: false })).toBeNull();
    expect(reasonProblem("x".repeat(301), none, "HKD", { submitted: false })).toBe(
      "The reason is 301 characters. Shorten it to 300 characters or fewer.",
    );
    expect(reasonHelper(" Float swap ")).toBe(
      "So the reviewer knows what happened. 10 of 300 characters.",
    );
  });
});

describe("the denominations", () => {
  it("are named by the currency code, a non-breaking space and their cash_name without its symbol", () => {
    expect(denominationLabel({ ...d("a", 1000, "note"), name: "$1,000" }, "HKD")).toBe(
      "HKD\u00a01,000",
    );
    expect(denominationLabel({ ...d("g", 50, "note"), name: "S$50" }, "HKD")).toBe("HKD\u00a050");
    expect(denominationLabel({ ...d("g", 10, "note"), name: "S$10" }, "SGD")).toBe("SGD\u00a010");
    expect(denominationLabel({ ...d("b", 0.5, "coin"), name: "50c" }, "HKD")).toBe("HKD\u00a050c");
    // no currency: the figure alone - never "$"
    expect(denominationLabel({ ...d("c", 5, "coin"), name: "$5" }, null)).toBe("5");
  });

  it("without a name, are named by their value", () => {
    expect(denominationLabel({ ...d("e", 100, "note"), name: null }, "HKD")).toBe("HKD\u00a0100");
    expect(denominationLabel({ ...d("f", 100, "note"), name: "" }, "HKD")).toBe("HKD\u00a0100");
  });

  it("are named by their value, a coin under one with its cents", () => {
    // owner 2026-10-21: one money rule (@minty/shared/money) - was "HKD1,000", "HKD0.50", and "$2" with no currency
    expect(denominationLabel(d("a", 1000, "note"), "HKD")).toBe("HKD\u00a01,000");
    expect(denominationLabel(d("b", 0.5, "coin"), "HKD")).toBe("HKD\u00a00.50");
    expect(denominationLabel(d("c", 2, "coin"), null)).toBe("2");
  });

  it("group notes, then coins, then anything else, in the company's order", () => {
    const groups = denominationGroups([
      d("c1", 1, "coin"),
      d("x", 3, "token"),
      d("n1", 20, "note"),
      d("n2", 10, "note"),
    ]);
    expect(groups.map((g) => [g.title, g.items.map((i) => i.id)])).toEqual([
      ["Notes", ["n1", "n2"]],
      ["Coins", ["c1"]],
      ["Other cash", ["x"]],
    ]);
  });
});

describe("the fields and the save", () => {
  it("show the saved values grouped, a zero as an empty field", () => {
    const values = initialValues(
      page({
        bank_deposit: 300,
        safe_box_balance: 1200,
        discrepancy: { amount: -5, kind: "short", reason: "Float" },
      }),
    );
    expect(values).toEqual({
      deposit: "300.00",
      counts: { n500: "", n100: "2", c5: "", c050: "", c010: "" },
      safebox: "1,200.00",
      reason: "Float",
    });
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
    const values = {
      deposit: "1,000.00",
      counts: { n100: "3", c050: "1" },
      safebox: "",
      reason: "  Float swap ",
    };
    expect(savePayload("2026-10-13", p, values, { amount: -0.5, kind: "short" }, "next")).toEqual({
      transaction_date: "2026-10-13",
      bank_deposit: 1000,
      counts: { n500: 0, n100: 3, c5: 0, c050: 1, c010: 0 },
      safe_box_balance: 0,
      discrepancy_reason: "Float swap",
      action: "next",
    });
    expect(
      savePayload("2026-10-13", p, { ...values, deposit: "" }, { amount: 0, kind: "none" }, "exit"),
    ).toMatchObject({
      bank_deposit: 0,
      discrepancy_reason: "",
      action: "exit",
    });
  });
});

describe("one task at a time (Daily Closing Phase 1, Flask 4e004d2)", () => {
  const fresh = (over: Partial<CashCountPage> = {}) =>
    page({ denominations: denominations.map((x) => ({ ...x, count: 0 })), ...over });

  it("opens a fresh stage on the deposit, the count and the safe box waiting in that order", () => {
    const done = initialTasks(fresh());
    expect(done).toEqual({ deposit: false, count: false, safe: false });
    expect(currentTask(done)).toBe("deposit");
    expect([taskState("deposit", done), taskState("count", done), taskState("safe", done)]).toEqual(
      ["current", "next", "next"],
    );
    expect(cashGuidance(done)).toBe("Three quick checks. We'll go one at a time.");
  });

  it("opens the first task not done: a saved deposit or safe box is done, the count is next", () => {
    const done = initialTasks(fresh({ bank_deposit: 300, safe_box_balance: 50 }));
    expect(done).toEqual({ deposit: true, count: false, safe: true });
    expect(currentTask(done)).toBe("count");
    expect(taskState("safe", done)).toBe("done");
  });

  it("opens every task done once the stage was saved: a counted note, or Cash Count completed", () => {
    expect(countSaved(page())).toBe(true); // the fixture counts two HKD 100 notes
    expect(countSaved(fresh())).toBe(false);
    const completed = fresh({
      draft: {
        ...page().draft!,
        completed_sections: ["opening", "sales", "expenses", "deposit", "cash_count"],
      },
    });
    expect(countSaved(completed)).toBe(true);
    const done = initialTasks(completed);
    expect(done).toEqual({ deposit: true, count: true, safe: true });
    expect(currentTask(done)).toBeNull();
    expect(cashGuidance(done)).toBe("All three checks are done.");
  });

  it("puts a task back in its turn when it is changed: an earlier one opens before a later one", () => {
    const done = { deposit: false, count: true, safe: false };
    expect(currentTask(done)).toBe("deposit");
    expect(taskState("safe", done)).toBe("next");
  });

  it("says the deposit's result: the amount to the bank, or none today", () => {
    expect(depositResult("300", "HKD")).toBe("HKD\u00a0300.00 to the bank");
    expect(depositResult("", "HKD")).toBe("None today");
    expect(depositResult("0", "HKD")).toBe("None today");
  });

  it("shows a sheet row's line total as a dash while it is empty", () => {
    expect(rowTotalText(d("c050", 0.5, "coin"), "", "HKD")).toBe("—");
    expect(rowTotalText(d("c050", 0.5, "coin"), "3", "HKD")).toBe("HKD\u00a01.50");
    expect(rowTotalText(d("n500", 500, "note"), "0", "HKD")).toBe("HKD\u00a00.00");
  });

  it("keeps the sheet open on the first row with a problem", () => {
    expect(sheetProblem(denominations, { n500: "1", c5: "2" })).toBeNull();
    expect(sheetProblem(denominations, { n500: "1", c5: "2000000", c010: "3000000" })?.id).toBe(
      "c5",
    );
  });

  it("holds Save & Next for the count first, then for a difference's reason - any cent counts", () => {
    const counted = { deposit: true, count: true, safe: true };
    expect(nextGate({ deposit: true, count: false, safe: true }, difference(0, 0), "")).toBe(
      COUNT_FIRST,
    );
    expect(COUNT_FIRST).toBe("Count the drawer to continue");
    expect(nextGate(counted, difference(980, 1000), "")).toBe(REASON_FIRST);
    expect(nextGate(counted, difference(1000.01, 1000), "  ")).toBe(
      "Add a reason for the difference to continue.",
    );
    expect(nextGate(counted, difference(980, 1000), "Float swap")).toBeNull();
    expect(nextGate(counted, difference(1000, 1000), "")).toBeNull();
  });
});
