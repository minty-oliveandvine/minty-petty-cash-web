/**
 * Petty Cash Settings' rules - the cards that need no Xero, ported from Flask's ORIGINAL
 * `entity/settings_entity.html` and `static/js/petty_cash_settings.js` (Minty `1c25b35^1`):
 * Country & currency and the Electronic / Delivery sales methods. What it reads and writes is
 * Minty's `petty_cash_api/routes/settings.py` (`GET /settings`, `PUT /settings/country`,
 * `/sales-methods...`). The Xero mapping and the account codes stay on Flask's page.
 */

import { companyRef } from "@minty/shared/companyRef";

export type MethodType = "electronic" | "delivery";
export const METHOD_TYPES: readonly MethodType[] = ["electronic", "delivery"];

/** `shared`: another company has it too, so the API refuses a rename (409). */
export type SalesMethod = { id: string; name: string; value_name: string; shared: boolean };
export type CatalogueMethod = { id: string; name: string };

export type SettingsPermissions = {
  edit_country: boolean;
  view_sales_methods: boolean;
  add_sales_method: boolean;
  rename_sales_method: boolean;
  remove_sales_method: boolean;
  reorder_sales_methods: boolean;
};

export type SettingsRead = {
  country: {
    country_code: string | null;
    currency_id: string | null;
    countries: { code: string; name: string }[];
    currencies: { id: string; name: string }[];
    selected_country: string | null;
    selected_currency: string | null;
  };
  sales_methods: Record<MethodType, SalesMethod[]>;
  available: Record<MethodType, CatalogueMethod[]>;
  xero_connected: boolean;
  permissions: SettingsPermissions;
};

/** Every write answers the whole read again, with the sentence to show. */
export type SettingsAnswer = SettingsRead & { message: string };

/** The API's limit on a method's name (`NAME_MAX`). */
export const NAME_MAX = 100;
export const NAME_EMPTY = "The method's name is still empty. Type a name to add it.";

/** Flask's wording for each card (`partials/electronic_delivery_section.html`, the script's KINDS). */
export const KIND: Record<MethodType, { title: string; sub: string; noun: string; pick: string; enter: string }> = {
  electronic: {
    title: "Electronic",
    sub: "Card and wallet payments a sales report can record.",
    noun: "payment method",
    pick: "Select a payment method",
    enter: "Enter payment method name",
  },
  delivery: {
    title: "Delivery",
    sub: "Delivery platforms a sales report can record.",
    noun: "delivery method",
    pick: "Select a delivery method",
    enter: "Enter delivery method name",
  },
};

/** The page, at Flask's own address for it: `/entity/<shortid>/<name>/settings/petty-cash`. */
export function settingsHref(entityId: string, entityName: string): string {
  return `/entity/${companyRef(entityId, entityName)}/settings/petty-cash`;
}

export type Option = { value: string; label: string };

/**
 * A country or currency picker's rows (Flask's `wireRegistryPicker`): the whole list when the
 * box is empty or still shows the current choice, else every name containing what is typed.
 */
export function registryOptions(all: Option[], query: string, currentLabel: string): Option[] {
  const q = query.trim().toLowerCase();
  if (!q || q === currentLabel.trim().toLowerCase()) return all;
  return all.filter((row) => row.label.toLowerCase().includes(q));
}

/**
 * What Save sends for the pickers, or null when nothing changed. A country on its own brings its
 * currency (the API's rule), so the currency goes only when it was picked by hand.
 */
export function countryChange(
  read: SettingsRead,
  picked: { country_code: string; currency_id: string },
): { country_code?: string; currency_id?: string } | null {
  const body: { country_code?: string; currency_id?: string } = {};
  if (picked.country_code && picked.country_code !== (read.country.country_code ?? "")) body.country_code = picked.country_code;
  if (picked.currency_id && picked.currency_id !== (read.country.currency_id ?? "")) body.currency_id = picked.currency_id;
  return Object.keys(body).length ? body : null;
}

/** The catalogue picker's rows: the methods offered (`available`, never on the list), filtered. */
export function catalogueOptions(available: CatalogueMethod[], query: string): CatalogueMethod[] {
  const q = query.trim().toLowerCase();
  return q ? available.filter((m) => m.name.toLowerCase().includes(q)) : available;
}

/**
 * A new or renamed method's name, checked as it is typed: too long, or already on this type's
 * list (any case, as the API's 409) - null when fine. An empty name is only "not finished", so it
 * says nothing here; the Add that is refused for it says `NAME_EMPTY`. `except` is the method
 * being renamed, which may keep its own name.
 */
export function methodNameProblem(name: string, listed: SalesMethod[], except?: string): string | null {
  const wanted = name.trim();
  if (!wanted) return null;
  if (wanted.length > NAME_MAX) return `That name is too long. Keep it to ${NAME_MAX} characters or fewer.`;
  const folded = wanted.toLowerCase();
  if (listed.some((m) => m.id !== except && m.name.trim().toLowerCase() === folded)) return `${wanted} is already on the list.`;
  return null;
}

/** Said at once when a shared method's name is clicked, instead of a rename box the API would refuse. */
export function sharedRenameMessage(name: string): string {
  return `Other companies use ${name} too, so it can't be renamed here. Delete it and add a new method instead.`;
}

/** The type's ids after moving `index` one place (`step` -1 up, +1 down); null past either end. */
export function movedIds(ids: string[], index: number, step: -1 | 1): string[] | null {
  const to = index + step;
  if (index < 0 || index >= ids.length || to < 0 || to >= ids.length) return null;
  const next = ids.slice();
  const [moved] = next.splice(index, 1);
  next.splice(to, 0, moved);
  return next;
}

/** Nothing on the page is this person's to change (a cashier): Flask's view-only notice. */
export function viewOnly(p: SettingsPermissions): boolean {
  return !(p.edit_country || p.add_sales_method || p.rename_sales_method || p.remove_sales_method || p.reorder_sales_methods);
}
