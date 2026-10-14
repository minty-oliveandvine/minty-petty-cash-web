// The dashboard's rules (../dashboard.ts), ported from Flask's entity_dashboard_v2.html.

import { describe, expect, it } from "vitest";

import {
  balanceFor,
  dayState,
  depositToConfirm,
  isClickable,
  lastEditText,
  PREVIOUS_DAY_FIRST,
  startProblem,
  stepStates,
  type Home,
} from "@/lib/dashboard";

const TODAY = "2026-10-14";

function home(over: Partial<Home> = {}): Home {
  return {
    server_today: TODAY,
    currency_code: "HKD",
    latest: {
      date: null,
      closing_balance: 0,
      deposit: 0,
      deposit_bank_name: "No deposit",
      deposit_bank_number: "",
      deposit_correction_missing_settings: [],
      can_correct_deposit: true,
      submitter_first_name: null,
    },
    draft: null,
    draft_date: null,
    published: {},
    today_has_report: false,
    today_is_latest_report: false,
    xero_settings: { complete: true, missing: [] },
    permissions: { read_only: false, correct_deposit: true },
    ...over,
  };
}

function day(closing = 100, deposit = 0) {
  return { id: "r", closing_balance: closing, bank_deposit: deposit, xero_integrated: false, submitter_first_name: "Olive" };
}

describe("the calendar", () => {
  const withReports = home({ published: { "2026-10-10": day(80), "2026-10-11": day(90) } });

  it("draws today, submitted days, missing days, the next day and the rest", () => {
    expect(dayState(withReports, TODAY)).toBe("today");
    expect(dayState(withReports, "2026-10-10")).toBe("submitted");
    expect(dayState(withReports, "2026-10-13")).toBe("missing");
    expect(dayState(withReports, "2026-10-12")).toBe("missing"); // missing wins over clickable
    expect(dayState(withReports, "2026-10-09")).toBe("idle"); // before the first report
    expect(dayState(withReports, "2026-10-20")).toBe("idle");
  });

  it("opens only today, submitted days and the day after the last report", () => {
    expect(isClickable(withReports, TODAY)).toBe(true);
    expect(isClickable(withReports, "2026-10-11")).toBe(true);
    expect(isClickable(withReports, "2026-10-12")).toBe(true);
    expect(isClickable(withReports, "2026-10-13")).toBe(false);
  });

  it("before any report, opens the future and the past from the onboarding floor", () => {
    const fresh = home({ draft_date: "2026-10-01" });
    expect(isClickable(fresh, "2026-11-02")).toBe(true);
    expect(isClickable(fresh, "2026-10-01")).toBe(true);
    expect(isClickable(fresh, "2026-09-30")).toBe(false);
    expect(isClickable(home(), "2020-01-01")).toBe(true); // no floor at all
  });
});

describe("starting a report", () => {
  it("must be the day after the last submitted report", () => {
    const h = home({ published: { "2026-10-12": day(), "2026-10-13": day() } });
    expect(startProblem(h, TODAY)).toBeNull();
    expect(startProblem(h, "2026-10-15")).toBe(
      "Transaction date must be 2026-10-14, the day after your last submitted report (2026-10-13).",
    );
  });

  it("never in the future", () => {
    const h = home({ published: { [TODAY]: day() } });
    expect(startProblem(h, "2026-10-15")).toBe(
      "Transaction date cannot be in the future. You can only create reports for dates up to 2026-10-14.",
    );
  });

  it("before any report, not before the onboarding date", () => {
    const h = home({ draft_date: "2026-10-05" });
    expect(startProblem(h, "2026-10-04")).toBe("Transaction date must be on or after your onboarding date (2026-10-05).");
    expect(startProblem(h, "2026-10-20")).toBeNull(); // the future is allowed then
  });

  it("not today while yesterday is unfinished", () => {
    const h = home({ published: { "2026-10-12": day() } });
    // the expected day is the 13th, so today fails on the sequence rule first
    expect(startProblem(h, TODAY)).toContain("must be 2026-10-13");
    const gap = home({ published: { "2026-10-11": day(), "2026-10-13": day() } });
    expect(startProblem(gap, TODAY)).toBeNull(); // yesterday (13th) is there
    const noYesterday = home({ published: { "2026-10-10": day() }, server_today: "2026-10-11" });
    expect(startProblem(noYesterday, "2026-10-11")).toBeNull();
    expect(PREVIOUS_DAY_FIRST).toMatch(/previous report needs finishing/);
  });
});

describe("Before You Start", () => {
  it("asks only when the day before put cash in the bank", () => {
    const h = home({ published: { "2026-10-13": day(100, 50) } });
    expect(depositToConfirm(h, TODAY)).toEqual({ day: "2026-10-13", report: day(100, 50) });
    expect(depositToConfirm(home({ published: { "2026-10-13": day(100, 0) } }), TODAY)).toBeNull();
    expect(depositToConfirm(home(), TODAY)).toBeNull();
  });
});

describe("the balance shown for a day", () => {
  const h = home({ published: { "2026-10-10": day(80), "2026-10-12": day(120) } });
  it("is the day's own, else the last before it, else 0", () => {
    expect(balanceFor(h, "2026-10-10")).toBe(80);
    expect(balanceFor(h, "2026-10-11")).toBe(80);
    expect(balanceFor(h, TODAY)).toBe(120);
    expect(balanceFor(h, "2026-10-01")).toBe(0);
  });
});

describe("Last edit … ago", () => {
  it.each([
    [1, "1 sec"],
    [59, "59 secs"],
    [60, "1 min"],
    [3599, "59 mins"],
    [3600, "1 hour"],
    [86399, "23 hours"],
    [86400, "1 day"],
    [172800, "2 days"],
  ])("%i seconds reads %s", (seconds, text) => {
    expect(lastEditText(seconds)).toBe(text);
  });
});

describe("the progress steps", () => {
  it("marks current, completed, next and locked, and opens what Flask opened", () => {
    const steps = stepStates({ id: "d", current_section: "expenses", completed_sections: ["opening", "sales"], last_edit_seconds: 0 });
    expect(steps.map((s) => s.state)).toEqual(["completed", "completed", "current", "locked", "locked", "locked"]);
    expect(steps.map((s) => s.open)).toEqual([true, true, true, false, false, false]);
    expect(steps.map((s) => s.label)).toEqual(["Opening", "Sales", "Expenses", "Bank Deposit", "Cash Count", "Ending"]);
  });

  it("opens the first step of a draft that is still on it", () => {
    const [first, second] = stepStates({ id: "d", current_section: "opening", completed_sections: [], last_edit_seconds: 0 });
    expect(first).toMatchObject({ state: "current", open: true });
    expect(second).toMatchObject({ state: "locked", open: false });
  });

  it("shows the next step after a completed one", () => {
    const steps = stepStates({ id: "d", current_section: null, completed_sections: ["opening"], last_edit_seconds: 0 });
    expect(steps[1]).toMatchObject({ state: "next", open: true });
  });
});
