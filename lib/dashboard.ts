/**
 * The Petty Cash dashboard's rules - a faithful port of Flask's `entity_dashboard_v2.html`
 * (its inline JS), as pure functions over what `GET /home` answers (Minty
 * `blueprints/petty_cash_api/routes/home.py`). The page component only draws what these say.
 *
 * Kept from Flask: which days are clickable, the red "missing" days, the start-date rules and
 * their wording, the "Before You Start" deposit check, the six-step progress.
 * Changed on purpose: "today" is always the server's (Hong Kong) date - Flask mixed the
 * browser's, UTC's and Hong Kong's - and starting a report always runs the date rules (Flask
 * skipped them after a calendar click).
 */

import { addDays } from "@/lib/dates";
import type { WizardStep } from "@/lib/flaskPages";

export type PublishedDay = {
  id: string;
  closing_balance: number;
  bank_deposit: number;
  xero_integrated: boolean;
  submitter_first_name: string | null;
};

export type Home = {
  server_today: string;
  /** The company's approved members - Quick Actions' "N users". */
  user_count: number;
  currency_code: string | null;
  latest: {
    date: string | null;
    closing_balance: number;
    deposit: number;
    deposit_bank_name: string;
    deposit_bank_number: string;
    deposit_correction_missing_settings: string[];
    can_correct_deposit: boolean;
    submitter_first_name: string | null;
  };
  draft: {
    id: string;
    current_section: string | null;
    completed_sections: string[];
    last_edit_seconds: number;
  } | null;
  draft_date: string | null;
  published: Record<string, PublishedDay>;
  today_has_report: boolean;
  today_is_latest_report: boolean;
  xero_settings: { complete: boolean; missing: string[] };
  permissions: { read_only: boolean; correct_deposit: boolean };
};

/** First and last submitted days, or null when none. */
export function reportSpan(home: Home): { earliest: string; latest: string } | null {
  const days = Object.keys(home.published).sort();
  return days.length ? { earliest: days[0], latest: days[days.length - 1] } : null;
}

/** A day between the first report and today with no submitted report: red on the calendar. */
export function isMissing(home: Home, day: string): boolean {
  const span = reportSpan(home);
  return !!span && span.earliest <= day && day < home.server_today && !home.published[day];
}

/**
 * Whether a calendar day does anything when tapped (Flask's `isClickable`):
 * today; a submitted day; the day after the last submitted report; and, before any report,
 * a future day or a past day on or after the onboarding floor (the earliest draft).
 */
export function isClickable(home: Home, day: string): boolean {
  if (day === home.server_today) return true;
  if (home.published[day]) return true;
  const span = reportSpan(home);
  if (span) return day === addDays(span.latest, 1);
  if (day > home.server_today) return true;
  return !home.draft_date || day >= home.draft_date;
}

export type DayState = "today" | "submitted" | "missing" | "open" | "idle";

/** A day's look, first match wins - Flask's order: today, submitted, missing, clickable, the rest. */
export function dayState(home: Home, day: string): DayState {
  if (day === home.server_today) return "today";
  if (home.published[day]) return "submitted";
  if (isMissing(home, day)) return "missing";
  return isClickable(home, day) ? "open" : "idle";
}

/** Yesterday has no report although earlier days do: today's must wait. */
export function previousDayUnfinished(home: Home): boolean {
  const yesterday = addDays(home.server_today, -1);
  const span = reportSpan(home);
  return !!span && span.earliest <= yesterday && !home.published[yesterday];
}

export const PREVIOUS_DAY_FIRST = "The previous report needs finishing before today's. Shall we do that first?";

/**
 * Whether a new report may start on `day`, and if not, why - Flask's
 * `showStartNewReportMessage`, wording kept.
 */
export function startProblem(home: Home, day: string): string | null {
  const span = reportSpan(home);
  if (span) {
    const expected = addDays(span.latest, 1);
    if (expected > home.server_today) {
      return `Transaction date cannot be in the future. You can only create reports for dates up to ${home.server_today}.`;
    }
    if (day !== expected) {
      return `Transaction date must be ${expected}, the day after your last submitted report (${span.latest}).`;
    }
  } else if (home.draft_date && day < home.draft_date) {
    return `Transaction date must be on or after your onboarding date (${home.draft_date}).`;
  }
  if (day === home.server_today && previousDayUnfinished(home)) return PREVIOUS_DAY_FIRST;
  return null;
}

/** The submitted day before `day`, when it put cash in the bank: "Before You Start" asks about it. */
export function depositToConfirm(home: Home, day: string): { day: string; report: PublishedDay } | null {
  const before = addDays(day, -1);
  const report = home.published[before];
  return report && report.bank_deposit > 0 ? { day: before, report } : null;
}

/** "Current balance" for a day: its own closing balance, else the last one before it, else 0. */
export function balanceFor(home: Home, day: string): number {
  if (home.published[day]) return home.published[day].closing_balance;
  const before = Object.keys(home.published)
    .filter((d) => d < day)
    .sort();
  return before.length ? home.published[before[before.length - 1]].closing_balance : 0;
}

/** "5 mins" - the draft card's "Last edit … ago" (integer division, singular only for 1). */
export function lastEditText(seconds: number): string {
  const unit = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
  if (seconds < 60) return unit(seconds, "sec");
  if (seconds < 3600) return unit(Math.floor(seconds / 60), "min");
  if (seconds < 86400) return unit(Math.floor(seconds / 3600), "hour");
  return unit(Math.floor(seconds / 86400), "day");
}

/** The six steps of a daily report, in order, as the progress card labels them. */
export const STEPS: { key: WizardStep; label: string }[] = [
  { key: "opening", label: "Opening" },
  { key: "sales", label: "Sales" },
  { key: "expenses", label: "Expenses" },
  { key: "deposit", label: "Bank Deposit" },
  { key: "cash_count", label: "Cash Count" },
  { key: "ending", label: "Ending" },
];

export type StepState = "current" | "completed" | "next" | "locked";

/** Each step's state and whether it opens - Flask's `stepper.html`. */
export function stepStates(draft: NonNullable<Home["draft"]>): { key: WizardStep; label: string; state: StepState; open: boolean }[] {
  const done = new Set(draft.completed_sections);
  return STEPS.map((step, i) => {
    const previousDone = i > 0 && done.has(STEPS[i - 1].key);
    const state: StepState =
      step.key === draft.current_section ? "current" : done.has(step.key) ? "completed" : previousDone ? "next" : "locked";
    const open = i === 0 ? done.has("opening") || draft.current_section === "opening" : previousDone;
    return { ...step, state, open };
  });
}
