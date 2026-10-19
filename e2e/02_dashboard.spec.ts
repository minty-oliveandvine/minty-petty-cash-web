// The dashboard (components/dashboard, Flask's look exactly), against a STUBBED Petty Cash API:
// every state Flask's dashboard had - a draft, a deposit to confirm, days not submitted, setup
// required - without a database. Needs only `npm run dev`. Navigations into the report pages are
// caught and answered here (their own specs cover them), so the spec reads where the app went.

import { expect, test, type Page, type Route } from "@playwright/test";

import { companyRef } from "./companyRef";
import { expectHubHandoff, mintModuleToken } from "./helpers";

const ENTITY = "3d65f186-5ba1-4bf7-a1b0-cc64a113eb5c";
const NAME = "E2E Petty Cash Shop";
const HOME_PATH = `/entity/${companyRef(ENTITY, NAME)}/petty-cash`;
const TODAY = "2026-10-14";

type Json = Record<string, unknown>;

function homeAnswer(over: Json = {}): Json {
  return {
    server_today: TODAY,
    user_count: 1,
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
    published: {
      "2026-10-10": { id: "a", closing_balance: 900, bank_deposit: 0, xero_integrated: true, submitter_first_name: "Olive" },
      "2026-10-13": { id: "b", closing_balance: 1250.5, bank_deposit: 300, xero_integrated: true, submitter_first_name: "Olive" },
    },
    today_has_report: false,
    today_is_latest_report: false,
    xero_settings: { complete: true, missing: [] },
    permissions: { read_only: false, correct_deposit: true },
    ...over,
  };
}

async function enterWith(page: Page, home: Json, onCorrection?: (body: Json, route: Route) => Promise<void>) {
  await page.route("**/api/petty-cash/v1/companies/*/home", (route) => route.fulfill({ json: home }));
  await page.route("**/api/me/profile**", (route) => route.fulfill({ json: { user: { name: "Tess Tester", initials: "TT" } } }));
  if (onCorrection) {
    await page.route("**/api/petty-cash/v1/companies/*/deposit-correction", async (route) => {
      await onCorrection(route.request().postDataJSON() as Json, route);
    });
  }
  // the wizard's and a report's pages: caught, so the spec can read where the app went.
  await page.route(/\/entity\/[^/]+\/petty-cash\/reports\//, (route) =>
    route.fulfill({ contentType: "text/html", body: "<title>Report page</title><p>Report page</p>" }),
  );
  const token = mintModuleToken({ secret: "stub", userId: "u", entityId: ENTITY, entityName: NAME });
  await page.goto(`/landing?${new URLSearchParams({ token, entity_id: ENTITY, entity_name: NAME, next: HOME_PATH })}`);
  await expect(page.getByRole("heading", { name: "Report Calendar" })).toBeVisible();
}

const toast = (page: Page, text: string | RegExp) => page.locator("[data-toast-type]").filter({ hasText: text });

test("the page loads with no console error - a hydration mismatch included", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(e.message));
  await enterWith(page, homeAnswer());
  // Arriving through /landing renders the page in the browser only; a reload is a full server
  // render that the browser then hydrates - where a mismatch shows (the cookie is set by now).
  await page.reload();
  await expect(page.getByRole("heading", { name: "Report Calendar" })).toBeVisible();
  // the header's links read the cookie and the origin, so they are filled in after hydration
  await expect(page.getByRole("link", { name: "Back to your companies" })).toHaveAttribute("href", /\/handoff\/minty-web/);
  // My Profile is minty-web's, through the hand-off - never Flask's /profile
  const profile = page.getByRole("link", { name: "My Profile" });
  await expect(profile).toHaveAttribute("href", /\/handoff\/minty-web\?/);
  await expectHubHandoff(profile, "/profile", ENTITY);
  expect(errors).toEqual([]);
});

test("Flask's header: the company's initials, the person's, the menu", async ({ page }) => {
  await enterWith(page, homeAnswer());
  await expect(page.getByRole("heading", { level: 1, name: "EPCS" })).toBeVisible();
  await expect(page.getByRole("link", { name: "My Profile" })).toHaveText("TT");
  await expect(page.getByRole("button", { name: "Open navigation menu" })).toBeVisible();
  await expect(page.getByText("1 user", { exact: true })).toBeVisible();
});

