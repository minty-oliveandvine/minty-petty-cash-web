import { afterEach, describe, expect, it } from "vitest";

import { countedFact, differenceFact, offersNextDay, outcomeTitle, requestStart, takeStartRequest, xeroFact, type Outcome } from "@/lib/outcome";

function outcome(over: Partial<Outcome> = {}): Outcome {
  return {
    report_id: "r1",
    transaction_date: "2026-10-13",
    currency_code: "HKD",
    company_name: "E2E Petty Cash Shop",
    status: "submitted",
    submitted: true,
    submitted_at: "2026-10-13T10:12:00+00:00",
    submitted_by: "Olive",
    cash_counted: 6470,
    difference: { amount: -20, kind: "short", has_reason: true },
    xero: { publishing_status: "unpublished", published_at: null, xero_integrated: false, was_published: false },
    can_publish: true,
    is_today: true,
    next_day: "2026-10-14",
    ...over,
  };
}

describe("the outcome sentence and facts (15.12e)", () => {
  it("says today's report, another day's, or a report not submitted", () => {
    expect(outcomeTitle(outcome())).toBe("Today's report is submitted");
    expect(outcomeTitle(outcome({ is_today: false }))).toBe("The report is submitted");
    expect(outcomeTitle(outcome({ submitted: false, status: "draft" }))).toBe("This report isn't submitted yet");
  });

  it("gives the cash counted as the server's figure", () => {
    expect(countedFact(outcome())).toBe("HKD6,470.00");
  });

  it("gives the difference in words, any cent, and whether a note explains it", () => {
    expect(differenceFact(outcome())).toBe("HKD20.00 short · note added");
    expect(differenceFact(outcome({ difference: { amount: 0.01, kind: "over", has_reason: false } }))).toBe("HKD0.01 over");
    expect(differenceFact(outcome({ difference: { amount: 0, kind: "none", has_reason: false } }))).toBe("None");
  });

  it("says whether the report reached Xero", () => {
    expect(xeroFact(outcome())).toBe("Not yet");
    expect(xeroFact(outcome({ xero: { publishing_status: "publishing", published_at: null, xero_integrated: false, was_published: false } }))).toBe("Pending");
    expect(xeroFact(outcome({ xero: { publishing_status: "failed", published_at: null, xero_integrated: false, was_published: false } }))).toBe("Not yet: it failed");
    expect(xeroFact(outcome({ xero: { publishing_status: "completed", published_at: null, xero_integrated: true, was_published: true } }))).toBe("Yes");
    // the time on the device's clock
    const at = new Date(2026, 9, 13, 18, 12);
    expect(xeroFact(outcome({ xero: { publishing_status: "completed", published_at: at.toISOString(), xero_integrated: true, was_published: true } }))).toBe("Yes · 6:12 pm");
  });

  it("offers the next day only for an earlier day's submitted report", () => {
    expect(offersNextDay(outcome())).toBe(false);
    expect(offersNextDay(outcome({ is_today: false }))).toBe(true);
    expect(offersNextDay(outcome({ is_today: false, submitted: false }))).toBe(false);
  });
});

describe("Start the next day (Flask's autoStartNextDay)", () => {
  afterEach(() => sessionStorage.clear());

  it("is read once", () => {
    requestStart("2026-10-14");
    expect(takeStartRequest()).toBe("2026-10-14");
    expect(takeStartRequest()).toBeNull();
  });

  it("ignores anything that is not a day", () => {
    sessionStorage.setItem("petty_cash_start_day", "tomorrow");
    expect(takeStartRequest()).toBeNull();
  });
});
