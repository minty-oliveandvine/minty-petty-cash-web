// The dashboard's rules (../dashboard.ts), ported from Flask's entity_dashboard_v2.html.

import { describe, expect, it } from "vitest";

import {
  balanceFor,
  catchUpDay,
  CHOOSE_CURRENCY,
  dayState,
  depositToConfirm,
  firstReportDay,
  isClickable,
  lastEditText,
  NO_CURRENCY,
  PREVIOUS_DAY_FIRST,
  setupMissing,
  startProblem,
  stepStates,
  type Home,
} from "@/lib/dashboard";

const TODAY = "2026-10-14";

function home(over: Partial<Home> = {}): Home {
  return {
    server_today: TODAY,
    user_count: 1,
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
    start_date: null,
    published: {},
    today_has_report: false,
    today_is_latest_report: false,
    xero_settings: { complete: true, missing: [] },
    permissions: { read_only: false, correct_deposit: true },
    ...over,
  };
}

function day(closing = 100, deposit = 0) {
  return {
    id: "r",
    closing_balance: closing,
    bank_deposit: deposit,
    xero_integrated: false,
    submitter_first_name: "Olive",
  };
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

  it("before any report, the onboarding start date is the floor, ahead of a draft's date", () => {
    const fresh = home({ start_date: "2026-10-05" });
    expect(isClickable(fresh, "2026-10-05")).toBe(true);
    expect(isClickable(fresh, "2026-10-04")).toBe(false);
    expect(dayState(fresh, "2026-10-04")).toBe("idle");
    const both = home({ start_date: "2026-10-05", draft_date: "2026-10-08" });
    expect(isClickable(both, "2026-10-06")).toBe(true);
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
    expect(startProblem(h, "2026-10-04")).toBe(
      "Transaction date must be on or after your onboarding date (2026-10-05).",
    );
    expect(startProblem(h, "2026-10-20")).toBeNull(); // the future is allowed then
    const started = home({ start_date: "2026-10-07", draft_date: "2026-10-09" });
    expect(startProblem(started, "2026-10-06")).toBe(
      "Transaction date must be on or after your onboarding date (2026-10-07).",
    );
    expect(startProblem(started, "2026-10-07")).toBeNull();
  });

  it("a company's first report opens on its onboarding start date", () => {
    expect(firstReportDay(home({ start_date: "2026-10-07" }))).toBe("2026-10-07");
    expect(firstReportDay(home({ start_date: TODAY }))).toBe(TODAY);
    expect(firstReportDay(home())).toBeNull();
    expect(firstReportDay(home({ start_date: "2026-10-20" }))).toBeNull(); // a future start waits for its day
    expect(
      firstReportDay(home({ start_date: "2026-10-07", published: { "2026-10-07": day() } })),
    ).toBeNull();
    const draft = {
      id: "d",
      current_section: "opening",
      completed_sections: [],
      last_edit_seconds: 5,
    };
    expect(firstReportDay(home({ start_date: "2026-10-07", draft }))).toBeNull(); // Continue owns it
  });

  it("after skipped days, opens on the day after the last submitted report", () => {
    expect(catchUpDay(home({ published: { "2026-10-12": day() } }))).toBe("2026-10-13");
    expect(catchUpDay(home({ published: { "2026-10-01": day(), "2026-10-10": day() } }))).toBe(
      "2026-10-11",
    );
    const h = home({ published: { "2026-10-11": day() } });
    expect(startProblem(h, catchUpDay(h)!)).toBeNull(); // exactly the day the start rules accept
  });

  it("opens on no other day when nothing was skipped, nothing is submitted, or a draft is open", () => {
    expect(catchUpDay(home({ published: { "2026-10-13": day() } }))).toBeNull();
    expect(
      catchUpDay(home({ published: { "2026-10-10": day(), "2026-10-13": day() } })),
    ).toBeNull(); // a hole further back
    expect(catchUpDay(home())).toBeNull();
    expect(catchUpDay(home({ published: { "2026-10-11": day(), [TODAY]: day() } }))).toBeNull();
    const draft = {
      id: "d",
      current_section: "opening",
      completed_sections: [],
      last_edit_seconds: 5,
    };
    expect(catchUpDay(home({ published: { "2026-10-12": day() }, draft }))).toBeNull(); // Continue owns it
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

  it("never while the company has no currency (owner, 2026-10-21), in the API's words, before any date rule", () => {
    expect(startProblem(home({ currency_code: null }), TODAY)).toBe(NO_CURRENCY);
    expect(
      startProblem(home({ currency_code: null, published: { "2026-10-12": day() } }), "2026-10-20"),
    ).toBe(NO_CURRENCY);
    expect(NO_CURRENCY).toBe(
      "No currency is selected for this company. Choose one in Petty Cash Settings to start a report.",
    );
  });
});

describe("Setup Required", () => {
  it("is not needed while the currency and Xero settings are there", () => {
    expect(setupMissing(home())).toEqual([]);
  });

  it("asks for the company's currency first when it has none", () => {
    expect(setupMissing(home({ currency_code: null }))).toEqual([CHOOSE_CURRENCY]);
    expect(CHOOSE_CURRENCY).toBe("Choose your company's currency");
    const both = home({
      currency_code: null,
      xero_settings: { complete: false, missing: ["Main Bank Account"] },
    });
    expect(setupMissing(both)).toEqual([CHOOSE_CURRENCY, "Main Bank Account"]);
  });

  it("lists the missing Xero settings, or Flask's catch-all when the API names none", () => {
    expect(
      setupMissing(
        home({
          xero_settings: { complete: false, missing: ["Main Bank Account", "Cash Sale Contact"] },
        }),
      ),
    ).toEqual(["Main Bank Account", "Cash Sale Contact"]);
    expect(setupMissing(home({ xero_settings: { complete: false, missing: [] } }))).toEqual([
      "One or more required settings are missing",
    ]);
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

  it("before the first report, is the opening balance the API sends (2026-10-27)", () => {
    const fresh = home();
    fresh.latest = { ...fresh.latest, date: null, closing_balance: 5525 };
    expect(balanceFor(fresh, TODAY)).toBe(5525);
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
    const steps = stepStates({
      current_section: "expenses",
      completed_sections: ["opening", "sales"],
    });
    expect(steps.map((s) => s.state)).toEqual([
      "completed",
      "completed",
      "current",
      "locked",
      "locked",
      "locked",
    ]);
    expect(steps.map((s) => s.open)).toEqual([true, true, true, false, false, false]);
    expect(steps.map((s) => s.label)).toEqual([
      "Opening",
      "Sales",
      "Expenses",
      "Bank Deposit",
      "Cash Count",
      "Ending",
    ]);
  });

  it("opens the first step of a draft that is still on it", () => {
    const [first, second] = stepStates({ current_section: "opening", completed_sections: [] });
    expect(first).toMatchObject({ state: "current", open: true });
    expect(second).toMatchObject({ state: "locked", open: false });
  });

  it("shows the next step after a completed one", () => {
    const steps = stepStates({ current_section: null, completed_sections: ["opening"] });
    expect(steps[1]).toMatchObject({ state: "next", open: true });
  });
});

describe("the progress steps on a wizard page", () => {
  it("make the page current and still open what the draft has done", () => {
    const steps = stepStates(
      { current_section: "expenses", completed_sections: ["opening", "sales"] },
      "opening",
    );
    expect(steps.map((s) => s.state)).toEqual([
      "current",
      "completed",
      "next",
      "locked",
      "locked",
      "locked",
    ]);
    expect(steps.map((s) => s.open)).toEqual([true, true, true, false, false, false]);
  });

  it("on a new report, the first step is current and opens", () => {
    const [first, second] = stepStates(
      { current_section: null, completed_sections: [] },
      "opening",
    );
    expect(first).toMatchObject({ state: "current", open: false });
    expect(second).toMatchObject({ state: "locked", open: false });
  });
});
