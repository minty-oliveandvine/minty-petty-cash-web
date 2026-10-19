// The Daily Closing's Close stage (components/closing/Close.tsx, Part 15.9g / 15.15e) and the
// outcome page after Submit Daily Report (components/closing/ReportOutcome.tsx, Part 15.12e),
// against a STUBBED Petty Cash API. Needs only `npm run dev`. The other stages are this app's own
// (stubbed quietly); Flask's pages (by the company's full id) are caught, so nothing leaves the
// app. Refusals are inline alerts or Page banners, never toasts.

import { expect, test, type Page, type Route } from "@playwright/test";

import { companyRef } from "./companyRef";
import { expectNoHorizontalScroll, mintModuleToken } from "./helpers";

const ENTITY = "3d65f186-5ba1-4bf7-a1b0-cc64a113eb5c";
const NAME = "E2E Petty Cash Shop";
const BASE = `/entity/${companyRef(ENTITY, NAME)}/petty-cash`;
const DAY = "2026-10-13";
const REPORT = "5d6e7f80-0000-4000-8000-000000000001";
const CLOSE_URL = `${BASE}/reports/new/ending?transaction_date=${DAY}`;
const OUTCOME_URL = `${BASE}/reports/${REPORT}/submitted`;
const stageUrl = (path: string, day = DAY) => `${BASE}/reports/new/${path}?transaction_date=${day}`;
const exact = (url: string) => new RegExp(`${url.replace(/[?.]/g, "\\$&")}$`);

type Json = Record<string, unknown>;

const DRAFT = {
  id: "d",
  status: "draft",
  current_section: "ending",
  completed_sections: ["opening", "sales", "expenses", "deposit", "cash_count"],
  xero_integrated: false,
  publishing_status: "unpublished",
};

/** Opening 500 + 100, sales 1,070.50 (cash 820.50), expenses 240.50, deposit 300: 980.00 expected; 960.00 counted. */
function closeAnswer(over: Json = {}, cash: Json = {}): Json {
  return {
    transaction_date: DAY,
    currency_code: "HKD",
    draft: DRAFT,
    opening_balance: 500,
    cash_addition: 100,
    sales: {
      methods: [
        { sale_id: "s1", name: "Octopus", value_name: "octopus_sales", type: "electronic", amount: 200 },
        { sale_id: "s2", name: "Deliveroo", value_name: "deliveroo_sales", type: "delivery", amount: 0 },
        { sale_id: "s3", name: "Foodpanda", value_name: "foodpanda_sales", type: "delivery", amount: 50 },
      ],
      cash: 820.5,
      total: 1070.5,
      yesterday_total: 900,
      history: [{ date: DAY, total: 1070.5 }],
    },
    expenses: {
      lines: [
        { id: "e1", item: "General Expenses", supplier: "ParknShop", remarks: "", amount: 120.5, receipts: 1 },
        { id: "e2", item: "Cleaning", supplier: "", remarks: "Mop", amount: 120, receipts: 0 },
      ],
      total: 240.5,
    },
    cash: { bank_deposit: 300, expected: 780, counted: 760, safe_box: 0, difference: { amount: -20, kind: "short", reason: "Change given twice" }, ...cash },
    closing_balance: 760,
    problem: null,
    ...over,
  };
}

function outcomeAnswer(over: Json = {}): Json {
  return {
    report_id: REPORT,
    transaction_date: DAY,
    currency_code: "HKD",
    company_name: NAME,
    status: "submitted",
    submitted: true,
    submitted_at: "2026-10-13T10:12:00+00:00",
    submitted_by: "Olive",
    cash_counted: 760,
    difference: { amount: -20, kind: "short", has_reason: true },
    xero: { publishing_status: "unpublished", published_at: null, xero_integrated: false, was_published: false },
    can_publish: true,
    is_today: false,
    next_day: "2026-10-14",
    ...over,
  };
}

