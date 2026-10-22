/**
 * Getting a token, and getting a new one - this app's instance of `@minty/shared/handoff`.
 *
 * This app never mints a token and never refreshes one: Flask is the single minter. Both the
 * first arrival and a lapsed session go through Flask's login-gated
 * `GET /handoff/petty-cash-web?next=<path>&entity_id=<company>` (Minty
 * `blueprints/entity/routes/modules.py`): with a live Flask session it mints the module token and
 * sends the browser straight back to `/landing?token=…&next=<path>` here - a silent round trip,
 * because Flask's session outlives the 30-minute token; without one it shows the login first and
 * then does the same.
 *
 * The company is the cookie's id when there is one, else the address's own `<shortid>/<name>`
 * (`addressCompanyRef`; the cookie lapses with the token, so after a lapse the address is all
 * this app knows) - Flask accepts either.
 */

import { addressCompanyRef } from "@minty/shared/companyRef";
import { createHandoff } from "@minty/shared/handoff";

import { clearAuth, getAuth } from "@/lib/auth";
import { env } from "@/lib/env";

/** Where a hand-off with nowhere better to go lands: the company's Petty Cash, via the root. */
export const APP_HOME = "/";

const handoff = createHandoff({
  flaskBase: () => env.ACCOUNTS_API_URL,
  route: "/handoff/petty-cash-web",
  clearAuth,
  companyFallback: () => getAuth()?.entityId || null,
  companyFromNext: addressCompanyRef,
  home: APP_HOME,
});

export const { safeNext, handoffUrl, redirectToHandoff, leaveTo } = handoff;

/** Test seam: forget that a redirect is under way, and optionally capture the navigation. */
export const _resetHandoffForTests = handoff._resetForTests;
