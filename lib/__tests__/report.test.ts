import { describe, expect, it } from "vitest";

import { salesSplit } from "@/lib/ending";
import { DELETE_IN_XERO, publishLabel, submittedHeading, summarySales, type DailyReport } from "@/lib/report";

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
  const xero = (xero_integrated: boolean, publishing_status: string | null = null) => ({ xero_integrated, publishing_status, published_at: null });

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