const SUBMITTED = { report_id: REPORT, transaction_date: DAY, status: "submitted", submitted_at: "2026-10-13T10:12:00+00:00", closing_balance: 760, next: "submitted" };

const OPENING = { transaction_date: DAY, currency_code: "HKD", draft: DRAFT, starting_cash_balance: 500, yesterday_closing_balance: 500, safebox_balance: 0, cash_addition: null, withdrawal: "personal" };
const CASH = {
  transaction_date: DAY,
  currency_code: "HKD",
  draft: { ...DRAFT, current_section: "deposit", completed_sections: ["opening", "sales", "expenses"] },
  opening_balance: 500,
  cash_addition: 0,
  cash_sales: 0,
  expenses: 0,
  bank_deposit: 0,
  cash_on_hand: 500,
  expected_cash: 500,
  denominations: [{ id: "n500", value: 500, kind: "note", count: 1 }],
  safe_box_balance: 0,
  discrepancy: { amount: 0, kind: "none", reason: "" },
};

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
  onSubmit?: (route: Route) => Promise<void>;
  outcome?: (route: Route) => Promise<void>;
  home?: Json;
};

/** Every POST /reports/submit body the page sent. */
async function stub(page: Page, answer: Json, { read, onSubmit, outcome, home }: Setup = {}): Promise<Json[]> {
  const submits: Json[] = [];
  const api = "**/api/petty-cash/v1/companies/*";
  await page.route(`${api}/reports/close**`, (route) => (read ? read(route) : route.fulfill({ json: answer })));
  await page.route(`${api}/reports/submit`, async (route) => {
    submits.push(route.request().postDataJSON() as Json);
    if (onSubmit) await onSubmit(route);
    else await route.fulfill({ json: SUBMITTED });
  });
  await page.route(`${api}/reports/*/outcome`, (route) => (outcome ? outcome(route) : route.fulfill({ json: outcomeAnswer() })));
  await page.route(`${api}/reports/opening**`, (route) => route.fulfill({ json: OPENING }));
  await page.route(`${api}/reports/cash-count**`, async (route) => {
    if (route.request().method() === "PUT") {
      await route.fulfill({
        json: { draft_id: "d", transaction_date: DAY, current_section: "ending", completed_sections: DRAFT.completed_sections, next: "ending", discrepancy: { amount: 0, kind: "none" } },
      });
      return;
    }
    await route.fulfill({ json: CASH });
  });
  await page.route(`${api}/home`, (route) => route.fulfill({ json: home ?? homeAnswer() }));
  await page.route("**/api/me/profile**", (route) => route.fulfill({ json: { user: { name: "Tess Tester", initials: "TT" } } }));
  // Flask's pages (by the company's full id): caught.
  await page.route(/\/entity\/[0-9a-f-]{36}\/petty-cash\/reports(?:[/?]|$)/, (route) =>
    route.fulfill({ contentType: "text/html", body: "<title>Flask page</title><p>Flask page</p>" }),
  );
  return submits;
}

async function arrive(page: Page, next: string) {
  const token = mintModuleToken({ secret: "stub", userId: "u", entityId: ENTITY, entityName: NAME });
  await page.goto(`/landing?${new URLSearchParams({ token, entity_id: ENTITY, entity_name: NAME, next })}`);
}

async function openWith(page: Page, answer: Json, setup: Setup = {}): Promise<Json[]> {
  const submits = await stub(page, answer, setup);
  await arrive(page, CLOSE_URL);
  await expect(page.getByRole("heading", { level: 1, name: "Close" })).toBeVisible();
  await expect(page.getByRole("status", { name: "Loading" })).toHaveCount(0);
  return submits;
}

const submitButton = (page: Page) => page.getByRole("button", { name: /Submit Daily Report|Submitting/ });
const section = (page: Page, name: string | RegExp) => page.getByRole("region", { name });
/** A Description row's value by its term, inside `scope`. */
const value = (page: Page, term: string, scope = page.locator("main")) =>
  scope.locator("div, dl").filter({ has: page.locator("dt", { hasText: new RegExp(`^${term.replace(/[().]/g, "\\$&")}$`) }) }).last().locator("dd").first();

