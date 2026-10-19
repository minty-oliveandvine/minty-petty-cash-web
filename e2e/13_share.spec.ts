// The public share page (app/share/[...path], components/report/SharedReport.tsx): a shared Daily
// Report in Flask's ORIGINAL shared look, read with no token, against a STUBBED public read. Needs
// only `npm run dev`; Flask's hand-off is caught, so nothing leaves the app.

import { expect, test, type Page, type Request } from "@playwright/test";

import { companyRef } from "./companyRef";
import { expectNoHorizontalScroll, mintModuleToken } from "./helpers";

const ENTITY = "3d65f186-5ba1-4bf7-a1b0-cc64a113eb5c";
const NAME = "E2E Petty Cash Shop";
const BASE = `/entity/${companyRef(ENTITY, NAME)}/petty-cash`;
const SECRET = "Ab3_-xYz0123456789abcdefghijklmn";
const PATH = `EPCS/13_Oct_2026/${SECRET}`;
const PAGE = `/share/${PATH}`;
const PUBLIC = "**/api/petty-cash/v1/public/share/**";

type Json = Record<string, unknown>;

const HISTORY = Array.from({ length: 30 }, (_, i) => {
  const d = new Date(Date.UTC(2026, 8, 14 + i));
  return { date: d.toISOString().slice(0, 10), total: i === 29 ? 1234.5 : (i % 5) * 200 };
});

/** The public read in full (the contract): 13 OCT, submitted, 11.00 short. */
function shared(over: Json = {}): Json {
  return {
    company_name: NAME,
    transaction_date: "2026-10-13",
    currency_code: "HKD",
    status_label: "Submitted",
    status_tone: "info",
    kpis: { total_sales: 1234.5, total_expenses: 128.5, cash_position: 1160.5 },
    sales: {
      methods: [
        { name: "Visa", value_name: "visa_sales", type: "electronic", amount: 400 },
        { name: "Cash", value_name: "cash_sales", type: "other", amount: 600 },
        { name: "Keeta", value_name: "keeta_sales", type: "delivery", amount: 234.5 },
      ],
      cash: 600,
      total: 1234.5,
      yesterday_total: 1000,
      history: HISTORY,
    },
    expenses: {
      lines: [
        { item: "Food & Drink", supplier: "Acme", remarks: "", amount: 78.5, receipts: [{ name: "receipt.pdf" }] },
        { item: "Cleaning", supplier: "Acme", remarks: "", amount: 50 },
      ],
      total: 128.5,
    },
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
    submitted_at: "2026-10-13T12:00:00+00:00",
    submitted_by: "Tess",
    expires_at: "2026-11-12T12:00:00+00:00",
    ...over,
  };
}

