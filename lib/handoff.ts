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
 *
 * Flask is a backend only (the owner, 2026-10-16): no screen here links to a Flask PAGE. The
 * Flask addresses this app may build are all here - the hand-offs below, which mint a token and
 * redirect, `/logout`, and an old caller's backend path passed on after the host switch
 * (`flaskBackendUrl`) - plus the APIs in lib/apiClient.ts (`no_flask_pages` guard test).
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

/**
 * minty-web's page `next` through Flask's login-gated `GET /handoff/minty-web` (it mints
 * minty-web's token and redirects), scoped to `entityId` when given. `origin` as for `handoffUrl`
 * (the proxy passes the request's).
 */
export function hubUrl(next: string, entityId?: string, origin?: string): string {
  const qs = new URLSearchParams({ next });
  if (entityId) qs.set("entity_id", entityId);
  return withReturnOrigin(`${env.ACCOUNTS_API_URL}/handoff/minty-web?${qs.toString()}`, origin);
}

/**
 * The payments app (minty-payment-request-web) through Flask's hand-offs that mint its token and
 * redirect: its home (`/entity/<id>/payment-request`) or its settings page
 * (`/entity/<id>/settings/payment-request`). Neither is a Flask page.
 */
export function paymentsUrl(entityId: string, page: "home" | "settings"): string {
  const id = encodeURIComponent(entityId);
  return withReturnOrigin(
    page === "home" ? `${env.ACCOUNTS_API_URL}/entity/${id}/payment-request` : `${env.ACCOUNTS_API_URL}/entity/${id}/settings/payment-request`,
  );
}

/**
 * Flask's BACKEND paths - never a page: routes that mint a token and redirect, take an OAuth or
 * an email link's return, or answer JSON. Before the host switch they were served on
 * `pettycash.dailyminty.com`, which is this app's host now, so an old caller (Xero's registered
 * `/callback`, a sign-in or invitation email, an API client) is sent on to the same path on
 * accounts-api (proxy.ts, lib/oldLinks.ts):
 *
 * - `/handoff/...` - the hand-offs (`/handoff/petty-cash-web`, `/handoff/minty-web`);
 * - `/api/...`, `/minty/api/...` - Flask's JSON APIs;
 * - `/callback`, `/xero_auth`, `/xero_connect`, `/xero_reconnect` - Xero's OAuth;
 * - `/logout`; `/auth/...` (the email sign-in hand-off); `/invitation/accept/<token>` (validates
 *   the invitation and bounces to minty-web's sign-in);
 * - the payments app's hand-offs: `/entity/<company>/payment-request`,
 *   `/entity/<company>/settings/payment-request`, and their older `/entity/<uuid>/bills` and
 *   `/entity/settings/payments/<uuid>`.
 */
const FLASK_BACKEND = [
  /^\/(?:handoff|api|auth)(?:\/|$)/,
  /^\/minty\/api(?:\/|$)/,
  /^\/(?:callback|logout|xero_auth|xero_connect|xero_reconnect)$/,
  /^\/invitation\/accept\/[^/]+$/,
  /^\/entity\/(?:[0-9a-fA-F]{8}\/[^/]+|[0-9a-fA-F]{8}(?:-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12})\/(?:settings\/)?payment-request$/,
  /^\/entity\/[0-9a-fA-F]{8}(?:-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}\/bills$/,
  /^\/entity\/settings\/payments\/[0-9a-fA-F]{8}(?:-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}$/,
];

/** True for one of Flask's backend paths (above), and never for a page. */
export function isFlaskBackendPath(path: string): boolean {
  return FLASK_BACKEND.some((re) => re.test(path));
}

/** The same backend path and query on accounts-api, or null for anything that is not one. */
export function flaskBackendUrl(backendPath: string, search: string): string | null {
  return isFlaskBackendPath(backendPath) ? `${env.ACCOUNTS_API_URL}${backendPath}${search}` : null;
}

/** Flask's `/logout`: ends the session everywhere. */
export function logoutUrl(): string {
  return `${env.ACCOUNTS_API_URL}/logout`;
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
