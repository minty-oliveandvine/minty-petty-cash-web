// Editing a submitted report's details that move no balance (Wave 2i, components/closing/ReportEdits.tsx)
// from the Daily Report, against a STUBBED Petty Cash API. Needs only `npm run dev`. Each edit
// answers the whole Daily Report, which the page redraws from; a refusal is the API's sentence
// inside the dialog, never a toast; a save that went through is a toast.

import { expect, test, type Page, type Route } from "@playwright/test";

import { companyRef } from "./companyRef";
import { expectNoHorizontalScroll, mintModuleToken } from "./helpers";

const ENTITY = "3d65f186-5ba1-4bf7-a1b0-cc64a113eb5c";
const NAME = "E2E Petty Cash Shop";
const BASE = `/entity/${companyRef(ENTITY, NAME)}/petty-cash`;
const DAY = "2026-10-13";
const REPORT = "5d6e7f80-0000-4000-8000-000000000002";
const REPORT_URL = `${BASE}/reports/${REPORT}/summary`;
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");

type Json = Record<string, unknown>;

const LINE = {
  id: "e1",
  item: "General Expenses",
  amount: 120.5,
  remarks: "Bags",
  supplier: { id: "c1", name: "ParknShop" },
  account: { id: "a1", code: "429", name: "General Expenses" },
  receipts: [{ id: "f1", name: "parknshop.png", mime_type: "image/png" }],
};

/** A submitted report that is NOT the latest (Edit report and Delete are off), its details editable. */
function reportAnswer(over: Json = {}, cash: Json = {}, line: Json = {}): Json {
  return {
    report_id: REPORT,
    transaction_date: DAY,
    currency_code: "HKD",
    company_name: NAME,
    status: "submitted",
    status_label: "Submitted",
    status_tone: "info",
    is_latest: false,
    submitted_at: "2026-10-13T18:12:00+08:00",
    submitted_by: "Olive Tan",
    published_at: null,
    publishing_status: "unpublished",
    xero_integrated: false,
    was_published: false,
    kpis: { total_sales: 1070.5, total_expenses: 120.5, cash_position: 760 },
    sales: { methods: [], cash: 1070.5, total: 1070.5 },
    expenses: { lines: [{ ...LINE, ...line }], total: 120.5 },
    cash: {
      opening_balance: 500,
      cash_addition: 100,
      cash_addition_type: "company",
      cash_sales: 1070.5,
      expenses: 120.5,
      bank_deposit: 0,
      expected: 780,
      counted: 760,
      safe_box: 0,
      difference: { amount: -20, kind: "short", reason: "Change given twice" },
      ...cash,
    },
    closing_balance: 760,
    permissions: { edit: false, delete: false, publish: true, share: true, edit_details: true },
    options: {
      suppliers: [
        { id: "c1", name: "ParknShop" },
        { id: "c2", name: "Wellcome" },
      ],
      accounts: [
        { id: "a1", code: "429", name: "General Expenses" },
        { id: "a2", code: "461", name: "Printing & Stationery" },
      ],
    },
    ...over,
  };
}

const PUBLISHED = {
  status_label: "Published to Xero",
  status_tone: "success",
  status: "published",
  publishing_status: "completed",
  xero_integrated: true,
  was_published: true,
  published_at: "2026-10-13T18:15:00+08:00",
};

/** A multipart body's text fields, and the file's name and type. */
function multipart(route: Route): Json {
  const raw = route.request().postDataBuffer()?.toString("latin1") ?? "";
  const fields: Json = {};
  for (const m of raw.matchAll(/name="([^"]+)"(?:; filename="([^"]*)"\r\nContent-Type: ([^\r]+))?\r\n\r\n([\s\S]*?)\r\n--/g)) {
    fields[m[1]] = m[2] !== undefined ? { filename: m[2], type: m[3] } : m[4];
  }
  return fields;
}

type Handler = (route: Route) => Promise<void>;
type Calls = { reasons: Json[]; withdrawals: Json[]; lines: Json[] };

async function stub(page: Page, answer: Json, { onReason, onWithdrawal, onLine }: { onReason?: Handler; onWithdrawal?: Handler; onLine?: Handler } = {}): Promise<Calls> {
  const calls: Calls = { reasons: [], withdrawals: [], lines: [] };
  const api = "**/api/petty-cash/v1/companies/*";
  await page.route(new RegExp(`/api/petty-cash/v1/companies/[^/]+/reports/${REPORT}$`), (route) => route.fulfill({ json: answer }));
  await page.route(`${api}/reports/${REPORT}/difference-reason`, async (route) => {
    expect(route.request().method()).toBe("PUT");
    calls.reasons.push(route.request().postDataJSON() as Json);
    if (onReason) await onReason(route);
  });
  await page.route(`${api}/reports/${REPORT}/withdrawal`, async (route) => {
    expect(route.request().method()).toBe("PUT");
    calls.withdrawals.push(route.request().postDataJSON() as Json);
    if (onWithdrawal) await onWithdrawal(route);
  });
  await page.route(`${api}/reports/${REPORT}/expense-lines/*`, async (route) => {
    expect(route.request().method()).toBe("PATCH");
    calls.lines.push(multipart(route));
    if (onLine) await onLine(route);
  });
  await page.route(`${api}/expense-lines/*/receipts/*`, (route) => route.fulfill({ status: 200, contentType: "image/png", body: PNG }));
  await page.route("**/api/me/profile**", (route) => route.fulfill({ json: { user: { name: "Tess Tester", initials: "TT" } } }));
  return calls;
}

