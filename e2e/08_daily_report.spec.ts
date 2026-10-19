// The Daily Report of a submitted day (components/closing/DailyReport.tsx, Part 15.7), against a
// STUBBED Petty Cash API. Needs only `npm run dev`. The pages it opens are this app's own (stubbed
// quietly); Flask's pages (by the company's full id) are caught, so nothing leaves the app.
// Publishing itself is e2e/12_publish.spec.ts. Refusals are inline alerts, never toasts; the one toast is Share's "copied".

import { expect, test, type Page, type Route } from "@playwright/test";

import { companyRef } from "./companyRef";
import { expectNoHorizontalScroll, mintModuleToken } from "./helpers";

const ENTITY = "3d65f186-5ba1-4bf7-a1b0-cc64a113eb5c";
const NAME = "E2E Petty Cash Shop";
const BASE = `/entity/${companyRef(ENTITY, NAME)}/petty-cash`;
const DAY = "2026-10-13";
const REPORT = "5d6e7f80-0000-4000-8000-000000000001";
const REPORT_URL = `${BASE}/reports/${REPORT}/summary`;
const SHARE_URL = "http://localhost:5012/report/share/abc123secret";
const stageUrl = (path: string, day = DAY) => `${BASE}/reports/new/${path}?transaction_date=${day}`;
const exact = (url: string) => new RegExp(`${url.replace(/[?.]/g, "\\$&")}$`);
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");

// The audit facts are on the device's clock: Hong Kong's, wherever this runs.
test.use({ timezoneId: "Asia/Hong_Kong" });

type Json = Record<string, unknown>;

/** Opening 500 + 100, sales 1,070.50 (cash 820.50), expenses 240.50, deposit 300: 780.00 expected; 760.00 counted. */
function reportAnswer(over: Json = {}, cash: Json = {}): Json {
  return {
    report_id: REPORT,
    transaction_date: DAY,
    currency_code: "HKD",
    company_name: NAME,
    status: "submitted",
    status_label: "Submitted",
    status_tone: "info",
    is_latest: true,
    submitted_at: "2026-10-13T18:12:00+08:00",
    submitted_by: "Olive Tan",
    published_at: null,
    publishing_status: "unpublished",
    xero_integrated: false,
    was_published: false,
    kpis: { total_sales: 1070.5, total_expenses: 240.5, cash_position: 760 },
    sales: {
      methods: [
        { sale_id: "s1", name: "Octopus", value_name: "octopus_sales", type: "electronic", amount: 200 },
        { sale_id: "s2", name: "Deliveroo", value_name: "deliveroo_sales", type: "delivery", amount: 0 },
        { sale_id: "s3", name: "Foodpanda", value_name: "foodpanda_sales", type: "delivery", amount: 50 },
      ],
      cash: 820.5,
      total: 1070.5,
    },
    expenses: {
      lines: [
        {
          id: "e1",
          item: "General Expenses",
          amount: 120.5,
          remarks: "Bags",
          supplier: { id: "c1", name: "ParknShop" },
          account: { id: "a1", code: "429", name: "General Expenses" },
          receipts: [{ id: "f1", name: "parknshop.png", mime_type: "image/png" }],
        },
        { id: "e2", item: "Cleaning", amount: 120, remarks: "", supplier: null, account: null, receipts: [] },
      ],
      total: 240.5,
    },
    cash: {
      opening_balance: 500,
      cash_addition: 100,
      cash_addition_type: "company",
      cash_sales: 820.5,
      expenses: 240.5,
      bank_deposit: 300,
      expected: 780,
      counted: 760,
      safe_box: 0,
      difference: { amount: -20, kind: "short", reason: "Change given twice" },
      ...cash,
    },
    closing_balance: 760,
    permissions: { edit: true, delete: true, publish: true, share: true },
    ...over,
  };
}

const PUBLISHED = {
  status_label: "Published to Xero",
  status_tone: "success",
  publishing_status: "completed",
  xero_integrated: true,
  was_published: true,
  published_at: "2026-10-13T18:15:00+08:00",
};

const OPENING = { transaction_date: DAY, currency_code: "HKD", draft: null, starting_cash_balance: 500, yesterday_closing_balance: 500, safebox_balance: 0, cash_addition: null, withdrawal: "personal" };

