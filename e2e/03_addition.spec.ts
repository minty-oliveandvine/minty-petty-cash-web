// The Daily Closing's first stage, "Addition to Drawer" (components/closing/AdditionToDrawer.tsx,
// Part 15.9 / 15.15), against a STUBBED Petty Cash API. Needs only `npm run dev`. Save & Next lands
// on this app's own Sales stage (e2e/04_sales.spec.ts covers it; its read is a quiet stub here);
// Flask's pages (Expenses onwards, by the company's full id) are caught, so nothing leaves the app. Refusals and
// warnings are inline alerts or Page banners here, never toasts.

import { expect, test, type Page, type Route } from "@playwright/test";

import { companyRef } from "@minty/shared/e2e";
import { expectNoHorizontalScroll, mintModuleToken } from "./helpers";

// Amounts read "HKD 760.00" - owner 2026-10-21: one money rule (@minty/shared/money); they were "HKD760.00".

const ENTITY = "3d65f186-5ba1-4bf7-a1b0-cc64a113eb5c";
const NAME = "E2E Petty Cash Shop";
const BASE = `/entity/${companyRef(ENTITY, NAME)}/petty-cash`;
const DAY = "2026-10-13";
const STAGE_URL = `${BASE}/reports/new/opening?transaction_date=${DAY}`;

type Json = Record<string, unknown>;

function openingAnswer(over: Json = {}): Json {
  return {
    transaction_date: DAY,
    currency_code: "HKD",
    draft: null,
    starting_cash_balance: 1200,
    yesterday_closing_balance: 1200,
    safebox_balance: 200,
    cash_addition: null,
    withdrawal: "personal",
    ...over,
  };
}

const DRAFT = { id: "d", status: "draft", current_section: "expenses", completed_sections: ["opening", "sales"], xero_integrated: false, publishing_status: "unpublished" };

const SAVED = { draft_id: "d", transaction_date: DAY, current_section: "sales", completed_sections: ["opening"], next: "sales" };

// The launch page's read: a day not started, nothing to confirm.
const HOME = {
  server_today: "2026-10-14",
  user_count: 1,
  currency_code: "HKD",
  latest: { date: DAY, closing_balance: 1200, deposit: 0, deposit_bank_name: "No deposit", deposit_bank_number: "", deposit_correction_missing_settings: [], can_correct_deposit: true, submitter_first_name: "Olive" },
  draft: null,
  draft_date: null,
  published: { [DAY]: { id: "r", closing_balance: 1200, bank_deposit: 0, xero_integrated: true, submitter_first_name: "Olive" } },
  today_has_report: false,
  today_is_latest_report: false,
  xero_settings: { complete: true, missing: [] },
  permissions: { read_only: false, correct_deposit: true },
};

/** Every PUT the page sent. */
type Saves = Json[];

async function openWith(page: Page, answer: Json, onSave?: (body: Json, route: Route) => Promise<void>): Promise<Saves> {
  const saves: Saves = [];
  await page.route("**/api/petty-cash/v1/companies/*/reports/opening**", async (route) => {
    if (route.request().method() === "PUT") {
      const body = route.request().postDataJSON() as Json;
      saves.push(body);
      if (onSave) await onSave(body, route);
      else await route.fulfill({ json: SAVED });
      return;
    }
    await route.fulfill({ json: answer });
  });
  await page.route("**/api/petty-cash/v1/companies/*/reports/sales**", (route) =>
    route.fulfill({ json: { transaction_date: DAY, currency_code: "HKD", draft: null, methods: [], cash_sales: null } }),
  );
  await page.route("**/api/petty-cash/v1/companies/*/home", (route) => route.fulfill({ json: HOME }));
  await page.route("**/api/me/profile**", (route) => route.fulfill({ json: { user: { name: "Tess Tester", initials: "TT" } } }));
  // Flask's pages (the Expenses stage onwards, by the company's full id): caught.
  await page.route(/\/entity\/[0-9a-f-]{36}\/petty-cash\/reports(?:[/?]|$)/, (route) =>
    route.fulfill({ contentType: "text/html", body: "<title>Flask page</title><p>Flask page</p>" }),
  );
  const token = mintModuleToken({ secret: "stub", userId: "u", entityId: ENTITY, entityName: NAME });
  await page.goto(`/landing?${new URLSearchParams({ token, entity_id: ENTITY, entity_name: NAME, next: STAGE_URL })}`);
  await expect(page.getByRole("heading", { level: 1, name: "Addition to Drawer" })).toBeVisible();
  await expect(page.getByRole("status", { name: "Loading" })).toHaveCount(0);
  return saves;
}

