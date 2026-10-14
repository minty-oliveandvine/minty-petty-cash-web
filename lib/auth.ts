/**
 * The module token, kept in a cookie.
 *
 * Minty (Flask) mints a 30-minute HS256 JWT for ONE company (`/handoff/petty-cash-web`) and
 * sends the browser to `/landing?token=…`, which stores it here. The cookie is what proxy.ts
 * gates on and what lib/apiClient.ts sends as the bearer.
 *
 * minty-web's lib/auth.ts with the cookies renamed - `petty_cash_*`, because localhost:3010 and
 * the other apps' ports share one cookie jar, and two apps must never read each other's token -
 * and no refresh: a lapsed token goes back through Flask's login-gated re-handoff
 * (lib/handoff.ts), as minty-web's does.
 *
 * The cookies live exactly as long as the token (its `exp` claim), so an expired session is
 * caught by proxy.ts before a page renders, rather than by the first API call after.
 */

const TOKEN_KEY = "petty_cash_token";
const ENTITY_ID_KEY = "petty_cash_entity_id";
const ENTITY_NAME_KEY = "petty_cash_entity_name";

/** Cookie names proxy.ts reads on the server. */
export const AUTH_COOKIE_NAME = TOKEN_KEY;
export const ENTITY_ID_COOKIE_NAME = ENTITY_ID_KEY;
export const ENTITY_NAME_COOKIE_NAME = ENTITY_NAME_KEY;

/** What a token is allowed to live when its `exp` cannot be read - Flask's token lifetime. */
const FALLBACK_MAX_AGE_SECONDS = 60 * 30;

export type AuthInfo = {
  token: string;
  entityId: string;
  entityName: string;
};

function cookieOptions(maxAgeSeconds: number): string {
  const isSecure = typeof window !== "undefined" && window.location.protocol === "https:";
  return `path=/;max-age=${maxAgeSeconds};SameSite=Lax${isSecure ? ";Secure" : ""}`;
}

function readJar(): Record<string, string> {
  if (typeof document === "undefined") return {};
  return Object.fromEntries(
    document.cookie
      .split("; ")
      .filter(Boolean)
      .map((c) => {
        const idx = c.indexOf("=");
        return [c.slice(0, idx), decodeURIComponent(c.slice(idx + 1))];
      }),
  );
}

/**
 * Neutral JWT-payload decode: base64url the middle segment and JSON-parse it. Never throws;
 * null for anything that is not a three-part token with an object payload. No signature check
 * here - the browser cannot hold the key, and Flask verifies every request anyway.
 */
export function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    let base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const pad = base64.length % 4;
    if (pad) base64 += "=".repeat(4 - pad);
    const payload = JSON.parse(atob(base64)) as unknown;
    if (payload == null || typeof payload !== "object" || Array.isArray(payload)) return null;
    return payload as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Seconds until the token's `exp`, floored at 1 - or the fallback when there is no `exp`. */
export function secondsUntilExpiry(token: string): number {
  const exp = decodeJwtPayload(token)?.exp;
  if (typeof exp !== "number") return FALLBACK_MAX_AGE_SECONDS;
  return Math.max(1, Math.floor(exp - Date.now() / 1000));
}

export function setAuth(token: string, entityId: string, entityName: string) {
  const opts = cookieOptions(secondsUntilExpiry(token));
  document.cookie = `${TOKEN_KEY}=${encodeURIComponent(token)};${opts}`;
  document.cookie = `${ENTITY_ID_KEY}=${encodeURIComponent(entityId)};${opts}`;
  document.cookie = `${ENTITY_NAME_KEY}=${encodeURIComponent(entityName)};${opts}`;
}

export function getAuth(): AuthInfo | null {
  const jar = readJar();
  const token = jar[TOKEN_KEY];
  if (!token) return null;
  return {
    token,
    entityId: jar[ENTITY_ID_KEY] ?? "",
    entityName: jar[ENTITY_NAME_KEY] ?? "",
  };
}

export function clearAuth() {
  const expire = "path=/;max-age=0";
  document.cookie = `${TOKEN_KEY}=;${expire}`;
  document.cookie = `${ENTITY_ID_KEY}=;${expire}`;
  document.cookie = `${ENTITY_NAME_KEY}=;${expire}`;
}

/** The token's module claims - which modules the company has. Both on when unknown: never hide nav on a guess. */
export function moduleClaims(): { pettyCash: boolean; billing: boolean } {
  const claims = decodeJwtPayload(getAuth()?.token ?? "") ?? {};
  return {
    pettyCash: claims.petty_cash_enabled !== false,
    billing: claims.billing_enabled !== false,
  };
}
