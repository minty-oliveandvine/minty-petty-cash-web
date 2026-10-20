// The Submitted page and a submitted report's own view (components/report/SubmittedPage.tsx and
// ReportView.tsx, Flask's ORIGINAL look), against a STUBBED Petty Cash API. Needs only
// `npm run dev`. Flask's pages are caught, so nothing leaves the app. Publishing is 12_publish.

import { expect, test, type Page, type Route } from "@playwright/test";

import { companyRef } from "./companyRef";
import { expectNoHorizontalScroll, mintModuleToken } from "./helpers";

const ENTITY = "3d65f186-5ba1-4bf7-a1b0-cc64a113eb5c";
const NAME = "E2E Petty Cash Shop";
const BASE = `/entity/${companyRef(ENTITY, NAME)}/petty-cash`;
const DAY = "2026-10-13";
const NEXT_DAY = "2026-10-14";
const API = "**/api/petty-cash/v1/companies/*";
const REPORT = "8a1d3c55-0f8e-4f4e-9d55-2c4b7d1e0a77";
const SUMMARY = `${BASE}/reports/${REPORT}/summary`;
const SUBMITTED = `${BASE}/reports/${REPORT}/submitted`;
/** POST /reports/<id>/share-link: `path` is what the link is built from; `url` (Flask's old page) is not used. */
const SHARE_PATH = "EPCS/13_Oct_2026/Ab3_-xYz0123456789abcdefghijklmn";
const SHARE_ANSWER = { url: `http://localhost:5001/Minty_Report/${SHARE_PATH}/`, path: SHARE_PATH, expires_at: "2026-11-12T12:00:00+00:00" };
/** The link the modal shows: this app's own public page, on the page's origin. */
const shareLink = (page: Page) => `${new URL(page.url()).origin}/share/${SHARE_PATH}`;

type Json = Record<string, unknown>;

const method = (name: string, value_name: string, type: string, amount: number) => ({ sale_id: value_name, name, value_name, type, amount });
const line = (id: string, item: string, amount: number) => ({ id, item, supplier: { id: "s", name: "Acme" }, remarks: "", amount, receipts: [] });

/** 30 days of history, the day itself (13 OCT, a Tuesday) last at 1,234.50. */
const HISTORY = Array.from({ length: 30 }, (_, i) => {
  const d = new Date(Date.UTC(2026, 8, 14 + i));
  return { date: d.toISOString().slice(0, 10), total: i === 29 ? 1234.5 : (i % 5) * 200 };
});

/** GET /reports/<id>: the 13 OCT report, latest, never in Xero; the cash row listed with the methods. */
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
    kpis: { total_sales: 1234.5, total_expenses: 128.5, cash_position: 1160.5 },
    sales: {
      methods: [
        method("Visa", "visa_sales", "electronic", 400),
        method("Cash", "cash_sales", "other", 600),
        method("Keeta", "keeta_sales", "delivery", 234.5),
      ],
      cash: 600,
      total: 1234.5,
      yesterday_total: 1000,
      history: HISTORY,
    },
    expenses: { lines: [line("e1", "Food & Drink", 78.5), line("e2", "Cleaning", 50)], total: 128.5 },
    cash: {
      opening_balance: 1000,
      cash_addition: 0,
      cash_addition_type: null,
      cash_sales: 600,
      expenses: 128.5,
      bank_deposit: 300,
      expected: 1171.5,
      counted: 1000.5,
      safe_box: 160,
      difference: { amount: -11, kind: "short", reason: "Paid a courier" },
    },
    closing_balance: 1160.5,
    permissions: { edit: true, delete: true, publish: true, share: true },
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
    submitted_at: "2026-10-13T12:00:00+00:00",
    submitted_by: "Tess",
    cash_counted: 1160.5,
    difference: { amount: -11, kind: "short", has_reason: true },
    xero: { publishing_status: "unpublished", published_at: null, xero_integrated: false, was_published: false },
    can_publish: true,
    is_today: false,
    next_day: NEXT_DAY,
    ...over,
  };
}

/** The dashboard after the report: 13 OCT submitted with no deposit, so the 14th starts with no check. */
const HOME = {
  server_today: NEXT_DAY,
  user_count: 1,
  currency_code: "HKD",
  latest: { date: DAY, closing_balance: 1160.5, deposit: 0, deposit_bank_name: "No deposit", deposit_bank_number: "", deposit_correction_missing_settings: [], can_correct_deposit: true, submitter_first_name: "Tess" },
  draft: null,
  draft_date: null,
  published: { [DAY]: { id: REPORT, closing_balance: 1160.5, bank_deposit: 0, xero_integrated: false, submitter_first_name: "Tess" } },
  today_has_report: false,
  today_is_latest_report: false,
  xero_settings: { complete: true, missing: [] },
  permissions: { read_only: false, correct_deposit: true },
};