function homeAnswer(over: Json = {}): Json {
  return {
    server_today: "2026-10-14",
    user_count: 1,
    currency_code: "HKD",
    latest: { date: DAY, closing_balance: 760, deposit: 0, deposit_bank_name: "No deposit", deposit_bank_number: "", deposit_correction_missing_settings: [], can_correct_deposit: true, submitter_first_name: "Olive" },
    draft: null,
    draft_date: null,
    published: { [DAY]: { id: REPORT, closing_balance: 760, bank_deposit: 0, xero_integrated: false, submitter_first_name: "Olive" } },
    today_has_report: false,
    today_is_latest_report: true,
    xero_settings: { complete: true, missing: [] },
    permissions: { read_only: false, correct_deposit: true },
    ...over,
  };
}

type Setup = {
  read?: (route: Route) => Promise<void>;
  onReopen?: (route: Route) => Promise<void>;
  onDelete?: (route: Route) => Promise<void>;
  onShare?: (route: Route) => Promise<void>;
  home?: Json;
};

type Calls = { reopens: number; deletes: number; shares: number; receipts: string[] };

async function stub(page: Page, answer: Json, { read, onReopen, onDelete, onShare, home }: Setup = {}): Promise<Calls> {
  const calls: Calls = { reopens: 0, deletes: 0, shares: 0, receipts: [] };
  const api = "**/api/petty-cash/v1/companies/*";
  await page.route(new RegExp(`/api/petty-cash/v1/companies/[^/]+/reports/${REPORT}$`), async (route) => {
    if (route.request().method() === "DELETE") {
      calls.deletes += 1;
      if (onDelete) await onDelete(route);
      else await route.fulfill({ json: { deleted: REPORT, transaction_date: DAY, next: "dashboard" } });
      return;
    }
    if (read) await read(route);
    else await route.fulfill({ json: answer });
  });
  await page.route(`${api}/reports/${REPORT}/reopen`, async (route) => {
    calls.reopens += 1;
    if (onReopen) await onReopen(route);
    else await route.fulfill({ json: { report_id: REPORT, transaction_date: DAY, status: "draft", next: "opening" } });
  });
  await page.route(`${api}/reports/${REPORT}/share-link`, async (route) => {
    calls.shares += 1;
    if (onShare) await onShare(route);
    else await route.fulfill({ json: { url: SHARE_URL } });
  });
  await page.route(`${api}/expense-lines/*/receipts/*`, (route) => {
    calls.receipts.push(new URL(route.request().url()).pathname.replace(/^.*\/companies\/[^/]+/, ""));
    return route.fulfill({ status: 200, contentType: "image/png", body: PNG });
  });
  await page.route(`${api}/reports/*/outcome`, (route) =>
    route.fulfill({
      json: {
        report_id: REPORT, transaction_date: DAY, currency_code: "HKD", company_name: NAME, status: "submitted", submitted: true,
        submitted_at: "2026-10-13T10:12:00+00:00", submitted_by: "Olive", cash_counted: 760, difference: { amount: -20, kind: "short", has_reason: true },
        xero: { publishing_status: "unpublished", published_at: null, xero_integrated: false, was_published: false }, can_publish: true, is_today: false, next_day: "2026-10-14",
      },
    }),
  );
  await page.route(`${api}/reports/opening**`, (route) => route.fulfill({ json: OPENING }));
  await page.route(`${api}/home`, (route) => route.fulfill({ json: home ?? homeAnswer() }));
  await page.route("**/api/me/profile**", (route) => route.fulfill({ json: { user: { name: "Tess Tester", initials: "TT" } } }));
  // Flask's pages (Publish to Xero, by the company's full id): caught.
  await page.route(/\/entity\/[0-9a-f-]{36}\/petty-cash\/reports(?:[/?]|$)/, (route) =>
    route.fulfill({ contentType: "text/html", body: "<title>Flask page</title><p>Flask page</p>" }),
  );
  return calls;
}

async function arrive(page: Page, next: string) {
  const token = mintModuleToken({ secret: "stub", userId: "u", entityId: ENTITY, entityName: NAME });
  await page.goto(`/landing?${new URLSearchParams({ token, entity_id: ENTITY, entity_name: NAME, next })}`);
}

