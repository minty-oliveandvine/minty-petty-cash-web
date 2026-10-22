import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { isTokenExpiringSoon } from "@minty/shared/auth";
import { addressCompanyRef, companyRefFromPath } from "@minty/shared/companyRef";
import { toFlask } from "@minty/shared/proxy";

import { AUTH_COOKIE_NAME, ENTITY_ID_COOKIE_NAME, ENTITY_NAME_COOKIE_NAME } from "@/lib/auth";
import { pettyCashHome } from "@/lib/companyPages";
import { handoffUrl } from "@/lib/handoff";

// proxy.ts is Next 16's name for middleware (minty-web's file, the same convention). Off to Flask
// is `toFlask` (@minty/shared/proxy): a 307, or a refreshing page on a branch preview-set host.

/** Pages that need no token: the landing stores one. */
const OPEN_PATHS = new Set(["/landing"]);

/**
 * The public share page, `/share/<initials>/<day>/<secret>` (app/share/[...path]): read without
 * signing in, so it is let through with no token and whatever cookie - exactly this prefix, nothing
 * else (__tests__/proxy.test.ts). The secret is in the address, so the answer also says: send no
 * referrer, keep it out of search engines, never cache it (the page's metadata says the same).
 */
const SHARE_PREFIX = "/share/";
const SHARE_HEADERS = { "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex, nofollow", "Cache-Control": "no-store" };

/**
 * A token this close to its `exp` is renewed on the way to the next page rather than lapsing in
 * the middle of one: a Daily Closing is long, and a lapse mid-stage costs the person a re-entry.
 */
export const RENEW_WITHIN_SECONDS = 5 * 60;

/**
 * The gate - THE COOKIE, for the company in the address.
 *
 * - No cookie (it lives exactly as long as the token) -> Flask's login-gated re-handoff for the
 *   page asked for, naming the company from the address: silent while Flask's session lives.
 * - A cookie for ANOTHER company than the address names -> the same re-handoff: the token is for
 *   one company, and Flask decides whether this person may have the other.
 * - A token about to lapse -> renewed now, on a navigation, never mid-form.
 * - `/` with a token -> the company's Petty Cash.
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (OPEN_PATHS.has(pathname)) return NextResponse.next();
  if (pathname.startsWith(SHARE_PREFIX)) {
    const res = NextResponse.next();
    for (const [name, value] of Object.entries(SHARE_HEADERS)) res.headers.set(name, value);
    return res;
  }

  const origin = request.nextUrl.origin;
  const token = request.cookies.get(AUTH_COOKIE_NAME)?.value;
  const cookieEntity = request.cookies.get(ENTITY_ID_COOKIE_NAME)?.value ?? "";
  const address = companyRefFromPath(pathname);
  const addressCompany = addressCompanyRef(pathname) ?? undefined;

  if (!token) {
    return toFlask(request, handoffUrl(pathname + search, addressCompany, origin));
  }

  if (address && !cookieEntity.toLowerCase().startsWith(address.shortId)) {
    return toFlask(request, handoffUrl(pathname + search, addressCompany, origin));
  }

  if (isTokenExpiringSoon(token, RENEW_WITHIN_SECONDS)) {
    return toFlask(request, handoffUrl(pathname + search, cookieEntity || addressCompany, origin));
  }

  if (pathname === "/" && cookieEntity) {
    // RequestCookies hands values back decoded already.
    const name = request.cookies.get(ENTITY_NAME_COOKIE_NAME)?.value ?? "";
    return NextResponse.redirect(new URL(pettyCashHome(cookieEntity, name), request.url), 307);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next|api|.*\\..*).*)"],
};
