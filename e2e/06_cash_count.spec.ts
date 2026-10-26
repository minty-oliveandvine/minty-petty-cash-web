// The Daily Closing's Cash Count stage (components/closing/CashCount.tsx, Part 15.9 / 15.15d), with
// Bank Deposit folded in as its first task (D15-05) - Flask's Daily Closing Phase 1 (Minty 4e004d2):
// three tasks one at a time, the count in its own sheet - against a STUBBED Petty Cash API. Needs
// only `npm run dev`. Addition to Drawer, Expenses and Close are this app's own stages (stubbed
// quietly); Flask's pages (by the company's full id) are caught, so nothing leaves the app.
// Refusals and warnings are inline alerts or Page banners, never toasts.

import { expect, test, type Page, type Route } from "@playwright/test";

import { companyRef } from "@minty/shared/e2e";
import { expectNoHorizontalScroll, mintModuleToken } from "./helpers";

// Amounts read "HKD 760.00" - owner 2026-10-21: one money rule (@minty/shared/money); they were "HKD760.00".

const ENTITY = "3d65f186-5ba1-4bf7-a1b0-cc64a113eb5c";
const NAME = "E2E Petty Cash Shop";
const BASE = `/entity/${companyRef(ENTITY, NAME)}/petty-cash`;
const DAY = "2026-10-13";
const STAGE_URL = `${BASE}/reports/new/cash-count?transaction_date=${DAY}`;
const EXPENSES_URL = `${BASE}/reports/new/expense?transaction_date=${DAY}`;
const ENDING = new RegExp(`${BASE}/reports/new/ending\\?transaction_date=${DAY}$`);

type Json = Record<string, unknown>;

const DRAFT = {
  id: "d",
  status: "draft",
  current_section: "deposit",
  completed_sections: ["opening", "sales", "expenses"],
  xero_integrated: false,
  publishing_status: "unpublished",
};

const DENOMINATIONS = [
  { id: "n500", value: 500, kind: "note", name: "$500", count: 0 },
  { id: "n100", value: 100, kind: "note", name: "$100", count: 0 },
  { id: "c5", value: 5, kind: "coin", name: "$5", count: 0 },
  { id: "c050", value: 0.5, kind: "coin", name: null, count: 0 }, // no cash_name: named by its value
];

/** Opening 500 + added 100 + cash sales 820.50 - expenses 120 = 1,300.50 on hand. */
function cashAnswer(over: Json = {}): Json {
  return {
    transaction_date: DAY,
    currency_code: "HKD",
    draft: DRAFT,
    opening_balance: 500,
    cash_addition: 100,
    cash_sales: 820.5,
    expenses: 120,
    bank_deposit: 0,
    cash_on_hand: 1300.5,
    expected_cash: 1300.5,
    denominations: DENOMINATIONS,
    safe_box_balance: 0,
    discrepancy: { amount: 0, kind: "none", reason: "" },
    ...over,
  };
}

const SAVED = {
  draft_id: "d",
  transaction_date: DAY,
  current_section: "ending",
  completed_sections: ["opening", "sales", "expenses", "deposit", "cash_count"],
  next: "ending",
  discrepancy: { amount: 0, kind: "none" },
};

const SAVED_DRAFT = {
  ...DRAFT,
  current_section: "ending",
  completed_sections: SAVED.completed_sections,
};
const OPENING = {
  transaction_date: DAY,
  currency_code: "HKD",
  draft: DRAFT,
  starting_cash_balance: 500,
  yesterday_closing_balance: 500,
  safebox_balance: 0,
  cash_addition: null,
  withdrawal: "personal",
};
const EXPENSES = {
  transaction_date: DAY,
  currency_code: "HKD",
  draft: { ...DRAFT, current_section: "expenses", completed_sections: ["opening", "sales"] },
  lines: [],
  total: 0,
  suppliers: [],
  accounts: [],
  permissions: { create_supplier: false },
};

function homeAnswer(over: Json = {}): Json {
  return {
    server_today: "2026-10-14",
    user_count: 1,
    currency_code: "HKD",
    latest: {
      date: "2026-10-12",
      closing_balance: 500,
      deposit: 0,
      deposit_bank_name: "No deposit",
      deposit_bank_number: "",
      deposit_correction_missing_settings: [],
      can_correct_deposit: true,
      submitter_first_name: "Olive",
    },
    draft: null,
    draft_date: null,
    published: {
      "2026-10-12": {
        id: "r",
        closing_balance: 500,
        bank_deposit: 0,
        xero_integrated: true,
        submitter_first_name: "Olive",
      },
    },
    today_has_report: false,
    today_is_latest_report: false,
    xero_settings: { complete: true, missing: [] },
    permissions: { read_only: false, correct_deposit: true },
    ...over,
  };
}

