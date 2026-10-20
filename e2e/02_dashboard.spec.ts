// The launch page (components/dashboard, Part 15.6a Action Dashboard), against a STUBBED Petty
// Cash API: every state - first use, not started, in progress, the gate, done - and the start
// rules it keeps (Before You Start, read-only), without a database. Needs only `npm run dev`.
// Every page it opens is this app's own (stubbed quietly) - none is a Flask page.

import { expect, test, type Page, type Route } from "@playwright/test";

import { companyRef } from "./companyRef";
import { mintModuleToken } from "./helpers";

const ENTITY = "3d65f186-5ba1-4bf7-a1b0-cc64a113eb5c";
const NAME = "E2E Petty Cash Shop";
const HOME_PATH = `/entity/${companyRef(ENTITY, NAME)}/petty-cash`;
const TODAY = "2026-10-14";

// The device's clock reads Hong Kong time, so "Saved 6:02 pm" is the same wherever this runs.
test.use({ timezoneId: "Asia/Hong_Kong" });

type Json = Record<string, unknown>;

function day(closing: number, deposit = 0): Json {
  return { id: `r-${closing}`, closing_balance: closing, bank_deposit: deposit, xero_integrated: true, submitter_first_name: "Olive" };
}

function homeAnswer(over: Json = {}): Json {
  return {
    server_today: TODAY,
    user_count: 2,
    currency_code: "HKD",
    latest: {
      date: "2026-10-13",
      closing_balance: 1250.5,
      deposit: 300,
      deposit_bank_name: "HSBC Current",
      deposit_bank_number: "***-123",
      deposit_correction_missing_settings: [],
      can_correct_deposit: true,
      submitter_first_name: "Olive",
    },
    draft: null,
    draft_date: null,
    start_date: null,
    published: {
      "2026-10-10": day(900),
      "2026-10-13": day(1250.5, 300),
    },
    today_has_report: false,
    today_is_latest_report: false,
    xero_settings: { complete: true, missing: [] },
    permissions: { read_only: false, correct_deposit: true },
    ...over,
  };
}

type Enter = {
  onCorrection?: (body: Json, route: Route) => Promise<void>;
  /** The subscription API's notice for the company ("fail": a 500); none by default. */
  notice?: Json | "fail";
  /** The device's clock, fixed - for "Saved 6:02 pm" and the greeting. */
  clock?: Date;
};

