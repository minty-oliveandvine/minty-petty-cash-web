/**
 * One company's pages in this app: `/entity/<shortid>/<name>/petty-cash/...` - the address form
 * every Minty app shares (`@minty/shared/companyRef`; Flask's `blueprints/shared/entity_ref.py`).
 * The first 8 hex characters name the company; the name after them is only for reading.
 */

import { companyRef } from "@minty/shared/companyRef";

const COMPANY_PATH = /^\/entity\/([0-9a-fA-F]{8})\/([^/?#]+)(?:\/|$|\?|#)/;

/**
 * `<shortid>/<name>` from a path inside a company, or "" when the path names none. The name comes
 * back decoded - a path is percent-encoded, and the hand-off's query string encodes it again.
 */
export function companyRefFromPath(path: string): string {
  const m = COMPANY_PATH.exec(path);
  if (!m) return "";
  let name = m[2];
  try {
    name = decodeURIComponent(name);
  } catch {
    // a malformed escape: keep it as written - only the short id decides the company
  }
  return `${m[1].toLowerCase()}/${name}`;
}

/** The company's Petty Cash home (`/entity/<shortid>/<name>/petty-cash`) from its id and name. */
export function pettyCashHome(entityId: string, entityName: string): string {
  return `/entity/${companyRef(entityId, entityName)}/petty-cash`;
}

/**
 * The company's Petty Cash settings (`/entity/<shortid>/<name>/settings/petty-cash`) - Flask's old
 * address for the page, so an old link still lands. Connecting Xero is minty-web's Entity &
 * Integration (`integrationUrl`, lib/hub.ts).
 */
export function settingsHref(entityId: string, entityName: string): string {
  return `/entity/${companyRef(entityId, entityName)}/settings/petty-cash`;
}

/** The anchor of the settings page's Xero cards (the mapping, or "not connected"). */
export const XERO_ANCHOR = "xero";

/** The settings page at its Xero cards - where the account mapping and the account codes are set. */
export function xeroSettingsHref(entityId: string, entityName: string): string {
  return `${settingsHref(entityId, entityName)}#${XERO_ANCHOR}`;
}
