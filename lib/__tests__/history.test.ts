import { describe, expect, it } from "vitest";

import { csvUrl } from "@/lib/flaskPages";
import {
  dayParts,
  draftStep,
  fieldDate,
  filtersFromAddress,
  historyAmount,
  historyBadge,
  historyHref,
  historyQuery,
  historyStamp,
  pagerItems,
  pickDay,
  pickedRange,
  shownRange,
  type HistoryRow,
} from "@/lib/history";

const ENTITY = "360812e1-9f94-46a3-aa31-347e21afde8e";
const REPORTS = "/entity/360812e1/olive-and-vine/petty-cash/reports";

const row = (over: Partial<HistoryRow> = {}): HistoryRow => ({
  id: "r",
  transaction_date: "2026-10-13",
  status: "submitted",
  status_label: "Submitted",
  status_tone: "info",
  current_section: null,
  total_sales: 0,
  total_expenses: 0,
  submitted_by: "Tess",
  submitted_at: "2026-10-13T12:05:00+00:00",
  published_at: null,
  created_at: "2026-10-13T01:30:00+00:00",
  was_published: false,
  publish_reasons: [],
  permissions: { edit: false, delete: false },
  ...over,
});

describe("the filters in the address", () => {
  it("reads the dates and the page as the address has them", () => {
    expect(filtersFromAddress(new URLSearchParams("start_date=2026-10-01&end_date=2026-10-13&page=2"))).toEqual({
      start: "2026-10-01",
      end: "2026-10-13",
      page: "2",
    });
    expect(filtersFromAddress(new URLSearchParams(""))).toEqual({ start: "", end: "", page: "" });
  });

  it("sends the API only what the address has - no status, no page size", () => {
    expect(historyQuery({ start: "", end: "", page: "" })).toEqual({});
    expect(historyQuery({ start: "2026-10-01", end: "2026-10-13", page: "3" })).toEqual({ start_date: "2026-10-01", end_date: "2026-10-13", page: "3" });
    // a bad address goes to the API as it stands, so its 422 says what is wrong
    expect(historyQuery({ start: "2026-10-01", end: "", page: "x" })).toEqual({ start_date: "2026-10-01", page: "x" });
  });

  it("writes the page's address: the dates when set, the page past the first", () => {
    expect(historyHref(ENTITY, "Olive & Vine")).toBe(REPORTS);
    expect(historyHref(ENTITY, "Olive & Vine", { start: "2026-10-01", end: "2026-10-13", page: 1 })).toBe(`${REPORTS}?start_date=2026-10-01&end_date=2026-10-13`);
    expect(historyHref(ENTITY, "Olive & Vine", { start: "2026-10-01", end: "2026-10-13", page: 2 })).toBe(`${REPORTS}?start_date=2026-10-01&end_date=2026-10-13&page=2`);
    expect(historyHref(ENTITY, "Olive & Vine", { page: 4 })).toBe(`${REPORTS}?page=4`);
  });

  it("round-trips: an address written is read back the same", () => {
    const href = historyHref(ENTITY, "Olive & Vine", { start: "2026-09-01", end: "2026-09-30", page: 5 });
    expect(filtersFromAddress(new URL(href, "http://x").searchParams)).toEqual({ start: "2026-09-01", end: "2026-09-30", page: "5" });
  });
});

describe("the pager, as Flask draws it", () => {
  it("shows every page when there are few", () => {
    expect(pagerItems(1, 4)).toEqual([1, 2, 3, 4]);
    expect(pagerItems(3, 5)).toEqual([1, 2, 3, 4, 5]);
  });

  it("keeps the first two, the last two and the pages beside the current one, with a gap two away", () => {
    expect(pagerItems(1, 10)).toEqual([1, 2, "gap", 9, 10]);
    expect(pagerItems(5, 10)).toEqual([1, 2, "gap", 4, 5, 6, "gap", 9, 10]);
    expect(pagerItems(10, 10)).toEqual([1, 2, "gap", 9, 10]);
    expect(pagerItems(4, 10)).toEqual([1, 2, 3, 4, 5, "gap", 9, 10]);
  });

  it("says which reports are shown, ten a page", () => {
    expect(shownRange(1, 23)).toEqual({ from: 1, to: 10 });
    expect(shownRange(3, 23)).toEqual({ from: 21, to: 23 });
  });
});

describe("the CSV export (Flask's report.download_reports_csv)", () => {
  it("is Flask's address for both dates", () => {
    expect(csvUrl(ENTITY, "2026-10-01", "2026-10-13")).toBe(
      `http://localhost:8000/entity/${ENTITY}/petty-cash/reports/download-csv?start_date=2026-10-01&end_date=2026-10-13`,
    );
  });

  it("needs both dates, the start on or before the end", () => {
    expect(csvUrl(ENTITY, "", "")).toBeNull();
    expect(csvUrl(ENTITY, "2026-10-01", "")).toBeNull();
    expect(csvUrl(ENTITY, "2026-10-13", "2026-10-01")).toBeNull();
    expect(csvUrl(ENTITY, "2026-10-13", "2026-10-13")).not.toBeNull();
  });
});

