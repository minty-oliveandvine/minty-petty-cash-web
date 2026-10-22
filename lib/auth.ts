/**
 * The module token, kept in a cookie - this app's instance of `@minty/shared/auth`.
 *
 * Minty (Flask) mints a 30-minute HS256 JWT for ONE company (`/handoff/petty-cash-web`) and
 * sends the browser to `/landing?token=…`, which stores it here. The cookie is what proxy.ts
 * gates on and what lib/apiClient.ts sends as the bearer.
 *
 * The cookies are `petty_cash_*`, because localhost:3010 and the other apps' ports share one
 * cookie jar, and two apps must never read each other's token. No refresh: a lapsed token goes
 * back through Flask's login-gated re-handoff (lib/handoff.ts). The cookies live exactly as long
 * as the token (its `exp` claim), so an expired session is caught by proxy.ts before a page
 * renders, rather than by the first API call after.
 */

import { createCookieAuth, type AuthInfo } from "@minty/shared/auth";

export type { AuthInfo };

const cookieAuth = createCookieAuth({ prefix: "petty_cash" });

/** Cookie names proxy.ts reads on the server. */
export const AUTH_COOKIE_NAME = cookieAuth.cookieNames.token;
export const ENTITY_ID_COOKIE_NAME = cookieAuth.cookieNames.entityId;
export const ENTITY_NAME_COOKIE_NAME = cookieAuth.cookieNames.entityName;

export const { getAuth, clearAuth, getAuthSnapshot } = cookieAuth;

/** Store the token and its company (the landing's and the tests' positional form). */
export function setAuth(token: string, entityId: string, entityName: string): void {
  cookieAuth.setAuth({ token, entityId, entityName });
}
