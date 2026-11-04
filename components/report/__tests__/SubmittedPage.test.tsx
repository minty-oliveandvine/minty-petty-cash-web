// The Submitted page's "Continue to next day report" (components/report/SubmittedPage.tsx).
//
// 2026-11-03 walk: on today's report the button went to the dashboard, which then could not
// start tomorrow and the person saw nothing they could act on. A report of today has no next
// day yet, so the page says so and stays.

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("next/image", () => ({ default: () => null }));
vi.mock("@/lib/apiClient", async (original) => ({
  ...(await original<typeof import("@/lib/apiClient")>()),
  pettyCashFetch: vi.fn(),
}));
vi.mock("@/lib/useAuth", () => ({
  useAuth: () => ({ entityId: "360812e1-9f3a-4c21-8e5b-1a2b3c4d5e6f", entityName: "DB Test Co" }),
}));

import { ToastProvider } from "@/components/flask/Toasts";
import { SubmittedPage } from "@/components/report/SubmittedPage";
import { pettyCashFetch } from "@/lib/apiClient";
import type { ReportOutcome } from "@/lib/report";

const fetchMock = vi.mocked(pettyCashFetch);

const outcome = (overrides: Partial<ReportOutcome>): ReportOutcome =>
  ({
    report_id: "r-1",
    transaction_date: "2026-11-03",
    currency_code: "HKD",
    company_name: "DB Test Co",
    status: "submitted",
    submitted: true,
    submitted_at: "2026-11-03T10:00:00Z",
    submitted_by: "Angelika",
    xero: {
      publishing_status: "unpublished",
      published_at: null,
      xero_integrated: false,
      was_published: false,
    },
    can_publish: true,
    is_today: false,
    next_day: "2026-11-04",
    ...overrides,
  }) as ReportOutcome;

const show = async (answer: ReportOutcome) => {
  fetchMock.mockResolvedValue(answer);
  render(
    <ToastProvider>
      <SubmittedPage reportId="r-1" />
    </ToastProvider>,
  );
  return screen.findByRole("button", { name: /Continue to next day report/ });
};

beforeEach(() => {
  router.push.mockClear();
  sessionStorage.clear();
});

describe("Continue to next day report", () => {
  it("says today's report has no next day yet, and stays", async () => {
    const button = await show(outcome({ transaction_date: "2026-11-03", is_today: true }));

    await userEvent.click(button);

    expect(
      await screen.findByText(
        "Transaction date cannot be in the future. You can only create reports for dates up to 2026-11-03.",
      ),
    ).toBeInTheDocument();
    expect(router.push).not.toHaveBeenCalled();
    expect(sessionStorage.length).toBe(0);
  });

  it("goes on to the dashboard to start the next day of an earlier report", async () => {
    const button = await show(
      outcome({ transaction_date: "2026-11-02", is_today: false, next_day: "2026-11-03" }),
    );

    await userEvent.click(button);

    await waitFor(() =>
      expect(router.push).toHaveBeenCalledWith(expect.stringMatching(/\/petty-cash$/)),
    );
    expect(sessionStorage.getItem("petty_cash_next_day")).toBe("2026-11-03");
  });
});
