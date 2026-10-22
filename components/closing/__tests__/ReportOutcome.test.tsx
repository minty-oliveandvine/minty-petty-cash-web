// The outcome page as Flask's Daily Closing Phase 1 (Minty 4e004d2): the Completion state.

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => "/",
}));

import { Done } from "@/components/closing/ReportOutcome";
import type { Outcome } from "@/lib/outcome";

// Amounts read "HKD 760.00" - owner 2026-10-21: one money rule (@minty/shared/money); they were "HKD760.00".

const outcome = (over: Partial<Outcome> = {}): Outcome => ({
  report_id: "r1",
  transaction_date: "2026-10-13",
  currency_code: "HKD",
  company_name: "Olive",
  status: "submitted",
  submitted: true,
  submitted_at: "2026-10-13T10:12:00+00:00",
  submitted_by: "Olive",
  total_sales: 7000,
  total_expenses: 530,
  cash_counted: 6470,
  difference: { amount: -20, kind: "short", has_reason: true },
  xero: {
    publishing_status: "unpublished",
    published_at: null,
    xero_integrated: false,
    was_published: false,
  },
  can_publish: true,
  is_today: true,
  next_day: "2026-10-14",
  ...over,
});

const renderDone = (o: Outcome) =>
  render(
    <Done outcome={o} onXero={() => undefined} entityId="e1" entityName="Olive" home="/home" />,
  );

describe("the Completion state", () => {
  it("says today is closed, with the three facts, the difference as a pill, and the way on", () => {
    renderDone(outcome());
    const title = screen.getByRole("heading", { level: 1, name: "Today is closed" });
    expect(title).toHaveFocus();
    expect(
      screen.getByText(
        "The Daily Report for Tue 13 Oct 2026 is submitted. Nice work — see you tomorrow.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Sales").nextSibling).toHaveTextContent("HKD 7,000.00");
    expect(screen.getByText("Expenses").nextSibling).toHaveTextContent("HKD 530.00");
    expect(screen.getByText("Cash counted").nextSibling).toHaveTextContent(
      "HKD 6,470.00HKD 20.00 short",
    );
    expect(screen.getByRole("link", { name: "View report" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to home" })).toHaveAttribute("href", "/home");
    expect(screen.queryByRole("button", { name: "Start the next day" })).toBeNull();
  });

  it("says another day's report is submitted, and no pill when the count matched", () => {
    renderDone(
      outcome({ is_today: false, difference: { amount: 0, kind: "none", has_reason: false } }),
    );
    expect(
      screen.getByRole("heading", { level: 1, name: "The report is submitted" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Cash counted").nextSibling).toHaveTextContent(/^HKD 6,470.00$/);
  });

  it("has one quiet Xero line: Send to Xero asks first", async () => {
    const user = userEvent.setup();
    renderDone(outcome());
    expect(screen.getByText("Not sent to Xero yet")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Send to Xero" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("says when it is in Xero, with Publish again; and nothing to send without the permission", () => {
    const { unmount } = renderDone(
      outcome({
        xero: {
          publishing_status: "completed",
          published_at: null,
          xero_integrated: true,
          was_published: true,
        },
      }),
    );
    expect(screen.getByText("Sent to Xero")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Publish again" })).toBeInTheDocument();
    unmount();
    renderDone(outcome({ can_publish: false }));
    expect(screen.queryByText("Not sent to Xero yet")).toBeNull();
    expect(screen.queryByRole("button", { name: "Send to Xero" })).toBeNull();
  });
});
