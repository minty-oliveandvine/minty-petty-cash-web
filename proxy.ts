import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { previewSetSlug } from "@/lib/previewSibling";

import { AUTH_COOKIE_NAME, ENTITY_ID_COOKIE_NAME, ENTITY_NAME_COOKIE_NAME, decodeJwtPayload } from "@/lib/auth";
import { companyRefFromPath, pettyCashHome } from "@/lib/companyPages";
import { flaskBackendUrl, handoffUrl, hubUrl } from "@/lib/handoff";
import { type OldLink, oldLink } from "@/lib/oldLinks";
import { isSharePage } from "@/lib/share";

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
 *
 * Before the gate: an old `pettycash.` link from Flask's time on this host (lib/oldLinks.ts) is
 * redirected with or without a token - a share link to `/share/...`, an older Petty Cash address
 * to this app's, another Flask page to minty-web's hand-off, a backend path to accounts-api.
 */
const SHARE_HEADERS = { "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex, nofollow", "Cache-Control": "no-store" };

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  // A shared Daily Report, `/share/<initials>/<date>/<secret>` (app/share/[...path]): read-only, for
  // someone outside the company, so it carries no token. Exactly this prefix is open - the secret
  // is checked by the API, and the page sends no bearer at all. The secret is in the address, so
  // the answer is never passed on as a referrer, indexed or cached (as minty-petty-cash-web's
  // Part 15 track does).
  if (isSharePage(pathname)) {
    const res = NextResponse.next();
    for (const [name, value] of Object.entries(SHARE_HEADERS)) res.headers.set(name, value);
    return res;
  }
  if (OPEN_PATHS.has(pathname)) return NextResponse.next();

  const origin = request.nextUrl.origin;
  const token = request.cookies.get(AUTH_COOKIE_NAME)?.value;
  const cookieEntity = request.cookies.get(ENTITY_ID_COOKIE_NAME)?.value ?? "";

  const old = oldLink(pathname);
  if (old) return toOldLinkTarget(request, old, token, cookieEntity);

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

/**
 * An old `pettycash.` link after the host switch (lib/oldLinks.ts), answered before the gate - with
 * or without a token - and never logged (a share link carries its secret).
 */
function toOldLinkTarget(request: NextRequest, old: OldLink, token: string | undefined, cookieEntity: string): NextResponse {
  const { search, origin } = request.nextUrl;
  switch (old.kind) {
    case "share": {
      // The query is dropped: the three parts are the whole link.
      const res = NextResponse.redirect(new URL(old.to, request.url), 308);
      for (const [name, value] of Object.entries(SHARE_HEADERS)) res.headers.set(name, value);
      return res;
    }
    case "local":
      return NextResponse.redirect(new URL(old.to + search, request.url), 308);
    case "backend": {
      const url = flaskBackendUrl(old.path, search);
      if (url === null) throw new Error("oldLink named a backend path that lib/handoff.ts does not allow");
      return NextResponse.redirect(url, 308);
    }
    case "hub":
      return toFlask(request, hubUrl(old.next, old.entityId, origin));
    case "company-uuid": {
      // The readable address needs the company's name, and the only one this app holds is the
      // cookie's - so with that company's token it is a redirect, and otherwise Flask's hand-off
      // for that company, which comes back to this address with the token (and so the name).
      if (token && cookieEntity.toLowerCase() === old.uuid) {
        const name = request.cookies.get(ENTITY_NAME_COOKIE_NAME)?.value ?? "";
        const company = pettyCashHome(old.uuid, name).replace(/\/petty-cash$/, "");
        return NextResponse.redirect(new URL(company + old.tail + search, request.url), 307);
      }
      return toFlask(request, handoffUrl(request.nextUrl.pathname + search, old.uuid, origin));
    }
  }
}

export const config = {
  // `/api/...` too: this app has no API routes, and an old caller of Flask's API on this host is
  // sent on to accounts-api (lib/oldLinks.ts).
  matcher: ["/((?!_next|api|.*\\..*).*)", "/api/:path*"],
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
