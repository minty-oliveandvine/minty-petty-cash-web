/**
 * Report history (Part 15.4b, historical retrieval; Flask's `report_history/report_history.html`):
 * what `GET /reports` answers (Minty `petty_cash_api/routes/history.py`), and the page's rules as
 * pure functions, so the page (components/history/ReportHistory.tsx) only draws what this says.
 *
 * Every filter lives in the address - `?status=&start_date=&end_date=&page=&per_page=` - so Back
 * and a reload keep it (15.4 Implementation: "filter state in URL"). The API filters, counts and
 * pages on the server; this file never cuts a list itself. Amounts are plain text, never coloured.
 */

import { formatMoney } from "@/lib/money";
import { publishLabel } from "@/lib/report";
import { reportHref, resumeHref } from "@/lib/wizardPages";

export type PublishReason = { text: string; resolved: boolean };

/** One row of `GET /reports`: a day's report, newest day first. */
export type HistoryRow = {
  id: string;
  transaction_date: string;
  /** The report's own status: "draft" or "submitted" (the pill says more). */
  status: string;
  status_label: string;
  status_tone: string;
  /** Where a draft resumes (opening .. ending), as /home's draft has it; null when it names none. */
  current_section: string | null;
  total_sales: number;
  total_expenses: number;
  /** The submitter's first name, or null. */
  submitted_by: string | null;
  submitted_at: string | null;
  published_at: string | null;
  /** "publishing" | "completed" | "failed" | "unpublished", or null for a report never sent. */
  publishing_status: string | null;
  /** It has been to Xero, even if edited since: Delete warns. */
  was_published: boolean;
  /** Why a failed publish failed, each still open or resolved since. Empty unless it failed. */
  publish_reasons: PublishReason[];
  /** True only on the latest report, never on a draft. */
  permissions: { edit: boolean; delete: boolean };
};

export type HistoryPage = {
  reports: HistoryRow[];
  page: number;
  per_page: number;
  total_pages: number;
  total_count: number;
  latest_report_id: string | null;
  currency_code: string | null;
  can_publish: boolean;
};

/** The status chips, named with the Status pill's own words (Part 14 Filter chip). "" is All. */
export const STATUS_CHIPS = [
  { key: "", label: "All" },
  { key: "draft", label: "Draft" },
  { key: "submitted", label: "Submitted" },
  { key: "published", label: "Published to Xero" },
  // The API's "failed" also holds a publish still under way (Publishing to Xero), as Flask's does.
  { key: "failed", label: "Publish failed" },
] as const;

/** Rows per page, everywhere (Part 14 Pagination). */
export const PER_PAGE = [10, 25, 50, 100] as const;
const DEFAULT_PER_PAGE = 10;

export type Filters = {
  /** A chip's key, as the address has it ("" is All). */
  status: string;
  start: string;
  end: string;
  page: number;
  perPage: number;
};

/** The address's keys, in the order they are written. */
const KEYS = ["status", "start_date", "end_date", "page", "per_page"] as const;

function wholeNumber(raw: string | null): number | null {
  if (!raw || !/^\d+$/.test(raw)) return null;
  return Number(raw);
}

/**
 * The filters as the page draws them, from the address. A page or page size it can't read is drawn
 * as the default; the API still gets the address as it stands (`apiQuery`) and refuses it with its
 * own sentence, so the page never shows a list it did not ask for.
 */
export function filtersOf(params: URLSearchParams): Filters {
  const page = wholeNumber(params.get("page"));
  const perPage = wholeNumber(params.get("per_page"));
  return {
    status: params.get("status") ?? "",
    start: params.get("start_date") ?? "",
    end: params.get("end_date") ?? "",
    page: page && page >= 1 ? page : 1,
    perPage: perPage && (PER_PAGE as readonly number[]).includes(perPage) ? perPage : DEFAULT_PER_PAGE,
  };
}

/** The list's address query (no "?"): only what differs from the defaults, in a fixed order. */
export function historyQuery(f: Filters): string {
  const qs = new URLSearchParams();
  if (f.status) qs.set("status", f.status);
  if (f.start) qs.set("start_date", f.start);
  if (f.end) qs.set("end_date", f.end);
  if (f.page > 1) qs.set("page", String(f.page));
  if (f.perPage !== DEFAULT_PER_PAGE) qs.set("per_page", String(f.perPage));
  return qs.toString();
}

/** What `GET /reports` is asked: the address's five keys exactly as they stand. */
export function apiQuery(params: URLSearchParams): Record<string, string> {
  const query: Record<string, string> = {};
  for (const key of KEYS) {
    const value = params.get(key);
    if (value !== null && value !== "") query[key] = value;
  }
  return query;
}