async function openWith(page: Page, answer: Json, handlers: Parameters<typeof stub>[2] = {}): Promise<Calls> {
  const calls = await stub(page, answer, handlers);
  const token = mintModuleToken({ secret: "stub", userId: "u", entityId: ENTITY, entityName: NAME });
  await page.goto(`/landing?${new URLSearchParams({ token, entity_id: ENTITY, entity_name: NAME, next: REPORT_URL })}`);
  // The dev server compiles on first arrival, slowly under two workers: a longer first wait.
  await expect(page.getByRole("heading", { level: 1, name: "Daily Report" })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("status", { name: "Loading" })).toHaveCount(0);
  return calls;
}

async function open(page: Page, title: string) {
  const summary = page.locator("summary").filter({ hasText: new RegExp(`^${title.replace(/[()]/g, "\\$&")}`) });
  await summary.click();
  return page.locator("details").filter({ has: summary });
}

const toast = (page: Page) => page.locator("[data-toast-type=success]");
const pill = (page: Page) => page.locator("main h1").locator("..");
const editLine = (page: Page) => page.getByRole("button", { name: /^Edit expense General Expenses/ });
const lineDrawer = (page: Page) => page.getByRole("dialog", { name: "Edit expense" });

test("without edit_details nothing can be edited", async ({ page }) => {
  await openWith(page, reportAnswer({ permissions: { edit: true, delete: true, publish: true, share: true, edit_details: false }, options: null }));
  await expect(page.getByText("Cash was HKD20.00 short")).toBeVisible();
  await expect(page.getByRole("button", { name: "Edit reason" })).toHaveCount(0);
  await open(page, "Expenses (1)");
  await expect(editLine(page)).toHaveCount(0);
  await open(page, "Cash");
  await expect(page.getByRole("button", { name: "Edit where the cash came from" })).toHaveCount(0);
});

test("an older report's details are editable, with no Edit report", async ({ page }) => {
  await openWith(page, reportAnswer());
  await expect(page.getByRole("button", { name: "Edit reason" })).toBeVisible();
  await expect(page.getByRole("button", { name: "More report actions" })).toHaveCount(0);
  await open(page, "Expenses (1)");
  await expect(editLine(page)).toBeVisible();
  await open(page, "Cash");
  await expect(page.getByRole("button", { name: "Edit where the cash came from" })).toBeVisible();
});

test("no difference and no cash added: neither is offered", async ({ page }) => {
  await openWith(page, reportAnswer({}, { cash_addition: 0, difference: { amount: 0, kind: "none", reason: "" } }));
  await expect(page.getByRole("button", { name: "Edit reason" })).toHaveCount(0);
  await open(page, "Cash");
  await expect(page.getByRole("button", { name: "Edit where the cash came from" })).toHaveCount(0);
});

test("the reason is saved, the page redraws from the answer and a toast says so", async ({ page }) => {
  const calls = await openWith(page, reportAnswer(), {
    onReason: (route) => route.fulfill({ json: reportAnswer({}, { difference: { amount: -20, kind: "short", reason: "Float swap" } }) }),
  });
  await page.getByRole("button", { name: "Edit reason" }).click();
  const dialog = page.getByRole("dialog", { name: "Edit the reason" });
  await expect(dialog).toContainText("Cash was HKD20.00 short.");
  const field = dialog.getByRole("textbox", { name: /Reason for the difference/ });
  await expect(field).toBeFocused();
  await expect(field).toHaveAttribute("aria-required", "true");
  await expect(field).toHaveValue("Change given twice");
  await expect(dialog.getByText("It will need publishing to Xero again")).toHaveCount(0);
  await field.fill("Float swap");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog).toHaveCount(0);
  expect(calls.reasons).toEqual([{ reason: "Float swap" }]);
  await expect(page.getByText("Note: Float swap")).toBeVisible();
  await expect(toast(page)).toContainText("The reason is saved.");
  await expectNoHorizontalScroll(page);
});

