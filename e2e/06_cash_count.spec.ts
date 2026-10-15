// The Daily Closing's Cash Count stage (components/closing/CashCount.tsx, Part 15.9 / 15.15d), with
// Bank Deposit folded in as its first section (D15-05), against a STUBBED Petty Cash API. Needs
// only `npm run dev`. Addition to Drawer, Expenses and Close are this app's own stages (stubbed
// quietly); Flask's pages (by the company's full id) are caught, so nothing leaves the app.
// Refusals and warnings are inline alerts or Page banners, never toasts.

import { expect, test, type Page, type Route } from "@playwright/test";

import { companyRef } from "./companyRef";
import { expectNoHorizontalScroll, mintModuleToken } from "./helpers";

const ENTITY = "3d65f186-5ba1-4bf7-a1b0-cc64a113eb5c";
const NAME = "E2E Petty Cash Shop";
const BASE = `/entity/${companyRef(ENTITY, NAME)}/petty-cash`;
const DAY = "2026-10-13";
const STAGE_URL = `${BASE}/reports/new/cash-count?transaction_date=${DAY}`;
const EXPENSES_URL = `${BASE}/reports/new/expense?transaction_date=${DAY}`;
const ENDING = new RegExp(`${BASE}/reports/new/ending\\?transaction_date=${DAY}$`);

type Json = Record<string, unknown>;

const DRAFT = {
  id: "d",
  status: "draft",
  current_section: "deposit",
  completed_sections: ["opening", "sales", "expenses"],
  xero_integrated: false,
  publishing_status: "unpublished",
};

const DENOMINATIONS = [
  { id: "n500", value: 500, kind: "note", count: 0 },
  { id: "n100", value: 100, kind: "note", count: 0 },
  { id: "c5", value: 5, kind: "coin", count: 0 },
  { id: "c050", value: 0.5, kind: "coin", count: 0 },
];

/** Opening 500 + added 100 + cash sales 820.50 - expenses 120 = 1,300.50 on hand. */
function cashAnswer(over: Json = {}): Json {
  return {
    transaction_date: DAY,
    currency_code: "HKD",
    draft: DRAFT,
    opening_balance: 500,
    cash_addition: 100,
    cash_sales: 820.5,
    expenses: 120,
    bank_deposit: 0,
    cash_on_hand: 1300.5,
    expected_cash: 1300.5,
    denominations: DENOMINATIONS,
    safe_box_balance: 0,
    discrepancy: { amount: 0, kind: "none", reason: "" },
    ...over,
  };
}

const SAVED = {
  draft_id: "d",
  transaction_date: DAY,
  current_section: "ending",
  completed_sections: ["opening", "sales", "expenses", "deposit", "cash_count"],
  next: "ending",
  discrepancy: { amount: 0, kind: "none" },
};

const SAVED_DRAFT = { ...DRAFT, current_section: "ending", completed_sections: SAVED.completed_sections };
const OPENING = { transaction_date: DAY, currency_code: "HKD", draft: DRAFT, starting_cash_balance: 500, yesterday_closing_balance: 500, safebox_balance: 0, cash_addition: null, withdrawal: "personal" };
const EXPENSES = { transaction_date: DAY, currency_code: "HKD", draft: { ...DRAFT, current_section: "expenses", completed_sections: ["opening", "sales"] }, lines: [], total: 0, suppliers: [], accounts: [], permissions: { create_supplier: false } };

function homeAnswer(over: Json = {}): Json {
  return {
    server_today: "2026-10-14",
    user_count: 1,
    currency_code: "HKD",
    latest: { date: "2026-10-12", closing_balance: 500, deposit: 0, deposit_bank_name: "No deposit", deposit_bank_number: "", deposit_correction_missing_settings: [], can_correct_deposit: true, submitter_first_name: "Olive" },
    draft: null,
    draft_date: null,
    published: { "2026-10-12": { id: "r", closing_balance: 500, bank_deposit: 0, xero_integrated: true, submitter_first_name: "Olive" } },
    today_has_report: false,
    today_is_latest_report: false,
    xero_settings: { complete: true, missing: [] },
    permissions: { read_only: false, correct_deposit: true },
    ...over,
  };
}

type Setup = { onSave?: (body: Json, route: Route) => Promise<void>; read?: (route: Route) => Promise<void>; home?: Json };

