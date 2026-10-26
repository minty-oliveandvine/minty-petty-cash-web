// The Daily Closing's Sales stage (components/closing/Sales.tsx, Part 15.9 / 15.15), against a
// STUBBED Petty Cash API. Needs only `npm run dev`. Addition to Drawer and Expenses are this app's
// own stages (stubbed quietly); Flask's pages (Close onwards, by the company's full id) are
// caught, so nothing leaves the app. Refusals and warnings are inline alerts or Page banners, never toasts.

import { expect, test, type Page, type Route } from "@playwright/test";

import { companyRef } from "@minty/shared/e2e";
import { expectNoHorizontalScroll, mintModuleToken } from "./helpers";

// Amounts read "HKD 760.00" - owner 2026-10-21: one money rule (@minty/shared/money); they were "HKD760.00".

const ENTITY = "3d65f186-5ba1-4bf7-a1b0-cc64a113eb5c";
const NAME = "E2E Petty Cash Shop";
const BASE = `/entity/${companyRef(ENTITY, NAME)}/petty-cash`;
const DAY = "2026-10-13";
const STAGE_URL = `${BASE}/reports/new/sale?transaction_date=${DAY}`;
const DRAWER_URL = `${BASE}/reports/new/opening?transaction_date=${DAY}`;

type Json = Record<string, unknown>;

const DRAFT = {
  id: "d",
  status: "draft",
  current_section: "sales",
  completed_sections: ["opening"],
  xero_integrated: false,
  publishing_status: "unpublished",
};

const method = (value_name: string, name: string, type: string, amount: number | null = null) => ({
  sale_id: value_name,
  name,
  value_name,
  type,
  amount,
});

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

