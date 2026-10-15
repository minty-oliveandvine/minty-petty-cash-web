// The report wizard's Ending step (components/report/EndingStep.tsx, Flask's ORIGINAL look), against
// a STUBBED Petty Cash API. Needs only `npm run dev`. Flask's pages are caught, so nothing leaves
// the app; the Submitted page after Finish is this app's own (09_submitted_report covers it).

import { expect, test, type Page, type Route } from "@playwright/test";

import { companyRef } from "./companyRef";
import { expectNoHorizontalScroll, mintModuleToken } from "./helpers";

const ENTITY = "3d65f186-5ba1-4bf7-a1b0-cc64a113eb5c";
const NAME = "E2E Petty Cash Shop";
const BASE = `/entity/${companyRef(ENTITY, NAME)}/petty-cash`;
const DAY = "2026-10-13";
const API = "**/api/petty-cash/v1/companies/*";
const REPORT = "8a1d3c55-0f8e-4f4e-9d55-2c4b7d1e0a77";
const SUBMITTED = new RegExp(`${BASE}/reports/${REPORT}/submitted$`);

type Json = Record<string, unknown>;

const DRAFT = {
  id: "d",
  status: "draft",
  current_section: "ending",
  completed_sections: ["opening", "sales", "expenses", "deposit", "cash_count"],
  xero_integrated: false,
  publishing_status: "unpublished",
};

const method = (name: string, value_name: string, type: "electronic" | "delivery", amount: number) => ({ sale_id: value_name, name, value_name, type, amount });
const line = (id: string, item: string, amount: number) => ({ id, item, supplier: "Acme", remarks: "", amount, receipts: [] });

/** 30 days of history, the day itself (13 OCT, a Tuesday) last at 1,234.50. */
const HISTORY = Array.from({ length: 30 }, (_, i) => {
  const d = new Date(Date.UTC(2026, 8, 14 + i));
  return { date: d.toISOString().slice(0, 10), total: i === 29 ? 1234.5 : (i % 5) * 200 };
});

/**
 * Opening 1,000 + cash sales 600 - expenses 128.50 - deposit 300 = 1,171.50 expected; counted
 * 1,000.50 in the till and 160 in the safebox: 11.00 short.
 */
function closeAnswer(over: Json = {}): Json {
  return {
    transaction_date: DAY,
    currency_code: "HKD",
    draft: DRAFT,
    opening_balance: 1000,
    cash_addition: 0,
    sales: {
      methods: [
        method("Visa", "visa_sales", "electronic", 400),
        method("WeChat Pay", "wechat_sales", "electronic", 0),
        method("Keeta", "keeta_sales", "delivery", 234.5),
      ],
      cash: 600,
      total: 1234.5,
      yesterday_total: 1000,
      history: HISTORY,
    },
    expenses: {
      lines: [line("e1", "Food & Drink", 40), line("e2", "Cleaning", 50), line("e3", "Food & Drink", 38.5)],
      total: 128.5,
    },
    cash: {
      bank_deposit: 300,
      expected: 1171.5,
      counted: 1000.5,
      safe_box: 160,
      difference: { amount: -11, kind: "short", reason: "Paid a courier" },
    },
    closing_balance: 1160.5,
    problem: null,
    ...over,
  };
}

const COUNT = {
  transaction_date: DAY,
  currency_code: "HKD",
  draft: { ...DRAFT, current_section: "cash_count" },
  opening_balance: 1000,
  cash_addition: 0,
  cash_sales: 600,
  expenses: 128.5,
  bank_deposit: 300,
  cash_on_hand: 1471.5,
  expected_cash: 1171.5,
  denominations: [{ id: "n1000", value: 1000, kind: "note", count: 1 }],
  safe_box_balance: 160,
  discrepancy: { amount: -11, kind: "short", reason: "Paid a courier" },
};

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

const OUTCOME = {
  report_id: REPORT,
  transaction_date: DAY,
  currency_code: "HKD",
  company_name: NAME,
  status: "submitted",
  submitted: true,
  submitted_at: "2026-10-13T12:00:00+00:00",
  submitted_by: "Tess",
  cash_counted: 1160.5,
  difference: { amount: -11, kind: "short", has_reason: true },
  xero: { publishing_status: "unpublished", published_at: null, xero_integrated: false },
  can_publish: true,
  is_today: false,
  next_day: "2026-10-14",
};

