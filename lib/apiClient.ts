/**
 * The one way this app talks to its backends:
 *
 * - `pettyCashFetch` - Petty Cash's bearer API in Flask, `/api/petty-cash/v1/companies/<id>/...`
 *   (Minty `blueprints/petty_cash_api`, docs/features/petty-cash-api.md). The company is in the
 *   path and nowhere else; Flask checks it against membership on every call.
 * - `mintyFetch` - Flask's hub surface (`/api/me/profile`) for the sidebar's person.
 * - `subscriptionFetch` - minty-subscription-api's person-scoped `/api/me/*` for its Subscriptions.
 *
 * All three share everything below except where they go:
 * - The bearer is the cookie token (lib/auth.ts). Never `X-Entity-Id`: Flask's CORS allows only
 *   `Authorization` and `Content-Type`, so the header would fail every preflight.
 * - A 401 means the token has lapsed (or was never valid): the browser goes back through Flask's
 *   re-handoff (lib/handoff.ts) and the call rejects. Nothing retries, nothing refreshes.
 * - Every other non-2xx rejects with an `ApiError` carrying the status and the body's `error`
 *   sentence - the API answers `{"error": "<sentence>"}`, and screens show it as it stands.
 */

import { getAuth } from "@/lib/auth";
import { env } from "@/lib/env";
import { redirectToHandoff } from "@/lib/handoff";

export class ApiError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(status: number, message: string, body: unknown = null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

/** Shown when a backend gave no sentence of its own - the same fallback Flask uses. */
export const HOUSE_FALLBACK = "Something went wrong on our side. Please try again.";
const SESSION_ENDED = "Your session has ended. Signing you back in…";

export type ApiRequest = Omit<RequestInit, "body"> & {
  /** JSON body; serialised here. */
  json?: unknown;
  /** A multipart body (a receipt upload); the browser sets its Content-Type and boundary. */
  form?: FormData;
  /** Query string, appended to the path. */
  query?: Record<string, string | number | boolean | undefined>;
  /**
   * What a 401 means to the caller. `"handoff"` (the default): the token lapsed, so the browser
   * goes back through Flask for a fresh one. `"reject"`: only reject - for a read that is
   * decoration (the header's initials), which must never move the page.
   */
  onUnauthorized?: "handoff" | "reject";
};

function withQuery(path: string, query?: ApiRequest["query"]): string {
  if (!query) return path;
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined) qs.set(k, String(v));
  }
  const s = qs.toString();
  return s ? `${path}${path.includes("?") ? "&" : "?"}${s}` : path;
}

async function readBody(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function errorSentence(body: unknown): string | null {
  if (body && typeof body === "object" && typeof (body as { error?: unknown }).error === "string") {
    return (body as { error: string }).error;
  }
  return null;
}

/** The call itself: the bearer, the body, a 401 back through Flask. Any other status is the caller's. */
async function send(base: string, path: string, init: ApiRequest, accept: string): Promise<Response> {
  const { json, form, query, headers: extraHeaders, onUnauthorized = "handoff", ...rest } = init;
  const auth = getAuth();

  const headers = new Headers(extraHeaders);
  headers.set("Accept", accept);
  if (auth?.token) headers.set("Authorization", `Bearer ${auth.token}`);
  if (json !== undefined) headers.set("Content-Type", "application/json");

  const res = await fetch(`${base}${withQuery(path, query)}`, {
    ...rest,
    headers,
    body: form ?? (json === undefined ? undefined : JSON.stringify(json)),
  });

  if (res.status === 401) {
    if (onUnauthorized === "handoff") redirectToHandoff();
    throw new ApiError(401, SESSION_ENDED);
  }
  return res;
}

async function requestJson<T>(base: string, path: string, init: ApiRequest): Promise<T> {
  const res = await send(base, path, init, "application/json");
  const body = await readBody(res);
  if (!res.ok) throw new ApiError(res.status, errorSentence(body) ?? HOUSE_FALLBACK, body);
  return body as T;
}

/** The company the cookie is for - every Petty Cash API path is under it. */
function companyBase(): string {
  const entityId = getAuth()?.entityId ?? "";
  if (!entityId) {
    // No company means no token worth sending: go and get one rather than call with a hole.
    redirectToHandoff();
    throw new ApiError(401, SESSION_ENDED);
  }
  return `${env.PETTY_CASH_API_URL}/api/petty-cash/v1/companies/${encodeURIComponent(entityId)}`;
}

/**
 * Call Petty Cash's API for the cookie's company. `path` is relative to the company - `""` for
 * the company itself, `"/home"`, `"/reports/<id>"` - and the parsed JSON comes back.
 */
export async function pettyCashFetch<T = unknown>(path: string, init: ApiRequest = {}): Promise<T> {
  return requestJson<T>(companyBase(), path, init);
}

/**
 * A file from Petty Cash's API (a receipt's bytes) for the cookie's company, as a Blob - read
 * with the bearer, so it can be drawn from an object URL; never a link a new tab would open.
 * A refusal rejects with the API's sentence, as `pettyCashFetch` does.
 */
export async function pettyCashBlob(path: string, init: ApiRequest = {}): Promise<Blob> {
  const res = await send(companyBase(), path, init, "*/*");
  if (!res.ok) {
    const body = await readBody(res);
    throw new ApiError(res.status, errorSentence(body) ?? HOUSE_FALLBACK, body);
  }
  return res.blob();
}

/** Flask's hub surface (`/api/me/profile`); a company travels as `?entity=`. */
export function mintyFetch<T = unknown>(path: string, init: ApiRequest = {}): Promise<T> {
  return requestJson<T>(env.ACCOUNTS_API_URL, path, init);
}

/** minty-subscription-api's person-scoped `/api/me/*`. */
export function subscriptionFetch<T = unknown>(path: string, init: ApiRequest = {}): Promise<T> {
  return requestJson<T>(env.SUBSCRIPTION_API_URL, path, init);
}
