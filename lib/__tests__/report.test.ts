import { afterEach, describe, expect, it, vi } from "vitest";

import type { ExpenseLine } from "@/lib/expenses";
import {
  auditFacts,
  cashRows,
  deletedMessage,
  deleteWarning,
  differenceAlert,
  editWarning,
  expenseMeta,
  expenseTitle,
  isDraft,
  publishLabel,
  reportIdFromSegment,
  reportKpis,
  reportPill,
  reportReceipts,
  xeroFact,
  type DailyReport,
} from "@/lib/report";

const line = (over: Partial<ExpenseLine> = {}): ExpenseLine => ({
  id: "e1",
  item: "General Expenses",
  amount: 120.5,
  remarks: "",
  supplier: { id: "s1", name: "ParknShop" },
  account: { id: "a1", code: "429", name: "General Expenses" },
  receipts: [{ id: "f1", name: "parknshop.jpg", mime_type: "image/jpeg" }],
  ...over,
});

// Local-time moments, so the expectations hold in any time zone the tests run in.
const SUBMITTED = new Date(2026, 9, 13, 18, 12).toISOString();
const PUBLISHED = new Date(2026, 9, 13, 18, 15).toISOString();

function report(over: Partial<DailyReport> = {}, cash: Partial<DailyReport["cash"]> = {}): DailyReport {
  return {
    report_id: "r1",
    transaction_date: "2026-10-13",
    currency_code: "HKD",
    company_name: "E2E Petty Cash Shop",
    status: "submitted",
    status_label: "Submitted",
    status_tone: "info",
    is_latest: true,
    submitted_at: SUBMITTED,
    submitted_by: "Olive Tan",
    published_at: null,
    publishing_status: "unpublished",
    xero_integrated: false,
    was_published: false,
    kpis: { total_sales: 1070.5, total_expenses: 240.5, cash_position: 760 },
    sales: { methods: [], cash: 820.5, total: 1070.5 },
    expenses: { lines: [line(), line({ id: "e2", item: "Cleaning", account: null, supplier: null, receipts: [], amount: 120 })], total: 240.5 },
    cash: {
      opening_balance: 500,
      cash_addition: 100,
      cash_addition_type: "company",
      cash_sales: 820.5,
      expenses: 240.5,
      bank_deposit: 300,
      expected: 780,
      counted: 760,
      safe_box: 0,
      difference: { amount: -20, kind: "short", reason: "Change given twice" },
      ...cash,
    },
    closing_balance: 760,
    permissions: { edit: true, delete: true, publish: true, share: true, edit_details: true },
    options: { suppliers: [], accounts: [] },
    ...over,
  };
}

afterEach(() => vi.restoreAllMocks());

describe("the Daily Report's header", () => {
  it("takes the status pill from the API: Submitted is Info, Published to Xero is Success", () => {
    expect(reportPill(report())).toEqual({ label: "Submitted", tone: "info" });
    expect(reportPill(report({ status_label: "Published to Xero", status_tone: "success" }))).toEqual({ label: "Published to Xero", tone: "success" });
  });

  it("says loudly when the API sends a tone Part 13 does not have, and draws it Neutral", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(reportPill(report({ status_tone: "teal" }))).toEqual({ label: "Submitted", tone: "neutral" });
    expect(error).toHaveBeenCalledWith(expect.stringContaining("teal"));
  });

  it("knows a reopened report is a draft", () => {
    expect(isDraft(report())).toBe(false);
    expect(isDraft(report({ status: "draft" }))).toBe(true);
  });

  it("names Publish to Xero, and \"again\" once the report is in Xero", () => {
    expect(publishLabel(report())).toBe("Publish to Xero");
    expect(publishLabel(report({ xero_integrated: true }))).toBe("Publish to Xero again");
  });
});