const OPENING = { transaction_date: DAY, currency_code: "HKD", draft: DRAFT, starting_cash_balance: 0, yesterday_closing_balance: 0, safebox_balance: 0, cash_addition: null, withdrawal: "personal" };
const EXPENSES = { transaction_date: DAY, currency_code: "HKD", draft: DRAFT, lines: [], total: 0, suppliers: [], accounts: [], permissions: { create_supplier: false } };

type Handlers = { onSubmit?: (body: Json, route: Route) => Promise<void>; onRead?: (route: Route) => Promise<void> };

async function stub(page: Page, answer: Json, h: Handlers = {}) {
  await page.route(`${API}/reports/close**`, async (route) => {
    if (h.onRead) await h.onRead(route);
    else await route.fulfill({ json: answer });
  });
  await page.route(`${API}/reports/submit`, async (route) => {
    const body = route.request().postDataJSON() as Json;
    if (h.onSubmit) await h.onSubmit(body, route);
    else await route.fulfill({ json: { report_id: REPORT, transaction_date: DAY, status: "submitted", submitted_at: "2026-10-13T12:00:00+00:00", closing_balance: 1160.5, next: "submitted" } });
  });
  await page.route(`${API}/reports/cash-count**`, (route) => route.fulfill({ json: COUNT }));
  await page.route(`${API}/reports/expenses**`, (route) => route.fulfill({ json: EXPENSES }));
  await page.route(`${API}/reports/opening**`, (route) => route.fulfill({ json: OPENING }));
  await page.route(`${API}/home`, (route) => route.fulfill({ json: HOME }));
  await page.route(`${API}/reports/${REPORT}/outcome`, (route) => route.fulfill({ json: OUTCOME }));
  await page.route("**/api/me/profile**", (route) => route.fulfill({ json: { user: { name: "Tess Tester", initials: "TT" } } }));
  // Flask's pages: caught.
  await page.route(/\/entity\/[0-9a-f-]{36}\/petty-cash\/reports\//, (route) =>
    route.fulfill({ contentType: "text/html", body: "<title>Flask page</title><p>Flask page</p>" }),
  );
}

async function enter(page: Page, next = `${BASE}/reports/new/ending?transaction_date=${DAY}`) {
  const token = mintModuleToken({ secret: "stub", userId: "u", entityId: ENTITY, entityName: NAME });
  await page.goto(`/landing?${new URLSearchParams({ token, entity_id: ENTITY, entity_name: NAME, next })}`);
}

async function openWith(page: Page, answer: Json, h: Handlers = {}) {
  await stub(page, answer, h);
  await enter(page);
  await expect(page.getByRole("heading", { name: "Summary", exact: true })).toBeVisible();
}

const toast = (page: Page, text: string | RegExp) => page.locator("[data-toast-type]").filter({ hasText: text });
const finish = (page: Page) => page.getByRole("button", { name: /Finish Daily Report|Finishing/ });
const card = (page: Page, title: string) => page.locator("div.shadow-flask-sm").filter({ has: page.getByRole("heading", { name: title, exact: true }) });