test("Quick Actions count the company's people", async ({ page }) => {
  await enterWith(page, homeAnswer({ user_count: 3 }));
  await expect(page.getByText("3 users", { exact: true })).toBeVisible();
});

test("a deposit yesterday is confirmed before today's report, and a change is sent", async ({ page }) => {
  let sent: Json | null = null;
  await enterWith(page, homeAnswer(), async (body, route) => {
    sent = body;
    await route.fulfill({ json: { status: "success", message: "ok", next_transaction_date: TODAY } });
  });

  await expect(page.getByText("HKD1,250.50")).toBeVisible();
  await expect(page.getByRole("button", { name: "12 Oct 2026, not submitted" })).toBeVisible();

  await page.getByRole("button", { name: "Start New Report" }).click();
  const dialog = page.getByRole("dialog", { name: "Before You Start" });
  await expect(dialog).toContainText("Previous report submitted by Olive");
  await expect(dialog).toContainText("HKD300.00");
  await expect(dialog).toContainText("HSBC Current (***-123)");
  await expect(dialog).toContainText("13 Oct 2026");

  await dialog.getByRole("button", { name: "Proceed" }).click();
  await expect(toast(page, "Please select a confirmation option")).toBeVisible();

  await dialog.getByText("No, there was a change in the details").click();
  await expect(dialog).toContainText("will be reversed in Xero");
  await dialog.getByRole("button", { name: "Proceed" }).click();

  const amount = page.getByRole("dialog", { name: "Deposit to Bank" });
  const field = amount.getByRole("textbox", { name: /Deposit Amount/ });
  await field.fill("1250.555");
  await expect(field).toHaveValue("1,250.55");
  await field.fill("250.5");
  await field.blur();
  await expect(field).toHaveValue("250.50");
  await amount.getByRole("button", { name: "Proceed" }).click();

  await expect(page).toHaveURL(/\/petty-cash\/reports\/new\/opening\?transaction_date=2026-10-14/);
  expect(sent).toEqual({ kind: "change", date: "2026-10-13", amount: 250.5 });
});

test("a deposit higher than the previous one is refused as Flask did", async ({ page }) => {
  await enterWith(page, homeAnswer(), async () => {
    throw new Error("must not be sent");
  });
  await page.getByRole("button", { name: "Start New Report" }).click();
  const dialog = page.getByRole("dialog", { name: "Before You Start" });
  await dialog.getByText("No, there was a change in the details").click();
  await dialog.getByRole("button", { name: "Proceed" }).click();
  const amount = page.getByRole("dialog", { name: "Deposit to Bank" });
  await amount.getByRole("textbox", { name: /Deposit Amount/ }).fill("400");
  await amount.getByRole("button", { name: "Proceed" }).click();
  await expect(toast(page, "The deposit can't be higher than the previous one.")).toBeVisible();
  await expect(amount).toHaveCount(0);
});

test("a refused correction is said in a toast", async ({ page }) => {
  await enterWith(page, homeAnswer(), async (_body, route) => {
    await route.fulfill({ status: 409, json: { error: "Configure the Deposit Bank Account first." } });
  });
  await page.getByRole("button", { name: "Start New Report" }).click();
  const dialog = page.getByRole("dialog", { name: "Before You Start" });
  await dialog.getByText("No, there was no deposit").click();
  await dialog.getByRole("button", { name: "Proceed" }).click();
  await expect(toast(page, "Configure the Deposit Bank Account first.")).toBeVisible();
});

test("a deposit the company cannot correct offers only 'as stated'", async ({ page }) => {
  await enterWith(
    page,
    homeAnswer({
      latest: { ...(homeAnswer().latest as Json), deposit_correction_missing_settings: ["Deposit Bank Account"], can_correct_deposit: false },
    }),
  );
  await page.getByRole("button", { name: "Start New Report" }).click();
  const dialog = page.getByRole("dialog", { name: "Before You Start" });
  await expect(dialog).toContainText("Deposit cannot be corrected");
  await expect(dialog.getByRole("link", { name: "Settings → Petty Cash" })).toHaveAttribute("href", /^\/entity\/[0-9a-f]{8}\/[^/]+\/settings\/petty-cash$/);
  await expect(dialog.getByRole("radio", { name: "No, there was no deposit" })).toBeDisabled();
  await dialog.getByText("Yes, amount deposited as stated").click();
  await dialog.getByRole("button", { name: "Proceed" }).click();
  await expect(page).toHaveURL(/new\/opening\?transaction_date=2026-10-14/);
});