describe("the figures", () => {
  it("are exactly three KPIs, the server's", () => {
    expect(reportKpis(report())).toEqual([
      { label: "Total sales", value: "HKD1,070.50", meta: null },
      { label: "Total expenses", value: "HKD240.50", meta: "2 expenses" },
      { label: "Cash position", value: "HKD760.00", meta: "Counted, with the safe box" },
    ]);
    expect(reportKpis(report({ expenses: { lines: [line()], total: 120.5 } }))[1].meta).toBe("1 expense");
    expect(reportKpis(report({ kpis: { total_sales: 0, total_expenses: 0, cash_position: -20 } }))[2].value).toBe("-HKD20.00");
  });

  it("state a difference as a fact, any cent counting, with its note", () => {
    expect(differenceAlert(report())).toEqual({ title: "Cash was HKD20.00 short", body: "Note: Change given twice" });
    expect(differenceAlert(report({}, { difference: { amount: 0.01, kind: "over", reason: " " } }))).toEqual({ title: "Cash was HKD0.01 over", body: "No reason was given." });
    expect(differenceAlert(report({}, { difference: { amount: -0.005, kind: "short", reason: "" } }))?.title).toBe("Cash was HKD0.01 short");
    expect(differenceAlert(report({}, { difference: { amount: 0, kind: "none", reason: "" } }))).toBeNull();
  });

  it("name each expense as the Expenses stage does", () => {
    expect(expenseTitle(line())).toBe("General Expenses");
    expect(expenseMeta(line())).toBe("ParknShop · Account 429");
    expect(expenseTitle(line({ account: null, item: "" }))).toBe("Expense");
    expect(expenseMeta(line({ account: null, supplier: null }))).toBe("No supplier");
  });

  it("list every receipt with its expense", () => {
    expect(reportReceipts(report()).map(({ line, receipt }) => [line.id, receipt.name])).toEqual([["e1", "parknshop.jpg"]]);
  });

  it("run the cash in the order of the day, the difference in words last", () => {
    expect(cashRows(report())).toEqual([
      { label: "Starting cash balance", value: "HKD500.00" },
      { label: "Added to the drawer", value: "HKD100.00" },
      { label: "Where the cash came from", value: "Company bank", words: true },
      { label: "Cash sales", value: "HKD820.50" },
      { label: "Expenses", value: "HKD240.50" },
      { label: "Cash taken for bank deposit", value: "HKD300.00" },
      { label: "Expected in drawer", value: "HKD780.00" },
      { label: "Counted in the drawer", value: "HKD760.00" },
      { label: "In the safe box", value: "HKD0.00" },
      { label: "Difference", value: "HKD20.00 short", total: true, words: true },
    ]);
    // nothing added: no source; a negative expectation keeps its sign
    const rows = cashRows(report({}, { cash_addition: 0, expected: -20, difference: { amount: 0, kind: "none", reason: "" } }));
    expect(rows.map((r) => r.label)).not.toContain("Where the cash came from");
    expect(rows.find((r) => r.label === "Expected in drawer")?.value).toBe("-HKD20.00");
    expect(rows.at(-1)?.value).toBe("None");
    expect(cashRows(report({}, { cash_addition_type: "personal" }))[2].value).toBe("Personal");
  });
});

describe("the audit facts", () => {
  it("say who submitted it and when, and where it stands with Xero", () => {
    expect(auditFacts(report())).toEqual(["Submitted by Olive Tan · Tue 13 Oct 2026, 6:12 pm", "Not in Xero yet"]);
    expect(auditFacts(report({ submitted_by: null, submitted_at: null }))).toEqual(["Submitted", "Not in Xero yet"]);
    expect(xeroFact(report({ xero_integrated: true, published_at: PUBLISHED }))).toBe("Sent to Xero · Tue 13 Oct 2026, 6:15 pm");
    expect(xeroFact(report({ xero_integrated: true }))).toBe("Sent to Xero");
    expect(xeroFact(report({ publishing_status: "publishing" }))).toBe("Publishing to Xero");
    expect(xeroFact(report({ publishing_status: "failed" }))).toBe("Xero publish failed");
  });

  it("leave out Submitted for a reopened draft", () => {
    expect(auditFacts(report({ status: "draft" }))).toEqual(["Not in Xero yet"]);
  });
});

describe("Edit report and Delete", () => {
  it("warn about Xero only for a report that has been there (the owner, 2026-10-15)", () => {
    expect(deleteWarning(report())).toBeNull();
    expect(editWarning(report())).toBeNull();
    expect(deleteWarning(report({ was_published: true }))).toEqual({
      title: "It is in Xero",
      body: "Deleting it here does not remove its entries in Xero, and publishing this day again adds a second copy. To change the report, use Edit report instead.",
    });
    expect(editWarning(report({ was_published: true }))?.title).toBe("It is already in Xero");
  });

  it("tell the launch page which day was deleted", () => {
    expect(deletedMessage("2026-10-13")).toBe("The Daily Report for Tue 13 Oct 2026 is deleted.");
  });
});

describe("the report's address", () => {
  it("decodes the id, and keeps a malformed escape as written", () => {
    expect(reportIdFromSegment("5d6e7f80-0000-4000-8000-000000000001")).toBe("5d6e7f80-0000-4000-8000-000000000001");
    expect(reportIdFromSegment("a%2Fb")).toBe("a/b");
    expect(reportIdFromSegment("%E0%A4%A")).toBe("%E0%A4%A");
  });
});
