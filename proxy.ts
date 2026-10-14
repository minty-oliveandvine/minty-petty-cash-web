import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { previewSetSlug } from "@minty/shared/previewSibling";

import { AUTH_COOKIE_NAME, ENTITY_ID_COOKIE_NAME, ENTITY_NAME_COOKIE_NAME, decodeJwtPayload } from "@/lib/auth";
import { companyRefFromPath, pettyCashHome } from "@/lib/companyPages";
import { handoffUrl } from "@/lib/handoff";

// proxy.ts is Next 16's name for middleware (minty-web's file, the same convention).

/** Pages that need no token: the landing stores one. */
const OPEN_PATHS = new Set(["/landing"]);

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

  const origin = request.nextUrl.origin;
  const token = request.cookies.get(AUTH_COOKIE_NAME)?.value;
  const cookieEntity = request.cookies.get(ENTITY_ID_COOKIE_NAME)?.value ?? "";
  const addressCompany = companyRefFromPath(pathname);

  if (!token) {
    return toFlask(request, handoffUrl(pathname + search, addressCompany || undefined, origin));
  }

  if (addressCompany && !cookieEntity.toLowerCase().startsWith(addressCompany.split("/")[0])) {
    return toFlask(request, handoffUrl(pathname + search, addressCompany, origin));
  }

  const exp = decodeJwtPayload(token)?.exp;
  if (typeof exp === "number" && exp - Date.now() / 1000 < RENEW_WITHIN_SECONDS) {
    return toFlask(request, handoffUrl(pathname + search, cookieEntity || addressCompany || undefined, origin));
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

/**
 * Off to Flask. A plain redirect - except on a branch preview-set host, where the trip has to
 * START on a page of this host: a visitor arriving from a link on GitHub or in an email makes the
 * whole redirect chain cross-site, and Flask names a preview set only on a same-site navigation
 * (Minty blueprints/shared/preview_origin.py). A meta refresh is navigated by the page itself.
 * (minty-web's proxy.ts, the same function.)
 */
export function toFlask(request: NextRequest, url: string): NextResponse {
  if (previewSetSlug(request.nextUrl.host) === null) return NextResponse.redirect(url);
  const attr = url.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");
  return new NextResponse(
    `<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=${attr}"><title>Minty</title>`,
    { status: 200, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } },
  );
}
