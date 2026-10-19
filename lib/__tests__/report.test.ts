import { afterEach, describe, expect, it, vi } from "vitest";

import { salesRows } from "@/lib/close";
import type { ExpenseLine } from "@/lib/expenses";
import {
  auditFacts,
  cashRows,
  deletedMessage,
  deleteWarning,
  differenceAlert,
  editWarning,
  expenseBars,
  expenseBarsSummary,
  expenseMeta,
  expenseTitle,
  isDraft,
  publishLabel,
  reportIdFromSegment,
  reportKpis,
  reportPill,
  reportReceipts,
  salesMix,
  salesMixSummary,
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

type Method = DailyReport["sales"]["methods"][number];
const method = (value_name: string, name: string, amount: number, type: Method["type"] = "electronic"): Method => ({
  sale_id: value_name,
  name,
  value_name,
  type,
  amount,
});

describe("where the money came from: the sales mix", () => {
  it("runs largest first, each with a whole percentage, the set adding up to 100", () => {
    const mix = salesMix(
      report({ sales: { methods: [method("visa_sales", "Visa", 120), method("octopus_sales", "Octopus", 30)], cash: 300, total: 450 } }),
    );
    expect(mix.map((s) => s.label)).toEqual(["Cash", "Visa", "Octopus"]);
    expect(mix.map((s) => s.amount)).toEqual([300, 120, 30]);
    expect(mix.map((s) => s.pct)).toEqual([67, 27, 6]);
    expect(mix.map((s) => s.width)).toEqual([66.67, 26.67, 6.67]);
    expect(mix.map((s) => s.tone)).toEqual([1, 2, 3]);
  });

  it("makes the whole percentages add up to exactly 100 (largest remainder)", () => {
    const thirds = salesMix(report({ sales: { methods: [method("a", "A", 1), method("b", "B", 1)], cash: 1, total: 3 } }));
    expect(thirds.map((s) => s.pct)).toEqual([34, 33, 33]);
    // Equal amounts keep the list's order: the methods in Settings order, then Cash.
    expect(thirds.map((s) => s.label)).toEqual(["A", "B", "Cash"]);
    const odd = salesMix(report({ sales: { methods: [method("a", "A", 0.01), method("b", "B", 999.99)], cash: 0.5, total: 1000.5 } }));
    expect(odd.reduce((sum, s) => sum + s.pct, 0)).toBe(100);
  });

  it("leaves out a method with nothing sold", () => {
    const mix = salesMix(report({ sales: { methods: [method("visa_sales", "Visa", 0), method("amex_sales", "Amex", 0.001), method("octopus_sales", "Octopus", 50)], cash: 0, total: 50 } }));
    expect(mix).toEqual([{ key: "octopus_sales", label: "Octopus", amount: 50, pct: 100, width: 100, tone: 1 }]);
  });

  it("draws a single method as one full bar", () => {
    expect(salesMix(report({ sales: { methods: [], cash: 820.5, total: 820.5 } }))).toEqual([{ key: "cash", label: "Cash", amount: 820.5, pct: 100, width: 100, tone: 1 }]);
  });

  it("is empty with no sales", () => {
    expect(salesMix(report({ sales: { methods: [method("visa_sales", "Visa", 0)], cash: 0, total: 0 } }))).toEqual([]);
  });

  it("is exactly what the Sales by method list shows - Deliveroo left out, as there - then Cash", () => {
    const methods = [
      method("visa_sales", "Visa", 100),
      method("foodpanda_sales", "Foodpanda", 40, "delivery"),
      method("deliveroo_sales", "Deliveroo", 500, "delivery"),
    ];
    const r = report({ sales: { methods, cash: 60, total: 700 } });
    const listed = [...salesRows(r).map((row) => row.label), "Cash"];
    const mix = salesMix(r);
    expect(mix.map((s) => s.label).sort()).toEqual([...listed].sort());
    expect(mix.map((s) => s.label)).not.toContain("Deliveroo");
    expect(mix.reduce((sum, s) => sum + s.amount, 0)).toBe(200);
  });

  it("cycles six tones so neighbours never share one", () => {
    const methods = Array.from({ length: 7 }, (_, i) => method(`m${i}`, `M${i}`, 70 - i));
    expect(salesMix(report({ sales: { methods, cash: 0, total: 0 } })).map((s) => s.tone)).toEqual([1, 2, 3, 4, 5, 6, 1]);
  });

  it("reads as text for its role=img label", () => {
    const mix = salesMix(report({ sales: { methods: [method("visa_sales", "Visa", 120)], cash: 300, total: 420 } }));
    expect(salesMixSummary(mix, "HKD")).toBe("Sales by method: Cash HKD300.00, 71%; Visa HKD120.00, 29%");
  });
});

describe("where the money went: the expenses by account", () => {
  const account = (name: string) => ({ id: name, code: "400", name });

  it("sums the API's lines per account, largest first, the largest filling the track", () => {
    const bars = expenseBars(
      report({
        expenses: {
          lines: [
            line({ id: "1", account: account("Office supplies"), amount: 35 }),
            line({ id: "2", account: account("Staff meals"), amount: 25 }),
            line({ id: "3", account: account("Staff meals"), amount: 15 }),
          ],
          total: 75,
        },
      }),
    );
    expect(bars).toEqual([
      { name: "Staff meals", amount: 40, width: 100 },
      { name: "Office supplies", amount: 35, width: 87.5 },
    ]);
  });

  it("groups a line with no account under \"No account\"", () => {
    expect(expenseBars(report())).toEqual([
      { name: "General Expenses", amount: 120.5, width: 100 },
      { name: "No account", amount: 120, width: 99.59 },
    ]);
  });

  it("orders equal totals by name and leaves a zero total out", () => {
    const bars = expenseBars(
      report({
        expenses: {
          lines: [line({ id: "1", account: account("Travel"), amount: 10 }), line({ id: "2", account: account("Cleaning"), amount: 10 }), line({ id: "3", account: account("Postage"), amount: 0 })],
          total: 20,
        },
      }),
    );
    expect(bars.map((b) => b.name)).toEqual(["Cleaning", "Travel"]);
  });

  it("is empty with no expenses", () => {
    expect(expenseBars(report({ expenses: { lines: [], total: 0 } }))).toEqual([]);
  });

  it("reads as text for its role=img label", () => {
    expect(expenseBarsSummary(expenseBars(report()), "HKD")).toBe("Expenses by account: General Expenses HKD120.50; No account HKD120.00");
  });
});