/** Every PUT the stage sent. */
async function stub(page: Page, answer: Json, { onSave, read, home }: Setup = {}): Promise<Json[]> {
  const saves: Json[] = [];
  await page.route("**/api/petty-cash/v1/companies/*/reports/cash-count**", async (route) => {
    if (route.request().method() === "PUT") {
      const body = route.request().postDataJSON() as Json;
      saves.push(body);
      if (onSave) await onSave(body, route);
      else await route.fulfill({ json: SAVED });
      return;
    }
    if (read) await read(route);
    else await route.fulfill({ json: answer });
  });
  await page.route("**/api/petty-cash/v1/companies/*/reports/opening**", (route) => route.fulfill({ json: OPENING }));
  await page.route("**/api/petty-cash/v1/companies/*/reports/expenses**", async (route) => {
    if (route.request().method() === "PUT") {
      await route.fulfill({ json: { draft_id: "d", transaction_date: DAY, current_section: "deposit", completed_sections: ["opening", "sales", "expenses"], next: "deposit" } });
      return;
    }
    await route.fulfill({ json: EXPENSES });
  });
  // This app's own Close stage (e2e/07_close.spec.ts covers it): a quiet stub.
  await page.route("**/api/petty-cash/v1/companies/*/reports/close**", (route) =>
    route.fulfill({
      json: {
        transaction_date: DAY, currency_code: "HKD", draft: SAVED_DRAFT, opening_balance: 500, cash_addition: 100,
        sales: { methods: [], cash: 820.5, total: 820.5, yesterday_total: null, history: [] }, expenses: { lines: [], total: 120 },
        cash: { bank_deposit: 0, expected: 1300.5, counted: 1300.5, safe_box: 0, difference: { amount: 0, kind: "none", reason: "" } }, closing_balance: 1300.5, problem: null,
      },
    }),
  );
  await page.route("**/api/petty-cash/v1/companies/*/home", (route) => route.fulfill({ json: home ?? homeAnswer() }));
  await page.route("**/api/me/profile**", (route) => route.fulfill({ json: { user: { name: "Tess Tester", initials: "TT" } } }));
  // Flask's pages (Close onwards, by the company's full id): caught.
  await page.route(/\/entity\/[0-9a-f-]{36}\/petty-cash\/reports(?:[/?]|$)/, (route) =>
    route.fulfill({ contentType: "text/html", body: "<title>Flask page</title><p>Flask page</p>" }),
  );
  return saves;
}

async function arrive(page: Page, next: string) {
  const token = mintModuleToken({ secret: "stub", userId: "u", entityId: ENTITY, entityName: NAME });
  await page.goto(`/landing?${new URLSearchParams({ token, entity_id: ENTITY, entity_name: NAME, next })}`);
}

async function openWith(page: Page, answer: Json, setup: Setup = {}): Promise<Json[]> {
  const saves = await stub(page, answer, setup);
  await arrive(page, STAGE_URL);
  await expect(page.getByRole("heading", { level: 1, name: "Cash Count" })).toBeVisible();
  await expect(page.getByRole("status", { name: "Loading" })).toHaveCount(0);
  return saves;
}

const deposit = (page: Page) => page.getByRole("textbox", { name: "Cash taken for bank deposit in HKD", exact: true });
const safebox = (page: Page) => page.getByRole("textbox", { name: "Cash in the safebox in HKD", exact: true });
const reason = (page: Page) => page.getByRole("textbox", { name: /Reason for the difference/ });
const count = (page: Page, label: string) => page.getByRole("textbox", { name: `Number of ${label}`, exact: true });
const stages = (page: Page) => page.getByRole("list", { name: "Daily Closing stages" });
const check = (page: Page) => page.getByRole("region", { name: "Check" });
/** A Check / Description row's value by its term. */
const value = (page: Page, term: string) => page.locator("div, dl").filter({ has: page.locator("dt", { hasText: new RegExp(`^${term}$`) }) }).last().locator("dd").first();