test("Flask's page: the draft callout, the four cards, the figures and the shortage", async ({ page }) => {
  await openWith(page, closeAnswer());
  await expect(page.getByText("Draft report", { exact: true })).toBeVisible();
  await expect(
    page.getByText("This report is still a draft and has not been submitted. Review the summary below, then complete submission when you are ready to finalise."),
  ).toBeVisible();
  await expect(page.getByText("HKD", { exact: true })).toBeVisible();

  const sales = card(page, "Total Sales");
  await expect(sales.getByText("1,234.50", { exact: true })).toBeVisible();
  await expect(sales.getByText("23.4%")).toBeVisible();
  await expect(sales.getByText("Compared to Yesterday")).toBeVisible();
  for (const [label, value] of [
    ["Electronic Sales", "400.00"],
    ["Delivery Sales", "234.50"],
    ["Cash Sales", "600.00"],
  ]) {
    await expect(sales.getByText(label, { exact: true }).first()).toBeVisible();
    await expect(sales.getByText(value, { exact: true }).first()).toBeVisible();
  }

  const history = card(page, "Sales History");
  await expect(history.locator("rect")).toHaveCount(30);
  await expect(history.locator("rect.fill-flask-red")).toHaveCount(1);
  await expect(history.getByText("1.2k")).toBeAttached();
  await expect(history.locator("text").filter({ hasText: /^13 OCT$/ })).toBeAttached();

  const expenses = card(page, "Total Expenses");
  const pie = expenses.getByRole("img", { name: "Expenses by account, 128.50 in all" });
  await expect(pie).toBeVisible();
  await expect(pie.locator("path")).toHaveCount(2);
  await expect(pie.locator("text")).toHaveText("128.50");
  await expect(expenses.getByRole("listitem")).toHaveText(["Food and Drink", "Cleaning"]);

  const cash = card(page, "Cash Balance");
  await expect(cash.getByText("1,160.50", { exact: true })).toBeVisible();

  await expect(page.getByText("Cash Shortage: HKD11.00")).toBeVisible();
  await expect(page.getByText("Paid a courier")).toBeVisible();
  await expect(page.getByRole("button", { name: "Back" })).toBeVisible();
  await expect(finish(page)).toHaveText("Finish Daily Report");
  await expectNoHorizontalScroll(page);
});

test("Show more opens each breakdown: the methods, every account, the till and the safebox", async ({ page }) => {
  await openWith(page, closeAnswer());
  const sales = card(page, "Total Sales");
  await expect(sales.getByText("Wechat Pay")).toBeHidden();
  await sales.getByRole("button", { name: "Show more" }).click();
  await expect(sales.getByRole("button", { name: "Show more" })).toHaveAttribute("aria-expanded", "true");
  const methods = sales.locator("#sales_breakdown");
  await expect(methods.getByText("Visa")).toBeVisible();
  await expect(methods.getByText("Wechat Pay")).toBeVisible();
  // nothing sold by a method shows as "-"
  await expect(methods.locator("div").filter({ hasText: /^Wechat Pay-$/ })).toHaveCount(1);
  await expect(methods.getByText("Keeta")).toBeVisible();
  await expect(methods.getByText("234.50")).toBeVisible();
  await expect(methods.getByText("Cash Sales")).toBeVisible();
  await sales.getByRole("button", { name: "Show more" }).click();
  await expect(methods).toBeHidden();

  const expenses = card(page, "Total Expenses");
  await expenses.getByRole("button", { name: "Show more" }).click();
  const all = expenses.locator("#expenses_breakdown");
  await expect(all.getByText("Food and Drink")).toBeVisible();
  await expect(all.getByText("78.50")).toBeVisible();
  await expect(all.getByText("50.00")).toBeVisible();

  const cash = card(page, "Cash Balance");
  await cash.getByRole("button", { name: "Show more" }).click();
  await expect(cash.getByText("Cash Till Balance")).toBeVisible();
  await expect(cash.getByText("1,000.50")).toBeVisible();
  await expect(cash.getByText("Safebox")).toBeVisible();
  await expect(cash.getByText("160.00")).toBeVisible();
  await expectNoHorizontalScroll(page);
});

test("no yesterday, no expenses, a balanced count: the arrow alone, No expenses recorded, no box", async ({ page }) => {
  const base = closeAnswer();
  await openWith(
    page,
    closeAnswer({
      sales: { ...(base.sales as Json), yesterday_total: null },
      expenses: { lines: [], total: 0 },
      cash: { ...(base.cash as Json), counted: 1011.5, difference: { amount: 0, kind: "none", reason: "" } },
    }),
  );
  const sales = card(page, "Total Sales");
  await expect(sales.getByText("Compared to Yesterday")).toBeVisible();
  await expect(sales.getByText("%")).toHaveCount(0);
  await expect(page.getByText("No expenses recorded")).toBeVisible();
  await expect(card(page, "Total Expenses").getByRole("button", { name: "Show more" })).toHaveCount(0);
  await expect(page.getByText(/Cash (Shortage|Surplus)/)).toHaveCount(0);
});

