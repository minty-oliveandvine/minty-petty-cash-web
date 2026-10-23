/**
 * Report days are calendar dates, `YYYY-MM-DD`, and nothing else: no time, no zone. Arithmetic
 * and formatting happen in UTC on purpose, so a date never moves a day with the device's clock -
 * the Flask dashboard parsed `new Date("YYYY-MM-DD")` (UTC) and formatted it in local time, and
 * mixed the browser's, UTC's and Hong Kong's "today"; this app takes "today" from the server
 * (`server_today`, Hong Kong) only.
 */

const MONTHS_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];
const MONTHS_LONG = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const WEEKDAYS_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function parts(iso: string): [number, number, number] {
  const [y, m, d] = iso.split("-").map(Number);
  return [y, m, d];
}

function utc(iso: string): Date {
  const [y, m, d] = parts(iso);
  return new Date(Date.UTC(y, m - 1, d));
}

function toIso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDays(iso: string, days: number): string {
  const date = utc(iso);
  date.setUTCDate(date.getUTCDate() + days);
  return toIso(date);
}

/** "14 Oct 2026" - Flask's `%d %b %Y`. */
export function formatDay(iso: string): string {
  const [y, m, d] = parts(iso);
  return `${String(d).padStart(2, "0")} ${MONTHS_SHORT[m - 1]} ${y}`;
}

/** "14 Oct 2026 Wed" - Flask's `%d %b %Y %a`. */
export function formatDayWithWeekday(iso: string): string {
  return `${formatDay(iso)} ${WEEKDAYS_SHORT[utc(iso).getUTCDay()]}`;
}

/** "October 2026". */
export function formatMonth(year: number, month: number): string {
  return `${MONTHS_LONG[month]} ${year}`;
}

export const WEEKDAY_HEADINGS = WEEKDAYS_SHORT;

/** `{year, month}` (month 0-11) of a date. */
export function monthOf(iso: string): { year: number; month: number } {
  const [y, m] = parts(iso);
  return { year: y, month: m - 1 };
}

export function shiftMonth(
  year: number,
  month: number,
  by: number,
): { year: number; month: number } {
  const date = new Date(Date.UTC(year, month + by, 1));
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() };
}

/**
 * The 42 days (six weeks, Sunday first) a month's calendar shows, as `{iso, inMonth}` - the
 * Flask calendar's grid: the leading and trailing days of the neighbouring months are shown and
 * do nothing.
 */
export function monthGrid(year: number, month: number): { iso: string; inMonth: boolean }[] {
  const first = new Date(Date.UTC(year, month, 1));
  const start = new Date(first);
  start.setUTCDate(1 - first.getUTCDay());
  return Array.from({ length: 42 }, (_, i) => {
    const day = new Date(start);
    day.setUTCDate(start.getUTCDate() + i);
    return { iso: toIso(day), inMonth: day.getUTCMonth() === month };
  });
}