test("the deposit first, then the drawer by notes and coins, the safebox and the Check block, in the Workflow header", async ({ page }) => {
  await openWith(page, cashAnswer());
  await expect(page.getByText("Daily Closing · Tue 13 Oct 2026")).toBeVisible();
  await expect(page.getByText("Draft", { exact: true })).toHaveAttribute("data-tone", "neutral");
  await expect(stages(page).locator('[aria-current="step"]')).toContainText("Cash Count, current step");
  // the done stages are this app's own pages; Close does not open from here
  await expect(stages(page).getByRole("link", { name: "Expenses, done" })).toHaveAttribute("href", EXPENSES_URL);
  await expect(stages(page).getByRole("link")).toHaveCount(3);

  await expect(page.getByRole("heading", { level: 2 })).toHaveText(["Bank deposit", "Cash in the drawer", "Cash in the safebox", "Check"]);
  await expect(value(page, "Cash on hand")).toHaveText("HKD1,300.50");
  await expect(deposit(page)).toHaveAttribute("inputmode", "decimal");
  await expect(page.getByText("Optional. Up to HKD1,300.50, the cash on hand.")).toBeVisible();
  await expect(page.getByRole("group", { name: "Notes" }).getByRole("textbox")).toHaveCount(2);
  await expect(page.getByRole("group", { name: "Coins" }).getByRole("textbox")).toHaveCount(2);
  for (const label of ["HKD500 notes", "HKD100 notes", "HKD5 coins", "HKD0.50 coins"]) {
    await expect(count(page, label)).toHaveAttribute("inputmode", "numeric");
    await expect(count(page, label)).toHaveValue("");
  }
  await expect(safebox(page)).toHaveAttribute("inputmode", "decimal");
  await expect(value(page, "Expected in drawer")).toHaveText("HKD1,300.50");
  await expect(value(page, "Counted")).toHaveText("HKD0.00");
  await expect(value(page, "Difference")).toHaveText("HKD1,300.50 short");
  // nothing typed yet: nothing red, and the reason waits for a refused Save & Next
  await expect(page.getByRole("main").getByRole("alert")).toHaveCount(0);
  await expect(reason(page)).toHaveAttribute("aria-required", "true");
  await expect(reason(page)).not.toHaveAttribute("aria-invalid", "true");
  await expectNoHorizontalScroll(page);
});

test("the deposit moves the expected cash as it is typed, and above the cash on hand says the limit at once", async ({ page }) => {
  await openWith(page, cashAnswer());
  await deposit(page).fill("300.25");
  await expect(value(page, "Expected in drawer")).toHaveText("HKD1,000.25");
  await expect(page.getByRole("main").getByRole("alert")).toHaveCount(0);

  await deposit(page).fill("1300.51");
  const why = "The deposit can't be more than the cash on hand. Enter HKD1,300.50 or less.";
  await expect(page.getByRole("alert").filter({ hasText: why })).toBeVisible();
  await expect(deposit(page)).toHaveAttribute("aria-invalid", "true");
  await expect(value(page, "Expected in drawer")).toHaveText("-HKD0.01");

  await deposit(page).fill("1300.5");
  await expect(page.getByText(why)).toHaveCount(0);
  await expect(value(page, "Expected in drawer")).toHaveText("HKD0.00");
  await deposit(page).blur();
  await expect(deposit(page)).toHaveValue("1,300.50");
});

test("counting by notes and coins - a 0.50 coin included - and the Check block: short, over, none, to the cent", async ({ page }) => {
  await openWith(page, cashAnswer());
  await count(page, "HKD500 notes").fill("2");
  await count(page, "HKD100 notes").fill("3");
  await count(page, "HKD0.50 coins").fill("1a.");
  await expect(count(page, "HKD0.50 coins")).toHaveValue("1");
  const coinRow = page.getByRole("group", { name: "Coins" });
  await expect(coinRow).toContainText("HKD0.50");
  await expect(value(page, "Drawer total")).toHaveText("HKD1,300.50");
  await expect(value(page, "Counted")).toHaveText("HKD1,300.50");
  await expect(value(page, "Difference")).toHaveText("None");
  await expect(check(page).getByRole("status")).toHaveCount(0);
  await expect(reason(page)).toHaveCount(0);

  // one cent over, through the safebox
  await safebox(page).fill("0.01");
  await expect(value(page, "Counted")).toHaveText("HKD1,300.51");
  await expect(value(page, "Difference")).toHaveText("HKD0.01 over");
  await expect(check(page).getByRole("status").filter({ hasText: "The count is HKD0.01 over" })).toHaveAttribute("data-tone", "warning");

  // one cent short: the drawer without the coin, the safebox 0.49
  await safebox(page).fill("");
  await count(page, "HKD0.50 coins").fill("");
  await expect(value(page, "Difference")).toHaveText("HKD0.50 short");
  await safebox(page).fill("0.49");
  await expect(value(page, "Difference")).toHaveText("HKD0.01 short");
  await expect(check(page).getByRole("status").filter({ hasText: "The count is HKD0.01 short" })).toBeVisible();
  // and the deposit moves the expected cash, so the difference with it
  await deposit(page).fill("0.01");
  await expect(value(page, "Expected in drawer")).toHaveText("HKD1,300.49");
  await expect(value(page, "Difference")).toHaveText("None");
  // amounts are words and plain text, never coloured
  await expect(value(page, "Difference")).toHaveClass(/text-text-primary/);
});