test("the read-only summary: each stage with its Edit link, the closing balance and the difference with its reason", async ({ page }) => {
  await openWith(page, closeAnswer());
  await expect(page.getByText("Check the day, then submit the Daily Report.")).toBeVisible();
  await expect(page.getByText("Daily Closing · Tue 13 Oct 2026")).toBeVisible();
  const stages = page.getByRole("list", { name: "Daily Closing stages" });
  await expect(stages.getByText("Close, current step")).toBeVisible();
  await expect(stages.getByRole("link", { name: "Drawer, done" })).toHaveAttribute("href", stageUrl("opening"));
  await expect(stages.getByRole("link", { name: "Cash Count, done" })).toHaveAttribute("href", stageUrl("cash-count"));

  // nothing to type: Close is a verification
  await expect(page.getByRole("textbox")).toHaveCount(0);

  const drawer = section(page, "Addition to Drawer");
  await expect(drawer.getByRole("link", { name: "Edit Addition to Drawer" })).toHaveAttribute("href", stageUrl("opening"));
  await expect(value(page, "Starting cash balance", drawer)).toHaveText("HKD500.00");
  await expect(value(page, "Added to the drawer", drawer)).toHaveText("HKD100.00");

  const sales = section(page, "Sales");
  await expect(sales.getByRole("link", { name: "Edit Sales" })).toHaveAttribute("href", stageUrl("sale"));
  await expect(value(page, "Octopus", sales)).toHaveText("HKD200.00");
  await expect(value(page, "Foodpanda", sales)).toHaveText("HKD50.00");
  await expect(sales.getByText("Deliveroo")).toHaveCount(0);
  await expect(value(page, "Cash", sales)).toHaveText("HKD820.50");
  await expect(value(page, "Total sales", sales)).toHaveText("HKD1,070.50");
  // no KPIs or trends inside the workflow (D15-03)
  await expect(page.getByText(/yesterday|history/i)).toHaveCount(0);

  const expenses = section(page, "Expenses (2)");
  await expect(expenses.getByRole("link", { name: "Edit Expenses" })).toHaveAttribute("href", stageUrl("expense"));
  await expect(value(page, "General Expenses · ParknShop", expenses)).toHaveText("HKD120.50");
  await expect(value(page, "Cleaning", expenses)).toHaveText("HKD120.00");
  await expect(value(page, "Receipts", expenses)).toHaveText("1 of 2 expenses");
  await expect(value(page, "Total expenses", expenses)).toHaveText("HKD240.50");

  const count = section(page, "Cash Count");
  await expect(count.getByRole("link", { name: "Edit Cash Count" })).toHaveAttribute("href", stageUrl("cash-count"));
  await expect(value(page, "Cash taken for bank deposit", count)).toHaveText("HKD300.00");
  await expect(value(page, "Expected in drawer", count)).toHaveText("HKD780.00");
  await expect(value(page, "Counted in the drawer", count)).toHaveText("HKD760.00");
  await expect(value(page, "In the safe box", count)).toHaveText("HKD0.00");
  await expect(value(page, "Difference", count)).toHaveText("HKD20.00 short");
  const warning = count.getByRole("status").filter({ hasText: "The count is HKD20.00 short" });
  await expect(warning).toHaveAttribute("data-tone", "warning");
  await expect(warning).toContainText("Reason: Change given twice");

  await expect(value(page, "Closing balance")).toHaveText("HKD760.00");
  // amounts are plain text, never coloured
  for (const term of ["Difference", "Closing balance"]) await expect(value(page, term)).toHaveClass(/text-text-primary/);

  await expect(submitButton(page)).toBeEnabled();
  await expect(page.getByRole("link", { name: "Save & Exit" })).toHaveAttribute("href", BASE);
  // Publish to Xero is not part of this wave
  await expect(page.getByRole("button", { name: /Publish/ })).toHaveCount(0);
});

