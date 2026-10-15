// The report wizard's Bank Deposit step (components/report/DepositStep.tsx, Flask's look exactly),
// against a STUBBED Petty Cash API. Needs only `npm run dev`. Flask's pages (Submitted onwards) are
// caught, so nothing leaves the app.

import { expect, test, type Page, type Route } from "@playwright/test";

import { companyRef } from "./companyRef";
import { expectNoHorizontalScroll, mintModuleToken } from "./helpers";

const ENTITY = "3d65f186-5ba1-4bf7-a1b0-cc64a113eb5c";
const NAME = "E2E Petty Cash Shop";
const BASE = `/entity/${companyRef(ENTITY, NAME)}/petty-cash`;
const DAY = "2026-10-13";
const API = "**/api/petty-cash/v1/companies/*";

type Json = Record<string, unknown>;

const DRAFT = { id: "d", status: "draft", current_section: "deposit", completed_sections: ["opening", "sales", "expenses"], xero_integrated: false, publishing_status: "unpublished" };

/** Opening 100 + addition 50 + cash sales 30 - expenses 25 = 155 on hand. */
function depositAnswer(over: Json = {}): Json {
  return {
    transaction_date: DAY,
    currency_code: "HKD",
    draft: DRAFT,
    opening_balance: 100,
    cash_addition: 50,
    cash_sales: 30,
    expenses: 25,
    bank_deposit: 0,
    cash_on_hand: 155,
    expected_cash: 155,
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

const CASH_COUNT = {
  ...depositAnswer(),
  denominations: [{ id: "n100", value: 100, kind: "note", count: 0 }],
  safe_box_balance: 0,
  discrepancy: { amount: 0, kind: "none", reason: "" },
};

const saved = (next: string) => ({ draft_id: "d", transaction_date: DAY, current_section: next === "cash_count" ? "cash_count" : "deposit", completed_sections: ["opening", "sales", "expenses", "deposit"], next });

type Handlers = { onSave?: (body: Json, route: Route) => Promise<void>; onRead?: (route: Route) => Promise<void> };

async function stub(page: Page, answer: Json, h: Handlers = {}) {
  await page.route(`${API}/reports/deposit**`, async (route) => {
    if (route.request().method() === "PUT") {
      if (h.onSave) await h.onSave(route.request().postDataJSON() as Json, route);
      else await route.fulfill({ json: saved("cash_count") });
      return;
    }
    if (h.onRead) await h.onRead(route);
    else await route.fulfill({ json: answer });
  });
  await page.route(`${API}/reports/opening**`, (route) => route.fulfill({ json: OPENING }));
  await page.route(`${API}/reports/sales**`, (route) => route.fulfill({ json: { transaction_date: DAY, currency_code: "HKD", draft: DRAFT, methods: [], cash_sales: 30 } }));
  await page.route(`${API}/reports/expenses**`, (route) =>
    route.fulfill({ json: { transaction_date: DAY, currency_code: "HKD", draft: DRAFT, lines: [], total: 25, suppliers: [], accounts: [], permissions: { create_supplier: false } } }),
  );
  // This app's own Cash Count step (e2e/07_cash_count.spec.ts covers it): a quiet stub.
  await page.route(`${API}/reports/cash-count**`, (route) => route.fulfill({ json: CASH_COUNT }));
  await page.route(`${API}/home`, (route) => route.fulfill({ json: HOME }));
  await page.route("**/api/me/profile**", (route) => route.fulfill({ json: { user: { name: "Tess Tester", initials: "TT" } } }));
  // Flask's pages (Submitted onwards): caught.
  await page.route(/\/entity\/[0-9a-f-]{36}\/petty-cash\/reports\//, (route) =>
    route.fulfill({ contentType: "text/html", body: "<title>Flask page</title><p>Flask page</p>" }),
  );
}

async function enter(page: Page, next = `${BASE}/reports/new/deposit?transaction_date=${DAY}`) {
  const token = mintModuleToken({ secret: "stub", userId: "u", entityId: ENTITY, entityName: NAME });
  await page.goto(`/landing?${new URLSearchParams({ token, entity_id: ENTITY, entity_name: NAME, next })}`);
}

async function openWith(page: Page, answer: Json, h: Handlers = {}) {
  await stub(page, answer, h);
  await enter(page);
  await expect(page.getByRole("heading", { name: "Deposit to Bank" })).toBeVisible();
}

const toast = (page: Page, text: string | RegExp) => page.locator("[data-toast-type]").filter({ hasText: text });
const field = (page: Page) => page.getByRole("textbox", { name: "Deposit Amount" });

test("Flask's page: the illustration, the cash on hand and the amount field", async ({ page }) => {
  await openWith(page, depositAnswer());
  await expect(page.getByText("13 OCT")).toBeVisible();
  await expect(page.getByText("Draft", { exact: true })).toBeVisible();
  await expect(page.getByRole("img", { name: "Deposit" })).toBeVisible();
  await expect(page.getByText("Current Balance:")).toBeVisible();
  await expect(page.getByText("HKD155.00")).toBeVisible();
  await expect(field(page)).toHaveAttribute("placeholder", "0.00");
  await expect(field(page)).toHaveValue("");
  await expect(page.getByRole("button", { name: "Save & Next" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Save & Exit" })).toBeVisible();
  await expectNoHorizontalScroll(page);
});

test("a saved deposit comes back grouped", async ({ page }) => {
  await openWith(page, depositAnswer({ bank_deposit: 1200.5, cash_on_hand: 2000, expected_cash: 799.5 }));
  await expect(field(page)).toHaveValue("1,200.50");
});

test("the limit is said as you type, and nothing is sent past it", async ({ page }) => {
  let saves = 0;
  await openWith(page, depositAnswer(), {
    onSave: async (_body, route) => {
      saves += 1;
      await route.fulfill({ json: saved("cash_count") });
    },
  });
  const message = page.getByText("The deposit can't be more than the cash on hand. Enter HKD155.00 or less.");
  await field(page).fill("155");
  await expect(message).toHaveCount(0);
  await field(page).fill("155.01");
  await expect(message).toBeVisible();
  await expect(field(page)).toHaveAttribute("aria-invalid", "true");
  await page.getByRole("button", { name: "Save & Next" }).click();
  await expect(field(page)).toBeFocused();
  await page.getByRole("button", { name: "Save & Exit" }).click();
  expect(saves).toBe(0);
  await field(page).fill("150");
  await expect(message).toHaveCount(0);
});

test("the server's 422 shows on the field", async ({ page }) => {
  const why = "The deposit can't be more than the cash on hand. Enter HKD120.00 or less.";
  await openWith(page, depositAnswer(), {
    onSave: (_body, route) => route.fulfill({ status: 422, json: { error: why, field: "bank_deposit" } }),
  });
  await field(page).fill("150");
  await page.getByRole("button", { name: "Save & Next" }).click();
  await expect(page.getByText(why)).toBeVisible();
  await expect(field(page)).toBeFocused();
  await field(page).fill("100");
  await expect(page.getByText(why)).toHaveCount(0);
});

test("Save & Next goes on to Cash Count in this app", async ({ page }) => {
  let sent: Json | null = null;
  await openWith(page, depositAnswer(), {
    onSave: async (body, route) => {
      sent = body;
      await route.fulfill({ json: saved("cash_count") });
    },
  });
  await field(page).fill("100.5");
  await field(page).blur();
  await expect(field(page)).toHaveValue("100.50");
  await page.getByRole("button", { name: "Save & Next" }).click();
  await expect(page).toHaveURL(new RegExp(`${BASE}/reports/new/cash-count\\?transaction_date=${DAY}$`));
  await expect(page.getByRole("heading", { name: "Cash Count" })).toBeVisible();
  expect(sent).toEqual({ transaction_date: DAY, bank_deposit: 100.5, action: "next" });
});

test("Save & Exit goes home", async ({ page }) => {
  let sent: Json | null = null;
  await openWith(page, depositAnswer(), {
    onSave: async (body, route) => {
      sent = body;
      await route.fulfill({ json: saved("dashboard") });
    },
  });
  await page.getByRole("button", { name: "Save & Exit" }).click();
  await expect(page).toHaveURL(new RegExp(`${BASE}$`));
  expect(sent).toEqual({ transaction_date: DAY, bank_deposit: 0, action: "exit" });
});

test("a negative cash on hand holds the page on Fix Negative Balance", async ({ page }) => {
  await openWith(page, depositAnswer({ opening_balance: 10, cash_addition: 0, cash_sales: 5, expenses: 27, cash_on_hand: -12, expected_cash: -12 }));
  const dialog = page.getByRole("alertdialog", { name: "Fix Negative Balance" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("(HKD12.00)")).toBeVisible();
  await expect(dialog.getByText("Cash balance cannot be negative. Choose from below to edit the error:")).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Opening (Cash in: HKD 0.00)" })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Sales (Cash in: HKD 5.00)" })).toBeVisible();
  // it cannot be dismissed
  await page.keyboard.press("Escape");
  await page.mouse.click(5, 5);
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Expenses (Cash out: HKD 27.00)" }).click();
  await expect(page).toHaveURL(new RegExp(`${BASE}/reports/new/expense\\?transaction_date=${DAY}$`));
  await expect(page.getByRole("heading", { name: "Expenses", exact: true })).toBeVisible();
});

test("unsaved changes hold the stepper back", async ({ page }) => {
  await openWith(page, depositAnswer());
  await field(page).fill("5");
  await page.getByRole("link", { name: /^Expenses/ }).click();
  await expect(toast(page, "You have unsaved changes. Please save your changes first.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Deposit to Bank" })).toBeVisible();
});

test("a day with no draft goes back to Opening and says why", async ({ page }) => {
  const why = "I don't see a draft yet - let's start with the opening entry.";
  await stub(page, depositAnswer(), { onRead: (route) => route.fulfill({ status: 409, json: { error: why, to: "opening" } }) });
  await enter(page);
  await expect(page).toHaveURL(new RegExp(`${BASE}/reports/new/opening\\?transaction_date=${DAY}$`));
  await expect(page.getByRole("heading", { name: "Opening" })).toBeVisible();
  await expect(toast(page, why)).toBeVisible();
});

test("Expenses' Save & Next lands here without leaving the app", async ({ page }) => {
  await stub(page, depositAnswer());
  await page.route(`${API}/reports/expenses**`, async (route) => {
    if (route.request().method() === "PUT") {
      await route.fulfill({ json: { draft_id: "d", transaction_date: DAY, current_section: "deposit", completed_sections: ["opening", "sales", "expenses"], next: "deposit" } });
      return;
    }
    await route.fulfill({ json: { transaction_date: DAY, currency_code: "HKD", draft: DRAFT, lines: [], total: 0, suppliers: [], accounts: [], permissions: { create_supplier: false } } });
  });
  await enter(page, `${BASE}/reports/new/expense?transaction_date=${DAY}`);
  await expect(page.getByRole("heading", { name: "Expenses", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Save & Next" }).click();
  await expect(page).toHaveURL(new RegExp(`${BASE}/reports/new/deposit\\?transaction_date=${DAY}$`));
  await expect(page.getByRole("heading", { name: "Deposit to Bank" })).toBeVisible();
});

test("the page reloads with no console error", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(e.message));
  await openWith(page, depositAnswer());
  await page.reload();
  await expect(page.getByRole("heading", { name: "Deposit to Bank" })).toBeVisible();
  expect(errors).toEqual([]);
});
