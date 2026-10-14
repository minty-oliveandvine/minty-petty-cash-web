/**
 * The sibling URLs this app reads - and the only place it reads them.
 *
 * Each is spelled out as a literal `process.env.X` access of a key next.config.ts lists under
 * `env`, so Next inlines it into the client bundle AND proxy.ts at build time; a dynamic
 * `process.env[name]` is never inlined and silently reads undefined in the browser.
 * next.config.ts passes the raw value through; the default and the trailing-slash strip live
 * here, once. (minty-web's lib/env.ts, the same rule.)
 *
 * The names follow the owner's 2026-10-14 decision: Flask is becoming `accounts-api` (sign-in,
 * tokens, companies, My Profile), and Petty Cash gets its own API. Until that API exists its
 * routes are Flask's (`/api/petty-cash/v1/...`, Minty `blueprints/petty_cash_api`), so both
 * point at Flask today - the paths stay the same when the API moves, only its base URL changes.
 *
 * Defaults are the decided local ports (Flask 8000, Petty Cash API 8010, Subscription API 8001).
 * Until the port move lands, .env.local sets today's (.env.example).
 */

function url(raw: string | undefined, fallback: string): string {
  const value = (raw ?? "").trim();
  return (value || fallback).replace(/\/+$/, "");
}

export const env = {
  /** Flask (Minty, becoming accounts-api): the hand-off that mints this app's token, My Profile's read. */
  ACCOUNTS_API_URL: url(process.env.ACCOUNTS_API_URL, "http://localhost:8000"),
  /** Petty Cash's API - every read and write of reports, expenses, cash counts and settings. */
  PETTY_CASH_API_URL: url(process.env.PETTY_CASH_API_URL, "http://localhost:8010"),
  /** minty-subscription-api - the sidebar's Subscriptions. */
  SUBSCRIPTION_API_URL: url(process.env.SUBSCRIPTION_API_URL, "http://localhost:8001"),
  /** minty-payment-request-web - the sidebar's Bills. */
  PAYMENT_REQUEST_WEB_URL: url(process.env.PAYMENT_REQUEST_WEB_URL, "http://localhost:3020"),
} as const;
