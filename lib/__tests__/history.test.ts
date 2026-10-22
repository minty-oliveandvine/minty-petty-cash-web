import { describe, expect, it } from "vitest";

import {
  apiQuery,
  changeFilters,
  csvFallbackName,
  csvGate,
  csvRequest,
  csvSavedMessage,
  dateRangeProblem,
  filtersOf,
  historyQuery,
  isFiltered,
  missingDate,
  pagerItems,
  rangeText,
  rowActions,
  rowHref,
  rowMeta,
  STATUS_CHIPS,
  watchedOnArrival,
  type Filters,
  type HistoryRow,
} from "@/lib/history";
import { historyHref } from "@/lib/wizardPages";

// Amounts read "HKD 760.00" - owner 2026-10-21: one money rule (@minty/shared/money); they were "HKD760.00".

const ENTITY = "360812e1-9f94-46a3-aa31-347e21afde8e";
const NONE: Filters = { status: "", start: "", end: "", page: 1, perPage: 10 };

function row(over: Partial<HistoryRow> = {}): HistoryRow {
  return {
    id: "r1",
    transaction_date: "2026-10-13",
    status: "submitted",
    status_label: "Submitted",
    status_tone: "info",
    current_section: null,
    total_sales: 1070.5,
    total_expenses: 240.5,
    submitted_by: "Olive",
    submitted_at: "2026-10-13T18:12:00+08:00",
    published_at: null,
    publishing_status: "unpublished",
    was_published: false,
    publish_reasons: [],
    permissions: { edit: true, delete: true },
    ...over,
  };
}

describe("the address and the filters", () => {
  it("reads every filter from the address, with the defaults for what is missing", () => {
    expect(filtersOf(new URLSearchParams(""))).toEqual(NONE);
    expect(filtersOf(new URLSearchParams("status=failed&start_date=2026-10-01&end_date=2026-10-13&page=3&per_page=50"))).toEqual({
      status: "failed",
      start: "2026-10-01",
      end: "2026-10-13",
      page: 3,
      perPage: 50,
    });
  });

  it("draws a page or a page size it can't read as the defaults", () => {
    expect(filtersOf(new URLSearchParams("page=abc&per_page=7"))).toMatchObject({ page: 1, perPage: 10 });
    expect(filtersOf(new URLSearchParams("page=0"))).toMatchObject({ page: 1 });
    expect(filtersOf(new URLSearchParams("page=2.5"))).toMatchObject({ page: 1 });
  });

  it("writes only what differs from the defaults, in a fixed order", () => {
    expect(historyQuery(NONE)).toBe("");
    expect(historyQuery({ ...NONE, page: 2 })).toBe("page=2");
    expect(historyQuery({ status: "draft", start: "2026-10-01", end: "2026-10-13", page: 4, perPage: 25 })).toBe(
      "status=draft&start_date=2026-10-01&end_date=2026-10-13&page=4&per_page=25",
    );
  });

  it("round-trips: the address a filter writes reads back as the same filter", () => {
    const f: Filters = { status: "published", start: "2026-09-01", end: "2026-09-30", page: 2, perPage: 100 };
    expect(filtersOf(new URLSearchParams(historyQuery(f)))).toEqual(f);
  });

  it("sends the API the five keys exactly as the address has them - a bad one is the API's to refuse", () => {
    expect(apiQuery(new URLSearchParams("status=late&page=abc&per_page=7&start_date=2026-10-01&other=x"))).toEqual({
      status: "late",
      page: "abc",
      per_page: "7",
      start_date: "2026-10-01",
    });
    expect(apiQuery(new URLSearchParams(""))).toEqual({});
  });

  it("goes back to page 1 when a filter changes, and keeps the rest", () => {
    const f: Filters = { status: "draft", start: "", end: "", page: 4, perPage: 25 };
    expect(changeFilters(f, { status: "submitted" })).toEqual({ ...f, status: "submitted", page: 1 });
    expect(changeFilters(f, { perPage: 50 })).toEqual({ ...f, perPage: 50, page: 1 });
    expect(changeFilters(f, { start: "2026-10-01", end: "2026-10-02" })).toEqual({ ...f, start: "2026-10-01", end: "2026-10-02", page: 1 });
    expect(changeFilters(f, { page: 5 })).toEqual({ ...f, page: 5 });
  });

  it("knows a filtered list from the whole one (the page and its size are not filters)", () => {
    expect(isFiltered(NONE)).toBe(false);
    expect(isFiltered({ ...NONE, page: 3, perPage: 50 })).toBe(false);
    expect(isFiltered({ ...NONE, status: "draft" })).toBe(true);
    expect(isFiltered({ ...NONE, start: "2026-10-01", end: "2026-10-02" })).toBe(true);
  });

  it("names the chips with the Status pill's own words", () => {
    expect(STATUS_CHIPS.map((c) => [c.key, c.label])).toEqual([
      ["", "All"],
      ["draft", "Draft"],
      ["submitted", "Submitted"],
      ["published", "Published to Xero"],
      ["failed", "Publish failed"],
    ]);
  });
});

