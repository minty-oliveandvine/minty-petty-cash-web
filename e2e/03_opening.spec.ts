// The report wizard's Opening step (components/report/OpeningStep.tsx, Flask's look exactly),
// against a STUBBED Petty Cash API. Needs only `npm run dev`. Flask's pages (Submitted onwards)
// are caught, so nothing leaves the app.

import { expect, test, type Page, type Route } from "@playwright/test";

import { companyRef } from "./companyRef";
import { mintModuleToken } from "./helpers";

const ENTITY = "3d65f186-5ba1-4bf7-a1b0-cc64a113eb5c";
const NAME = "E2E Petty Cash Shop";
const BASE = `/entity/${companyRef(ENTITY, NAME)}/petty-cash`;
const DAY = "2026-10-13";

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

const HOME = {
  server_today: "2026-10-14",
  user_count: 1,
  currency_code: "HKD",
  latest: { date: null, closing_balance: 0, deposit: 0, deposit_bank_name: "No deposit", deposit_bank_number: "", deposit_correction_missing_settings: [], can_correct_deposit: true, submitter_first_name: null },
  draft: null,
  draft_date: null,
  published: {},
  today_has_report: false,
  today_is_latest_report: false,
  xero_settings: { complete: true, missing: [] },
  permissions: { read_only: false, correct_deposit: true },
};

async function openWith(page: Page, answer: Json, onSave?: (body: Json, route: Route) => Promise<void>) {
  await page.route("**/api/petty-cash/v1/companies/*/reports/opening**", async (route) => {
    if (route.request().method() === "PUT") {
      if (onSave) await onSave(route.request().postDataJSON() as Json, route);
      else await route.fulfill({ json: { draft_id: "d", transaction_date: DAY, current_section: "sales", completed_sections: ["opening"], next: "sales" } });
      return;
    }
    await route.fulfill({ json: answer });
  });
  await page.route("**/api/petty-cash/v1/companies/*/home", (route) => route.fulfill({ json: HOME }));
  // This app's own Sales step (e2e/04_sales.spec.ts covers it): a quiet stub, so Save & Next lands
  // on it without reading anything real.
  await page.route("**/api/petty-cash/v1/companies/*/reports/sales**", (route) =>
    route.fulfill({ json: { transaction_date: DAY, currency_code: "HKD", draft: null, methods: [], cash_sales: null } }),
  );
  await page.route("**/api/me/profile**", (route) => route.fulfill({ json: { user: { name: "Tess Tester", initials: "TT" } } }));
  // a Flask page address: nothing here opens one (Flask is a backend only), so a regression lands on this stub, never Flask
  await page.route(/\/entity\/[0-9a-f-]{36}\/petty-cash\/reports\//, (route) =>
    route.fulfill({ contentType: "text/html", body: "<title>Flask page</title><p>Flask page</p>" }),
  );
  const token = mintModuleToken({ secret: "stub", userId: "u", entityId: ENTITY, entityName: NAME });
  const next = `${BASE}/reports/new/opening?transaction_date=${DAY}`;
  await page.goto(`/landing?${new URLSearchParams({ token, entity_id: ENTITY, entity_name: NAME, next })}`);
  await expect(page.getByRole("heading", { name: "Opening" })).toBeVisible();
}

const toast = (page: Page, text: string | RegExp) => page.locator("[data-toast-type]").filter({ hasText: text });

test("Flask's report header and the balances the day opens from", async ({ page }) => {
  await openWith(page, openingAnswer());
  await expect(page.getByText("13 OCT")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1, name: "EPCS" })).toBeVisible();
  await expect(page.getByText("Draft", { exact: true })).toBeVisible();
  await expect(page.getByText("Starting Cash Balance")).toBeVisible();
  await expect(page.getByText("HKD 1,200.00").first()).toBeVisible();
  await expect(page.getByText("HKD 1,000.00")).toBeVisible(); // the till: 1,200 less the 200 safebox
  await expect(page.getByText("HKD 200.00")).toBeVisible();
  await expect(page.getByRole("radio", { name: "Personal" })).toBeChecked();
});