/** Every request the page makes, and the public read answered as given. */
async function stub(page: Page, answer: { status?: number; json: Json } = { json: shared() }) {
  const requests: Request[] = [];
  page.on("request", (r) => requests.push(r));
  const reads: string[] = [];
  await page.route(PUBLIC, (route) => {
    reads.push(route.request().url());
    return route.fulfill({ status: answer.status ?? 200, json: answer.json });
  });
  // a stray hand-off or profile read would show here, never leave the app
  await page.route(/\/handoff\//, (route) => route.fulfill({ contentType: "text/html", body: "<title>Hand-off</title><p>Hand-off</p>" }));
  await page.route("**/api/me/profile**", (route) => route.fulfill({ json: { user: { name: "Tess Tester", initials: "TT" } } }));
  return { requests, reads };
}

/** The page's sentence (Next's route announcer is an alert too). */
const refusal = (page: Page) => page.locator("p[role=alert]");
const card = (page: Page, title: string) => page.locator("div.shadow-flask-sm").filter({ has: page.getByRole("heading", { name: title, exact: true }) });

/** No request from the page carried a bearer, reached Flask's hand-off or read the person. */
async function expectNothingPrivate(requests: Request[]) {
  for (const r of requests) {
    expect(await r.headerValue("authorization"), `${r.method()} ${new URL(r.url()).pathname}`).toBeNull();
    expect(r.url()).not.toMatch(/\/handoff\/|\/api\/me\/profile/);
  }
}

test("the shared report: Flask's shared view - the day, the company, the summary, and nothing to do", async ({ page }) => {
  const { requests, reads } = await stub(page);
  await page.goto(PAGE);
  await expect(page.getByRole("heading", { name: "Summary", exact: true })).toBeVisible();
  expect(new URL(page.url()).pathname).toBe(PAGE);

  // the header: the day, the company's name beside it, the badge - no chevron, no person, no menu
  const header = page.getByRole("heading", { level: 1, name: NAME }).locator("..");
  await expect(header.getByText("13 OCT", { exact: true })).toBeVisible();
  await expect(header.getByRole("heading", { level: 1, name: NAME })).toBeVisible();
  await expect(header.getByText("Submitted", { exact: true })).toBeVisible();
  // no link anywhere - not even a closed sidebar's
  await expect(page.locator("a")).toHaveCount(0);
  await expect(page.locator("nav")).toHaveCount(0);
  for (const name of ["Back", "Back to your companies", "My Profile", "Open navigation menu"]) {
    await expect(page.getByRole("link", { name })).toHaveCount(0);
    await expect(page.getByRole("button", { name })).toHaveCount(0);
  }

  // the summary's cards, as the submitted view draws them
  await expect(page.getByText("HKD", { exact: true })).toBeVisible();
  await expect(card(page, "Total Sales")).toContainText("1,234.50");
  await expect(card(page, "Total Sales")).toContainText("Electronic Sales");
  await expect(card(page, "Total Sales")).toContainText("600.00"); // cash once, not the cash row again
  await expect(card(page, "Sales History")).toBeVisible();
  await expect(card(page, "Total Expenses")).toContainText("Food and Drink");
  await expect(card(page, "Cash Balance")).toContainText("1,160.50");
  await expect(page.getByText("Cash Shortage:")).toBeVisible();
  await expect(page.getByText("Paid a courier")).toBeVisible();

  // read-only: Show more is the only button; no Share, Delete, Edit, Close, and no receipt to open
  // (the phone card's: Next's dev indicator is a button outside it)
  const buttons = await page.locator(".flask-main-container").getByRole("button").allInnerTexts();
  expect(buttons.map((b) => b.trim())).toEqual(["Show more", "Show more", "Show more"]);
  await expect(page.getByText("receipt.pdf")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /View/ })).toHaveCount(0);

  // the secret stays out of search engines and Referers
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  await expect(page.locator('meta[name="referrer"]')).toHaveAttribute("content", "no-referrer");
  await expect(page).toHaveTitle(`Report Summary - ${NAME}`);

  // (twice under the dev server's Strict Mode; the first answer is dropped)
  expect(reads.length).toBeGreaterThan(0);
  for (const url of reads) expect(new URL(url).pathname).toBe(`/api/petty-cash/v1/public/share/${PATH}`);
  await expectNothingPrivate(requests);
  await expectNoHorizontalScroll(page);
});

test("a signed-in person opening a share link still sends no bearer", async ({ page }) => {
  const { requests } = await stub(page);
  await page.route("**/api/petty-cash/v1/companies/**", (route) => route.fulfill({ status: 500, json: { error: "not in this test" } }));
  const token = mintModuleToken({ secret: "stub", userId: "u", entityId: ENTITY, entityName: NAME });
  // the landing stores the token cookie; `next` is the share page itself
  await page.goto(`/landing?${new URLSearchParams({ token, entity_id: ENTITY, entity_name: NAME, next: PAGE })}`);
  await page.goto(PAGE);
  await expect(page.getByRole("heading", { name: "Summary", exact: true })).toBeVisible();
  const cookies = await page.context().cookies();
  expect(cookies.some((c) => c.name === "petty_cash_token")).toBe(true);
  await expectNothingPrivate(requests.filter((r) => new URL(r.url()).pathname.startsWith("/api/petty-cash/v1/public/")));
  expect(requests.filter((r) => new URL(r.url()).pathname.startsWith("/api/petty-cash/v1/public/"))).not.toHaveLength(0);
});