test("a difference needs its reason on Save & Next - nothing is sent until it has one; the PUT carries the deposit and every count", async ({ page }) => {
  const saves = await openWith(page, cashAnswer());
  await deposit(page).fill("300");
  await count(page, "HKD500 notes").fill("2");
  await expect(value(page, "Expected in drawer")).toHaveText("HKD1,000.50");
  await expect(value(page, "Difference")).toHaveText("HKD0.50 short");

  await page.getByRole("button", { name: "Save & Next" }).click();
  const why = "The count is HKD0.50 short. Add the reason to continue.";
  await expect(page.getByRole("alert").filter({ hasText: why })).toBeVisible();
  await expect(reason(page)).toHaveAttribute("aria-invalid", "true");
  // one problem: its field takes the focus, and no summary
  await expect(reason(page)).toBeFocused();
  await expect(page.getByText("details need a look")).toHaveCount(0);
  expect(saves).toEqual([]);

  await reason(page).fill("Change given twice");
  await expect(page.getByText(why)).toHaveCount(0);
  await expect(page.getByText("So the reviewer knows what happened. 18 of 300 characters.")).toBeVisible();
  await page.getByRole("button", { name: "Save & Next" }).click();

  // Close, this app's own stage since Wave 2e
  await expect(page).toHaveURL(ENDING);
  await expect(page.getByRole("heading", { level: 1, name: "Close" })).toBeVisible();
  expect(saves).toEqual([
    {
      transaction_date: DAY,
      bank_deposit: 300,
      counts: { n500: 2, n100: 0, c5: 0, c050: 0 },
      safe_box_balance: 0,
      discrepancy_reason: "Change given twice",
      action: "next",
    },
  ]);
});

test("Save & Exit keeps a difference without a reason and goes back to the launch page", async ({ page }) => {
  const saves = await openWith(page, cashAnswer({ bank_deposit: 300, denominations: DENOMINATIONS.map((d) => (d.id === "n500" ? { ...d, count: 2 } : d)) }), {
    onSave: async (_body, route) => {
      await route.fulfill({ json: { ...SAVED, current_section: "cash_count", next: "dashboard", discrepancy: { amount: -0.5, kind: "short" } } });
    },
  });
  // a draft's values come back: the deposit grouped, the saved count
  await expect(deposit(page)).toHaveValue("300.00");
  await expect(count(page, "HKD500 notes")).toHaveValue("2");
  await expect(value(page, "Difference")).toHaveText("HKD0.50 short");
  await page.getByRole("button", { name: "Save & Exit" }).click();
  await expect(page).toHaveURL(new RegExp(`${BASE}$`));
  await expect(page.getByRole("heading", { level: 1, name: "Petty Cash" })).toBeVisible();
  expect(saves).toEqual([
    { transaction_date: DAY, bank_deposit: 300, counts: { n500: 2, n100: 0, c5: 0, c050: 0 }, safe_box_balance: 0, discrepancy_reason: "", action: "exit" },
  ]);
});

test("Enter in a count is Save & Next; a count with no difference goes on with no reason", async ({ page }) => {
  const saves = await openWith(page, cashAnswer());
  await count(page, "HKD500 notes").fill("2");
  await count(page, "HKD100 notes").fill("3");
  await count(page, "HKD0.50 coins").fill("1");
  await count(page, "HKD0.50 coins").press("Enter");
  await expect(page).toHaveURL(ENDING);
  expect(saves).toMatchObject([{ bank_deposit: 0, counts: { n500: 2, n100: 3, c5: 0, c050: 1 }, discrepancy_reason: "", action: "next" }]);
});