type Setup = {
  onSave?: (body: Json, route: Route) => Promise<void>;
  read?: (route: Route) => Promise<void>;
  home?: Json;
};

/** Every PUT the stage sent. */
async function stub(page: Page, answer: Json, { onSave, read, home }: Setup = {}): Promise<Json[]> {
  const saves: Json[] = [];
  await page.route("**/api/petty-cash/v1/companies/*/reports/cash-count**", async (route) => {
    if (route.request().method() === "PUT") {
      const body = route.request().postDataJSON() as Json;
      saves.push(body);
      if (onSave) await onSave(body, route);
      else await route.fulfill({ json: SAVED });
      return;
    }
    if (read) await read(route);
    else await route.fulfill({ json: answer });
  });
  await page.route("**/api/petty-cash/v1/companies/*/reports/opening**", (route) =>
    route.fulfill({ json: OPENING }),
  );
  await page.route("**/api/petty-cash/v1/companies/*/reports/expenses**", async (route) => {
    if (route.request().method() === "PUT") {
      await route.fulfill({
        json: {
          draft_id: "d",
          transaction_date: DAY,
          current_section: "deposit",
          completed_sections: ["opening", "sales", "expenses"],
          next: "deposit",
        },
      });
      return;
    }
    await route.fulfill({ json: EXPENSES });
  });
  // This app's own Close stage (e2e/07_close.spec.ts covers it): a quiet stub.
  await page.route("**/api/petty-cash/v1/companies/*/reports/close**", (route) =>
    route.fulfill({
      json: {
        transaction_date: DAY,
        currency_code: "HKD",
        draft: SAVED_DRAFT,
        opening_balance: 500,
        cash_addition: 100,
        sales: { methods: [], cash: 820.5, total: 820.5, yesterday_total: null, history: [] },
        expenses: { lines: [], total: 120 },
        cash: {
          bank_deposit: 0,
          expected: 1300.5,
          counted: 1300.5,
          safe_box: 0,
          difference: { amount: 0, kind: "none", reason: "" },
        },
        closing_balance: 1300.5,
        problem: null,
      },
    }),
  );
  await page.route("**/api/petty-cash/v1/companies/*/home", (route) =>
    route.fulfill({ json: home ?? homeAnswer() }),
  );
  await page.route("**/api/me/profile**", (route) =>
    route.fulfill({ json: { user: { name: "Tess Tester", initials: "TT" } } }),
  );
  // Flask's pages (Close onwards, by the company's full id): caught.
  await page.route(/\/entity\/[0-9a-f-]{36}\/petty-cash\/reports(?:[/?]|$)/, (route) =>
    route.fulfill({ contentType: "text/html", body: "<title>Flask page</title><p>Flask page</p>" }),
  );
  return saves;
}

async function arrive(page: Page, next: string) {
  const token = mintModuleToken({
    secret: "stub",
    userId: "u",
    entityId: ENTITY,
    entityName: NAME,
  });
  await page.goto(
    `/landing?${new URLSearchParams({ token, entity_id: ENTITY, entity_name: NAME, next })}`,
  );
}

async function openWith(page: Page, answer: Json, setup: Setup = {}): Promise<Json[]> {
  const saves = await stub(page, answer, setup);
  await arrive(page, STAGE_URL);
  await expect(page.getByRole("heading", { level: 1, name: "Cash Count" })).toBeVisible();
  await expect(page.getByRole("status", { name: "Loading" })).toHaveCount(0);
  return saves;
}

const deposit = (page: Page) =>
  page.getByRole("textbox", { name: "Deposit amount in HKD", exact: true });
const safebox = (page: Page) =>
  page.getByRole("textbox", { name: "Cash in the safe box in HKD", exact: true });
const reason = (page: Page) => page.getByRole("textbox", { name: /Reason for the difference/ });
const sheet = (page: Page) => page.getByRole("dialog", { name: /Count the drawer/ });
const count = (page: Page, label: string) =>
  sheet(page).getByRole("textbox", { name: `Number of ${label}`, exact: true });
