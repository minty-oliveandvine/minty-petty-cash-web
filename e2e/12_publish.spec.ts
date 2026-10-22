// Publish to Xero, in the app (Wave 2j; components/closing/Publish.tsx) - from the Daily Report, the
// outcome page and a report history row - against a STUBBED Petty Cash API. Nothing reaches Xero:
// `POST /reports/<id>/publish` and `GET /reports/<id>/publishing-status` are answered here, and
// The reconnect link's hand-off (Flask's /handoff/minty-web, to minty-web's Entity & Integration)
// is caught - no screen links a Flask page. Needs only `npm run dev`.

import { expect, test, type Page, type Route } from "@playwright/test";

import { companyRef } from "@minty/shared/e2e";
import { expectNoHorizontalScroll, mintModuleToken } from "./helpers";

const ENTITY = "3d65f186-5ba1-4bf7-a1b0-cc64a113eb5c";
const NAME = "E2E Petty Cash Shop";
const BASE = `/entity/${companyRef(ENTITY, NAME)}/petty-cash`;
const DAY = "2026-10-13";
const REPORT = "5d6e7f80-0000-4000-8000-000000000001";
const REPORT_URL = `${BASE}/reports/${REPORT}/summary`;
const OUTCOME_URL = `${BASE}/reports/${REPORT}/submitted`;
const HISTORY_URL = `${BASE}/reports`;
/** lib/publish.ts's POLL_MS and POLL_CAP. */
const POLL_MS = 3000;
const POLL_CAP = 40;
const TOAST = "The Daily Report for Tue 13 Oct 2026 is published to Xero.";
const WARNING = "Publishing again adds new entries in Xero. The ones there now are not removed: void them in Xero by hand, or the day is counted twice.";

// The Xero time is on the device's clock: Hong Kong's, wherever this runs.
test.use({ timezoneId: "Asia/Hong_Kong" });

type Json = Record<string, unknown>;

function reportAnswer(over: Json = {}): Json {
  return {
    report_id: REPORT, transaction_date: DAY, currency_code: "HKD", company_name: NAME, status: "submitted", status_label: "Submitted", status_tone: "info",
    is_latest: true, submitted_at: "2026-10-13T18:12:00+08:00", submitted_by: "Olive Tan", published_at: null, publishing_status: "unpublished",
    xero_integrated: false, was_published: false,
    kpis: { total_sales: 1070.5, total_expenses: 240.5, cash_position: 760 }, sales: { methods: [], cash: 1070.5, total: 1070.5 }, expenses: { lines: [], total: 240.5 },
    cash: { opening_balance: 500, cash_addition: 0, cash_addition_type: null, cash_sales: 1070.5, expenses: 240.5, bank_deposit: 0, expected: 760, counted: 760, safe_box: 0, difference: { amount: 0, kind: "none", reason: "" } },
    closing_balance: 760, permissions: { edit: true, delete: true, publish: true, share: true, edit_details: false }, options: null,
    ...over,
  };
}

function outcomeAnswer(over: Json = {}): Json {
  return {
    report_id: REPORT, transaction_date: DAY, currency_code: "HKD", company_name: NAME, status: "submitted", submitted: true,
    submitted_at: "2026-10-13T10:12:00+00:00", submitted_by: "Olive", total_sales: 1070.5, total_expenses: 240.5, cash_counted: 760, difference: { amount: 0, kind: "none", has_reason: false },
    xero: { publishing_status: "unpublished", published_at: null, xero_integrated: false, was_published: false }, can_publish: true, is_today: false, next_day: "2026-10-14",
    ...over,
  };
}

function historyRow(over: Json = {}): Json {
  return {
    id: REPORT, transaction_date: DAY, status: "submitted", status_label: "Submitted", status_tone: "info", current_section: "ending",
    total_sales: 1070.5, total_expenses: 240.5, submitted_by: "Olive", submitted_at: "2026-10-13T18:12:00+08:00", published_at: null,
    publishing_status: "unpublished", was_published: false, publish_reasons: [], permissions: { edit: true, delete: true },
    ...over,
  };
}

const historyPage = (rows: Json[]): Json => ({
  reports: rows, page: 1, per_page: 10, total_pages: 1, total_count: rows.length, latest_report_id: REPORT, currency_code: "HKD", can_publish: true,
});