describe("a row, as Flask's original history draws it", () => {
  it("badges: Published, Publish failed, Draft, else Submitted (a publish under way included)", () => {
    expect(historyBadge(row({ status_label: "Published to Xero", status_tone: "success" }))).toBe("Published");
    expect(historyBadge(row({ status_label: "Publish failed", status_tone: "danger" }))).toBe("Publish failed");
    expect(historyBadge(row({ status: "draft", status_label: "Draft", status_tone: "neutral" }))).toBe("Draft");
    expect(historyBadge(row())).toBe("Submitted");
    expect(historyBadge(row({ status_label: "Publishing to Xero" }))).toBe("Submitted");
  });

  it("stamps as Flask did, in Hong Kong: published, submitted, else when the day was started", () => {
    expect(historyStamp(row())).toBe("13 Oct 2026 20:05");
    expect(historyStamp(row({ status_label: "Published to Xero", published_at: "2026-10-13T16:30:00+00:00" }))).toBe("14 Oct 2026 00:30");
    // a failed publish is still submitted: its submit time
    expect(historyStamp(row({ status_label: "Publish failed" }))).toBe("13 Oct 2026 20:05");
    // a draft: when it was started
    expect(historyStamp(row({ status: "draft", status_label: "Draft", submitted_at: null }))).toBe("13 Oct 2026 09:30");
  });

  it("falls back on when the day was started when the submit or publish time is missing", () => {
    expect(historyStamp(row({ submitted_at: null }))).toBe("13 Oct 2026 09:30");
    expect(historyStamp(row({ status_label: "Published to Xero", published_at: null }))).toBe("13 Oct 2026 09:30");
    expect(historyStamp(row({ submitted_at: null, created_at: null }))).toBe("");
  });

  it("writes an amount with the currency code, a dash for nothing, smaller as it grows", () => {
    expect(historyAmount(0, "HKD")).toEqual({ text: "-", tier: 0 });
    expect(historyAmount(1234.5, "HKD")).toEqual({ text: "HKD1,234.50", tier: 1 });
    expect(historyAmount(99.5, "HKD")).toEqual({ text: "HKD99.50", tier: 0 });
    expect(historyAmount(1234567.5, "HKD")).toEqual({ text: "HKD1,234,567.50", tier: 2 });
    expect(historyAmount(12, null)).toEqual({ text: "$12.00", tier: 0 });
  });

  it("resumes a draft at its step, Opening when it has none (Flask's resume)", () => {
    const draft = (current_section: string | null) => row({ status: "draft", status_label: "Draft", current_section });
    expect(draftStep(draft("cash_count"))).toBe("cash_count");
    expect(draftStep(draft("expenses"))).toBe("expenses");
    expect(draftStep(draft(null))).toBe("opening");
    expect(draftStep(draft("summary"))).toBe("opening");
  });

  it("names the day: the date, the weekday, and whether it is a weekend", () => {
    expect(dayParts("2026-10-13")).toEqual({ date: "13 OCT 2026", weekday: "TUE", weekend: false });
    expect(dayParts("2026-10-17")).toEqual({ date: "17 OCT 2026", weekday: "SAT", weekend: true });
  });
});

describe("the date range, as Flask's range calendar picks it", () => {
  it("writes a day as DD/MMM/YYYY", () => {
    expect(fieldDate("2026-06-22")).toBe("22/Jun/2026");
    expect(fieldDate("")).toBe("");
  });

  it("starts a range, closes it in order, then starts again", () => {
    expect(pickDay([], "2026-10-05")).toEqual(["2026-10-05"]);
    expect(pickDay(["2026-10-05"], "2026-10-09")).toEqual(["2026-10-05", "2026-10-09"]);
    expect(pickDay(["2026-10-05"], "2026-10-01")).toEqual(["2026-10-01", "2026-10-05"]);
    expect(pickDay(["2026-10-01", "2026-10-05"], "2026-10-20")).toEqual(["2026-10-20"]);
  });

  it("one day picked is that day at both ends", () => {
    expect(pickedRange([])).toEqual({ start: "", end: "" });
    expect(pickedRange(["2026-10-05"])).toEqual({ start: "2026-10-05", end: "2026-10-05" });
    expect(pickedRange(["2026-10-01", "2026-10-05"])).toEqual({ start: "2026-10-01", end: "2026-10-05" });
  });
});
