// The Daily Closing's Expenses stage (components/closing/Expenses.tsx, Part 15.9 / 15.15c),
// against a STUBBED Petty Cash API. Needs only `npm run dev`. Addition to Drawer and Sales are this
// app's own stages (stubbed quietly); Flask's pages (Close onwards, by the company's full id)
// are caught, so nothing leaves the app - and nothing reaches Xero: `POST /suppliers` is stubbed.

import { expect, test, type Page, type Route } from "@playwright/test";

import { companyRef } from "./companyRef";
import { expectNoHorizontalScroll, mintModuleToken } from "./helpers";

const ENTITY = "3d65f186-5ba1-4bf7-a1b0-cc64a113eb5c";
const NAME = "E2E Petty Cash Shop";
const BASE = `/entity/${companyRef(ENTITY, NAME)}/petty-cash`;
const DAY = "2026-10-13";
const STAGE_URL = `${BASE}/reports/new/expense?transaction_date=${DAY}`;
const SALES_URL = `${BASE}/reports/new/sale?transaction_date=${DAY}`;
const DRAWER_URL = `${BASE}/reports/new/opening?transaction_date=${DAY}`;

type Json = Record<string, unknown>;

const DRAFT = { id: "d", status: "draft", current_section: "expenses", completed_sections: ["opening", "sales"], xero_integrated: false, publishing_status: "unpublished" };

// A 1x1 PNG: a receipt the viewer can draw.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");

const SUPPLIERS = [
  { id: "c1", name: "ParknShop" },
  { id: "c2", name: "Park Lane Florist" },
  { id: "c3", name: "Wellcome" },
];
const ACCOUNTS = [
  { id: "a1", code: "429", name: "General Expenses" },
  { id: "a2", code: "461", name: "Printing & Stationery" },
];

function line(id: string, amount: number, over: Json = {}): Json {
  return {
    id,
    item: "General Expenses",
    amount,
    remarks: "",
    supplier: { id: "c1", name: "ParknShop" },
    account: { id: "a1", code: "429", name: "General Expenses" },
    receipts: [{ id: `r-${id}`, name: `receipt-${id}.png`, mime_type: "image/png" }],
    ...over,
  };
}

function expensesAnswer(over: Json = {}): Json {
  return {
    transaction_date: DAY,
    currency_code: "HKD",
    draft: DRAFT,
    lines: [
      line("l1", 120.5, { remarks: "Printer paper and toner for the front desk" }),
      line("l2", 38, { item: "Printing & Stationery", supplier: { id: "c3", name: "Wellcome" }, account: { id: "a2", code: "461", name: "Printing & Stationery" }, receipts: [{ id: "r-l2", name: "scan.pdf", mime_type: "application/pdf" }] }),
    ],
    total: 158.5,
    suppliers: SUPPLIERS,
    accounts: ACCOUNTS,
    permissions: { create_supplier: true },
    ...over,
  };
}

const OPENING = { transaction_date: DAY, currency_code: "HKD", draft: DRAFT, starting_cash_balance: 500, yesterday_closing_balance: 500, safebox_balance: 0, cash_addition: null, withdrawal: "personal" };
const SALES = { transaction_date: DAY, currency_code: "HKD", draft: DRAFT, methods: [], cash_sales: 100 };

function homeAnswer(over: Json = {}): Json {
  return {
    server_today: "2026-10-14",
    user_count: 1,
    currency_code: "HKD",
    latest: { date: "2026-10-12", closing_balance: 500, deposit: 0, deposit_bank_name: "No deposit", deposit_bank_number: "", deposit_correction_missing_settings: [], can_correct_deposit: true, submitter_first_name: "Olive" },
    draft: null,
    draft_date: null,
    published: { "2026-10-12": { id: "r", closing_balance: 500, bank_deposit: 0, xero_integrated: true, submitter_first_name: "Olive" } },
    today_has_report: false,
    today_is_latest_report: false,
    xero_settings: { complete: true, missing: [] },
    permissions: { read_only: false, correct_deposit: true },
    ...over,
  };
}