test("the reason is checked as typed and never sent while it is wrong", async ({ page }) => {
  const calls = await openWith(page, reportAnswer());
  await page.getByRole("button", { name: "Edit reason" }).click();
  const dialog = page.getByRole("dialog", { name: "Edit the reason" });
  const field = dialog.getByRole("textbox", { name: /Reason for the difference/ });
  await field.fill("x".repeat(301));
  await expect(dialog.getByText("The reason is 301 characters. Shorten it to 300 characters or fewer.")).toBeVisible();
  await expect(field).toHaveAttribute("aria-invalid", "true");
  await field.fill("");
  await expect(dialog.getByText("The cash was short, so the reason is still needed. Add the reason to save it.")).toBeVisible();
  // Enter in the field is a new line; Save is refused in place.
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(field).toBeFocused();
  await expect(dialog).toBeVisible();
  expect(calls.reasons).toEqual([]);
  // Nothing changed: Save sends nothing.
  await field.fill("Change given twice");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog).toHaveCount(0);
  expect(calls.reasons).toEqual([]);
  await expect(toast(page)).toHaveCount(0);
});

test("a refused reason shows the API's sentence in the dialog, never a toast", async ({ page }) => {
  const calls = await openWith(page, reportAnswer(), {
    onReason: (route) => route.fulfill({ status: 409, json: { error: "Xero is still publishing this report. Wait until it finishes, then edit it." } }),
  });
  await page.getByRole("button", { name: "Edit reason" }).click();
  const dialog = page.getByRole("dialog", { name: "Edit the reason" });
  await dialog.getByRole("textbox").fill("Float swap");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog.getByText("Xero is still publishing this report. Wait until it finishes, then edit it.")).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Save" })).toBeEnabled();
  expect(calls.reasons).toHaveLength(1);
  await expect(toast(page)).toHaveCount(0);
  await expect(page.getByText("Note: Change given twice")).toBeVisible();
});

test("a report in Xero says first it will need publishing again, and comes back Submitted", async ({ page }) => {
  await openWith(page, reportAnswer(PUBLISHED), {
    onReason: (route) =>
      route.fulfill({ json: reportAnswer({ was_published: true, publishing_status: "completed", published_at: PUBLISHED.published_at }, { difference: { amount: -20, kind: "short", reason: "Float swap" } }) }),
  });
  await expect(pill(page)).toContainText("Published to Xero");
  await page.getByRole("button", { name: "Edit reason" }).click();
  const dialog = page.getByRole("dialog", { name: "Edit the reason" });
  await expect(dialog.getByText("It will need publishing to Xero again")).toBeVisible();
  await expect(dialog).toContainText("Saving takes this report out of Xero. Publish it again afterwards.");
  await dialog.getByRole("textbox").fill("Float swap");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(pill(page)).toContainText("Submitted");
  await expect(page.getByRole("link", { name: "Publish to Xero" })).toBeVisible();
});

test("where the cash came from is saved; a refusal stays in the dialog", async ({ page }) => {
  let refuse = true;
  const calls = await openWith(page, reportAnswer(), {
    onWithdrawal: (route) =>
      refuse
        ? route.fulfill({ status: 400, json: { error: "That withdrawal type doesn't look quite right to me." } })
        : route.fulfill({ json: reportAnswer({}, { cash_addition_type: "personal" }) }),
  });
  const cash = await open(page, "Cash");
  await expect(cash).toContainText("Company bank");
  await page.getByRole("button", { name: "Edit where the cash came from" }).click();
  const dialog = page.getByRole("dialog", { name: "Where the cash came from" });
  await expect(dialog).toContainText("HKD100.00 was added to the drawer. The amount stays as it is.");
  await expect(dialog.getByRole("radio", { name: "Company bank" })).toBeChecked();
  await dialog.getByText("Personal").click();
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog.getByText("That withdrawal type doesn't look quite right to me.")).toBeVisible();
  await expect(toast(page)).toHaveCount(0);
  refuse = false;
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog).toHaveCount(0);
  expect(calls.withdrawals).toEqual([{ withdrawal_type: "personal" }, { withdrawal_type: "personal" }]);
  await expect(toast(page)).toContainText("Where the cash came from is saved.");
  await expect(page.locator("details").filter({ hasText: "Starting cash balance" })).toContainText("Personal");
});