const amount = (page: Page) => page.getByRole("textbox", { name: "Cash added to the drawer in HKD" });
const stages = (page: Page) => page.getByRole("list", { name: "Daily Closing stages" });
const summary = (page: Page) => page.locator("dl").filter({ hasText: "Opening cash" });

test("first report: the Workflow header, the five stages and the starting cash as facts", async ({ page }) => {
  await openWith(page, openingAnswer());
  await expect(page.getByText("Daily Closing · Tue 13 Oct 2026")).toBeVisible();
  await expect(page.getByText("Draft", { exact: true })).toHaveAttribute("data-tone", "neutral");
  await expect(page.getByRole("link", { name: "Petty Cash", exact: true })).toHaveAttribute("href", BASE);
  await expect(page.getByText("Add any cash you put into the drawer before the day starts.")).toBeVisible();

  await expect(stages(page).getByRole("listitem")).toHaveText([/Drawer/, /Sales/, /Expenses/, /Cash Count/, /Close/]);
  await expect(stages(page).locator('[aria-current="step"]')).toContainText("Drawer, current step");
  // nothing done yet: no stage opens from here
  await expect(stages(page).getByRole("link")).toHaveCount(0);

  const facts = page.getByRole("region", { name: "Addition to Drawer" });
  await expect(facts).toContainText("Starting cash");
  await expect(facts).toContainText("HKD 1,200.00");
  await expect(facts).toContainText("Carried over from your last Daily Closing.");
  await expect(facts).toContainText("In the cash drawer");
  await expect(facts).toContainText("HKD 1,000.00"); // 1,200 less the 200 in the safebox
  await expect(facts).toContainText("In the safebox");
  await expect(facts.getByRole("textbox")).toHaveCount(1); // the starting cash is never an input
  await expect(amount(page)).toHaveValue("");
  await expect(amount(page)).toHaveAttribute("inputmode", "decimal");
  await expect(page.getByText("Optional. Leave it empty when no cash was added.")).toBeVisible();
  await expect(page.getByRole("radio", { name: "Personal" })).toBeChecked();
  await expect(summary(page)).toContainText("HKD 1,200.00");
  await expectNoHorizontalScroll(page);
});

test("a first report opens from the balance set up in onboarding", async ({ page }) => {
  await openWith(page, openingAnswer({ starting_cash_balance: 900, yesterday_closing_balance: 0, safebox_balance: 0 }));
  const facts = page.getByRole("region", { name: "Addition to Drawer" });
  await expect(facts).toContainText("HKD 900.00");
  await expect(facts).toContainText("Your opening balance from setup.");
  await expect(facts).not.toContainText("In the safebox");
});

test("a draft brings its own values, and its done stages open where they were left", async ({ page }) => {
  await openWith(page, openingAnswer({ draft: DRAFT, cash_addition: 30, withdrawal: "company" }));
  await expect(amount(page)).toHaveValue("30.00");
  await expect(page.getByRole("radio", { name: "Company bank" })).toBeChecked();
  await expect(summary(page)).toContainText("HKD 1,230.00");
  // Sales is this app's own stage too (Wave 2b)
  await expect(stages(page).getByRole("link", { name: "Sales, done" })).toHaveAttribute("href", `${BASE}/reports/new/sale?transaction_date=${DAY}`);
  // the stage the draft is on is not done: Save & Next is the way there
  await expect(stages(page).getByRole("link", { name: /Expenses/ })).toHaveCount(0);
});