/** A multipart body's text fields, and the file's name and type. */
function multipart(route: Route): Json {
  const raw = route.request().postDataBuffer()?.toString("latin1") ?? "";
  const fields: Json = {};
  for (const m of raw.matchAll(/name="([^"]+)"(?:; filename="([^"]*)"\r\nContent-Type: ([^\r]+))?\r\n\r\n([\s\S]*?)\r\n--/g)) {
    fields[m[1]] = m[2] !== undefined ? { filename: m[2], type: m[3] } : m[4];
  }
  return fields;
}

type Calls = { adds: Json[]; deletes: string[]; saves: Json[]; suppliers: Json[]; receipts: string[] };
type Handler = (route: Route, calls: Calls) => Promise<void>;
type Setup = { onAdd?: Handler; onDelete?: Handler; onSave?: Handler; onSupplier?: Handler; home?: Json; read?: Handler };

async function stub(page: Page, answer: Json, setup: Setup = {}): Promise<Calls> {
  const calls: Calls = { adds: [], deletes: [], saves: [], suppliers: [], receipts: [] };
  let total = answer.total as number;
  await page.route(/\/api\/petty-cash\/v1\/companies\/[^/]+\/(reports\/expenses|expense-lines|suppliers)/, async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace(/^.*\/companies\/[^/]+/, "");
    const method = request.method();
    if (path === "/reports/expenses/lines" && method === "POST") {
      calls.adds.push(multipart(route));
      if (setup.onAdd) return setup.onAdd(route, calls);
      const added = calls.adds.at(-1) as Json;
      total = Math.round((total + Number(added.amount)) * 100) / 100;
      const supplier = SUPPLIERS.find((s) => s.id === added.supplier_id) ?? { id: added.supplier_id, name: "Kwok Transport" };
      const account = ACCOUNTS.find((a) => a.id === added.account_id);
      return route.fulfill({
        status: 201,
        json: { line: line(`n${calls.adds.length}`, Number(added.amount), { item: account?.name, account, supplier, remarks: added.remarks }), total },
      });
    }
    if (path.startsWith("/expense-lines/") && path.includes("/receipts/")) {
      calls.receipts.push(path);
      return route.fulfill({ status: 200, contentType: "image/png", body: PNG });
    }
    if (path.startsWith("/expense-lines/") && method === "DELETE") {
      calls.deletes.push(path.split("/")[2]);
      if (setup.onDelete) return setup.onDelete(route, calls);
      total = 38;
      return route.fulfill({ json: { total } });
    }
    if (path === "/suppliers" && method === "POST") {
      calls.suppliers.push(request.postDataJSON() as Json);
      if (setup.onSupplier) return setup.onSupplier(route, calls);
      return route.fulfill({ status: 201, json: { id: "c9", name: (request.postDataJSON() as Json).name } });
    }
    if (path === "/reports/expenses" && method === "PUT") {
      calls.saves.push(request.postDataJSON() as Json);
      if (setup.onSave) return setup.onSave(route, calls);
      return route.fulfill({ json: { draft_id: "d", transaction_date: DAY, current_section: "deposit", completed_sections: ["opening", "sales", "expenses"], next: "deposit" } });
    }
    if (setup.read) return setup.read(route, calls);
    return route.fulfill({ json: answer });
  });
  await page.route("**/api/petty-cash/v1/companies/*/reports/opening**", (route) => route.fulfill({ json: OPENING }));
  await page.route("**/api/petty-cash/v1/companies/*/reports/sales**", async (route) => {
    if (route.request().method() === "PUT") {
      await route.fulfill({ json: { draft_id: "d", transaction_date: DAY, current_section: "expenses", completed_sections: ["opening", "sales"], next: "expenses" } });
      return;
    }
    await route.fulfill({ json: SALES });
  });
  await page.route("**/api/petty-cash/v1/companies/*/home", (route) => route.fulfill({ json: setup.home ?? homeAnswer() }));
  await page.route("**/api/me/profile**", (route) => route.fulfill({ json: { user: { name: "Tess Tester", initials: "TT" } } }));
  // This app's own Cash Count stage (e2e/06_cash_count.spec.ts covers it): a quiet stub.
  await page.route("**/api/petty-cash/v1/companies/*/reports/cash-count**", (route) =>
    route.fulfill({
      json: {
        transaction_date: DAY, currency_code: "HKD", draft: DRAFT, opening_balance: 500, cash_addition: 0, cash_sales: 0, expenses: 0, bank_deposit: 0,
        cash_on_hand: 500, expected_cash: 500, denominations: [], safe_box_balance: 0, discrepancy: { amount: 0, kind: "none", reason: "" },
      },
    }),
  );
  // Flask's pages (Close onwards, by the company's full id): caught.
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
  await arrive(page, STAGE_URL);
  await expect(page.getByRole("heading", { level: 1, name: "Expenses" })).toBeVisible();
  await expect(page.getByRole("status", { name: "Loading" })).toHaveCount(0);
  return calls;
}

