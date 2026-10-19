// Close as Flask's Daily Closing Phase 1 (Minty 4e004d2): a readiness banner, one summary card
// with a row per stage and an Edit link each, the difference as a pill in the Cash Count row.

import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }), usePathname: () => "/" }));

import { Verification } from "@/components/closing/Close";
import type { ClosePage } from "@/lib/close";

function page(over: Partial<ClosePage> = {}, cash: Partial<ClosePage["cash"]> = {}): ClosePage {
  return {
    transaction_date: "2026-10-13",
    currency_code: "HKD",
    draft: { id: "d", status: "draft", current_section: "ending", completed_sections: ["opening", "sales", "expenses", "deposit", "cash_count"], xero_integrated: false, publishing_status: "unpublished" },
    opening_balance: 500,
    cash_addition: 100,
    sales: {
      methods: [{ sale_id: "s1", name: "Octopus", value_name: "octopus_sales", type: "electronic", amount: 200 }],
      cash: 820.5,
      total: 1020.5,
      yesterday_total: 900,
      history: [],
    },
    expenses: { lines: [{ id: "e1", item: "General Expenses", supplier: "ParknShop", remarks: "", amount: 120.5, receipts: 2 }], total: 120.5 },
    cash: { bank_deposit: 300, expected: 1000, counted: 1000, safe_box: 0, difference: { amount: 0, kind: "none", reason: "" }, ...cash },
    closing_balance: 1000,
    problem: null,
    ...over,
  };
}

const renderClose = (p: ClosePage) => render(<Verification page={p} entityId="e1" entityName="Olive" home="/home" notice={null} />);

describe("Close, the verification", () => {
  it("is ready to submit, with one row per stage, its total and an Edit link", () => {
    renderClose(page());
    expect(screen.getByText("One last look before today is closed.")).toBeInTheDocument();
    expect(screen.getByText("Ready to submit")).toBeInTheDocument();
    expect(screen.getByText("All five stages are filled in.")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /^Edit / })).toHaveLength(4);
    const sales = screen.getByRole("region", { name: "Sales" });
    expect(sales).toHaveTextContent("2 methods · Cash HKD820.50");
    expect(sales).toHaveTextContent("HKD1,020.50");
    // totals, not each method; no KPIs, no closing balance
    expect(screen.queryByText("Octopus")).toBeNull();
    expect(screen.queryByText("Closing balance")).toBeNull();
    expect(screen.getByRole("region", { name: "Expenses (1)" })).toHaveTextContent("1 expense · 2 receipts");
    expect(screen.getByRole("region", { name: "Cash Count" })).toHaveTextContent("HKD300.00 to the bank · Counted in the drawer");
    expect(screen.getByRole("heading", { name: "When you submit" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Submit Daily Report" })).toBeEnabled();
    expect(screen.getByRole("link", { name: "Save & Exit" })).toHaveAttribute("href", "/home");
  });

  it("highlights a difference in the Cash Count row, with its reason, and leaves a note for the reviewer", () => {
    renderClose(page({}, { counted: 980, difference: { amount: -20, kind: "short", reason: "Float swap" } }));
    const row = screen.getByRole("region", { name: "Cash Count" });
    expect(within(row).getByText("HKD20.00 short")).toBeInTheDocument();
    expect(within(row).getByText("Float swap")).toBeInTheDocument();
    expect(screen.getByText("All five stages are filled in. One note for the reviewer below.")).toBeInTheDocument();
  });

  it("warns about a difference with no reason, with the way to Cash Count", () => {
    renderClose(page({}, { counted: 999.99, difference: { amount: -0.01, kind: "short", reason: "" } }));
    expect(screen.queryByText("Ready to submit")).toBeNull();
    expect(screen.getByText("The count is HKD0.01 short")).toBeInTheDocument();
    expect(screen.getByText("No reason was given yet.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to Cash Count" })).toBeInTheDocument();
  });

  it("holds Submit behind the business-rule gate", () => {
    renderClose(page({ problem: { error: "Finish Sales before you submit the day.", to: "sales" } }));
    expect(screen.queryByText("Ready to submit")).toBeNull();
    expect(screen.getByText("Finish Sales before you submit the day.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Submit Daily Report" })).toBeDisabled();
    expect(screen.getByText("Fix Sales first, then submit.")).toBeInTheDocument();
  });
});