const stages = (page: Page) => page.getByRole("list", { name: "Daily Closing stages" });
const task = (page: Page, name: string) => page.getByRole("region", { name, exact: true });
const saveNext = (page: Page) => page.getByRole("button", { name: "Save & Next" });

/** Daily Closing Phase 1: the deposit task done (Continue), then the count sheet open. */
async function openSheet(page: Page) {
  if ((await task(page, "Cash taken to the bank").getAttribute("data-state")) === "current") {
    await page.getByRole("button", { name: "Continue" }).click();
  }
  await page.getByRole("button", { name: "Count notes and coins" }).click();
  await expect(sheet(page)).toBeVisible();
}

/** Types the counts into the open sheet, then Save count. */
async function countAndSave(page: Page, counts: Record<string, string>) {
  for (const [label, n] of Object.entries(counts)) await count(page, label).fill(n);
  await sheet(page).getByRole("button", { name: "Save count" }).click();
  await expect(sheet(page)).toHaveCount(0);
}

test("three tasks, one at a time, in the Workflow header - the deposit open, the count and the safe box waiting", async ({
  page,
}) => {
  await openWith(page, cashAnswer());
  await expect(page.getByText("Daily Closing · Tue 13 Oct 2026")).toBeVisible();
  await expect(page.getByText("Draft", { exact: true })).toHaveAttribute("data-tone", "neutral");
  await expect(stages(page).locator('[aria-current="step"]')).toContainText(
    "Cash Count, current step",
  );
  // the done stages are this app's own pages; Close does not open from here
  await expect(stages(page).getByRole("link", { name: "Expenses, done" })).toHaveAttribute(
    "href",
    EXPENSES_URL,
  );
  await expect(stages(page).getByRole("link")).toHaveCount(3);
  await expect(page.getByText("Three quick checks. We'll go one at a time.")).toBeVisible();

  await expect(page.getByRole("heading", { level: 2 })).toHaveText([
    "Cash taken to the bank",
    "Count the drawer",
    "Safe box",
  ]);
  await expect(task(page, "Cash taken to the bank")).toHaveAttribute("aria-current", "step");
  await expect(task(page, "Count the drawer")).toHaveAttribute("data-state", "next");
  await expect(task(page, "Count the drawer")).toContainText("Next, after the bank deposit.");
  await expect(task(page, "Safe box")).toContainText("Next, after the count.");
  await expect(task(page, "Cash taken to the bank")).toContainText(
    "In the drawer before any deposit",
  );
  await expect(task(page, "Cash taken to the bank")).toContainText("HKD 1,300.50");
  await expect(deposit(page)).toHaveAttribute("inputmode", "decimal");
  await expect(page.getByText("Leave it empty when no cash went to the bank.")).toBeVisible();
  // no count yet: no Check, the expected amount out of sight, and Save & Next waits for the count
  await expect(page.getByRole("region", { name: "Check" })).toHaveCount(0);
  await expect(saveNext(page)).toBeDisabled();
  await expect(page.getByText("Count the drawer to continue")).toBeVisible();
  await expect(page.getByRole("main").getByRole("alert")).toHaveCount(0);
  await expectNoHorizontalScroll(page);
});

test("the deposit: above the cash in the drawer says the limit at once and stays open; Continue and Change move it", async ({
  page,
}) => {
  await openWith(page, cashAnswer());
  await deposit(page).fill("1300.51");
  const why = "The deposit can't be more than the cash on hand. Enter HKD 1,300.50 or less.";
  await expect(page.getByRole("alert").filter({ hasText: why })).toBeVisible();
  await expect(deposit(page)).toHaveAttribute("aria-invalid", "true");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(task(page, "Cash taken to the bank")).toHaveAttribute("data-state", "current");

  await deposit(page).fill("300");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(task(page, "Cash taken to the bank")).toHaveAttribute("data-state", "done");
  await expect(task(page, "Cash taken to the bank")).toContainText("HKD 300.00 to the bank");
  await expect(page.getByRole("button", { name: "Count notes and coins" })).toBeFocused();

  await page.getByRole("button", { name: "Change the cash taken to the bank" }).click();
  await expect(deposit(page)).toBeFocused();
  await deposit(page).fill("");
  await deposit(page).blur();
  await expect(task(page, "Cash taken to the bank")).toContainText("None today");
});

