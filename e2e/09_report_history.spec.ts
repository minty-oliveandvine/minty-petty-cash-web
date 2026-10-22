// Report history (components/history/ReportHistory.tsx, Part 15.4b), against a STUBBED Petty Cash
// API. Needs only `npm run dev`. The pages it opens are this app's own (stubbed quietly) - none is
// a Flask page; Export CSV is the API's file (stubbed). Publishing itself is e2e/12_publish.spec.ts.
// Refusals are inline alerts, never toasts; a delete and an export are confirmed with one.

import { expect, test, type Page, type Request, type Route } from "@playwright/test";

import { companyRef } from "@minty/shared/e2e";
import { expectNoHorizontalScroll, mintModuleToken } from "./helpers";

// Amounts read "HKD 760.00" - owner 2026-10-21: one money rule (@minty/shared/money); they were "HKD760.00".

const ENTITY = "3d65f186-5ba1-4bf7-a1b0-cc64a113eb5c";
const NAME = "E2E Petty Cash Shop";
const BASE = `/entity/${companyRef(ENTITY, NAME)}/petty-cash`;
const HISTORY = `${BASE}/reports`;
const exact = (url: string) => new RegExp(`${url.replace(/[?.]/g, "\\$&")}$`);
const stageUrl = (path: string, day: string) =>
  `${BASE}/reports/new/${path}?transaction_date=${day}`;

type Json = Record<string, unknown>;

function row(id: string, day: string, over: Json = {}): Json {
  return {
    id,
    transaction_date: day,
    status: "submitted",
    status_label: "Submitted",
    status_tone: "info",
    current_section: "ending",
    total_sales: 1070.5,
    total_expenses: 240.5,
    submitted_by: "Olive",
    submitted_at: `${day}T18:12:00+08:00`,
    published_at: null,
    publishing_status: "unpublished",
    was_published: false,
    publish_reasons: [],
    permissions: { edit: false, delete: false },
    ...over,
  };
}

const DRAFT_ROW = row("r-draft", "2026-10-14", {
  status: "draft",
  status_label: "Draft",
  status_tone: "neutral",
  current_section: "expenses",
  total_sales: 0,
  total_expenses: 0,
  submitted_by: null,
  submitted_at: null,
});
const LATEST = row("r-13", "2026-10-13", { permissions: { edit: true, delete: true } });
const PUBLISHED = row("r-12", "2026-10-12", {
  status_label: "Published to Xero",
  status_tone: "success",
  was_published: true,
  published_at: "2026-10-12T18:15:00+08:00",
  submitted_by: "Ben",
});
const FAILED = row("r-11", "2026-10-11", {
  status_label: "Publish failed",
  status_tone: "danger",
  was_published: true,
  publish_reasons: [
    { text: "The supplier ParknShop is archived in Xero.", resolved: true },
    { text: "Account 429 is locked for this period.", resolved: false },
  ],
});

function pageAnswer(reports: Json[], over: Json = {}): Json {
  return {
    reports,
    page: 1,
    per_page: 10,
    total_pages: 1,
    total_count: reports.length,
    latest_report_id: "r-draft",
    currency_code: "HKD",
    can_publish: true,
    ...over,
  };
}

/** A Daily Report read, for the pages a row opens. */
function dailyReport(id: string): Json {
  return {
    report_id: id,
    transaction_date: "2026-10-13",
    currency_code: "HKD",
    company_name: NAME,
    status: "submitted",
    status_label: "Submitted",
    status_tone: "info",
    is_latest: true,
    submitted_at: null,
    submitted_by: null,
    published_at: null,
    publishing_status: "unpublished",
    xero_integrated: false,
    was_published: false,
    kpis: { total_sales: 0, total_expenses: 0, cash_position: 0 },
    sales: { methods: [], cash: 0, total: 0 },
    expenses: { lines: [], total: 0 },
    cash: {
      opening_balance: 0,
      cash_addition: 0,
      cash_addition_type: null,
      cash_sales: 0,
      expenses: 0,
      bank_deposit: 0,
      expected: 0,
      counted: 0,
      safe_box: 0,
      difference: { amount: 0, kind: "none", reason: "" },
    },
    closing_balance: 0,
    permissions: { edit: false, delete: false, publish: false, share: false },
  };
}

const DRAFT = {
  id: "r-draft",
  status: "draft",
  current_section: "expenses",
  completed_sections: ["opening", "sales"],
  xero_integrated: false,
  publishing_status: null,
};
const OPENING = {
  transaction_date: "2026-10-14",
  currency_code: "HKD",
  draft: DRAFT,
  starting_cash_balance: 500,
  yesterday_closing_balance: 500,
  safebox_balance: 0,
  cash_addition: null,
  withdrawal: "personal",
};
const EXPENSES = {
  transaction_date: "2026-10-14",
  currency_code: "HKD",
  draft: DRAFT,
  lines: [],
  total: 0,
  suppliers: [],
  accounts: [],
  permissions: { create_supplier: false },
};