test("the addition is cleaned as typed, grouped on leaving, and moves the Opening Cash Balance", async ({ page }) => {
  let sent: Json | null = null;
  await openWith(page, openingAnswer(), async (body, route) => {
    sent = body;
    await route.fulfill({ json: { draft_id: "d", transaction_date: DAY, current_section: "sales", completed_sections: ["opening"], next: "sales" } });
  });
  const field = page.getByRole("textbox", { name: "Addition to Cash Drawer" });
  await field.fill("12a50.555");
  await expect(field).toHaveValue("1250.55");
  await field.blur();
  await expect(field).toHaveValue("1,250.55");
  await expect(page.getByText("HKD 2,450.55")).toBeVisible();
  await page.getByRole("radio", { name: "Company Bank" }).check();

  await page.getByRole("button", { name: "Save & Next" }).click();

  await expect(page).toHaveURL(/\/petty-cash\/reports\/new\/sale\?transaction_date=2026-10-13/);
  expect(sent).toEqual({ transaction_date: DAY, cash_addition: 1250.55, withdrawal: "company", action: "next" });
});

test("a draft brings its own values", async ({ page }) => {
  await openWith(
    page,
    openingAnswer({
      draft: { id: "d", status: "draft", current_section: "sales", completed_sections: ["opening"], xero_integrated: false, publishing_status: "unpublished" },
      cash_addition: 30,
      withdrawal: "company",
    }),
  );
  await expect(page.getByRole("textbox", { name: "Addition to Cash Drawer" })).toHaveValue("30.00");
  await expect(page.getByRole("radio", { name: "Company Bank" })).toBeChecked();
  await expect(page.getByText("HKD 1,230.00")).toBeVisible();
});

test("unsaved changes hold the stepper back", async ({ page }) => {
  await openWith(
    page,
    openingAnswer({
      draft: { id: "d", status: "draft", current_section: "sales", completed_sections: ["opening"], xero_integrated: false, publishing_status: "unpublished" },
    }),
  );
  await page.getByRole("textbox", { name: "Addition to Cash Drawer" }).fill("5");
  await page.getByRole("link", { name: "Sales, next" }).click();
  await expect(toast(page, "You have unsaved changes. Please save your changes first.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Opening" })).toBeVisible();
});

test("Save & Exit goes home", async ({ page }) => {
  let sent: Json | null = null;
  await openWith(page, openingAnswer(), async (body, route) => {
    sent = body;
    await route.fulfill({ json: { draft_id: "d", transaction_date: DAY, current_section: "opening", completed_sections: ["opening"], next: "dashboard" } });
  });
  await page.getByRole("button", { name: "Save & Exit" }).click();
  await expect(page).toHaveURL(new RegExp(`${BASE}$`));
  expect(sent).toMatchObject({ action: "exit" });
});

test("a day the rules refuse goes to the dashboard and says why there", async ({ page }) => {
  const why = "Reports go one day at a time - this one needs to be 2026-10-12, the day after your last submitted report (2026-10-11).";
  await openWith(page, openingAnswer(), async (_body, route) => {
    await route.fulfill({ status: 409, json: { error: why, to: "dashboard" } });
  });
  await page.getByRole("button", { name: "Save & Next" }).click();
  await expect(page).toHaveURL(new RegExp(`${BASE}$`));
  await expect(toast(page, why)).toBeVisible();
});

test("a negative yesterday holds the page on Fix Negative Balance", async ({ page }) => {
  await openWith(page, openingAnswer({ starting_cash_balance: -120, yesterday_closing_balance: -120, safebox_balance: 0 }));
  const dialog = page.getByRole("alertdialog", { name: "Fix Negative Balance" });
  await expect(dialog).toContainText("(HKD 120.00)");
  await expect(dialog).toContainText("(Balance: HKD -120.00)");
  await dialog.getByRole("button", { name: /Dashboard/ }).click();
  await expect(page).toHaveURL(new RegExp(`${BASE}$`));
});

test("the page reloads with no console error", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(e.message));
  await openWith(page, openingAnswer());
  await page.reload();
  await expect(page.getByRole("heading", { name: "Opening" })).toBeVisible();
  expect(errors).toEqual([]);
});
