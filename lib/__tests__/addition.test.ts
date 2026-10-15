// The "Addition to Drawer" stage's rules (../addition.ts): the opening cash, where the starting
// cash came from, and the negative-balance gate.

import { describe, expect, it } from "vitest";

import { negativeGate, openingCash, signedMoney, startingSource, startingSplit } from "@/lib/addition";
import type { OpeningPage } from "@/lib/opening";

function page(over: Partial<OpeningPage> = {}): OpeningPage {
  return {
    transaction_date: "2026-10-13",
    currency_code: "HKD",
    draft: null,
    starting_cash_balance: 1200,
    yesterday_closing_balance: 1200,
    safebox_balance: 0,
    cash_addition: null,
    withdrawal: "personal",
    ...over,
  };
}

describe("the opening cash", () => {
  it("is the starting cash plus what the field shows, to the cent", () => {
    expect(openingCash(page(), "")).toBe(1200);
    expect(openingCash(page(), "1,250.55")).toBe(2450.55);
    expect(openingCash(page({ starting_cash_balance: 0.1, yesterday_closing_balance: 0.1 }), "0.2")).toBe(0.3);
  });
});

describe("the starting cash", () => {
  it("comes from the last closing when there is one", () => {
    expect(startingSource(page())).toBe("last-closing");
    expect(startingSource(page({ starting_cash_balance: -50, yesterday_closing_balance: -50 }))).toBe("last-closing");
  });

  it("else from the opening balance set up in onboarding, else from nothing", () => {
    expect(startingSource(page({ yesterday_closing_balance: 0, starting_cash_balance: 900 }))).toBe("setup");
    expect(startingSource(page({ yesterday_closing_balance: 0, starting_cash_balance: 0 }))).toBe("none");
  });

  it("splits into drawer and safebox only when some of it is in the safebox", () => {
    expect(startingSplit(page())).toBeNull();
    expect(startingSplit(page({ safebox_balance: 200 }))).toEqual({ drawer: 1000, safebox: 200 });
    expect(startingSplit(page({ yesterday_closing_balance: 0, starting_cash_balance: 900, safebox_balance: 200 }))).toBeNull();
  });
});

describe("the negative-balance gate", () => {
  it("is shut when the last closing ended below zero, whatever is added", () => {
    const p = page({ starting_cash_balance: -120, yesterday_closing_balance: -120 });
    expect(negativeGate(p, openingCash(p, "500"))).toEqual({ kind: "last-closing", balance: -120 });
  });

  it("asks for the shortfall when the opening cash would be below zero", () => {
    const p = page({ starting_cash_balance: -120.5, yesterday_closing_balance: 0 });
    expect(negativeGate(p, openingCash(p, "20"))).toEqual({ kind: "short", addAtLeast: 120.5 });
    expect(negativeGate(p, openingCash(p, "120.50"))).toBeNull();
  });

  it("is open otherwise", () => {
    expect(negativeGate(page(), 1200)).toBeNull();
    expect(negativeGate(page({ starting_cash_balance: 0, yesterday_closing_balance: 0 }), 0)).toBeNull();
  });
});

describe("an amount below zero", () => {
  it("is written as plain text with a minus before the currency", () => {
    expect(signedMoney(-120, "HKD")).toBe("-HKD120.00");
    expect(signedMoney(1250.5, "HKD")).toBe("HKD1,250.50");
    expect(signedMoney(0, null)).toBe("$0.00");
  });
});
