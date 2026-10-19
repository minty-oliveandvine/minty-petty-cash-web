// Report history (components/history/ReportHistory.tsx, Flask's ORIGINAL look), against a STUBBED
// Petty Cash API. Needs only `npm run dev`. The CSV is the API's `GET /reports/export.csv`, stubbed
// too - never a Flask page. Publishing from the row menu is 12_publish.

import { expect, test, type Page, type Route } from "@playwright/test";

import { companyRef } from "./companyRef";
import { expectNoHorizontalScroll, mintModuleToken } from "./helpers";

const ENTITY = "3d65f186-5ba1-4bf7-a1b0-cc64a113eb5c";
const NAME = "E2E Petty Cash Shop";
const BASE = `/entity/${companyRef(ENTITY, NAME)}/petty-cash`;
const HISTORY = `${BASE}/reports`;
const API = "**/api/petty-cash/v1/companies/*";
const LIST = /\/api\/petty-cash\/v1\/companies\/[^/]+\/reports(\?.*)?$/;
const LATEST = "8a1d3c55-0f8e-4f4e-9d55-2c4b7d1e0a77";
const PUBLISHED = "1b2c3d4e-0000-4000-8000-000000000002";
const FAILED = "1b2c3d4e-0000-4000-8000-000000000003";
const DRAFT = "1b2c3d4e-0000-4000-8000-000000000004";
const CSV = /\/api\/petty-cash\/v1\/companies\/[^/]+\/reports\/export\.csv(\?.*)?$/;
const CSV_NAME = "petty-cash_2026-10-01_to_2026-10-13.csv";

/** The export's answer: CSV, named by its Content-Disposition, which the API exposes to the page. */
const csvFile = () => ({
  headers: {
    "content-type": "text/csv; charset=utf-8",
    "content-disposition": `attachment; filename=${CSV_NAME}`,
    "access-control-expose-headers": "Content-Disposition",
  },
  body: "Date,Account Code,Amount\r\n",
});

type Json = Record<string, unknown>;

