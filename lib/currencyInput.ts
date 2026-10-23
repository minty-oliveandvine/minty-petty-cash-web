/**
 * Flask's money inputs (`static/js/currency.js`), the same on every report step: digits and one
 * point, at most 11 whole digits and 2 decimals; while typing the value is only cleaned, never
 * grouped (the caret stays put); on blur thousands are grouped and the value padded to 2 decimals;
 * an empty value stays empty so the placeholder shows.
 */

const MAX_INTEGER_DIGITS = 11;

/** The cleaned, ungrouped value - the input's `onChange`. */
export function sanitizeMoney(raw: string): string {
  const value = raw.replace(/[^\d.]/g, "");
  if (value === "") return "";
  const dot = value.indexOf(".");
  const whole = (dot === -1 ? value : value.slice(0, dot)).slice(0, MAX_INTEGER_DIGITS);
  if (dot === -1) return whole;
  return `${whole}.${value
    .slice(dot + 1)
    .replace(/\./g, "")
    .slice(0, 2)}`;
}

/** Grouped and padded - the input's `onBlur`, and how a saved amount is first shown. */
export function groupMoney(raw: string): string {
  const value = sanitizeMoney(raw);
  if (value === "") return "";
  const [whole, fraction = ""] = value.split(".");
  return `${(whole || "0").replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${fraction.padEnd(2, "0")}`;
}

/** A shown value as a number: commas stripped, empty or "-" is 0. */
export function parseMoney(value: string): number {
  const cleaned = value.replace(/,/g, "").trim();
  if (cleaned === "" || cleaned === "-") return 0;
  return Number.parseFloat(cleaned) || 0;
}
