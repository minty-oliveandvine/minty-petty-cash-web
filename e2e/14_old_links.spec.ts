// Old `pettycash.dailyminty.com` links after the host switch (lib/oldLinks.ts, proxy.ts): Flask's
// share link lands on this app's share page, an older Petty Cash address on this app's, another
// Flask page on minty-web's hand-off, a backend path on accounts-api - with or without a token.
// Needs only `npm run dev`: the public read is STUBBED. A trip to minty-web's hand-off is read as it
// leaves (Playwright cannot route a redirect's next hop), so it goes on to the local Flask.

import { expect, test, type APIResponse, type Page } from "@playwright/test";

import { companyRef } from "./companyRef";
import { expectNoHorizontalScroll, mintModuleToken } from "./helpers";

const ENTITY = "3d65f186-5ba1-4bf7-a1b0-cc64a113eb5c";
const NAME = "E2E Petty Cash Shop";
const CO = `/entity/${companyRef(ENTITY, NAME)}`;
const SECRET = "Ab3_-xYz0123456789abcdefghijklmn";
const PATH = `EPCS/13_Oct_2026/${SECRET}`;
const OLD_SHARE = `/Minty_Report/${PATH}/`;

const BASE_URL = process.env.E2E_BASE_URL || "http://localhost:3010";

/** A redirect's target (Next writes a same-origin one as a path). */
const where = (res: APIResponse) => new URL(res.headers()["location"] ?? "", BASE_URL);

/**
 * The hand-off a navigation reached. Playwright's routes never see a redirect's next hop, so the
 * request is read as it goes; the trip then continues to the local Flask (or fails, if it is down).
 */
async function handoffReached(page: Page, path: string): Promise<URL> {
  const reached = page.waitForRequest(/\/handoff\/minty-web\?/);
  await page.goto(path).catch(() => undefined);
  return new URL((await reached).url());
}

/** The public read, enough for the page to draw its summary. */
const SHARED = {
  company_name: NAME,
  transaction_date: "2026-10-13",
  currency_code: "HKD",
  status_label: "Submitted",
  status_tone: "info",
  sales: { methods: [], cash: 50, total: 50 },
  expenses: { lines: [], total: 0 },
  cash: { counted: 50, safe_box: 0, difference: { amount: 0, kind: "none" } },
};

/** Stub the public read, and catch every Flask hand-off so nothing leaves the app. */
async function stub(page: Page) {
  const handoffs: string[] = [];
  await page.route("**/api/petty-cash/v1/public/share/**", (route) => route.fulfill({ json: SHARED }));
  await page.route(/\/handoff\//, (route) => {
    handoffs.push(route.request().url());
    return route.fulfill({ contentType: "text/html", body: "<title>Hand-off</title><p>Hand-off</p>" });
  });
  return handoffs;
}

/** Signs in through the landing, as Flask's hand-off would, then leaves the page. */
async function signIn(page: Page) {
  await page.route("**/api/petty-cash/v1/companies/**", (route) => route.fulfill({ status: 500, json: { error: "not in this test" } }));
  const token = mintModuleToken({ secret: "stub", userId: "u", entityId: ENTITY, entityName: NAME });
  await page.goto(`/landing?${new URLSearchParams({ token, entity_id: ENTITY, entity_name: NAME, next: `/share/${PATH}` })}`);
  await expect(page).toHaveURL(new RegExp(`/share/${PATH}$`));
}

for (const signedIn of [false, true]) {
  test.describe(signedIn ? "with a token" : "without a token", () => {
    test("Flask's share link lands on the share page, which draws the report", async ({ page }) => {
      const handoffs = await stub(page);
      if (signedIn) await signIn(page);
      for (const old of [OLD_SHARE, OLD_SHARE.slice(0, -1)]) {
        await page.goto(old);
        await expect(page.getByRole("heading", { name: "Summary", exact: true })).toBeVisible();
        expect(new URL(page.url()).pathname).toBe(`/share/${PATH}`);
      }
      expect(handoffs).toEqual([]);
      await expectNoHorizontalScroll(page);
    });

    test("another Flask page goes to minty-web through the login-gated hand-off", async ({ page }) => {
      await stub(page);
      if (signedIn) await signIn(page);
      const users = await handoffReached(page, `${CO}/settings/users`);
      expect(users.pathname).toBe("/handoff/minty-web");
      expect(users.searchParams.get("next")).toBe(`${CO}/settings/users`);

      const profile = await handoffReached(page, "/profile");
      expect(profile.pathname).toBe("/handoff/minty-web");
      expect(profile.searchParams.get("next")).toBe("/profile");
    });

    test("the redirects themselves, not followed", async ({ page }) => {
      await stub(page);
      if (signedIn) await signIn(page);
      const get = (path: string) => page.request.get(path, { maxRedirects: 0 });

      const share = await get(OLD_SHARE.slice(0, -1));
      expect(share.status()).toBe(308);
      expect(where(share).pathname).toBe(`/share/${PATH}`);
      expect(share.headers()["referrer-policy"]).toBe("no-referrer");

      const older = await get(`${CO}/reports/new/opening?transaction_date=2026-10-13`);
      expect(older.status()).toBe(308);
      const to = where(older);
      expect(to.pathname + to.search).toBe(`${CO}/petty-cash/reports/new/opening?transaction_date=2026-10-13`);

      const callback = await get("/callback?code=c&state=s");
      expect(callback.status()).toBe(308);
      const flask = where(callback);
      expect(flask.pathname + flask.search).toBe("/callback?code=c&state=s");
      expect(flask.origin).not.toBe(new URL(BASE_URL).origin);

      const api = await get("/api/me/profile");
      expect(api.status()).toBe(308);
      expect(where(api).pathname).toBe("/api/me/profile");

      expect((await get("/no-such-page-at-all")).status()).toBe(signedIn ? 404 : 307);
    });
  });
}

test("/share still needs no token, while this app's pages do", async ({ page }) => {
  await stub(page);
  expect(await page.context().cookies()).toEqual([]);
  expect((await page.request.get(`/share/${PATH}`, { maxRedirects: 0 })).status()).toBe(200);
  for (const path of [`${CO}/petty-cash`, `${CO}/petty-cash/reports`, `${CO}/settings/petty-cash`]) {
    const res = await page.request.get(path, { maxRedirects: 0 });
    expect(res.status(), path).toBe(307);
    expect(where(res).pathname, path).toBe("/handoff/petty-cash-web");
  }
});

test("a full company id: the hand-off for it without a token, the readable address with its token", async ({ page }) => {
  await stub(page);
  const uuidPath = `/entity/${ENTITY}/petty-cash/reports?page=2`;
  const without = await page.request.get(uuidPath, { maxRedirects: 0 });
  expect(without.status()).toBe(307);
  const handoff = where(without);
  expect(handoff.pathname).toBe("/handoff/petty-cash-web");
  expect(handoff.searchParams.get("entity_id")).toBe(ENTITY);
  expect(handoff.searchParams.get("next")).toBe(uuidPath);

  await signIn(page);
  const withToken = await page.request.get(uuidPath, { maxRedirects: 0 });
  expect(withToken.status()).toBe(307);
  const to = where(withToken);
  expect(to.pathname + to.search).toBe(`${CO}/petty-cash/reports?page=2`);
});