function row(over: Json = {}): Json {
  return {
    id: LATEST,
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

/** The 13th (latest, submitted), the 11th (a Sunday, in Xero) and the 10th (a Saturday, publish failed). */
const ROWS = [
  row(),
  row({
    id: PUBLISHED,
    transaction_date: "2026-10-11",
    status_label: "Published to Xero",
    status_tone: "success",
    total_sales: 0,
    total_expenses: 40,
    published_at: "2026-10-11T16:30:00+00:00",
    was_published: true,
    permissions: { edit: false, delete: false },
  }),
  row({
    id: FAILED,
    transaction_date: "2026-10-10",
    status_label: "Publish failed",
    status_tone: "danger",
    total_sales: 1234567.5,
    was_published: true,
    publish_reasons: [
      { text: "Account 400 is archived in Xero.", resolved: false },
      { text: "Acme isn't a Xero contact.", resolved: true },
    ],
    permissions: { edit: false, delete: false },
  }),
];

function listAnswer(over: Json = {}): Json {
  return { reports: ROWS, page: 1, per_page: 10, total_pages: 1, total_count: 3, latest_report_id: LATEST, currency_code: "HKD", can_publish: true, ...over };
}

type Handlers = {
  list?: (query: URLSearchParams) => Json | { status: number; json: Json };
  onDelete?: (route: Route) => Promise<void>;
  csv?: (route: Route) => Promise<void>;
};

/** Every call the page (and where it leads) makes, stubbed; returns what was asked. */
async function stub(page: Page, h: Handlers = {}) {
  const sent = { lists: [] as string[], reopen: 0, delete: 0, csv: [] as { search: string; auth: string | undefined }[] };
  // a report's own view, where View leads: not the subject here
  await page.route(/\/api\/petty-cash\/v1\/companies\/[^/]+\/reports\/[0-9a-f-]{36}$/, (route) =>
    route.fulfill({ status: 404, json: { error: "Hmm, I couldn't find that report." } }),
  );
  await page.route(LIST, async (route) => {
    const url = new URL(route.request().url());
    sent.lists.push(url.search);
    const answer = h.list ? h.list(url.searchParams) : listAnswer();
    if (typeof answer.status === "number") await route.fulfill(answer as { status: number; json: Json });
    else await route.fulfill({ json: answer });
  });
  await page.route(`${API}/reports/${LATEST}`, async (route) => {
    if (route.request().method() !== "DELETE") return route.fallback();
    sent.delete += 1;
    if (h.onDelete) await h.onDelete(route);
    else await route.fulfill({ json: { deleted: LATEST, transaction_date: "2026-10-13", next: "dashboard" } });
  });
  await page.route(`${API}/reports/*/reopen`, async (route) => {
    sent.reopen += 1;
    await route.fulfill({ json: { report_id: LATEST, transaction_date: "2026-10-13", status: "draft", next: "opening" } });
  });
  await page.route(`${API}/reports/opening**`, (route) =>
    route.fulfill({
      json: {
        transaction_date: "2026-10-13",
        currency_code: "HKD",
        draft: { id: "d", status: "draft", current_section: "opening", completed_sections: [], xero_integrated: false, publishing_status: "unpublished" },
        starting_cash_balance: 1000,
        yesterday_closing_balance: 1000,
        safebox_balance: 0,
        cash_addition: null,
        withdrawal: "personal",
      },
    }),
  );
  await page.route("**/api/me/profile**", (route) => route.fulfill({ json: { user: { name: "Tess Tester", initials: "TT" } } }));
  // the API's CSV export: the file, named by its Content-Disposition (exposed to the page, as the API must)
  await page.route(CSV, async (route) => {
    const request = route.request();
    sent.csv.push({ search: new URL(request.url()).search, auth: request.headers()["authorization"] });
    if (h.csv) return h.csv(route);
    await route.fulfill(csvFile());
  });
  return sent;
}

async function enter(page: Page, next: string) {
  const token = mintModuleToken({ secret: "stub", userId: "u", entityId: ENTITY, entityName: NAME });
  await page.goto(`/landing?${new URLSearchParams({ token, entity_id: ENTITY, entity_name: NAME, next })}`);
}

async function open(page: Page, h: Handlers = {}, address = HISTORY) {
  const sent = await stub(page, h);
  await enter(page, address);
  await expect(page.getByRole("heading", { name: "Report Results" })).toBeVisible();
  return sent;
}

const entries = (page: Page) => page.locator("[data-report-id]");
const entry = (page: Page, id: string) => page.locator(`[data-report-id="${id}"]`);
const toast = (page: Page, text: string | RegExp) => page.locator("[data-toast-type]").filter({ hasText: text });
const menu = async (page: Page, id: string) => {
  await entry(page, id).getByRole("button", { name: "Actions" }).click();
  return entry(page, id).getByRole("menu");
};

test("the header, the date filter and the list: each day, its figures, badge, time and author", async ({ page }) => {
  const sent = await open(page);
  // the original page offers no status and no page size: nothing is sent past the dates and page
  expect(sent.lists[0]).toBe("");
  await expect(page.getByRole("link", { name: "Back" })).toHaveAttribute("href", BASE);
  await expect(page.getByRole("textbox", { name: "Start Date" })).toHaveAttribute("placeholder", "DD/MMM/YYYY");
  await expect(page.getByRole("textbox", { name: "End Date" })).toHaveValue("");
  // the CSV needs both dates
  await expect(page.getByRole("button", { name: "CSV" })).toBeDisabled();

  await expect(entries(page)).toHaveCount(3);
  const latest = entry(page, LATEST);
  await expect(latest.getByText("13 OCT 2026", { exact: true })).toBeVisible();
  await expect(latest.getByText("TUE", { exact: true })).toBeVisible();
  await expect(latest.getByText("HKD1,234.50")).toBeVisible();
  await expect(latest.getByText("HKD128.50")).toBeVisible();
  await expect(latest.getByText("Submitted", { exact: true })).toBeVisible();
  await expect(latest.getByText("13 Oct 2026 20:05")).toBeVisible();
  await expect(latest.getByText("by Tess")).toBeVisible();

  const published = entry(page, PUBLISHED);
  await expect(published.getByText("SUN", { exact: true })).toBeVisible();
  await expect(published.getByText("-", { exact: true })).toBeVisible();
  await expect(published.getByText("Published", { exact: true })).toBeVisible();
  // published: the time it went to Xero, in Hong Kong
  await expect(published.getByText("12 Oct 2026 00:30")).toBeVisible();

  const failed = entry(page, FAILED);
  await expect(failed.getByText("SAT", { exact: true })).toBeVisible();
  await expect(failed.getByText("HKD1,234,567.50")).toBeVisible();
  await expect(failed.getByText("Publish failed", { exact: true })).toBeVisible();
  await expect(page.getByText("No reports found")).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: "Pages" })).toHaveCount(0);
  await expectNoHorizontalScroll(page);
});

