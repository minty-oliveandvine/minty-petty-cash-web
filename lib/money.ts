import { formatAmount, formatMoney as sharedFormatMoney } from "@minty/shared/money";

/** What an amount carries in place of a currency code while the company has none (owner, 2026-10-21: never a "$"). */
export const NO_CURRENCY_NOTE = "(No currency selected)";

/**
 * An amount: the shared money rule (`@minty/shared/money`, owner 2026-10-21) - the company's ISO currency code, a
 * non-breaking space (so a line never splits them), then the number with two decimals and thousands separated -
 * `HKD 1,234.50`, the sign leading below zero (`-HKD 12.50`). With no currency yet it is `12.00 (No currency selected)`,
 * never Flask's "$". Extra decimals are cut, not rounded, and a non-number shows nothing. Amounts are plain text, never
 * coloured (Part 13).
 */
export function formatMoney(amount: number, currencyCode: string | null): string {
  if (typeof amount !== "number" || !Number.isFinite(amount)) return "";
  if (currencyCode?.trim()) return sharedFormatMoney(amount, currencyCode);
  const number = formatAmount(amount);
  return number ? `${number} ${NO_CURRENCY_NOTE}` : "";
}
