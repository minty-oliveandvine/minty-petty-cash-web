/**
 * The Opening step's read: what `GET /reports/opening` answers (Minty
 * `petty_cash_api/routes/opening.py`), and the header's date pill.
 */

export type OpeningPage = {
  /** The day the report is for. */
  transaction_date: string;
  /** The company's ISO currency code; every amount is written with it. */
  currency_code: string | null;
  draft: {
    id: string;
    status: string;
    current_section: string | null;
    completed_sections: string[];
    xero_integrated: boolean;
    publishing_status: string | null;
  } | null;
  /** Yesterday's closing, else the draft's own (onboarding-seeded) opening, else 0. */
  starting_cash_balance: number;
  yesterday_closing_balance: number;
  safebox_balance: number;
  cash_addition: number | null;
  withdrawal: "company" | "personal";
};

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

/** "14 OCT" - Flask's `strftime('%d %b').upper()`. */
export function datePill(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${d} ${MONTHS[Number(m) - 1]}`;
}
