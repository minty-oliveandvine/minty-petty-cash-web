// A submitted report's stepper and its read-only steps (components/report/view/ReportStepView.tsx;
// Flask's submitted-report mode of each step template), against a STUBBED Petty Cash API. Needs
// only `npm run dev`. Nothing here may change the report: every write is caught and counted.

import { expect, test, type Page } from "@playwright/test";

import { companyRef } from "./companyRef";
import { expectNoHorizontalScroll, landingAddress, mintModuleToken } from "./helpers";

const ENTITY = "3d65f186-5ba1-4bf7-a1b0-cc64a113eb5c";
const NAME = "E2E Petty Cash Shop";
const BASE = `/entity/${companyRef(ENTITY, NAME)}/petty-cash`;
const DAY = "2026-10-13";
const API = "**/api/petty-cash/v1/companies/*";
const REPORT = "8a1d3c55-0f8e-4f4e-9d55-2c4b7d1e0a77";
const SUMMARY = `${BASE}/reports/${REPORT}/summary`;
const view = (segment: string) => `${BASE}/reports/${REPORT}/${segment}`;

type Json = Record<string, unknown>;

const method = (name: string, value_name: string, type: string, amount: number) => ({
  sale_id: value_name,
  name,
  value_name,
  type,
  amount,
});

/** GET /reports/<id>: 13 OCT, submitted. Opening 1,000 (160 in the safebox) + 50 added = 1,050;
 *  + 600 cash sales - 128.50 expenses = 1,521.50 on hand; - 300 deposited = 1,221.50 expected;
 *  counted 1,050.50 in the till + 160 in the safebox = 1,210.50, 11.00 short. */
function reportAnswer(over: Json = {}): Json {
  return {
    report_id: REPORT,
    transaction_date: DAY,
    currency_code: "HKD",
    company_name: NAME,
    status: "submitted",
    status_label: "Submitted",
    status_tone: "info",
    is_latest: true,
    submitted_at: "2026-10-13T12:00:00+00:00",
    submitted_by: "Tess",
    published_at: null,
    publishing_status: "unpublished",
    xero_integrated: false,
    was_published: false,
    kpis: { total_sales: 1234.5, total_expenses: 128.5, cash_position: 1210.5 },
    sales: {
      methods: [
        method("Visa", "visa_sales", "electronic", 400),
        method("Keeta", "keeta_sales", "delivery", 234.5),
      ],
      cash: 600,
      total: 1234.5,
      yesterday_total: 1000,
      history: [],
    },
    expenses: {
      lines: [
        {
          id: "e1",
          item: "Food & Drink",
          supplier: { id: "s", name: "Acme" },
          description: "Team lunch",
          amount: 78.5,
          receipts: [],
        },
        {
          id: "e2",
          item: "Cleaning",
          supplier: { id: "s", name: "Acme" },
          description: "",
          amount: 50,
          receipts: [],
        },
      ],
      total: 128.5,
    },
    cash: {
      opening_balance: 1000,
      cash_addition: 50,
      cash_addition_type: "company",
      cash_sales: 600,
      expenses: 128.5,
      bank_deposit: 300,
      expected: 1221.5,
      counted: 1050.5,
      safe_box: 160,
      difference: { amount: -11, kind: "short", reason: "Paid a courier" },
      opening_safe_box: 160,
      denominations: [
        { id: "n1000", value: 1000, kind: "note", name: "$1000", count: 1 },
        { id: "n50", value: 50, kind: "note", name: "$50", count: 1 },
        { id: "c050", value: 0.5, kind: "coin", name: "50c", count: 1 },
        { id: "c010", value: 0.1, kind: "coin", name: "10c", count: 0 },
      ],
    },
    closing_balance: 1210.5,
    permissions: { edit: true, delete: true, publish: true, share: true, edit_details: true },
    options: { suppliers: [], accounts: [] },
    ...over,
  };
}

/** The report read stubbed; every other call to the API is a write this page must never make. */
async function stub(page: Page, report: Json = reportAnswer()) {
  const writes: string[] = [];
  await page.route(`${API}/**`, (route) => {
    const req = route.request();
    if (req.method() !== "GET") writes.push(`${req.method()} ${new URL(req.url()).pathname}`);
    return route.fulfill({ status: 404, json: { error: "Not stubbed." } });
  });
  await page.route(`${API}/reports/${REPORT}`, (route) =>
    route.request().method() === "GET" ? route.fulfill({ json: report }) : route.fallback(),
  );
  await page.route("**/api/me/profile**", (route) =>
    route.fulfill({ json: { user: { name: "Tess Tester", initials: "TT" } } }),
  );
  return writes;
}

async function enter(page: Page, next: string) {
  const token = mintModuleToken({
    secret: "stub",
    userId: "u",
    entityId: ENTITY,
    entityName: NAME,
  });
  await page.goto(
    await landingAddress(page, token, { entity_id: ENTITY, entity_name: NAME, next }),
  );
}

