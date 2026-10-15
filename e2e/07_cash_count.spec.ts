// The report wizard's Cash Count step (components/report/CashCountStep.tsx, Flask's look exactly),
// against a STUBBED Petty Cash API. Needs only `npm run dev`. Flask's pages (Submitted onwards)
// are caught, so nothing leaves the app.

import { expect, test, type Page, type Route } from "@playwright/test";

import { companyRef } from "./companyRef";
import { expectNoHorizontalScroll, mintModuleToken } from "./helpers";

const ENTITY = "3d65f186-5ba1-4bf7-a1b0-cc64a113eb5c";
const NAME = "E2E Petty Cash Shop";
const BASE = `/entity/${companyRef(ENTITY, NAME)}/petty-cash`;
const DAY = "2026-10-13";
const API = "**/api/petty-cash/v1/companies/*";

type Json = Record<string, unknown>;

const DRAFT = { id: "d", status: "draft", current_section: "cash_count", completed_sections: ["opening", "sales", "expenses", "deposit"], xero_integrated: false, publishing_status: "unpublished" };

const DENOMINATIONS = [
  { id: "n1000", value: 1000, kind: "note", count: 0 },
  { id: "n100", value: 100, kind: "note", count: 0 },
  { id: "c1", value: 1, kind: "coin", count: 0 },
  { id: "c050", value: 0.5, kind: "coin", count: 0 },
];

