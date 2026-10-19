// Publish to Xero (components/report/Publish.tsx, lib/publish.ts - Flask's ORIGINAL publish on its
// Submitted page and report history), against a STUBBED Petty Cash API: nothing reaches Xero.
// Needs only `npm run dev`. Flask's hand-off to minty-web is caught, so nothing leaves the app.

import { expect, test, type Page, type Route } from "@playwright/test";

import { companyRef } from "./companyRef";
import { catchHandoffs, expectHubHandoff, expectNoHorizontalScroll, mintModuleToken } from "./helpers";

const ENTITY = "3d65f186-5ba1-4bf7-a1b0-cc64a113eb5c";
const NAME = "E2E Petty Cash Shop";
const BASE = `/entity/${companyRef(ENTITY, NAME)}/petty-cash`;
const API = "**/api/petty-cash/v1/companies/*";
const REPORT = "8a1d3c55-0f8e-4f4e-9d55-2c4b7d1e0a77";
const PUBLISHED = "1b2c3d4e-0000-4000-8000-000000000002";
const FAILED = "1b2c3d4e-0000-4000-8000-000000000003";
const SUBMITTED = `${BASE}/reports/${REPORT}/submitted`;
const HISTORY = `${BASE}/reports`;
const LIST = /\/api\/petty-cash\/v1\/companies\/[^/]+\/reports(\?.*)?$/;
/** minty-web's Entity & Integration, where Xero is connected (`next` of Flask's hand-off). */
const INTEGRATION = `/entity/${companyRef(ENTITY, NAME)}/settings/integration`;
const RECONNECT_LINK = "Reconnect Xero in Entity & Integration";
const RECONNECT = "I've lost access to your Xero account. Mind reconnecting it in Settings?";

type Json = Record<string, unknown>;
type Xero = { publishing_status: string; published_at: string | null; xero_integrated: boolean; was_published: boolean };

const NEVER: Xero = { publishing_status: "unpublished", published_at: null, xero_integrated: false, was_published: false };
const IN_XERO: Xero = { publishing_status: "completed", published_at: "2026-10-13T13:00:00+00:00", xero_integrated: true, was_published: true };

function outcome(xero: Xero, over: Json = {}): Json {
  return {
    report_id: REPORT,
    transaction_date: "2026-10-13",
    currency_code: "HKD",
    company_name: NAME,
    status: "submitted",
    submitted: true,
    submitted_at: "2026-10-13T12:00:00+00:00",
    submitted_by: "Tess",
    cash_counted: 1160.5,
    difference: { amount: 0, kind: "none", has_reason: false },
    xero,
    can_publish: true,
    is_today: false,
    next_day: "2026-10-14",
    ...over,
  };
}

function status(publishing_status: string, over: Json = {}): Json {
  return {
    report_id: REPORT,
    publishing_status,
    status_label: publishing_status === "completed" ? "Published to Xero" : publishing_status === "failed" ? "Publish failed" : "Submitted",
    status_tone: "info",
    xero_integrated: publishing_status === "completed",
    was_published: publishing_status !== "unpublished",
    published_at: null,
    reasons: [],
    ...over,
  };
}

function row(over: Json = {}): Json {
  return {
    id: REPORT,
    transaction_date: "2026-10-13",
    status: "submitted",
    status_label: "Submitted",
    status_tone: "info",
    current_section: null,
    total_sales: 1234.5,
    total_expenses: 128.5,
    submitted_by: "Tess",
    submitted_at: "2026-10-13T12:05:00+00:00",
    published_at: null,
    created_at: "2026-10-13T01:30:00+00:00",
    was_published: false,
    publish_reasons: [],
    permissions: { edit: true, delete: true },
    ...over,
  };
}

const ROWS = [
  row(),
  row({ id: PUBLISHED, transaction_date: "2026-10-11", status_label: "Published to Xero", published_at: "2026-10-11T16:30:00+00:00", was_published: true, permissions: { edit: false, delete: false } }),
  row({
    id: FAILED,
    transaction_date: "2026-10-10",
    status_label: "Publish failed",
    was_published: true,
    publish_reasons: [{ text: "Account 400 is archived in Xero.", resolved: false }],
    permissions: { edit: false, delete: false },
  }),
];

const listAnswer = (reports: Json[] = ROWS) => ({ reports, page: 1, per_page: 10, total_pages: 1, total_count: reports.length, latest_report_id: REPORT, currency_code: "HKD", can_publish: true });

