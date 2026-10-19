/**
 * Flask (Minty, `ACCOUNTS_API_URL`) is a backend only: this app never sends a person to a Flask
 * PAGE (docs/features/petty-cash-web.md, "No Flask pages"). The addresses it may build on Flask
 * are the login-gated hand-offs and actions below, the petty-cash-web hand-off (lib/handoff.ts)
 * and the JSON APIs (lib/apiClient.ts) - lib/__tests__/noFlaskPages.test.ts holds every other
 * file to that.
 *
 * - `hubUrl` - minty-web's page `next`, through Flask's `/handoff/minty-web` (it mints minty-web's
 *   token and redirects; with `entityId` the token is scoped to that company).
 * - `integrationUrl` - minty-web's Entity & Integration tab, where Xero is connected or
 *   reconnected, through that hand-off.
 * - `subscriptionSettingsUrl` - minty-web's Module page, where the subscription is managed (the
 *   launch page's subscription notice), through that hand-off.
 * - `billsUrl` - the payments app, through Flask's `/entity/<id>/payment-request`: a hand-off that
 *   mints the payments app's token and redirects (Minty `go_to_bills`), never a page.
 * - `logoutUrl` - Flask's `/logout`: ends the session everywhere, then redirects to minty-web's
 *   sign-in.
 */

import { companyRef } from "@minty/shared/companyRef";

import { env } from "@/lib/env";
import { withReturnOrigin } from "@/lib/handoff";

/** A Flask address (accounts), naming this app as where to hand back to in a preview set. */
function accounts(path: string): string {
  return withReturnOrigin(`${env.ACCOUNTS_API_URL}${path}`);
}

/** minty-web's page `next`, through Flask's login-gated re-handoff (scoped to `entityId` when given). */
export function hubUrl(next: string, entityId?: string): string {
  const qs = new URLSearchParams({ next });
  if (entityId) qs.set("entity_id", entityId);
  return accounts(`/handoff/minty-web?${qs.toString()}`);
}

/** minty-web's Entity & Integration tab for the company (`/entity/<shortid>/<name>/settings/integration`), where Xero is connected. */
export function integrationUrl(entityId: string, entityName: string): string {
  return hubUrl(`/entity/${companyRef(entityId, entityName)}/settings/integration`, entityId);
}

/**
 * minty-web's Module page for the company (`/entity/<shortid>/<name>/settings/modules`), where its
 * subscription is managed - the subscription notice's "Go to subscription settings".
 */
export function subscriptionSettingsUrl(entityId: string, entityName: string): string {
  return hubUrl(`/entity/${companyRef(entityId, entityName)}/settings/modules`, entityId);
}

/** The payments app for the company, through Flask's token hand-off (`/entity/<id>/payment-request`). */
export function billsUrl(entityId: string): string {
  return accounts(`/entity/${encodeURIComponent(entityId)}/payment-request`);
}

/** Flask's `/logout` (ends the session, then minty-web's sign-in). */
export function logoutUrl(): string {
  return `${env.ACCOUNTS_API_URL}/logout`;
}