test("the count sheet: notes then coins, a 0.50 coin included, line totals and a live total; Save count, then the safe box and the Check", async ({
  page,
}) => {
  await openWith(page, cashAnswer());
  await openSheet(page);
  await expect(sheet(page).getByRole("group", { name: "Notes" }).getByRole("textbox")).toHaveCount(
    2,
  );
  await expect(sheet(page).getByRole("group", { name: "Coins" }).getByRole("textbox")).toHaveCount(
    2,
  );
  for (const label of ["HKD 500 notes", "HKD 100 notes", "HKD 5 coins", "HKD 0.50 coins"]) {
    await expect(count(page, label)).toHaveAttribute("inputmode", "numeric");
    await expect(count(page, label)).toHaveValue("");
  }
  await expect(count(page, "HKD 500 notes")).toBeFocused();
  await count(page, "HKD 500 notes").fill("2");
  await count(page, "HKD 100 notes").fill("3");
  // a stray key is refused as it is typed (@minty/shared/amountInput's count)
  await count(page, "HKD 0.50 coins").pressSequentially("1a.");
  await expect(count(page, "HKD 0.50 coins")).toHaveValue("1");
  await expect(sheet(page)).toContainText("Total in the drawer");
  await expect(sheet(page)).toContainText("HKD 1,300.50");
  // Enter in a row is Save count, never the page's Save & Next
  await count(page, "HKD 0.50 coins").press("Enter");
  await expect(sheet(page)).toHaveCount(0);
  await expect(task(page, "Count the drawer")).toHaveAttribute("data-state", "done");
  await expect(task(page, "Count the drawer")).toContainText("Counted in the drawer");
  await expect(safebox(page)).toBeFocused();
  const check = page.getByRole("region", { name: "Check" });
  await expect(check).toContainText("The numbers match");
  await expect(check).toContainText("Counted HKD 1,300.50 · expected HKD 1,300.50");
  await expect(reason(page)).toHaveCount(0);
  await expect(saveNext(page)).toBeEnabled();
});

test("the difference to the cent: over through the safe box, short without a coin - in words, Warning, never a red number", async ({
  page,
}) => {
  await openWith(page, cashAnswer());
  await openSheet(page);
  await countAndSave(page, { "HKD 500 notes": "2", "HKD 100 notes": "3", "HKD 0.50 coins": "1" });
  const check = page.getByRole("region", { name: "Check" });
  await safebox(page).fill("0.01");
  await expect(
    check.getByRole("status").filter({ hasText: "The count is HKD 0.01 over." }),
  ).toHaveAttribute("data-tone", "warning");
  await expect(check).not.toContainText("The numbers match");
  await safebox(page).fill("");
  await safebox(page).blur();
  await expect(task(page, "Safe box")).toHaveAttribute("data-state", "done");
  await page.getByRole("button", { name: "Edit the count" }).click();
  await countAndSave(page, { "HKD 0.50 coins": "" });
  await expect(check).toContainText("The count is HKD 0.50 short.");
  await expect(reason(page)).toHaveAttribute("aria-required", "true");
  await expect(reason(page)).not.toHaveAttribute("aria-invalid", "true");
});

test("a difference holds Save & Next until it has a reason; the PUT carries the deposit and every count", async ({
  page,
}) => {
  const saves = await openWith(page, cashAnswer());
  await deposit(page).fill("300");
  await openSheet(page);
  await countAndSave(page, { "HKD 500 notes": "2" });
  await safebox(page).blur();
  await expect(page.getByRole("region", { name: "Check" })).toContainText(
    "The count is HKD 0.50 short.",
  );
  await expect(saveNext(page)).toBeDisabled();
  await expect(page.getByText("Add a reason for the difference to continue.")).toBeVisible();
  expect(saves).toEqual([]);

  await reason(page).fill("Change given twice");
  await expect(
    page.getByText("So the reviewer knows what happened. 18 of 300 characters."),
  ).toBeVisible();
  await expect(saveNext(page)).toBeEnabled();
  await saveNext(page).click();

  // Close, this app's own stage since Wave 2e
  await expect(page).toHaveURL(ENDING);
  await expect(page.getByRole("heading", { level: 1, name: "Close" })).toBeVisible();
  expect(saves).toEqual([
    {
      transaction_date: DAY,
      bank_deposit: 300,
      counts: { n500: 2, n100: 0, c5: 0, c050: 0 },
      safe_box_balance: 0,
      discrepancy_reason: "Change given twice",
      action: "next",
    },
  ]);
});

