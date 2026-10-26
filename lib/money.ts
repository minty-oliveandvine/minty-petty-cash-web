/**
 * An amount on a Petty Cash page: the shared money rule (@minty/shared/money, owner 2026-10-21) -
 * the ISO code, a non-breaking space, the amount with its places ("HKD 1,234.50"). A company with
 * no currency gets no silent fallback (owner, 2026-10-22): never "$", never a bare number - the
 * amount says so, "1,234.50 (No currency selected)". Only old reports can show that: no report
 * starts without a currency (the dashboard's Setup Required; the API refuses the save).
 *
 * Display only - typing stays on @minty/shared/amountInput, reading amounts back on parseAmount.
 */

import { formatAmount, formatMoney } from "@minty/shared/money";

export const NO_CURRENCY = "(No currency selected)";

/** The amount for display, or "" when there is no usable number. */
export function money(
  value: string | number | null | undefined,
  code: string | null | undefined,
): string {
  if (code?.trim()) return formatMoney(value, code);
  const amount = formatAmount(value);
  return amount ? `${amount} ${NO_CURRENCY}` : "";
}
