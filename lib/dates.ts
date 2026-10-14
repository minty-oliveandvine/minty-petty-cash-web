/**
 * Report days are calendar dates, `YYYY-MM-DD`, and nothing else: no time, no zone. Arithmetic
 * and formatting happen in UTC on purpose, so a date never moves a day with the device's clock -
 * the Flask dashboard parsed `new Date("YYYY-MM-DD")` (UTC) and formatted it in local time, and
 * mixed the browser's, UTC's and Hong Kong's "today"; this app takes "today" from the server
 * (`server_today`, Hong Kong) only.
 */

const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
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

/** "Wed 14 Oct 2026" - Part 14's D MMM YYYY (D14-12) with its weekday, as Part 15 writes a day. */
export function formatWeekdayDay(iso: string): string {
  return `${formatWeekdayShort(iso)} ${parts(iso)[0]}`;
}

/** "Sun 4 Oct" - a day near enough to need no year (the gate banner's "Finish Sun 4 Oct first"). */
export function formatWeekdayShort(iso: string): string {
  const [, m, d] = parts(iso);
  return `${WEEKDAYS_SHORT[utc(iso).getUTCDay()]} ${d} ${MONTHS_SHORT[m - 1]}`;
}

/** "6:02 pm" - a moment's time on the device's clock. */
export function clockTime(moment: Date): string {
  const hour = moment.getHours();
  return `${hour % 12 || 12}:${String(moment.getMinutes()).padStart(2, "0")} ${hour < 12 ? "am" : "pm"}`;
}

/**
 * When an open report was last saved, from GET /home's `last_edit_seconds` and the device's
 * clock (Part 14 Saving status, "Saved 6:02 pm"): the time alone on the same day, else
 * "Sun 4 Oct, 6:02 pm" (and the year when it differs).
 */
export function savedText(lastEditSeconds: number, now: Date): string {
  const saved = new Date(now.getTime() - Math.max(0, lastEditSeconds) * 1000);
  const time = clockTime(saved);
  const sameDay =
    saved.getFullYear() === now.getFullYear() && saved.getMonth() === now.getMonth() && saved.getDate() === now.getDate();
  if (sameDay) return `Saved ${time}`;
  const day = `${WEEKDAYS_SHORT[saved.getDay()]} ${saved.getDate()} ${MONTHS_SHORT[saved.getMonth()]}`;
  return `Saved ${day}${saved.getFullYear() === now.getFullYear() ? "" : ` ${saved.getFullYear()}`}, ${time}`;
}