test("a failed publish's reasons show on the badge, a resolved one struck through", async ({ page }, info) => {
  await open(page);
  const badge = entry(page, FAILED).getByRole("button", { name: "Publish failed" });
  const tip = entry(page, FAILED).getByRole("tooltip");
  await expect(tip).toBeHidden();
  if (info.project.name === "desktop") {
    // Flask's hover
    await badge.hover();
    await expect(tip).toBeVisible();
    await page.mouse.move(0, 0);
    await expect(tip).toBeHidden();
  }
  // a tap opens them (a phone has no hover), and a tap elsewhere closes them
  await badge.click();
  await expect(tip).toBeVisible();
  await expect(badge).toHaveAttribute("aria-expanded", "true");
  await expect(tip.getByText("Publish issues:")).toBeVisible();
  await expect(tip.getByText("Account 400 is archived in Xero.")).toBeVisible();
  await expect(tip.getByText("Acme isn't a Xero contact.")).toHaveClass(/line-through/);
  await expectNoHorizontalScroll(page);
  await page.getByRole("heading", { name: "Report Results" }).click();
  await expect(tip).toBeHidden();
  // no other row has any
  await expect(entry(page, LATEST).getByRole("button", { name: "Submitted" })).toHaveCount(0);
});

test("filtering by dates: the range calendar, Search Report, the address, reload and Back", async ({ page }) => {
  const sent = await open(page);
  await page.getByRole("textbox", { name: "Start Date" }).click();
  const calendar = page.getByRole("dialog", { name: "Choose the dates" });
  await expect(calendar).toBeVisible();
  await expectNoHorizontalScroll(page);
  // the first month shown, whichever it is: the 5th to the 9th
  const month = (await calendar.locator("p").first().textContent()) ?? "";
  const [name, year] = month.split(" ");
  const mm = String(["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"].indexOf(name) + 1).padStart(2, "0");
  const short = name.slice(0, 3);
  await calendar.getByRole("button", { name: `9 ${month}`, exact: true }).first().click();
  await expect(page.getByRole("textbox", { name: "Start Date" })).toHaveValue(`09/${short}/${year}`);
  await expect(page.getByRole("textbox", { name: "End Date" })).toHaveValue(`09/${short}/${year}`);
  await calendar.getByRole("button", { name: `5 ${month}`, exact: true }).first().click();
  // picked backwards: the range is put in order
  await expect(page.getByRole("textbox", { name: "Start Date" })).toHaveValue(`05/${short}/${year}`);
  await expect(page.getByRole("textbox", { name: "End Date" })).toHaveValue(`09/${short}/${year}`);
  await calendar.getByRole("button", { name: "Search Report" }).click();

  const start = `${year}-${mm}-05`;
  const end = `${year}-${mm}-09`;
  await expect(page).toHaveURL(new RegExp(`${HISTORY}\\?start_date=${start}&end_date=${end}$`));
  await expect(toast(page, "Filter applied")).toBeVisible();
  await expect.poll(() => sent.lists.at(-1)).toBe(`?start_date=${start}&end_date=${end}`);
  // the CSV is ready for the same days
  await expect(page.getByRole("button", { name: "CSV" })).toBeEnabled();

  await page.reload();
  await expect(page.getByRole("textbox", { name: "Start Date" })).toHaveValue(`05/${short}/${year}`);
  await expect.poll(() => sent.lists.at(-1)).toBe(`?start_date=${start}&end_date=${end}`);

  await page.goBack();
  await expect(page).toHaveURL(new RegExp(`${HISTORY}$`));
  await expect(page.getByRole("textbox", { name: "Start Date" })).toHaveValue("");
  await expect.poll(() => sent.lists.at(-1)).toBe("");
});

