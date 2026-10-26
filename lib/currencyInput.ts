/**
 * A shown money value back as a number for the API. Typing and grouping are
 * `@minty/shared/amountInput`'s (commas as you type, places padded on blur; owner, 2026-10-26);
 * this app's own rule is only that an empty field is 0.
 */

/** A shown value as a number: commas stripped, empty or "-" is 0. */
export function parseMoney(value: string): number {
  const cleaned = value.replace(/,/g, "").trim();
  if (cleaned === "" || cleaned === "-") return 0;
  return Number.parseFloat(cleaned) || 0;
}