describe("the pager", () => {
  it("lists every page up to seven", () => {
    expect(pagerItems(1, 1)).toEqual([1]);
    expect(pagerItems(3, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("keeps the first, the last and the current page's neighbours beyond that", () => {
    expect(pagerItems(1, 20)).toEqual([1, 2, "gap", 20]);
    expect(pagerItems(5, 20)).toEqual([1, "gap", 4, 5, 6, "gap", 20]);
    expect(pagerItems(3, 20)).toEqual([1, 2, 3, 4, "gap", 20]);
    expect(pagerItems(20, 20)).toEqual([1, "gap", 19, 20]);
  });

  it('says "Showing a–b of n"', () => {
    expect(rangeText(1, 10, 41)).toBe("Showing 1–10 of 41");
    expect(rangeText(5, 10, 41)).toBe("Showing 41–41 of 41");
    expect(rangeText(2, 25, 41)).toBe("Showing 26–41 of 41");
    expect(rangeText(1, 10, 3)).toBe("Showing 1–3 of 3");
    expect(rangeText(1, 10, 0)).toBe("Showing 0 of 0");
  });
});

describe("the date range", () => {
  it("refuses an end before the start, at once, naming the fix", () => {
    expect(dateRangeProblem("2026-10-13", "2026-10-01")).toBe("The end date is before the start date. Choose a later end date.");
    expect(dateRangeProblem("2026-10-01", "2026-10-01")).toBeNull();
    expect(dateRangeProblem("2026-10-01", "")).toBeNull();
    expect(dateRangeProblem("", "")).toBeNull();
  });

  it("says which date is still missing when only one is chosen", () => {
    expect(missingDate("2026-10-01", "")).toEqual({ field: "end", message: "The To date is still empty. Choose it to see the reports between the two dates." });
    expect(missingDate("", "2026-10-01")).toEqual({ field: "start", message: "The From date is still empty. Choose it to see the reports between the two dates." });
    expect(missingDate("", "")).toBeNull();
    expect(missingDate("2026-10-01", "2026-10-02")).toBeNull();
  });
});

describe("Export CSV", () => {
  it("asks the API for the shown dates, never a Flask page", () => {
    expect(csvRequest({ ...NONE, start: "2026-10-01", end: "2026-10-13", status: "draft", page: 3 })).toEqual({
      path: "/reports/export.csv",
      query: { start_date: "2026-10-01", end_date: "2026-10-13" },
    });
  });

  it("names the file as the server does when its name can't be read, and says where it went", () => {
    expect(csvFallbackName({ ...NONE, start: "2026-10-01", end: "2026-10-13" })).toBe("reports_2026-10-01_to_2026-10-13.csv");
    expect(csvSavedMessage("reports_2026-10-01_to_2026-10-13.csv")).toBe("Reports exported to reports_2026-10-01_to_2026-10-13.csv.");
  });

  it("waits for both dates, and says why beside the button", () => {
    expect(csvGate({ ...NONE, start: "2026-10-01", end: "2026-10-13" })).toBeNull();
    expect(csvGate(NONE)).toBe("To export, choose both dates and select Show.");
    expect(csvGate({ ...NONE, start: "2026-10-01" })).toBe("To export, choose both dates and select Show.");
  });
});

describe("a row", () => {
  it("reads its figures as plain text, with who submitted it", () => {
    expect(rowMeta(row(), "HKD")).toBe("Expenses HKD\u00a0240.50 · Submitted by Olive");
    expect(rowMeta(row({ submitted_by: null }), "HKD")).toBe("Expenses HKD\u00a0240.50");
  });

  it("says so when the company has no currency - never $, never a bare number (owner 2026-10-22)", () => {
    expect(rowMeta(row(), null)).toBe("Expenses 240.50 (No currency selected) · Submitted by Olive");
  });

  it("says a draft is still in progress", () => {
    expect(rowMeta(row({ status: "draft", status_label: "Draft", status_tone: "neutral" }), "HKD")).toBe("Daily Closing in progress");
  });

  it("offers only what the API allows - Publish with can_publish, never on a draft; Edit and Delete per row", () => {
    expect(rowActions(row(), true)).toEqual({ publish: "Publish to Xero", edit: true, delete: true });
    expect(rowActions(row({ status_label: "Published to Xero", status_tone: "success" }), true).publish).toBe("Publish to Xero again");
    expect(rowActions(row(), false).publish).toBeNull();
    expect(rowActions(row({ status: "draft", status_label: "Draft", status_tone: "neutral", permissions: { edit: false, delete: false } }), true)).toEqual({
      publish: null,
      edit: false,
      delete: false,
    });
    expect(rowActions(row({ permissions: { edit: false, delete: false } }), true)).toEqual({ publish: "Publish to Xero", edit: false, delete: false });
  });
});

describe("a row's publish on arrival", () => {
  it("watches a row already publishing, and no other", () => {
    expect(watchedOnArrival(row({ publishing_status: "publishing", status_label: "Publishing to Xero" }))).toBe("publishing");
    expect(watchedOnArrival(row())).toBeNull();
    expect(watchedOnArrival(row({ publishing_status: null }))).toBeNull();
    expect(watchedOnArrival(row({ publishing_status: "completed", status_tone: "success" }))).toBeNull();
    // a failed row already carries its reasons: not read again
    expect(watchedOnArrival(row({ publishing_status: "failed", publish_reasons: [{ text: "Account 429 is archived.", resolved: false }] }))).toBeNull();
  });
});

describe("where a row opens", () => {
  const BASE = "/entity/360812e1/olive-and-vine/petty-cash";
  const draft = (current_section: string | null) => row({ id: "d1", status: "draft", status_label: "Draft", status_tone: "neutral", current_section });

  it("opens a submitted report's Daily Report", () => {
    expect(rowHref(row({ current_section: "ending" }), ENTITY, "Olive & Vine")).toBe(`${BASE}/reports/r1/summary`);
  });

  it("opens a draft's own stage for its day, as the launch page's Continue does", () => {
    expect(rowHref(draft("expenses"), ENTITY, "Olive & Vine")).toBe(`${BASE}/reports/new/expense?transaction_date=2026-10-13`);
    expect(rowHref(draft("deposit"), ENTITY, "Olive & Vine")).toBe(`${BASE}/reports/new/cash-count?transaction_date=2026-10-13`);
    expect(rowHref(draft("cash_count"), ENTITY, "Olive & Vine")).toBe(`${BASE}/reports/new/cash-count?transaction_date=2026-10-13`);
    expect(rowHref(draft("ending"), ENTITY, "Olive & Vine")).toBe(`${BASE}/reports/new/ending?transaction_date=2026-10-13`);
  });

  it("opens Addition to Drawer for a draft that names no section, or one this app doesn't know - never a Flask page", () => {
    expect(rowHref(draft(null), ENTITY, "Olive & Vine")).toBe(`${BASE}/reports/new/opening?transaction_date=2026-10-13`);
    expect(rowHref(draft("review"), ENTITY, "Olive & Vine")).toBe(`${BASE}/reports/new/opening?transaction_date=2026-10-13`);
  });
});

describe("the history's address", () => {
  it("is the company's reports page, with an optional query", () => {
    expect(historyHref(ENTITY, "Olive & Vine")).toBe("/entity/360812e1/olive-and-vine/petty-cash/reports");
    expect(historyHref(ENTITY, "Olive & Vine", "status=draft")).toBe("/entity/360812e1/olive-and-vine/petty-cash/reports?status=draft");
  });
});