test("a saved stage opens with every task done; Save & Exit keeps a difference without a reason", async ({
  page,
}) => {
  const saves = await openWith(
    page,
    cashAnswer({
      bank_deposit: 300,
      denominations: DENOMINATIONS.map((d) => (d.id === "n500" ? { ...d, count: 2 } : d)),
    }),
    {
      onSave: async (_body, route) => {
        await route.fulfill({
          json: {
            ...SAVED,
            current_section: "cash_count",
            next: "dashboard",
            discrepancy: { amount: -0.5, kind: "short" },
          },
        });
      },
    },
  );
  await expect(page.getByText("All three checks are done.")).toBeVisible();
  for (const name of ["Cash taken to the bank", "Count the drawer", "Safe box"])
    await expect(task(page, name)).toHaveAttribute("data-state", "done");
  await expect(task(page, "Cash taken to the bank")).toContainText("HKD 300.00 to the bank");
  await expect(page.getByRole("region", { name: "Check" })).toContainText(
    "The count is HKD 0.50 short.",
  );
  // Edit reopens the sheet with the saved count
  await page.getByRole("button", { name: "Edit the count" }).click();
  await expect(count(page, "HKD 500 notes")).toHaveValue("2");
  await page.keyboard.press("Escape");
  await expect(sheet(page)).toHaveCount(0);
  await page.getByRole("button", { name: "Save & Exit" }).click();
  await expect(page).toHaveURL(new RegExp(`${BASE}$`));
  await expect(page.getByRole("heading", { level: 1, name: "Petty Cash" })).toBeVisible();
  expect(saves).toEqual([
    {
      transaction_date: DAY,
      bank_deposit: 300,
      counts: { n500: 2, n100: 0, c5: 0, c050: 0 },
      safe_box_balance: 0,
      discrepancy_reason: "",
      action: "exit",
    },
  ]);
});

test("Save & Exit saves before the count is done", async ({ page }) => {
  const saves = await openWith(page, cashAnswer(), {
    onSave: (_body, route) =>
      route.fulfill({ json: { ...SAVED, current_section: "deposit", next: "dashboard" } }),
  });
  await expect(saveNext(page)).toBeDisabled();
  await page.getByRole("button", { name: "Save & Exit" }).click();
  await expect(page).toHaveURL(new RegExp(`${BASE}$`));
  expect(saves).toMatchObject([
    { bank_deposit: 0, counts: { n500: 0, n100: 0, c5: 0, c050: 0 }, action: "exit" },
  ]);
});

test("a count is grouped as it is typed and still totals (a grouped count once read as 1)", async ({
  page,
}) => {
  // owner 2026-10-26: commas as you type, counts too
  await openWith(page, cashAnswer());
  await openSheet(page);
  await count(page, "HKD 5 coins").pressSequentially("1500");
  await expect(count(page, "HKD 5 coins")).toHaveValue("1,500");
  await expect(sheet(page)).toContainText("HKD 7,500.00");
  await count(page, "HKD 5 coins").fill("1000001");
  await expect(count(page, "HKD 5 coins")).toHaveValue("1,000,001");
});

test("at a phone's width a large total stays on one line; the label wraps instead", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "phone", "a phone-width layout check");
  await openWith(page, cashAnswer({ cash_on_hand: 12345678.9, expected_cash: 12345678.9 }));
  const total = page.getByText("HKD 12,345,678.90", { exact: true });
  await expect(total).toBeVisible();
  const { height, lineHeight } = await total.evaluate((el) => ({
    height: el.getBoundingClientRect().height,
    lineHeight: parseFloat(getComputedStyle(el).lineHeight),
  }));
  expect(height).toBeLessThan(lineHeight * 1.5);
  await expectNoHorizontalScroll(page);
});