const SAVED = {
  draft_id: "d",
  transaction_date: DAY,
  current_section: "expenses",
  completed_sections: ["opening", "sales"],
  next: "expenses",
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

/** Every PUT the stage sent. */
type Saves = Json[];

type Setup = { onSave?: (body: Json, route: Route) => Promise<void>; home?: Json; next?: string };

async function stub(page: Page, answer: Json, { onSave, home }: Setup = {}): Promise<Saves> {
  const saves: Saves = [];
  await page.route("**/api/petty-cash/v1/companies/*/reports/sales**", async (route) => {
    if (route.request().method() === "PUT") {
      const body = route.request().postDataJSON() as Json;
      saves.push(body);
      if (onSave) await onSave(body, route);
      else await route.fulfill({ json: SAVED });
      return;
    }
    await route.fulfill({ json: answer });
  });
  await page.route("**/api/petty-cash/v1/companies/*/reports/opening**", async (route) => {
    if (route.request().method() === "PUT") {
      await route.fulfill({
        json: {
          draft_id: "d",
          transaction_date: DAY,
          current_section: "sales",
          completed_sections: ["opening"],
          next: "sales",
        },
      });
      return;
    }
    await route.fulfill({ json: OPENING });
  });
  await page.route("**/api/petty-cash/v1/companies/*/reports/expenses**", (route) =>
    route.fulfill({
      json: {
        transaction_date: DAY,
        currency_code: "HKD",
        draft: DRAFT,
        lines: [],
        total: 0,
        suppliers: [],
        accounts: [],
        permissions: { create_supplier: false },
      },
    }),
  );
  await page.route("**/api/petty-cash/v1/companies/*/home", (route) =>
    route.fulfill({ json: home ?? homeAnswer() }),
  );
  await page.route("**/api/me/profile**", (route) =>
    route.fulfill({ json: { user: { name: "Tess Tester", initials: "TT" } } }),
  );
  // Flask's pages (the Cash Count stage onwards, by the company's full id): caught.
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

async function openWith(page: Page, answer: Json, setup: Setup = {}): Promise<Saves> {
  const saves = await stub(page, answer, setup);
  await arrive(page, STAGE_URL);
  await expect(page.getByRole("heading", { level: 1, name: "Sales" })).toBeVisible();
  await expect(page.getByRole("status", { name: "Loading" })).toHaveCount(0);
  return saves;
}

const amount = (page: Page, name: string) =>
  page.getByRole("textbox", { name: `${name} in HKD`, exact: true });
const stages = (page: Page) => page.getByRole("list", { name: "Daily Closing stages" });
const row = (page: Page, label: string) => page.locator("dl").filter({ hasText: label });

test("the methods in Settings order with the catalogue's names, grouped, with the Workflow header", async ({
  page,
}) => {
  await openWith(page, salesAnswer());
  await expect(page.getByText("Daily Closing · Tue 13 Oct 2026")).toBeVisible();
  await expect(page.getByText("Draft", { exact: true })).toHaveAttribute("data-tone", "neutral");
  await expect(page.getByRole("link", { name: "Petty Cash", exact: true })).toHaveAttribute(
    "href",
    BASE,
  );
  await expect(
    page.getByText("Add the day's sales for each way your customers paid."),
  ).toBeVisible();

  await expect(stages(page).getByRole("listitem")).toHaveText([
    /Drawer/,
    /Sales/,
    /Expenses/,
    /Cash Count/,
    /Close/,
  ]);
  await expect(stages(page).locator('[aria-current="step"]')).toContainText("Sales, current step");
  // the done Drawer stage is this app's own page; nothing after Sales opens from here
  await expect(stages(page).getByRole("link", { name: "Drawer, done" })).toHaveAttribute(
    "href",
    DRAWER_URL,
  );
  await expect(stages(page).getByRole("link")).toHaveCount(1);

  await expect(page.getByRole("heading", { level: 2 })).toHaveText([
    "Electronic payments",
    "Delivery",
    "Cash",
  ]);
  // names as the catalogue has them ("WeChat Pay", not Flask's "Wechat Pay"); Deliveroo is not listed
  const fields = page.getByRole("textbox");
  const names = ["Visa", "WeChat Pay", "Food Panda", "OpenRice", "Cash sales"];
  await expect(fields).toHaveCount(names.length);
  for (const [i, name] of names.entries()) {
    await expect(fields.nth(i)).toHaveAccessibleName(`${name} in HKD`);
    await expect(fields.nth(i)).toHaveAttribute("inputmode", "decimal");
    await expect(fields.nth(i)).toHaveValue("");
  }
  await expect(page.getByRole("group", { name: "Delivery" }).getByRole("textbox")).toHaveCount(2);
  await expect(row(page, "Electronic payments total")).toContainText("HKD 0.00");
  await expect(row(page, "Delivery total")).toContainText("HKD 0.00");
  await expect(row(page, "Total sales")).toContainText("HKD 0.00");
  // optional fields never warn
  await expect(page.getByRole("main").getByRole("alert")).toHaveCount(0);
  await expectNoHorizontalScroll(page);
});

test("a draft's amounts come back grouped - a zero as an empty field - with their totals", async ({
  page,
}) => {
  await openWith(
    page,
    salesAnswer({
      methods: [
        method("visa_sales", "Visa", "electronic", 1200.5),
        method("foodpanda_sales", "Food Panda", "delivery", 0),
      ],
      cash_sales: 300,
    }),
  );
  await expect(amount(page, "Visa")).toHaveValue("1,200.50");
  await expect(amount(page, "Food Panda")).toHaveValue("");
  await expect(amount(page, "Cash sales")).toHaveValue("300.00");
  await expect(row(page, "Electronic payments total")).toContainText("HKD 1,200.50");
  await expect(row(page, "Delivery total")).toContainText("HKD 0.00");
  await expect(row(page, "Total sales")).toContainText("HKD 1,500.50");
});

test("a company with no electronic or delivery methods has only Cash", async ({ page }) => {
  await openWith(page, salesAnswer({ methods: [] }));
  await expect(page.getByRole("heading", { level: 2 })).toHaveText(["Cash"]);
  await expect(page.getByRole("textbox")).toHaveCount(1);
  await expect(row(page, "Electronic payments total")).toHaveCount(0);
});

test("typing moves the subtotals and the total live, and Save & Next sends every method and opens Expenses", async ({
  page,
}) => {
  const saves = await openWith(page, salesAnswer());
  const visa = amount(page, "Visa");
  // owner 2026-10-21: one money rule (@minty/shared/money) - a stray key is refused, not stripped;
  // owner 2026-10-26: commas as it is typed (@minty/shared/amountInput)
  await visa.pressSequentially("1a200.555");
  await expect(visa).toHaveValue("1,200.55");
  await expect(row(page, "Electronic payments total")).toContainText("HKD 1,200.55");
  await visa.blur();
  await expect(visa).toHaveValue("1,200.55");
  await amount(page, "WeChat Pay").fill("10");
  await amount(page, "Food Panda").fill("33.25");
  await amount(page, "Cash sales").fill("500");
  await expect(row(page, "Electronic payments total")).toContainText("HKD 1,210.55");
  await expect(row(page, "Delivery total")).toContainText("HKD 33.25");
  await expect(row(page, "Total sales")).toContainText("HKD 1,743.80");

  await page.getByRole("button", { name: "Save & Next" }).click();

  // Expenses is this app's own stage since Wave 2c
  await expect(page).toHaveURL(
    new RegExp(`${BASE}/reports/new/expense\\?transaction_date=${DAY}$`),
  );
  await expect(page.getByRole("heading", { level: 1, name: "Expenses" })).toBeVisible();
  expect(saves).toEqual([
    {
      transaction_date: DAY,
      cash_sales: 500,
      amounts: { visa_sales: 1200.55, wechat_sales: 10, foodpanda_sales: 33.25, openrice_sales: 0 },
      action: "next",
    },
  ]);
});

test("Enter in an amount saves and moves on, as Save & Next", async ({ page }) => {
  const saves = await openWith(page, salesAnswer());
  await amount(page, "OpenRice").fill("7");
  await amount(page, "OpenRice").press("Enter");
  await expect(page).toHaveURL(/\/reports\/new\/expense\?/);
  expect(saves).toMatchObject([{ amounts: { openrice_sales: 7 }, action: "next" }]);
});

test("a long amount with its currency is never clipped, and the page never scrolls sideways", async ({
  page,
}) => {
  await openWith(page, salesAnswer());
  for (const name of ["Visa", "Food Panda", "Cash sales"]) {
    await amount(page, name).fill("12345678.90");
    await amount(page, name).blur();
    await expect(amount(page, name)).toHaveValue("12,345,678.90");
  }
  const clipped = await page
    .getByRole("textbox")
    .evaluateAll((inputs) =>
      (inputs as HTMLInputElement[])
        .filter((input) => input.scrollWidth > input.clientWidth)
        .map((input) => input.name),
    );
  expect(clipped).toEqual([]);
  await expect(row(page, "Total sales")).toContainText("HKD 37,037,036.70");
  await expectNoHorizontalScroll(page);
});

test("Save & Exit saves - empty fields as zero - and goes back to the launch page", async ({
  page,
}) => {
  const saves = await openWith(page, salesAnswer(), {
    onSave: async (_body, route) => {
      await route.fulfill({ json: { ...SAVED, current_section: "sales", next: "dashboard" } });
    },
  });
  await page.getByRole("button", { name: "Save & Exit" }).click();
  await expect(page).toHaveURL(new RegExp(`${BASE}$`));
  await expect(page.getByRole("heading", { level: 1, name: "Petty Cash" })).toBeVisible();
  expect(saves).toEqual([
    {
      transaction_date: DAY,
      cash_sales: 0,
      amounts: { visa_sales: 0, wechat_sales: 0, foodpanda_sales: 0, openrice_sales: 0 },
      action: "exit",
    },
  ]);
});

test("a day with no Daily Closing yet says so on arrival, with the way to Addition to Drawer", async ({
  page,
}) => {
  await openWith(page, salesAnswer({ draft: null }));

  const banner = page
    .getByRole("status")
    .filter({ hasText: "This day's Daily Closing hasn't started" });
  await expect(banner).toBeVisible();
  await expect(banner).toHaveAttribute("data-tone", "warning");
  // no form to type into, so nothing can be lost
  await expect(page.getByRole("textbox")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Save & Next" })).toHaveCount(0);
  await banner.getByRole("link", { name: "Go to Addition to Drawer" }).click();
  await expect(page).toHaveURL(
    new RegExp(`${BASE}/reports/new/opening\\?transaction_date=${DAY}$`),
  );
  await expect(page.getByRole("heading", { level: 1, name: "Addition to Drawer" })).toBeVisible();
});

test("a draft gone by the time of the save: Addition to Drawer says why in a Page banner, once", async ({
  page,
}) => {
  const why = "I don't see a draft yet - let's start with the opening entry.";
  await openWith(page, salesAnswer(), {
    onSave: async (_body, route) => {
      await route.fulfill({ status: 409, json: { error: why, to: "opening" } });
    },
  });
  await amount(page, "Visa").fill("5");
  await page.getByRole("button", { name: "Save & Next" }).click();

  await expect(page).toHaveURL(
    new RegExp(`${BASE}/reports/new/opening\\?transaction_date=${DAY}$`),
  );
  await expect(page.getByRole("heading", { level: 1, name: "Addition to Drawer" })).toBeVisible();
  const banner = page.getByRole("status").filter({ hasText: why });
  await expect(banner).toBeVisible();
  await expect(banner).toHaveAttribute("data-tone", "warning");
  await expect(page.locator("[data-toast-type]")).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("heading", { level: 1, name: "Addition to Drawer" })).toBeVisible();
  await expect(page.getByRole("status", { name: "Loading" })).toHaveCount(0);
  await expect(page.getByText(why)).toHaveCount(0);
});

test("any other refusal stays on the stage, inline, and the actions come back", async ({
  page,
}) => {
  const why =
    "One of those sales methods isn't switched on for this company. Reload the page to see its methods.";
  await openWith(page, salesAnswer(), {
    onSave: async (_body, route) => {
      await route.fulfill({ status: 422, json: { error: why } });
    },
  });
  await page.getByRole("button", { name: "Save & Next" }).click();
  await expect(page.getByRole("alert").filter({ hasText: why })).toHaveAttribute(
    "data-tone",
    "danger",
  );
  await expect(page).toHaveURL(/\/reports\/new\/sale\?/);
  await expect(page.getByRole("button", { name: "Save & Next" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Save & Exit" })).toBeEnabled();
});

test("unsaved changes hold the stage links and the way back, with an inline warning and a way to leave anyway", async ({
  page,
}) => {
  await openWith(page, salesAnswer());
  await amount(page, "Cash sales").fill("5");
  await stages(page).getByRole("link", { name: "Drawer, done" }).click();
  const warning = page
    .locator("[data-tone=warning]")
    .filter({ hasText: "Your changes to this stage are not saved yet." });
  await expect(warning).toBeVisible();
  await expect(page.locator("[data-toast-type]")).toHaveCount(0);
  await expect(page).toHaveURL(/\/reports\/new\/sale\?/);

  await page.getByRole("link", { name: "Petty Cash", exact: true }).click();
  await expect(page).toHaveURL(/\/reports\/new\/sale\?/);

  // the change put back: nothing to hold any more
  await amount(page, "Cash sales").fill("");
  await expect(warning).toHaveCount(0);
  await amount(page, "Cash sales").fill("5");
  await stages(page).getByRole("link", { name: "Drawer, done" }).click();
  await warning.getByRole("button", { name: "Leave without saving" }).click();
  await expect(page).toHaveURL(new RegExp(`${BASE}/reports/new/opening\\?`));
  await expect(page.getByRole("heading", { level: 1, name: "Addition to Drawer" })).toBeVisible();
});

test("Addition to Drawer's Save & Next opens this stage without leaving the app", async ({
  page,
}) => {
  await stub(page, salesAnswer());
  await arrive(page, DRAWER_URL);
  await expect(page.getByRole("heading", { level: 1, name: "Addition to Drawer" })).toBeVisible();
  await expect(page.getByRole("status", { name: "Loading" })).toHaveCount(0);
  // a marker on the window survives only a client-side navigation
  await page.evaluate(() => Object.assign(window, { __stayed: true }));
  await page.getByRole("button", { name: "Save & Next" }).click();
  await expect(page).toHaveURL(STAGE_URL);
  await expect(page.getByRole("heading", { level: 1, name: "Sales" })).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { __stayed?: boolean }).__stayed)).toBe(
    true,
  );
});

test("the launch page's Continue opens this stage when the report is on Sales", async ({
  page,
}) => {
  await stub(page, salesAnswer(), {
    home: homeAnswer({
      draft: {
        id: "d",
        current_section: "sales",
        completed_sections: ["opening"],
        last_edit_seconds: 60,
      },
      draft_date: DAY,
    }),
  });
  await arrive(page, BASE);
  const card = page.getByRole("region", { name: /Daily Closing/ });
  await expect(card).toContainText("Next: Sales");
  await expect(
    card
      .getByRole("list", { name: "Daily Closing stages" })
      .getByRole("link", { name: /Sales, current step/ }),
  ).toHaveAttribute("href", STAGE_URL);
  await card.getByRole("button", { name: "Continue Daily Closing" }).click();
  await expect(page).toHaveURL(STAGE_URL);
  await expect(page.getByRole("heading", { level: 1, name: "Sales" })).toBeVisible();
});

test("the stage reloads with no console error", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(e.message));
  await openWith(page, salesAnswer({ methods: [method("visa_sales", "Visa", "electronic", 30)] }));
  // Arriving through /landing renders in the browser only; a reload is a full server render that
  // the browser then hydrates - where a mismatch shows.
  await page.reload();
  await expect(page.getByRole("heading", { level: 1, name: "Sales" })).toBeVisible();
  await expect(amount(page, "Visa")).toHaveValue("30.00");
  expect(errors).toEqual([]);
});