test("Clear empties the dates and goes back to every report; Escape closes the calendar", async ({ page }) => {
  await open(page, {}, `${HISTORY}?start_date=2026-10-01&end_date=2026-10-13`);
  await expect(page.getByRole("textbox", { name: "Start Date" })).toHaveValue("01/Oct/2026");
  await expect(page.getByRole("textbox", { name: "End Date" })).toHaveValue("13/Oct/2026");
  await page.getByRole("textbox", { name: "End Date" }).click();
  const calendar = page.getByRole("dialog", { name: "Choose the dates" });
  // it opens on the range's month, the range drawn
  await expect(calendar.getByText("October 2026")).toBeVisible();
  await expect(calendar.getByRole("button", { name: "7 October 2026", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("Escape");
  await expect(calendar).toBeHidden();
  await page.getByRole("textbox", { name: "Start Date" }).click();
  await calendar.getByRole("button", { name: "Clear" }).click();
  await expect(page).toHaveURL(new RegExp(`${HISTORY}$`));
  await expect(page.getByRole("textbox", { name: "Start Date" })).toHaveValue("");
  await expect(page.getByRole("button", { name: "CSV" })).toBeDisabled();
});

test("paging: Flask's pager, ten a page, the page and the dates in the address", async ({ page }) => {
  const sent = await open(
    page,
    { list: (q) => listAnswer({ page: Number(q.get("page") ?? 1), total_pages: 3, total_count: 23 }) },
    `${HISTORY}?start_date=2026-09-01&end_date=2026-10-13`,
  );
  const pager = page.getByRole("navigation", { name: "Pages" });
  await expect(pager).toBeVisible();
  const shown = pager.locator("div.whitespace-nowrap");
  await expect(shown).toHaveText(/^(Showing 1 to 10 of 23 reports|1-10\/23)$/, { useInnerText: true });
  await expect(pager.getByText("Previous")).toHaveAttribute("aria-disabled", "true");
  await expect(pager.locator("[aria-current=page]")).toHaveText("1");
  await expectNoHorizontalScroll(page);

  await pager.getByRole("link", { name: "2", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`${HISTORY}\\?start_date=2026-09-01&end_date=2026-10-13&page=2$`));
  await expect(pager.locator("[aria-current=page]")).toHaveText("2");
  await expect.poll(() => sent.lists.at(-1)).toBe("?start_date=2026-09-01&end_date=2026-10-13&page=2");
  await expect(shown).toHaveText(/^(Showing 11 to 20 of 23 reports|11-20\/23)$/, { useInnerText: true });

  await pager.getByRole("link", { name: "Next" }).click();
  await expect(page).toHaveURL(/page=3$/);
  await expect(pager.getByText("Next")).toHaveAttribute("aria-disabled", "true");
  await page.goBack();
  await expect(pager.locator("[aria-current=page]")).toHaveText("2");
});

test("no reports: Flask's empty state", async ({ page }) => {
  await open(page, { list: () => listAnswer({ reports: [], total_count: 0, latest_report_id: null }) });
  await expect(page.getByRole("heading", { name: "No reports found" })).toBeVisible();
  await expect(page.getByText("Try adjusting your date range or search criteria.")).toBeVisible();
  await expect(entries(page)).toHaveCount(0);
});

test("View: the chevron and the menu open the report's view here; a draft opens its own step of the wizard here", async ({ page }) => {
  await open(page, {
    list: () =>
      listAnswer({
        reports: [row({ id: DRAFT, status: "draft", status_label: "Draft", status_tone: "neutral", current_section: "sales", submitted_at: null, permissions: { edit: false, delete: false } }), ...ROWS],
      }),
  });
  // the Sales step's own read is not the subject here: it fails, and the page stays where it is
  await page.route(`${API}/reports/sales**`, (route) => route.fulfill({ status: 500, json: { error: "Something went wrong on our side. Please try again." } }));
  await expect(entry(page, DRAFT).getByText("Draft", { exact: true })).toBeVisible();
  // a draft's time is when the day was started, as Flask showed it
  await expect(entry(page, DRAFT).getByText("13 Oct 2026 09:30")).toBeVisible();
  await expect(entry(page, LATEST).getByRole("link", { name: "View the 13 OCT 2026 report" })).toHaveAttribute("href", `${HISTORY}/${LATEST}/summary`);

  const items = await menu(page, PUBLISHED);
  await expect(items.getByRole("menuitem")).toHaveText(["View", "Republish"]);
  await items.getByRole("menuitem", { name: "View" }).click();
  await expect(page).toHaveURL(new RegExp(`${HISTORY}/${PUBLISHED}/summary$`));

  await page.goBack();
  const resume = `${BASE}/reports/new/sale?transaction_date=2026-10-13`;
  await expect(entry(page, DRAFT).getByRole("link", { name: /^View the/ })).toHaveAttribute("href", resume);
  await entry(page, DRAFT).getByRole("link", { name: /^View the/ }).click();
  await expect(page).toHaveURL((url) => url.pathname + url.search === resume);
});

test("Publish; Republish for one in Xero or failed; a draft's is greyed; none without the right", async ({ page }) => {
  await open(page, { list: () => listAnswer({ reports: [row({ id: DRAFT, status: "draft", status_label: "Draft", permissions: { edit: false, delete: false } }), ...ROWS] }) });
  let items = await menu(page, LATEST);
  await expect(items.getByRole("menuitem")).toHaveText(["Edit", "Delete", "View", "Publish"]);
  await expect(items.getByRole("menuitem", { name: "Publish" })).toHaveAttribute("title", "Publish to Xero");
  await expectNoHorizontalScroll(page);
  // one menu at a time; Escape closes
  items = await menu(page, FAILED);
  await expect(entry(page, LATEST).getByRole("menu")).toHaveCount(0);
  await expect(items.getByRole("menuitem", { name: "Republish" })).toHaveAttribute("title", "Republish to Xero");
  await page.keyboard.press("Escape");
  await expect(items).toBeHidden();
  items = await menu(page, DRAFT);
  await expect(items.getByRole("menuitem", { name: "Publish" })).toHaveAttribute("aria-disabled", "true");
  // a click elsewhere closes it
  await page.getByRole("heading", { name: "Report Results" }).click();
  await expect(items).toBeHidden();

  await page.unrouteAll({ behavior: "ignoreErrors" });
  await open(page, { list: () => listAnswer({ can_publish: false }) });
  items = await menu(page, LATEST);
  await expect(items.getByRole("menuitem")).toHaveText(["Edit", "Delete", "View"]);
});

test("Edit reopens the latest report and opens its Opening step, in this app", async ({ page }) => {
  const sent = await open(page);
  await (await menu(page, LATEST)).getByRole("menuitem", { name: "Edit" }).click();
  await expect(page).toHaveURL(new RegExp(`${BASE}/reports/new/opening\\?transaction_date=2026-10-13$`));
  await expect(page.getByRole("heading", { name: "Opening" })).toBeVisible();
  await expect(toast(page, "Back to draft — opening it for you now.")).toBeVisible();
  expect(sent.reopen).toBe(1);
});

test("Edit on a report in Xero asks first (Flask's confirm); No sends nothing", async ({ page }) => {
  const sent = await open(page, { list: () => listAnswer({ reports: [row({ was_published: true }), ...ROWS.slice(1)] }) });
  const asked: string[] = [];
  page.once("dialog", (d) => {
    asked.push(d.message());
    void d.dismiss();
  });
  await (await menu(page, LATEST)).getByRole("menuitem", { name: "Edit" }).click();
  await expect.poll(() => asked.length).toBe(1);
  expect(asked[0]).toContain("This report was already published to Xero.");
  expect(sent.reopen).toBe(0);
  await expect(page).toHaveURL(new RegExp(`${HISTORY}$`));
});

test("Delete asks in Flask's modal, deletes, and reads the list again in place", async ({ page }) => {
  let deleted = false;
  const sent = await open(page, { list: () => listAnswer(deleted ? { reports: ROWS.slice(1), total_count: 2 } : {}) });
  await (await menu(page, LATEST)).getByRole("menuitem", { name: "Delete" }).click();
  const dialog = page.getByRole("dialog", { name: "Delete Report" });
  await expect(dialog.getByText("Are you sure you want to delete this report? This action cannot be undone.")).toBeVisible();
  await expect(dialog.getByText("It is in Xero")).toHaveCount(0);
  await expectNoHorizontalScroll(page);
  const reads = sent.lists.length;
  deleted = true;
  await dialog.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(toast(page, "That report is deleted.")).toBeVisible();
  await expect(entries(page)).toHaveCount(2);
  await expect(page).toHaveURL(new RegExp(`${HISTORY}$`));
  expect(sent.delete).toBe(1);
  expect(sent.lists).toHaveLength(reads + 1);
});

test("Delete on a report that has been to Xero warns first; Cancel sends nothing", async ({ page }) => {
  const sent = await open(page, { list: () => listAnswer({ reports: [row({ was_published: true, status_label: "Published to Xero" }), ...ROWS.slice(1)] }) });
  await (await menu(page, LATEST)).getByRole("menuitem", { name: "Delete" }).click();
  const dialog = page.getByRole("dialog", { name: "Delete Report" });
  await expect(dialog.getByText("It is in Xero", { exact: true })).toBeVisible();
  await expect(
    dialog.getByText("Deleting it here does not remove its entries in Xero, and publishing this day again adds a second copy. To change the report, use Edit report instead."),
  ).toBeVisible();
  await expectNoHorizontalScroll(page);
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toBeHidden();
  expect(sent.delete).toBe(0);
});

test("a refused Delete says the API's sentence and keeps the list", async ({ page }) => {
  const why = "This report is being published to Xero. Try again when it has finished.";
  const sent = await open(page, { onDelete: (route) => route.fulfill({ status: 409, json: { error: why } }) });
  await (await menu(page, LATEST)).getByRole("menuitem", { name: "Delete" }).click();
  await page.getByRole("dialog", { name: "Delete Report" }).getByRole("button", { name: "Delete", exact: true }).click();
  await expect(toast(page, why)).toBeVisible();
  await expect(toast(page, "That report is deleted.")).toHaveCount(0);
  await expect(page.getByRole("status").filter({ hasText: "Deleting report..." })).toHaveCount(0);
  await expect(entries(page)).toHaveCount(3);
  expect(sent.delete).toBe(1);
});

test("a bad filter in the address says the API's sentence", async ({ page }) => {
  const why = "Choose both dates to see the reports between them.";
  await open(page, { list: (q) => (q.get("end_date") ? listAnswer() : { status: 422, json: { error: why } }) }, `${HISTORY}?start_date=2026-10-01`);
  await expect(page.getByRole("alert").filter({ hasText: why })).toBeVisible();
  await expect(entries(page)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Try again" })).toHaveCount(0);
});

test("a failure says so and offers a retry", async ({ page }) => {
  let down = true;
  await open(page, { list: () => (down ? { status: 500, json: { error: "Something went wrong on our side. Please try again." } } : listAnswer()) });
  await expect(page.getByRole("alert").filter({ hasText: "Something went wrong on our side. Please try again." })).toBeVisible();
  down = false;
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(entries(page)).toHaveCount(3);
});

test("the CSV: the API's export for both dates, saved under its name, then Flask's toast", async ({ page }) => {
  let release: () => void = () => {};
  const held = new Promise<void>((resolve) => (release = resolve));
  const sent = await open(
    page,
    {
      // held, so "Exporting..." can be seen while the API works
      csv: async (route) => {
        await held;
        await route.fulfill(csvFile());
      },
    },
    `${HISTORY}?start_date=2026-10-01&end_date=2026-10-13`,
  );
  const csv = page.getByRole("button", { name: "CSV" });
  await expect(csv).toBeEnabled();
  const download = page.waitForEvent("download");
  await csv.click();
  await expect(page.getByRole("button", { name: "Exporting..." })).toBeDisabled();
  release();
  const file = await download;
  // the API's address with the bearer - never a Flask page
  expect(sent.csv).toHaveLength(1);
  expect(sent.csv[0].search).toBe("?start_date=2026-10-01&end_date=2026-10-13");
  expect(sent.csv[0].auth).toMatch(/^Bearer .+/);
  expect(file.suggestedFilename()).toBe(CSV_NAME);
  await expect(toast(page, "Your CSV export is on its way!")).toBeVisible();
  await expect(page.getByRole("button", { name: "CSV" })).toBeEnabled();
  await expect(page).toHaveURL(new RegExp(`${HISTORY}\\?start_date=2026-10-01&end_date=2026-10-13$`));
});

test("the CSV: a refusal shows the API's sentence and saves nothing", async ({ page }) => {
  const sentence = "Choose a start date on or before the end date.";
  const sent = await open(page, { csv: (route) => route.fulfill({ status: 422, json: { error: sentence } }) }, `${HISTORY}?start_date=2026-10-01&end_date=2026-10-13`);
  let downloads = 0;
  page.on("download", () => (downloads += 1));
  await page.getByRole("button", { name: "CSV" }).click();
  await expect(toast(page, sentence)).toBeVisible();
  await expect(toast(page, "Your CSV export is on its way!")).toHaveCount(0);
  expect(sent.csv).toHaveLength(1);
  expect(downloads).toBe(0);
  await expect(page.getByRole("button", { name: "CSV" })).toBeEnabled();
});

test("the way in: the dashboard's View History and the sidebar's Reports", async ({ page }) => {
  await stub(page);
  await page.route(`${API}/home`, (route) =>
    route.fulfill({
      json: {
        server_today: "2026-10-14",
        user_count: 1,
        currency_code: "HKD",
        latest: { date: "2026-10-13", closing_balance: 1160.5, deposit: 0, deposit_bank_name: "No deposit", deposit_bank_number: "", deposit_correction_missing_settings: [], can_correct_deposit: true, submitter_first_name: "Tess" },
        draft: null,
        draft_date: null,
        published: { "2026-10-13": { id: LATEST, closing_balance: 1160.5, bank_deposit: 0, xero_integrated: false, submitter_first_name: "Tess" } },
        today_has_report: false,
        today_is_latest_report: false,
        xero_settings: { complete: true, missing: [] },
        permissions: { read_only: false, correct_deposit: true },
      },
    }),
  );
  await enter(page, BASE);
  await expect(page.getByRole("link", { name: /View History/ })).toHaveAttribute("href", HISTORY);
  await page.getByRole("button", { name: "Open navigation menu" }).click();
  await expect(page.getByRole("link", { name: "Reports", exact: true })).toHaveAttribute("href", HISTORY);
  await page.getByRole("link", { name: "Reports", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`${HISTORY}$`));
  await expect(page.getByRole("heading", { name: "Report Results" })).toBeVisible();
});

test("the page reloads with no console error", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(e.message));
  await open(page);
  await page.reload();
  await expect(entries(page)).toHaveCount(3);
  expect(errors).toEqual([]);
});
