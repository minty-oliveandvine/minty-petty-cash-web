/**
 * An amount as the Flask pages show it: the company's ISO currency code straight before the
 * number, two decimals, thousands separated - `HKD1,234.50`. `"$"` when the company has no
 * currency yet (Flask's default). Amounts are plain text, never coloured (Part 13).
 */
export function formatMoney(amount: number, currencyCode: string | null): string {
  const number = (Number.isFinite(amount) ? amount : 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${currencyCode || "$"}${number}`;
}