async function enterWith(page: Page, home: Json, { onCorrection, clock, notice }: Enter = {}) {
  await page.route("**/api/petty-cash/v1/companies/*/home", (route) => route.fulfill({ json: home }));
  // minty-subscription-api (SUBSCRIPTION_API_URL): the launch page's subscription notice
  await page.route("**/api/entities/*/subscription-notice", (route) =>
    route.fulfill(notice === "fail" ? { status: 500, json: { error: "Boom" } } : { json: notice ?? { items: [] } }),
  );
  await page.route("**/api/me/profile**", (route) => route.fulfill({ json: { user: { name: "Tess Tester", initials: "TT" } } }));
  if (onCorrection) {
    await page.route("**/api/petty-cash/v1/companies/*/deposit-correction", async (route) => {
      await onCorrection(route.request().postDataJSON() as Json, route);
    });
  }
  // This app's own Addition to Drawer stage (e2e/03_addition.spec.ts covers it): a quiet stub, so
  // following Start reads nothing real.
  await page.route("**/api/petty-cash/v1/companies/*/reports/opening**", (route) =>
    route.fulfill({
      json: { transaction_date: TODAY, currency_code: "HKD", draft: null, starting_cash_balance: 0, yesterday_closing_balance: 0, safebox_balance: 0, cash_addition: null, withdrawal: "personal" },
    }),
  );
  // This app's own Sales stage (e2e/04_sales.spec.ts covers it): a quiet stub too.
  await page.route("**/api/petty-cash/v1/companies/*/reports/sales**", (route) =>
    route.fulfill({ json: { transaction_date: TODAY, currency_code: "HKD", draft: null, methods: [], cash_sales: null } }),
  );
  // This app's own Cash Count stage (e2e/06_cash_count.spec.ts covers it): a quiet stub too.
  await page.route("**/api/petty-cash/v1/companies/*/reports/cash-count**", (route) =>
    route.fulfill({
      json: {
        transaction_date: TODAY, currency_code: "HKD", draft: null, opening_balance: 0, cash_addition: 0, cash_sales: 0, expenses: 0, bank_deposit: 0,
        cash_on_hand: 0, expected_cash: 0, denominations: [], safe_box_balance: 0, discrepancy: { amount: 0, kind: "none", reason: "" },
      },
    }),
  );
  // This app's own Close stage (e2e/07_close.spec.ts covers it): a quiet stub too.
  await page.route("**/api/petty-cash/v1/companies/*/reports/close**", (route) =>
    route.fulfill({
      json: {
        transaction_date: TODAY, currency_code: "HKD", draft: null, opening_balance: 0, cash_addition: 0,
        sales: { methods: [], cash: 0, total: 0, yesterday_total: null, history: [] }, expenses: { lines: [], total: 0 },
        cash: { bank_deposit: 0, expected: 0, counted: 0, safe_box: 0, difference: { amount: 0, kind: "none", reason: "" } }, closing_balance: 0, problem: null,
      },
    }),
  );
  // This app's own Daily Report (e2e/08_daily_report.spec.ts covers it): a quiet stub too.
  await page.route(/\/api\/petty-cash\/v1\/companies\/[^/]+\/reports\/r-[^/?]+$/, (route) =>
    route.fulfill({
      json: {
        report_id: "r", transaction_date: "2026-10-13", currency_code: "HKD", company_name: NAME, status: "submitted", status_label: "Submitted", status_tone: "info",
        is_latest: true, submitted_at: null, submitted_by: null, published_at: null, publishing_status: "unpublished", xero_integrated: false, was_published: false,
        kpis: { total_sales: 0, total_expenses: 0, cash_position: 0 }, sales: { methods: [], cash: 0, total: 0 }, expenses: { lines: [], total: 0 },
        cash: { opening_balance: 0, cash_addition: 0, cash_addition_type: null, cash_sales: 0, expenses: 0, bank_deposit: 0, expected: 0, counted: 0, safe_box: 0, difference: { amount: 0, kind: "none", reason: "" } },
        closing_balance: 0, permissions: { edit: false, delete: false, publish: false, share: false },
      },
    }),
  );
  // This app's own report history (e2e/09_report_history.spec.ts covers it): a quiet stub too.
  await page.route(/\/api\/petty-cash\/v1\/companies\/[^/]+\/reports(\?.*)?$/, (route) =>
    route.fulfill({ json: { reports: [], page: 1, per_page: 10, total_pages: 1, total_count: 0, latest_report_id: null, currency_code: "HKD", can_publish: true } }),
  );
  // This app's own settings page (e2e/10_settings.spec.ts covers it), where the Xero settings are
  // set up: quiet stubs, Xero not live.
  await page.route(/\/api\/petty-cash\/v1\/companies\/[^/]+\/settings$/, (route) =>
    route.fulfill({
      json: {
        country: { country_code: "HK", currency_id: "cur-hkd", countries: [{ code: "HK", name: "Hong Kong" }], currencies: [{ id: "cur-hkd", name: "HKD" }], selected_country: "Hong Kong", selected_currency: "HKD" },
        sales_methods: { electronic: [], delivery: [] },
        available: { electronic: [], delivery: [] },
        xero_connected: true,
        permissions: { edit_country: true, view_sales_methods: true, add_sales_method: true, rename_sales_method: true, remove_sales_method: true, reorder_sales_methods: true },
      },
    }),
  );
  await page.route(/\/api\/petty-cash\/v1\/companies\/[^/]+\/settings\/xero$/, (route) =>
    route.fulfill({ json: { live: false, organisation: null, mapping: null, mapping_saved: false, account_codes: null, permissions: { edit_mapping: true, edit_account_codes: true } } }),
  );
  let overrides: Record<string, unknown> = {};
  if (clock) {
    await page.clock.setFixedTime(clock);
    // The token must be live on the fixed clock AND the server's real one: `clock` is in the future.
    const now = Math.floor(clock.getTime() / 1000);
    overrides = { iat: now, exp: now + 1800 };
  }
  const token = mintModuleToken({ secret: "stub", userId: "u", entityId: ENTITY, entityName: NAME }, overrides);
  await page.goto(`/landing?${new URLSearchParams({ token, entity_id: ENTITY, entity_name: NAME, next: HOME_PATH })}`);
  await expect(page.getByRole("heading", { level: 1, name: "Petty Cash" })).toBeVisible();
  await expect(page.getByRole("status", { name: "Loading" })).toHaveCount(0);
}

