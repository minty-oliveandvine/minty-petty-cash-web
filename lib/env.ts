/**
 * The sibling URLs this app reads - and the only place it reads them.
 *
 * Each is spelled out as a literal `process.env.X` access of a key next.config.ts lists under
 * `env`, so Next inlines it into the client bundle AND proxy.ts at build time; a dynamic
 * `process.env[name]` is never inlined and silently reads undefined in the browser.
 * next.config.ts passes the raw value through.
 *
 * The names follow the owner's 2026-10-14 decision: Flask is becoming `accounts-api` (sign-in,
 * tokens, companies, My Profile), and Petty Cash has its own API, Django `minty-petty-cash-api`
 * (`/api/petty-cash/v1/...` - the same paths Flask's copy serves).
 *
 * Defaults are the decided local ports (Flask 8000, Petty Cash API 8010, Subscription API 8001),
 * in development and tests only: `envUrl` (@minty/shared/env) trims, strips trailing slashes and
 * THROWS in a production build when a variable is unset - CI and every Vercel environment set all
 * four.
 */

import { envUrl } from "@minty/shared/env";

export const env = {
  /** Flask (Minty, becoming accounts-api): the hand-off that mints this app's token, My Profile's read. */
  ACCOUNTS_API_URL: envUrl("ACCOUNTS_API_URL", process.env.ACCOUNTS_API_URL, "http://localhost:8000"),
  /** Petty Cash's API - every read and write of reports, expenses, cash counts and settings. */
  PETTY_CASH_API_URL: envUrl("PETTY_CASH_API_URL", process.env.PETTY_CASH_API_URL, "http://localhost:8010"),
  /** minty-subscription-api - the sidebar's Subscriptions. */
  SUBSCRIPTION_API_URL: envUrl("SUBSCRIPTION_API_URL", process.env.SUBSCRIPTION_API_URL, "http://localhost:8001"),
  /** minty-payment-request-web - the sidebar's Bills. */
  PAYMENT_REQUEST_WEB_URL: envUrl("PAYMENT_REQUEST_WEB_URL", process.env.PAYMENT_REQUEST_WEB_URL, "http://localhost:3020"),
} as const;