test("any cent is a difference, and a count with none says None with no warning", async ({ page }) => {
  await openWith(page, closeAnswer({}, { difference: { amount: 0.01, kind: "over", reason: "" } }));
  await expect(value(page, "Difference")).toHaveText("HKD0.01 over");
  await expect(page.getByRole("status").filter({ hasText: "The count is HKD0.01 over" })).toContainText("No reason was given yet.");
  await page.unroute("**/api/petty-cash/v1/companies/*/reports/close**");
  await page.route("**/api/petty-cash/v1/companies/*/reports/close**", (route) =>
    route.fulfill({ json: closeAnswer({}, { difference: { amount: 0, kind: "none", reason: "" } }) }),
  );
  await page.reload();
  await expect(value(page, "Difference")).toHaveText("None");
  await expect(page.locator("[data-tone=warning]")).toHaveCount(0);
});

test("a day with no expenses says so, and Edit links still open each stage in the app", async ({ page }) => {
  await openWith(page, closeAnswer({ expenses: { lines: [], total: 0 } }));
  const expenses = section(page, "Expenses (0)");
  await expect(expenses.getByText("No expenses added for the day.")).toBeVisible();
  await expect(value(page, "Receipts", expenses)).toHaveCount(0);
  await page.evaluate(() => Object.assign(window, { __stayed: true }));
  await page.getByRole("link", { name: "Edit Addition to Drawer" }).click();
  await expect(page).toHaveURL(exact(stageUrl("opening")));
  await expect(page.getByRole("heading", { level: 1, name: "Addition to Drawer" })).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { __stayed?: boolean }).__stayed)).toBe(true);
});

test("Submit opens the outcome page with the server's facts - and a double click submits once", async ({ page }) => {
  const submits = await openWith(page, closeAnswer(), {
    onSubmit: async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 600));
      await route.fulfill({ json: SUBMITTED });
    },
  });
  // two clicks in the same tick, before React re-renders
  await submitButton(page).evaluate((b: HTMLButtonElement) => {
    b.click();
    b.click();
  });
  await expect(submitButton(page)).toHaveText("Submitting…");
  await expect(submitButton(page)).toBeDisabled();

  await expect(page).toHaveURL(exact(OUTCOME_URL));
  const title = page.getByRole("heading", { level: 1, name: "The report is submitted" });
  await expect(title).toBeFocused();
  await expect(page.getByText("Tue 13 Oct 2026 · E2E Petty Cash Shop")).toBeVisible();
  await expect(value(page, "Cash counted")).toHaveText("HKD760.00");
  await expect(value(page, "Difference")).toHaveText("HKD20.00 short · note added");
  await expect(value(page, "Sent to Xero")).toHaveText("Not yet");
  // this app's own Daily Report (e2e/08_daily_report.spec.ts); not in Xero yet, so Publish to Xero leads (e2e/12_publish.spec.ts)
  await expect(page.getByRole("link", { name: "View report" })).toHaveAttribute("href", `${BASE}/reports/${REPORT}/summary`);
  await expect(page.getByRole("button", { name: "Publish to Xero" })).toBeVisible();
  expect(submits).toEqual([{ transaction_date: DAY }]);
});

test("a refused submit stays on Close, inline, with the way to the stage that fixes it; nothing moves", async ({ page }) => {
  const why = "The figures changed after the cash count. Check the cash count again, then submit.";
  const submits = await openWith(page, closeAnswer(), { onSubmit: (route) => route.fulfill({ status: 409, json: { error: why, to: "cash_count" } }) });
  await submitButton(page).click();
  const alert = page.getByRole("alert").filter({ hasText: why });
  await expect(alert).toHaveAttribute("data-tone", "danger");
  await expect(page).toHaveURL(exact(CLOSE_URL));
  await expect(submitButton(page)).toHaveText("Submit Daily Report");
  await expect(submitButton(page)).toBeEnabled();
  expect(submits).toHaveLength(1);
  await alert.getByRole("link", { name: "Go to Cash Count" }).click();
  await expect(page).toHaveURL(exact(stageUrl("cash-count")));
  await expect(page.getByRole("heading", { level: 1, name: "Cash Count" })).toBeVisible();
});