async function openWith(page: Page, answer: Json, setup: Setup = {}): Promise<Calls> {
  const calls = await stub(page, answer, setup);
  await arrive(page, REPORT_URL);
  await expect(page.getByRole("heading", { level: 1, name: "Daily Report" })).toBeVisible();
  await expect(page.getByRole("status", { name: "Loading" })).toHaveCount(0);
  return calls;
}

/** A disclosure (15.7: collapsed breakdowns), opened; its body. */
async function open(page: Page, title: string) {
  const summary = page.locator("summary").filter({ hasText: new RegExp(`^${title.replace(/[()]/g, "\\$&")}`) });
  await summary.click();
  return page.locator("details").filter({ has: summary });
}

/** A Description row's value by its term, inside `scope`. */
const value = (page: Page, term: string, scope = page.locator("main")) =>
  scope.locator("div, dl").filter({ has: page.locator("dt", { hasText: new RegExp(`^${term.replace(/[().]/g, "\\$&")}$`) }) }).last().locator("dd").first();

const more = (page: Page) => page.getByRole("button", { name: "More report actions" });
async function choose(page: Page, item: string) {
  await more(page).click();
  await page.getByRole("menu", { name: "More report actions" }).getByRole("menuitem", { name: item }).click();
}

test("the view: header and pill, three KPIs, the difference as a fact, the breakdowns, the closing balance and the audit facts", async ({ page }) => {
  await openWith(page, reportAnswer());
  const pill = page.locator("main [data-tone]").filter({ hasText: "Submitted" }).first();
  await expect(pill).toHaveAttribute("data-tone", "info");
  await expect(page.getByText("Tue 13 Oct 2026", { exact: true })).toBeVisible();
  // the way back is the report history, its parent list (as Flask's page)
  await expect(page.locator("main").getByRole("link", { name: "Reports" })).toHaveAttribute("href", `${BASE}/reports`);

  // exactly three KPIs, the server's figures
  const kpis = page.locator("main dl").filter({ has: page.locator("dt", { hasText: "Cash position" }) });
  await expect(kpis.locator("dt")).toHaveText(["Total sales", "Total expenses", "Cash position"]);
  await expect(value(page, "Total sales", kpis)).toHaveText("HKD1,070.50");
  await expect(value(page, "Total expenses", kpis)).toHaveText("HKD240.50");
  await expect(kpis.getByText("2 expenses", { exact: true })).toBeVisible();
  await expect(value(page, "Cash position", kpis)).toHaveText("HKD760.00");

  const fact = page.getByRole("status").filter({ hasText: "Cash was HKD20.00 short" });
  await expect(fact).toHaveAttribute("data-tone", "warning");
  await expect(fact).toContainText("Note: Change given twice");

  // the breakdowns start collapsed
  await expect(page.getByText("Octopus")).toBeHidden();
  const sales = await open(page, "Sales by method");
  await expect(value(page, "Octopus", sales)).toHaveText("HKD200.00");
  await expect(value(page, "Foodpanda", sales)).toHaveText("HKD50.00");
  await expect(sales.getByText("Deliveroo")).toHaveCount(0);
  await expect(value(page, "Cash", sales)).toHaveText("HKD820.50");
  await expect(value(page, "Total sales", sales)).toHaveText("HKD1,070.50");

  const expenses = await open(page, "Expenses (2)");
  await expect(expenses.getByText("General Expenses", { exact: true })).toBeVisible();
  await expect(expenses.getByText("ParknShop · Account 429")).toBeVisible();
  await expect(expenses.getByText("Bags")).toBeVisible();
  await expect(expenses.getByText("Cleaning", { exact: true })).toBeVisible();
  await expect(expenses.getByText("No supplier")).toBeVisible();
  await expect(value(page, "Total expenses", expenses)).toHaveText("HKD240.50");

  const receipts = await open(page, "Receipts (1)");
  await expect(receipts.getByRole("button", { name: "View receipt parknshop.png" })).toContainText("General Expenses · HKD120.50");

  const cash = await open(page, "Cash");
  await expect(value(page, "Starting cash balance", cash)).toHaveText("HKD500.00");
  await expect(value(page, "Added to the drawer", cash)).toHaveText("HKD100.00");
  await expect(value(page, "Where the cash came from", cash)).toHaveText("Company bank");
  await expect(value(page, "Cash taken for bank deposit", cash)).toHaveText("HKD300.00");
  await expect(value(page, "Expected in drawer", cash)).toHaveText("HKD780.00");
  await expect(value(page, "Counted in the drawer", cash)).toHaveText("HKD760.00");
  await expect(value(page, "In the safe box", cash)).toHaveText("HKD0.00");
  await expect(value(page, "Difference", cash)).toHaveText("HKD20.00 short");

  await expect(value(page, "Closing balance")).toHaveText("HKD760.00");
  await expect(page.getByText("Submitted by Olive Tan · Tue 13 Oct 2026, 6:12 pm")).toBeVisible();
  await expect(page.getByText("Not in Xero yet")).toBeVisible();
  // amounts are plain text, never coloured
  for (const term of ["Cash position", "Closing balance"]) await expect(value(page, term)).toHaveClass(/text-text-primary/);

  // the actions: Share, Publish to Xero (in the app, e2e/12_publish.spec.ts), More: Edit report / Delete report
  await expect(page.getByRole("button", { name: "Share" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Publish to Xero" })).toBeVisible();
  await more(page).click();
  const menu = page.getByRole("menu", { name: "More report actions" });
  // (the text carries each icon's ligature first)
  await expect(menu.getByRole("menuitem")).toHaveText([/Edit report$/, /Delete report$/]);
  await expect(menu.getByRole("menuitem").first()).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(menu.getByRole("menuitem", { name: "Delete report" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
  await expect(more(page)).toBeFocused();
});

test("a published report: Published to Xero in Success, Sent to Xero with its time, and publishing again under More", async ({ page }) => {
  await openWith(page, reportAnswer(PUBLISHED));
  await expect(page.locator("main [data-tone]").filter({ hasText: "Published to Xero" }).first()).toHaveAttribute("data-tone", "success");
  await expect(page.getByText("Sent to Xero · Tue 13 Oct 2026, 6:15 pm")).toBeVisible();
  await expect(page.getByRole("button", { name: "Publish to Xero" })).toHaveCount(0);
  await choose(page, "Publish to Xero again");
  await expect(page.getByRole("alertdialog", { name: "Publish to Xero again?" })).toBeVisible();
});

test("each action shows only while the API allows it", async ({ page }) => {
  await openWith(page, reportAnswer({ permissions: { edit: false, delete: false, publish: false, share: false } }));
  await expect(page.getByRole("button", { name: "Share" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Publish/ })).toHaveCount(0);
  await expect(more(page)).toHaveCount(0);
  // an earlier report may be shared, but not edited or deleted
  await page.unroute(new RegExp(`/api/petty-cash/v1/companies/[^/]+/reports/${REPORT}$`));
  await page.route(new RegExp(`/api/petty-cash/v1/companies/[^/]+/reports/${REPORT}$`), (route) =>
    route.fulfill({ json: reportAnswer({ is_latest: false, permissions: { edit: false, delete: false, publish: true, share: true } }) }),
  );
  await page.reload();
  await expect(page.getByRole("button", { name: "Share" })).toBeVisible();
  await expect(more(page)).toHaveCount(0);
});

test("a receipt opens full screen in the app - never a new tab - and Escape closes it", async ({ page, context }) => {
  const calls = await openWith(page, reportAnswer());
  const receipts = await open(page, "Receipts (1)");
  const view = receipts.getByRole("button", { name: "View receipt parknshop.png" });
  await view.click();
  const viewer = page.getByRole("dialog", { name: "parknshop.png" });
  await expect(viewer.getByRole("img", { name: "Receipt: parknshop.png" })).toBeVisible();
  const box = await viewer.boundingBox();
  expect(Math.round(box!.width)).toBe(page.viewportSize()!.width);
  expect(context.pages()).toHaveLength(1);
  expect(new Set(calls.receipts)).toEqual(new Set(["/expense-lines/e1/receipts/f1"]));
  await page.keyboard.press("Escape");
  await expect(viewer).toHaveCount(0);
  await expect(view).toBeFocused();
});

test("the outcome page's View report opens it in the app", async ({ page }) => {
  await stub(page, reportAnswer());
  await arrive(page, `${BASE}/reports/${REPORT}/submitted`);
  await expect(page.getByRole("heading", { level: 1, name: "The report is submitted" })).toBeVisible();
  await page.evaluate(() => Object.assign(window, { __stayed: true }));
  const view = page.getByRole("link", { name: "View report" });
  await expect(view).toHaveAttribute("href", REPORT_URL);
  await view.click();
  await expect(page).toHaveURL(exact(REPORT_URL));
  await expect(page.getByRole("heading", { level: 1, name: "Daily Report" })).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { __stayed?: boolean }).__stayed)).toBe(true);
});

test("the launch page's Recent reports open each report in the app", async ({ page }) => {
  await stub(page, reportAnswer());
  await arrive(page, BASE);
  const recent = page.getByRole("region", { name: "Recent reports" });
  const row = recent.getByRole("link", { name: /Tue 13 Oct 2026/ });
  await expect(row).toHaveAttribute("href", REPORT_URL);
  await row.click();
  await expect(page).toHaveURL(exact(REPORT_URL));
  await expect(page.getByRole("heading", { level: 1, name: "Daily Report" })).toBeVisible();
  await expect(value(page, "Closing balance")).toHaveText("HKD760.00");
});

test("the launch page's Done state opens today's report in the app", async ({ page }) => {
  const today = "2026-10-14";
  await stub(page, reportAnswer(), {
    home: homeAnswer({ published: { [DAY]: { id: "earlier", closing_balance: 700, bank_deposit: 0, xero_integrated: true, submitter_first_name: "Olive" }, [today]: { id: REPORT, closing_balance: 760, bank_deposit: 0, xero_integrated: false, submitter_first_name: "Olive" } } }),
  });
  await arrive(page, BASE);
  const card = page.getByRole("region", { name: /Daily Closing/ });
  await expect(card).toContainText("Today's report is submitted");
  await card.getByRole("link", { name: "View report" }).click();
  await expect(page).toHaveURL(exact(REPORT_URL));
  await expect(page.getByRole("heading", { level: 1, name: "Daily Report" })).toBeVisible();
});

test("Edit report asks first, reopens the report and opens Addition to Drawer for the day", async ({ page }) => {
  const calls = await openWith(page, reportAnswer());
  await choose(page, "Edit report");
  const dialog = page.getByRole("alertdialog", { name: "Edit this report?" });
  await expect(dialog).toContainText("It goes back to a draft so every stage can be changed, then you submit it again.");
  await expect(dialog.getByText("It is already in Xero")).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: "Cancel" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  expect(calls.reopens).toBe(0);

  await page.evaluate(() => Object.assign(window, { __stayed: true }));
  await choose(page, "Edit report");
  await page.getByRole("alertdialog").getByRole("button", { name: "Edit report" }).click();
  await expect(page).toHaveURL(exact(stageUrl("opening")));
  await expect(page.getByRole("heading", { level: 1, name: "Addition to Drawer" })).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { __stayed?: boolean }).__stayed)).toBe(true);
  expect(calls.reopens).toBe(1);
});