/** Cash on hand 1,511.50 less a 300 deposit: 1,211.50 expected. */
function countAnswer(over: Json = {}): Json {
  return {
    transaction_date: DAY,
    currency_code: "HKD",
    draft: DRAFT,
    opening_balance: 1000,
    cash_addition: 0,
    cash_sales: 600,
    expenses: 88.5,
    bank_deposit: 300,
    cash_on_hand: 1511.5,
    expected_cash: 1211.5,
    denominations: DENOMINATIONS,
    safe_box_balance: 0,
    discrepancy: { amount: 0, kind: "none", reason: "" },
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

const saved = (next: string, discrepancy: Json = { amount: 0, kind: "none" }) => ({
  draft_id: "d",
  transaction_date: DAY,
  current_section: next === "ending" ? "ending" : "cash_count",
  completed_sections: ["opening", "sales", "expenses", "deposit", "cash_count"],
  next,
  discrepancy,
});

type Handlers = { onSave?: (body: Json, route: Route) => Promise<void>; onRead?: (route: Route) => Promise<void> };

async function stub(page: Page, answer: Json, h: Handlers = {}) {
  await page.route(`${API}/reports/cash-count**`, async (route) => {
    if (route.request().method() === "PUT") {
      if (h.onSave) await h.onSave(route.request().postDataJSON() as Json, route);
      else await route.fulfill({ json: saved("ending") });
      return;
    }
    if (h.onRead) await h.onRead(route);
    else await route.fulfill({ json: answer });
  });
  await page.route(`${API}/reports/deposit**`, (route) =>
    route.fulfill({ json: { ...countAnswer(), denominations: undefined, safe_box_balance: undefined, discrepancy: undefined } }),
  );
  await page.route(`${API}/reports/opening**`, (route) => route.fulfill({ json: OPENING }));
  // This app's own Ending step (e2e/08_ending.spec.ts covers it): a quiet stub, so Save & Next lands.
  await page.route(`${API}/reports/close**`, (route) =>
    route.fulfill({
      json: {
        ...countAnswer(),
        sales: { methods: [], cash: 600, total: 600, yesterday_total: null, history: [] },
        expenses: { lines: [], total: 88.5 },
        cash: { bank_deposit: 300, expected: 1211.5, counted: 1211.5, safe_box: 0, difference: { amount: 0, kind: "none", reason: "" } },
        closing_balance: 1211.5,
        problem: null,
      },
    }),
  );
  await page.route(`${API}/home`, (route) => route.fulfill({ json: HOME }));
  await page.route("**/api/me/profile**", (route) => route.fulfill({ json: { user: { name: "Tess Tester", initials: "TT" } } }));
  // Flask's pages (Submitted onwards): caught.
  await page.route(/\/entity\/[0-9a-f-]{36}\/petty-cash\/reports\//, (route) =>
    route.fulfill({ contentType: "text/html", body: "<title>Flask page</title><p>Flask page</p>" }),
  );
}

async function enter(page: Page, next = `${BASE}/reports/new/cash-count?transaction_date=${DAY}`) {
  const token = mintModuleToken({ secret: "stub", userId: "u", entityId: ENTITY, entityName: NAME });
  await page.goto(`/landing?${new URLSearchParams({ token, entity_id: ENTITY, entity_name: NAME, next })}`);
}

async function openWith(page: Page, answer: Json, h: Handlers = {}) {
  await stub(page, answer, h);
  await enter(page);
  await expect(page.getByRole("heading", { name: "Cash Count", exact: true })).toBeVisible();
}

const toast = (page: Page, text: string | RegExp) => page.locator("[data-toast-type]").filter({ hasText: text });
const safebox = (page: Page) => page.getByRole("textbox", { name: "Safebox Cash Balance" });
const cashBox = (page: Page) => page.getByRole("textbox", { name: "Cash Box Balance" });
const reason = (page: Page) => page.getByRole("textbox", { name: "Description" });
const calculator = (page: Page) => page.getByRole("dialog", { name: "Use Calculator" });

/** Count in the calculator and Save. */
async function count(page: Page, rows: Record<string, string>) {
  await page.getByRole("button", { name: "Calculator" }).click();
  const dialog = calculator(page);
  for (const [label, n] of Object.entries(rows)) await dialog.getByRole("textbox", { name: label, exact: true }).fill(n);
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog).toHaveCount(0);
}

test("Flask's page: the expected cash, the two fields, the total and the shortage so far", async ({ page }) => {
  await openWith(page, countAnswer());
  await expect(page.getByText("Expected Cash Count Balance")).toBeVisible();
  await expect(page.getByText("HKD1,211.50").first()).toBeVisible();
  await expect(page.getByRole("img", { name: "Cash Count" })).toBeVisible();
  await expect(page.getByRole("img", { name: "Safe Box" })).toBeVisible();
  await expect(cashBox(page)).toHaveAttribute("placeholder", "Actual Cash Balance");
  await expect(cashBox(page)).toHaveAttribute("readonly", "");
  await expect(safebox(page)).toHaveAttribute("placeholder", "Please enter Balance of the safebox");
  await expect(page.getByText("Total Cash Count")).toBeVisible();
  await expect(page.getByText("HKD0.00")).toBeVisible();
  await expect(page.getByRole("heading", { name: /Discrepancy Details/ })).toBeVisible();
  // nothing counted yet: 1,211.50 short, so the reason is open and asked for
  await expect(page.getByText("Cash Shortage: HKD1,211.50")).toBeVisible();
  await expect(page.getByText("Please review your entries or provide a reason for the discrepancy below.")).toBeVisible();
  await expect(reason(page)).toHaveAttribute("aria-required", "true");
  await expectNoHorizontalScroll(page);
});

test("the calculator: a 0.50 coin, its row totals, and Save fills the cash box", async ({ page }) => {
  await openWith(page, countAnswer());
  await page.getByRole("button", { name: "Calculator" }).click();
  const dialog = calculator(page);
  const labels = await dialog.locator("label").allTextContents();
  expect(labels).toEqual(["HKD1000", "HKD100", "HKD1", "HKD0.50"]);
  const coin = dialog.getByRole("textbox", { name: "HKD0.50", exact: true });
  await coin.fill("3.7x");
  await expect(coin).toHaveValue("37");
  await coin.fill("3");
  await dialog.getByRole("textbox", { name: "HKD1000", exact: true }).fill("1");
  await dialog.getByRole("textbox", { name: "HKD100", exact: true }).fill("2");
  await expect(dialog.getByText("1.50", { exact: true })).toBeVisible();
  await expect(dialog.getByText("200.00", { exact: true })).toBeVisible();
  await expect(dialog.getByText("HKD1,201.50")).toBeVisible();
  // nothing counts until Save: the page still shows the full shortage
  await expect(page.getByText("Cash Shortage: HKD1,211.50")).toBeAttached();
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(cashBox(page)).toHaveValue("HKD1,201.50");
  await expect(page.getByText("Cash Shortage: HKD10.00")).toBeVisible();
});

test("Escape and the X close the calculator without applying", async ({ page }) => {
  await openWith(page, countAnswer());
  await page.getByRole("button", { name: "Calculator" }).click();
  await calculator(page).getByRole("textbox", { name: "HKD1000", exact: true }).fill("5");
  await page.keyboard.press("Escape");
  await expect(calculator(page)).toHaveCount(0);
  await expect(cashBox(page)).toHaveValue("");
  await page.getByRole("button", { name: "Calculator" }).click();
  await expect(calculator(page).getByRole("textbox", { name: "HKD1000", exact: true })).toHaveValue("");
  await calculator(page).getByRole("button", { name: "Close" }).click();
  await expect(calculator(page)).toHaveCount(0);
});

test("a count past the limit is said in the row and not applied", async ({ page }) => {
  await openWith(page, countAnswer());
  await page.getByRole("button", { name: "Calculator" }).click();
  const dialog = calculator(page);
  const row = dialog.getByRole("textbox", { name: "HKD1", exact: true });
  await row.fill("2000000");
  await expect(dialog.getByText("A count can't be more than 1,000,000. Enter 1,000,000 or less.")).toBeVisible();
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(row).toBeFocused();
  await expect(dialog).toBeVisible();
});

test("a surplus is green, and none locks the reason", async ({ page }) => {
  await openWith(page, countAnswer());
  await count(page, { HKD1000: "1", HKD100: "2" });
  await safebox(page).fill("25");
  await expect(page.getByText("Cash Surplus: HKD13.50")).toBeVisible();
  await expect(reason(page)).toHaveAttribute("placeholder", "Description");
  await expect(reason(page)).not.toHaveAttribute("readonly", "");
  await reason(page).fill("Tips jar");
  await safebox(page).fill("11.5");
  await expect(page.getByText(/Cash (Surplus|Shortage)/)).toHaveCount(0);
  await expect(reason(page)).toHaveAttribute("placeholder", "No discrepancy — description not required");
  await expect(reason(page)).toHaveAttribute("readonly", "");
  // the reason for a difference now gone is dropped, as Flask does
  await expect(reason(page)).toHaveValue("");
  await expect(page.getByText("HKD1,211.50").first()).toBeVisible();
});

test("one cent short counts, and Save & Next needs a reason", async ({ page }) => {
  let sent: Json | null = null;
  await openWith(page, countAnswer(), {
    onSave: async (body, route) => {
      sent = body;
      await route.fulfill({ json: saved("ending", { amount: -0.01, kind: "short" }) });
    },
  });
  await count(page, { HKD1000: "1", HKD100: "2", HKD1: "11" });
  await safebox(page).fill("0.49");
  await expect(page.getByText("Cash Shortage: HKD0.01")).toBeVisible();
  await page.getByRole("button", { name: "Save & Next" }).click();
  await expect(toast(page, "Please enter description")).toBeVisible();
  await expect(page.getByText("The count is HKD0.01 short. Add the reason to continue.")).toBeVisible();
  await expect(reason(page)).toBeFocused();
  await expect(reason(page)).toHaveAttribute("aria-invalid", "true");
  expect(sent).toBeNull();
  await reason(page).fill("Rounding at the till");
  await expect(page.getByText("The count is HKD0.01 short. Add the reason to continue.")).toHaveCount(0);
  await page.getByRole("button", { name: "Save & Next" }).click();
  await expect(page).toHaveURL(new RegExp(`${BASE}/reports/new/ending\\?transaction_date=${DAY}$`));
  await expect(page.getByRole("heading", { name: "Summary", exact: true })).toBeVisible();
  expect(sent).toEqual({
    transaction_date: DAY,
    counts: { n1000: 1, n100: 2, c1: 11, c050: 0 },
    safe_box_balance: 0.49,
    discrepancy_reason: "Rounding at the till",
    action: "next",
  });
});

test("Save & Exit keeps a difference without a reason", async ({ page }) => {
  let sent: Json | null = null;
  await openWith(page, countAnswer(), {
    onSave: async (body, route) => {
      sent = body;
      await route.fulfill({ json: saved("dashboard", { amount: -1211.5, kind: "short" }) });
    },
  });
  await page.getByRole("button", { name: "Save & Exit" }).click();
  await expect(page).toHaveURL(new RegExp(`${BASE}$`));
  expect(sent).toMatchObject({ action: "exit", discrepancy_reason: "", safe_box_balance: 0 });
});

test("the server's 422 shows on its field", async ({ page }) => {
  const why = "The count is HKD1,211.50 short. Add the reason to continue.";
  await openWith(page, countAnswer(), {
    onSave: (_body, route) => route.fulfill({ status: 422, json: { error: why, field: "discrepancy_reason" } }),
  });
  await reason(page).fill("x");
  await page.getByRole("button", { name: "Save & Next" }).click();
  await expect(page.getByText(why)).toBeVisible();
  await expect(reason(page)).toBeFocused();
});

test("a saved count comes back: the cash box, the safebox and the reason", async ({ page }) => {
  await openWith(
    page,
    countAnswer({
      denominations: DENOMINATIONS.map((d) => (d.id === "n1000" ? { ...d, count: 1 } : d.id === "c050" ? { ...d, count: 1 } : d)),
      safe_box_balance: 200,
      discrepancy: { amount: -11, kind: "short", reason: "Paid a courier" },
    }),
  );
  await expect(cashBox(page)).toHaveValue("HKD1,000.50");
  await expect(safebox(page)).toHaveValue("200.00");
  await expect(reason(page)).toHaveValue("Paid a courier");
  await expect(page.getByText("Cash Shortage: HKD11.00")).toBeVisible();
  await expect(page.getByText("HKD1,200.50")).toBeVisible();
});

test("a negative expected cash holds the page on Fix Negative Balance", async ({ page }) => {
  await openWith(page, countAnswer({ bank_deposit: 1600, expected_cash: -88.5 }));
  const dialog = page.getByRole("alertdialog", { name: "Fix Negative Balance" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("(HKD88.50)")).toBeVisible();
  await expect(dialog.getByText("Cash balance cannot be negative, let's go back to")).toBeVisible();
  for (const name of ["Opening (Cash in: HKD 0.00)", "Sales (Cash in: HKD 600.00)", "Expenses (Cash out: HKD 88.50)"]) {
    await expect(dialog.getByRole("button", { name })).toBeVisible();
  }
  await page.keyboard.press("Escape");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Deposit (Cash out: HKD 1,600.00)" }).click();
  await expect(page).toHaveURL(new RegExp(`${BASE}/reports/new/deposit\\?transaction_date=${DAY}$`));
  await expect(page.getByRole("heading", { name: "Deposit to Bank" })).toBeVisible();
});

test("unsaved changes hold the stepper back", async ({ page }) => {
  await openWith(page, countAnswer());
  await safebox(page).fill("5");
  await page.getByRole("link", { name: /^Expenses/ }).click();
  await expect(toast(page, "You have unsaved changes. Please save your changes first.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Cash Count", exact: true })).toBeVisible();
});

test("a day with no draft goes back to Opening and says why", async ({ page }) => {
  const why = "I don't see a draft yet - let's start with the opening entry.";
  await stub(page, countAnswer(), { onRead: (route) => route.fulfill({ status: 409, json: { error: why, to: "opening" } }) });
  await enter(page);
  await expect(page).toHaveURL(new RegExp(`${BASE}/reports/new/opening\\?transaction_date=${DAY}$`));
  await expect(page.getByRole("heading", { name: "Opening" })).toBeVisible();
  await expect(toast(page, why)).toBeVisible();
});

test("Expenses → Deposit → Cash Count, all in this app", async ({ page }) => {
  await stub(page, countAnswer());
  const expenses = { transaction_date: DAY, currency_code: "HKD", draft: DRAFT, lines: [], total: 88.5, suppliers: [], accounts: [], permissions: { create_supplier: false } };
  await page.route(`${API}/reports/expenses**`, async (route) => {
    if (route.request().method() === "PUT") {
      await route.fulfill({ json: { draft_id: "d", transaction_date: DAY, current_section: "deposit", completed_sections: ["opening", "sales", "expenses"], next: "deposit" } });
      return;
    }
    await route.fulfill({ json: expenses });
  });
  await page.route(`${API}/reports/deposit**`, async (route) => {
    if (route.request().method() === "PUT") {
      await route.fulfill({ json: { draft_id: "d", transaction_date: DAY, current_section: "cash_count", completed_sections: ["opening", "sales", "expenses", "deposit"], next: "cash_count" } });
      return;
    }
    await route.fulfill({ json: { ...countAnswer(), bank_deposit: 0, expected_cash: 1511.5 } });
  });
  let left = false;
  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame() && !frame.url().startsWith(new URL(page.url() || "http://localhost:3010").origin)) left = true;
  });
  await enter(page, `${BASE}/reports/new/expense?transaction_date=${DAY}`);
  await expect(page.getByRole("heading", { name: "Expenses", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Save & Next" }).click();
  await expect(page.getByRole("heading", { name: "Deposit to Bank" })).toBeVisible();
  await page.getByRole("textbox", { name: "Deposit Amount" }).fill("300");
  await page.getByRole("button", { name: "Save & Next" }).click();
  await expect(page.getByRole("heading", { name: "Cash Count", exact: true })).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`${BASE}/reports/new/cash-count\\?transaction_date=${DAY}$`));
  expect(left).toBe(false);
});

test("the page reloads with no console error", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(e.message));
  await openWith(page, countAnswer());
  await page.reload();
  await expect(page.getByRole("heading", { name: "Cash Count", exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});