test("a submit that finds the day already submitted opens its outcome", async ({ page }) => {
  await openWith(page, closeAnswer(), {
    onSubmit: (route) => route.fulfill({ status: 409, json: { error: "This day is already submitted.", to: "submitted", report_id: REPORT } }),
  });
  await submitButton(page).click();
  await expect(page).toHaveURL(exact(OUTCOME_URL));
  await expect(page.getByRole("heading", { level: 1, name: "The report is submitted" })).toBeVisible();
});

test("the gate on arrival: the rule, the reason and one action; Submit disabled with its reason beside it", async ({ page }) => {
  const submits = await openWith(page, closeAnswer({ problem: { error: "Finish Sales before you submit the day.", to: "sales" } }));
  const gate = page.getByRole("status").filter({ hasText: "This day can't be submitted yet" });
  await expect(gate).toHaveAttribute("data-tone", "warning");
  await expect(gate).toContainText("Finish Sales before you submit the day.");
  await expect(gate.getByRole("link", { name: "Go to Sales" })).toHaveAttribute("href", stageUrl("sale"));
  await expect(submitButton(page)).toBeDisabled();
  const reason = page.getByText("Fix Sales first, then submit.");
  await expect(reason).toBeVisible();
  await expect(submitButton(page)).toHaveAttribute("aria-describedby", (await reason.getAttribute("id")) ?? "missing");
  await submitButton(page).click({ force: true });
  expect(submits).toEqual([]);
  // the summary is still there to check
  await expect(section(page, "Cash Count")).toBeVisible();
});

test("a drawer below zero is the gate in figures, with Cash Count to fix it", async ({ page }) => {
  await openWith(
    page,
    closeAnswer({ problem: { error: "Hmm, it looks like your cash balance is negative. Could you fix that first?", to: "cash_count" }, closing_balance: -20 }, { expected: -20, counted: 0, difference: { amount: 20, kind: "over", reason: "" } }),
  );
  const gate = page.getByRole("status").filter({ hasText: "The drawer is below zero" });
  await expect(gate).toContainText("Expected in drawer comes to -HKD20.00. Lower the deposit or check the earlier stages before you submit.");
  await expect(gate.getByRole("link", { name: "Go to Cash Count" })).toHaveAttribute("href", stageUrl("cash-count"));
  await expect(value(page, "Expected in drawer")).toHaveText("-HKD20.00");
  await expect(value(page, "Closing balance")).toHaveText("-HKD20.00");
  await expect(page.getByText("Fix Cash Count first, then submit.")).toBeVisible();
  await expect(submitButton(page)).toBeDisabled();
});

test("no draft for the day: Close sends the person to Addition to Drawer, which says why", async ({ page }) => {
  const why = "I don't see a draft yet - let's start with the opening entry.";
  await stub(page, closeAnswer(), { read: (route) => route.fulfill({ status: 409, json: { error: why, to: "opening" } }) });
  await arrive(page, CLOSE_URL);
  await expect(page).toHaveURL(exact(stageUrl("opening")));
  await expect(page.getByRole("heading", { level: 1, name: "Addition to Drawer" })).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: why })).toHaveAttribute("data-tone", "warning");
});

test("a day already submitted: Close opens its outcome, and Back does not return to Close", async ({ page }) => {
  await stub(page, closeAnswer(), {
    read: (route) => route.fulfill({ status: 409, json: { error: "This day is already submitted.", to: "submitted", report_id: REPORT } }),
  });
  await arrive(page, BASE);
  await expect(page.getByRole("heading", { level: 1, name: "Petty Cash" })).toBeVisible();
  await page.goto(CLOSE_URL);
  await expect(page).toHaveURL(exact(OUTCOME_URL));
  await expect(page.getByRole("heading", { level: 1, name: "The report is submitted" })).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(new RegExp(`${BASE}$`));
});