test("a count above a million says so as typed and keeps the sheet open; the API's 422 shows on the field it names", async ({
  page,
}) => {
  const why = "The deposit can't be more than the cash on hand. Enter HKD 1,200.00 or less.";
  await openWith(page, cashAnswer(), {
    onSave: async (body, route) => {
      if ((body.counts as Json).n100 === 9)
        await route.fulfill({
          status: 422,
          json: { error: "Enter each count as a whole number of 0 or more.", field: "n100" },
        });
      else await route.fulfill({ status: 422, json: { error: why, field: "bank_deposit" } });
    },
  });
  await openSheet(page);
  await count(page, "HKD 5 coins").fill("1000001");
  await expect(
    sheet(page)
      .getByRole("alert")
      .filter({ hasText: "The count is 1,000,001. Enter 1,000,000 or fewer." }),
  ).toBeVisible();
  await sheet(page).getByRole("button", { name: "Save count" }).click();
  await expect(sheet(page)).toBeVisible();
  await expect(count(page, "HKD 5 coins")).toBeFocused();
  await countAndSave(page, { "HKD 5 coins": "260" });

  await page.getByRole("button", { name: "Change the cash taken to the bank" }).click();
  await deposit(page).fill("1250");
  await page.getByRole("button", { name: "Save & Exit" }).click();
  await expect(page.getByRole("alert").filter({ hasText: why })).toBeVisible();
  await expect(deposit(page)).toHaveAttribute("aria-invalid", "true");
  await expect(deposit(page)).toBeFocused();
  await expect(page).toHaveURL(/\/reports\/new\/cash-count\?/);
  // changing the field clears the API's sentence
  await deposit(page).fill("1200");
  await expect(page.getByText(why)).toHaveCount(0);

  // a count the API refuses: the sheet opens on that row
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Edit the count" }).click();
  await countAndSave(page, { "HKD 100 notes": "9" });
  await page.getByRole("button", { name: "Save & Exit" }).click();
  await expect(sheet(page)).toBeVisible();
  await expect(count(page, "HKD 100 notes")).toHaveAttribute("aria-invalid", "true");
  await expect(count(page, "HKD 100 notes")).toBeFocused();
});

test("any other refusal stays on the stage, inline, and the actions come back", async ({
  page,
}) => {
  const why = "This report isn't a draft anymore, so its cash can't change here.";
  await openWith(page, cashAnswer(), {
    onSave: (_body, route) => route.fulfill({ status: 409, json: { error: why } }),
  });
  await page.getByRole("button", { name: "Save & Exit" }).click();
  await expect(page.getByRole("alert").filter({ hasText: why })).toHaveAttribute(
    "data-tone",
    "danger",
  );
  await expect(page.getByRole("button", { name: "Save & Exit" })).toBeEnabled();
  await expect(page.locator("[data-toast-type]")).toHaveCount(0);
});

test("cash on hand below zero is a gate: the rule, the reason and one way on, with nothing to type", async ({
  page,
}) => {
  await openWith(
    page,
    cashAnswer({ cash_sales: 0, expenses: 620, cash_on_hand: -20, expected_cash: -20 }),
  );
  const gate = page.getByRole("status").filter({ hasText: "The cash on hand is below zero" });
  await expect(gate).toHaveAttribute("data-tone", "warning");
  await expect(gate).toContainText(
    "Opening cash HKD 600.00 plus cash sales HKD 0.00, less expenses HKD 620.00, comes to -HKD 20.00",
  );
  await expect(page.getByRole("textbox")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Save & Next" })).toHaveCount(0);
  await gate.getByRole("link", { name: "Go to Expenses" }).click();
  await expect(page).toHaveURL(EXPENSES_URL);
  await expect(page.getByRole("heading", { level: 1, name: "Expenses" })).toBeVisible();
});

test("no draft for the day: the stage sends the person to Addition to Drawer, which says why, once", async ({
  page,
}) => {
  const why = "I don't see a draft yet - let's start with the opening entry.";
  await stub(page, cashAnswer(), {
    read: (route) => route.fulfill({ status: 409, json: { error: why, to: "opening" } }),
  });
  await arrive(page, STAGE_URL);
  await expect(page).toHaveURL(
    new RegExp(`${BASE}/reports/new/opening\\?transaction_date=${DAY}$`),
  );
  await expect(page.getByRole("heading", { level: 1, name: "Addition to Drawer" })).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: why })).toHaveAttribute(
    "data-tone",
    "warning",
  );
});

test("unsaved changes hold the stage links, with a way to leave anyway", async ({ page }) => {
  await openWith(page, cashAnswer());
  await deposit(page).fill("5");
  await stages(page).getByRole("link", { name: "Expenses, done" }).click();
  const warning = page
    .locator("[data-tone=warning]")
    .filter({ hasText: "Your changes to this stage are not saved yet." });
  await expect(warning).toBeVisible();
  await expect(page).toHaveURL(/\/reports\/new\/cash-count\?/);
  await warning.getByRole("button", { name: "Leave without saving" }).click();
  await expect(page).toHaveURL(EXPENSES_URL);
});

