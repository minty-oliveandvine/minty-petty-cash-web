/**
 * Flask (Minty, `ACCOUNTS_API_URL`) is a backend only: this app never sends a person to a Flask
 * PAGE (docs/features/petty-cash-web.md, "No Flask pages"). Every address it builds on Flask comes
 * from `@minty/shared` - `hubHandoffUrl`, `logoutUrl` (handoff), `settingsSectionUrl`,
 * `paymentRequestSettingsUrl`, `billsUrl` (companyRef) - or this app's hand-off (lib/handoff.ts)
 * and its JSON clients (lib/apiClient.ts); lib/__tests__/noFlaskPages.test.ts holds every file to
 * that.
 *
 * The two below are this app's own names for minty-web settings sections it links to from more
 * than one screen, through Flask's `/handoff/minty-web`:
 *
 * - `integrationUrl` - minty-web's Entity & Integration tab, where Xero is connected or
 *   reconnected.
 * - `subscriptionSettingsUrl` - minty-web's Module page, where the subscription is managed (the
 *   launch page's subscription notice).
 */

import { settingsSectionUrl } from "@minty/shared/companyRef";

import { env } from "@/lib/env";

/** minty-web's Entity & Integration tab for the company (`/entity/<shortid>/<name>/settings/integration`), where Xero is connected. */
export function integrationUrl(entityId: string, entityName: string): string {
  return settingsSectionUrl(env.ACCOUNTS_API_URL, entityId, entityName, "integration");
}

/**
 * minty-web's Module page for the company (`/entity/<shortid>/<name>/settings/modules`), where its
 * subscription is managed - the subscription notice's "Go to subscription settings".
 */
export function subscriptionSettingsUrl(entityId: string, entityName: string): string {
  return settingsSectionUrl(env.ACCOUNTS_API_URL, entityId, entityName, "modules");
}