/** A change of filter goes back to page 1; only a change of page keeps the page. */
export function changeFilters(f: Filters, change: Partial<Filters>): Filters {
  return { ...f, ...change, page: change.page ?? 1 };
}

/** A status or a date range narrows the list (the page and its size don't). */
export function isFiltered(f: Filters): boolean {
  return Boolean(f.status || f.start || f.end);
}

/** The pager's numbers: all of them up to seven, else `1 … p-1 p p+1 … last`. */
export function pagerItems(page: number, totalPages: number): (number | "gap")[] {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
  const items: (number | "gap")[] = [1];
  const from = Math.max(2, page - 1);
  const to = Math.min(totalPages - 1, page + 1);
  if (from > 2) items.push("gap");
  for (let p = from; p <= to; p += 1) items.push(p);
  if (to < totalPages - 1) items.push("gap");
  items.push(totalPages);
  return items;
}

/** "Showing 1–10 of 41" (15.4 Content guidance). */
export function rangeText(page: number, perPage: number, total: number): string {
  if (total <= 0) return "Showing 0 of 0";
  const from = Math.min((page - 1) * perPage + 1, total);
  const to = Math.min(page * perPage, total);
  return `Showing ${from}–${to} of ${total}`;
}

/** The date range's rule, said as soon as both dates are there (Flask's sentence). */
export function dateRangeProblem(start: string, end: string): string | null {
  return start && end && end < start ? "The end date is before the start date. Choose a later end date." : null;
}

/** One date without the other: "not finished yet", so it is said only when Show is pressed. */
export function missingDate(start: string, end: string): { field: "start" | "end"; message: string } | null {
  if (Boolean(start) === Boolean(end)) return null;
  const field = start ? "end" : "start";
  return { field, message: `The ${field === "start" ? "From" : "To"} date is still empty. Choose it to see the reports between the two dates.` };
}

/** Why Export CSV waits (beside the button), or null once the list shows a date range. */
export function csvGate(f: Filters): string | null {
  return f.start && f.end ? null : "To export, choose both dates and select Show.";
}

/**
 * Export CSV's request: `GET /reports/export.csv?start_date=&end_date=` (Minty
 * `petty_cash_api/routes/history.py`), read with the bearer - the shown dates only.
 */
export function csvRequest(f: Filters): { path: string; query: { start_date: string; end_date: string } } {
  return { path: "/reports/export.csv", query: { start_date: f.start, end_date: f.end } };
}

/** The file's name when the server's `Content-Disposition` could not be read - the name it gives (`reports_<start>_to_<end>.csv`). */
export function csvFallbackName(f: Filters): string {
  return `reports_${f.start}_to_${f.end}.csv`;
}

/** Export CSV's confirmation toast. */
export function csvSavedMessage(filename: string): string {
  return `Reports exported to ${filename}.`;
}

/** A row's meta line: "Expenses HKD240.50 · Submitted by Olive", or a draft's "Daily Closing in progress". */
export function rowMeta(row: HistoryRow, code: string | null): string {
  if (row.status === "draft") return "Daily Closing in progress";
  const by = row.submitted_by ? ` · Submitted by ${row.submitted_by}` : "";
  return `Expenses ${formatMoney(row.total_expenses, code)}${by}`;
}

/**
 * A row's More menu: Publish (asked first, in the app; with `can_publish`, never on a draft - "again" once the
 * pill says Published to Xero, its only Success tone), Edit report and Delete report as the row's
 * `permissions` say.
 */
export function rowActions(row: HistoryRow, canPublish: boolean): { publish: string | null; edit: boolean; delete: boolean } {
  const publish = canPublish && row.status !== "draft" ? publishLabel({ xero_integrated: row.status_tone === "success" }) : null;
  return { publish, edit: row.permissions.edit, delete: row.permissions.delete };
}

/**
 * The publish a row watches from the moment the list loads: one already "publishing" is read until
 * it settles, like one started from the row. A failed row already carries its reasons, so it is
 * not read again.
 */
export function watchedOnArrival(row: HistoryRow): "publishing" | null {
  return row.publishing_status === "publishing" ? "publishing" : null;
}

/**
 * Where a row opens: a submitted report's Daily Report; a draft's own Daily Closing stage for its
 * day, where it was left - the launch page's Continue rule (`resumeHref`: `current_section`'s
 * stage, or Addition to Drawer when it names none).
 */
export function rowHref(row: HistoryRow, entityId: string, entityName: string): string {
  if (row.status !== "draft") return reportHref(entityId, entityName, row.id);
  return resumeHref(entityId, entityName, row.current_section, row.transaction_date);
}