const stages = (page: Page) => page.getByRole("list", { name: "Daily Closing stages" });
const row = (page: Page, label: string) => page.locator("dl").filter({ hasText: label });
const entries = (page: Page) => page.getByRole("region", { name: /expense/ }).getByRole("listitem");
const drawer = (page: Page) => page.getByRole("dialog", { name: "Add expense" });
const options = (page: Page) => drawer(page).getByRole("listbox", { name: "Suppliers" }).getByRole("option");

/** The supplier list's options, by accessible name (the add option's icon is not part of it). */
async function expectOptions(page: Page, names: string[]) {
  await expect(options(page)).toHaveCount(names.length);
  for (const [i, name] of names.entries()) await expect(options(page).nth(i)).toHaveAccessibleName(name);
}

async function openDrawer(page: Page) {
  await page.getByRole("button", { name: "Add expense" }).click();
  await expect(drawer(page)).toBeVisible();
}

async function attach(page: Page, name: string, mimeType: string, buffer: Buffer = PNG) {
  await drawer(page).locator("input[type=file]:not([capture])").setInputFiles({ name, mimeType, buffer });
}

/** A whole, valid entry: a receipt, ParknShop, the amount and General Expenses. */
async function fillValid(page: Page, amount = "45.5") {
  const d = drawer(page);
  await attach(page, "taxi.png", "image/png");
  await d.getByRole("combobox", { name: /Supplier/ }).fill("parkn");
  await options(page).filter({ hasText: "ParknShop" }).click();
  await d.getByRole("textbox", { name: /Amount/ }).fill(amount);
  await d.getByRole("combobox", { name: /Account/ }).selectOption({ label: "General Expenses · 429" });
}

test("the day's entries, their total and the Workflow header", async ({ page }) => {
  await openWith(page, expensesAnswer());
  await expect(page.getByText("Daily Closing · Tue 13 Oct 2026")).toBeVisible();
  await expect(page.getByText("Draft", { exact: true })).toHaveAttribute("data-tone", "neutral");
  await expect(page.getByText("Add each expense paid from the cash drawer, with its receipt.")).toBeVisible();
  await expect(stages(page).locator('[aria-current="step"]')).toContainText("Expenses, current step");
  // the done stages are this app's own pages; nothing after Expenses opens from here
  await expect(stages(page).getByRole("link", { name: "Drawer, done" })).toHaveAttribute("href", DRAWER_URL);
  await expect(stages(page).getByRole("link", { name: "Sales, done" })).toHaveAttribute("href", SALES_URL);
  await expect(stages(page).getByRole("link")).toHaveCount(2);

  await expect(page.getByRole("heading", { level: 2, name: "2 expenses" })).toBeVisible();
  await expect(page.getByText("To change an expense, delete it and add it again.")).toBeVisible();
  await expect(entries(page)).toHaveCount(2);
  const first = entries(page).first();
  await expect(first).toContainText("General Expenses");
  await expect(first).toContainText("HKD120.50");
  await expect(first).toContainText("ParknShop · Account 429");
  await expect(first).toContainText("Printer paper and toner for the front desk");
  await expect(first.getByRole("button", { name: "View receipt receipt-l1.png" })).toBeVisible();
  await expect(first.getByRole("button", { name: "Delete expense: General Expenses, HKD120.50" })).toBeVisible();
  await expect(row(page, "Total expenses")).toContainText("HKD158.50");
  // amounts are plain text, never coloured: the same ink as the title
  const colours = await first.locator("p").evaluateAll((ps) => ps.slice(0, 2).map((p) => getComputedStyle(p).color));
  expect(colours[0]).toBe(colours[1]);
  await expectNoHorizontalScroll(page);
});

