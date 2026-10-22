import { describe, expect, it } from "vitest";

import {
  cashSummary,
  closeDifference,
  closeGate,
  closeReadiness,
  differenceOf,
  expensesSummary,
  fixLink,
  salesRows,
  salesSummary,
  submitRefusal,
  type CloseExpense,
  type ClosePage,
} from "@/lib/close";

// Amounts read "HKD 760.00" - owner 2026-10-21: one money rule (@minty/shared/money); they were "HKD760.00".

const line = (over: Partial<CloseExpense> = {}): CloseExpense => ({ id: "e1", item: "General Expenses", supplier: "ParknShop", remarks: "", amount: 120.5, receipts: 1, ...over });

function page(over: Partial<ClosePage> = {}, cash: Partial<ClosePage["cash"]> = {}): ClosePage {
  return {
    transaction_date: "2026-10-13",
    currency_code: "HKD",
    draft: { id: "d", status: "draft", current_section: "ending", completed_sections: ["opening", "sales", "expenses", "deposit", "cash_count"], xero_integrated: false, publishing_status: "unpublished" },
    opening_balance: 500,
    cash_addition: 100,
    sales: {
      methods: [
        { sale_id: "s1", name: "Octopus", value_name: "octopus_sales", type: "electronic", amount: 200 },
        { sale_id: "s2", name: "Deliveroo", value_name: "deliveroo_sales", type: "delivery", amount: 0 },
        { sale_id: "s3", name: "Foodpanda", value_name: "foodpanda_sales", type: "delivery", amount: 50 },
      ],
      cash: 820.5,
      total: 1070.5,
      yesterday_total: null,
      history: [],
    },
    expenses: { lines: [line()], total: 120.5 },
    cash: { bank_deposit: 300, expected: 1000, counted: 980, safe_box: 0, difference: { amount: -20, kind: "short", reason: "Change given twice" }, ...cash },
    closing_balance: 980,
    problem: null,
    ...over,
  };
}

describe("the difference - any cent counts (the owner, 2026-10-15)", () => {
  it.each([
    [0, "none", 0],
    [0.004, "none", 0],
    [0.005, "over", 0.01],
    [-0.005, "short", -0.01],
    [-0.01, "short", -0.01],
    [20, "over", 20],
    [-20, "short", -20],
  ])("%d is %s", (amount, kind, rounded) => {
    expect(differenceOf(amount)).toEqual({ amount: rounded, kind });
  });

  it("reads in words, never as a coloured number", () => {
    expect(closeDifference(page())).toBe("HKD\u00a020.00 short");
    expect(closeDifference(page({}, { difference: { amount: 0.01, kind: "over", reason: "" } }))).toBe("HKD\u00a00.01 over");
    expect(closeDifference(page({}, { difference: { amount: 0, kind: "none", reason: "" } }))).toBe("None");
  });
});

describe("the summary rows", () => {
  it("lists the sales methods the Sales stage shows, Deliveroo left out, in Settings order", () => {
    expect(salesRows(page())).toEqual([
      { key: "octopus_sales", label: "Octopus", amount: 200 },
      { key: "foodpanda_sales", label: "Foodpanda", amount: 50 },
    ]);
  });

  it("sums the Sales row up as the methods that took money, cash among them (Daily Closing Phase 1)", () => {
    expect(salesSummary(page())).toBe("3 methods · Cash HKD\u00a0820.50");
    const quiet = page();
    quiet.sales = { ...quiet.sales, methods: quiet.sales.methods.map((m) => ({ ...m, amount: 0 })), cash: 0 };
    expect(salesSummary(quiet)).toBe("0 methods · Cash HKD\u00a00.00");
    const one = page();
    one.sales = { ...one.sales, methods: [], cash: 10 };
    expect(salesSummary(one)).toBe("1 method · Cash HKD\u00a010.00");
  });

  it("sums the Expenses row up as entries and every receipt file", () => {
    expect(expensesSummary([line(), line({ id: "e2", receipts: 0 }), line({ id: "e3", receipts: 2 })])).toBe("3 expenses · 3 receipts");
    expect(expensesSummary([line()])).toBe("1 expense · 1 receipt");
    expect(expensesSummary([])).toBe("0 expenses · 0 receipts");
  });

  it("sums the Cash Count row up as the deposit, or none today", () => {
    expect(cashSummary(page())).toBe("HKD\u00a0300.00 to the bank · Counted in the drawer");
    expect(cashSummary(page({}, { bank_deposit: 0 }))).toBe("None today · Counted in the drawer");
  });
});

