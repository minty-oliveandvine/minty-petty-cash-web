import { describe, expect, it } from "vitest";

import type { ExpenseLine } from "@/lib/expenses";
import type { DailyReport } from "@/lib/report";
import {
  canEditLines,
  canEditReason,
  canEditWithdrawal,
  lineChanges,
  lineEditForm,
  lineSupplierProblem,
  reasonEditProblem,
  reasonNeeded,
  savedMessage,
  withdrawalOf,
  xeroNotice,
} from "@/lib/reportEdits";

const line = (over: Partial<ExpenseLine> = {}): ExpenseLine => ({
  id: "e1",
  item: "General Expenses",
  amount: 120.5,
  remarks: "Bags",
  supplier: { id: "c1", name: "ParknShop" },
  account: { id: "a1", code: "429", name: "General Expenses" },
  receipts: [{ id: "f1", name: "parknshop.png", mime_type: "image/png" }],
  ...over,
});

function report(
  over: Partial<DailyReport> = {},
  cash: Partial<DailyReport["cash"]> = {},
): DailyReport {
  return {
    report_id: "r1",
    transaction_date: "2026-10-13",
    currency_code: "HKD",
    company_name: "E2E Petty Cash Shop",
    status: "submitted",
    status_label: "Submitted",
    status_tone: "info",
    is_latest: false,
    submitted_at: null,
    submitted_by: null,
    published_at: null,
    publishing_status: "unpublished",
    xero_integrated: false,
    was_published: false,
    kpis: { total_sales: 0, total_expenses: 120.5, cash_position: 0 },
    sales: { methods: [], cash: 0, total: 0 },
    expenses: { lines: [line()], total: 120.5 },
    cash: {
      opening_balance: 500,
      cash_addition: 100,
      cash_addition_type: "company",
      cash_sales: 0,
      expenses: 120.5,
      bank_deposit: 0,
      expected: 479.5,
      counted: 459.5,
      safe_box: 0,
      difference: { amount: -20, kind: "short", reason: "Change given twice" },
      ...cash,
    },
    closing_balance: 459.5,
    permissions: { edit: false, delete: false, publish: true, share: true, edit_details: true },
    options: {
      suppliers: [{ id: "c1", name: "ParknShop" }],
      accounts: [{ id: "a1", code: "429", name: "General Expenses" }],
    },
    ...over,
  };
}

const NO_DIFFERENCE = { difference: { amount: 0, kind: "none", reason: "" } };

describe("what may be edited", () => {
  it("offers every detail only with edit_details, on any submitted report (not only the latest)", () => {
    const r = report();
    expect(canEditReason(r)).toBe(true);
    expect(canEditWithdrawal(r)).toBe(true);
    expect(canEditLines(r)).toBe(true);
    const off = report({
      permissions: { edit: true, delete: true, publish: true, share: true, edit_details: false },
      options: null,
    });
    expect(canEditReason(off)).toBe(false);
    expect(canEditWithdrawal(off)).toBe(false);
    expect(canEditLines(off)).toBe(false);
  });

  it("offers the reason only while the cash was short or over, any cent counting", () => {
    expect(canEditReason(report({}, NO_DIFFERENCE))).toBe(false);
    expect(
      canEditReason(report({}, { difference: { amount: 0.01, kind: "over", reason: "" } })),
    ).toBe(true);
  });

  it("offers where the cash came from only when cash was added", () => {
    expect(canEditWithdrawal(report({}, { cash_addition: 0 }))).toBe(false);
  });

  it("offers the lines' edits only with the pick-lists", () => {
    expect(canEditLines(report({ options: null }))).toBe(false);
  });

  it("reads the saved source, Personal when none is saved (as the stage)", () => {
    expect(withdrawalOf(report())).toBe("company");
    expect(withdrawalOf(report({}, { cash_addition_type: null }))).toBe("personal");
    expect(withdrawalOf(report({}, { cash_addition_type: "personal" }))).toBe("personal");
  });
});

