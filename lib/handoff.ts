/**
 * Getting a token, and getting a new one.
 *
 * This app never mints a token and never refreshes one: Flask is the single minter. Both the
 * first arrival and a lapsed session go through Flask's login-gated
 * `GET /handoff/petty-cash-web?next=<path>&entity_id=<company>` (Minty
 * `blueprints/entity/routes/modules.py`): with a live Flask session it mints the module token and
 * sends the browser straight back to `/landing?token=…&next=<path>` here - a silent round trip,
 * because Flask's session outlives the 30-minute token; without one it shows the login first and
 * then does the same. minty-web's lib/handoff.ts, for this app's route.
 *
 * The company is the cookie's id when there is one, else the address's own `<shortid>/<name>`
 * (the cookie lapses with the token, so after a lapse the address is all this app knows) - Flask
 * accepts either.
 */

import { safeNextPath } from "@minty/shared/safeNext";

import { clearAuth, getAuth } from "@/lib/auth";
import { companyRefFromPath } from "@/lib/companyPages";
import { env } from "@/lib/env";

/** Where a hand-off with nowhere better to go lands: the company's Petty Cash, via the root. */
export const APP_HOME = "/";

/** A path this app may land on after the handoff (`@minty/shared/safeNext` has the rule). */
export function safeNext(raw: string | null | undefined, fallback: string = APP_HOME): string {
  return safeNextPath(raw, fallback);
}

/**
 * `origin` is where Flask should hand back to: the page's own origin, or - in the proxy, which
 * runs on the server - the request's. Flask uses it only for a branch preview set (Minty
 * `blueprints/shared/preview_origin.py`) and ignores it everywhere else.
 */
export function handoffUrl(next: string, company?: string, origin?: string): string {
  const safe = safeNext(next);
  const qs = new URLSearchParams({ next: safe });
  const entity = company || companyRefFromPath(safe);
  if (entity) qs.set("entity_id", entity);
  return withReturnOrigin(`${env.ACCOUNTS_API_URL}/handoff/petty-cash-web?${qs.toString()}`, origin);
}

/** `url` (a Flask address) naming this app's origin as `return_origin`; unchanged with none. */
export function withReturnOrigin(url: string, origin?: string): string {
  const own = origin ?? (typeof window === "undefined" ? undefined : window.location.origin);
  if (!own) return url;
  const target = new URL(url);
  target.searchParams.set("return_origin", own);
  return target.toString();
}

type Navigate = (url: string) => void;

const defaultNavigate: Navigate = (url) => {
  window.location.href = url;
};

let navigate: Navigate = defaultNavigate;
let redirecting = false;

/**
 * Send the browser to Flask for a fresh token, once. Several requests in flight fail together
 * on an expired token, and each one reassigning `location.href` while the first navigation is
 * already under way is how a redirect turns into a flicker.
 */
export function redirectToHandoff(next?: string, company?: string) {
  if (redirecting || typeof window === "undefined") return;
  redirecting = true;
  const entity = company ?? (getAuth()?.entityId || undefined);
  clearAuth();
  const target = next ?? window.location.pathname + window.location.search;
  navigate(handoffUrl(target, entity));
}

/** Leave the app for another Minty address through the same seam (tests capture it). */
export function leaveTo(url: string) {
  navigate(url);
}

/** Test seam: forget that a redirect is under way, and optionally capture the navigation
 * instead of assigning `location.href` (jsdom does not allow `location` to be replaced). */
export function _resetHandoffForTests(capture?: Navigate) {
  redirecting = false;
  navigate = capture ?? defaultNavigate;
}
