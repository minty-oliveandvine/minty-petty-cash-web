/**
 * Report history: what `GET /reports` answers (Minty `petty_cash_api/routes/history.py`), the
 * page's filters as its address carries them, and the rules Flask's ORIGINAL
 * `report_history/report_history.html` (Minty `1c25b35^1`) draws a row and its pager by.
 */

import { pettyCashHome } from "@/lib/companyPages";
import { formatDay } from "@/lib/dates";
import { formatMoney, NO_CURRENCY_NOTE } from "@/lib/money";
import { sectionStep, type WizardStep } from "@/lib/wizardPages";

/** One report on the list. Edit and delete are only ever on the latest, never on a draft. */
export type HistoryRow = {
  id: string;
  transaction_date: string;
  status: string;
  status_label: string;
  status_tone: string;
  /** Where a draft resumes (opening .. ending), as the dashboard's draft has it; null when not started. */
  current_section: string | null;
  total_sales: number;
  total_expenses: number;
  /** The first name of who made it, or null. */
  submitted_by: string | null;
  submitted_at: string | null;
  published_at: string | null;
  /** When the day was started (Flask's `report.date`): a draft's time, and the fallback for the others. */
  created_at: string | null;
  /** Ever sent to Xero (the delete warns). */
  was_published: boolean;
  publish_reasons: { text: string; resolved: boolean }[];
  permissions: { edit: boolean; delete: boolean };
};

/** `GET /reports`: one page, newest day first. */
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

/** The filters as the address has them, unparsed: a bad one goes to the API, whose 422 says why. */
export type HistoryFilters = { start: string; end: string; page: string };

/** Flask's toast after a delete, the list read again in place. */
export const HISTORY_DELETED = "That report is deleted.";

/** Flask's page shows ten a page; the API's default, so it is never sent. */
export const PER_PAGE = 10;

/** The CSV export: `GET /reports/export.csv` (Minty `petty_cash_api/routes/history.py`). */
export const CSV_EXPORT_PATH = "/reports/export.csv";

/** Flask's success toast for the export, kept as it was. */
export const CSV_EXPORTED = "Your CSV export is on its way!";

/**
 * The export's query for two days - Flask's rule: both dates, the start on or before the end;
 * null otherwise (the button stays disabled).
 */
export function csvQuery(start: string, end: string): { start_date: string; end_date: string } | null {
  if (!start || !end || start > end) return null;
  return { start_date: start, end_date: end };
}

/** The file's name when the answer names none: the API's own pattern (`reports_<start>_to_<end>.csv`). */
export function csvFileName(start: string, end: string): string {
  return `reports_${start}_to_${end}.csv`;
}

export function filtersFromAddress(params: { get(name: string): string | null }): HistoryFilters {
  return { start: params.get("start_date") ?? "", end: params.get("end_date") ?? "", page: params.get("page") ?? "" };
}

/** `GET /reports`'s query: only what the original page offers (no status, no page size). */
export function historyQuery(f: HistoryFilters): Record<string, string> {
  const q: Record<string, string> = {};
  if (f.start) q.start_date = f.start;
  if (f.end) q.end_date = f.end;
  if (f.page) q.page = f.page;
  return q;
}

/** The page's address, `/entity/<shortid>/<name>/petty-cash/reports?start_date=&end_date=&page=`. */
export function historyHref(entityId: string, entityName: string, f: { start?: string; end?: string; page?: number } = {}): string {
  const qs = new URLSearchParams();
  if (f.start) qs.set("start_date", f.start);
  if (f.end) qs.set("end_date", f.end);
  if (f.page && f.page > 1) qs.set("page", String(f.page));
  const query = qs.toString();
  return `${pettyCashHome(entityId, entityName)}/reports${query ? `?${query}` : ""}`;
}

/**
 * Flask's page numbers: the first two, the last two and the pages either side of the current
 * one; a "..." (`"gap"`) where a page two away is left out.
 */
