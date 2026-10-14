// The dashboard (components/dashboard), against a STUBBED Petty Cash API: every state Flask's
// dashboard had - a draft, a deposit to confirm, days not submitted, setup required - without
// a database. Needs only `npm run dev`. Navigations into Flask's pages are caught and answered
// here, so nothing leaves the app.

import { expect, test, type Page, type Route } from "@playwright/test";

import { companyRef } from "./companyRef";
import { mintModuleToken } from "./helpers";

const ENTITY = "3d65f186-5ba1-4bf7-a1b0-cc64a113eb5c";
const NAME = "E2E Petty Cash Shop";
const HOME_PATH = `/entity/${companyRef(ENTITY, NAME)}/petty-cash`;
const TODAY = "2026-10-14";

type Json = Record<string, unknown>;

function homeAnswer(over: Json = {}): Json {
  return {
    server_today: TODAY,
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
  // Flask's wizard and summary pages: caught, so the spec can read where the app went.
  await page.route(/\/entity\/[^/]+\/petty-cash\/reports\//, (route) =>
    route.fulfill({ contentType: "text/html", body: "<title>Flask page</title><p>Flask page</p>" }),
  );
  const token = mintModuleToken({ secret: "stub", userId: "u", entityId: ENTITY, entityName: NAME });
  await page.goto(`/landing?${new URLSearchParams({ token, entity_id: ENTITY, entity_name: NAME, next: HOME_PATH })}`);
  await expect(page.getByRole("heading", { name: "Report Calendar" })).toBeVisible();
}

test("a deposit yesterday is confirmed before today's report, and a change is sent", async ({ page }) => {
  let sent: Json | null = null;
  await enterWith(page, homeAnswer(), async (body, route) => {
    sent = body;
    await route.fulfill({ json: { status: "success", message: "ok", next_transaction_date: TODAY } });
  });

  await expect(page.getByText("HKD1,250.50")).toBeVisible();
  // the 11th and 12th were never submitted
  await expect(page.getByRole("button", { name: "12 Oct 2026, not submitted" })).toBeVisible();

  await page.getByRole("button", { name: "Start New Report" }).click();
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

  await expect(page).toHaveURL(/\/petty-cash\/reports\/new\/opening\?transaction_date=2026-10-14/);
  expect(sent).toEqual({ kind: "change", date: "2026-10-13", amount: 250.55 });
});

test("a refused correction is said in the dialog, not lost", async ({ page }) => {
  await enterWith(page, homeAnswer(), async (_body, route) => {
    await route.fulfill({ status: 409, json: { error: "Configure the Deposit Bank Account first." } });
  });
  await page.getByRole("button", { name: "Start New Report" }).click();
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
  await page.getByRole("button", { name: "Start New Report" }).click();
  const dialog = page.getByRole("dialog", { name: "Before You Start" });
  await expect(dialog).toContainText("Deposit cannot be corrected");
  await expect(dialog.getByRole("radio", { name: "No, there was no deposit" })).toBeDisabled();
  await dialog.getByText("Yes, amount deposited as stated").click();
  await dialog.getByRole("button", { name: "Proceed" }).click();
  await expect(page).toHaveURL(/new\/opening\?transaction_date=2026-10-14/);
});

test("a day out of sequence is refused with Flask's sentence", async ({ page }) => {
  await enterWith(page, homeAnswer({ published: { "2026-10-12": { id: "x", closing_balance: 5, bank_deposit: 0, xero_integrated: false, submitter_first_name: null } } }));
  await page.getByRole("button", { name: "Start New Report" }).click();
  await expect(page.getByText("Transaction date must be 2026-10-13, the day after your last submitted report (2026-10-12).")).toBeVisible();
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
  await page.getByRole("button", { name: "Continue Report" }).click();
  await expect(page).toHaveURL(/\/petty-cash\/reports\/resume\?transaction_date=2026-10-14/);
});

test("a submitted day shows its balance and opens its report", async ({ page }) => {
  await enterWith(page, homeAnswer());
  await page.getByRole("button", { name: "10 Oct 2026, submitted" }).click();
  await expect(page.getByText("10 Oct 2026")).toBeVisible();
  await expect(page.getByText("HKD900.00")).toBeVisible();
  await page.getByRole("button", { name: "View Report" }).click();
  await expect(page).toHaveURL(/\/petty-cash\/reports\/summary\?transaction_date=2026-10-10/);
});

test("missing Xero settings hold the page with the way to set them up", async ({ page }) => {
  await enterWith(page, homeAnswer({ xero_settings: { complete: false, missing: ["Main Bank Account", "Cash Sale Contact"] } }));
  const dialog = page.getByRole("alertdialog", { name: "Setup Required" });
  await expect(dialog).toContainText("Main Bank Account");
  await page.keyboard.press("Escape");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("link", { name: "Set Up Settings" })).toHaveAttribute("href", /\/settings\/petty-cash$/);
});

test("read-only access cannot start a report", async ({ page }) => {
  await enterWith(page, homeAnswer({ permissions: { read_only: true, correct_deposit: false } }));
  await expect(page.getByRole("button", { name: "Start New Report" })).toBeDisabled();
  await expect(page.getByText("Read-only access")).toBeVisible();
});
