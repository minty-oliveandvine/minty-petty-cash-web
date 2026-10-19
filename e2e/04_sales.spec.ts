// The report wizard's Sales step (components/report/SalesStep.tsx, Flask's look exactly), against a
// STUBBED Petty Cash API. Needs only `npm run dev`. Flask's pages (Submitted onwards) are caught,
// so nothing leaves the app.

import { expect, test, type Page, type Route } from "@playwright/test";

import { companyRef } from "./companyRef";
import { mintModuleToken } from "./helpers";

const ENTITY = "3d65f186-5ba1-4bf7-a1b0-cc64a113eb5c";
const NAME = "E2E Petty Cash Shop";
const BASE = `/entity/${companyRef(ENTITY, NAME)}/petty-cash`;
const DAY = "2026-10-13";

type Json = Record<string, unknown>;

const DRAFT = { id: "d", status: "draft", current_section: "sales", completed_sections: ["opening"], xero_integrated: false, publishing_status: "unpublished" };

const method = (value_name: string, name: string, type: string, amount: number | null = null) => ({ sale_id: value_name, name, value_name, type, amount });

function salesAnswer(over: Json = {}): Json {
  return {
    transaction_date: DAY,
    currency_code: "HKD",
    draft: DRAFT,
    methods: [
      method("visa_sales", "Visa", "electronic"),
      method("foodpanda_sales", "Food Panda", "delivery"),
      method("wechat_sales", "WeChat Pay", "electronic"),
      method("openrice_sales", "OpenRice", "delivery"),
      method("deliveroo_sales", "Deliveroo", "delivery"),
    ],
    cash_sales: null,
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

const OPENING = { transaction_date: DAY, currency_code: "HKD", draft: DRAFT, starting_cash_balance: 0, yesterday_closing_balance: 0, safebox_balance: 0, cash_addition: null, withdrawal: "personal" };

async function openWith(page: Page, answer: Json, onSave?: (body: Json, route: Route) => Promise<void>) {
  await page.route("**/api/petty-cash/v1/companies/*/reports/sales**", async (route) => {
    if (route.request().method() === "PUT") {
      if (onSave) await onSave(route.request().postDataJSON() as Json, route);
      else await route.fulfill({ json: { draft_id: "d", transaction_date: DAY, current_section: "expenses", completed_sections: ["opening", "sales"], next: "expenses" } });
      return;
    }
    await route.fulfill({ json: answer });
  });
  await page.route("**/api/petty-cash/v1/companies/*/reports/opening**", (route) => route.fulfill({ json: OPENING }));
  await page.route("**/api/petty-cash/v1/companies/*/home", (route) => route.fulfill({ json: HOME }));
  // This app's own Expenses step (e2e/05_expenses.spec.ts covers it): a quiet stub, so Save & Next
  // lands on it without reading anything real.
  await page.route("**/api/petty-cash/v1/companies/*/reports/expenses**", (route) =>
    route.fulfill({
      json: { transaction_date: DAY, currency_code: "HKD", draft: DRAFT, lines: [], total: 0, suppliers: [], accounts: [], permissions: { create_supplier: false } },
    }),
  );
  await page.route("**/api/me/profile**", (route) => route.fulfill({ json: { user: { name: "Tess Tester", initials: "TT" } } }));
  // a Flask page address: nothing here opens one (Flask is a backend only), so a regression lands on this stub, never Flask
  await page.route(/\/entity\/[0-9a-f-]{36}\/petty-cash\/reports\//, (route) =>
    route.fulfill({ contentType: "text/html", body: "<title>Flask page</title><p>Flask page</p>" }),
  );
  const token = mintModuleToken({ secret: "stub", userId: "u", entityId: ENTITY, entityName: NAME });
  const next = `${BASE}/reports/new/sale?transaction_date=${DAY}`;
  await page.goto(`/landing?${new URLSearchParams({ token, entity_id: ENTITY, entity_name: NAME, next })}`);
  await expect(page.getByRole("heading", { name: "Sales Entry" })).toBeVisible();
}

const toast = (page: Page, text: string | RegExp) => page.locator("[data-toast-type]").filter({ hasText: text });

test("Flask's sections, its labels and its order", async ({ page }) => {
  await openWith(page, salesAnswer());
  await expect(page.getByText("13 OCT")).toBeVisible();
  await expect(page.getByText("Draft", { exact: true })).toBeVisible();
  for (const heading of ["Electronic Payments", "Delivery Sales", "Cash Sales"]) {
    await expect(page.getByRole("heading", { name: heading })).toBeVisible();
  }
  // Flask title-cases the names: "Wechat Pay", "Openrice"; Deliveroo is not listed
  const labels = await page.locator("label").allTextContents();
  expect(labels).toEqual(["Visa", "Wechat Pay", "Food Panda", "Openrice"]);
  await expect(page.getByRole("textbox", { name: "Cash Sales" })).toHaveAttribute("placeholder", "0.00");
  await expect(page.getByText("Total Electronic Payment Sales")).toBeVisible();
  await expect(page.getByText("HKD0.00")).toHaveCount(3);
});

test("a draft's amounts come back grouped, and zeroes as empty fields", async ({ page }) => {
  await openWith(
    page,
    salesAnswer({
      methods: [method("visa_sales", "Visa", "electronic", 1200.5), method("foodpanda_sales", "Food Panda", "delivery", 0)],
      cash_sales: 300,
    }),
  );
  await expect(page.getByRole("textbox", { name: "Visa" })).toHaveValue("1,200.50");
  await expect(page.getByRole("textbox", { name: "Food Panda" })).toHaveValue("");
  await expect(page.getByRole("textbox", { name: "Cash Sales" })).toHaveValue("300.00");
  await expect(page.getByText("HKD1,200.50")).toBeVisible();
  await expect(page.getByText("HKD300.00")).toBeVisible();
});

test("amounts are cleaned as typed, totalled, and sent by method", async ({ page }) => {
  let sent: Json | null = null;
  await openWith(page, salesAnswer(), async (body, route) => {
    sent = body;
    await route.fulfill({ json: { draft_id: "d", transaction_date: DAY, current_section: "expenses", completed_sections: ["opening", "sales"], next: "expenses" } });
  });
  const visa = page.getByRole("textbox", { name: "Visa" });
  await visa.fill("1a200.555");
  await expect(visa).toHaveValue("1200.55");
  await visa.blur();
  await expect(visa).toHaveValue("1,200.55");
  await page.getByRole("textbox", { name: "Wechat Pay" }).fill("10");
  await page.getByRole("textbox", { name: "Food Panda" }).fill("33.25");
  await page.getByRole("textbox", { name: "Cash Sales" }).fill("500");
  await expect(page.getByText("HKD1,210.55")).toBeVisible();
  await expect(page.getByText("HKD33.25")).toBeVisible();
  await expect(page.getByText("HKD500.00")).toBeVisible();

  await page.getByRole("button", { name: "Save & Next" }).click();

  await expect(page).toHaveURL(/\/petty-cash\/reports\/new\/expense\?transaction_date=2026-10-13/);
  await expect(page.getByRole("heading", { name: "Expenses", exact: true })).toBeVisible();
  expect(sent).toEqual({
    transaction_date: DAY,
    cash_sales: 500,
    amounts: { visa_sales: 1200.55, wechat_sales: 10, foodpanda_sales: 33.25 },
    action: "next",
  });
});

test("unsaved changes hold the stepper back", async ({ page }) => {
  await openWith(page, salesAnswer());
  await page.getByRole("textbox", { name: "Cash Sales" }).fill("5");
  await page.getByRole("link", { name: /^Opening/ }).click();
  await expect(toast(page, "You have unsaved changes. Please save your changes first.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Sales Entry" })).toBeVisible();
});

test("Save & Exit goes home", async ({ page }) => {
  let sent: Json | null = null;
  await openWith(page, salesAnswer(), async (body, route) => {
    sent = body;
    await route.fulfill({ json: { draft_id: "d", transaction_date: DAY, current_section: "sales", completed_sections: ["opening", "sales"], next: "dashboard" } });
  });
  await page.getByRole("button", { name: "Save & Exit" }).click();
  await expect(page).toHaveURL(new RegExp(`${BASE}$`));
  expect(sent).toMatchObject({ action: "exit", cash_sales: 0, amounts: {} });
});

test("a save with no draft goes back to Opening and says why", async ({ page }) => {
  const why = "I don't see a draft yet - let's start with the opening entry.";
  await openWith(page, salesAnswer({ draft: null }), async (_body, route) => {
    await route.fulfill({ status: 409, json: { error: why, to: "opening" } });
  });
  await page.getByRole("button", { name: "Save & Next" }).click();
  await expect(page).toHaveURL(new RegExp(`${BASE}/reports/new/opening\\?transaction_date=${DAY}$`));
  await expect(page.getByRole("heading", { name: "Opening" })).toBeVisible();
  await expect(toast(page, why)).toBeVisible();
});

test("Opening's Save & Next lands here without leaving the app", async ({ page }) => {
  await openWith(page, salesAnswer());
  await page.route("**/api/petty-cash/v1/companies/*/reports/opening**", async (route) => {
    if (route.request().method() === "PUT") {
      await route.fulfill({ json: { draft_id: "d", transaction_date: DAY, current_section: "sales", completed_sections: ["opening"], next: "sales" } });
      return;
    }
    await route.fulfill({ json: OPENING });
  });
  await page.goto(`${BASE}/reports/new/opening?transaction_date=${DAY}`);
  await page.getByRole("button", { name: "Save & Next" }).click();
  await expect(page.getByRole("heading", { name: "Sales Entry" })).toBeVisible();
});

test("the page reloads with no console error", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(e.message));
  await openWith(page, salesAnswer());
  await page.reload();
  await expect(page.getByRole("heading", { name: "Sales Entry" })).toBeVisible();
  expect(errors).toEqual([]);
});
