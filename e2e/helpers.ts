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

export function mintModuleToken(creds: Credentials, overrides: Record<string, unknown> = {}): string {
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
  const signature = b64url(createHmac("sha256", creds.secret).update(`${header}.${payload}`).digest());
  return `${header}.${payload}.${signature}`;
}

/** Arrive as Flask's hand-off sends a person: /landing with the token, on to `next`. */
export async function enter(page: Page, creds: Credentials, next: string) {
  const qs = new URLSearchParams({
    token: mintModuleToken(creds),
    entity_id: creds.entityId,
    entity_name: creds.entityName,
    next,
  });
  await page.goto(`/landing?${qs.toString()}`);
}

/** No page may scroll sideways at any width (CLAUDE.md, Responsive UI rules). */
export async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
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
  await page.route(/\/handoff\/minty-web\?/, (route) => route.fulfill({ contentType: "text/html", body: "<title>Hand-off</title><p>Hand-off</p>" }));
}
