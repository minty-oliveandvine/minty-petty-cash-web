// The public share page (Wave 2l, Part 15.7's shared variant): `/share/<initials>/<day>/<secret>`
// read with no sign-in, against a STUBBED public API. Needs only `npm run dev`. The page sends no
// Authorization (not even with this app's token in a cookie), shows no action or navigation, and
// words a dead (404) or expired (410) link. Only `/share/...` is public: every other page still goes
// to Flask's hand-off, which is caught here.

import { expect, test, type Page, type Request } from "@playwright/test";

import { companyRef } from "@minty/shared/e2e";
import { expectNoHorizontalScroll, mintModuleToken } from "./helpers";

// Amounts read "HKD 760.00" - owner 2026-10-21: one money rule (@minty/shared/money); they were "HKD760.00".

const ENTITY = "3d65f186-5ba1-4bf7-a1b0-cc64a113eb5c";
const NAME = "E2E Petty Cash Shop";
const BASE = `/entity/${companyRef(ENTITY, NAME)}/petty-cash`;
const SECRET = "AbCdEfGhIjKlMnOpQrStUvWxYz012-_9";
const PATH = `EPCS/13_Oct_2026/${SECRET}`;
const SHARE = `/share/${PATH}`;
const API = `**/api/petty-cash/v1/public/share/${PATH}`;

// The audit facts are on the device's clock: Hong Kong's, wherever this runs.
test.use({ timezoneId: "Asia/Hong_Kong" });

type Json = Record<string, unknown>;

function shared(over: Json = {}): Json {
  return {
    company_name: NAME,
    transaction_date: "2026-10-13",
    currency_code: "HKD",
    status_label: "Submitted",
    status_tone: "info",
    kpis: { total_sales: 1070.5, total_expenses: 240.5, cash_position: 760 },
    sales: {
      methods: [
        {
          sale_id: "s1",
          name: "Octopus",
          value_name: "octopus_sales",
          type: "electronic",
          amount: 200,
        },
        {
          sale_id: "s2",
          name: "Deliveroo",
          value_name: "deliveroo_sales",
          type: "delivery",
          amount: 0,
        },
        {
          sale_id: "s3",
          name: "Foodpanda",
          value_name: "foodpanda_sales",
          type: "delivery",
          amount: 50,
        },
      ],
      cash: 820.5,
      total: 1070.5,
    },
    expenses: {
      lines: [
        {
          item: "General Expenses",
          supplier: "ParknShop",
          remarks: "Bags",
          amount: 120.5,
          receipts: [{ name: "parknshop.png" }],
        },
        { item: "Cleaning", supplier: null, remarks: "", amount: 120, receipts: [] },
      ],
      total: 240.5,
    },
    cash: {
      opening_balance: 500,
      cash_addition: 100,
      cash_addition_type: "company",
      cash_sales: 820.5,
      expenses: 240.5,
      bank_deposit: 300,
      expected: 780,
      counted: 760,
      safe_box: 0,
      difference: { amount: -20, kind: "short", reason: "Change given twice" },
    },
    closing_balance: 760,
    submitted_at: "2026-10-13T18:12:00+08:00",
    submitted_by: "Olive Tan",
    expires_at: "2026-11-12T18:12:00+08:00",
    ...over,
  };
}

type Seen = { reads: Request[]; handoffs: string[]; companyCalls: string[] };

/** The public read stubbed; Flask's hand-off and every company API call caught and counted. */
async function stub(
  page: Page,
  answer: (route: import("@playwright/test").Route) => Promise<void>,
): Promise<Seen> {
  const seen: Seen = { reads: [], handoffs: [], companyCalls: [] };
  await page.route(API, async (route) => {
    seen.reads.push(route.request());
    await answer(route);
  });
  await page.route("**/handoff/**", (route) => {
    seen.handoffs.push(route.request().url());
    return route.fulfill({
      contentType: "text/html",
      body: "<title>Flask hand-off</title><p>Flask hand-off</p>",
    });
  });
  await page.route("**/api/petty-cash/v1/companies/**", (route) => {
    seen.companyCalls.push(route.request().url());
    return route.fulfill({ status: 500, json: { error: "not expected" } });
  });
  await page.route("**/api/me/**", (route) => {
    seen.companyCalls.push(route.request().url());
    return route.fulfill({ status: 500, json: { error: "not expected" } });
  });
  return seen;
}