test("Cash Count's Save & Next opens Close without leaving the app", async ({ page }) => {
  await stub(page, closeAnswer());
  await arrive(page, stageUrl("cash-count"));
  await expect(page.getByRole("heading", { level: 1, name: "Cash Count" })).toBeVisible();
  await expect(page.getByRole("status", { name: "Loading" })).toHaveCount(0);
  await page.evaluate(() => Object.assign(window, { __stayed: true }));
  await page.getByRole("button", { name: "Save & Next" }).click();
  await expect(page).toHaveURL(exact(CLOSE_URL));
  await expect(page.getByRole("heading", { level: 1, name: "Close" })).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { __stayed?: boolean }).__stayed)).toBe(true);
});

test("the launch page's Continue on a report left on Close opens this stage", async ({ page }) => {
  await stub(page, closeAnswer(), {
    home: homeAnswer({ draft: { id: "d", current_section: "ending", completed_sections: DRAFT.completed_sections, last_edit_seconds: 60 }, draft_date: DAY }),
  });
  await arrive(page, BASE);
  const card = page.getByRole("region", { name: /Daily Closing/ });
  await expect(card).toContainText("Next: Close");
  await expect(card.getByRole("list", { name: "Daily Closing stages" }).getByRole("link", { name: "Close, current step" })).toHaveAttribute("href", CLOSE_URL);
  await card.getByRole("button", { name: "Continue Daily Closing" }).click();
  await expect(page).toHaveURL(exact(CLOSE_URL));
  await expect(page.getByRole("heading", { level: 1, name: "Close" })).toBeVisible();
});

test("the outcome's Back to home goes to the launch page, and starts nothing", async ({ page }) => {
  await stub(page, closeAnswer());
  await arrive(page, OUTCOME_URL);
  await expect(page.getByRole("heading", { level: 1, name: "The report is submitted" })).toBeVisible();
  await page.getByRole("link", { name: "Back to home" }).click();
  await expect(page).toHaveURL(new RegExp(`${BASE}$`));
  await expect(page.getByRole("button", { name: "Start today's Daily Closing" })).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`${BASE}$`));
});

test("Start the next day starts it on the launch page, through its start rules, onto Addition to Drawer", async ({ page }) => {
  await stub(page, closeAnswer());
  await arrive(page, OUTCOME_URL);
  await page.getByRole("button", { name: "Start the next day" }).click();
  await expect(page).toHaveURL(exact(stageUrl("opening", "2026-10-14")));
  await expect(page.getByRole("heading", { level: 1, name: "Addition to Drawer" })).toBeVisible();
});

test("Start the next day asks Before You Start first when the day banked cash", async ({ page }) => {
  await stub(page, closeAnswer(), {
    home: homeAnswer({
      latest: { date: DAY, closing_balance: 760, deposit: 300, deposit_bank_name: "HSBC", deposit_bank_number: "123", deposit_correction_missing_settings: [], can_correct_deposit: true, submitter_first_name: "Olive" },
      published: { [DAY]: { id: REPORT, closing_balance: 760, bank_deposit: 300, xero_integrated: false, submitter_first_name: "Olive" } },
    }),
  });
  await arrive(page, OUTCOME_URL);
  await page.getByRole("button", { name: "Start the next day" }).click();
  await expect(page).toHaveURL(new RegExp(`${BASE}$`));
  await expect(page.getByRole("dialog")).toContainText("HKD300.00");
});