type Handlers = {
  outcome?: Xero;
  rows?: Json[];
  /** The POST's answer; a 202 by default. */
  onPublish?: (route: Route) => Promise<void>;
  /** The status reads in order; the last one repeats. */
  statuses?: Json[];
};

/** Every call the pages make, stubbed; returns what was asked. */
async function stub(page: Page, h: Handlers = {}) {
  const sent = { publish: [] as string[], status: [] as string[], outcomes: 0, lists: 0 };
  let xero = h.outcome ?? NEVER;
  await page.route(`${API}/reports/*/outcome`, (route) => {
    sent.outcomes += 1;
    return route.fulfill({ json: outcome(xero) });
  });
  await page.route(`${API}/reports/*/publish`, async (route) => {
    sent.publish.push(route.request().url().split("/reports/")[1]);
    if (h.onPublish) await h.onPublish(route);
    else await route.fulfill({ status: 202, json: { publishing_status: "publishing", message: "Publishing to Xero. This can take a few minutes." } });
  });
  const statuses = h.statuses ?? [status("publishing"), status("completed")];
  await page.route(`${API}/reports/*/publishing-status`, (route) => {
    const answer = statuses[Math.min(sent.status.length, statuses.length - 1)];
    sent.status.push(route.request().url().split("/reports/")[1]);
    if (answer.publishing_status === "completed") xero = IN_XERO;
    return route.fulfill({ json: answer });
  });
  await page.route(LIST, (route) => {
    sent.lists += 1;
    return route.fulfill({ json: listAnswer(h.rows) });
  });
  await page.route(`${API}/home`, (route) => route.fulfill({ status: 500, json: { error: "Not the subject here." } }));
  await page.route("**/api/me/profile**", (route) => route.fulfill({ json: { user: { name: "Tess Tester", initials: "TT" } } }));
  // Flask's hand-off to minty-web (where Xero is connected): caught, so nothing leaves the app.
  await catchHandoffs(page);
  return sent;
}

async function enter(page: Page, next: string) {
  const token = mintModuleToken({ secret: "stub", userId: "u", entityId: ENTITY, entityName: NAME });
  await page.goto(`/landing?${new URLSearchParams({ token, entity_id: ENTITY, entity_name: NAME, next })}`);
}

async function openSubmitted(page: Page, h: Handlers = {}) {
  const sent = await stub(page, h);
  await enter(page, SUBMITTED);
  await expect(page.getByRole("heading", { name: /Successfully!/ })).toBeVisible();
  return sent;
}

async function openHistory(page: Page, h: Handlers = {}) {
  const sent = await stub(page, h);
  await enter(page, HISTORY);
  await expect(page.getByRole("heading", { name: "Report Results" })).toBeVisible();
  await expect(page.locator("[data-report-id]").first()).toBeVisible();
  return sent;
}

const toast = (page: Page, text: string | RegExp) => page.locator("[data-toast-type]").filter({ hasText: text });
const overlay = (page: Page) => page.getByRole("dialog", { name: /Publishing to Xero|Republishing to Xero|Published successfully|Partially published|Initiating|Sending request/ });
const fromMenu = async (page: Page, id: string, item: "Publish" | "Republish") => {
  const entry = page.locator(`[data-report-id="${id}"]`);
  await entry.getByRole("button", { name: "Actions" }).click();
  await entry.getByRole("menu").getByRole("menuitem", { name: item, exact: true }).click();
};

// ---- the Submitted page ----

