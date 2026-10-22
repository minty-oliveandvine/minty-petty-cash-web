/**
 * The rules of the Daily Closing's first stage, "Addition to Drawer" (Part 15.15b; Flask's
 * Opening section): the opening cash it adds up, where the starting cash came from, and the
 * negative-balance gate. Pure, so the stage page (components/closing/AdditionToDrawer.tsx) only
 * draws what this says.
 */

import { parseAmount } from "@minty/shared/money";

import type { OpeningPage } from "@/lib/opening";

const cents = (amount: number) => Math.round(amount * 100) / 100;

/** The day's opening cash: the starting cash plus the cash added (the field's shown text; empty adds nothing). */
export function openingCash(page: OpeningPage, additionText: string): number {
  return cents(page.starting_cash_balance + (parseAmount(additionText) ?? 0));
}

/**
 * Where the starting cash comes from - the server's rule (Minty `starting_cash_balance`): the
 * last submitted closing when there is one, else the opening balance set up in onboarding (the
 * draft's own), else nothing.
 */
export function startingSource(page: OpeningPage): "last-closing" | "setup" | "none" {
  if (page.yesterday_closing_balance !== 0) return "last-closing";
  return page.starting_cash_balance !== 0 ? "setup" : "none";
}

/**
 * The starting cash split into the drawer and the safebox - only when part of it sits in the
 * safebox (otherwise the split says nothing the starting cash does not).
 */
export function startingSplit(page: OpeningPage): { drawer: number; safebox: number } | null {
  if (startingSource(page) !== "last-closing" || page.safebox_balance === 0) return null;
  return { drawer: cents(page.yesterday_closing_balance - page.safebox_balance), safebox: page.safebox_balance };
}

/**
 * The business-rule gate (Part 15.9e) for cash below zero - Flask's "Fix Negative Balance":
 * - `last-closing`: the last closing ended below zero. The day cannot start from it whatever is
 *   added (Flask held the page on arrival), so the one way on is back to the launch page.
 * - `short`: the opening cash would be below zero; adding at least `addAtLeast` fixes it.
 */
export type NegativeGate =
  | { kind: "last-closing"; balance: number }
  | { kind: "short"; addAtLeast: number }
  | null;

export function negativeGate(page: OpeningPage, opening: number): NegativeGate {
  if (page.yesterday_closing_balance < 0) return { kind: "last-closing", balance: page.yesterday_closing_balance };
  if (opening < 0) return { kind: "short", addAtLeast: cents(-page.starting_cash_balance) };
  return null;
}