test("a day out of sequence is refused with Flask's sentence", async ({ page }) => {
  await enterWith(
    page,
    homeAnswer({ published: { "2026-10-12": { id: "x", closing_balance: 5, bank_deposit: 0, xero_integrated: false, submitter_first_name: null } } }),
  );
  await page.getByRole("button", { name: "Start New Report" }).click();
  await expect(
    toast(page, "Transaction date must be 2026-10-13, the day after your last submitted report (2026-10-12)."),
  ).toBeVisible();
});

test("a draft shows its progress and continues where it was left", async ({ page }) => {
  await enterWith(
    page,
    homeAnswer({
      draft: { id: "d", current_section: "expenses", completed_sections: ["opening", "sales"], last_edit_seconds: 300 },
      draft_date: TODAY,
    }),
  );
  await expect(page.getByText("Pick up where you left off")).toBeVisible();
  await expect(page.getByText("2/6 Complete")).toBeVisible();
  await expect(page.getByText("14 Oct 2026 Wed")).toBeVisible();
  await expect(page.getByText("Last edit 5 mins ago")).toBeVisible();
  await expect(page.getByRole("button", { name: "Start New Report" })).toHaveCount(0);
  // the draft's own step, in this app - never Flask's resume page
  await page.getByRole("button", { name: "Continue Report" }).click();
  await expect(page).toHaveURL((url) => url.pathname + url.search === `${HOME_PATH}/reports/new/expense?transaction_date=2026-10-14`);
});

test("a draft with no step yet continues at Opening, in this app", async ({ page }) => {
  await enterWith(
    page,
    homeAnswer({
      draft: { id: "d", current_section: null, completed_sections: [], last_edit_seconds: 60 },
      draft_date: "2026-10-13",
    }),
  );
  await page.getByRole("button", { name: "Continue Report" }).click();
  await expect(page).toHaveURL((url) => url.pathname + url.search === `${HOME_PATH}/reports/new/opening?transaction_date=2026-10-13`);
});

test("a submitted day shows its balance and opens its report, in this app", async ({ page }) => {
  // the report's own view (09_submitted_report covers it): only enough of GET /reports/<id> to draw
  await page.route("**/api/petty-cash/v1/companies/*/reports/a", (route) =>
    route.fulfill({
      json: {
        report_id: "a",
        transaction_date: "2026-10-10",
        currency_code: "HKD",
        status: "submitted",
        publishing_status: "completed",
        xero_integrated: true,
        was_published: true,
        sales: { methods: [], cash: 0, total: 0, yesterday_total: null, history: [] },
        expenses: { lines: [], total: 0 },
        cash: { counted: 900, safe_box: 0, difference: { amount: 0, kind: "none", reason: "" } },
        permissions: { edit: false, delete: false, publish: true, share: true },
      },
    }),
  );
  await enterWith(page, homeAnswer());
  await page.getByRole("button", { name: "10 Oct 2026, submitted" }).click();
  await expect(page.getByText("10 Oct 2026")).toBeVisible();
  await expect(page.getByText("HKD900.00")).toBeVisible();
  await page.getByRole("button", { name: "View Report" }).click();
  await expect(page).toHaveURL(new RegExp(`${HOME_PATH}/reports/a/summary$`));
  await expect(page.getByRole("heading", { name: "Summary", exact: true })).toBeVisible();
});

test("missing Xero settings hold the page with the way to set them up", async ({ page }) => {
  await enterWith(page, homeAnswer({ xero_settings: { complete: false, missing: ["Main Bank Account", "Cash Sale Contact"] } }));
  const dialog = page.getByRole("dialog", { name: "Setup Required" });
  await expect(dialog).toContainText("Main Bank Account");
  await page.keyboard.press("Escape");
  await expect(dialog).toBeVisible();
  // this app's settings page, whose Xero card leads on to Flask's
  await expect(dialog.getByRole("link", { name: "Set Up Settings" })).toHaveAttribute("href", /^\/entity\/[0-9a-f]{8}\/[^/]+\/settings\/petty-cash$/);
});

test("read-only access cannot start a report", async ({ page }) => {
  await enterWith(page, homeAnswer({ permissions: { read_only: true, correct_deposit: false } }));
  const start = page.getByRole("button", { name: "Start New Report" });
  await expect(start).toBeDisabled();
  await expect(start).toHaveAttribute("title", "Read-only access");
});