test("the amount refuses stray keys as typed, is grouped on leaving, and moves the opening cash; Save & Next opens Sales in this app", async ({ page }) => {
  const saves = await openWith(page, openingAnswer());
  const field = amount(page);
  // owner 2026-10-21: one money rule (@minty/shared/money) - a stray key is refused, not stripped
  await field.pressSequentially("12a50.555");
  await expect(field).toHaveValue("1250.55");
  await expect(summary(page)).toContainText("HKD 2,450.55");
  await field.blur();
  await expect(field).toHaveValue("1,250.55");
  await page.getByText("Company bank").click();

  await page.getByRole("button", { name: "Save & Next" }).click();

  await expect(page).toHaveURL(new RegExp(`${BASE}/reports/new/sale\\?transaction_date=${DAY}$`));
  await expect(page.getByRole("heading", { level: 1, name: "Sales" })).toBeVisible();
  expect(saves).toEqual([{ transaction_date: DAY, cash_addition: 1250.55, withdrawal: "company", action: "next" }]);
});

test("Enter in the amount saves and moves on, as Save & Next", async ({ page }) => {
  const saves = await openWith(page, openingAnswer());
  await amount(page).fill("5");
  await amount(page).press("Enter");
  await expect(page).toHaveURL(/\/reports\/new\/sale\?/);
  expect(saves).toEqual([{ transaction_date: DAY, cash_addition: 5, withdrawal: "personal", action: "next" }]);
});

test("Save & Exit saves and goes back to the launch page", async ({ page }) => {
  const saves = await openWith(page, openingAnswer(), async (_body, route) => {
    await route.fulfill({ json: { ...SAVED, current_section: "opening", next: "dashboard" } });
  });
  await page.getByRole("button", { name: "Save & Exit" }).click();
  await expect(page).toHaveURL(new RegExp(`${BASE}$`));
  await expect(page.getByRole("heading", { name: "Today's Daily Closing" })).toBeVisible();
  expect(saves).toEqual([{ transaction_date: DAY, cash_addition: 0, withdrawal: "personal", action: "exit" }]);
});

test("a day the rules refuse goes to the launch page, which says why in a Page banner, once", async ({ page }) => {
  const why = "Reports go one day at a time - this one needs to be 2026-10-12, the day after your last submitted report (2026-10-11).";
  await openWith(page, openingAnswer(), async (_body, route) => {
    await route.fulfill({ status: 409, json: { error: why, to: "dashboard" } });
  });
  await page.getByRole("button", { name: "Save & Next" }).click();
  await expect(page).toHaveURL(new RegExp(`${BASE}$`));
  const banner = page.getByRole("status").filter({ hasText: why });
  await expect(banner).toBeVisible();
  await expect(banner).toHaveAttribute("data-tone", "warning");
  await expect(page.locator("[data-toast-type]")).toHaveCount(0);
  // read once: a reload no longer says it
  await page.reload();
  await expect(page.getByRole("heading", { name: "Today's Daily Closing" })).toBeVisible();
  await expect(page.getByText(why)).toHaveCount(0);
});