const steps = (page: Page) => page.getByRole("list", { name: "Report steps" });

test("the summary's stepper shows every step done, Ending current, each leading to its view", async ({
  page,
}) => {
  await stub(page);
  await enter(page, SUMMARY);
  await expect(page.getByRole("heading", { name: "Summary", exact: true })).toBeVisible();
  const list = steps(page);
  for (const [label, segment] of [
    ["Opening", "opening"],
    ["Sales", "sale"],
    ["Expenses", "expense"],
    ["Bank Deposit", "deposit"],
    ["Cash Count", "cash-count"],
  ]) {
    await expect(list.getByRole("link", { name: `${label}, done` })).toHaveAttribute(
      "href",
      view(segment),
    );
  }
  await expect(list.getByRole("link", { name: "Ending, current step" })).toHaveAttribute(
    "href",
    SUMMARY,
  );
  await expectNoHorizontalScroll(page);
});

test("Opening: the day's start, locked, and Close closes the report", async ({ page }) => {
  const writes = await stub(page);
  await enter(page, SUMMARY);
  await steps(page).getByRole("link", { name: "Opening, done" }).click();
  await expect(page).toHaveURL(view("opening"));
  await expect(page.getByRole("heading", { name: "Opening", exact: true })).toBeVisible();
  await expect(steps(page).getByRole("link", { name: "Opening, current step" })).toBeVisible();
  await expect(page.getByText("Submitted", { exact: true })).toBeVisible();

  await expect(page.getByText("HKD 1,000.00", { exact: true })).toBeVisible();
  await expect(page.getByText("HKD 840.00", { exact: true })).toBeVisible(); // the till
  await expect(page.getByText("HKD 160.00", { exact: true })).toBeVisible(); // the safebox
  const addition = page.getByLabel("Addition to Cash Drawer");
  await expect(addition).toHaveValue("50.00");
  await expect(addition).toHaveAttribute("readonly", "");
  await expect(page.getByRole("radio", { name: "Company Bank" })).toBeChecked();
  await expect(page.getByRole("radio", { name: "Company Bank" })).toBeDisabled();
  await expect(page.getByRole("radio", { name: "Personal" })).toBeDisabled();
  await expect(page.getByText("HKD 1,050.00", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /Save/ })).toHaveCount(0);
  await expectNoHorizontalScroll(page);

  await page.getByRole("button", { name: "Close" }).click();
  // past the summary it came through: with nothing before that in this app, report history
  await expect(page).toHaveURL(`${BASE}/reports`);
  expect(writes).toEqual([]);
});

test("Sales: each method and the cash, locked, with their totals", async ({ page }) => {
  const writes = await stub(page);
  await enter(page, view("sale"));
  await expect(page.getByRole("heading", { name: "Sales Entry" })).toBeVisible();
  await expect(page.getByLabel("Visa")).toHaveValue("400.00");
  await expect(page.getByLabel("Keeta")).toHaveValue("234.50");
  await expect(page.getByLabel("Cash Sales")).toHaveValue("600.00");
  for (const field of ["Visa", "Keeta", "Cash Sales"])
    await expect(page.getByLabel(field)).toHaveAttribute("readonly", "");
  await expect(page.getByText("Total Electronic Payment Sales")).toBeVisible();
  await expect(page.getByText("HKD 234.50", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /Save/ })).toHaveCount(0);
  await expectNoHorizontalScroll(page);
  expect(writes).toEqual([]);
});

test("Expenses: the lines with no bin and no Add; a line opens its details", async ({ page }) => {
  const writes = await stub(page);
  await enter(page, view("expense"));
  await expect(page.getByRole("heading", { name: "Expenses", exact: true })).toBeVisible();
  await expect(page.getByText("Food & Drink")).toBeVisible();
  await expect(page.getByText("HKD 128.50", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /Add New Expense/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Delete/ })).toHaveCount(0);

  await page.getByText("Food & Drink").click();
  const dialog = page.getByRole("dialog", { name: "Expense Details" });
  await expect(dialog).toContainText("Team lunch");
  await dialog.getByRole("button", { name: "Close" }).click();
  await expect(dialog).toHaveCount(0);
  await expectNoHorizontalScroll(page);
  expect(writes).toEqual([]);
});

test("Bank Deposit: the cash on hand before it, and the deposit, locked", async ({ page }) => {
  const writes = await stub(page);
  await enter(page, view("deposit"));
  await expect(page.getByRole("heading", { name: "Deposit to Bank" })).toBeVisible();
  await expect(page.getByText("HKD 1,521.50", { exact: true })).toBeVisible();
  const deposit = page.getByLabel("Deposit Amount");
  await expect(deposit).toHaveValue("300.00");
  await expect(deposit).toHaveAttribute("readonly", "");
  await expectNoHorizontalScroll(page);
  expect(writes).toEqual([]);
});

