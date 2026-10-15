/**
 * The Daily Closing's first stage, "Addition to Drawer" (Flask's Opening section): what
 * `GET /reports/opening` answers (Minty `petty_cash_api/routes/opening.py`). Flask's header date
 * pill is not carried over - Part 15.1 retires it for the Workflow header's line.
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

/** What `PUT /reports/opening` answers on a save. */
export type OpeningSaved = {
  draft_id: string;
  transaction_date: string;
  current_section: string | null;
  completed_sections: string[];
  next: "sales" | "dashboard";
};