function status(over: Json = {}): Json {
  return {
    report_id: REPORT, publishing_status: "publishing", status_label: "Publishing to Xero", status_tone: "info",
    xero_integrated: false, was_published: false, published_at: null, reasons: [],
    ...over,
  };
}

const UNPUBLISHED = status({ publishing_status: "unpublished", status_label: "Submitted" });
const PUBLISHED = status({ publishing_status: "completed", status_label: "Published to Xero", status_tone: "success", xero_integrated: true, was_published: true, published_at: "2026-10-13T18:15:00+08:00" });
const REASONS = [
  { text: "Account 429 is archived in Xero.", resolved: false },
  { text: "ParknShop is not a contact in Xero.", resolved: true },
];
const FAILED = status({ publishing_status: "failed", status_label: "Publish failed", status_tone: "danger", was_published: true, reasons: REASONS });
const IN_XERO = { status_label: "Published to Xero", status_tone: "success", publishing_status: "completed", xero_integrated: true, was_published: true, published_at: "2026-10-13T18:15:00+08:00" };

type Setup = {
  report?: Json;
  outcome?: Json;
  history?: Json;
  /** The start's answer; a 202 by default. */
  onPublish?: (route: Route) => Promise<void>;
  /** The status before any publish was sent here (a page arriving mid-publish reads it). */
  before?: Json;
  /** The status reads after the publish, in order; the last one repeats. */
  after?: Json[];
};

type Calls = { publishes: number; reads: number };

async function stub(page: Page, setup: Setup = {}): Promise<Calls> {
  const calls: Calls = { publishes: 0, reads: 0 };
  const api = "**/api/petty-cash/v1/companies/*";
  const after = [...(setup.after ?? [PUBLISHED])];
  await page.route(new RegExp(`/api/petty-cash/v1/companies/[^/]+/reports/${REPORT}$`), (route) => route.fulfill({ json: setup.report ?? reportAnswer() }));
  await page.route(`${api}/reports/*/outcome`, (route) => route.fulfill({ json: setup.outcome ?? outcomeAnswer() }));
  await page.route(/\/api\/petty-cash\/v1\/companies\/[^/]+\/reports(\?.*)?$/, (route) => route.fulfill({ json: setup.history ?? historyPage([historyRow()]) }));
  await page.route(`${api}/reports/*/publish`, async (route) => {
    expect(route.request().method()).toBe("POST");
    calls.publishes += 1;
    if (setup.onPublish) await setup.onPublish(route);
    else await route.fulfill({ status: 202, json: { publishing_status: "publishing", message: "Publishing to Xero. This can take a few minutes." } });
  });
  await page.route(`${api}/reports/*/publishing-status`, (route) => {
    calls.reads += 1;
    if (!calls.publishes) return route.fulfill({ json: setup.before ?? UNPUBLISHED });
    const next = after.length > 1 ? after.shift()! : after[0];
    return route.fulfill({ json: next });
  });
  await page.route("**/api/me/profile**", (route) => route.fulfill({ json: { user: { name: "Tess Tester", initials: "TT" } } }));
  // Flask's hand-off to minty-web (the reconnect link): caught.
  await page.route(/\/handoff\/minty-web\?/, (route) => route.fulfill({ contentType: "text/html", body: "<title>Hand-off</title><p>minty-web hand-off</p>" }));
  return calls;
}

async function arrive(page: Page, next: string) {
  const token = mintModuleToken({ secret: "stub", userId: "u", entityId: ENTITY, entityName: NAME });
  await page.goto(`/landing?${new URLSearchParams({ token, entity_id: ENTITY, entity_name: NAME, next })}`);
}

async function openReport(page: Page, setup: Setup = {}): Promise<Calls> {
  const calls = await stub(page, setup);
  await arrive(page, REPORT_URL);
  await expect(page.getByRole("heading", { level: 1, name: "Daily Report" })).toBeVisible();
  await expect(page.getByRole("status", { name: "Loading" })).toHaveCount(0);
  return calls;
}