test("Submitted: Publish to Xero runs Flask's overlay, polls to success, then says so and reads the page again", async ({ page }) => {
  const sent = await openSubmitted(page);
  const reads = sent.outcomes;
  await page.getByRole("button", { name: "Publish to Xero" }).click();
  // no confirm for a report never in Xero: straight to the overlay
  await expect(page.getByRole("dialog", { name: "Republish Report" })).toHaveCount(0);
  await expect(overlay(page)).toBeVisible();
  await expect(page.getByText("Please do not close or navigate away.")).toBeVisible();
  await expect(page.getByRole("progressbar", { name: "Publishing progress" })).toBeVisible();
  await expectNoHorizontalScroll(page);

  await expect(toast(page, "Report Successfully Published")).toBeVisible({ timeout: 15_000 });
  await expect(overlay(page)).toHaveCount(0);
  expect(sent.publish).toEqual([`${REPORT}/publish`]);
  // asked until it was no longer publishing, then no more
  expect(sent.status).toHaveLength(2);
  await expect(page.getByRole("heading", { name: "Report Published to Xero Successfully!" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Republish to Xero" })).toBeVisible();
  expect(sent.outcomes).toBe(reads + 1);
  await page.waitForTimeout(2500);
  expect(sent.status).toHaveLength(2);
});

test("Submitted: a failed publish with reasons says them; without any, Flask's failure", async ({ page }) => {
  await openSubmitted(page, { statuses: [status("failed", { reasons: [{ text: "Account 400 is archived in Xero.", resolved: false }, { text: "Old", resolved: true }] })] });
  await page.getByRole("button", { name: "Publish to Xero" }).click();
  await expect(toast(page, "Xero publish is done partially due to Account 400 is archived in Xero.")).toBeVisible({ timeout: 10_000 });
  await expect(toast(page, "Old")).toHaveCount(0);
  await expect(overlay(page)).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Report Submitted Successfully!" })).toBeVisible();

  await page.unrouteAll({ behavior: "ignoreErrors" });
  await openSubmitted(page, { statuses: [status("failed")] });
  await page.getByRole("button", { name: "Publish to Xero" }).click();
  await expect(toast(page, "Publishing to Xero failed. Please try again.")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole("button", { name: "Publish to Xero" })).toBeEnabled();
});

for (const [why, code, sentence] of [
  ["settings incomplete", 400, "Xero settings incomplete. Please configure entity settings first."],
  ["a system account on a line", 400, "Expense 'Bags' uses system account 800. Choose another account."],
  ["a draft", 409, "This report is still a draft. Submit the day before publishing it."],
  ["already publishing", 409, "Publishing already in progress. Please wait..."],
  ["no right", 403, "You don't have permission to publish reports for this company."],
  ["no report", 404, "Hmm, I couldn't find that report."],
] as const) {
  test(`Submitted: a refused start (${why}, ${code}) says the API's sentence and polls nothing`, async ({ page }) => {
    const sent = await openSubmitted(page, { onPublish: (route) => route.fulfill({ status: code, json: { error: sentence } }) });
    await page.getByRole("button", { name: "Publish to Xero" }).click();
    await expect(toast(page, sentence)).toBeVisible();
    await expect(toast(page, sentence)).toHaveAttribute("data-toast-type", code === 409 ? "warning" : "error");
    await expect(overlay(page)).toHaveCount(0);
    await page.waitForTimeout(2500);
    expect(sent.status).toEqual([]);
    await expect(page.getByRole("button", { name: "Publish to Xero" })).toBeEnabled();
  });
}

test("Submitted: a refusal that needs Xero connected again says so and links to minty-web's Entity & Integration", async ({ page }) => {
  const sent = await openSubmitted(page, { onPublish: (route) => route.fulfill({ status: 400, json: { error: RECONNECT, reconnect: true } }) });
  await page.getByRole("button", { name: "Publish to Xero" }).click();
  const dialog = page.getByRole("dialog", { name: "Reconnect Xero" });
  await expect(dialog.getByText(RECONNECT)).toBeVisible();
  await expectNoHorizontalScroll(page);
  // the footer's Close (the corner X is "Close" too)
  await dialog.getByRole("button", { name: "Close", exact: true }).last().click();
  await expect(dialog).toHaveCount(0);
  expect(sent.status).toEqual([]);

  await page.getByRole("button", { name: "Publish to Xero" }).click();
  const link = page.getByRole("dialog", { name: "Reconnect Xero" }).getByRole("link", { name: RECONNECT_LINK });
  await expectHubHandoff(link, INTEGRATION, ENTITY);
  await link.click();
  await page.waitForURL((url) => url.pathname === "/handoff/minty-web" && url.searchParams.get("next") === INTEGRATION);
});

test("Submitted: Republish warns of duplicates first; Cancel sends nothing, Confirm republishes", async ({ page }) => {
  const sent = await openSubmitted(page, { outcome: IN_XERO });
  await page.getByRole("button", { name: "Republish to Xero" }).click();
  const dialog = page.getByRole("dialog", { name: "Republish Report" });
  await expect(dialog.getByText("This report was previously published. This action may create duplicate entries in Xero.")).toBeVisible();
  await expect(dialog.getByText("Do you wish to continue?")).toBeVisible();
  await expectNoHorizontalScroll(page);
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toHaveCount(0);
  expect(sent.publish).toEqual([]);

  await page.getByRole("button", { name: "Republish to Xero" }).click();
  await page.getByRole("dialog", { name: "Republish Report" }).getByRole("button", { name: "Confirm" }).click();
  await expect(page.getByRole("dialog", { name: "Republishing to Xero..." })).toBeVisible();
  await expect(toast(page, "Report Successfully Republished")).toBeVisible({ timeout: 15_000 });
  expect(sent.publish).toHaveLength(1);
});

test("Submitted: a report edited after a publish reads Publish to Xero, but warns of duplicates first (the API's was_published)", async ({ page }) => {
  const sent = await openSubmitted(page, { outcome: { publishing_status: "completed", published_at: null, xero_integrated: false, was_published: true } });
  await page.getByRole("button", { name: "Publish to Xero" }).click();
  await expect(page.getByRole("dialog", { name: "Republish Report" })).toBeVisible();
  expect(sent.publish).toEqual([]);
});

test("Submitted: the warning follows the API's was_published, not the publishing status", async ({ page }) => {
  // a failed first publish that put nothing in Xero: the API says it has not been there, so no warning
  const sent = await openSubmitted(page, { outcome: { publishing_status: "failed", published_at: null, xero_integrated: false, was_published: false } });
  await page.getByRole("button", { name: "Publish to Xero" }).click();
  await expect(page.getByRole("dialog", { name: "Republish Report" })).toHaveCount(0);
  await expect.poll(() => sent.publish.length).toBe(1);
});

test("Submitted: no request is left polling after leaving the page", async ({ page }) => {
  const sent = await openSubmitted(page, { statuses: [status("publishing")] });
  await page.getByRole("button", { name: "Publish to Xero" }).click();
  await expect.poll(() => sent.status.length, { timeout: 10_000 }).toBeGreaterThan(0);
  await page.goBack();
  const asked = sent.status.length;
  await page.waitForTimeout(5000);
  expect(sent.status.length).toBe(asked);
});

test("Submitted: after Flask's cap it says it is still publishing and offers to check again", async ({ page }) => {
  // the page's clock is driven: Flask's cap is 90 reads two seconds apart
  await page.clock.install();
  const sent = await openSubmitted(page, { statuses: [status("publishing")] });
  await page.getByRole("button", { name: "Publish to Xero" }).click();
  await expect(overlay(page)).toBeVisible();
  for (let i = 0; i < 400 && sent.status.length < 90; i++) {
    await page.clock.runFor(2000);
    await page.waitForTimeout(25);
  }
  const still = page.getByRole("alertdialog", { name: "Still publishing to Xero" });
  await expect(still).toBeVisible();
  await expect(still.getByText("Publishing is taking longer than expected. Please check again later.")).toBeVisible();
  expect(sent.status).toHaveLength(90);
  await page.clock.runFor(10_000);
  expect(sent.status).toHaveLength(90);
  await expectNoHorizontalScroll(page);

  // Check again watches it once more - no second publish - and this time it is done
  await page.unroute(`${API}/reports/*/publishing-status`);
  await page.route(`${API}/reports/*/publishing-status`, (route) => {
    sent.status.push("again");
    return route.fulfill({ json: status("completed") });
  });
  await still.getByRole("button", { name: "Check again" }).click();
  for (let i = 0; i < 20 && sent.status.length < 91; i++) {
    await page.clock.runFor(2000);
    await page.waitForTimeout(25);
  }
  await page.clock.runFor(1000);
  await expect(toast(page, "Report Successfully Published")).toBeVisible();
  expect(sent.publish).toHaveLength(1);
});

// ---- report history's row menu ----

test("History: Publish from the row menu polls to success, says so and reads the list again", async ({ page }) => {
  const sent = await openHistory(page);
  const lists = sent.lists;
  await fromMenu(page, REPORT, "Publish");
  await expect(page.getByRole("dialog", { name: "Republish Report" })).toHaveCount(0);
  await expect(overlay(page)).toBeVisible();
  await expectNoHorizontalScroll(page);
  await expect(toast(page, "Report published to Xero successfully!")).toBeVisible({ timeout: 15_000 });
  expect(sent.publish).toEqual([`${REPORT}/publish`]);
  expect(sent.status).toHaveLength(2);
  await expect.poll(() => sent.lists).toBe(lists + 1);
});

test("History: Republish confirms - with the duplicates warning only for a report fully in Xero", async ({ page }) => {
  const sent = await openHistory(page);
  await fromMenu(page, PUBLISHED, "Republish");
  let dialog = page.getByRole("dialog", { name: "Republish Report" });
  await expect(dialog.getByText("I've already published this report — republishing may create duplicates in Xero.")).toBeVisible();
  await expect(dialog.getByText("Still want to go ahead?")).toBeVisible();
  await dialog.getByRole("button", { name: "Close" }).click();
  expect(sent.publish).toEqual([]);

  // a failed (partly published) one is re-sent selectively: no duplicates warning
  await fromMenu(page, FAILED, "Republish");
  dialog = page.getByRole("dialog", { name: "Republish Report" });
  await expect(dialog.getByText("Still want to go ahead?")).toBeVisible();
  await expect(dialog.getByText(/duplicates/)).toHaveCount(0);
  await dialog.getByRole("button", { name: "Confirm" }).click();
  await expect(page.getByRole("dialog", { name: "Republishing to Xero..." })).toBeVisible();
  await expect(toast(page, "Report published to Xero successfully!")).toBeVisible({ timeout: 15_000 });
  expect(sent.publish).toEqual([`${FAILED}/publish`]);
});

test("History: Publish on a report edited after a publish warns of duplicates first", async ({ page }) => {
  const sent = await openHistory(page, { rows: [row({ was_published: true }), ...ROWS.slice(1)] });
  await fromMenu(page, REPORT, "Publish");
  const dialog = page.getByRole("dialog", { name: "Republish Report" });
  await expect(dialog.getByText("I've already published this report — republishing may create duplicates in Xero.")).toBeVisible();
  await dialog.getByRole("button", { name: "Cancel" }).click();
  expect(sent.publish).toEqual([]);
});

test("History: a partial publish says its reasons and the list is read again", async ({ page }) => {
  const sent = await openHistory(page, { statuses: [status("failed", { reasons: [{ text: "Acme isn't a Xero contact.", resolved: false }] })] });
  const lists = sent.lists;
  await fromMenu(page, REPORT, "Publish");
  await expect(toast(page, "Xero publish is done partially due to Acme isn't a Xero contact.")).toBeVisible({ timeout: 10_000 });
  await expect(toast(page, "Xero publish is done partially")).toHaveAttribute("data-toast-type", "warning");
  await expect.poll(() => sent.lists).toBe(lists + 1);
});

test("History: a refused start says the sentence; reconnect links to minty-web's Entity & Integration", async ({ page }) => {
  const busy = "Publishing already in progress. Please wait...";
  let answer = { status: 409, json: { error: busy } as Json };
  const sent = await openHistory(page, { onPublish: (route) => route.fulfill(answer) });
  const lists = sent.lists;
  await fromMenu(page, REPORT, "Publish");
  await expect(toast(page, busy)).toHaveAttribute("data-toast-type", "error");
  await expect(overlay(page)).toHaveCount(0);

  answer = { status: 400, json: { error: RECONNECT, reconnect: true } };
  await fromMenu(page, REPORT, "Publish");
  const dialog = page.getByRole("dialog", { name: "Reconnect Xero" });
  await expect(dialog.getByText(RECONNECT)).toBeVisible();
  await expectHubHandoff(dialog.getByRole("link", { name: RECONNECT_LINK }), INTEGRATION, ENTITY);
  expect(sent.status).toEqual([]);
  // a refusal changes nothing: the list is not read again
  expect(sent.lists).toBe(lists);
});

test("History: no request is left polling after leaving the page in the app", async ({ page }) => {
  const sent = await openHistory(page, { statuses: [status("publishing")] });
  await fromMenu(page, REPORT, "Publish");
  await expect.poll(() => sent.status.length, { timeout: 10_000 }).toBeGreaterThan(0);
  // a report's own view, where the row's chevron leads: not the subject here
  await page.route(/\/api\/petty-cash\/v1\/companies\/[^/]+\/reports\/[0-9a-f-]{36}$/, (route) => route.fulfill({ status: 404, json: { error: "Hmm, I couldn't find that report." } }));
  // the overlay covers the page, so the row's chevron is clicked from script: an in-app navigation
  // (the router, no page load - a page load would stop any poll by itself)
  await page.evaluate(() => ((window as unknown as { __stillHere: boolean }).__stillHere = true));
  await page.getByRole("link", { name: "View the 13 OCT 2026 report" }).dispatchEvent("click");
  await expect(page).toHaveURL(new RegExp(`${HISTORY}/${REPORT}/summary$`));
  expect(await page.evaluate(() => (window as unknown as { __stillHere?: boolean }).__stillHere)).toBe(true);
  const asked = sent.status.length;
  await page.waitForTimeout(5000);
  expect(sent.status.length).toBe(asked);
});