test("two problems on a refused Save & Next show the error summary, which takes the focus and links to each field", async ({ page }) => {
  const saves = await openWith(page, cashAnswer());
  await deposit(page).fill("2000");
  await page.getByRole("button", { name: "Save & Next" }).click();
  const summary = page.getByRole("alert").filter({ hasText: "2 details need a look" });
  await expect(summary).toBeFocused();
  await summary.getByRole("link", { name: /Add the reason to continue/ }).click();
  await expect(reason(page)).toBeFocused();
  expect(saves).toEqual([]);
});

test("a count above a million says so as typed; the API's 422 shows on the field it names", async ({ page }) => {
  const why = "The deposit can't be more than the cash on hand. Enter HKD1,200.00 or less.";
  await openWith(page, cashAnswer(), {
    onSave: async (body, route) => {
      if ((body.counts as Json).n100 === 9) await route.fulfill({ status: 422, json: { error: "Enter each count as a whole number of 0 or more.", field: "n100" } });
      else await route.fulfill({ status: 422, json: { error: why, field: "bank_deposit" } });
    },
  });
  await count(page, "HKD5 coins").fill("1000001");
  await expect(page.getByRole("alert").filter({ hasText: "The count is 1,000,001. Enter 1,000,000 or fewer." })).toBeVisible();
  await count(page, "HKD5 coins").fill("260");
  await expect(page.getByRole("main").getByRole("alert")).toHaveCount(0);

  await deposit(page).fill("1250");
  await page.getByRole("button", { name: "Save & Exit" }).click();
  await expect(page.getByRole("alert").filter({ hasText: why })).toBeVisible();
  await expect(deposit(page)).toHaveAttribute("aria-invalid", "true");
  await expect(deposit(page)).toBeFocused();
  await expect(page).toHaveURL(/\/reports\/new\/cash-count\?/);
  await expect(page.getByRole("button", { name: "Save & Exit" })).toBeEnabled();
  // changing the field clears the API's sentence
  await deposit(page).fill("1200");
  await expect(page.getByText(why)).toHaveCount(0);

  await count(page, "HKD100 notes").fill("9");
  await page.getByRole("button", { name: "Save & Exit" }).click();
  await expect(count(page, "HKD100 notes")).toHaveAttribute("aria-invalid", "true");
  await expect(count(page, "HKD100 notes")).toBeFocused();
});

test("any other refusal stays on the stage, inline, and the actions come back", async ({ page }) => {
  const why = "This report isn't a draft anymore, so its cash can't change here.";
  await openWith(page, cashAnswer(), { onSave: (_body, route) => route.fulfill({ status: 409, json: { error: why } }) });
  await page.getByRole("button", { name: "Save & Exit" }).click();
  await expect(page.getByRole("alert").filter({ hasText: why })).toHaveAttribute("data-tone", "danger");
  await expect(page.getByRole("button", { name: "Save & Next" })).toBeEnabled();
  await expect(page.locator("[data-toast-type]")).toHaveCount(0);
});

test("cash on hand below zero is a gate: the rule, the reason and one way on, with nothing to type", async ({ page }) => {
  await openWith(page, cashAnswer({ cash_sales: 0, expenses: 620, cash_on_hand: -20, expected_cash: -20 }));
  const gate = page.getByRole("status").filter({ hasText: "The cash on hand is below zero" });
  await expect(gate).toHaveAttribute("data-tone", "warning");
  await expect(gate).toContainText("Opening cash HKD600.00 plus cash sales HKD0.00, less expenses HKD620.00, comes to -HKD20.00");
  await expect(page.getByRole("textbox")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Save & Next" })).toHaveCount(0);
  await gate.getByRole("link", { name: "Go to Expenses" }).click();
  await expect(page).toHaveURL(EXPENSES_URL);
  await expect(page.getByRole("heading", { level: 1, name: "Expenses" })).toBeVisible();
});

test("no draft for the day: the stage sends the person to Addition to Drawer, which says why, once", async ({ page }) => {
  const why = "I don't see a draft yet - let's start with the opening entry.";
  await stub(page, cashAnswer(), { read: (route) => route.fulfill({ status: 409, json: { error: why, to: "opening" } }) });
  await arrive(page, STAGE_URL);
  await expect(page).toHaveURL(new RegExp(`${BASE}/reports/new/opening\\?transaction_date=${DAY}$`));
  await expect(page.getByRole("heading", { level: 1, name: "Addition to Drawer" })).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: why })).toHaveAttribute("data-tone", "warning");
});

