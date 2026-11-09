// What every spec needs: a module token as Flask's /handoff/petty-cash-web would mint it, and the
// way in through /landing. Signed here with Minty's SECRET_KEY (E2E_JWT_SECRET), so a spec needs
// no Flask sign-in - the token is the same shape, and Flask's API verifies it the same way.

import { createHmac } from "node:crypto";

import { expect, test, type Locator, type Page } from "@playwright/test";

export type Credentials = { secret: string; userId: string; entityId: string; entityName: string };

const b64url = (input: string | Buffer) => Buffer.from(input).toString("base64url");

/** The spec's credentials, or the spec is skipped with what to set (e2e/README.md). */
export function credentials(): Credentials {
  const secret = process.env.E2E_JWT_SECRET ?? "";
  const userId = process.env.E2E_MINTY_USER ?? "";
  const entityId = process.env.E2E_MINTY_ENTITY ?? "";
  const entityName = process.env.E2E_MINTY_ENTITY_NAME ?? "";
  test.skip(
    !(secret && userId && entityId && entityName),
    "Set E2E_JWT_SECRET (Minty SECRET_KEY), E2E_MINTY_USER, E2E_MINTY_ENTITY and E2E_MINTY_ENTITY_NAME (see e2e/README.md)",
  );
  return { secret, userId, entityId, entityName };
}

export function mintModuleToken(
  creds: Credentials,
  overrides: Record<string, unknown> = {},
): string {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = b64url(
    JSON.stringify({
      user_id: creds.userId,
      entity_id: creds.entityId,
      xero_org_id: "",
      role: "admin",
      system_role: "normal",
      module: "billing",
      sid: "e2e",
      billing_enabled: true,
      petty_cash_enabled: true,
      exp: now + 1800,
      iat: now,
      ...overrides,
    }),
  );
  const signature = b64url(
    createHmac("sha256", creds.secret).update(`${header}.${payload}`).digest(),
  );
  return `${header}.${payload}.${signature}`;
}

/** Arrive as accounts-api's hand-off sends a person: /landing with a one-time code, on to `next`. */
export async function enter(page: Page, creds: Credentials, next: string) {
  await page.goto(
    await landingAddress(page, mintModuleToken(creds), {
      entity_id: creds.entityId,
      entity_name: creds.entityName,
      next,
    }),
  );
}

/** No page may scroll sideways at any width (CLAUDE.md, Responsive UI rules). */
export async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  if (overflow > 0) throw new Error(`the page scrolls sideways by ${overflow}px`);
}

/**
 * A link that leaves for minty-web: Flask's login-gated `/handoff/minty-web` with minty-web's page
 * as `next` and the company as `entity_id` - never a Flask page (docs/features/petty-cash-web.md,
 * "No Flask pages").
 */
export async function expectHubHandoff(link: Locator, next: string, entityId: string) {
  const href = await link.getAttribute("href");
  if (!href) throw new Error("the link has no address");
  const url = new URL(href);
  expect(url.pathname).toBe("/handoff/minty-web");
  expect(url.searchParams.get("next")).toBe(next);
  expect(url.searchParams.get("entity_id")).toBe(entityId);
}

/** Flask's hand-offs, caught: the spec reads where the app sent the browser, and nothing leaves. */
export async function catchHandoffs(page: Page) {
  await page.route(/\/handoff\/minty-web\?/, (route) =>
    route.fulfill({ contentType: "text/html", body: "<title>Hand-off</title><p>Hand-off</p>" }),
  );
}

/** accounts-api, where the landing swaps its one-time code (`codeFor` answers it here). */
export const ACCOUNTS_API_URL = process.env.E2E_ACCOUNTS_API_URL || "http://localhost:8002";

/**
 * Gap 4 (2026-11-09): accounts-api hands an app a one-time code, which the landing swaps for the
 * token at `POST /api/handoff/redeem`. Here the test is accounts-api: a fresh code for `token`,
 * answered once by its own route (with CORS and its preflight, as accounts-api does). Each code
 * brings its own handler, so a test's `page.unrouteAll()` between landings is harmless; a code a
 * handler does not own falls back to the next one, and in the end to the real accounts-api (the
 * stack e2e's own hand-offs).
 */
let codeCount = 0;

export async function codeFor(page: Page, token: string): Promise<string> {
  codeCount += 1;
  const code = `e2e-${codeCount}-${Date.now().toString(36)}`;
  let spent = false;
  await page.route(`${ACCOUNTS_API_URL}/api/handoff/redeem`, (route) => {
    const request = route.request();
    const headers = {
      "Access-Control-Allow-Origin": request.headers()["origin"] ?? "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      Vary: "Origin",
    };
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers });
    const asked = (request.postDataJSON() as { code?: unknown } | null)?.code;
    if (asked !== code || spent) return route.fallback();
    spent = true;
    return route.fulfill({
      status: 200,
      headers,
      contentType: "application/json",
      body: JSON.stringify({ token }),
    });
  });
  return code;
}

/** `/landing?…&code=` for `token` - the address accounts-api sends people to, with no token in it. */
export async function landingAddress(
  page: Page,
  token: string,
  params: Record<string, string>,
): Promise<string> {
  const qs = new URLSearchParams({ ...params, code: await codeFor(page, token) });
  return `/landing?${qs.toString()}`;
}