test("an expense line sends only what changed; a new account renames it", async ({ page }) => {
  const calls = await openWith(page, reportAnswer(), {
    onLine: (route) =>
      route.fulfill({
        json: reportAnswer({}, {}, { item: "Printing & Stationery", remarks: "Paper bags", account: { id: "a2", code: "461", name: "Printing & Stationery" } }),
      }),
  });
  await open(page, "Expenses (1)");
  await editLine(page).click();
  const drawer = lineDrawer(page);
  await expect(drawer).toContainText("HKD120.50");
  await expect(drawer.getByText("The amount can't be changed here.")).toBeVisible();
  await expect(drawer.getByRole("textbox", { name: /Amount/ })).toHaveCount(0);
  await expect(drawer.getByRole("combobox", { name: /Supplier/ })).toHaveValue("ParknShop");
  await drawer.getByRole("textbox", { name: "Description" }).fill("Paper bags");
  await drawer.getByRole("combobox", { name: /Account/ }).selectOption("a2");
  await drawer.getByRole("button", { name: "Save" }).click();
  await expect(drawer).toHaveCount(0);
  expect(calls.lines).toEqual([{ remarks: "Paper bags", account_id: "a2" }]);
  await expect(toast(page)).toContainText("The expense is saved.");
  await expect(page.getByText("Printing & Stationery").first()).toBeVisible();
  await expect(page.getByText("Account 461")).toBeVisible();
  await expectNoHorizontalScroll(page);
});

test("a new supplier and a new receipt; a wrong file is said the moment it is picked", async ({ page }) => {
  const calls = await openWith(page, reportAnswer(), {
    onLine: (route) => route.fulfill({ json: reportAnswer({}, {}, { supplier: { id: "c2", name: "Wellcome" } }) }),
  });
  await open(page, "Expenses (1)");
  await editLine(page).click();
  const drawer = lineDrawer(page);
  const file = drawer.locator("input[type=file]:not([capture])");
  await file.setInputFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("hi") });
  await expect(drawer.getByText("notes.txt isn't a PDF, JPEG or PNG. Attach the receipt as one of those.")).toBeVisible();
  await file.setInputFiles({ name: "huge.pdf", mimeType: "application/pdf", buffer: Buffer.alloc(10 * 1024 * 1024 + 1) });
  await expect(drawer.getByText("huge.pdf is 10.0 MB. Attach a file of 10 MB or less.")).toBeVisible();
  await file.setInputFiles({ name: "new.png", mimeType: "image/png", buffer: PNG });
  await expect(drawer.getByText("Saved receipt, replaced when you save")).toBeVisible();
  const supplier = drawer.getByRole("combobox", { name: /Supplier/ });
  await supplier.fill("Well");
  await page.getByRole("option", { name: "Wellcome" }).click();
  await drawer.getByRole("button", { name: "Save" }).click();
  await expect(drawer).toHaveCount(0);
  expect(calls.lines).toEqual([{ supplier_id: "c2", receipt: { filename: "new.png", type: "image/png" } }]);
  await expect(page.getByText("Wellcome · Account 429")).toBeVisible();
});

test("an expense line is checked as typed; a refusal shows inside the drawer", async ({ page }) => {
  const calls = await openWith(page, reportAnswer(), {
    onLine: (route) => route.fulfill({ status: 422, json: { error: "Choose an account code from the list." } }),
  });
  await open(page, "Expenses (1)");
  await editLine(page).click();
  const drawer = lineDrawer(page);
  const supplier = drawer.getByRole("combobox", { name: /Supplier/ });
  await expect(supplier).toHaveAttribute("aria-required", "true");
  await supplier.fill("");
  await expect(drawer.getByText("The supplier is still empty. Choose a supplier from the list to save it.")).toBeVisible();
  await drawer.getByRole("textbox", { name: "Description" }).fill("y".repeat(301));
  await expect(drawer.getByText("The description is 301 characters. Shorten it to 300 characters or fewer.")).toBeVisible();
  // Two problems on a refused Save: the summary takes the focus; nothing is sent.
  await drawer.getByRole("button", { name: "Save" }).click();
  const summary = drawer.getByRole("alert").filter({ hasText: "2 details need a look before this can be sent." });
  await expect(summary).toBeFocused();
  await expect(summary.getByRole("link")).toHaveCount(2);
  expect(calls.lines).toEqual([]);
  await supplier.fill("ParknShop");
  await supplier.blur();
  await drawer.getByRole("textbox", { name: "Description" }).fill("Bags and tape");
  await drawer.getByRole("button", { name: "Save" }).click();
  await expect(drawer.getByText("Choose an account code from the list.")).toBeVisible();
  expect(calls.lines).toEqual([{ remarks: "Bags and tape" }]);
  await expect(toast(page)).toHaveCount(0);
  // Closing with changes asks first.
  await drawer.getByRole("button", { name: "Cancel" }).click();
  await expect(drawer.getByText("These changes aren't saved yet")).toBeVisible();
  await drawer.getByRole("button", { name: "Discard them" }).click();
  await expect(drawer).toHaveCount(0);
});

test("an expense line with nothing changed sends nothing", async ({ page }) => {
  const calls = await openWith(page, reportAnswer());
  await open(page, "Expenses (1)");
  await editLine(page).click();
  await lineDrawer(page).getByRole("button", { name: "Save" }).click();
  await expect(lineDrawer(page)).toHaveCount(0);
  expect(calls.lines).toEqual([]);
});