type Setup = {
  /** The history's answer for a request (its query, as a URLSearchParams). */
  list?: (query: URLSearchParams, route: Route) => Promise<void>;
  onDelete?: (route: Route) => Promise<void>;
  onReopen?: (route: Route) => Promise<void>;
};

type Calls = { queries: string[]; deletes: string[]; reopens: string[] };

async function stub(page: Page, answer: Json, setup: Setup = {}): Promise<Calls> {
  const calls: Calls = { queries: [], deletes: [], reopens: [] };
  const api = "**/api/petty-cash/v1/companies/*";
  await page.route(/\/api\/petty-cash\/v1\/companies\/[^/]+\/reports(\?.*)?$/, async (route) => {
    const query = new URL(route.request().url()).searchParams;
    calls.queries.push(query.toString());
    if (setup.list) await setup.list(query, route);
    else await route.fulfill({ json: answer });
  });
  await page.route(/\/api\/petty-cash\/v1\/companies\/[^/]+\/reports\/r-[^/?]+$/, async (route) => {
    if (route.request().method() !== "DELETE") return route.fallback();
    calls.deletes.push(new URL(route.request().url()).pathname.split("/").pop() ?? "");
    if (setup.onDelete) await setup.onDelete(route);
    else
      await route.fulfill({
        json: { deleted: "r-13", transaction_date: "2026-10-13", next: "dashboard" },
      });
  });
  // This app's own Daily Report (e2e/08_daily_report.spec.ts covers it): a quiet stub.
  await page.route(/\/api\/petty-cash\/v1\/companies\/[^/]+\/reports\/r-[^/?]+$/, (route) =>
    route.request().method() === "GET"
      ? route.fulfill({
          json: dailyReport(new URL(route.request().url()).pathname.split("/").pop() ?? ""),
        })
      : route.fallback(),
  );
  await page.route(`${api}/reports/*/reopen`, async (route) => {
    calls.reopens.push(new URL(route.request().url()).pathname.split("/").at(-2) ?? "");
    if (setup.onReopen) await setup.onReopen(route);
    else
      await route.fulfill({
        json: {
          report_id: "r-13",
          transaction_date: "2026-10-13",
          status: "draft",
          next: "opening",
        },
      });
  });
  await page.route(`${api}/reports/opening**`, (route) => route.fulfill({ json: OPENING }));
  await page.route(`${api}/reports/expenses**`, (route) => route.fulfill({ json: EXPENSES }));
  await page.route("**/api/me/profile**", (route) =>
    route.fulfill({ json: { user: { name: "Tess Tester", initials: "TT" } } }),
  );
  return calls;
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

async function openWith(
  page: Page,
  answer: Json,
  setup: Setup = {},
  address = HISTORY,
): Promise<Calls> {
  const calls = await stub(page, answer, setup);
  await arrive(page, address);
  await expect(page.getByRole("heading", { level: 1, name: "Reports" })).toBeVisible();
  await expect(page.getByRole("status", { name: "Loading" })).toHaveCount(0);
  return calls;
}

const rows = (page: Page) =>
  page.getByRole("list", { name: "Daily Reports" }).locator(":scope > li");
const rowOf = (page: Page, day: string) =>
  rows(page).filter({ has: page.getByRole("link", { name: day, exact: true }) });
const chip = (page: Page, label: string) =>
  page
    .getByRole("group", { name: "Filter by status" })
    .getByRole("button", { name: label, exact: true });
// exact: "To" is inside "Back to your companies" and Next's "Open Next.js Dev Tools" too
const from = (page: Page) => page.getByLabel("From", { exact: true });
const to = (page: Page) => page.getByLabel("To", { exact: true });
/** The list's reads, once each: React's development mode reads twice on arrival. */
const asked = (calls: Calls) => calls.queries.filter((q, i) => q !== calls.queries[i - 1]);
const more = (page: Page, day: string) =>
  page.getByRole("button", { name: `More actions for ${day}` });
async function choose(page: Page, day: string, item: string) {
  await more(page, day).click();
  await page
    .getByRole("menu", { name: `More actions for ${day}` })
    .getByRole("menuitem", { name: item })
    .click();
}

test("the list: Record rows newest first, Status pills in their tones, figures as plain text, Submitted by, and a failed row's reasons", async ({
  page,
}) => {
  const calls = await openWith(page, pageAnswer([DRAFT_ROW, LATEST, PUBLISHED, FAILED]));
  await expect(page.getByText("Every Daily Report, newest first.")).toBeVisible();
  await expect(page.locator("main").getByRole("link", { name: "Petty Cash" })).toHaveAttribute(
    "href",
    BASE,
  );
  expect(asked(calls)).toEqual([""]);

  await expect(rows(page)).toHaveCount(4);
  const days = await rows(page).getByRole("link").allTextContents();
  expect(days).toEqual([
    "Wed 14 Oct 2026",
    "Tue 13 Oct 2026",
    "Mon 12 Oct 2026",
    "Sun 11 Oct 2026",
  ]);

  const tones: [string, string, string][] = [
    ["Wed 14 Oct 2026", "Draft", "neutral"],
    ["Tue 13 Oct 2026", "Submitted", "info"],
    ["Mon 12 Oct 2026", "Published to Xero", "success"],
    ["Sun 11 Oct 2026", "Publish failed", "danger"],
  ];
  for (const [day, label, tone] of tones) {
    await expect(
      rowOf(page, day).locator("[data-tone]").filter({ hasText: label }),
    ).toHaveAttribute("data-tone", tone);
  }
  const latest = rowOf(page, "Tue 13 Oct 2026");
  await expect(latest).toContainText("Expenses HKD 240.50 · Submitted by Olive");
  await expect(latest.getByText("HKD 1,070.50", { exact: true })).toHaveClass(/text-text-primary/);
  await expect(rowOf(page, "Mon 12 Oct 2026")).toContainText("Submitted by Ben");
  await expect(rowOf(page, "Wed 14 Oct 2026")).toContainText("Daily Closing in progress");

  // a failed publish's reasons, each saying in words whether it is resolved
  const failed = rowOf(page, "Sun 11 Oct 2026");
  await expect(failed).toContainText("Why it didn't reach Xero");
  const reasons = failed.getByRole("listitem");
  await expect(reasons).toHaveCount(2);
  await expect(reasons.nth(0)).toHaveText(
    /The supplier ParknShop is archived in Xero\. · Resolved$/,
  );
  await expect(reasons.nth(1)).toHaveText(/Account 429 is locked for this period\.$/);
  await expect(reasons.nth(1)).not.toContainText("Resolved");
  await expect(rowOf(page, "Tue 13 Oct 2026")).not.toContainText("Why it didn't reach Xero");

  await expect(page.getByText("Showing 1–4 of 4")).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Pagination" })).toHaveCount(0);
  await expectNoHorizontalScroll(page);
});

test("each filter lives in the address, a change goes back to page 1, and Back and reload keep it", async ({
  page,
}) => {
  const calls = await openWith(
    page,
    pageAnswer([LATEST], { page: 2, total_pages: 3, total_count: 21 }),
    {},
    `${HISTORY}?page=2`,
  );
  expect(asked(calls)).toEqual(["page=2"]);
  await expect(chip(page, "All")).toHaveAttribute("aria-pressed", "true");

  await chip(page, "Publish failed").click();
  await expect(page).toHaveURL(exact(`${HISTORY}?status=failed`));
  await expect(chip(page, "Publish failed")).toHaveAttribute("aria-pressed", "true");
  await expect(chip(page, "All")).toHaveAttribute("aria-pressed", "false");
  await expect.poll(() => calls.queries.at(-1)).toBe("status=failed");

  await page.getByLabel("Rows per page").selectOption("25");
  await expect(page).toHaveURL(exact(`${HISTORY}?status=failed&per_page=25`));
  await expect.poll(() => calls.queries.at(-1)).toBe("status=failed&per_page=25");

  await from(page).fill("2026-10-01");
  await to(page).fill("2026-10-13");
  await page.getByRole("button", { name: "Show" }).click();
  await expect(page).toHaveURL(
    exact(`${HISTORY}?status=failed&start_date=2026-10-01&end_date=2026-10-13&per_page=25`),
  );
  await expect
    .poll(() => calls.queries.at(-1))
    .toBe("status=failed&start_date=2026-10-01&end_date=2026-10-13&per_page=25");

  // a page in the address keeps every filter
  await page.getByRole("link", { name: "Next page" }).click();
  await expect(page).toHaveURL(
    exact(`${HISTORY}?status=failed&start_date=2026-10-01&end_date=2026-10-13&page=3&per_page=25`),
  );

  // a reload keeps it all - the chosen chip in view (on a phone its row scrolls to it, the page never sideways)
  await page.reload();
  await expect(chip(page, "Publish failed")).toHaveAttribute("aria-pressed", "true");
  await expect(chip(page, "Publish failed")).toBeInViewport({ ratio: 1 });
  await expectNoHorizontalScroll(page);
  await expect(from(page)).toHaveValue("2026-10-01");
  await expect(page.getByLabel("Rows per page")).toHaveValue("25");

  // Back walks the steps, the fields following the address
  await page.goBack();
  await expect(page).toHaveURL(
    exact(`${HISTORY}?status=failed&start_date=2026-10-01&end_date=2026-10-13&per_page=25`),
  );
  await page.goBack();
  await expect(page).toHaveURL(exact(`${HISTORY}?status=failed&per_page=25`));
  await expect(from(page)).toHaveValue("");
  await expect(to(page)).toHaveValue("");
  await page.goBack();
  await expect(page).toHaveURL(exact(`${HISTORY}?status=failed`));
  await expect(page.getByLabel("Rows per page")).toHaveValue("10");

  // Clear filters: the whole list again
  await page.getByRole("link", { name: "Clear filters" }).click();
  await expect(page).toHaveURL(exact(HISTORY));
  await expect(chip(page, "All")).toHaveAttribute("aria-pressed", "true");
});

test('paging: "Showing a–b of n", the pages on a computer, Previous / Next on a phone, 36 or 44 px targets', async ({
  page,
  isMobile,
}) => {
  await openWith(page, pageAnswer([LATEST], { page: 1, total_pages: 5, total_count: 41 }));
  await expect(page.getByText("Showing 1–10 of 41")).toBeVisible();
  const pager = page.getByRole("navigation", { name: "Pagination" });
  const previous = pager.getByRole("link", { name: "Previous page" });
  await expect(previous).toHaveAttribute("aria-disabled", "true");
  const next = pager.getByRole("link", { name: "Next page" });
  await expect(next).toHaveAttribute("href", `${HISTORY}?page=2`);
  if (isMobile) {
    await expect(pager.getByText("Page 1 of 5")).toBeVisible();
    await expect(pager.getByRole("link", { name: "Page 2" })).toBeHidden();
  } else {
    await expect(pager.getByRole("link", { name: "Page 1" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(pager.getByRole("link", { name: "Page 5" })).toHaveAttribute(
      "href",
      `${HISTORY}?page=5`,
    );
  }
  const box = await next.boundingBox();
  expect(Math.round(box!.height)).toBe(isMobile ? 44 : 36);
  await next.click();
  await expect(page).toHaveURL(exact(`${HISTORY}?page=2`));
});

test("a page past the end opens the last page", async ({ page }) => {
  await openWith(
    page,
    {},
    {
      list: (q, route) =>
        route.fulfill({
          json:
            q.get("page") === "9"
              ? pageAnswer([], { page: 9, total_pages: 2, total_count: 12 })
              : pageAnswer([LATEST], { page: 2, total_pages: 2, total_count: 12 }),
        }),
    },
    `${HISTORY}?page=9`,
  );
  await expect(page).toHaveURL(exact(`${HISTORY}?page=2`));
  await expect(page.getByText("Showing 11–12 of 12")).toBeVisible();
});

test("the date range: one date alone is said only on Show; an end before the start at once; Enter shows", async ({
  page,
}) => {
  const calls = await openWith(page, pageAnswer([LATEST]));
  const fromField = from(page);
  const toField = to(page);

  // one date alone: "not finished yet", so nothing is said until Show - then the missing one, which takes the focus
  await fromField.fill("2026-10-13");
  await fromField.blur();
  await expect(page.getByText(/is still empty/)).toHaveCount(0);
  await page.getByRole("button", { name: "Show" }).click();
  await expect(
    page.getByText(
      "The To date is still empty. Choose it to see the reports between the two dates.",
    ),
  ).toBeVisible();
  await expect(toField).toHaveAttribute("aria-invalid", "true");
  await expect(toField).toBeFocused();
  await expect(page).toHaveURL(exact(HISTORY));

  // an end before the start: said as soon as it is there
  await toField.fill("2026-10-01");
  await expect(page.getByText(/is still empty/)).toHaveCount(0);
  await expect(
    page.getByText("The end date is before the start date. Choose a later end date."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Show" }).click();
  await expect(toField).toBeFocused();
  await expect(page).toHaveURL(exact(HISTORY));
  expect(asked(calls)).toEqual([""]);

  await toField.fill("2026-10-13");
  await expect(page.getByText("The end date is before the start date.")).toHaveCount(0);
  await expect(toField).not.toHaveAttribute("aria-invalid", "true");
  await toField.press("Enter");
  await expect(page).toHaveURL(exact(`${HISTORY}?start_date=2026-10-13&end_date=2026-10-13`));
});

const EXPORT = /\/api\/petty-cash\/v1\/companies\/[^/]+\/reports\/export\.csv(\?.*)?$/;

/** Show 1 Oct - 13 Oct, so Export CSV is offered. */
async function showRange(page: Page) {
  await from(page).fill("2026-10-01");
  await to(page).fill("2026-10-13");
  await page.getByRole("button", { name: "Show" }).click();
  await expect(page).toHaveURL(/start_date=2026-10-01&end_date=2026-10-13/);
}

test("Export CSV waits for both dates with its reason beside it, then saves the API's file under the server's name", async ({
  page,
}) => {
  const asked: Request[] = [];
  let release!: () => void;
  const held = new Promise<void>((r) => (release = r));
  await page.route(EXPORT, async (route) => {
    asked.push(route.request());
    await held; // the button's progress can be read meanwhile
    await route.fulfill({
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": "attachment; filename=reports_2026-10-01_to_2026-10-13.csv",
        "Access-Control-Expose-Headers": "Content-Disposition",
      },
      body: "Date,Account Code,Amount,Description,Reference,Check Number\r\n",
    });
  });
  await openWith(page, pageAnswer([LATEST]));
  const gated = page.getByRole("button", { name: "Export CSV" });
  await expect(gated).toBeDisabled();
  await expect(gated).toHaveAttribute("aria-describedby", "csv-reason");
  await expect(page.locator("#csv-reason")).toHaveText(
    "To export, choose both dates and select Show.",
  );
  // typed but not shown: still waiting - it exports what the list shows
  await from(page).fill("2026-10-01");
  await to(page).fill("2026-10-13");
  await expect(gated).toBeDisabled();
  await page.getByRole("button", { name: "Show" }).click();
  await expect(page.locator("#csv-reason")).toHaveCount(0);
  // a button that reads the API with the bearer - never a link to a Flask page
  await expect(page.getByRole("link", { name: "Export CSV" })).toHaveCount(0);
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export CSV" }).click();
  const busy = page.getByRole("button", { name: "Exporting…" });
  await expect(busy).toBeDisabled();
  await expect(busy).toHaveAttribute("aria-busy", "true");
  release();
  const file = await download;
  expect(file.suggestedFilename()).toBe("reports_2026-10-01_to_2026-10-13.csv");
  expect(asked).toHaveLength(1);
  const url = new URL(asked[0].url());
  expect(asked[0].method()).toBe("GET");
  expect(url.pathname).toBe(`/api/petty-cash/v1/companies/${ENTITY}/reports/export.csv`);
  expect(url.searchParams.get("start_date")).toBe("2026-10-01");
  expect(url.searchParams.get("end_date")).toBe("2026-10-13");
  expect(await asked[0].headerValue("authorization")).toMatch(/^Bearer .+/);
  await expect(page.locator("[data-toast-type]")).toContainText(
    "Reports exported to reports_2026-10-01_to_2026-10-13.csv.",
  );
  await expect(page.getByRole("button", { name: "Export CSV" })).toBeEnabled();
});

test("Export CSV refused: the API's sentence inline, no file and no toast; a retry that goes through clears it", async ({
  page,
}) => {
  let refuse = true;
  await page.route(EXPORT, (route) =>
    refuse
      ? route.fulfill({
          status: 422,
          json: { error: "The To date is before the From date. Choose a To date on or after it." },
        })
      : route.fulfill({
          status: 200,
          headers: { "Content-Type": "text/csv; charset=utf-8" },
          body: "Date\r\n",
        }),
  );
  await openWith(page, pageAnswer([LATEST]));
  await showRange(page);
  let downloads = 0;
  page.on("download", () => (downloads += 1));
  await page.getByRole("button", { name: "Export CSV" }).click();
  await expect(
    page.getByText("The To date is before the From date. Choose a To date on or after it."),
  ).toBeVisible();
  await expect(page.locator("[data-toast-type]")).toHaveCount(0);
  expect(downloads).toBe(0);
  await expectNoHorizontalScroll(page);
  // without a readable Content-Disposition the file takes the name the server gives
  refuse = false;
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export CSV" }).click();
  expect((await download).suggestedFilename()).toBe("reports_2026-10-01_to_2026-10-13.csv");
  await expect(
    page.getByText("The To date is before the From date.", { exact: false }),
  ).toHaveCount(0);
});

test("no reports at all: the first-use empty state", async ({ page }) => {
  await openWith(page, pageAnswer([], { total_count: 0, latest_report_id: null }));
  await expect(page.getByText("No reports yet")).toBeVisible();
  await expect(page.getByText("Completed Daily Reports will appear here.")).toBeVisible();
  await expect(page.locator("main img[alt='']")).toHaveCount(1);
  await expect(
    page.getByRole("main").getByRole("link", { name: "Go to Petty Cash" }),
  ).toHaveAttribute("href", BASE);
  await expect(page.getByText(/^Showing/)).toHaveCount(0);
});

test("no reports match the filters: no character, and Clear filters", async ({ page }) => {
  const calls = await openWith(
    page,
    pageAnswer([], { total_count: 0 }),
    {},
    `${HISTORY}?status=draft&start_date=2026-01-01&end_date=2026-01-31`,
  );
  await expect(page.getByText("No reports match these filters")).toBeVisible();
  await expect(page.getByText("Try another date range or status.")).toBeVisible();
  await expect(page.locator("main img")).toHaveCount(0);
  const clear = page.getByRole("main").getByRole("link", { name: "Clear filters" }).last();
  await clear.click();
  await expect(page).toHaveURL(exact(HISTORY));
  await expect.poll(() => calls.queries.at(-1)).toBe("");
});

test("a filter the API refuses shows its sentence; any other failure says so and offers Try again", async ({
  page,
}) => {
  const why = "That status filter isn't one I know. Choose Draft, Submitted, Published or Failed.";
  let fail = true;
  const calls = await openWith(
    page,
    {},
    {
      list: (q, route) =>
        q.get("status") === "late"
          ? route.fulfill({ status: 422, json: { error: why } })
          : fail
            ? route.fulfill({
                status: 500,
                json: { error: "Something went wrong on my end. Mind trying again?" },
              })
            : route.fulfill({ json: pageAnswer([LATEST]) }),
    },
    `${HISTORY}?status=late`,
  );
  const refusal = page.getByRole("alert").filter({ hasText: why });
  await expect(refusal).toHaveAttribute("data-tone", "danger");
  expect(asked(calls)).toEqual(["status=late"]);
  await refusal.getByRole("link", { name: "Clear filters" }).click();
  await expect(page).toHaveURL(exact(HISTORY));

  const failure = page
    .getByRole("alert")
    .filter({ hasText: "Something went wrong on my end. Mind trying again?" });
  await expect(failure).toBeVisible();
  fail = false;
  await failure.getByRole("button", { name: "Try again" }).click();
  await expect(rows(page)).toHaveCount(1);
  await expect(page.locator("[data-toast-type]")).toHaveCount(0);
});

test("opening a row: a submitted row opens its Daily Report; a draft opens the stage it was left on", async ({
  page,
}) => {
  await openWith(page, pageAnswer([DRAFT_ROW, LATEST]));
  await page.evaluate(() => Object.assign(window, { __stayed: true }));
  const submitted = rowOf(page, "Tue 13 Oct 2026").getByRole("link", { name: "Tue 13 Oct 2026" });
  await expect(submitted).toHaveAttribute("href", `${BASE}/reports/r-13/summary`);
  // the whole card opens it - a click anywhere on it, not only on the day
  await rowOf(page, "Tue 13 Oct 2026").click();
  await expect(page).toHaveURL(exact(`${BASE}/reports/r-13/summary`));
  await page.goBack();
  await expect(page).toHaveURL(exact(HISTORY));

  // a draft: its own stage for its day, where it was left (the row's current_section)
  const draft = rowOf(page, "Wed 14 Oct 2026").getByRole("link", { name: "Wed 14 Oct 2026" });
  await expect(draft).toHaveAttribute("href", stageUrl("expense", "2026-10-14"));
  await draft.click();
  await expect(page).toHaveURL(exact(stageUrl("expense", "2026-10-14")));
  await expect(page.getByRole("heading", { level: 1, name: "Expenses" })).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { __stayed?: boolean }).__stayed)).toBe(
    true,
  );
});

test("a draft that names no section opens Addition to Drawer for its day", async ({ page }) => {
  await openWith(page, pageAnswer([{ ...DRAFT_ROW, current_section: null }]));
  const draft = rowOf(page, "Wed 14 Oct 2026").getByRole("link");
  await expect(draft).toHaveAttribute("href", stageUrl("opening", "2026-10-14"));
  await draft.click();
  await expect(page).toHaveURL(exact(stageUrl("opening", "2026-10-14")));
  await expect(page.getByRole("heading", { level: 1, name: "Addition to Drawer" })).toBeVisible();
});

test("row actions show only where the API allows; Publish to Xero asks first, in the app", async ({
  page,
}) => {
  await openWith(page, pageAnswer([DRAFT_ROW, LATEST, PUBLISHED]));
  await expect(more(page, "Wed 14 Oct 2026")).toHaveCount(0);
  await more(page, "Tue 13 Oct 2026").click();
  const menu = page.getByRole("menu", { name: "More actions for Tue 13 Oct 2026" });
  // (the text carries each icon's ligature first)
  await expect(menu.getByRole("menuitem")).toHaveText([
    /Publish to Xero$/,
    /Edit report$/,
    /Delete report$/,
  ]);
  await page.keyboard.press("Escape");
  await expect(more(page, "Tue 13 Oct 2026")).toBeFocused();

  await more(page, "Mon 12 Oct 2026").click();
  const again = page
    .getByRole("menu", { name: "More actions for Mon 12 Oct 2026" })
    .getByRole("menuitem");
  await expect(again).toHaveText([/Publish to Xero again$/]);
  // publishing itself is e2e/12_publish.spec.ts
  await again.click();
  await expect(page.getByRole("alertdialog", { name: "Publish to Xero again?" })).toBeVisible();
});

test("without can_publish, earlier reports have no More menu", async ({ page }) => {
  await openWith(page, pageAnswer([LATEST, PUBLISHED], { can_publish: false }));
  await expect(more(page, "Mon 12 Oct 2026")).toHaveCount(0);
  await more(page, "Tue 13 Oct 2026").click();
  await expect(page.getByRole("menu").getByRole("menuitem")).toHaveText([
    /Edit report$/,
    /Delete report$/,
  ]);
});

test("Edit report asks first, reopens the report and opens Addition to Drawer for the day", async ({
  page,
}) => {
  const calls = await openWith(page, pageAnswer([LATEST]));
  await choose(page, "Tue 13 Oct 2026", "Edit report");
  const dialog = page.getByRole("alertdialog", { name: "Edit this report?" });
  await expect(dialog).toContainText(
    "It goes back to a draft so every stage can be changed, then you submit it again.",
  );
  await expect(dialog.getByRole("button", { name: "Cancel" })).toBeFocused();
  await dialog.getByRole("button", { name: "Edit report" }).click();
  await expect(page).toHaveURL(exact(stageUrl("opening", "2026-10-13")));
  await expect(page.getByRole("heading", { level: 1, name: "Addition to Drawer" })).toBeVisible();
  expect(calls.reopens).toEqual(["r-13"]);
});

test("Delete asks in Danger with Cancel first, deletes, and the list reloads in place with a toast", async ({
  page,
}) => {
  let deleted = false;
  const calls = await openWith(
    page,
    {},
    {
      list: (_q, route) =>
        route.fulfill({
          json: deleted ? pageAnswer([PUBLISHED]) : pageAnswer([LATEST, PUBLISHED]),
        }),
      onDelete: async (route) => {
        deleted = true;
        await route.fulfill({
          json: { deleted: "r-13", transaction_date: "2026-10-13", next: "dashboard" },
        });
      },
    },
  );
  await choose(page, "Tue 13 Oct 2026", "Delete report");
  const dialog = page.getByRole("alertdialog", { name: "Delete this report?" });
  await expect(dialog).toContainText(
    "The Daily Report for Tue 13 Oct 2026 is deleted with its expenses and receipts. This can't be undone.",
  );
  await expect(dialog.getByText("It is in Xero")).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: "Cancel" })).toBeFocused();
  const confirm = dialog.getByRole("button", { name: "Delete report" });
  await expect(confirm).toHaveClass(/bg-action-danger/);
  await confirm.click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator("[data-toast-type=success]")).toContainText(
    "The Daily Report for Tue 13 Oct 2026 is deleted.",
  );
  await expect(rows(page)).toHaveCount(1);
  await expect(rowOf(page, "Tue 13 Oct 2026")).toHaveCount(0);
  await expect(page).toHaveURL(exact(HISTORY));
  await expect(page.getByRole("heading", { level: 1, name: "Reports" })).toBeFocused();
  expect(calls.deletes).toEqual(["r-13"]);
  // read again in place: the same address
  expect(new Set(calls.queries)).toEqual(new Set([""]));
});

