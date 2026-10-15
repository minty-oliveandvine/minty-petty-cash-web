// The launch page's rules (../dashboard.ts): the start rules ported from Flask's
// entity_dashboard_v2.html, and the Part 15.6a states built on them.

import { describe, expect, it } from "vitest";

import {
  depositToConfirm,
  firstName,
  gateDay,
  greetingFor,
  launchState,
  PREVIOUS_DAY_FIRST,
  recentReports,
  startProblem,
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

const DRAFT = { id: "d", current_section: "sales", completed_sections: ["opening"], last_edit_seconds: 60 };

describe("the launch card's state", () => {
  it("is first use with nothing submitted and nothing open", () => {
    expect(launchState(home())).toEqual({ kind: "first-use", day: TODAY });
  });

  it("is in progress whenever a report is open, on the open report's day", () => {
    expect(launchState(home({ draft: DRAFT, draft_date: TODAY }))).toEqual({ kind: "in-progress", day: TODAY, draft: DRAFT });
    expect(launchState(home({ draft: DRAFT, draft_date: "2026-10-12", published: { "2026-10-11": day() } }))).toMatchObject({
      kind: "in-progress",
      day: "2026-10-12",
    });
    // a first draft (onboarding) is in progress, not first use
    expect(launchState(home({ draft: DRAFT, draft_date: null }))).toMatchObject({ kind: "in-progress", day: TODAY });
  });

  it("is done when today is submitted - the server's today, not the device's - with its report to open", () => {
    expect(launchState(home({ published: { [TODAY]: day() } }))).toEqual({ kind: "done", day: TODAY, reportId: "r" });
  });

  it("is not started otherwise", () => {
    expect(launchState(home({ published: { "2026-10-13": day() } }))).toEqual({ kind: "not-started", day: TODAY });
  });
});

describe("the gate", () => {
  it("names the day after the last submitted report when yesterday is unfinished", () => {
    expect(gateDay(home({ published: { "2026-10-12": day() } }))).toBe("2026-10-13");
    expect(gateDay(home({ published: { "2026-10-01": day(), "2026-10-10": day() } }))).toBe("2026-10-11");
  });

  it("is open when yesterday is submitted, when nothing is, and when today is", () => {
    expect(gateDay(home({ published: { "2026-10-13": day() } }))).toBeNull();
    expect(gateDay(home({ published: { "2026-10-10": day(), "2026-10-13": day() } }))).toBeNull(); // a hole further back
    expect(gateDay(home())).toBeNull();
    expect(gateDay(home({ published: { "2026-10-11": day(), [TODAY]: day() } }))).toBeNull();
  });

  it("names exactly the day the start rules accept", () => {
    const h = home({ published: { "2026-10-11": day() } });
    const gate = gateDay(h)!;
    expect(startProblem(h, gate)).toBeNull();
    expect(startProblem(h, TODAY)).not.toBeNull();
  });
});

describe("recent reports", () => {
  it("are the newest three submitted days, newest first", () => {
    const h = home({ published: { "2026-10-09": day(1), "2026-10-13": day(4), "2026-10-10": day(2), "2026-10-12": day(3) } });
    expect(recentReports(h).map((r) => [r.day, r.report.closing_balance])).toEqual([
      ["2026-10-13", 4],
      ["2026-10-12", 3],
      ["2026-10-10", 2],
    ]);
    expect(recentReports(home())).toEqual([]);
  });
});

describe("the greeting", () => {
  it.each([
    [0, "Good morning"],
    [11, "Good morning"],
    [12, "Good afternoon"],
    [17, "Good afternoon"],
    [18, "Good evening"],
    [23, "Good evening"],
  ])("at %i o'clock says %s", (hour, text) => {
    expect(greetingFor(hour)).toBe(text);
  });

  it("uses the first word of the name, or nothing", () => {
    expect(firstName("Olive Tan")).toBe("Olive");
    expect(firstName("  Tess  ")).toBe("Tess");
    expect(firstName("")).toBeNull();
    expect(firstName(null)).toBeNull();
    expect(firstName(undefined)).toBeNull();
  });
});