test("any other refusal stays on the stage, inline, and the actions come back", async ({ page }) => {
  const why = "Hmm, it looks like your cash balance is negative. Could you fix that first?";
  await openWith(page, openingAnswer(), async (_body, route) => {
    await route.fulfill({ status: 409, json: { error: why, to: "opening" } });
  });
  await page.getByRole("button", { name: "Save & Next" }).click();
  await expect(page.getByRole("alert").filter({ hasText: why })).toHaveAttribute("data-tone", "danger");
  await expect(page).toHaveURL(/\/reports\/new\/opening\?/);
  await expect(page.getByRole("button", { name: "Save & Next" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Save & Exit" })).toBeEnabled();
});

test("a last closing below zero holds the stage behind the gate: the rule, the reason, one action", async ({ page }) => {
  const saves = await openWith(page, openingAnswer({ starting_cash_balance: -120, yesterday_closing_balance: -120, safebox_balance: 0 }));
  const gate = page.getByRole("status").filter({ hasText: "Your last closing ended below zero" });
  await expect(gate).toBeVisible();
  await expect(gate).toContainText("It closed at -HKD 120.00");
  await expect(gate).toContainText("Correct the deposit from Petty Cash, then start this day again.");
  await expect(page.getByRole("button", { name: /Save/ })).toHaveCount(0);
  await expect(page.getByRole("textbox")).toHaveCount(0);
  await expectNoHorizontalScroll(page);
  await gate.getByRole("link", { name: "Go to Petty Cash" }).click();
  await expect(page).toHaveURL(new RegExp(`${BASE}$`));
  expect(saves).toEqual([]);
});

test("an opening below zero says how much to add, live, and is never sent", async ({ page }) => {
  const saves = await openWith(page, openingAnswer({ starting_cash_balance: -120.5, yesterday_closing_balance: 0, safebox_balance: 0 }));
  const alert = page.getByRole("status").filter({ hasText: "Opening cash is below zero" });
  await expect(alert).toContainText("Add at least HKD 120.50 to the drawer to continue.");
  await expect(summary(page)).toContainText("-HKD 120.50");
  await page.getByRole("button", { name: "Save & Next" }).click();
  await expect(amount(page)).toBeFocused();
  expect(saves).toEqual([]);
  await amount(page).fill("150");
  await expect(alert).toHaveCount(0);
  await expect(summary(page)).toContainText("HKD 29.50");
});

test("unsaved changes hold the stage links and the way back, with an inline warning and a way to leave anyway", async ({ page }) => {
  await openWith(page, openingAnswer({ draft: DRAFT }));
  await amount(page).fill("5");
  await stages(page).getByRole("link", { name: "Sales, done" }).click();
  const warning = page.locator("[data-tone=warning]").filter({ hasText: "Your changes to this stage are not saved yet." });
  await expect(warning).toBeVisible();
  await expect(page.locator("[data-toast-type]")).toHaveCount(0);
  await expect(page).toHaveURL(/\/reports\/new\/opening\?/);

  await page.getByRole("link", { name: "Petty Cash", exact: true }).click();
  await expect(page).toHaveURL(/\/reports\/new\/opening\?/);

  // the change put back: nothing to hold any more
  await amount(page).fill("");
  await expect(warning).toHaveCount(0);
  await amount(page).fill("5");
  await stages(page).getByRole("link", { name: "Sales, done" }).click();
  await warning.getByRole("button", { name: "Leave without saving" }).click();
  await expect(page).toHaveURL(/\/reports\/new\/sale\?/);
});

test("the launch page's Start opens this stage", async ({ page }) => {
  await openWith(page, openingAnswer({ transaction_date: "2026-10-14" }));
  await page.goto(BASE);
  await page.getByRole("button", { name: "Start today's Daily Closing" }).click();
  await expect(page).toHaveURL(new RegExp(`${BASE}/reports/new/opening\\?transaction_date=2026-10-14$`));
  await expect(page.getByRole("heading", { level: 1, name: "Addition to Drawer" })).toBeVisible();
});

test("the stage reloads with no console error", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(e.message));
  await openWith(page, openingAnswer({ draft: DRAFT, cash_addition: 30 }));
  // Arriving through /landing renders in the browser only; a reload is a full server render that
  // the browser then hydrates - where a mismatch shows.
  await page.reload();
  await expect(page.getByRole("heading", { level: 1, name: "Addition to Drawer" })).toBeVisible();
  await expect(amount(page)).toHaveValue("30.00");
  expect(errors).toEqual([]);
});