const pill = (page: Page, label: string) => page.locator("main [data-tone]").filter({ hasText: label }).first();
const live = (page: Page) => page.locator('p[aria-live="polite"]');
const toast = (page: Page) => page.locator("[data-toast-type]");
const confirmDialog = (page: Page, name: string) => page.getByRole("dialog", { name }).or(page.getByRole("alertdialog", { name }));

async function chooseMore(page: Page, trigger: string, item: string) {
  await page.getByRole("button", { name: trigger }).click();
  await page.getByRole("menu", { name: trigger }).getByRole("menuitem", { name: item }).click();
}

test("Daily Report: Publish to Xero asks first, then the pill follows the API's status to Published, with a toast", async ({ page }) => {
  const calls = await openReport(page, { after: [status(), PUBLISHED] });
  await expect(page.getByText("Not in Xero yet")).toBeVisible();
  await page.getByRole("button", { name: "Publish to Xero" }).click();

  const dialog = page.getByRole("dialog", { name: "Publish to Xero?" });
  await expect(dialog).toContainText("The day's sales, expenses with their receipts and the bank deposit are sent to this company's Xero organisation.");
  // never been to Xero: no second-copy warning
  await expect(dialog.getByText("Xero gets a second copy")).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: "Cancel" })).toBeFocused();
  expect(calls.publishes).toBe(0);
  await dialog.getByRole("button", { name: "Publish to Xero" }).click();

  await expect(dialog).toHaveCount(0);
  expect(calls.publishes).toBe(1);
  // the 15.12 partial-success Info line, and the API's own pill
  await expect(page.getByRole("status").filter({ hasText: "Publishing to Xero" }).filter({ hasText: "You can leave this page" })).toHaveAttribute("data-tone", "info");
  await expect(pill(page, "Publishing to Xero")).toHaveAttribute("data-tone", "info");
  await expect(live(page)).toHaveText("Publishing to Xero.");
  // nothing to publish while Xero works on it
  await expect(page.getByRole("button", { name: "Publish to Xero" })).toHaveCount(0);

  await expect(pill(page, "Published to Xero")).toHaveAttribute("data-tone", "success");
  await expect(toast(page)).toContainText(TOAST);
  await expect(live(page)).toHaveText("Published to Xero.");
  await expect(page.getByText("Sent to Xero · Tue 13 Oct 2026, 6:15 pm")).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "You can leave this page" })).toHaveCount(0);
  expect(calls.reads).toBe(2);
  // in Xero now: publishing again is under More
  await expect(page.getByRole("button", { name: "Publish to Xero" })).toHaveCount(0);
  await page.getByRole("button", { name: "More report actions" }).click();
  await expect(page.getByRole("menuitem", { name: "Publish to Xero again" })).toBeVisible();
  await expectNoHorizontalScroll(page);
});

test("Daily Report: a failed publish is a Danger alert with its reasons (resolved in words) and Try again", async ({ page }) => {
  const calls = await openReport(page, { after: [status(), FAILED] });
  await page.getByRole("button", { name: "Publish to Xero" }).click();
  await page.getByRole("dialog", { name: "Publish to Xero?" }).getByRole("button", { name: "Publish to Xero" }).click();

  const alert = page.getByRole("alert").filter({ hasText: "Publishing to Xero failed" });
  await expect(alert).toHaveAttribute("data-tone", "danger");
  await expect(alert).toContainText("Account 429 is archived in Xero.");
  await expect(alert.getByRole("listitem").filter({ hasText: "ParknShop is not a contact in Xero." })).toContainText("· Resolved");
  await expect(alert.getByRole("listitem").filter({ hasText: "Account 429" })).not.toContainText("Resolved");
  await expect(pill(page, "Publish failed")).toHaveAttribute("data-tone", "danger");
  await expect(live(page)).toHaveText("Publishing to Xero failed.");
  await expect(page.getByText("Xero publish failed")).toBeVisible();
  await expect(toast(page)).toHaveCount(0);
  expect(calls.reads).toBe(2);

  // Try again asks again - and part of it reached Xero (was_published), so it warns
  await alert.getByRole("button", { name: "Try again" }).click();
  const again = page.getByRole("alertdialog", { name: "Publish to Xero?" });
  await expect(again.getByRole("status").filter({ hasText: "Xero gets a second copy" })).toContainText(WARNING);
  await again.getByRole("button", { name: "Cancel" }).click();
  await expect(again).toHaveCount(0);
  expect(calls.publishes).toBe(1);
  await expectNoHorizontalScroll(page);
});

