// The dashboard's day summary (components/dashboard/Dashboard.tsx).
//
// 2026-11-03 walk: once today's report was submitted the dashboard said "Today's report is
// submitted" and, right under it, "Report in Progress" - nothing was in progress. The summary
// names the last submitted report then.

import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}));
vi.mock("@/lib/apiClient", async (original) => ({
  ...(await original<typeof import("@/lib/apiClient")>()),
  pettyCashFetch: vi.fn(),
}));
vi.mock("@/lib/useAuth", () => ({
  useAuth: () => ({ entityId: "360812e1-9f3a-4c21-8e5b-1a2b3c4d5e6f", entityName: "DB Test Co" }),
}));

import { Dashboard } from "@/components/dashboard/Dashboard";
import { ToastProvider } from "@/components/flask/Toasts";
import { pettyCashFetch } from "@/lib/apiClient";
import type { Home } from "@/lib/dashboard";

const fetchMock = vi.mocked(pettyCashFetch);

const day = (closing: number) => ({
  id: `r-${closing}`,
  closing_balance: closing,
  bank_deposit: 0,
  xero_integrated: false,
  submitter_first_name: "Angelika",
});

const home = (overrides: Partial<Home>): Home => ({
  server_today: "2026-11-03",
  user_count: 1,
  currency_code: "HKD",
  latest: {
    date: "2026-11-03",
    closing_balance: 950,
    deposit: 0,
    deposit_bank_name: "",
    deposit_bank_number: "",
    deposit_correction_missing_settings: [],
    can_correct_deposit: false,
    submitter_first_name: "Angelika",
  },
  draft: null,
  draft_date: null,
  start_date: "2026-11-02",
  published: { "2026-11-02": day(1000), "2026-11-03": day(950) },
  today_has_report: true,
  today_is_latest_report: true,
  xero_settings: { complete: true, missing: [] },
  permissions: { read_only: false, correct_deposit: false },
  ...overrides,
});

const show = (answer: Home) => {
  fetchMock.mockResolvedValue(answer);
  render(
    <ToastProvider>
      <Dashboard />
    </ToastProvider>,
  );
};

beforeEach(() => sessionStorage.clear());

describe("the day summary", () => {
  it("names the last submitted report once today's is in, not a report in progress", async () => {
    show(home({}));

    expect(await screen.findByText("Today's report is submitted")).toBeInTheDocument();
    expect(screen.getByText("Last Submitted Report")).toBeInTheDocument();
    expect(screen.queryByText("Report in Progress")).not.toBeInTheDocument();
  });

  it("still says Report in Progress before today's is in", async () => {
    show(
      home({
        latest: { ...home({}).latest, date: "2026-11-02", closing_balance: 1000 },
        published: { "2026-11-02": day(1000) },
        today_has_report: false,
        today_is_latest_report: false,
      }),
    );

    expect(await screen.findByText("Report in Progress")).toBeInTheDocument();
    expect(screen.queryByText("Today's report is submitted")).not.toBeInTheDocument();
  });
});
