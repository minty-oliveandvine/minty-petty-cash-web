// The report wizard's Expenses step (components/report/ExpensesStep.tsx and AddExpenseCard.tsx,
// Flask's look exactly), against a STUBBED Petty Cash API. Needs only `npm run dev`. Flask's pages
// (Submitted onwards) are caught, so nothing leaves the app.

import { expect, test, type Page, type Request, type Route } from "@playwright/test";

import { companyRef } from "./companyRef";
import { mintModuleToken } from "./helpers";

const ENTITY = "3d65f186-5ba1-4bf7-a1b0-cc64a113eb5c";
const NAME = "E2E Petty Cash Shop";
const BASE = `/entity/${companyRef(ENTITY, NAME)}/petty-cash`;
const DAY = "2026-10-13";
const API = "**/api/petty-cash/v1/companies/*";

type Json = Record<string, unknown>;

const DRAFT = { id: "d", status: "draft", current_section: "expenses", completed_sections: ["opening", "sales"], xero_integrated: false, publishing_status: "unpublished" };

// a 1x1 PNG
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

const SUPPLIERS = [
  { id: "s-well", name: "Wellcome" },
  { id: "s-park", name: "ParknShop" },
  { id: "s-plf", name: "Park Lane Florist" },
];
const ACCOUNTS = [
  { id: "a-429", code: "429", name: "General Expenses" },
  { id: "a-461", code: "461", name: "Printing & Stationery" },
];

const LINE = {
  id: "l1",
  item: "General Expenses",
  amount: 1200.5,
  remarks: "Milk and <b>tea</b>",
  supplier: { id: "s-well", name: "Wellcome" },
  account: { id: "a-429", code: "429", name: "General Expenses" },
  receipts: [{ id: "r1", name: "milk.png", mime_type: "image/png" }],
};
const BARE_LINE = { id: "l2", item: "", amount: 34, remarks: "", supplier: null, account: null, receipts: [] };