test("only what arrives is drawn: no history, no yesterday, no expenses, no difference", async ({ page }) => {
  await stub(page, {
    json: shared({
      sales: { methods: [], cash: 50, total: 50 },
      expenses: { total: 0 },
      cash: { counted: 50, safe_box: 0, difference: { amount: 0, kind: "none" } },
      status_label: "Published to Xero",
      status_tone: "success",
    }),
  });
  await page.goto(PAGE);
  await expect(page.getByRole("heading", { name: "Summary", exact: true })).toBeVisible();
  await expect(card(page, "Sales History")).toHaveCount(0);
  await expect(card(page, "Total Expenses")).toContainText("No expenses recorded");
  await expect(page.getByText(/Cash (Shortage|Surplus):/)).toHaveCount(0);
  await expect(page.getByRole("heading", { level: 1, name: NAME }).locator("..").getByText("Published", { exact: true })).toBeVisible();
  await expectNoHorizontalScroll(page);
});

test("a link that doesn't work: Flask's sentence, and nothing of the API's answer or the address", async ({ page }) => {
  await stub(page, { status: 404, json: { error: `no link ${SECRET}` } });
  await page.goto(PAGE);
  await expect(refusal(page)).toHaveText("This link doesn't work anymore. Could you ask for a fresh one?");
  await expect(page.getByRole("heading", { name: "Summary", exact: true })).toHaveCount(0);
  expect(await page.locator("body").innerText()).not.toContain(SECRET);
  await expect(page.locator("a")).toHaveCount(0);
  await expect(page.locator(".flask-main-container button")).toHaveCount(0);
  await expectNoHorizontalScroll(page);
});

test("an expired link: Flask's sentence", async ({ page }) => {
  await stub(page, { status: 410, json: { error: "expired" } });
  await page.goto(PAGE);
  await expect(refusal(page)).toHaveText("This link has expired. Could you ask for a fresh one?");
  expect(await page.locator("body").innerText()).not.toContain(SECRET);
});

test("an address that is not a share link is refused without asking the API", async ({ page }) => {
  const { reads } = await stub(page);
  await page.goto("/share/EPCS/13_Oct_2026");
  await expect(refusal(page)).toHaveText("This link doesn't work anymore. Could you ask for a fresh one?");
  await page.goto("/share/EPCS/13_Oct_2026/short");
  await expect(refusal(page)).toHaveText("This link doesn't work anymore. Could you ask for a fresh one?");
  expect(reads).toEqual([]);
});

test("initials outside ASCII reach the API escaped once", async ({ page }) => {
  const { reads } = await stub(page);
  await page.goto(`/share/%C3%89V/13_Oct_2026/${SECRET}`);
  await expect(page.getByRole("heading", { name: "Summary", exact: true })).toBeVisible();
  expect(new URL(reads[0]).pathname).toBe(`/api/petty-cash/v1/public/share/%C3%89V/13_Oct_2026/${SECRET}`);
});

test("/share opens with no token, while every other page still goes to Flask's hand-off", async ({ page }) => {
  await stub(page);
  await page.goto(PAGE);
  await expect(page.getByRole("heading", { name: "Summary", exact: true })).toBeVisible();
  expect(new URL(page.url()).pathname).toBe(PAGE);

  // the context has no cookie: what the gate answers, redirects not followed
  expect(await page.context().cookies()).toEqual([]);
  const open = await page.request.get(PAGE, { maxRedirects: 0 });
  expect(open.status()).toBe(200);
  for (const path of [BASE, `${BASE}/reports`, `${BASE}/reports/r1/summary`, `/entity/${companyRef(ENTITY, NAME)}/settings/petty-cash`, "/share", `${BASE}/share/${PATH}`, "/"]) {
    const res = await page.request.get(path, { maxRedirects: 0 });
    expect(res.status(), path).toBe(307);
    expect(new URL(res.headers()["location"] ?? "").pathname, path).toBe("/handoff/petty-cash-web");
  }
});

test("the shared page reloads with no console error", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(e.message));
  await stub(page);
  await page.goto(PAGE);
  await expect(page.getByRole("heading", { name: "Summary", exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Summary", exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});
