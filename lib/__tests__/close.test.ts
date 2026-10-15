import { describe, expect, it } from "vitest";

import { closeDifference, closeGate, differenceOf, expenseLabel, fixLink, receiptsText, salesRows, submitRefusal, type CloseExpense, type ClosePage } from "@/lib/close";

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
    expect(closeDifference(page())).toBe("HKD20.00 short");
    expect(closeDifference(page({}, { difference: { amount: 0.01, kind: "over", reason: "" } }))).toBe("HKD0.01 over");
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

  it("labels an expense by its account, then its supplier", () => {
    expect(expenseLabel(line())).toBe("General Expenses · ParknShop");
    expect(expenseLabel(line({ supplier: "  " }))).toBe("General Expenses");
    expect(expenseLabel(line({ item: "" }))).toBe("Expense · ParknShop");
  });

  it("counts the entries that carry a receipt", () => {
    expect(receiptsText([line(), line({ id: "e2", receipts: 0 }), line({ id: "e3", receipts: 2 })])).toBe("2 of 3 expenses");
    expect(receiptsText([line()])).toBe("1 of 1 expense");
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
      message: "Expected in drawer comes to -HKD20.00. Lower the deposit or check the earlier stages before you submit.",
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