test("today's outcome offers no next day; a pending publish is an Info line; Xero's time shows once it is in", async ({ page }) => {
  await stub(page, closeAnswer(), {
    outcome: (route) => route.fulfill({ json: outcomeAnswer({ is_today: true, xero: { publishing_status: "publishing", published_at: null, xero_integrated: false, was_published: false } }) }),
  });
  // the page watches the publish it opened on (e2e/12_publish.spec.ts): still publishing
  await page.route("**/api/petty-cash/v1/companies/*/reports/*/publishing-status", (route) =>
    route.fulfill({
      json: { report_id: REPORT, publishing_status: "publishing", status_label: "Publishing to Xero", status_tone: "info", xero_integrated: false, was_published: false, published_at: null, reasons: [] },
    }),
  );
  await arrive(page, OUTCOME_URL);
  await expect(page.getByRole("heading", { level: 1, name: "Today's report is submitted" })).toBeFocused();
  await expect(page.getByRole("button", { name: "Start the next day" })).toHaveCount(0);
  await expect(value(page, "Sent to Xero")).toHaveText("Pending");
  await expect(page.getByRole("status").filter({ hasText: "Publishing to Xero" })).toHaveAttribute("data-tone", "info");
  await expect(page.getByRole("button", { name: /Publish/ })).toHaveCount(0);
});

test("an outcome the API doesn't know says so, with the way home", async ({ page }) => {
  await stub(page, closeAnswer(), { outcome: (route) => route.fulfill({ status: 404, json: { error: "Hmm, I couldn't find that report." } }) });
  await arrive(page, `${BASE}/reports/not-a-report/submitted`);
  await expect(page.getByRole("alert").filter({ hasText: "Hmm, I couldn't find that report." })).toBeVisible();
  await expect(page.getByRole("link", { name: "Back to home" })).toHaveAttribute("href", BASE);
});

test("the largest amounts are never clipped, and neither page scrolls sideways", async ({ page }) => {
  const big = 99999999999.99;
  await openWith(
    page,
    closeAnswer(
      {
        opening_balance: big,
        sales: { methods: [{ sale_id: "s1", name: "A very long electronic payment method name", value_name: "x_sales", type: "electronic", amount: big }], cash: big, total: big, yesterday_total: null, history: [] },
        expenses: { lines: [{ id: "e1", item: "An account with a long business name", supplier: "A supplier with a very long trading name Limited", remarks: "", amount: big, receipts: 1 }], total: big },
        closing_balance: -big,
      },
      { bank_deposit: big, expected: -big, counted: big, safe_box: big, difference: { amount: -big, kind: "short", reason: "x".repeat(300) } },
    ),
  );
  const clipped = () =>
    page.evaluate(() =>
      Array.from(document.querySelectorAll("main dd, main dt, main h1, main h2, main a, main button"))
        .filter((el) => el.scrollWidth > el.clientWidth + 1)
        .map((el) => el.textContent),
    );
  expect(await clipped()).toEqual([]);
  await expectNoHorizontalScroll(page);

  await page.route("**/api/petty-cash/v1/companies/*/reports/*/outcome", (route) =>
    route.fulfill({ json: outcomeAnswer({ cash_counted: big, difference: { amount: -big, kind: "short", has_reason: true }, company_name: "A company with a rather long registered name Limited" }) }),
  );
  await page.goto(OUTCOME_URL);
  await expect(page.getByRole("heading", { level: 1, name: "The report is submitted" })).toBeVisible();
  expect(await clipped()).toEqual([]);
  await expectNoHorizontalScroll(page);
});

test("both pages reload with no console error", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(e.message));
  await openWith(page, closeAnswer());
  // Arriving through /landing renders in the browser only; a reload is a full server render that
  // the browser then hydrates - where a mismatch shows.
  await page.reload();
  await expect(page.getByRole("heading", { level: 1, name: "Close" })).toBeVisible();
  await expect(value(page, "Closing balance")).toHaveText("HKD760.00");
  await page.goto(OUTCOME_URL);
  await expect(page.getByRole("heading", { level: 1, name: "The report is submitted" })).toBeVisible();
  await page.reload();
  await expect(value(page, "Cash counted")).toHaveText("HKD760.00");
  expect(errors).toEqual([]);
});