test("Daily Report: arriving mid-publish watches it; arriving on a failed one reads its reasons", async ({ page }) => {
  const calls = await openReport(page, {
    report: reportAnswer({ publishing_status: "publishing", status_label: "Publishing to Xero" }),
    before: status(),
  });
  await expect(page.getByRole("status").filter({ hasText: "You can leave this page" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Publish to Xero" })).toHaveCount(0);
  await expect.poll(() => calls.reads).toBeGreaterThan(0);

  await page.unroute("**/api/petty-cash/v1/companies/*/reports/*/publishing-status");
  await page.route("**/api/petty-cash/v1/companies/*/reports/*/publishing-status", (route) => route.fulfill({ json: FAILED }));
  await page.unroute(new RegExp(`/api/petty-cash/v1/companies/[^/]+/reports/${REPORT}$`));
  await page.route(new RegExp(`/api/petty-cash/v1/companies/[^/]+/reports/${REPORT}$`), (route) =>
    route.fulfill({ json: reportAnswer({ publishing_status: "failed", status_label: "Publish failed", status_tone: "danger", was_published: true }) }),
  );
  await page.reload();
  const alert = page.getByRole("alert").filter({ hasText: "Publishing to Xero failed" });
  await expect(alert).toContainText("Account 429 is archived in Xero.");
  await expect(alert.getByRole("button", { name: "Try again" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Publish to Xero" })).toBeVisible();
});

test("a refused start shows the API's sentence inside the dialog, which stays open with Publish back", async ({ page }) => {
  let refusal = { status: 400, json: { error: "Xero settings incomplete. Please configure entity settings first." } as Json };
  const calls = await openReport(page, { onPublish: (route) => route.fulfill(refusal) });
  await page.getByRole("button", { name: "Publish to Xero" }).click();
  const dialog = page.getByRole("dialog", { name: "Publish to Xero?" });
  const publish = dialog.getByRole("button", { name: "Publish to Xero" });

  const refusals: { status: number; error: string }[] = [
    { status: 400, error: "Xero settings incomplete. Please configure entity settings first." },
    { status: 400, error: "Account 090 (Bank) is a system account in Xero, so it can't be on an expense. Choose another account for Petty cash float, then publish again." },
    { status: 409, error: "This report is still a draft. Submit the day before publishing it." },
    { status: 409, error: "Publishing already in progress. Please wait..." },
    { status: 403, error: "You don't have permission to publish reports for this company." },
    { status: 404, error: "Hmm, I couldn't find that report." },
  ];
  for (const [i, { status: code, error }] of refusals.entries()) {
    refusal = { status: code, json: { error } };
    await publish.click();
    await expect(dialog.getByRole("alert")).toContainText(error);
    await expect(publish).toBeEnabled();
    expect(calls.publishes).toBe(i + 1);
    // no reconnect link unless the API asks for it
    await expect(dialog.getByRole("link", { name: "Go to Xero settings" })).toHaveCount(0);
  }
  // nothing started: no status read, no Info line, the pill as it was
  expect(calls.reads).toBe(0);
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("status").filter({ hasText: "You can leave this page" })).toHaveCount(0);
  await expect(pill(page, "Submitted")).toHaveAttribute("data-tone", "info");
  await expect(toast(page)).toHaveCount(0);
});

const INTEGRATION = `/entity/${companyRef(ENTITY, NAME)}/settings/integration`;
const RECONNECT_WHY = "I've lost access to your Xero account. Mind reconnecting it in Settings?";
const reconnecting = { onPublish: (route: Route) => route.fulfill({ status: 400, json: { error: RECONNECT_WHY, reconnect: true } }) };

/** The refused start's alert in the open dialog, and its link: Flask's hand-off to minty-web's Entity & Integration. */
async function expectReconnectLink(page: Page) {
  const dialog = page.getByRole("dialog", { name: "Publish to Xero?" });
  await dialog.getByRole("button", { name: "Publish to Xero" }).click();
  const alert = dialog.getByRole("alert");
  await expect(alert).toContainText(RECONNECT_WHY);
  const link = alert.getByRole("link", { name: "Reconnect Xero in Entity & Integration" });
  const href = new URL((await link.getAttribute("href"))!);
  expect(href.pathname).toBe("/handoff/minty-web");
  expect(href.searchParams.get("next")).toBe(INTEGRATION);
  expect(href.searchParams.get("entity_id")).toBe(ENTITY);
  await expect(link).not.toHaveAttribute("target", /.+/);
  return link;
}

test("reconnect: the sentence and a full-page link through the hand-off to minty-web's Entity & Integration", async ({ page }) => {
  await openReport(page, reconnecting);
  await page.getByRole("button", { name: "Publish to Xero" }).click();
  const link = await expectReconnectLink(page);
  await link.click();
  await expect(page).toHaveURL(/\/handoff\/minty-web\?/);
  await expect(page.getByText("minty-web hand-off")).toBeVisible();
});

test("reconnect from the outcome page and from a history row: the same hand-off", async ({ page }) => {
  await stub(page, reconnecting);
  await arrive(page, OUTCOME_URL);
  await page.getByRole("button", { name: "Send to Xero" }).click();
  await expectReconnectLink(page);

  await page.goto(HISTORY_URL);
  await chooseMore(page, "More actions for Tue 13 Oct 2026", "Publish to Xero");
  await expectReconnectLink(page);
});

test("republishing warns that Xero gets a second copy - in Xero now, or sent there before an edit", async ({ page }) => {
  const calls = await openReport(page, { report: reportAnswer(IN_XERO), after: [status({ was_published: true }), PUBLISHED] });
  await chooseMore(page, "More report actions", "Publish to Xero again");
  const dialog = page.getByRole("alertdialog", { name: "Publish to Xero again?" });
  await expect(dialog.getByRole("status").filter({ hasText: "Xero gets a second copy" })).toContainText(WARNING);
  await expect(dialog.getByRole("button", { name: "Cancel" })).toBeFocused();
  await dialog.getByRole("button", { name: "Publish again" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(toast(page)).toContainText(TOAST);
  expect(calls.publishes).toBe(1);

  // edited after it was published: Submitted again, Publish to Xero is the Primary, and it still warns
  await page.unroute(new RegExp(`/api/petty-cash/v1/companies/[^/]+/reports/${REPORT}$`));
  await page.route(new RegExp(`/api/petty-cash/v1/companies/[^/]+/reports/${REPORT}$`), (route) =>
    route.fulfill({ json: reportAnswer({ publishing_status: "completed", was_published: true, published_at: "2026-10-13T18:15:00+08:00" }) }),
  );
  await page.reload();
  await page.getByRole("button", { name: "Publish to Xero" }).click();
  const second = page.getByRole("alertdialog", { name: "Publish to Xero?" });
  await expect(second).toContainText(WARNING);
  await expectNoHorizontalScroll(page);
});

test("the outcome page: one quiet Xero line - Send to Xero asks first (no status read: the outcome carries was_published), then Sent to Xero follows", async ({ page }) => {
  const calls = await stub(page, { after: [status(), PUBLISHED] });
  await arrive(page, OUTCOME_URL);
  await expect(page.getByRole("heading", { level: 1, name: "The report is submitted" })).toBeFocused();
  await expect(page.getByText("Not sent to Xero yet")).toBeVisible();
  // Daily Closing Phase 1 (Flask 4e004d2): Xero is a quiet line, Back to home the next action
  const publish = page.getByRole("button", { name: "Send to Xero" });
  await expect(publish).toBeVisible();
  await expect(page.getByRole("link", { name: "View report" })).toHaveAttribute("href", REPORT_URL);

  await publish.click();
  const dialog = confirmDialog(page, "Publish to Xero?");
  await expect(dialog).toBeVisible();
  // the outcome's own was_published (false): no warning, and no publishing-status read for it
  await expect(dialog.getByRole("button", { name: "Publish to Xero" })).toBeEnabled();
  await expect(dialog.getByText("Xero gets a second copy")).toHaveCount(0);
  expect(calls.reads).toBe(0);
  await dialog.getByRole("button", { name: "Publish to Xero" }).click();

  await expect(page.getByRole("status").filter({ hasText: "You can leave this page" })).toHaveAttribute("data-tone", "info");
  // nothing to send while Xero works on it
  await expect(page.getByRole("button", { name: "Send to Xero" })).toHaveCount(0);
  await expect(page.getByText("Sent to Xero · 6:15 pm")).toBeVisible();
  await expect(toast(page)).toContainText(TOAST);
  await expect(live(page)).toHaveText("Published to Xero.");
  // in Xero now: the line offers Publish again
  await expect(page.getByRole("button", { name: "Publish again" })).toBeVisible();
  await expectNoHorizontalScroll(page);
});

test("the outcome page: a report sent to Xero before warns (its own was_published), and a failure says why", async ({ page }) => {
  const calls = await stub(page, {
    outcome: outcomeAnswer({ xero: { publishing_status: "unpublished", published_at: null, xero_integrated: false, was_published: true } }),
    after: [status({ was_published: true }), FAILED],
  });
  await arrive(page, OUTCOME_URL);
  await page.getByRole("button", { name: "Send to Xero" }).click();
  const dialog = page.getByRole("alertdialog", { name: "Publish to Xero?" });
  await expect(dialog).toContainText(WARNING);
  expect(calls.reads).toBe(0);
  await dialog.getByRole("button", { name: "Publish to Xero" }).click();
  const alert = page.getByRole("alert").filter({ hasText: "Publishing to Xero failed" });
  await expect(alert).toContainText("Account 429 is archived in Xero.");
  await expect(page.getByText("Not sent to Xero yet")).toBeVisible();
  await alert.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("alertdialog", { name: "Publish to Xero?" })).toBeVisible();
});

test("report history: a row publishes in place - its pill follows, a toast, and then it offers publishing again", async ({ page }) => {
  const calls = await stub(page, { after: [status(), PUBLISHED] });
  await arrive(page, HISTORY_URL);
  const row = page.getByRole("listitem").filter({ has: page.getByRole("link", { name: "Tue 13 Oct 2026" }) });
  await chooseMore(page, "More actions for Tue 13 Oct 2026", "Publish to Xero");
  const dialog = page.getByRole("dialog", { name: "Publish to Xero?" });
  await dialog.getByRole("button", { name: "Publish to Xero" }).click();
  await expect(row.getByRole("status").filter({ hasText: "You can leave this page" })).toHaveAttribute("data-tone", "info");
  await expect(pill(page, "Published to Xero")).toHaveAttribute("data-tone", "success");
  await expect(toast(page)).toContainText(TOAST);
  // still on the list, not on the report
  await expect(page).toHaveURL(new RegExp(`${HISTORY_URL}$`));
  await page.getByRole("button", { name: "More actions for Tue 13 Oct 2026" }).click();
  await expect(page.getByRole("menuitem", { name: "Publish to Xero again" })).toBeVisible();
  expect(calls.publishes).toBe(1);
  await expectNoHorizontalScroll(page);
});

test("report history: a failed publish in a row says why, and Try again asks again (above the row's link)", async ({ page }) => {
  await stub(page, { after: [status(), FAILED] });
  await arrive(page, HISTORY_URL);
  await chooseMore(page, "More actions for Tue 13 Oct 2026", "Publish to Xero");
  await page.getByRole("dialog", { name: "Publish to Xero?" }).getByRole("button", { name: "Publish to Xero" }).click();
  const alert = page.getByRole("alert").filter({ hasText: "Publishing to Xero failed" });
  await expect(alert.getByRole("listitem").filter({ hasText: "ParknShop is not a contact in Xero." })).toContainText("· Resolved");
  await expect(pill(page, "Publish failed")).toHaveAttribute("data-tone", "danger");
  // the reasons are said once, in the alert
  await expect(page.getByText("Why it didn't reach Xero")).toHaveCount(0);
  await alert.getByRole("button", { name: "Try again" }).click();
  const again = page.getByRole("alertdialog", { name: "Publish to Xero?" });
  await expect(again).toContainText(WARNING);
  await expect(page).toHaveURL(new RegExp(`${HISTORY_URL}$`));
  await expectNoHorizontalScroll(page);
});

test("report history: a row already publishing when the list loads is watched, as one started from the row", async ({ page }) => {
  const calls = await stub(page, {
    history: historyPage([historyRow({ publishing_status: "publishing", status_label: "Publishing to Xero", status_tone: "info" })]),
    before: status(),
  });
  await arrive(page, HISTORY_URL);
  const row = page.getByRole("listitem").filter({ has: page.getByRole("link", { name: "Tue 13 Oct 2026" }) });
  await expect(row.getByRole("status").filter({ hasText: "You can leave this page" })).toHaveAttribute("data-tone", "info");
  await expect.poll(() => calls.reads).toBeGreaterThan(0);
  // Xero finishes: the row's pill follows, with a toast, and nothing was started here
  await page.unroute("**/api/petty-cash/v1/companies/*/reports/*/publishing-status");
  await page.route("**/api/petty-cash/v1/companies/*/reports/*/publishing-status", (route) => route.fulfill({ json: PUBLISHED }));
  await expect(pill(page, "Published to Xero")).toHaveAttribute("data-tone", "success");
  await expect(toast(page)).toContainText(TOAST);
  await expect(row.getByRole("status").filter({ hasText: "You can leave this page" })).toHaveCount(0);
  expect(calls.publishes).toBe(0);
});

test("report history: rows not publishing are not watched", async ({ page }) => {
  const calls = await stub(page, { history: historyPage([historyRow({ publishing_status: "failed", status_label: "Publish failed", status_tone: "danger", publish_reasons: REASONS })]) });
  await arrive(page, HISTORY_URL);
  await expect(page.getByText("Why it didn't reach Xero")).toBeVisible();
  await expect(pill(page, "Publish failed")).toBeVisible();
  // a watched row reads at once; give it the time it would take
  await page.waitForTimeout(500);
  expect(calls.reads).toBe(0);
});

test("polling stops at the cap with Check again, which watches once more", async ({ page }) => {
  await page.clock.install();
  const calls = await openReport(page, { after: [status()] });
  await page.getByRole("button", { name: "Publish to Xero" }).click();
  await page.getByRole("dialog", { name: "Publish to Xero?" }).getByRole("button", { name: "Publish to Xero" }).click();
  await expect.poll(() => calls.reads).toBe(1);
  // time is the test's from here
  await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 100);
  for (let n = 1; n < POLL_CAP; n += 1) {
    await expect.poll(() => calls.reads).toBe(n);
    await page.clock.runFor(POLL_MS);
  }
  const stalled = page.getByRole("status").filter({ hasText: "Xero is still working on it" });
  await expect(stalled).toHaveAttribute("data-tone", "info");
  await expect(live(page)).toHaveText("Xero is still working on it.");
  expect(calls.reads).toBe(POLL_CAP);
  await page.clock.runFor(POLL_MS * 5);
  expect(calls.reads).toBe(POLL_CAP);

  // Check again: Xero has it now
  await page.unroute("**/api/petty-cash/v1/companies/*/reports/*/publishing-status");
  await page.route("**/api/petty-cash/v1/companies/*/reports/*/publishing-status", (route) => route.fulfill({ json: PUBLISHED }));
  await stalled.getByRole("button", { name: "Check again" }).click();
  await expect(pill(page, "Published to Xero")).toHaveAttribute("data-tone", "success");
  await expect(toast(page)).toContainText(TOAST);
});

test("no polling is left after navigating away", async ({ page }) => {
  await page.clock.install();
  const calls = await openReport(page, { after: [status()] });
  await page.getByRole("button", { name: "Publish to Xero" }).click();
  await page.getByRole("dialog", { name: "Publish to Xero?" }).getByRole("button", { name: "Publish to Xero" }).click();
  await expect.poll(() => calls.reads).toBe(1);
  await page.clock.runFor(POLL_MS);
  await expect.poll(() => calls.reads).toBe(2);

  // the way back to the list, client-side: the Daily Report unmounts
  await page.locator("main").getByRole("link", { name: "Reports" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Reports" })).toBeVisible();
  const before = calls.reads;
  await page.clock.runFor(POLL_MS * 10);
  expect(calls.reads).toBe(before);
});
