/**
 * One company's pages in this app: `/entity/<shortid>/<name>/petty-cash/...` - the address form
 * every Minty app shares (`@minty/shared/companyRef`; Flask's `blueprints/shared/entity_ref.py`).
 * The first 8 hex characters name the company; the name after them is only for reading. The
 * company an address names is `addressCompanyRef` / `companyRefFromPath` there.
 */

import { companyPath } from "@minty/shared/companyRef";

/** The company's Petty Cash home (`/entity/<shortid>/<name>/petty-cash`) from its id and name. */
export function pettyCashHome(entityId: string, entityName: string): string {
  return companyPath(entityId, entityName, "petty-cash");
}

/**
 * The company's Petty Cash settings (`/entity/<shortid>/<name>/settings/petty-cash`) - Flask's old
 * address for the page, so an old link still lands. Connecting Xero is minty-web's Entity &
 * Integration (`integrationUrl`, lib/hub.ts).
 */
export function settingsHref(entityId: string, entityName: string): string {
  return companyPath(entityId, entityName, "settings", "petty-cash");
}

/** The anchor of the settings page's Xero cards (the mapping, or "not connected"). */
export const XERO_ANCHOR = "xero";

/** The settings page at its Xero cards - where the account mapping and the account codes are set. */
export function xeroSettingsHref(entityId: string, entityName: string): string {
  return `${settingsHref(entityId, entityName)}#${XERO_ANCHOR}`;
}

/** The anchor of the settings page's Country & currency card. */
export const COUNTRY_ANCHOR = "country";

/** The settings page at its Country & currency card - where the company's currency is chosen. */
export function currencySettingsHref(entityId: string, entityName: string): string {
  return `${settingsHref(entityId, entityName)}#${COUNTRY_ANCHOR}`;
}