const card = (page: Page) => page.getByRole("region", { name: /Daily Closing/ });

/** This app's settings page, opened at its Xero cards (`#xero`). */
const SETTINGS_XERO = `/entity/${companyRef(ENTITY, NAME)}/settings/petty-cash#xero`;

/** Landed on this app's settings page at its Xero cards - not a Flask page. */
async function expectXeroSettings(page: Page) {
  await expect(page).toHaveURL(new RegExp(`${SETTINGS_XERO}$`));
  await expect(page.getByRole("heading", { level: 1, name: "Petty Cash settings" })).toBeVisible();
  const xero = page.getByRole("region", { name: "Xero", exact: true });
  await expect(xero).toBeVisible();
  await expect(xero).toBeInViewport();
}

/** This app's own Addition to Drawer stage for `day`, in the company's address. */
const addition = (day: string) => new RegExp(`${HOME_PATH}/reports/new/opening\\?transaction_date=${day}$`);

test("the page loads with no console error - a hydration mismatch included", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(e.message));
  await enterWith(page, homeAnswer());
  // Arriving through /landing renders in the browser only; a reload is a full server render that
  // the browser then hydrates - where a mismatch shows (the cookie is set by now).
  await page.reload();
  await expect(page.getByRole("heading", { name: "Today's Daily Closing" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Back to your companies" })).toHaveAttribute("href", /\/handoff\/minty-web/);
  expect(errors).toEqual([]);
});

test("not started: the greeting, the five stages and Start - no calendar, no Quick Actions", async ({ page }) => {
  await enterWith(page, homeAnswer());
  await expect(page.getByText(/^Good (morning|afternoon|evening), Tess$/)).toBeVisible();
  await expect(page.getByText("Wed 14 Oct 2026").first()).toBeVisible();
  const c = card(page);
  await expect(c.getByRole("heading", { name: "Today's Daily Closing" })).toBeVisible();
  await expect(c.getByRole("list", { name: "Daily Closing stages" }).getByRole("listitem")).toHaveText([
    /Drawer/,
    /Sales/,
    /Expenses/,
    /Cash Count/,
    /Close/,
  ]);
  await expect(c).toContainText("0 of 5 done");
  await expect(c).toContainText("Next: Addition to Drawer");
  await expect(c.getByRole("button", { name: "Start today's Daily Closing" })).toBeEnabled();
  await expect(page.getByRole("heading", { name: "Report Calendar" })).toHaveCount(0);
  await expect(page.getByText("Quick Actions")).toHaveCount(0);
});

test("Start passes through Before You Start, and a changed deposit is sent", async ({ page }) => {
  let sent: Json | null = null;
  await enterWith(page, homeAnswer(), {
    onCorrection: async (body, route) => {
      sent = body;
      await route.fulfill({ json: { status: "success", message: "ok", next_transaction_date: TODAY } });
    },
  });

  await page.getByRole("button", { name: "Start today's Daily Closing" }).click();
  const dialog = page.getByRole("dialog", { name: "Before You Start" });
  await expect(dialog).toContainText("Previous report submitted by Olive");
  await expect(dialog).toContainText("HKD300.00");
  await expect(dialog).toContainText("HSBC Current (***-123)");
  await expect(dialog).toContainText("13 Oct 2026");

  await dialog.getByRole("button", { name: "Proceed" }).click();
  await expect(dialog).toContainText("Choose one of the answers above to continue.");

  await dialog.getByText("No, there was a change in the details").click();
  await expect(dialog).toContainText("will be reversed in Xero");
  await dialog.getByRole("button", { name: "Proceed" }).click();

  const amount = page.getByRole("dialog", { name: "Deposit to Bank" });
  const field = amount.getByRole("textbox", { name: /Deposit Amount/ });
  await field.fill("400");
  await expect(amount).toContainText("Enter HKD300.00 or less.");
  await field.fill("250.555");
  await expect(field).toHaveValue("250.55");
  await amount.getByRole("button", { name: "Proceed" }).click();

  await expect(page).toHaveURL(addition(TODAY));
  expect(sent).toEqual({ kind: "change", date: "2026-10-13", amount: 250.55 });
});

test("a refused correction is said in the dialog, not lost", async ({ page }) => {
  await enterWith(page, homeAnswer(), {
    onCorrection: async (_body, route) => {
      await route.fulfill({ status: 409, json: { error: "Configure the Deposit Bank Account first." } });
    },
  });
  await page.getByRole("button", { name: "Start today's Daily Closing" }).click();
  const dialog = page.getByRole("dialog", { name: "Before You Start" });
  await dialog.getByText("No, there was no deposit").click();
  await dialog.getByRole("button", { name: "Proceed" }).click();
  await expect(dialog).toContainText("Configure the Deposit Bank Account first.");
});

test("a deposit the company cannot correct offers only 'as stated'", async ({ page }) => {
  await enterWith(
    page,
    homeAnswer({
      latest: { ...(homeAnswer().latest as Json), deposit_correction_missing_settings: ["Deposit Bank Account"], can_correct_deposit: false },
    }),
  );
  await page.getByRole("button", { name: "Start today's Daily Closing" }).click();
  const dialog = page.getByRole("dialog", { name: "Before You Start" });
  await expect(dialog).toContainText("Deposit cannot be corrected");
  await expect(dialog.getByRole("radio", { name: "No, there was no deposit" })).toBeDisabled();
  await dialog.getByText("Yes, amount deposited as stated").click();
  await dialog.getByRole("button", { name: "Proceed" }).click();
  await expect(page).toHaveURL(addition(TODAY));
});

test("a deposit correction's missing accounts link to this app's settings, at its Xero cards", async ({ page }) => {
  await enterWith(
    page,
    homeAnswer({
      latest: { ...(homeAnswer().latest as Json), deposit_correction_missing_settings: ["Deposit Bank Account"], can_correct_deposit: false },
    }),
  );
  await page.getByRole("button", { name: "Start today's Daily Closing" }).click();
  const dialog = page.getByRole("dialog", { name: "Before You Start" });
  const link = dialog.getByRole("link", { name: "Settings → Petty Cash" });
  await expect(link).toHaveAttribute("href", SETTINGS_XERO);
  await link.click();
  await expectXeroSettings(page);
});

test("in progress: 3 of 5 done, the next stage, when it was saved, and Continue opens this app's Cash Count", async ({ page }) => {
  await enterWith(
    page,
    homeAnswer({
      draft: { id: "d", current_section: "deposit", completed_sections: ["opening", "sales", "expenses", "deposit"], last_edit_seconds: 180 },
      draft_date: TODAY,
    }),
    // 6:05 pm in Hong Kong (the browser's zone is pinned below), years ahead of the real clock.
    { clock: new Date("2031-10-14T18:05:00+08:00") },
  );
  await expect(page.getByText("Good evening, Tess")).toBeVisible();
  const c = card(page);
  await expect(c).toContainText("3 of 5 done");
  await expect(c).toContainText("Next: Cash Count");
  await expect(c).toContainText("Saved 6:02 pm");
  const stages = c.getByRole("list", { name: "Daily Closing stages" });
  await expect(stages.locator('[aria-current="step"]')).toContainText("Cash Count");
  // done and current stages open where they were left - Cash Count is this app's own stage, the
  // deposit its first section (Wave 2d)
  await expect(stages.getByRole("link", { name: /Sales, done/ })).toHaveAttribute("href", /\/reports\/new\/sale\?transaction_date=2026-10-14/);
  await expect(stages.getByRole("link", { name: /Cash Count, current step/ })).toHaveAttribute(
    "href",
    `${HOME_PATH}/reports/new/cash-count?transaction_date=2026-10-14`,
  );
  await expect(stages.getByRole("link", { name: /Close/ })).toHaveCount(0);
  // Addition to Drawer is this app's own stage page
  await expect(stages.getByRole("link", { name: /Drawer, done/ })).toHaveAttribute("href", addition(TODAY));
  await expect(page.getByRole("button", { name: "Start today's Daily Closing" })).toHaveCount(0);
  await c.getByRole("button", { name: "Continue Daily Closing" }).click();
  await expect(page).toHaveURL(new RegExp(`${HOME_PATH}/reports/new/cash-count\\?transaction_date=2026-10-14$`));
  await expect(page.getByRole("heading", { level: 1, name: "Cash Count" })).toBeVisible();
});

test("in progress on Close: Continue opens this app's own Close stage", async ({ page }) => {
  await enterWith(
    page,
    homeAnswer({
      draft: { id: "d", current_section: "ending", completed_sections: ["opening", "sales", "expenses", "deposit", "cash_count"], last_edit_seconds: 60 },
      draft_date: TODAY,
    }),
  );
  const c = card(page);
  await expect(c).toContainText("4 of 5 done");
  await expect(c).toContainText("Next: Close");
  await c.getByRole("button", { name: "Continue Daily Closing" }).click();
  await expect(page).toHaveURL(new RegExp(`${HOME_PATH}/reports/new/ending\\?transaction_date=2026-10-14$`));
  await expect(page.getByRole("heading", { level: 1, name: "Close" })).toBeVisible();
});

test("in progress on Addition to Drawer: Continue opens this app's own stage", async ({ page }) => {
  await enterWith(
    page,
    homeAnswer({ draft: { id: "d", current_section: "opening", completed_sections: [], last_edit_seconds: 60 }, draft_date: TODAY }),
  );
  const c = card(page);
  await expect(c).toContainText("Next: Addition to Drawer");
  await c.getByRole("button", { name: "Continue Daily Closing" }).click();
  await expect(page).toHaveURL(addition(TODAY));
});

test("in progress with no section named: Continue opens this app's Addition to Drawer", async ({ page }) => {
  await enterWith(page, homeAnswer({ draft: { id: "d", current_section: null, completed_sections: [], last_edit_seconds: 60 }, draft_date: TODAY }));
  await card(page).getByRole("button", { name: "Continue Daily Closing" }).click();
  await expect(page).toHaveURL(addition(TODAY));
});

test("yesterday unfinished: the gate banner holds today and starts the day it names", async ({ page }) => {
  await enterWith(page, homeAnswer({ published: { "2026-10-11": day(700), "2026-10-12": day(800) } }));
  const banner = page.getByRole("status").filter({ hasText: "Finish Tue 13 Oct first" });
  await expect(banner).toBeVisible();
  await expect(banner).toContainText("Tue 13 Oct has no submitted report yet.");
  const c = card(page);
  await expect(c.getByRole("button", { name: "Start today's Daily Closing" })).toBeDisabled();
  await expect(c).toContainText("Finish Tue 13 Oct first.");
  // the 12th banked nothing, so no Before You Start: straight into the 13th's report
  await banner.getByRole("button", { name: "Start Daily Closing for Tue 13 Oct" }).click();
  await expect(page).toHaveURL(addition("2026-10-13"));
});

test("done: today's report is submitted, and View report opens it", async ({ page }) => {
  await enterWith(page, homeAnswer({ published: { "2026-10-13": day(1250.5), [TODAY]: day(1320) }, today_has_report: true }));
  const c = card(page);
  await expect(c).toContainText("Today's report is submitted");
  await expect(c).toContainText("5 of 5 done");
  await expect(page.getByRole("button", { name: /Start|Continue/ })).toHaveCount(0);
  // today's Daily Report, this app's own (by the report's id)
  await c.getByRole("link", { name: "View report" }).click();
  await expect(page).toHaveURL(new RegExp(`${HOME_PATH}/reports/r-1320/summary$`));
  await expect(page.getByRole("heading", { level: 1, name: "Daily Report" })).toBeVisible();
});

test("first use: Minty's empty state starts the first Daily Closing", async ({ page }) => {
  await enterWith(page, homeAnswer({ published: {}, latest: { ...(homeAnswer().latest as Json), date: null, deposit: 0 } }));
  await expect(page.getByText("Your first Daily Closing")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Recent reports" })).toHaveCount(0);
  await page.getByRole("button", { name: "Start today's Daily Closing" }).click();
  await expect(page).toHaveURL(addition(TODAY));
  await expect(page.getByRole("heading", { level: 1, name: "Addition to Drawer" })).toBeVisible();
});

test("first use after onboarding: the first Daily Closing is on the start date", async ({ page }) => {
  await enterWith(
    page,
    homeAnswer({ published: {}, start_date: "2026-10-07", latest: { ...(homeAnswer().latest as Json), date: null, deposit: 0 } }),
  );
  await page.getByRole("button", { name: "Start the Daily Closing for Wed 7 Oct" }).click();
  await expect(page).toHaveURL(addition("2026-10-07"));
});

test("recent reports: the newest three, Submitted, each opening its report, and See all", async ({ page }) => {
  await enterWith(
    page,
    homeAnswer({
      published: { "2026-10-10": day(900), "2026-10-11": day(950), "2026-10-12": day(1000), "2026-10-13": day(1250.5, 300) },
    }),
  );
  const recent = page.getByRole("region", { name: "Recent reports" });
  const rows = recent.getByRole("listitem");
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(0)).toContainText("Tue 13 Oct 2026");
  await expect(rows.nth(0)).toContainText("HKD1,250.50");
  await expect(rows.nth(0)).toContainText("Submitted");
  await expect(rows.nth(2)).toContainText("Sun 11 Oct 2026");
  await expect(recent).not.toContainText("10 Oct");
  await expect(recent.getByRole("link", { name: "See all" })).toHaveAttribute("href", `${HOME_PATH}/reports`);
  await rows.nth(1).getByRole("link").click();
  await expect(page).toHaveURL(new RegExp(`${HOME_PATH}/reports/r-1000/summary$`));
  await expect(page.getByRole("heading", { level: 1, name: "Daily Report" })).toBeVisible();
  await page.goBack();
  // See all: this app's report history
  await page.getByRole("link", { name: "See all" }).click();
  await expect(page).toHaveURL(new RegExp(`${HOME_PATH}/reports$`));
  await expect(page.getByRole("heading", { level: 1, name: "Reports" })).toBeVisible();
});

test("missing Xero settings hold the page with the way to set them up", async ({ page }) => {
  await enterWith(page, homeAnswer({ xero_settings: { complete: false, missing: ["Main Bank Account", "Cash Sale Contact"] } }));
  const dialog = page.getByRole("alertdialog", { name: "Setup Required" });
  await expect(dialog).toContainText("Main Bank Account");
  await page.keyboard.press("Escape");
  await expect(dialog).toBeVisible();
  const link = dialog.getByRole("link", { name: "Set Up Settings" });
  await expect(link).toHaveAttribute("href", SETTINGS_XERO);
  await link.click();
  await expectXeroSettings(page);
});

test("read-only access cannot start, and says why beside the button", async ({ page }) => {
  await enterWith(page, homeAnswer({ permissions: { read_only: true, correct_deposit: false } }));
  const c = card(page);
  await expect(c.getByRole("button", { name: "Start today's Daily Closing" })).toBeDisabled();
  await expect(c.getByText("Read-only access")).toBeVisible();
});

/** A past-due notice, as minty-subscription-api answers it. */
function noticeAnswer(over: Json = {}): Json {
  return {
    items: [
      { kind: "past_due", severity: "critical", module: "Petty Cash", module_code: "petty_cash", title: "Petty Cash payment failed", detail: "Update the card by Tue 20 Oct to keep Petty Cash.", deadline: "2026-10-20" },
    ],
    can_manage: true,
    payer: { name: "Olive Tan", email: "olive@example.com" },
    severity: "critical",
    settings_path: "/handoff/minty-web?next=%2Fentity%2Fx%2Fcompany%2Fsettings%2Fmodules",
    ...over,
  };
}

test("the subscription notice: the payer goes to minty-web's subscription settings; shown once per sign-in", async ({ page }) => {
  await enterWith(page, homeAnswer(), { notice: noticeAnswer() });
  const dialog = page.getByRole("dialog", { name: "Action needed" });
  await expect(dialog.getByRole("alert").filter({ hasText: "Petty Cash payment failed" })).toHaveAttribute("data-tone", "danger");
  await expect(dialog).toContainText("Update the card by Tue 20 Oct to keep Petty Cash.");
  await expect(dialog).not.toContainText("managed by");
  // minty-web's Module page through Flask's hand-off - never a Flask page
  const settings = dialog.getByRole("link", { name: "Go to subscription settings" });
  await expect(settings).toHaveAttribute("href", /\/handoff\/minty-web\?next=%2Fentity%2F3d65f186%2F[^&]+%2Fsettings%2Fmodules&entity_id=3d65f186-/);
  await dialog.getByRole("button", { name: "Dismiss" }).click();
  await expect(dialog).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Today's Daily Closing" })).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("the subscription notice tells anyone but the payer who pays, with no settings button", async ({ page }) => {
  await enterWith(page, homeAnswer(), { notice: noticeAnswer({ can_manage: false, severity: "warning", items: [{ kind: "pending_cancel", severity: "warning", module: "Bills", module_code: "billing", title: "Bills ends on Sat 31 Oct", detail: "Undo the cancellation to keep it.", deadline: null }] }) });
  const dialog = page.getByRole("dialog", { name: "Your subscription" });
  await expect(dialog).toContainText("Billing for this company is managed by Olive Tan (olive@example.com). Only they can change its subscription.");
  await expect(dialog.getByRole("link", { name: "Go to subscription settings" })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
});

test("the subscription notice sits over Setup Required; dismissing it reveals what is beneath", async ({ page }) => {
  await enterWith(page, homeAnswer({ xero_settings: { complete: false, missing: ["Main Bank Account"] } }), { notice: noticeAnswer() });
  const notice = page.getByRole("dialog", { name: "Action needed" });
  await expect(notice).toBeVisible();
  await notice.getByRole("button", { name: "Dismiss" }).click();
  await expect(page.getByRole("alertdialog", { name: "Setup Required" })).toBeVisible();
});

test("a failed subscription read shows no notice and leaves the page alone", async ({ page }) => {
  await enterWith(page, homeAnswer(), { notice: "fail" });
  await expect(page.getByRole("heading", { name: "Today's Daily Closing" })).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