test("Edit report on a report in Xero warns first; a refused reopen shows the API's sentence and stays", async ({ page }) => {
  const why = "Xero is still publishing this report. Wait until it finishes, then edit it.";
  const calls = await openWith(page, reportAnswer(PUBLISHED), { onReopen: (route) => route.fulfill({ status: 409, json: { error: why } }) });
  await choose(page, "Edit report");
  const dialog = page.getByRole("alertdialog", { name: "Edit this report?" });
  const warning = dialog.getByRole("status").filter({ hasText: "It is already in Xero" });
  await expect(warning).toHaveAttribute("data-tone", "warning");
  await expect(warning).toContainText("Publishing it again adds new entries in Xero. The ones there now are not removed: void them in Xero by hand.");
  await dialog.getByRole("button", { name: "Edit report" }).click();
  await expect(dialog.getByRole("alert").filter({ hasText: why })).toHaveAttribute("data-tone", "danger");
  await expect(dialog.getByRole("button", { name: "Edit report" })).toBeEnabled();
  await expect(page).toHaveURL(exact(REPORT_URL));
  expect(calls.reopens).toBe(1);
  await expect(page.locator("[data-toast-type]")).toHaveCount(0);
});

test("Delete asks in Danger with Cancel first, deletes, and the launch page says so", async ({ page }) => {
  const calls = await openWith(page, reportAnswer());
  await choose(page, "Delete report");
  const dialog = page.getByRole("alertdialog", { name: "Delete this report?" });
  await expect(dialog).toContainText("The Daily Report for Tue 13 Oct 2026 is deleted with its expenses and receipts. This can't be undone.");
  await expect(dialog.getByText("It is in Xero")).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: "Cancel" })).toBeFocused();
  const confirm = dialog.getByRole("button", { name: "Delete report" });
  await expect(confirm).toHaveClass(/bg-action-danger/);
  await confirm.click();
  await expect(page).toHaveURL(new RegExp(`${BASE}$`));
  const banner = page.getByRole("status").filter({ hasText: "The Daily Report for Tue 13 Oct 2026 is deleted." });
  await expect(banner).toHaveAttribute("data-tone", "success");
  expect(calls.deletes).toBe(1);
  // in place of the report page: Back does not return to a report that is gone
  await page.goBack();
  await expect(page).not.toHaveURL(exact(REPORT_URL));
});