test("a fall against yesterday is red and points down; a surplus is green", async ({ page }) => {
  const base = closeAnswer();
  await openWith(
    page,
    closeAnswer({
      sales: { ...(base.sales as Json), yesterday_total: 2469 },
      cash: { ...(base.cash as Json), counted: 1020, difference: { amount: 8.5, kind: "over", reason: "" } },
    }),
  );
  await expect(card(page, "Total Sales").getByText("50.0%")).toHaveClass(/text-flask-red-500/);
  await expect(page.getByText("Cash Surplus: HKD8.50")).toBeVisible();
});

test("Finish posts the day once, shows Finishing..., then the Submitted page", async ({ page }) => {
  const posts: Json[] = [];
  let release: () => void = () => {};
  const held = new Promise<void>((resolve) => (release = resolve));
  await openWith(page, closeAnswer(), {
    onSubmit: async (body, route) => {
      posts.push(body);
      await held;
      await route.fulfill({ json: { report_id: REPORT, transaction_date: DAY, status: "submitted", submitted_at: null, closing_balance: 1160.5, next: "submitted" } });
    },
  });
  await finish(page).dblclick();
  await finish(page).click({ force: true });
  await expect(finish(page)).toHaveText("Finishing...");
  await expect(finish(page)).toBeDisabled();
  await expect(page.getByRole("status").filter({ hasText: /^Finishing\.\.\./ })).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: /Finishing\.\.\. \d+%/ })).toBeVisible();
  release();
  await page.waitForURL(SUBMITTED);
  await expect(page.getByRole("heading", { name: "Report Submitted Successfully!" })).toBeVisible();
  expect(posts).toEqual([{ transaction_date: DAY }]);
});

test("a refusal sends the person to the step that fixes it, with the sentence", async ({ page }) => {
  const why = "An expense has no account or no amount. Fix it in Expenses, then submit.";
  let posts = 0;
  await openWith(page, closeAnswer(), {
    onSubmit: async (_body, route) => {
      posts += 1;
      await route.fulfill({ status: 409, json: { error: why, to: "expenses" } });
    },
  });
  await finish(page).click();
  await expect(page).toHaveURL(new RegExp(`${BASE}/reports/new/expense\\?transaction_date=${DAY}$`));
  await expect(page.getByRole("heading", { name: "Expenses", exact: true })).toBeVisible();
  await expect(toast(page, why)).toBeVisible();
  expect(posts).toBe(1);
});

test("a refusal because the day is in already goes to its Submitted page", async ({ page }) => {
  await openWith(page, closeAnswer(), {
    onSubmit: (_body, route) => route.fulfill({ status: 409, json: { error: "This day is already submitted.", to: "submitted", report_id: REPORT } }),
  });
  await finish(page).click();
  await page.waitForURL(SUBMITTED);
});

test("a failure keeps the day: the sentence, and Finish works again", async ({ page }) => {
  let posts = 0;
  await openWith(page, closeAnswer(), {
    onSubmit: async (_body, route) => {
      posts += 1;
      if (posts === 1) await route.fulfill({ status: 500, json: { error: "Something went wrong on our side. Please try again." } });
      else await route.fulfill({ json: { report_id: REPORT, transaction_date: DAY, status: "submitted", submitted_at: null, closing_balance: 1160.5, next: "submitted" } });
    },
  });
  await finish(page).click();
  await expect(toast(page, "Something went wrong on our side. Please try again.")).toBeVisible();
  await expect(finish(page)).toHaveText("Finish Daily Report");
  await expect(page.getByRole("heading", { name: "Summary", exact: true })).toBeVisible();
  await finish(page).click();
  await page.waitForURL(SUBMITTED);
  expect(posts).toBe(2);
});