describe("readiness (Daily Closing Phase 1: is this correct and ready to submit?)", () => {
  it("is ready with a note for the reviewer when a difference has its reason", () => {
    expect(closeReadiness(page())).toEqual({ kind: "ready", text: "All five stages are filled in. One note for the reviewer below." });
  });

  it("is ready without the note when the count matches", () => {
    expect(closeReadiness(page({}, { difference: { amount: 0, kind: "none", reason: "" } }))).toEqual({ kind: "ready", text: "All five stages are filled in." });
  });

  it("warns about a difference with no reason - any cent counts", () => {
    expect(closeReadiness(page({}, { difference: { amount: -20, kind: "short", reason: "  " } }))).toEqual({ kind: "no-reason", title: "The count is HKD\u00a020.00 short" });
    expect(closeReadiness(page({}, { difference: { amount: 0.01, kind: "over", reason: "" } }))).toEqual({ kind: "no-reason", title: "The count is HKD\u00a00.01 over" });
  });

  it("gives way to the business-rule gate", () => {
    expect(closeReadiness(page({ problem: { error: "Finish Sales before you submit the day.", to: "sales" } }))).toEqual({ kind: "gate" });
  });
});

describe("the gate and the refusals (15.9e: rule, reason, one action)", () => {
  it("has no gate when the API sees nothing in the way", () => {
    expect(closeGate(page())).toBeNull();
  });

  it("says a stage not done with the API's sentence, the link to that stage and the reason beside Submit", () => {
    expect(closeGate(page({ problem: { error: "Finish Sales before you submit the day.", to: "sales" } }))).toEqual({
      title: "This day can't be submitted yet",
      message: "Finish Sales before you submit the day.",
      action: { label: "Go to Sales", step: "sales" },
      reason: "Fix Sales first, then submit.",
    });
  });

  it("says a drawer below zero in figures, with Cash Count to fix it", () => {
    const gate = closeGate(page({ problem: { error: "Hmm, it looks like your cash balance is negative. Could you fix that first?", to: "cash_count" } }, { expected: -20 }));
    expect(gate).toEqual({
      title: "The drawer is below zero",
      message: "Expected in drawer comes to -HKD\u00a020.00. Lower the deposit or check the earlier stages before you submit.",
      action: { label: "Go to Cash Count", step: "deposit" },
      reason: "Fix Cash Count first, then submit.",
    });
  });

  it("names the step the API names even when the drawer is below zero too (the API checks steps first)", () => {
    expect(closeGate(page({ problem: { error: "Finish Addition to Drawer before you submit the day.", to: "opening" } }, { expected: -20 }))?.title).toBe(
      "This day can't be submitted yet",
    );
  });

  it("sends a date rule to the launch page", () => {
    const gate = closeGate(page({ problem: { error: "Transaction date cannot be in the future.", to: "dashboard" } }));
    expect(gate?.action).toEqual({ label: "Go to Petty Cash", home: true });
    expect(gate?.reason).toBe("This day can't be submitted yet.");
  });

  it("links each place a refusal names", () => {
    expect(fixLink("opening")).toEqual({ label: "Go to Addition to Drawer", step: "opening" });
    expect(fixLink("expenses")).toEqual({ label: "Go to Expenses", step: "expenses" });
    expect(fixLink("cash_count")).toEqual({ label: "Go to Cash Count", step: "deposit" });
    expect(fixLink("deposit")).toEqual({ label: "Go to Cash Count", step: "deposit" });
    expect(fixLink("ending")).toBeNull();
    expect(fixLink("submitted")).toBeNull();
    expect(fixLink(null)).toBeNull();
    expect(submitRefusal("The figures changed after the cash count. Check the cash count again, then submit.", "cash_count")).toEqual({
      message: "The figures changed after the cash count. Check the cash count again, then submit.",
      action: { label: "Go to Cash Count", step: "deposit" },
    });
    expect(submitRefusal("Nope", undefined)).toEqual({ message: "Nope", action: null });
  });
});
