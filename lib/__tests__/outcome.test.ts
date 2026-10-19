import { describe, expect, it } from "vitest";

import { countedFact, differencePill, outcomeLine, outcomeTitle, xeroLine, type Outcome } from "@/lib/outcome";

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
    total_sales: 7000,
    total_expenses: 530,
    cash_counted: 6470,
    difference: { amount: -20, kind: "short", has_reason: true },
    xero: { publishing_status: "unpublished", published_at: null, xero_integrated: false, was_published: false },
    can_publish: true,
    is_today: true,
    next_day: "2026-10-14",
    ...over,
  };
}

describe("the Completion state (Daily Closing Phase 1, Flask 4e004d2)", () => {
  it("says today is closed, another day's report is submitted, or a report not submitted", () => {
    expect(outcomeTitle(outcome())).toBe("Today is closed");
    expect(outcomeTitle(outcome({ is_today: false }))).toBe("The report is submitted");
    expect(outcomeTitle(outcome({ submitted: false, status: "draft" }))).toBe("This report isn't submitted yet");
  });

  it("names the day under it", () => {
    expect(outcomeLine(outcome())).toBe("The Daily Report for Tue 13 Oct 2026 is submitted. Nice work — see you tomorrow.");
  });

  it("gives the cash counted as the server's figure", () => {
    expect(countedFact(outcome())).toBe("HKD6,470.00");
  });

  it("puts the difference in a pill, in words, any cent - and nothing when the count matched", () => {
    expect(differencePill(outcome())).toBe("HKD20.00 short");
    expect(differencePill(outcome({ difference: { amount: 0.01, kind: "over", has_reason: false } }))).toBe("HKD0.01 over");
    expect(differencePill(outcome({ difference: { amount: 0, kind: "none", has_reason: false } }))).toBeNull();
  });

  it("says Xero in one quiet line: not sent yet with Send to Xero, or sent with its time and Publish again", () => {
    expect(xeroLine(outcome())).toEqual({ text: "Not sent to Xero yet", action: "Send to Xero" });
    // published before, changed since: still Send to Xero (the dialog warns about the copy)
    expect(xeroLine(outcome({ xero: { publishing_status: "unpublished", published_at: null, xero_integrated: false, was_published: true } }))).toEqual({
      text: "Not sent to Xero yet",
      action: "Send to Xero",
    });
    expect(xeroLine(outcome({ xero: { publishing_status: "completed", published_at: null, xero_integrated: true, was_published: true } }))).toEqual({
      text: "Sent to Xero",
      action: "Publish again",
    });
    // the time on the device's clock
    const at = new Date(2026, 9, 13, 18, 12);
    expect(xeroLine(outcome({ xero: { publishing_status: "completed", published_at: at.toISOString(), xero_integrated: true, was_published: true } })).text).toBe(
      "Sent to Xero · 6:12 pm",
    );
  });
});