export function pagerItems(page: number, totalPages: number): (number | "gap")[] {
  const items: (number | "gap")[] = [];
  for (let p = 1; p <= totalPages; p++) {
    if (p === page || p <= 2 || p > totalPages - 2 || (p >= page - 1 && p <= page + 1)) items.push(p);
    else if (p === page - 2 || p === page + 2) items.push("gap");
  }
  return items;
}

/** "Showing 11 to 20 of 23 reports". */
export function shownRange(page: number, totalCount: number): { from: number; to: number } {
  return { from: (page - 1) * PER_PAGE + 1, to: Math.min(page * PER_PAGE, totalCount) };
}

/**
 * Flask's badge on the original page: Published (in Xero), Publish failed, Draft, else
 * Submitted - a publish under way included, as the original drew it.
 */
export function historyBadge(row: HistoryRow): "Published" | "Publish failed" | "Draft" | "Submitted" {
  if (row.status === "draft") return "Draft";
  if (row.status_label === "Published to Xero") return "Published";
  if (row.status_label === "Publish failed") return "Publish failed";
  return "Submitted";
}

const HK_STAMP = new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Hong_Kong",
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/**
 * The time under the badge, Flask's "13 Oct 2026 20:05" in Hong Kong time, by Flask's rule: in
 * Xero, when it went there; submitted (a failed publish included), when it was submitted; else
 * (a draft) when the day was started - which is also the fallback when either time is missing.
 */
export function historyStamp(row: HistoryRow): string {
  const when =
    historyBadge(row) === "Published" ? (row.published_at ?? row.created_at) : row.status === "submitted" ? (row.submitted_at ?? row.created_at) : row.created_at;
  if (!when) return "";
  const moment = new Date(when);
  if (Number.isNaN(moment.getTime())) return "";
  const p = Object.fromEntries(HK_STAMP.formatToParts(moment).map((x) => [x.type, x.value]));
  return `${p.day} ${p.month} ${p.year} ${p.hour}:${p.minute}`;
}

/**
 * A Sales or Expenses figure as Flask's `amount()` macro writes it: "-" for nothing, else the
 * currency code and the amount. Its columns are a fixed width, so a longer figure steps down a
 * size (`tier` 0, 1, 2: up to 11, 14, then more characters - Flask's 10 and 13, plus the space
 * after the code). With no currency, the figure alone sets the size; the note wraps under it.
 */
export function historyAmount(value: number, currencyCode: string | null): { text: string; tier: 0 | 1 | 2 } {
  const text = value ? formatMoney(value, currencyCode) : "-";
  const figure = text.replace(` ${NO_CURRENCY_NOTE}`, "");
  return { text, tier: figure.length <= 11 ? 0 : figure.length <= 14 ? 1 : 2 };
}

/** The wizard step a draft resumes at: its own, else Opening - Flask's `resume_report` rule. */
export function draftStep(row: HistoryRow): WizardStep {
  return sectionStep(row.current_section);
}

/** The day's column: "13 OCT 2026", "TUE" in its circle, yellow on a weekend. */
export function dayParts(iso: string): { date: string; weekday: string; weekend: boolean } {
  const day = new Date(`${iso}T00:00:00Z`).getUTCDay();
  return { date: formatDay(iso).toUpperCase(), weekday: ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"][day], weekend: day === 0 || day === 6 };
}

/** The Start / End Date fields: "22/Jun/2026". */
export function fieldDate(iso: string): string {
  return iso ? formatDay(iso).replace(/ /g, "/") : "";
}

/** A click on the range calendar (Flatpickr's range mode): start, then the end in order, then anew. */
export function pickDay(picked: string[], day: string): string[] {
  if (picked.length !== 1) return [day];
  return [picked[0], day].sort();
}

/** The range picked: one day is that day at both ends. */
export function pickedRange(picked: string[]): { start: string; end: string } {
  return { start: picked[0] ?? "", end: picked[1] ?? picked[0] ?? "" };
}