test("no entries yet: the empty state, a zero total, and Add expense", async ({ page }) => {
  await openWith(page, expensesAnswer({ lines: [], total: 0 }));
  await expect(page.getByText("No expenses added yet.")).toBeVisible();
  await expect(page.getByText("Add an expense when you're ready.")).toBeVisible();
  await expect(row(page, "Total expenses")).toContainText("HKD0.00");
  await expect(page.getByRole("button", { name: "Add expense" })).toHaveCount(1);
  await expectNoHorizontalScroll(page);
});

test("Add expense: a Drawer on a computer, a full-screen sheet on a phone, checked as it is typed", async ({ page }) => {
  const calls = await openWith(page, expensesAnswer());
  await openDrawer(page);
  const d = drawer(page);
  const box = await d.boundingBox();
  const width = page.viewportSize()!.width;
  if (width < 640) expect(Math.round(box!.width)).toBe(width);
  else expect(Math.round(box!.width)).toBe(480);

  // required fields: a red * and "(required)" for screen readers, and nothing red before a submit
  const amount = d.getByRole("textbox", { name: /Amount/ });
  const supplier = d.getByRole("combobox", { name: /Supplier/ });
  const description = d.getByRole("textbox", { name: "Description" });
  await expect(amount).toHaveAttribute("aria-required", "true");
  await expect(amount).toHaveAttribute("inputmode", "decimal");
  await expect(d.getByRole("combobox", { name: /Supplier \(required\)/ })).toHaveAttribute("aria-required", "true");
  await expect(d.getByRole("combobox", { name: /Account \(required\)/ })).toHaveAttribute("aria-required", "true");
  await expect(description).not.toHaveAttribute("aria-required", "true");
  await expect(d.getByRole("alert")).toHaveCount(0);

  // the description warns the moment it passes 300, and clears as it comes back
  await description.fill("x".repeat(301));
  await expect(description).toHaveAccessibleDescription("The description is 301 characters. Shorten it to 300 characters or fewer.");
  await description.fill("Taxi to the bank");
  await expect(description).toHaveAccessibleDescription("Optional. 16 of 300 characters.");

  // a zero may be on its way to 0.50: it waits until the field is left
  await amount.fill("0");
  await expect(amount).not.toHaveAttribute("aria-invalid", "true");
  await description.focus();
  await expect(amount).toHaveAccessibleDescription("The amount is 0. Enter an amount above 0.");
  await amount.fill("1a2.555");
  await expect(amount).toHaveValue("12.55");
  await expect(amount).not.toHaveAttribute("aria-invalid", "true");

  // a half-typed supplier is fine while typing, named once the field is left
  await supplier.fill("Parkx");
  await expect(supplier).not.toHaveAttribute("aria-invalid", "true");
  await amount.focus();
  await expect(supplier).toHaveAccessibleDescription('"Parkx" is not a supplier yet. Choose one from the list, or add it as a new supplier.');

  // a refused submit: the summary names every problem and takes focus
  await amount.fill("");
  await supplier.fill("");
  await d.getByRole("button", { name: "Add expense" }).click();
  const summary = d.getByRole("alert").filter({ hasText: "4 details need a look" });
  await expect(summary).toBeFocused();
  await expect(summary.getByRole("link")).toHaveText([
    "The receipt is still missing. Take a photo of it or choose its file to continue.",
    "The supplier is still empty. Choose a supplier from the list to continue.",
    "The amount is still empty. Add the amount to continue.",
    "The account is still empty. Choose where to record this expense to continue.",
  ]);
  expect(calls.adds).toEqual([]);
  await summary.getByRole("link", { name: /The amount/ }).click();
  await expect(amount).toBeFocused();
  await amount.fill("12.55");
  // the summary follows the fixes
  await expect(d.getByRole("alert").filter({ hasText: "3 details need a look" }).getByRole("link")).toHaveCount(3);

  // a wrong file is refused the moment it is picked, by name
  await attach(page, "receipt.gif", "image/gif");
  await expect(d.getByText("receipt.gif isn't a PDF, JPEG or PNG. Attach the receipt as one of those.").first()).toBeVisible();
  await attach(page, "huge.jpg", "image/jpeg", Buffer.alloc(10 * 1024 * 1024 + 1));
  await expect(d.getByText("huge.jpg is 10.0 MB. Attach a file of 10 MB or less.").first()).toBeVisible();
  await attach(page, "taxi.png", "image/png");
  await expect(d.getByText("taxi.png", { exact: true })).toBeVisible();
  await expect(d.getByRole("img", { name: "Receipt photo" })).toBeVisible();

  // the supplier, by keyboard
  await supplier.fill("park");
  await expectOptions(page, ["Park Lane Florist", "ParknShop", "Add “park” as a new supplier"]);
  await supplier.press("ArrowDown");
  await supplier.press("ArrowDown");
  await supplier.press("Enter");
  await expect(supplier).toHaveValue("ParknShop");
  await d.getByRole("combobox", { name: /Account/ }).selectOption({ label: "Printing & Stationery · 461" });
  await expect(d.getByRole("alert")).toHaveCount(0);

  // Enter in a field adds it
  await amount.press("Enter");
  await expect(drawer(page)).toHaveCount(0);
  expect(calls.adds).toEqual([
    { transaction_date: DAY, amount: "12.55", remarks: "Taxi to the bank", supplier_id: "c1", account_id: "a2", receipt: { filename: "taxi.png", type: "image/png" } },
  ]);
  await expect(entries(page)).toHaveCount(3);
  await expect(entries(page).last()).toContainText("Printing & Stationery");
  await expect(entries(page).last()).toContainText("HKD12.55");
  await expect(row(page, "Total expenses")).toContainText("HKD171.05");
  await expect(page.getByRole("heading", { level: 2, name: "3 expenses" })).toBeVisible();
  await expectNoHorizontalScroll(page);
});