function expensesAnswer(over: Json = {}): Json {
  return {
    transaction_date: DAY,
    currency_code: "HKD",
    draft: DRAFT,
    lines: [LINE, BARE_LINE],
    total: 1234.5,
    suppliers: SUPPLIERS,
    accounts: ACCOUNTS,
    permissions: { create_supplier: true },
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

const OPENING = { transaction_date: DAY, currency_code: "HKD", draft: null, starting_cash_balance: 0, yesterday_closing_balance: 0, safebox_balance: 0, cash_addition: null, withdrawal: "personal" };

type Handlers = {
  /** POST /reports/expenses/lines */
  onAdd?: (req: Request, route: Route) => Promise<void>;
  /** PUT /reports/expenses */
  onSave?: (body: Json, route: Route) => Promise<void>;
  onDelete?: (route: Route) => Promise<void>;
  onSupplier?: (body: Json, route: Route) => Promise<void>;
  /** GET /reports/expenses, when not the answer */
  onRead?: (route: Route) => Promise<void>;
};

async function stub(page: Page, answer: Json, h: Handlers = {}) {
  await page.route(`${API}/reports/expenses**`, async (route) => {
    const req = route.request();
    if (req.url().includes("/reports/expenses/lines")) {
      if (h.onAdd) await h.onAdd(req, route);
      else await route.fulfill({ status: 201, json: { line: { ...LINE, id: "new" }, total: 2435 } });
      return;
    }
    if (req.method() === "PUT") {
      if (h.onSave) await h.onSave(req.postDataJSON() as Json, route);
      else await route.fulfill({ json: { draft_id: "d", transaction_date: DAY, current_section: "deposit", completed_sections: ["opening", "sales", "expenses"], next: "deposit" } });
      return;
    }
    if (h.onRead) await h.onRead(route);
    else await route.fulfill({ json: answer });
  });
  await page.route(`${API}/expense-lines/**`, async (route) => {
    if (route.request().method() === "DELETE") {
      if (h.onDelete) await h.onDelete(route);
      else await route.fulfill({ json: { total: 34 } });
      return;
    }
    await route.fulfill({ body: PNG, contentType: "image/png" });
  });
  await page.route(`${API}/suppliers`, async (route) => {
    if (h.onSupplier) await h.onSupplier(route.request().postDataJSON() as Json, route);
    else await route.fulfill({ status: 201, json: { id: "s-new", name: (route.request().postDataJSON() as Json).name } });
  });
  await page.route(`${API}/reports/opening**`, (route) => route.fulfill({ json: OPENING }));
  // This app's own Bank Deposit step (e2e/06_deposit.spec.ts covers it): a quiet stub.
  await page.route(`${API}/reports/deposit**`, (route) =>
    route.fulfill({
      json: { transaction_date: DAY, currency_code: "HKD", draft: DRAFT, opening_balance: 0, cash_addition: 0, cash_sales: 0, expenses: 0, bank_deposit: 0, cash_on_hand: 0, expected_cash: 0 },
    }),
  );
  await page.route(`${API}/home`, (route) => route.fulfill({ json: HOME }));
  await page.route("**/api/me/profile**", (route) => route.fulfill({ json: { user: { name: "Tess Tester", initials: "TT" } } }));
  // a Flask page address: nothing here opens one (Flask is a backend only), so a regression lands on this stub, never Flask
  await page.route(/\/entity\/[0-9a-f-]{36}\/petty-cash\/reports\//, (route) =>
    route.fulfill({ contentType: "text/html", body: "<title>Flask page</title><p>Flask page</p>" }),
  );
}

async function enter(page: Page, next = `${BASE}/reports/new/expense?transaction_date=${DAY}`) {
  const token = mintModuleToken({ secret: "stub", userId: "u", entityId: ENTITY, entityName: NAME });
  await page.goto(`/landing?${new URLSearchParams({ token, entity_id: ENTITY, entity_name: NAME, next })}`);
}

async function openWith(page: Page, answer: Json, h: Handlers = {}) {
  await stub(page, answer, h);
  await enter(page);
  await expect(page.getByRole("heading", { name: "Expenses", exact: true })).toBeVisible();
}

const toast = (page: Page, text: string | RegExp) => page.locator("[data-toast-type]").filter({ hasText: text });

/** Fill the add card completely: amount, a supplier and an account from their lists, a PNG receipt. */
async function fillAdd(page: Page) {
  await page.getByRole("button", { name: "Add New Expense" }).click();
  await page.getByRole("textbox", { name: /Expense Amount/ }).fill("1200.5");
  await page.getByRole("textbox", { name: "Description" }).fill("Toner");
  await page.getByRole("combobox", { name: /Suppliers/ }).click();
  await page.getByRole("option", { name: "Wellcome" }).click();
  await page.getByRole("combobox", { name: /Account Code/ }).click();
  await page.getByRole("option", { name: /Printing & Stationery/ }).click();
  await page.getByTestId("expense_files").setInputFiles({ name: "toner.png", mimeType: "image/png", buffer: PNG });
  await expect(page.getByRole("img", { name: "Uploaded receipt" })).toBeVisible();
}

test("Flask's list: each line, its supplier and description, the red amount, and the total", async ({ page }) => {
  await openWith(page, expensesAnswer());
  await expect(page.getByText("13 OCT")).toBeVisible();
  await expect(page.getByText("Draft", { exact: true })).toBeVisible();
  const row = page.getByRole("button", { name: "General Expenses, HKD 1,200.50" });
  await expect(row).toContainText("Wellcome");
  // a description is text, never markup
  await expect(row).toContainText("Milk and <b>tea</b>");
  await expect(page.getByRole("button", { name: "N/A, HKD 34.00" })).toBeVisible();
  await expect(page.getByText("Total Expense")).toBeVisible();
  await expect(page.getByText("HKD 1,234.50")).toBeVisible();
  await expect(page.getByRole("button", { name: "Delete expense" })).toHaveCount(2);
  await expect(page.getByText("No expenses added yet")).toHaveCount(0);
});

test("no lines yet: Flask's empty line and a zero total", async ({ page }) => {
  await openWith(page, expensesAnswer({ lines: [], total: 0 }));
  await expect(page.getByText("No expenses added yet")).toBeVisible();
  await expect(page.getByText("HKD 0.00")).toBeVisible();
});

test("Add checks the required fields, then sends the line with its receipt", async ({ page }) => {
  let sent: string | null = null;
  await openWith(page, expensesAnswer(), {
    onAdd: async (req, route) => {
      sent = req.postData();
      await route.fulfill({ status: 201, json: { line: { ...LINE, id: "new", item: "Printing & Stationery", amount: 1200.5, remarks: "Toner" }, total: 2435 } });
    },
  });
  await page.getByRole("button", { name: "Add New Expense" }).click();
  await expect(page.getByRole("heading", { name: "Add New Expense" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add New Expense" })).toHaveCount(0);
  await expect(page.getByText("Click to upload or drag and drop")).toBeVisible();
  await expect(page.getByText("PDF, JPEG, PNG (Max 10MB)")).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Description" })).toHaveAttribute("placeholder", "Description (Optional)");

  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(toast(page, "Please fill out the Required Fields")).toBeVisible();
  for (const name of [/Expense Amount/]) await expect(page.getByRole("textbox", { name })).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByRole("combobox", { name: /Suppliers/ })).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByRole("combobox", { name: /Account Code/ })).toHaveAttribute("aria-invalid", "true");

  // a typed name that was never picked from the list does not count
  await page.getByRole("combobox", { name: /Suppliers/ }).fill("Wellcome");
  await page.getByRole("combobox", { name: /Suppliers/ }).press("Escape");
  await page.getByRole("textbox", { name: /Expense Amount/ }).fill("5");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByRole("combobox", { name: /Suppliers/ })).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByRole("textbox", { name: /Expense Amount/ })).not.toHaveAttribute("aria-invalid", "true");

  await page.getByRole("button", { name: "Cancel" }).click();
  await fillAdd(page);
  await expect(page.getByRole("textbox", { name: /Expense Amount/ })).toHaveValue("1,200.50");
  await page.getByRole("button", { name: "Add", exact: true }).click();

  await expect(toast(page, "Expense added successfully!")).toBeVisible();
  await expect(page.getByRole("button", { name: "Printing & Stationery, HKD 1,200.50" })).toBeVisible();
  await expect(page.getByText("HKD 2,435.00")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Add New Expense" })).toHaveCount(0);
  const body = sent ?? "";
  for (const [field, value] of [
    ["transaction_date", DAY],
    ["amount", "1200.5"],
    ["remarks", "Toner"],
    ["supplier_id", "s-well"],
    ["account_id", "a-461"],
  ]) {
    expect(body).toContain(`name="${field}"\r\n\r\n${value}\r\n`);
  }
  expect(body).toContain('name="receipt"; filename="toner.png"');
});

test("a receipt that is not a PDF, JPEG or PNG is refused in Flask's words", async ({ page }) => {
  await openWith(page, expensesAnswer());
  await page.getByRole("button", { name: "Add New Expense" }).click();
  await page.getByTestId("expense_files").setInputFiles({ name: "cat.gif", mimeType: "image/gif", buffer: Buffer.from("GIF89a") });
  await expect(toast(page, "I can take PDF, JPEG, or PNG files.")).toBeVisible();
  await expect(page.getByText("Click to upload or drag and drop")).toBeVisible();

  await page.getByTestId("expense_files").setInputFiles({ name: "scan.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4") });
  await expect(page.getByText('"scan.pdf" Uploaded')).toBeVisible();
  await expect(page.getByText("Click to change files")).toBeVisible();
});

test("the server's refusal is shown as it says it, and the card stays open", async ({ page }) => {
  const why = "Keep the description to 300 characters or fewer.";
  await openWith(page, expensesAnswer(), { onAdd: (_req, route) => route.fulfill({ status: 422, json: { error: why } }) });
  await fillAdd(page);
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(toast(page, why)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Add New Expense" })).toBeVisible();
});

test("suppliers are searched A to Z, and a new one is created and chosen", async ({ page }) => {
  let created: Json | null = null;
  await openWith(page, expensesAnswer(), {
    onSupplier: async (body, route) => {
      created = body;
      await route.fulfill({ status: 201, json: { id: "s-kee", name: "Kee Wah" } });
    },
  });
  await page.getByRole("button", { name: "Add New Expense" }).click();
  const supplier = page.getByRole("combobox", { name: /Suppliers/ });
  await expect(supplier).toHaveAttribute("placeholder", "Select a contact");
  await supplier.click();
  await expect(page.getByRole("option")).toHaveText(["Park Lane Florist", "ParknShop", "Wellcome"]);

  await supplier.fill("PARK");
  await expect(page.getByRole("option")).toHaveText(["Park Lane Florist", "ParknShop", "+ Add 'PARK' as a new contact"]);
  await supplier.press("ArrowDown");
  await supplier.press("ArrowDown");
  await supplier.press("Enter");
  await expect(supplier).toHaveValue("ParknShop");
  await expect(page.getByRole("listbox")).toHaveCount(0);

  await supplier.fill("Kee Wah");
  await expect(page.getByText("No Xero contact found")).toBeVisible();
  await page.getByRole("option", { name: "+ Add 'Kee Wah' as a new contact" }).click();
  const newContact = page.getByRole("textbox", { name: /New Contact/ });
  await expect(newContact).toHaveValue("Kee Wah");
  await expect(newContact).toHaveAttribute("placeholder", "Enter a New Contact");

  await newContact.fill("  ");
  await page.getByRole("button", { name: "Create" }).click();
  await expect(toast(page, "Who should I put down as the contact?")).toBeVisible();

  await newContact.fill("Kee Wah");
  await page.getByRole("button", { name: "Create" }).click();
  await expect(toast(page, "That contact's added!")).toBeVisible();
  await expect(page.getByRole("combobox", { name: /Suppliers/ })).toHaveValue("Kee Wah");
  expect(created).toEqual({ name: "Kee Wah" });
  // it is in the list from now on
  await page.getByRole("combobox", { name: /Suppliers/ }).click();
  await expect(page.getByRole("option", { name: "Kee Wah" })).toBeVisible();
});

test("accounts list their code under the name and filter by name", async ({ page }) => {
  await openWith(page, expensesAnswer());
  await page.getByRole("button", { name: "Add New Expense" }).click();
  const account = page.getByRole("combobox", { name: /Account Code/ });
  await expect(account).toHaveAttribute("placeholder", "Select an account code");
  await account.click();
  await expect(page.getByRole("option")).toHaveText(["General Expenses429", "Printing & Stationery461"]);
  await account.fill("print");
  await expect(page.getByRole("option")).toHaveText(["Printing & Stationery461"]);
  await account.press("Enter");
  await expect(account).toHaveValue("Printing & Stationery");
});

test("a line is deleted through Flask's modal, and a refusal says the server's sentence", async ({ page }) => {
  let deletes = 0;
  await openWith(page, expensesAnswer(), {
    onDelete: async (route) => {
      deletes += 1;
      if (deletes === 1) await route.fulfill({ status: 403, json: { error: "It looks like you don't have permission to delete this expense." } });
      else await route.fulfill({ json: { total: 34 } });
    },
  });
  await page.getByRole("button", { name: "Delete expense" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Delete Expense" });
  await expect(dialog).toContainText("Warning:");
  await expect(dialog).toContainText("Are you sure you want to delete this expense? This action cannot be undone.");
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toHaveCount(0);

  await page.getByRole("button", { name: "Delete expense" }).first().click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(toast(page, "It looks like you don't have permission to delete this expense.")).toBeVisible();
  await expect(page.getByRole("button", { name: "General Expenses, HKD 1,200.50" })).toBeVisible();

  await page.getByRole("button", { name: "Delete expense" }).first().click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(toast(page, "Expense deleted successfully!")).toBeVisible();
  await expect(page.getByRole("button", { name: "General Expenses, HKD 1,200.50" })).toHaveCount(0);
  await expect(page.getByText("HKD 34.00").last()).toBeVisible();
});

test("a line opens Expense Details with its receipt, which opens full screen", async ({ page }) => {
  await openWith(page, expensesAnswer());
  await page.getByRole("button", { name: "General Expenses, HKD 1,200.50" }).click();
  const dialog = page.getByRole("dialog", { name: "Expense Details" });
  await expect(dialog.getByText("Amount Paid")).toBeVisible();
  await expect(dialog.getByText("HKD 1,200.50")).toBeVisible();
  await expect(dialog).toContainText("Contact NameWellcome");
  await expect(dialog).toContainText("DescriptionMilk and <b>tea</b>");
  await expect(dialog).toContainText("Account429 General Expenses");
  const thumb = dialog.getByRole("img", { name: "milk.png" });
  await expect(thumb).toHaveAttribute("src", /^blob:/);
  await expect.poll(() => thumb.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(1);

  await dialog.getByRole("button", { name: "Open milk.png" }).click();
  const viewer = page.getByRole("dialog", { name: "Receipt" });
  await expect(viewer).toBeVisible();
  await expect(viewer.getByRole("img", { name: "milk.png" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(viewer).toHaveCount(0);
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Close" }).click();
  await expect(dialog).toHaveCount(0);

  await page.getByRole("button", { name: "N/A, HKD 34.00" }).click();
  await expect(page.getByRole("dialog", { name: "Expense Details" })).toContainText("Contact NameN/A");
  await expect(page.getByRole("dialog", { name: "Expense Details" })).toContainText("Description-");
});

test("an open add card holds the stepper back with Flask's warning", async ({ page }) => {
  await openWith(page, expensesAnswer());
  await page.getByRole("button", { name: "Add New Expense" }).click();
  await page.getByRole("link", { name: /^Sales/ }).click();
  await expect(toast(page, "You have an unsaved expense. Please save before navigating.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Add New Expense" })).toBeVisible();
});

test("Save & Next goes on to Bank Deposit in this app", async ({ page }) => {
  let sent: Json | null = null;
  await openWith(page, expensesAnswer(), {
    onSave: async (body, route) => {
      sent = body;
      await route.fulfill({ json: { draft_id: "d", transaction_date: DAY, current_section: "deposit", completed_sections: ["opening", "sales", "expenses"], next: "deposit" } });
    },
  });
  await page.getByRole("button", { name: "Save & Next" }).click();
  await expect(page).toHaveURL(new RegExp(`${BASE}/reports/new/deposit\\?transaction_date=${DAY}$`));
  await expect(page.getByRole("heading", { name: "Deposit to Bank" })).toBeVisible();
  expect(sent).toEqual({ transaction_date: DAY, action: "next" });
});

test("Save & Exit goes home", async ({ page }) => {
  let sent: Json | null = null;
  await openWith(page, expensesAnswer(), {
    onSave: async (body, route) => {
      sent = body;
      await route.fulfill({ json: { draft_id: "d", transaction_date: DAY, current_section: "expenses", completed_sections: ["opening", "sales"], next: "dashboard" } });
    },
  });
  await page.getByRole("button", { name: "Save & Exit" }).click();
  await expect(page).toHaveURL(new RegExp(`${BASE}$`));
  expect(sent).toEqual({ transaction_date: DAY, action: "exit" });
});

test("a day with no draft goes back to Opening and says why", async ({ page }) => {
  const why = "I don't see a draft yet - let's start with the opening entry.";
  await stub(page, expensesAnswer(), { onRead: (route) => route.fulfill({ status: 409, json: { error: why, to: "opening" } }) });
  await enter(page);
  await expect(page).toHaveURL(new RegExp(`${BASE}/reports/new/opening\\?transaction_date=${DAY}$`));
  await expect(page.getByRole("heading", { name: "Opening" })).toBeVisible();
  await expect(toast(page, why)).toBeVisible();
});

test("Sales' Save & Next lands here without leaving the app", async ({ page }) => {
  await stub(page, expensesAnswer());
  await page.route(`${API}/reports/sales**`, async (route) => {
    if (route.request().method() === "PUT") {
      await route.fulfill({ json: { draft_id: "d", transaction_date: DAY, current_section: "expenses", completed_sections: ["opening", "sales"], next: "expenses" } });
      return;
    }
    await route.fulfill({ json: { transaction_date: DAY, currency_code: "HKD", draft: DRAFT, methods: [], cash_sales: null } });
  });
  await enter(page, `${BASE}/reports/new/sale?transaction_date=${DAY}`);
  await page.getByRole("button", { name: "Save & Next" }).click();
  await expect(page).toHaveURL(new RegExp(`${BASE}/reports/new/expense\\?transaction_date=${DAY}$`));
  await expect(page.getByRole("heading", { name: "Expenses", exact: true })).toBeVisible();
});

test("the page reloads with no console error", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(e.message));
  await openWith(page, expensesAnswer());
  await page.reload();
  await expect(page.getByRole("heading", { name: "Expenses", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "General Expenses, HKD 1,200.50" }).click();
  await expect(page.getByRole("dialog", { name: "Expense Details" }).getByRole("img", { name: "milk.png" })).toBeVisible();
  expect(errors).toEqual([]);
});