test("Delete on a report in Xero warns that Xero keeps its entries and points to Edit report", async ({ page }) => {
  const calls = await openWith(page, reportAnswer(PUBLISHED));
  await choose(page, "Delete report");
  const dialog = page.getByRole("alertdialog", { name: "Delete this report?" });
  const warning = dialog.getByRole("status").filter({ hasText: "It is in Xero" });
  await expect(warning).toHaveAttribute("data-tone", "warning");
  await expect(warning).toContainText(
    "Deleting it here does not remove its entries in Xero, and publishing this day again adds a second copy. To change the report, use Edit report instead.",
  );
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(more(page)).toBeFocused();
  expect(calls.deletes).toBe(0);
  // still allowed (the owner, 2026-10-15)
  await choose(page, "Delete report");
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete report" }).click();
  await expect(page).toHaveURL(new RegExp(`${BASE}$`));
  expect(calls.deletes).toBe(1);
});

test("a refused delete shows the API's sentence inside the dialog, and the report stays", async ({ page }) => {
  const why = "Xero is still publishing this report. Wait until it finishes before deleting it.";
  const calls = await openWith(page, reportAnswer(), { onDelete: (route) => route.fulfill({ status: 409, json: { error: why } }) });
  await choose(page, "Delete report");
  const dialog = page.getByRole("alertdialog", { name: "Delete this report?" });
  await dialog.getByRole("button", { name: "Delete report" }).click();
  await expect(dialog.getByRole("alert").filter({ hasText: why })).toHaveAttribute("data-tone", "danger");
  await expect(dialog.getByRole("button", { name: "Delete report" })).toBeEnabled();
  await expect(page).toHaveURL(exact(REPORT_URL));
  await expect(page.locator("[data-toast-type]")).toHaveCount(0);
  expect(calls.deletes).toBe(1);
});

