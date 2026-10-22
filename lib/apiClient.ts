/**
 * The one way this app talks to its backends - its instances of `@minty/shared/apiClient`'s
 * `createBearerClient`:
 *
 * - `pettyCashFetch` - Petty Cash's bearer API, Django `minty-petty-cash-api`,
 *   `/api/petty-cash/v1/companies/<id>/...` (Flask's paths 1:1). The company is in the path and
 *   nowhere else; the API checks it against membership on every call.
 * - `mintyFetch` - Flask's hub surface (`/api/me/profile`) for the sidebar's person.
 * - `subscriptionFetch` - minty-subscription-api's person-scoped `/api/me/*` for its Subscriptions.
 *
 * All three share the package's rules (no `X-Entity-Id` - Flask's CORS allows only
 * `Authorization` and `Content-Type`; no token -> no call; every refusal the body's own sentence
 * when it reads as one, else HOUSE_FALLBACK). This file adds only what is this app's:
 * - The bearer is the cookie token (lib/auth.ts).
 * - A 401, or no token, means the token has lapsed (or was never valid): by default the browser
 *   goes back through Flask's re-handoff (lib/handoff.ts) and the call rejects. A call that is
 *   decoration passes `onUnauthorized: "reject"` and only rejects. Nothing retries or refreshes.
 *
 * Also here, over these clients: My Profile's calls and its Subscriptions Overview read for the
 * packaged panel (`@minty/shared/portal`), module-level because the panel reads again whenever
 * they change identity.
 */

import {
  ApiError,
  HOUSE_FALLBACK,
  SESSION_ENDED,
  createBearerClient,
  type BearerClient,
  type BearerRequest,
} from "@minty/shared/apiClient";
import { filenameFromDisposition } from "@minty/shared/download";
import {
  createProfileApi,
  fetchAllSubscriptions,
  type AllSubscriptions,
} from "@minty/shared/portal";

import { getAuth } from "@/lib/auth";
import { env } from "@/lib/env";
import { redirectToHandoff } from "@/lib/handoff";

export { ApiError, HOUSE_FALLBACK };

export type ApiRequest = BearerRequest & {
  /**
   * What a 401 means to the caller. `"handoff"` (the default): the token lapsed, so the browser
   * goes back through Flask for a fresh one. `"reject"`: only reject - for a read that is
   * decoration (the header's initials), which must never move the page.
   */
  onUnauthorized?: "handoff" | "reject";
};

type Clients = { handoff: BearerClient; reject: BearerClient };

/** A 401 goes back through Flask for a fresh token; the call still rejects. */
const backThroughFlask = async (): Promise<boolean> => {
  redirectToHandoff();
  return false;
};

function clients(baseUrl: () => string): Clients {
  const getToken = () => getAuth()?.token ?? null;
  return {
    handoff: createBearerClient({ baseUrl, getToken, onUnauthorized: backThroughFlask }),
    reject: createBearerClient({ baseUrl, getToken, onUnauthorized: "reject" }),
  };
}

/** The client for this call's 401 rule, and the request without it (it is never sent on). */
function pick(set: Clients, init: ApiRequest): [BearerClient, BearerRequest] {
  const { onUnauthorized = "handoff", ...request } = init;
  return [onUnauthorized === "reject" ? set.reject : set.handoff, request];
}

const pettyCash = clients(
  () =>
    `${env.PETTY_CASH_API_URL}/api/petty-cash/v1/companies/${encodeURIComponent(getAuth()?.entityId ?? "")}`,
);
const minty = clients(() => env.ACCOUNTS_API_URL);
const subscriptions = clients(() => env.SUBSCRIPTION_API_URL);

/** Every Petty Cash API path is under the cookie's company: with none, go and get a token. */
function companyClient(init: ApiRequest): [BearerClient, BearerRequest] {
  if (!getAuth()?.entityId) {
    // No company means no token worth sending: go and get one rather than call with a hole.
    redirectToHandoff();
    throw new ApiError(401, SESSION_ENDED);
  }
  return pick(pettyCash, init);
}

/**
 * Call Petty Cash's API for the cookie's company. `path` is relative to the company - `""` for
 * the company itself, `"/home"`, `"/reports/<id>"` - and the parsed JSON comes back.
 */
export async function pettyCashFetch<T = unknown>(path: string, init: ApiRequest = {}): Promise<T> {
  const [client, request] = companyClient(init);
  return client.json<T>(path, request);
}

/**
 * A file from Petty Cash's API (a receipt's bytes) for the cookie's company, as a Blob - read
 * with the bearer, so it can be drawn from an object URL; never a link a new tab would open.
 * A refusal rejects with the API's sentence, as `pettyCashFetch` does.
 */
export async function pettyCashBlob(path: string, init: ApiRequest = {}): Promise<Blob> {
  const [client, request] = companyClient(init);
  return client.blob(path, request);
}

/**
 * A file download from Petty Cash's API (Export CSV's `GET /reports/export.csv`) for the cookie's
 * company: its bytes and the server's file name (`Content-Disposition`; null when the header is
 * absent or the browser was not let read it). A refusal rejects with the API's sentence.
 */
export async function pettyCashDownload(
  path: string,
  init: ApiRequest = {},
): Promise<{ blob: Blob; filename: string | null }> {
  const [client, request] = companyClient(init);
  const res = await client.response(path, request);
  return {
    blob: await res.blob(),
    filename: filenameFromDisposition(res.headers.get("Content-Disposition")),
  };
}

/** Flask's hub surface (`/api/me/profile`); a company travels as `?entity=`. */
export function mintyFetch<T = unknown>(path: string, init: ApiRequest = {}): Promise<T> {
  const [client, request] = pick(minty, init);
  return client.json<T>(path, request);
}

/** minty-subscription-api's person-scoped `/api/me/*`. */
export function subscriptionFetch<T = unknown>(path: string, init: ApiRequest = {}): Promise<T> {
  const [client, request] = pick(subscriptions, init);
  return client.json<T>(path, request);
}

/**
 * My Profile's two calls (Flask's `GET` / `PATCH /api/me/profile`, the cookie's company as
 * `?entity=`), in the shape the packaged panel takes. A refusal is an `ApiError`, which the panel
 * shows as it stands; a 401 has already gone back through the hand-off.
 */
export const profileApi = createProfileApi(mintyFetch);

/**
 * The Subscriptions Overview's read: every page of subscription-api's `GET /api/me/subscriptions`
 * at 100 a page, so the figures count every company. A page that is not the expected shape is an
 * `ApiError(502)`; a refusal is the API's own `ApiError`.
 */
export function loadSubscriptions(signal: AbortSignal): Promise<AllSubscriptions> {
  return fetchAllSubscriptions(subscriptionFetch, {
    signal,
    shapeError: (status, message) => new ApiError(status, message),
  });
}