test("unsaved changes hold the stage links, with a way to leave anyway", async ({ page }) => {
  await openWith(page, cashAnswer());
  await count(page, "HKD5 coins").fill("1");
  await stages(page).getByRole("link", { name: "Expenses, done" }).click();
  const warning = page.locator("[data-tone=warning]").filter({ hasText: "Your changes to this stage are not saved yet." });
  await expect(warning).toBeVisible();
  await expect(page).toHaveURL(/\/reports\/new\/cash-count\?/);
  await warning.getByRole("button", { name: "Leave without saving" }).click();
  await expect(page).toHaveURL(EXPENSES_URL);
});

test("Expenses' Save & Next opens this stage without leaving the app", async ({ page }) => {
  await stub(page, cashAnswer());
  await arrive(page, EXPENSES_URL);
  await expect(page.getByRole("heading", { level: 1, name: "Expenses" })).toBeVisible();
  await expect(page.getByRole("status", { name: "Loading" })).toHaveCount(0);
  // a marker on the window survives only a client-side navigation
  await page.evaluate(() => Object.assign(window, { __stayed: true }));
  await page.getByRole("button", { name: "Save & Next" }).click();
  await expect(page).toHaveURL(STAGE_URL);
  await expect(page.getByRole("heading", { level: 1, name: "Cash Count" })).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { __stayed?: boolean }).__stayed)).toBe(true);
});

for (const section of ["deposit", "cash_count"]) {
  test(`the launch page's Continue opens this stage when the report is on ${section}`, async ({ page }) => {
    const completed = section === "deposit" ? ["opening", "sales", "expenses"] : ["opening", "sales", "expenses", "deposit"];
    await stub(page, cashAnswer(), {
      home: homeAnswer({ draft: { id: "d", current_section: section, completed_sections: completed, last_edit_seconds: 60 }, draft_date: DAY }),
    });
    await arrive(page, BASE);
    const card = page.getByRole("region", { name: /Daily Closing/ });
    await expect(card).toContainText("Next: Cash Count");
    await expect(card.getByRole("list", { name: "Daily Closing stages" }).getByRole("link", { name: /Cash Count, current step/ })).toHaveAttribute("href", STAGE_URL);
    await card.getByRole("button", { name: "Continue Daily Closing" }).click();
    await expect(page).toHaveURL(STAGE_URL);
    await expect(page.getByRole("heading", { level: 1, name: "Cash Count" })).toBeVisible();
  });
}

test("Flask's Bank Deposit address lands on this stage, for the same day", async ({ page }) => {
  await stub(page, cashAnswer());
  await arrive(page, `${BASE}/reports/new/deposit?transaction_date=${DAY}`);
  await expect(page).toHaveURL(STAGE_URL);
  await expect(page.getByRole("heading", { level: 1, name: "Cash Count" })).toBeVisible();
});

test("the largest counts and amounts are never clipped, and the page never scrolls sideways", async ({ page }) => {
  await openWith(page, cashAnswer({ cash_on_hand: 99999999999.99, expected_cash: 99999999999.99 }));
  await count(page, "HKD500 notes").fill("1000000");
  await count(page, "HKD0.50 coins").fill("999999");
  await deposit(page).fill("12345678901.99");
  await safebox(page).fill("99999999999.99");
  await safebox(page).blur();
  await deposit(page).blur();
  await expect(value(page, "Drawer total")).toHaveText("HKD500,499,999.50");
  const clipped = await page.evaluate(() =>
    Array.from(document.querySelectorAll("main input, main dd, main span[translate=no]"))
      .filter((el) => el.scrollWidth > el.clientWidth + 1)
      .map((el) => (el as HTMLElement).id || el.textContent),
  );
  expect(clipped).toEqual([]);
  await expectNoHorizontalScroll(page);
});

test("the stage reloads with no console error", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(e.message));
  await openWith(page, cashAnswer({ bank_deposit: 300 }));
  // Arriving through /landing renders in the browser only; a reload is a full server render that
  // the browser then hydrates - where a mismatch shows.
  await page.reload();
  await expect(page.getByRole("heading", { level: 1, name: "Cash Count" })).toBeVisible();
  await expect(deposit(page)).toHaveValue("300.00");
  expect(errors).toEqual([]);
});