test("Delete on a report that has been to Xero warns first, and may still delete", async ({
  page,
}) => {
  const calls = await openWith(
    page,
    pageAnswer([
      row("r-13", "2026-10-13", {
        ...PUBLISHED,
        id: "r-13",
        transaction_date: "2026-10-13",
        permissions: { edit: true, delete: true },
      }),
    ]),
  );
  await choose(page, "Tue 13 Oct 2026", "Delete report");
  const dialog = page.getByRole("alertdialog", { name: "Delete this report?" });
  const warning = dialog.getByRole("status").filter({ hasText: "It is in Xero" });
  await expect(warning).toHaveAttribute("data-tone", "warning");
  await expect(warning).toContainText(
    "Deleting it here does not remove its entries in Xero, and publishing this day again adds a second copy. To change the report, use Edit report instead.",
  );
  await dialog.getByRole("button", { name: "Delete report" }).click();
  await expect(dialog).toHaveCount(0);
  expect(calls.deletes).toEqual(["r-13"]);
});

test("a refused delete shows the API's sentence inside the dialog, and the row stays", async ({
  page,
}) => {
  const why = "Only the latest report can be deleted.";
  const calls = await openWith(page, pageAnswer([LATEST]), {
    onDelete: (route) => route.fulfill({ status: 400, json: { error: why } }),
  });
  const reads = calls.queries.length;
  await choose(page, "Tue 13 Oct 2026", "Delete report");
  const dialog = page.getByRole("alertdialog", { name: "Delete this report?" });
  await dialog.getByRole("button", { name: "Delete report" }).click();
  await expect(dialog.getByRole("alert").filter({ hasText: why })).toHaveAttribute(
    "data-tone",
    "danger",
  );
  await expect(dialog.getByRole("button", { name: "Delete report" })).toBeEnabled();
  await expect(page.locator("[data-toast-type]")).toHaveCount(0);
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(rows(page)).toHaveCount(1);
  expect(calls.deletes).toEqual(["r-13"]);
  expect(calls.queries).toHaveLength(reads);
});