describe("the reason", () => {
  it("is needed while there is a difference", () => {
    expect(reasonNeeded(report())).toBe("short");
    expect(reasonNeeded(report({}, { difference: { amount: 5, kind: "over", reason: "" } }))).toBe(
      "over",
    );
    expect(reasonNeeded(report({}, NO_DIFFERENCE))).toBeNull();
  });

  it("says at once when it is over 300 characters", () => {
    expect(
      reasonEditProblem("x".repeat(301), { needed: "short", changed: true, submitted: false }),
    ).toBe("The reason is 301 characters. Shorten it to 300 characters or fewer.");
    expect(
      reasonEditProblem("x".repeat(300), { needed: "short", changed: true, submitted: false }),
    ).toBeNull();
  });

  it("can't be emptied while the cash was short or over - at once once it is changed", () => {
    expect(reasonEditProblem("  ", { needed: "short", changed: true, submitted: false })).toBe(
      "The cash was short, so the reason is still needed. Add the reason to save it.",
    );
    expect(reasonEditProblem("", { needed: "over", changed: false, submitted: true })).toBe(
      "The cash was over, so the reason is still needed. Add the reason to save it.",
    );
  });

  it("never paints an untouched empty field", () => {
    expect(reasonEditProblem("", { needed: "short", changed: false, submitted: false })).toBeNull();
  });
});

describe("an expense line's changes", () => {
  const unchanged = {
    remarks: "Bags",
    supplier: { id: "c1", name: "ParknShop" },
    accountId: "a1",
    receipt: null,
  };

  it("sends nothing when nothing changed", () => {
    expect(lineChanges(line(), unchanged)).toEqual({});
  });

  it("sends only what changed", () => {
    const file = new File(["x"], "new.pdf", { type: "application/pdf" });
    expect(lineChanges(line(), { ...unchanged, remarks: " Paper bags " })).toEqual({
      remarks: "Paper bags",
    });
    expect(lineChanges(line(), { ...unchanged, supplier: { id: "c2", name: "Wellcome" } })).toEqual(
      { supplier_id: "c2" },
    );
    expect(lineChanges(line(), { ...unchanged, accountId: "a2" })).toEqual({ account_id: "a2" });
    expect(lineChanges(line(), { ...unchanged, receipt: file })).toEqual({ receipt: file });
  });

  it("treats spaces around the description as no change, and an emptied one as a change", () => {
    expect(lineChanges(line(), { ...unchanged, remarks: "Bags  " })).toEqual({});
    expect(lineChanges(line(), { ...unchanged, remarks: "" })).toEqual({ remarks: "" });
  });

  it("never sends an empty supplier or account (the API keeps them)", () => {
    expect(
      lineChanges(line({ supplier: null, account: null }), {
        ...unchanged,
        supplier: null,
        accountId: "",
      }),
    ).toEqual({});
  });

  it("builds the multipart body from the changes alone", () => {
    const file = new File(["x"], "new.png", { type: "image/png" });
    const form = lineEditForm({ remarks: "", account_id: "a2", receipt: file });
    expect([...form.keys()].sort()).toEqual(["account_id", "receipt", "remarks"]);
    expect(form.get("remarks")).toBe("");
    expect((form.get("receipt") as File).name).toBe("new.png");
    expect(form.has("supplier_id")).toBe(false);
  });
});

describe("the line's supplier", () => {
  const chosen = { id: "c1", name: "ParknShop" };

  it("is fine when chosen", () => {
    expect(
      lineSupplierProblem("ParknShop", chosen, { required: true, touched: true, submitted: true }),
    ).toBeNull();
  });

  it("can't be emptied when the line has one - at once", () => {
    expect(
      lineSupplierProblem("", null, { required: true, touched: false, submitted: false }),
    ).toBe("The supplier is still empty. Choose a supplier from the list to save it.");
  });

  it("may stay empty when the line has none", () => {
    expect(
      lineSupplierProblem("", null, { required: false, touched: true, submitted: true }),
    ).toBeNull();
  });

  it("waits for the field to be left before a name that is not a supplier", () => {
    expect(
      lineSupplierProblem("Parkn", null, { required: true, touched: false, submitted: false }),
    ).toBeNull();
    expect(
      lineSupplierProblem("Parkn", null, { required: true, touched: true, submitted: false }),
    ).toBe('"Parkn" is not a supplier yet. Choose one from the list.');
  });
});

describe("Xero", () => {
  it("warns before a save when the report has been to Xero", () => {
    expect(xeroNotice(report())).toBeNull();
    expect(xeroNotice(report({ was_published: true }))).toEqual({
      title: "It will need publishing to Xero again",
      body: "Saving takes this report out of Xero. Publish it again afterwards. The entries in Xero now are not removed: void them in Xero by hand.",
    });
  });
});

describe("the toasts", () => {
  it("names what was saved", () => {
    expect(savedMessage("reason")).toBe("The reason is saved.");
    expect(savedMessage("withdrawal")).toBe("Where the cash came from is saved.");
    expect(savedMessage("line")).toBe("The expense is saved.");
  });
});