test("the API's refusal shows in the sheet, which stays open with what was entered", async ({ page }) => {
  const why = "Attach a PDF, JPEG or PNG file.";
  await openWith(page, expensesAnswer(), { onAdd: (route) => route.fulfill({ status: 422, json: { error: why } }) });
  await openDrawer(page);
  await fillValid(page);
  await drawer(page).getByRole("button", { name: "Add expense" }).click();
  await expect(drawer(page).getByRole("alert").filter({ hasText: why })).toHaveAttribute("data-tone", "danger");
  await expect(drawer(page).getByRole("textbox", { name: /Amount/ })).toHaveValue("45.50");
  await expect(drawer(page).getByRole("button", { name: "Add expense" })).toBeEnabled();
  await expect(entries(page)).toHaveCount(2);
});

test("closing with something entered asks first; an empty sheet just closes", async ({ page }) => {
  await openWith(page, expensesAnswer());
  await openDrawer(page);
  await page.keyboard.press("Escape");
  await expect(drawer(page)).toHaveCount(0);
  await openDrawer(page);
  await drawer(page).getByRole("textbox", { name: /Amount/ }).fill("5");
  await page.keyboard.press("Escape");
  const ask = drawer(page).locator("[data-tone=warning]").filter({ hasText: "This expense isn't added yet" });
  await expect(ask).toBeVisible();
  await ask.getByRole("button", { name: "Discard it" }).click();
  await expect(drawer(page)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Add expense" })).toBeFocused();
});

test("supplier search, and a new supplier added to Xero only on Add supplier", async ({ page }) => {
  const calls = await openWith(page, expensesAnswer());
  await openDrawer(page);
  const d = drawer(page);
  const supplier = d.getByRole("combobox", { name: /Supplier/ });
  await supplier.fill("  WELL");
  await expectOptions(page, ["Wellcome", "Add “WELL” as a new supplier"]);
  // an exact name, any case: no "add" option, so no duplicate
  await supplier.fill("wellcome ");
  await expectOptions(page, ["Wellcome"]);
  await supplier.fill("Kwok Transport");
  await expectOptions(page, ["Add “Kwok Transport” as a new supplier"]);
  await expect(d.getByText("No supplier is called Kwok Transport. You can add it as a new supplier.")).toBeAttached();
  await options(page).click();
  expect(calls.suppliers).toEqual([]);

  const panel = d.getByRole("group", { name: "New supplier" });
  const name = panel.getByRole("textbox", { name: /Supplier's name/ });
  await expect(name).toHaveValue("Kwok Transport");
  await expect(name).toBeFocused();
  // the panel is the answer: the field left behind does not also warn
  await expect(supplier).not.toHaveAttribute("aria-invalid", "true");
  await name.fill(" ParknShop ");
  await expect(panel.getByText("ParknShop is already a supplier. Choose it from the list.")).toBeVisible();
  await name.fill("Kwok Transport");
  await panel.getByRole("button", { name: "Add supplier" }).click();
  await expect(panel).toHaveCount(0);
  expect(calls.suppliers).toEqual([{ name: "Kwok Transport" }]);
  await expect(supplier).toHaveValue("Kwok Transport");
  await expect(supplier).toBeFocused();

  // and it is in the list from now on
  await supplier.fill("kwok");
  await expectOptions(page, ["Kwok Transport", "Add “kwok” as a new supplier"]);
  await options(page).first().click();
  await attach(page, "kwok.pdf", "application/pdf", Buffer.from("%PDF-1.4\n"));
  await d.getByRole("textbox", { name: /Amount/ }).fill("300");
  await d.getByRole("combobox", { name: /Account/ }).selectOption("a1");
  await d.getByRole("button", { name: "Add expense" }).click();
  await expect(drawer(page)).toHaveCount(0);
  expect(calls.adds).toMatchObject([{ supplier_id: "c9", amount: "300", receipt: { filename: "kwok.pdf", type: "application/pdf" } }]);
});

test("a new supplier Xero refuses says why, in the panel", async ({ page }) => {
  const why = "Xero says a contact with that name already exists.";
  await openWith(page, expensesAnswer(), { onSupplier: (route) => route.fulfill({ status: 409, json: { error: why } }) });
  await openDrawer(page);
  await drawer(page).getByRole("combobox", { name: /Supplier/ }).fill("Kwok");
  await options(page).click();
  const panel = drawer(page).getByRole("group", { name: "New supplier" });
  await panel.getByRole("textbox", { name: /Supplier's name/ }).press("Enter");
  await expect(panel.getByRole("alert").filter({ hasText: why })).toBeVisible();
  // Enter in the panel added the supplier, never the expense
  await expect(drawer(page)).toBeVisible();
});

test("no supplier may be added without the permission", async ({ page }) => {
  await openWith(page, expensesAnswer({ permissions: { create_supplier: false } }));
  await openDrawer(page);
  await drawer(page).getByRole("combobox", { name: /Supplier/ }).fill("Kwok");
  await expect(options(page)).toHaveCount(0);
  await expect(drawer(page).getByText("No supplier matches that name.")).toBeVisible();
});

test("delete asks with a Danger confirmation, Cancel first, then goes", async ({ page }) => {
  const calls = await openWith(page, expensesAnswer());
  await entries(page).first().getByRole("button", { name: /^Delete expense/ }).click();
  const dialog = page.getByRole("alertdialog", { name: "Delete this expense?" });
  await expect(dialog).toContainText("General Expenses, HKD120.50 from ParknShop, and its receipt will be deleted.");
  await expect(dialog).toContainText("This can't be undone.");
  await expect(dialog.getByRole("button", { name: "Cancel" })).toBeFocused();
  await expect(dialog.getByRole("button", { name: "Delete expense" })).toHaveClass(/bg-action-danger/);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  expect(calls.deletes).toEqual([]);

  await entries(page).first().getByRole("button", { name: /^Delete expense/ }).click();
  await dialog.getByRole("button", { name: "Delete expense" }).click();
  await expect(dialog).toHaveCount(0);
  expect(calls.deletes).toEqual(["l1"]);
  await expect(entries(page)).toHaveCount(1);
  await expect(row(page, "Total expenses")).toContainText("HKD38.00");
  await expect(page.getByRole("heading", { level: 2, name: "1 expense" })).toBeVisible();
});

test("a refused delete says why in the confirmation and keeps the entry", async ({ page }) => {
  const why = "It looks like you don't have permission to delete this expense.";
  await openWith(page, expensesAnswer(), { onDelete: (route) => route.fulfill({ status: 403, json: { error: why } }) });
  await entries(page).first().getByRole("button", { name: /^Delete expense/ }).click();
  const dialog = page.getByRole("alertdialog", { name: "Delete this expense?" });
  await dialog.getByRole("button", { name: "Delete expense" }).click();
  await expect(dialog.getByRole("alert").filter({ hasText: why })).toBeVisible();
  await expect(entries(page)).toHaveCount(2);
});

test("a receipt opens full screen in the app - never a new tab - and Escape closes only it", async ({ page, context }) => {
  const calls = await openWith(page, expensesAnswer());
  const view = entries(page).first().getByRole("button", { name: "View receipt receipt-l1.png" });
  await view.click();
  const viewer = page.getByRole("dialog", { name: "receipt-l1.png" });
  await expect(viewer.getByRole("img", { name: "Receipt: receipt-l1.png" })).toBeVisible();
  const box = await viewer.boundingBox();
  expect(Math.round(box!.width)).toBe(page.viewportSize()!.width);
  expect(Math.round(box!.height)).toBe(page.viewportSize()!.height);
  expect(context.pages()).toHaveLength(1);
  // read with the bearer, by the receipt's id (twice in development: React's strict effects)
  expect(new Set(calls.receipts)).toEqual(new Set(["/expense-lines/l1/receipts/r-l1"]));
  await page.keyboard.press("Escape");
  await expect(viewer).toHaveCount(0);
  await expect(view).toBeFocused();

  // a picked file opens the same way, over the sheet - and Escape leaves the sheet open
  await openDrawer(page);
  await attach(page, "taxi.png", "image/png");
  await drawer(page).getByRole("button", { name: "View taxi.png" }).click();
  await expect(page.getByRole("dialog", { name: "taxi.png" }).getByRole("img")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "taxi.png" })).toHaveCount(0);
  await expect(drawer(page)).toBeVisible();
});

test("Save & Next marks the stage done and goes on to this app's Cash Count, which opens at the deposit", async ({ page }) => {
  const calls = await openWith(page, expensesAnswer());
  await page.getByRole("button", { name: "Save & Next" }).click();
  await expect(page).toHaveURL(new RegExp(`${BASE}/reports/new/cash-count\\?transaction_date=${DAY}$`));
  await expect(page.getByRole("heading", { level: 1, name: "Cash Count" })).toBeVisible();
  expect(calls.saves).toEqual([{ transaction_date: DAY, action: "next" }]);
});

test("Save & Exit goes back to the launch page", async ({ page }) => {
  const calls = await openWith(page, expensesAnswer(), {
    onSave: (route) => route.fulfill({ json: { draft_id: "d", transaction_date: DAY, current_section: "expenses", completed_sections: ["opening", "sales"], next: "dashboard" } }),
  });
  await page.getByRole("button", { name: "Save & Exit" }).click();
  await expect(page).toHaveURL(new RegExp(`${BASE}$`));
  await expect(page.getByRole("heading", { level: 1, name: "Petty Cash" })).toBeVisible();
  expect(calls.saves).toEqual([{ transaction_date: DAY, action: "exit" }]);
});

test("no draft for the day: the stage sends the person to Addition to Drawer, which says why, once", async ({ page }) => {
  const why = "I don't see a draft yet - let's start with the opening entry.";
  await stub(page, expensesAnswer(), { read: (route) => route.fulfill({ status: 409, json: { error: why, to: "opening" } }) });
  await arrive(page, STAGE_URL);
  await expect(page).toHaveURL(new RegExp(`${BASE}/reports/new/opening\\?transaction_date=${DAY}$`));
  await expect(page.getByRole("heading", { level: 1, name: "Addition to Drawer" })).toBeVisible();
  const banner = page.getByRole("status").filter({ hasText: why });
  await expect(banner).toHaveAttribute("data-tone", "warning");
  await page.reload();
  await expect(page.getByRole("heading", { level: 1, name: "Addition to Drawer" })).toBeVisible();
  await expect(page.getByRole("status", { name: "Loading" })).toHaveCount(0);
  await expect(page.getByText(why)).toHaveCount(0);
});

test("Sales' Save & Next opens this stage without leaving the app", async ({ page }) => {
  await stub(page, expensesAnswer());
  await arrive(page, SALES_URL);
  await expect(page.getByRole("heading", { level: 1, name: "Sales" })).toBeVisible();
  await expect(page.getByRole("status", { name: "Loading" })).toHaveCount(0);
  await page.evaluate(() => Object.assign(window, { __stayed: true }));
  await page.getByRole("button", { name: "Save & Next" }).click();
  await expect(page).toHaveURL(STAGE_URL);
  await expect(page.getByRole("heading", { level: 1, name: "Expenses" })).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { __stayed?: boolean }).__stayed)).toBe(true);
});