/** Signed in, as /landing leaves it: this app's token in its cookies - the share page must not send it. */
async function signIn(page: Page) {
  const token = mintModuleToken({
    secret: "stub",
    userId: "u",
    entityId: ENTITY,
    entityName: NAME,
  });
  const url = new URL(test.info().project.use.baseURL ?? "http://localhost:3010").origin;
  await page.context().addCookies(
    Object.entries({
      petty_cash_token: token,
      petty_cash_entity_id: ENTITY,
      petty_cash_entity_name: NAME,
    }).map(([name, value]) => ({ name, value: encodeURIComponent(value), url })),
  );
}

const value = (page: Page, term: string, scope = page.locator("main")) =>
  scope
    .locator("div, dl")
    .filter({
      has: page.locator("dt", { hasText: new RegExp(`^${term.replace(/[().]/g, "\\$&")}$`) }),
    })
    .last()
    .locator("dd")
    .first();

async function open(page: Page, title: string) {
  const summary = page
    .locator("summary")
    .filter({ hasText: new RegExp(`^${title.replace(/[()]/g, "\\$&")}`) });
  await summary.click();
  return page.locator("details").filter({ has: summary });
}

test("the shared report: read-only, with no actions or navigation, and no Authorization sent even when signed in", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await signIn(page);
  const seen = await stub(page, (route) => route.fulfill({ json: shared() }));
  const asked = page.waitForRequest((r) => r.url().includes("/public/share/"));
  await page.goto(SHARE);
  await asked;

  await expect(page.getByRole("heading", { level: 1, name: "Daily Report" })).toBeVisible();
  await expect(
    page.locator("main [data-tone]").filter({ hasText: "Submitted" }).first(),
  ).toHaveAttribute("data-tone", "info");
  await expect(
    page.locator("main").getByText(`Tue 13 Oct 2026 · ${NAME}`, { exact: true }),
  ).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`${SHARE}$`));

  // the read carried nothing of the reader's
  // (twice in development: React runs the effect twice there; once in a build)
  expect(seen.reads.length).toBeGreaterThan(0);
  for (const read of seen.reads) {
    const headers = await read.allHeaders();
    expect(headers["authorization"]).toBeUndefined();
    expect(headers["cookie"]).toBeUndefined();
    expect(headers["referer"]).toBeUndefined();
  }
  expect(seen.handoffs).toEqual([]);
  expect(seen.companyCalls).toEqual([]);

  // the page asks search engines to keep out and sends no referrer
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  await expect(page.locator('meta[name="referrer"]')).toHaveAttribute("content", "no-referrer");

  // no actions, no menu, no sidebar, no way back - and no link anywhere on the page
  for (const name of [
    "Share",
    "Publish to Xero",
    "More report actions",
    "Open navigation menu",
    "Edit reason",
  ]) {
    await expect(page.getByRole("button", { name })).toHaveCount(0);
  }
  await expect(page.getByRole("link")).toHaveCount(0);
  await expect(page.getByRole("navigation")).toHaveCount(0);
  await expect(page.locator("header").getByRole("img", { name: "Minty" })).toBeVisible();

  // the figures, as on the signed-in Daily Report: the outcome band, Cash position its hero
  const kpis = page
    .locator("main dl")
    .filter({ has: page.locator("dt", { hasText: "Cash position" }) });
  await expect(kpis.locator("dt")).toHaveText(["Cash position", "Total sales", "Total expenses"]);
  await expect(value(page, "Cash position", kpis)).toHaveClass(/text-display-xl/);
  await expect(value(page, "Total sales", kpis)).toHaveText("HKD 1,070.50");
  // no charts here: the public read's expense lines carry no account
  await expect(
    page.getByRole("heading", { name: "Where the money came from and went" }),
  ).toHaveCount(0);
  await expect(kpis.getByText("2 expenses", { exact: true })).toBeVisible();
  const fact = page.getByRole("status").filter({ hasText: "Cash was HKD 20.00 short" });
  await expect(fact).toHaveAttribute("data-tone", "warning");
  await expect(fact).toContainText("Note: Change given twice");

  await expect(page.getByText("Octopus")).toBeHidden();
  const sales = await open(page, "Sales by method");
  await expect(value(page, "Octopus", sales)).toHaveText("HKD 200.00");
  await expect(sales.getByText("Deliveroo")).toHaveCount(0);
  await expect(value(page, "Total sales", sales)).toHaveText("HKD 1,070.50");

  const expenses = await open(page, "Expenses (2)");
  await expect(expenses.getByText("General Expenses", { exact: true })).toBeVisible();
  await expect(expenses.getByText("ParknShop", { exact: true })).toBeVisible();
  await expect(expenses.getByText("No supplier")).toBeVisible();
  await expect(value(page, "Total expenses", expenses)).toHaveText("HKD 240.50");

  // a receipt by name only: no View, nothing to press
  const receipts = await open(page, "Receipts (1)");
  await expect(receipts.getByText("parknshop.png")).toBeVisible();
  await expect(receipts.getByRole("button")).toHaveCount(0);

  const cash = await open(page, "Cash");
  await expect(value(page, "Where the cash came from", cash)).toHaveText("Company bank");
  await expect(value(page, "Difference", cash)).toHaveText("HKD 20.00 short");
  await expect(value(page, "Closing balance")).toHaveText("HKD 760.00");
  await expect(page.getByText("Submitted by Olive Tan · Tue 13 Oct 2026, 6:12 pm")).toBeVisible();
  await expect(page.getByText("This link works until Thu 12 Nov 2026, 6:12 pm")).toBeVisible();

  await expectNoHorizontalScroll(page);
  expect(errors).toEqual([]);
});