test("Expenses' Save & Next opens this stage without leaving the app", async ({ page }) => {
  await stub(page, cashAnswer());
  await arrive(page, EXPENSES_URL);
  await expect(page.getByRole("heading", { level: 1, name: "Expenses" })).toBeVisible();
  await expect(page.getByRole("status", { name: "Loading" })).toHaveCount(0);
  // a marker on the window survives only a client-side navigation
  await page.evaluate(() => Object.assign(window, { __stayed: true }));
  await page.getByRole("button", { name: "Save & Next" }).click();
  await expect(page).toHaveURL(STAGE_URL);
  await expect(page.getByRole("heading", { level: 1, name: "Cash Count" })).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { __stayed?: boolean }).__stayed)).toBe(
    true,
  );
});

for (const section of ["deposit", "cash_count"]) {
  test(`the launch page's Continue opens this stage when the report is on ${section}`, async ({
    page,
  }) => {
    const completed =
      section === "deposit"
        ? ["opening", "sales", "expenses"]
        : ["opening", "sales", "expenses", "deposit"];
    await stub(page, cashAnswer(), {
      home: homeAnswer({
        draft: {
          id: "d",
          current_section: section,
          completed_sections: completed,
          last_edit_seconds: 60,
        },
        draft_date: DAY,
      }),
    });
    await arrive(page, BASE);
    const card = page.getByRole("region", { name: /Daily Closing/ });
    await expect(card).toContainText("Next: Cash Count");
    await expect(
      card
        .getByRole("list", { name: "Daily Closing stages" })
        .getByRole("link", { name: /Cash Count, current step/ }),
    ).toHaveAttribute("href", STAGE_URL);
    await card.getByRole("button", { name: "Continue Daily Closing" }).click();
    await expect(page).toHaveURL(STAGE_URL);
    await expect(page.getByRole("heading", { level: 1, name: "Cash Count" })).toBeVisible();
  });
}

test("Flask's Bank Deposit address lands on this stage, for the same day", async ({ page }) => {
  await stub(page, cashAnswer());
  await arrive(page, `${BASE}/reports/new/deposit?transaction_date=${DAY}`);
  await expect(page).toHaveURL(STAGE_URL);
  await expect(page.getByRole("heading", { level: 1, name: "Cash Count" })).toBeVisible();
});

test("the largest counts and amounts are never clipped, in the sheet or on the page, and nothing scrolls sideways", async ({
  page,
}) => {
  await openWith(page, cashAnswer({ cash_on_hand: 99999999999.99, expected_cash: 99999999999.99 }));
  await deposit(page).fill("12345678901.99");
  await openSheet(page);
  await count(page, "HKD 500 notes").fill("1000000");
  await count(page, "HKD 0.50 coins").fill("999999");
  await expect(sheet(page)).toContainText("HKD 500,499,999.50");
  const clippedInSheet = await page.evaluate(() =>
    Array.from(
      document.querySelectorAll('[role="dialog"] input, [role="dialog"] span[translate=no]'),
    )
      .filter((el) => el.scrollWidth > el.clientWidth + 1)
      .map((el) => (el as HTMLElement).id || el.textContent),
  );
  expect(clippedInSheet).toEqual([]);
  await sheet(page).getByRole("button", { name: "Save count" }).click();
  await safebox(page).fill("99999999999.99");
  await safebox(page).blur();
  const clipped = await page.evaluate(() =>
    Array.from(document.querySelectorAll("main input, main dd, main span[translate=no]"))
      .filter((el) => el.scrollWidth > el.clientWidth + 1)
      .map((el) => (el as HTMLElement).id || el.textContent),
  );
  expect(clipped).toEqual([]);
  await expectNoHorizontalScroll(page);
});

test("the stage reloads with no console error", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(e.message));
  await openWith(page, cashAnswer({ bank_deposit: 300 }));
  // Arriving through /landing renders in the browser only; a reload is a full server render that
  // the browser then hydrates - where a mismatch shows.
  await page.reload();
  await expect(page.getByRole("heading", { level: 1, name: "Cash Count" })).toBeVisible();
  await expect(task(page, "Cash taken to the bank")).toContainText("HKD 300.00 to the bank");
  expect(errors).toEqual([]);
});