const openingFor = (day: string) => ({
  transaction_date: day,
  currency_code: "HKD",
  draft: { id: "d", status: "draft", current_section: "opening", completed_sections: [], xero_integrated: false, publishing_status: "unpublished" },
  starting_cash_balance: 1160.5,
  yesterday_closing_balance: 1160.5,
  safebox_balance: 0,
  cash_addition: null,
  withdrawal: "personal",
});

type Handlers = {
  report?: Json;
  outcome?: Json;
  onReopen?: (route: Route) => Promise<void>;
  onDelete?: (route: Route) => Promise<void>;
  onShare?: (route: Route) => Promise<void>;
  /** An edit (PUT difference-reason / withdrawal, PATCH an expense line): answer it, or the edited report. */
  onEdit?: (route: Route) => Promise<void>;
};

/** Every call the two pages (and where they lead) make, stubbed; returns what was sent. */
async function stub(page: Page, h: Handlers = {}) {
  const sent = { reopen: 0, delete: 0, share: 0, edits: [] as { method: string; path: string; json: Json | null; form: string | null }[] };
  await page.route(`${API}/reports/${REPORT}`, async (route) => {
    if (route.request().method() === "DELETE") {
      sent.delete += 1;
      if (h.onDelete) await h.onDelete(route);
      else await route.fulfill({ json: { deleted: REPORT, transaction_date: DAY, next: "dashboard" } });
      return;
    }
    await route.fulfill({ json: h.report ?? reportAnswer() });
  });
  await page.route(`${API}/reports/${REPORT}/outcome`, (route) => route.fulfill({ json: h.outcome ?? outcomeAnswer() }));
  await page.route(`${API}/reports/${REPORT}/reopen`, async (route) => {
    sent.reopen += 1;
    if (h.onReopen) await h.onReopen(route);
    else await route.fulfill({ json: { report_id: REPORT, transaction_date: DAY, status: "draft", next: "opening" } });
  });
  await page.route(`${API}/reports/${REPORT}/share-link`, async (route) => {
    sent.share += 1;
    if (h.onShare) await h.onShare(route);
    else await route.fulfill({ json: SHARE_ANSWER });
  });
  await page.route(new RegExp(`/reports/${REPORT}/(difference-reason|withdrawal|expense-lines/[^/]+)$`), async (route) => {
    const req = route.request();
    const multipart = (req.headers()["content-type"] ?? "").startsWith("multipart/");
    sent.edits.push({
      method: req.method(),
      path: new URL(req.url()).pathname.replace(/^.*\/reports\/[^/]+\//, ""),
      json: multipart ? null : (req.postDataJSON() as Json),
      form: multipart ? (req.postDataBuffer()?.toString("latin1") ?? "") : null,
    });
    if (h.onEdit) await h.onEdit(route);
    else await route.fulfill({ json: h.report ?? reportAnswer() });
  });
  await page.route(`${API}/reports/opening**`, (route) => {
    const day = new URL(route.request().url()).searchParams.get("transaction_date") ?? DAY;
    return route.fulfill({ json: openingFor(day) });
  });
  await page.route(`${API}/home`, (route) => route.fulfill({ json: HOME }));
  await page.route("**/api/me/profile**", (route) => route.fulfill({ json: { user: { name: "Tess Tester", initials: "TT" } } }));
  // a Flask page address: nothing here opens one (Flask is a backend only), so a regression lands on this stub, never Flask
  await page.route(/\/entity\/[0-9a-f-]{36}\/petty-cash\/reports\//, (route) =>
    route.fulfill({ contentType: "text/html", body: "<title>Flask page</title><p>Flask page</p>" }),
  );
  return sent;
}

async function enter(page: Page, next: string) {
  const token = mintModuleToken({ secret: "stub", userId: "u", entityId: ENTITY, entityName: NAME });
  await page.goto(`/landing?${new URLSearchParams({ token, entity_id: ENTITY, entity_name: NAME, next })}`);
}

async function openView(page: Page, h: Handlers = {}) {
  const sent = await stub(page, h);
  await enter(page, SUMMARY);
  await expect(page.getByRole("heading", { name: "Summary", exact: true })).toBeVisible();
  return sent;
}

async function openSubmitted(page: Page, h: Handlers = {}) {
  const sent = await stub(page, h);
  await enter(page, SUBMITTED);
  await expect(page.getByRole("heading", { name: /Successfully!/ })).toBeVisible();
  return sent;
}

const toast = (page: Page, text: string | RegExp) => page.locator("[data-toast-type]").filter({ hasText: text });
const card = (page: Page, title: string) => page.locator("div.shadow-flask-sm").filter({ has: page.getByRole("heading", { name: title, exact: true }) });

// ---- the Submitted page ----

test("Submitted: the tick, the heading, Share, Publish to Xero, Back and the next day", async ({ page }) => {
  await openSubmitted(page);
  await expect(page.getByRole("heading", { name: "Report Submitted Successfully!" })).toBeVisible();
  await expect(page.getByText("Your daily petty cash report has been processed")).toBeVisible();
  await expect(page.getByText("Export Options")).toBeVisible();
  await expect(page.getByRole("button", { name: "Share" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Publish to Xero" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Back to Dashboard" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Continue to next day report" })).toBeVisible();
  await expectNoHorizontalScroll(page);
});

test("Submitted: a report in Xero says so and offers Republish; no publish right, no button", async ({ page }) => {
  await openSubmitted(page, { outcome: outcomeAnswer({ xero: { publishing_status: "completed", published_at: "2026-10-13T13:00:00+00:00", xero_integrated: true, was_published: true } }) });
  await expect(page.getByRole("heading", { name: "Report Published to Xero Successfully!" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Republish to Xero" })).toBeVisible();

  await page.unrouteAll({ behavior: "ignoreErrors" });
  await openSubmitted(page, { outcome: outcomeAnswer({ can_publish: false }) });
  await expect(page.getByRole("button", { name: /Publish to Xero/ })).toHaveCount(0);
});

test("Submitted: Back to Dashboard goes to the dashboard", async ({ page }) => {
  await openSubmitted(page);
  await page.getByRole("button", { name: "Back to Dashboard" }).click();
  await expect(page).toHaveURL(new RegExp(`${BASE}$`));
  await expect(page.getByRole("heading", { name: "Report Calendar" })).toBeVisible();
});

test("Submitted: Continue to next day report starts the next day from the dashboard", async ({ page }) => {
  await openSubmitted(page);
  await page.getByRole("button", { name: "Continue to next day report" }).click();
  await expect(page).toHaveURL(new RegExp(`${BASE}/reports/new/opening\\?transaction_date=${NEXT_DAY}$`));
  await expect(page.getByRole("heading", { name: "Opening" })).toBeVisible();
});

test("Submitted: Share makes the link, Copy copies it; a refusal says the API's sentence", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  let refuse = false;
  const sent = await openSubmitted(page, {
    onShare: (route) =>
      refuse ? route.fulfill({ status: 409, json: { error: "A draft can't be shared. Submit the day first." } }) : route.fulfill({ json: SHARE_ANSWER }),
  });
  await page.getByRole("button", { name: "Share" }).click();
  const dialog = page.getByRole("dialog", { name: "Share Report" });
  await expect(dialog.getByText("Share this link to allow others to view this report. The link will expire in 30 days.")).toBeVisible();
  await expect(dialog.getByRole("textbox", { name: "Share link" })).toHaveValue(shareLink(page));
  await dialog.getByRole("button", { name: "Copy" }).click();
  await expect(dialog.getByText("Link copied to clipboard!")).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(shareLink(page));
  await expectNoHorizontalScroll(page);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  expect(sent.share).toBe(1);

  refuse = true;
  await page.getByRole("button", { name: "Share" }).click();
  await expect(toast(page, "A draft can't be shared. Submit the day first.")).toBeVisible();
  await expect(dialog).toBeHidden();
});

test("Submitted: a reopened report has nothing submitted, so it opens the day's Ending step", async ({ page }) => {
  await stub(page, { outcome: outcomeAnswer({ status: "draft", submitted: false }) });
  await page.route(`${API}/reports/close**`, (route) => route.fulfill({ status: 409, json: { error: "I don't see a draft yet - let's start with the opening entry.", to: "opening" } }));
  await enter(page, SUBMITTED);
  await expect(page).toHaveURL(new RegExp(`${BASE}/reports/new/(ending|opening)\\?transaction_date=${DAY}$`));
});

// ---- a submitted report's view ----

test("View: the header, the summary from the report, and Share, Delete, Edit Report and Close", async ({ page }) => {
  await openView(page);
  // the header's date pill (the Sales History bars carry the day's date too)
  await expect(page.locator("span").filter({ hasText: /^13 OCT$/ })).toBeVisible();
  await expect(page.getByText("Submitted", { exact: true })).toBeVisible();
  await expect(page.getByText("Draft report", { exact: true })).toHaveCount(0);

  const sales = card(page, "Total Sales");
  await expect(sales.getByText("1,234.50", { exact: true })).toBeVisible();
  // the cash row is not counted as an electronic sale, nor listed as a method
  await expect(sales.getByText("400.00", { exact: true }).first()).toBeVisible();
  await expect(sales.getByText("600.00", { exact: true }).first()).toBeVisible();
  await expect(sales.locator("#sales_breakdown").getByText("Cash", { exact: true })).toHaveCount(0);
  // against yesterday (1,000.00) and the 30 days, as on Ending
  await expect(sales.getByText("Compared to Yesterday")).toBeVisible();
  await expect(sales.getByText("23.4%")).toBeVisible();
  const history = card(page, "Sales History");
  await expect(history).toBeVisible();
  await expect(history.locator("rect")).toHaveCount(30);
  await expect(history.locator("rect.fill-flask-red")).toHaveCount(1);

  const expenses = card(page, "Total Expenses");
  await expect(expenses.getByRole("img", { name: "Expenses by account, 128.50 in all" })).toBeVisible();
  await expect(expenses.getByRole("listitem")).toHaveText(["Food and Drink", "Cleaning"]);
  await expect(card(page, "Cash Balance").getByText("1,160.50", { exact: true })).toBeVisible();
  await expect(page.getByText("Cash Shortage: HKD11.00")).toBeVisible();
  await expect(page.getByText("Paid a courier")).toBeVisible();

  await expect(page.getByRole("button", { name: "Share" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Delete Report" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Edit Report" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Close" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Finish Daily Report/ })).toHaveCount(0);
  await expectNoHorizontalScroll(page);
});

for (const [badge, over] of [
  ["Submitted", {}],
  ["Published", { xero_integrated: true, publishing_status: "completed", was_published: true }],
  ["Publish failed", { publishing_status: "failed" }],
] as const) {
  test(`View: the header's date, initials and "${badge}" clear the back arrow and the person's initials`, async ({ page }) => {
    await openView(page, { report: reportAnswer(over) });
    const box = async (locator: ReturnType<Page["locator"]>) => {
      const b = await locator.boundingBox();
      if (!b) throw new Error("not drawn");
      return b;
    };
    const back = await box(page.getByRole("link", { name: "Back" }));
    const profile = await box(page.getByRole("button", { name: "My Profile" }));
    const date = await box(page.locator("span").filter({ hasText: /^13 OCT$/ }));
    const pill = await box(page.getByText(badge, { exact: true }));
    expect(date.x).toBeGreaterThanOrEqual(back.x + back.width);
    expect(pill.x + pill.width).toBeLessThanOrEqual(profile.x);
    await expectNoHorizontalScroll(page);
  });
}

test("View: an older report shows only what the person may do - Share and Close (to report history)", async ({ page }) => {
  await openView(page, {
    report: reportAnswer({ is_latest: false, xero_integrated: true, publishing_status: "completed", permissions: { edit: false, delete: false, publish: true, share: true } }),
  });
  await expect(page.getByText("Published", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Share" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Delete Report" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Edit Report" })).toHaveCount(0);
  await page.route(/\/api\/petty-cash\/v1\/companies\/[^/]+\/reports(\?.*)?$/, (route) =>
    route.fulfill({ json: { reports: [], page: 1, per_page: 10, total_pages: 1, total_count: 0, latest_report_id: null, currency_code: "HKD", can_publish: true } }),
  );
  await page.getByRole("button", { name: "Close" }).click();
  await expect(page).toHaveURL(new RegExp(`${BASE}/reports$`));
  await expect(page.getByRole("heading", { name: "Report Results" })).toBeVisible();
});

test("View: Edit Report reopens the day and opens its Opening step, in this app", async ({ page }) => {
  const sent = await openView(page);
  await page.getByRole("button", { name: "Edit Report" }).click();
  await expect(page).toHaveURL(new RegExp(`${BASE}/reports/new/opening\\?transaction_date=${DAY}$`));
  await expect(page.getByRole("heading", { name: "Opening" })).toBeVisible();
  await expect(toast(page, "Back to draft — opening it for you now.")).toBeVisible();
  expect(sent.reopen).toBe(1);
});

test("View: Edit Report on a report in Xero asks first (Flask's confirm); No sends nothing", async ({ page }) => {
  const sent = await openView(page, { report: reportAnswer({ was_published: true, xero_integrated: true, publishing_status: "completed" }) });
  const asked: string[] = [];
  page.once("dialog", (d) => {
    asked.push(d.message());
    void d.dismiss();
  });
  await page.getByRole("button", { name: "Edit Report" }).click();
  await expect.poll(() => asked.length).toBe(1);
  expect(asked[0]).toContain("This report was already published to Xero.");
  expect(sent.reopen).toBe(0);
  await expect(page.getByRole("heading", { name: "Summary", exact: true })).toBeVisible();

  page.once("dialog", (d) => void d.accept());
  await page.getByRole("button", { name: "Edit Report" }).click();
  await expect(page).toHaveURL(new RegExp(`${BASE}/reports/new/opening\\?transaction_date=${DAY}$`));
  expect(sent.reopen).toBe(1);
});

test("View: a refused Edit Report says the API's sentence and keeps the page", async ({ page }) => {
  const why = "Only the latest report can be edited. Edit the newest one first.";
  await openView(page, { onReopen: (route) => route.fulfill({ status: 400, json: { error: why } }) });
  await page.getByRole("button", { name: "Edit Report" }).click();
  await expect(toast(page, why)).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`${SUMMARY}$`));
  await expect(page.getByRole("button", { name: "Edit Report" })).toBeEnabled();
});

test("View: Delete asks in Flask's modal, then deletes and lands on the dashboard with the news", async ({ page }) => {
  const sent = await openView(page);
  await page.getByRole("button", { name: "Delete Report" }).click();
  const dialog = page.getByRole("dialog", { name: "Delete Report" });
  await expect(dialog.getByText("Are you sure you want to delete this report? This action cannot be undone.")).toBeVisible();
  await expect(dialog.getByText("It is in Xero")).toHaveCount(0);
  await expectNoHorizontalScroll(page);
  await dialog.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`${BASE}$`));
  await expect(page.getByRole("heading", { name: "Report Calendar" })).toBeVisible();
  await expect(toast(page, "That report's deleted.")).toBeVisible();
  expect(sent.delete).toBe(1);
});

test("View: Delete on a report in Xero warns first; Cancel sends nothing", async ({ page }) => {
  const sent = await openView(page, { report: reportAnswer({ was_published: true, xero_integrated: true, publishing_status: "completed" }) });
  await page.getByRole("button", { name: "Delete Report" }).click();
  const dialog = page.getByRole("dialog", { name: "Delete Report" });
  await expect(dialog.getByText("It is in Xero", { exact: true })).toBeVisible();
  await expect(
    dialog.getByText(
      "Deleting it here does not remove its entries in Xero, and publishing this day again adds a second copy. To change the report, use Edit report instead.",
    ),
  ).toBeVisible();
  await expectNoHorizontalScroll(page);
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toBeHidden();
  expect(sent.delete).toBe(0);

  await page.getByRole("button", { name: "Delete Report" }).click();
  await dialog.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(toast(page, "That report's deleted.")).toBeVisible();
  expect(sent.delete).toBe(1);
});

test("View: a refused Delete says the API's sentence and keeps the report", async ({ page }) => {
  const why = "This report is being published to Xero. Try again when it has finished.";
  await openView(page, { onDelete: (route) => route.fulfill({ status: 409, json: { error: why } }) });
  await page.getByRole("button", { name: "Delete Report" }).click();
  await page.getByRole("dialog", { name: "Delete Report" }).getByRole("button", { name: "Delete", exact: true }).click();
  await expect(toast(page, why)).toBeVisible();
  await expect(toast(page, "That report's deleted.")).toHaveCount(0);
  await expect(page).toHaveURL(new RegExp(`${SUMMARY}$`));
  await expect(page.getByRole("status").filter({ hasText: "Deleting report..." })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Delete Report" })).toBeEnabled();
});

test("View: Share opens Flask's Share Report with the link", async ({ page }) => {
  const sent = await openView(page);
  await page.getByRole("button", { name: "Share" }).click();
  const dialog = page.getByRole("dialog", { name: "Share Report" });
  await expect(dialog.getByRole("textbox", { name: "Share link" })).toHaveValue(shareLink(page));
  await dialog.getByRole("button", { name: "Close", exact: true }).last().click();
  await expect(dialog).toBeHidden();
  expect(sent.share).toBe(1);
});

test("Share: an answer without a usable path shows no link - the house sentence, the modal closed", async ({ page }) => {
  await openView(page, { onShare: (route) => route.fulfill({ json: { url: SHARE_ANSWER.url, expires_at: SHARE_ANSWER.expires_at } }) });
  await page.getByRole("button", { name: "Share" }).click();
  await expect(toast(page, "Something went wrong on our side. Please try again.")).toBeVisible();
  await expect(page.getByRole("dialog", { name: "Share Report" })).toBeHidden();
});

test("View: a report that isn't there says so", async ({ page }) => {
  await stub(page);
  await page.route(`${API}/reports/${REPORT}`, (route) => route.fulfill({ status: 404, json: { error: "Hmm, I couldn't find that report." } }));
  await enter(page, SUMMARY);
  await expect(toast(page, "Hmm, I couldn't find that report.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Summary", exact: true })).toHaveCount(0);
});

test("both pages reload with no console error", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(e.message));
  await openView(page);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Summary", exact: true })).toBeVisible();
  await page.goto(SUBMITTED);
  await expect(page.getByRole("heading", { name: "Report Submitted Successfully!" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Report Submitted Successfully!" })).toBeVisible();
  expect(errors).toEqual([]);
});

// ---- Edit Details: the three edits that move no balance (Flask's report_edit mode) ----

const OPTIONS = {
  suppliers: [
    { id: "s", name: "Acme" },
    { id: "s2", name: "Bright Cleaners" },
  ],
  accounts: [
    { id: "a1", code: "420", name: "Food & Drink" },
    { id: "a2", code: "430", name: "Cleaning" },
  ],
};
const editLine = (id: string, item: string, amount: number, account: Json) => ({ ...line(id, item, amount), remarks: "Lunch", account });

/** A report in Xero, with an addition to the drawer, that the person may edit the details of. */
function editable(over: Json = {}): Json {
  const base = reportAnswer();
  return reportAnswer({
    xero_integrated: true,
    publishing_status: "completed",
    was_published: true,
    status_label: "Published to Xero",
    expenses: { lines: [editLine("e1", "Food & Drink", 78.5, OPTIONS.accounts[0]), editLine("e2", "Cleaning", 50, OPTIONS.accounts[1])], total: 128.5 },
    cash: { ...(base.cash as Json), cash_addition: 200, cash_addition_type: "personal" },
    permissions: { edit: true, delete: true, publish: true, share: true, edit_details: true },
    options: OPTIONS,
    ...over,
  });
}

/** An edit's answer: the report out of Xero (Flask's `mark_diverged_from_xero`), with `cash` / `expenses` changed. */
function edited(over: Json): Json {
  return editable({ xero_integrated: false, status_label: "Submitted", ...over });
}

async function openDetails(page: Page, h: Handlers = {}) {
  const sent = await openView(page, { report: editable(), ...h });
  await page.getByRole("button", { name: "Edit Details" }).click();
  await expect(page.getByRole("button", { name: "Done editing" })).toBeVisible();
  return sent;
}

const reasonBox = (page: Page) => page.getByRole("textbox", { name: /^Reason/ });
const fulfil = (json: Json) => (route: Route) => route.fulfill({ json });
const dialog = (page: Page) => page.getByRole("dialog", { name: "Expense Details" });
const linesCard = (page: Page) => card(page, "Expenses");

test("Edit Details: hidden without edit_details - no button, no editors", async ({ page }) => {
  await openView(page);
  await expect(page.getByRole("button", { name: "Edit Details" })).toHaveCount(0);
  await expect(reasonBox(page)).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Addition to Cash Drawer" })).toHaveCount(0);
  await expect(page.getByText("Paid a courier")).toBeVisible();
});

test("Edit Details: no warning (Flask's had none), Close hides, Done editing leaves the mode", async ({ page }) => {
  let dialogs = 0;
  page.on("dialog", (d) => {
    dialogs += 1;
    void d.dismiss();
  });
  const sent = await openDetails(page);
  expect(dialogs).toBe(0);
  await expect(page.getByRole("button", { name: "Close", exact: true })).toHaveCount(0);
  await expect(reasonBox(page)).toHaveValue("Paid a courier");
  await expect(page.getByRole("heading", { name: "Addition to Cash Drawer" })).toBeVisible();
  await expect(linesCard(page).getByRole("button", { name: /Food & Drink/ })).toBeVisible();
  // no bin: a submitted report's lines are edited, not deleted
  await expect(page.getByRole("button", { name: "Delete expense" })).toHaveCount(0);
  await expectNoHorizontalScroll(page);
  await page.getByRole("button", { name: "Done editing" }).click();
  await expect(reasonBox(page)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Close", exact: true })).toBeVisible();
  expect(sent.edits).toEqual([]);
});

test("Edit Details: the reason saves in place, the page redraws and the report leaves Xero", async ({ page }) => {
  const base = reportAnswer();
  const answer = edited({
    cash: { ...(base.cash as Json), cash_addition: 200, cash_addition_type: "personal", difference: { amount: -11, kind: "short", reason: "Courier, paid from the till" } },
  });
  const sent = await openDetails(page, { onEdit: fulfil(answer) });
  await expect(page.getByText("Published", { exact: true })).toBeVisible();
  await reasonBox(page).fill("Courier, paid from the till");
  await page.getByRole("button", { name: "Save changes" }).first().click();
  await expect(toast(page, "Your discrepancy reason is saved.")).toBeVisible();
  expect(sent.edits).toEqual([{ method: "PUT", path: "difference-reason", json: { reason: "Courier, paid from the till" }, form: null }]);
  await expect(page.getByText("Submitted", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Done editing" }).click();
  await expect(page.getByText("Courier, paid from the till")).toBeVisible();
});

test("Edit Details: the reason is checked as it is typed - 300 characters, never emptied while short", async ({ page }) => {
  const sent = await openDetails(page);
  await reasonBox(page).fill("x".repeat(301));
  await expect(page.getByText("Keep the reason to 300 characters or fewer.")).toBeVisible();
  await reasonBox(page).fill("x".repeat(300));
  await expect(page.getByText("Keep the reason to 300 characters or fewer.")).toHaveCount(0);
  await reasonBox(page).fill("");
  await expect(page.getByText("The cash was short, so the reason is still needed. Add the reason to save it.")).toBeVisible();
  await expect(reasonBox(page)).toHaveAttribute("aria-invalid", "true");
  await page.getByRole("button", { name: "Save changes" }).first().click();
  await expect(reasonBox(page)).toBeFocused();
  expect(sent.edits).toEqual([]);
});

test("Edit Details: a refused reason shows the API's sentence at the field, and no success", async ({ page }) => {
  await openDetails(page, {
    onEdit: (route) => route.fulfill({ status: 409, json: { error: "Xero is still publishing this report. Wait until it finishes, then edit it." } }),
  });
  await reasonBox(page).fill("Recounted");
  await page.getByRole("button", { name: "Save changes" }).first().click();
  await expect(page.locator("#reason_message")).toHaveText("Xero is still publishing this report. Wait until it finishes, then edit it.");
  await expect(toast(page, "Your discrepancy reason is saved.")).toHaveCount(0);
  await expect(page.getByText("Published", { exact: true })).toBeVisible();
});

test("Edit Details: Withdrawal from saves Company Bank; a refusal is said under it", async ({ page }) => {
  const base = reportAnswer();
  let refuse = true;
  const sent = await openDetails(page, {
    onEdit: async (route) => {
      if (refuse) await route.fulfill({ status: 400, json: { error: "That withdrawal type doesn't look quite right to me." } });
      else await route.fulfill({ json: edited({ cash: { ...(base.cash as Json), cash_addition: 200, cash_addition_type: "company" } }) });
    },
  });
  const withdrawal = page.locator("form").filter({ has: page.getByRole("heading", { name: "Addition to Cash Drawer" }) });
  await expect(withdrawal.getByText("HKD200.00")).toBeVisible();
  await expect(withdrawal.getByRole("radio", { name: "Personal" })).toBeChecked();
  await withdrawal.getByRole("radio", { name: "Company Bank" }).check();
  await withdrawal.getByRole("button", { name: "Save changes" }).click();
  await expect(withdrawal.getByText("That withdrawal type doesn't look quite right to me.")).toBeVisible();
  await expect(toast(page, "Your withdrawal source is saved.")).toHaveCount(0);
  refuse = false;
  await withdrawal.getByRole("button", { name: "Save changes" }).click();
  await expect(toast(page, "Your withdrawal source is saved.")).toBeVisible();
  await expect(withdrawal.getByRole("radio", { name: "Company Bank" })).toBeChecked();
  expect(sent.edits.map((e) => e.json)).toEqual([{ withdrawal_type: "company" }, { withdrawal_type: "company" }]);
});

test("Edit Details: no addition to the drawer, no Withdrawal from", async ({ page }) => {
  const base = reportAnswer();
  await openView(page, { report: editable({ cash: { ...(base.cash as Json), cash_addition: 0 } }) });
  await page.getByRole("button", { name: "Edit Details" }).click();
  await expect(reasonBox(page)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Addition to Cash Drawer" })).toHaveCount(0);
});

test("Edit Details: a line sends only what changed; a new account renames it", async ({ page }) => {
  const answer = edited({
    expenses: { lines: [{ ...editLine("e1", "Cleaning", 78.5, OPTIONS.accounts[1]), remarks: "Team lunch" }, editLine("e2", "Cleaning", 50, OPTIONS.accounts[1])], total: 128.5 },
  });
  const sent = await openDetails(page, { onEdit: fulfil(answer) });
  await linesCard(page).getByRole("button", { name: /Food & Drink/ }).click();
  const modal = dialog(page);
  await expect(modal.getByText("HKD78.50")).toBeVisible();
  // the amount is never a field
  await expect(modal.getByRole("textbox")).toHaveCount(1);
  await expect(modal.getByLabel("Supplier")).toHaveValue("s");
  await expect(modal.getByLabel("Account Code")).toHaveValue("a1");
  await modal.getByLabel("Description").fill("Team lunch");
  await modal.getByLabel("Account Code").selectOption("a2");
  await expectNoHorizontalScroll(page);
  await modal.getByRole("button", { name: "Save changes" }).click();
  await expect(toast(page, "Expense updated successfully!")).toBeVisible();
  await expect(modal).toHaveCount(0);
  expect(sent.edits).toHaveLength(1);
  const { method: verb, path, form } = sent.edits[0];
  expect([verb, path]).toEqual(["PATCH", "expense-lines/e1"]);
  expect(form).toMatch(/name="remarks"\r\n\r\nTeam lunch\r\n/);
  expect(form).toMatch(/name="account_id"\r\n\r\na2\r\n/);
  expect(form).not.toContain('name="supplier_id"');
  expect(form).not.toContain('name="receipt"');
  // redrawn from the answer: the line is named after its new account, the report out of Xero
  await expect(linesCard(page).getByRole("button", { name: /^Cleaning/ })).toHaveCount(2);
  await expect(page.getByText("Submitted", { exact: true })).toBeVisible();
});

test("Edit Details: a receipt is checked before it is sent - one PDF, JPEG or PNG of 10 MB at most", async ({ page }) => {
  const sent = await openDetails(page);
  await linesCard(page).getByRole("button", { name: /Food & Drink/ }).click();
  const modal = dialog(page);
  const files = modal.locator('input[type="file"]');
  await files.setInputFiles({ name: "cat.gif", mimeType: "image/gif", buffer: Buffer.from("GIF89a") });
  await expect(modal.getByText("I can take PDF, JPEG, or PNG files.")).toBeVisible();
  await files.setInputFiles({ name: "big.png", mimeType: "image/png", buffer: Buffer.alloc(10 * 1024 * 1024 + 1) });
  await expect(modal.getByText("Files need to be under 10MB.")).toBeVisible();
  await modal.getByRole("button", { name: "Save changes" }).click();
  await expect(modal.getByText("Nothing has changed yet. Change a detail to save it.")).toBeVisible();
  expect(sent.edits).toEqual([]);
  await files.setInputFiles({ name: "receipt.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4") });
  await expect(modal.getByText("receipt.pdf")).toBeVisible();
  await expect(modal.getByText("Files need to be under 10MB.")).toHaveCount(0);
  await modal.getByRole("button", { name: "Save changes" }).click();
  await expect(toast(page, "Expense updated successfully!")).toBeVisible();
  const form = sent.edits[0].form ?? "";
  expect(form).toMatch(/name="receipt"; filename="receipt.pdf"/);
  expect(form).not.toContain('name="remarks"');
  expect(form).not.toContain('name="account_id"');
});

test("Edit Details: a description is checked as it is typed; nothing is sent past 300", async ({ page }) => {
  const sent = await openDetails(page);
  await linesCard(page).getByRole("button", { name: /Food & Drink/ }).click();
  const modal = dialog(page);
  await modal.getByLabel("Description").fill("y".repeat(301));
  await expect(modal.getByText("Keep the description to 300 characters or fewer.")).toBeVisible();
  await modal.getByRole("button", { name: "Save changes" }).click();
  await expect(modal.getByLabel("Description")).toBeFocused();
  expect(sent.edits).toEqual([]);
});

test("Edit Details: a line's refusal is said at its field; a 409 under Save", async ({ page }) => {
  let answer: { status: number; error: string } = { status: 422, error: "Choose an account code from the list." };
  await openDetails(page, { onEdit: (route) => route.fulfill({ status: answer.status, json: { error: answer.error } }) });
  await linesCard(page).getByRole("button", { name: /Food & Drink/ }).click();
  const modal = dialog(page);
  await modal.getByLabel("Account Code").selectOption("a2");
  await modal.getByRole("button", { name: "Save changes" }).click();
  await expect(modal.locator("#editExpAccount_message")).toHaveText("Choose an account code from the list.");
  answer = { status: 409, error: "This report is still a draft. Change it in the Daily Closing." };
  await modal.getByRole("button", { name: "Save changes" }).click();
  await expect(modal.locator("#editExp_message")).toHaveText("This report is still a draft. Change it in the Daily Closing.");
  await expect(toast(page, "Expense updated successfully!")).toHaveCount(0);
  await expect(modal).toBeVisible();
});

test("Edit Details: Escape keeps an editor with changes open (Flask's toast); Close discards them", async ({ page }) => {
  const sent = await openDetails(page);
  await linesCard(page).getByRole("button", { name: /Food & Drink/ }).click();
  const modal = dialog(page);
  await modal.getByLabel("Supplier").selectOption("s2");
  await page.keyboard.press("Escape");
  await expect(toast(page, "You have unsaved changes. Please save your changes first.")).toBeVisible();
  await expect(modal).toBeVisible();
  await modal.getByRole("button", { name: "Close", exact: true }).click();
  await expect(modal).toHaveCount(0);
  await linesCard(page).getByRole("button", { name: /Food & Drink/ }).click();
  await expect(dialog(page).getByLabel("Supplier")).toHaveValue("s");
  await page.keyboard.press("Escape");
  await expect(dialog(page)).toHaveCount(0);
  expect(sent.edits).toEqual([]);
});