test("a trimmed answer shows only what arrived", async ({ page }) => {
  await stub(page, (route) =>
    route.fulfill({
      json: {
        company_name: NAME,
        transaction_date: "2026-10-13",
        currency_code: "HKD",
        status_label: "Published to Xero",
        status_tone: "success",
        kpis: { total_sales: 5 },
        closing_balance: 12,
      },
    }),
  );
  await page.goto(SHARE);
  await expect(
    page.locator("main [data-tone]").filter({ hasText: "Published to Xero" }),
  ).toHaveAttribute("data-tone", "success");
  const kpis = page.locator("main dl").first();
  await expect(kpis.locator("dt")).toHaveText(["Total sales"]);
  await expect(page.locator("summary")).toHaveCount(0);
  await expect(value(page, "Closing balance")).toHaveText("HKD 12.00");
  await expect(page.getByText(/^Submitted/)).toHaveCount(0);
});

test("a link that doesn't work (404) and one that expired (410) ask for a fresh one", async ({
  page,
}) => {
  let status = 404;
  await stub(page, (route) => route.fulfill({ status, json: { error: "refused" } }));
  await page.goto(SHARE);
  await expect(
    page.getByRole("heading", { level: 1, name: "This link doesn't work" }),
  ).toBeVisible();
  await expect(
    page.getByText("Ask the person who shared it for a fresh link.", { exact: false }),
  ).toBeVisible();
  await expect(page.getByText("refused")).toHaveCount(0);
  await expect(page.getByText(SECRET)).toHaveCount(0);

  status = 410;
  await page.reload();
  await expect(
    page.getByRole("heading", { level: 1, name: "This link has expired" }),
  ).toBeVisible();
  await expect(
    page.getByText("Ask the person who shared it for a fresh link.", { exact: false }),
  ).toBeVisible();
  await expect(page.getByText(SECRET)).toHaveCount(0);
  await expect(page.getByRole("link")).toHaveCount(0);
  await expectNoHorizontalScroll(page);
});

test("an address that is not a share link reads nothing and says the link doesn't work", async ({
  page,
}) => {
  const seen = await stub(page, (route) => route.fulfill({ json: shared() }));
  await page.route("**/api/petty-cash/v1/public/**", (route) => {
    seen.reads.push(route.request());
    return route.fulfill({ json: shared() });
  });
  await page.goto("/share/EPCS/13_Oct_2026");
  await expect(
    page.getByRole("heading", { level: 1, name: "This link doesn't work" }),
  ).toBeVisible();
  expect(seen.reads).toHaveLength(0);
  expect(seen.handoffs).toEqual([]);
});

test("/share opens without a token; every other page still goes to Flask's hand-off", async ({
  page,
  context,
}) => {
  await context.clearCookies();
  const seen = await stub(page, (route) => route.fulfill({ json: shared() }));
  await page.goto(SHARE);
  await expect(page.getByRole("heading", { level: 1, name: "Daily Report" })).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`${SHARE}$`));
  expect(seen.handoffs).toEqual([]);

  // The gate answers before any page draws: a 307 to Flask's hand-off (asked for directly - a
  // browser would follow it to Flask, which this spec does not need running).
  for (const path of [BASE, `${BASE}/reports`, "/share", "/shared/x/y/z"]) {
    const res = await page.request.get(path, { maxRedirects: 0 });
    expect(res.status(), path).toBe(307);
    expect(new URL(res.headers()["location"] ?? "").pathname, path).toBe("/handoff/petty-cash-web");
  }
  const open = await page.request.get(SHARE, { maxRedirects: 0 });
  expect(open.status()).toBe(200);
  expect(open.headers()["referrer-policy"]).toBe("no-referrer");
  expect(open.headers()["x-robots-tag"]).toBe("noindex, nofollow");
});