test("Share makes the link; Copy link copies it and a toast confirms it", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const calls = await openWith(page, reportAnswer());
  await page.getByRole("button", { name: "Share" }).click();
  const dialog = page.getByRole("dialog", { name: "Share this report" });
  await expect(dialog).toContainText("Anyone with the link can read the Daily Report for Tue 13 Oct 2026, without signing in, until it expires.");
  await expect(dialog.getByRole("textbox", { name: "Link" })).toHaveValue(SHARE_URL);
  await dialog.getByRole("button", { name: "Copy link" }).click();
  await expect(dialog).toHaveCount(0);
  const toast = page.locator("[data-toast-type=success]");
  await expect(toast).toContainText("The link to the Daily Report for Tue 13 Oct 2026 is copied.");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(SHARE_URL);
  expect(calls.shares).toBe(1);
  await toast.getByRole("button", { name: "Dismiss" }).click();
  await expect(toast).toHaveCount(0);
});

test("Share: a link the API refuses shows its sentence; a copy the browser refuses leaves the link to copy by hand", async ({ page }) => {
  const why = "A draft can't be shared. Submit the day first.";
  let refuse = true;
  await openWith(page, reportAnswer(), {
    onShare: (route) => (refuse ? route.fulfill({ status: 409, json: { error: why } }) : route.fulfill({ json: { url: SHARE_URL } })),
  });
  await page.getByRole("button", { name: "Share" }).click();
  const dialog = page.getByRole("dialog", { name: "Share this report" });
  await expect(dialog.getByRole("alert").filter({ hasText: why })).toHaveAttribute("data-tone", "danger");
  await expect(dialog.getByRole("button", { name: "Copy link" })).toBeDisabled();
  await dialog.getByRole("button", { name: "Close" }).click();

  refuse = false;
  await page.evaluate(() => {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: () => Promise.reject(new Error("denied")) } });
  });
  await page.getByRole("button", { name: "Share" }).click();
  await dialog.getByRole("button", { name: "Copy link" }).click();
  await expect(dialog.getByRole("status").filter({ hasText: "We couldn't copy the link. Select it above, then copy it yourself." })).toHaveAttribute("data-tone", "warning");
  await expect(dialog.getByRole("textbox", { name: "Link" })).toHaveValue(SHARE_URL);
  await expect(page.locator("[data-toast-type]")).toHaveCount(0);
});