test("Cash Count: the counts, the safebox, the shortage and its reason, all locked", async ({
  page,
}) => {
  const writes = await stub(page);
  await enter(page, view("cash-count"));
  await expect(page.getByRole("heading", { name: "Cash Count", exact: true })).toBeVisible();
  await expect(page.getByText("HKD 1,221.50", { exact: true })).toBeVisible(); // expected
  await expect(page.locator("#actualCashBalance")).toHaveValue("HKD 1,050.50");
  await expect(page.locator("#safeBoxBalance")).toHaveValue("HKD 160.00");
  await expect(page.getByText("HKD 1,210.50", { exact: true })).toBeVisible(); // total
  await expect(page.getByText("Cash Shortage: HKD 11.00")).toBeVisible();
  const reason = page.getByLabel("Description");
  await expect(reason).toHaveValue("Paid a courier");
  await expect(reason).toHaveAttribute("readonly", "");

  await page.getByRole("button", { name: "Calculator" }).click();
  const counts = page.getByRole("dialog", { name: "Cash Count" });
  await expect(counts.getByLabel("HKD 1000")).toHaveValue("1");
  await expect(counts.getByLabel("HKD 1000")).toHaveAttribute("readonly", "");
  await expect(counts.getByLabel("HKD 10c")).toHaveValue("");
  await expect(counts.getByText("HKD 1,050.50", { exact: true })).toBeVisible();
  await expect(counts.getByRole("button", { name: "Save" })).toHaveCount(0);
  await expectNoHorizontalScroll(page);
  await page.keyboard.press("Escape");
  await expect(counts).toHaveCount(0);
  expect(writes).toEqual([]);
});

test("moving between steps, then Close, closes the report - not the step before, nor Ending", async ({
  page,
}) => {
  await stub(page);
  await enter(page, SUMMARY);
  await steps(page).getByRole("link", { name: "Sales, done" }).click();
  await expect(page).toHaveURL(view("sale"));
  await steps(page).getByRole("link", { name: "Cash Count, done" }).click();
  await expect(page).toHaveURL(view("cash-count"));
  await page.getByRole("button", { name: "Close" }).click();
  // nothing before the report in this app (it was opened by its address): report history
  await expect(page).toHaveURL(`${BASE}/reports`);
});

test("Close closes the report: back to the report list it was opened from, dates kept", async ({
  page,
}) => {
  await stub(page);
  const listed = `${BASE}/reports?start_date=2026-10-01&end_date=2026-10-13`;
  await page.route(/\/api\/petty-cash\/v1\/companies\/[^/]+\/reports(\?.*)?$/, (route) =>
    route.fulfill({
      json: {
        reports: [
          {
            id: REPORT,
            transaction_date: DAY,
            status: "submitted",
            status_label: "Submitted",
            status_tone: "info",
            current_section: null,
            total_sales: 1,
            total_expenses: 1,
            submitted_by: "Tess",
            published_by: null,
            submitted_at: "2026-10-13T12:05:00+00:00",
            published_at: null,
            created_at: "2026-10-13T01:30:00+00:00",
            was_published: false,
            publish_reasons: [],
            permissions: { edit: false, delete: false },
          },
        ],
        page: 1,
        per_page: 10,
        total_pages: 1,
        total_count: 1,
        latest_report_id: null,
        currency_code: "HKD",
        can_publish: true,
      },
    }),
  );
  await enter(page, listed);
  await page.getByRole("link", { name: "View the 13 OCT 2026 report" }).click();
  await steps(page).getByRole("link", { name: "Expenses, done" }).click();
  await expect(page).toHaveURL(view("expense"));
  await page.getByRole("button", { name: "Close" }).click();
  await expect(page).toHaveURL((url) => url.pathname + url.search === listed);
});

test("opened with nothing before it, Back lands on the summary", async ({ page }) => {
  await stub(page);
  await enter(page, view("deposit"));
  await expect(page.getByRole("heading", { name: "Deposit to Bank" })).toBeVisible();
  await page.getByRole("link", { name: "Back" }).click();
  await expect(page).toHaveURL(SUMMARY);
});

test("a draft has no submitted view: it opens that step of the wizard", async ({ page }) => {
  await stub(page, reportAnswer({ status: "draft" }));
  await enter(page, view("deposit"));
  await expect(page).toHaveURL(`${BASE}/reports/new/deposit?transaction_date=${DAY}`);
});

test("an address that is no step is the 404", async ({ page }) => {
  await stub(page);
  await enter(page, SUMMARY); // signed in, so the address reaches the route
  await expect(page.getByRole("heading", { name: "Summary", exact: true })).toBeVisible();
  const answer = await page.goto(view("nope")); // `ending` is an old Flask address: the summary
  expect(answer?.status()).toBe(404);
});