test("the launch page's See all and the sidebar's Reports open the history in the app", async ({
  page,
}) => {
  await stub(page, pageAnswer([LATEST]));
  await page.route("**/api/petty-cash/v1/companies/*/home", (route) =>
    route.fulfill({
      json: {
        server_today: "2026-10-14",
        user_count: 1,
        currency_code: "HKD",
        latest: {
          date: "2026-10-13",
          closing_balance: 760,
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
          "2026-10-13": {
            id: "r-13",
            closing_balance: 760,
            bank_deposit: 0,
            xero_integrated: false,
            submitter_first_name: "Olive",
          },
        },
        today_has_report: false,
        today_is_latest_report: true,
        xero_settings: { complete: true, missing: [] },
        permissions: { read_only: false, correct_deposit: true },
      },
    }),
  );
  await arrive(page, BASE);
  await page.evaluate(() => Object.assign(window, { __stayed: true }));
  const seeAll = page
    .getByRole("region", { name: "Recent reports" })
    .getByRole("link", { name: "See all" });
  await expect(seeAll).toHaveAttribute("href", HISTORY);
  await seeAll.click();
  await expect(page).toHaveURL(exact(HISTORY));
  await expect(page.getByRole("heading", { level: 1, name: "Reports" })).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { __stayed?: boolean }).__stayed)).toBe(
    true,
  );

  await page.goBack();
  await page.getByRole("button", { name: "Open navigation menu" }).click();
  const reports = page.getByRole("link", { name: "Reports", exact: true });
  await expect(reports).toHaveAttribute("href", HISTORY);
  await reports.click();
  await expect(page).toHaveURL(exact(HISTORY));
  await expect(page.getByRole("heading", { level: 1, name: "Reports" })).toBeVisible();
});