test("a problem on arrival is said at once and beside Finish, and Finish goes to fix it without posting", async ({ page }) => {
  const why = "The figures changed after the cash count. Check the cash count again, then submit.";
  let posts = 0;
  await openWith(page, closeAnswer({ problem: { error: why, to: "cash_count" } }), {
    onSubmit: async (_body, route) => {
      posts += 1;
      await route.fulfill({ status: 500, json: {} });
    },
  });
  await expect(toast(page, why)).toHaveCount(1);
  await expect(finish(page)).toHaveAccessibleDescription(why);
  await finish(page).click();
  await expect(page).toHaveURL(new RegExp(`${BASE}/reports/new/cash-count\\?transaction_date=${DAY}$`));
  await expect(page.getByRole("heading", { name: "Cash Count", exact: true })).toBeVisible();
  expect(posts).toBe(0);
});

test("a drawer below zero holds the page on Fix Negative Balance, and Finish never posts", async ({ page }) => {
  let posts = 0;
  const base = closeAnswer();
  await openWith(
    page,
    closeAnswer({
      cash: { ...(base.cash as Json), bank_deposit: 1600, expected: -128.5 },
      problem: { error: "Hmm, it looks like your cash balance is negative. Could you fix that first?", to: "cash_count" },
    }),
    {
      onSubmit: async (_body, route) => {
        posts += 1;
        await route.fulfill({ status: 500, json: {} });
      },
    },
  );
  const dialog = page.getByRole("alertdialog", { name: "Fix Negative Balance" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("(HKD128.50)")).toBeVisible();
  for (const name of ["Opening (Cash in: HKD 0.00)", "Sales (Cash in: HKD 600.00)", "Expenses (Cash out: HKD 128.50)", "Deposit (Cash out: HKD 1,600.00)", "Cash Count"]) {
    await expect(dialog.getByRole("button", { name, exact: true })).toBeVisible();
  }
  await page.keyboard.press("Escape");
  await expect(dialog).toBeVisible();
  expect(posts).toBe(0);
  await dialog.getByRole("button", { name: "Cash Count", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`${BASE}/reports/new/cash-count\\?transaction_date=${DAY}$`));
});

test("a day with no draft goes back to Opening and says why", async ({ page }) => {
  const why = "I don't see a draft yet - let's start with the opening entry.";
  await stub(page, closeAnswer(), { onRead: (route) => route.fulfill({ status: 409, json: { error: why, to: "opening" } }) });
  await enter(page);
  await expect(page).toHaveURL(new RegExp(`${BASE}/reports/new/opening\\?transaction_date=${DAY}$`));
  await expect(page.getByRole("heading", { name: "Opening" })).toBeVisible();
  await expect(toast(page, why)).toBeVisible();
});

test("a day already submitted opens its Submitted page", async ({ page }) => {
  await stub(page, closeAnswer(), {
    onRead: (route) => route.fulfill({ status: 409, json: { error: "This day is already submitted.", to: "submitted", report_id: REPORT } }),
  });
  await enter(page);
  await page.waitForURL(SUBMITTED);
});

test("Back goes to Cash Count, and Cash Count's Save & Next comes back here, all in this app", async ({ page }) => {
  await stub(page, closeAnswer());
  await page.route(`${API}/reports/cash-count**`, async (route) => {
    if (route.request().method() === "PUT") {
      await route.fulfill({
        json: { draft_id: "d", transaction_date: DAY, current_section: "ending", completed_sections: DRAFT.completed_sections, next: "ending", discrepancy: { amount: -11, kind: "short" } },
      });
      return;
    }
    await route.fulfill({ json: COUNT });
  });
  let left = false;
  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame() && !frame.url().startsWith("http://localhost:3010") && !frame.url().startsWith("about:")) left = true;
  });
  await enter(page);
  await expect(page.getByRole("heading", { name: "Summary", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Back" }).click();
  await expect(page.getByRole("heading", { name: "Cash Count", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Save & Next" }).click();
  await expect(page).toHaveURL(new RegExp(`${BASE}/reports/new/ending\\?transaction_date=${DAY}$`));
  await expect(page.getByRole("heading", { name: "Summary", exact: true })).toBeVisible();
  expect(left).toBe(false);
});

test("the page reloads with no console error", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(e.message));
  await openWith(page, closeAnswer());
  await page.reload();
  await expect(page.getByRole("heading", { name: "Summary", exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});