test("the launch page's Continue opens this stage when the report is on Expenses", async ({ page }) => {
  await stub(page, expensesAnswer(), {
    home: homeAnswer({ draft: { id: "d", current_section: "expenses", completed_sections: ["opening", "sales"], last_edit_seconds: 60 }, draft_date: DAY }),
  });
  await arrive(page, BASE);
  const card = page.getByRole("region", { name: /Daily Closing/ });
  await expect(card).toContainText("Next: Expenses");
  await expect(card.getByRole("list", { name: "Daily Closing stages" }).getByRole("link", { name: /Expenses, current step/ })).toHaveAttribute("href", STAGE_URL);
  await card.getByRole("button", { name: "Continue Daily Closing" }).click();
  await expect(page).toHaveURL(STAGE_URL);
  await expect(page.getByRole("heading", { level: 1, name: "Expenses" })).toBeVisible();
});

test("the largest amount is never clipped, at any width", async ({ page }) => {
  await openWith(page, expensesAnswer({ lines: [line("big", 99999999999.99, { remarks: "x".repeat(300) })], total: 99999999999.99 }));
  await expect(entries(page).first()).toContainText("HKD99,999,999,999.99");
  const clipped = await page.locator("main p, main dd").evaluateAll((els) => els.filter((el) => el.scrollWidth > el.clientWidth + 1).map((el) => el.textContent));
  expect(clipped).toEqual([]);
  await expectNoHorizontalScroll(page);
});

test("the stage reloads with no console error", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(e.message));
  await openWith(page, expensesAnswer());
  await page.reload();
  await expect(page.getByRole("heading", { level: 1, name: "Expenses" })).toBeVisible();
  await expect(entries(page)).toHaveCount(2);
  expect(errors).toEqual([]);
});
