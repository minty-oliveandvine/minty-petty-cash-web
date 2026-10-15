/**
 * The Petty Cash launch page's rules (Part 15.6a Action Dashboard), as pure functions over what
 * `GET /home` answers (Minty `blueprints/petty_cash_api/routes/home.py`). The page component
 * only draws what these say; the five stages are lib/dailyClosing.ts.
 *
 * Kept from Flask's `entity_dashboard_v2.html` (its inline JS): the start-date rules and their
 * wording, and the "Before You Start" deposit check.
 * Changed on purpose: "today" is always the server's (Hong Kong) date - Flask mixed the
 * browser's, UTC's and Hong Kong's - and starting a report always runs the date rules.
 */

import { addDays } from "@/lib/dates";

export type PublishedDay = {
  id: string;
  closing_balance: number;
  bank_deposit: number;
  xero_integrated: boolean;
  submitter_first_name: string | null;
};

export type Home = {
  server_today: string;
  /** The company's approved members (unused by the launch page). */
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

/**
 * What the launch page's one primary card is about (Part 15.6 states):
 * - `first-use`: nothing submitted and nothing open - the first-use empty state (15.11a);
 * - `in-progress`: an open report (the newest draft) - its day is `draft_date`, the day Flask's
 *   own Continue used;
 * - `done`: today is submitted (`reportId` opens its Daily Report);
 * - `not-started`: today, not begun.
 */
export type Launch =
  | { kind: "first-use"; day: string }
  | { kind: "in-progress"; day: string; draft: NonNullable<Home["draft"]> }
  | { kind: "done"; day: string; reportId: string }
  | { kind: "not-started"; day: string };

export function launchState(home: Home): Launch {
  const today = home.server_today;
  if (home.draft) return { kind: "in-progress", day: home.draft_date ?? today, draft: home.draft };
  if (home.published[today]) return { kind: "done", day: today, reportId: home.published[today].id };
  if (!reportSpan(home)) return { kind: "first-use", day: today };
  return { kind: "not-started", day: today };
}

/**
 * The business-rule gate (Part 15.9e, 15.15h): yesterday has no submitted report although earlier
 * days do, so today's closing waits. Answers the day to finish first - the day after the last
 * submitted report, the only day `startProblem` lets a report start on - or null.
 */
export function gateDay(home: Home): string | null {
  const span = reportSpan(home);
  if (!span || !previousDayUnfinished(home)) return null;
  const expected = addDays(span.latest, 1);
  return expected < home.server_today ? expected : null;
}

/** The newest submitted reports, newest first - the launch page's "Recent reports". */
export function recentReports(home: Home, count = 3): { day: string; report: PublishedDay }[] {
  return Object.keys(home.published)
    .sort()
    .reverse()
    .slice(0, count)
    .map((day) => ({ day, report: home.published[day] }));
}

/** The home greeting's opening by the device's hour (0-23). */
export function greetingFor(hour: number): string {
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

/** The first word of a person's name, for the greeting - null when there is none. */
export function firstName(name: string | null | undefined): string | null {
  const first = (name ?? "").trim().split(/\s+/)[0];
  return first || null;
}
