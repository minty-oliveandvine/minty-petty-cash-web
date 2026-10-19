import { describe, expect, it } from "vitest";

import { salesSplit } from "@/lib/ending";
import {
  DELETE_IN_XERO,
  editReasonProblem,
  editReceiptProblem,
  lineChanges,
  publishLabel,
  remarksProblem,
  submittedHeading,
  summarySales,
  type DailyReport,
  type ReportLine,
} from "@/lib/report";

const method = (value_name: string, type: string, amount: number) => ({ sale_id: value_name, name: value_name, value_name, type, amount });

describe("a submitted report's Total Sales (GET /reports/<id>)", () => {
  const sales: DailyReport["sales"] = {
    methods: [method("visa_sales", "electronic", 400), method("cash_sales", "other", 600), method("keeta_sales", "delivery", 234.5)],
    cash: 600,
    total: 1234.5,
    yesterday_total: null,
    history: [],
  };

  it("leaves the cash row out of the methods, so cash is not counted twice", () => {
    const shown = summarySales(sales);
    expect(shown.methods.map((m) => m.value_name)).toEqual(["visa_sales", "keeta_sales"]);
    expect(shown.cash).toBe(600);
    expect(shown.total).toBe(1234.5);
    expect(salesSplit(shown)).toEqual({ electronic: 400, delivery: 234.5, cash: 600 });
  });
});

describe("Flask's Submitted page wording", () => {
  const xero = (xero_integrated: boolean, publishing_status: string | null = null) => ({ xero_integrated, publishing_status, published_at: null, was_published: xero_integrated });

  it("says Submitted until the report is in Xero, then Published to Xero", () => {
    expect(submittedHeading(xero(false))).toEqual(["Report Submitted", "Successfully!"]);
    expect(submittedHeading(xero(true, "completed"))).toEqual(["Report Published to Xero", "Successfully!"]);
  });

  it("offers Publish to Xero, and Republish once it is in Xero", () => {
    expect(publishLabel(xero(false))).toBe("Publish to Xero");
    expect(publishLabel(xero(false, "failed"))).toBe("Publish to Xero");
    expect(publishLabel(xero(true, "completed"))).toBe("Republish to Xero");
  });
});

describe("the owner's Xero warning on Delete (2026-10-15)", () => {
  it("is Flask's wording", () => {
    expect(DELETE_IN_XERO.title).toBe("It is in Xero");
    expect(DELETE_IN_XERO.body).toBe(
      "Deleting it here does not remove its entries in Xero, and publishing this day again adds a second copy. To change the report, use Edit report instead.",
    );
  });
});

describe("editing a submitted report's details (Flask's Edit Details)", () => {
  it("checks the difference reason as it is typed: at most 300 characters, never emptied while the cash is out", () => {
    expect(editReasonProblem("Paid a courier", "short")).toBeNull();
    expect(editReasonProblem("x".repeat(300), "over")).toBeNull();
    expect(editReasonProblem("x".repeat(301), "short")).toBe("Keep the reason to 300 characters or fewer.");
    expect(editReasonProblem("  ", "short")).toBe("The cash was short, so the reason is still needed. Add the reason to save it.");
    expect(editReasonProblem("", "over")).toBe("The cash was over, so the reason is still needed. Add the reason to save it.");
    expect(editReasonProblem("", "none")).toBeNull();
  });

  it("checks a description as it is typed: at most 300 characters", () => {
    expect(remarksProblem("")).toBeNull();
    expect(remarksProblem("y".repeat(300))).toBeNull();
    expect(remarksProblem("y".repeat(301))).toBe("Keep the description to 300 characters or fewer.");
  });

  const saved: ReportLine = {
    id: "e1",
    item: "Food & Drink",
    amount: 78.5,
    remarks: "Lunch",
    supplier: { id: "s1", name: "Acme" },
    account: { id: "a1", code: "420", name: "Food & Drink" },
    receipts: [],
  };
  const same = { remarks: "Lunch", supplierId: "s1", accountId: "a1", receipt: null };

  it("sends only what changed - nothing when nothing did", () => {
    expect(lineChanges(saved, same)).toEqual({});
    expect(lineChanges(saved, { ...same, remarks: "  Lunch  " })).toEqual({});
    expect(lineChanges(saved, { ...same, remarks: "Team lunch" })).toEqual({ remarks: "Team lunch" });
    expect(lineChanges(saved, { ...same, remarks: "" })).toEqual({ remarks: "" });
    expect(lineChanges(saved, { ...same, supplierId: "s2" })).toEqual({ supplier_id: "s2" });
    expect(lineChanges(saved, { ...same, accountId: "a2" })).toEqual({ account_id: "a2" });
    const receipt = new File(["%PDF"], "r.pdf", { type: "application/pdf" });
    expect(lineChanges(saved, { ...same, receipt })).toEqual({ receipt });
  });

  it("never sends an empty supplier or account (the API cannot clear one)", () => {
    const bare: ReportLine = { ...saved, supplier: null, account: null };
    expect(lineChanges(bare, { remarks: "Lunch", supplierId: "", accountId: "", receipt: null })).toEqual({});
    expect(lineChanges(bare, { remarks: "Lunch", supplierId: "s1", accountId: "a1", receipt: null })).toEqual({ supplier_id: "s1", account_id: "a1" });
  });

  it("refuses a receipt that is not a PDF, JPEG or PNG of at most 10 MB, before it is sent", () => {
    const file = (type: string, size = 10) => new File([new Uint8Array(size)], "r", { type });
    expect(editReceiptProblem(file("image/png"))).toBeNull();
    expect(editReceiptProblem(file("application/pdf", 10 * 1024 * 1024))).toBeNull();
    expect(editReceiptProblem(file("image/gif"))).toBe("I can take PDF, JPEG, or PNG files.");
    expect(editReceiptProblem(file("image/jpeg", 10 * 1024 * 1024 + 1))).toBe("Files need to be under 10MB.");
  });
});
