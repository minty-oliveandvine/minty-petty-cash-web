/** What an amount carries in place of a currency code while the company has none (owner, 2026-10-21: never a "$"). */
export const NO_CURRENCY_NOTE = "(No currency selected)";

/**
 * An amount: the company's ISO currency code, a non-breaking space (so a line never splits them), then the number with two
 * decimals and thousands separated - `HKD 1,234.50` (Flask ran them together). With no currency yet it is
 * `12.00 (No currency selected)`, never Flask's "$". Extra decimals are cut, not rounded (owner, 2026-10-21), and a
 * non-number shows nothing. Amounts are plain text, never coloured (Part 13).
 */
export function formatMoney(amount: number, currencyCode: string | null): string {
  if (typeof amount !== "number" || !Number.isFinite(amount)) return "";
  // ten places first, so float noise (0.3 - 0.1 = 0.19999...) is not a decimal to cut
  const [whole, fraction] = Math.abs(amount).toFixed(10).split(".");
  const cut = fraction.slice(0, 2);
  const sign = amount < 0 && /[1-9]/.test(whole + cut) ? "-" : "";
  const number = `${sign}${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${cut}`;
  return currencyCode ? `${currencyCode}\u00a0${number}` : `${number} ${NO_CURRENCY_NOTE}`;
}