test("the Daily Report's way back is the history", async ({ page }) => {
  await stub(page, pageAnswer([LATEST]));
  await arrive(page, `${BASE}/reports/r-13/summary`);
  await page.getByRole("main").getByRole("link", { name: "Reports" }).click();
  await expect(page).toHaveURL(exact(HISTORY));
  await expect(rows(page)).toHaveCount(1);
});

test("the largest amounts and long reasons are never clipped, and the page never scrolls sideways", async ({
  page,
}) => {
  const big = 99999999999.99;
  await openWith(
    page,
    pageAnswer(
      [
        row("r-13", "2026-10-13", {
          total_sales: big,
          total_expenses: big,
          submitted_by: "Bartholomew-Alexander",
          permissions: { edit: true, delete: true },
        }),
        row("r-12", "2026-10-12", {
          status_label: "Publish failed",
          status_tone: "danger",
          total_sales: big,
          publish_reasons: [
            {
              text: `${"A supplier with a very long trading name Limited ".repeat(4)}is archived in Xero.`,
              resolved: true,
            },
            { text: "x".repeat(200), resolved: false },
          ],
        }),
      ],
      { page: 3, total_pages: 12, total_count: 120 },
    ),
    {},
    `${HISTORY}?status=failed&start_date=2026-01-01&end_date=2026-10-13&page=3`,
  );
  // the icon font: until it loads, a glyph is its ligature's text, wider than its button
  await page.evaluate(() => document.fonts.ready);
  const clipped = await page.evaluate(() =>
    Array.from(document.querySelectorAll("main p, main span, main a, main button, main label"))
      .filter(
        (el) => el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflowX !== "auto",
      )
      .map((el) => el.textContent),
  );
  expect(clipped).toEqual([]);
  await expectNoHorizontalScroll(page);
});

test("the page reloads with no console error", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("requestfailed", (r: Request) => errors.push(`failed: ${r.url()}`));
  await openWith(page, pageAnswer([DRAFT_ROW, LATEST, PUBLISHED, FAILED]));
  // Arriving through /landing renders in the browser only; a reload is a full server render that
  // the browser then hydrates - where a mismatch shows.
  await page.reload();
  await expect(page.getByRole("heading", { level: 1, name: "Reports" })).toBeVisible();
  await expect(rows(page)).toHaveCount(4);
  expect(errors).toEqual([]);
});