test("a reopened report says it isn't submitted yet, with the way back to Close and no actions", async ({ page }) => {
  await openWith(page, reportAnswer({ status: "draft", status_label: "Draft", status_tone: "neutral", permissions: { edit: false, delete: true, publish: true, share: false } }));
  await expect(page.locator("main [data-tone]").filter({ hasText: "Draft" }).first()).toHaveAttribute("data-tone", "neutral");
  const banner = page.getByRole("status").filter({ hasText: "This report isn't submitted yet" });
  await expect(banner).toContainText("Check the day in Close, then submit it.");
  await expect(banner.getByRole("link", { name: "Go to Close" })).toHaveAttribute("href", stageUrl("ending"));
  await expect(page.getByRole("button", { name: "Share" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Publish/ })).toHaveCount(0);
  await expect(more(page)).toHaveCount(0);
});

test("a report the API doesn't know says so, with the way home", async ({ page }) => {
  await stub(page, reportAnswer());
  await page.route(/\/api\/petty-cash\/v1\/companies\/[^/]+\/reports\/not-a-report$/, (route) => route.fulfill({ status: 404, json: { error: "Hmm, I couldn't find that report." } }));
  await arrive(page, `${BASE}/reports/not-a-report/summary`);
  await expect(page.getByRole("alert").filter({ hasText: "Hmm, I couldn't find that report." })).toBeVisible();
  await expect(page.getByRole("link", { name: "Back to home" })).toHaveAttribute("href", BASE);
});

test("the largest amounts are never clipped, and the page never scrolls sideways", async ({ page }) => {
  const big = 99999999999.99;
  await openWith(
    page,
    reportAnswer(
      {
        kpis: { total_sales: big, total_expenses: big, cash_position: -big },
        sales: { methods: [{ sale_id: "s1", name: "A very long electronic payment method name", value_name: "x_sales", type: "electronic", amount: big }], cash: big, total: big },
        expenses: {
          lines: [
            {
              id: "e1", item: "An account with a long business name", amount: big, remarks: "y".repeat(300),
              supplier: { id: "c1", name: "A supplier with a very long trading name Limited" }, account: { id: "a1", code: "429", name: "An account with a long business name" },
              receipts: [{ id: "f1", name: `${"a-very-long-receipt-file-name-".repeat(4)}.png`, mime_type: "image/png" }],
            },
          ],
          total: big,
        },
        closing_balance: -big,
      },
      { opening_balance: big, cash_addition: big, bank_deposit: big, expected: -big, counted: big, safe_box: big, difference: { amount: -big, kind: "short", reason: "x".repeat(300) } },
    ),
  );
  for (const title of ["Sales by method", "Expenses (1)", "Receipts (1)", "Cash"]) await open(page, title);
  // the icon font: until it loads, a glyph is its ligature's text ("more_horiz"), wider than its button
  await page.evaluate(() => document.fonts.ready);
  const clipped = await page.evaluate(() =>
    Array.from(document.querySelectorAll("main dd, main dt, main h1, main summary, main a, main button"))
      .filter((el) => el.scrollWidth > el.clientWidth + 1)
      .map((el) => el.textContent),
  );
  expect(clipped).toEqual([]);
  await expectNoHorizontalScroll(page);
});

test("the page reloads with no console error", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(e.message));
  await openWith(page, reportAnswer());
  // Arriving through /landing renders in the browser only; a reload is a full server render that
  // the browser then hydrates - where a mismatch shows.
  await page.reload();
  await expect(page.getByRole("heading", { level: 1, name: "Daily Report" })).toBeVisible();
  await expect(value(page, "Closing balance")).toHaveText("HKD760.00");
  expect(errors).toEqual([]);
});
