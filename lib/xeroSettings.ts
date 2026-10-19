/**
 * Petty Cash Settings' Xero cards - the account mapping and the account codes - ported from Flask's
 * ORIGINAL `entity/settings_entity.html`, `partials/xero_account_mapping_cards_classic.html`,
 * `partials/xero_mapping_classic_script_fragment.html` and `static/js/petty_cash_settings.js`
 * (Minty `1c25b35^1`). What they read and write is Minty's `petty_cash_api/routes/settings.py`
 * (`xero_settings_answer`): `GET /settings/xero`, `PUT /settings/xero/mapping` and
 * `PUT /settings/xero/account-codes`. A new contact is `POST /suppliers`.
 */

export type MappingKey =
  | "main_bank"
  | "deposit_bank"
  | "cashsale_account"
  | "cashsale_contact"
  | "owners_account"
  | "owners_contact"
  | "discrepancy_account"
  | "discrepancy_contact";

/** The eight the person chooses, in Flask's order. The Discrepancy Bank Account mirrors the Petty Cash Account (the API sets it). */
export const MAPPING_KEYS: readonly MappingKey[] = [
  "main_bank",
  "deposit_bank",
  "cashsale_account",
  "cashsale_contact",
  "owners_account",
  "owners_contact",
  "discrepancy_account",
  "discrepancy_contact",
];

export type XeroOption = { id: string; name: string; code?: string };
export type MappingField = { key: MappingKey; label: string; kind: "account" | "contact"; options: XeroOption[]; selected: string | null };
export type AccountCode = { code: string; name: string; selected: boolean };

export type XeroRead = {
  live: boolean;
  organisation: string | null;
  mapping: MappingField[] | null;
  mapping_saved: boolean;
  account_codes: AccountCode[] | null;
  permissions: { edit_mapping: boolean; edit_account_codes: boolean };
};

export type MappingAnswer = XeroRead & { message: string; first_save: boolean };
export type CodesAnswer = XeroRead & { message: string };

/**
 * Flask's mapping card, group by group (`xero_account_mapping_cards_classic.html`): each group's
 * heading, then each field's line above its picker and the picker's placeholder.
 */
export const MAPPING_GROUPS: readonly { title: string; fields: readonly { key: MappingKey; sub: string; placeholder: string }[] }[] = [
  { title: "Petty Cash Account", fields: [{ key: "main_bank", sub: "Select Petty Cash bank account from Xero", placeholder: "Select a bank account" }] },
  { title: "Deposit Bank Account", fields: [{ key: "deposit_bank", sub: "Select bank account to deposit excess cash", placeholder: "Select a bank account" }] },
  {
    title: "Cash Sales",
    fields: [
      { key: "cashsale_account", sub: "Select account code for cash sales", placeholder: "Select an account code" },
      { key: "cashsale_contact", sub: "Select the Customer contact", placeholder: "Select a contact" },
    ],
  },
  {
    title: "Director Personal Account",
    fields: [
      { key: "owners_account", sub: "Select account code for the Advance Payment from director", placeholder: "Select an account code" },
      { key: "owners_contact", sub: "Select Director or Responsible person", placeholder: "Select a contact" },
    ],
  },
  {
    title: "Discrepancy - Other Expense",
    fields: [
      { key: "discrepancy_account", sub: "Select account code to record Cash Discrepancy", placeholder: "Select an account code" },
      { key: "discrepancy_contact", sub: "Select Director or Responsible person", placeholder: "Select a contact" },
    ],
  },
];

export const SAME_BANK = "The Petty Cash Account and the Deposit Bank Account can't be the same. Choose a different one for each.";
export const CODES_NONE = "Pick at least one account code.";
export const CONTACT_EMPTY = "The contact's name is still empty. Type a name to create it.";

export type Selection = Record<MappingKey, string>;

/** What the box shows for a chosen option: Flask's "Name - Code" for an account with a code, else the name. */
export function optionLabel(option: XeroOption): string {
  return option.code ? `${option.name} - ${option.code}` : option.name;
}

/** The saved choice of each field ("" when none), as the page starts. */
export function selectionOf(mapping: MappingField[]): Selection {
  const out = Object.fromEntries(MAPPING_KEYS.map((k) => [k, ""])) as Selection;
  for (const field of mapping) out[field.key] = field.selected ?? "";
  return out;
}

/** Whether anything differs from what was read. */
export function mappingChanged(mapping: MappingField[], picked: Selection): boolean {
  const saved = selectionOf(mapping);
  return MAPPING_KEYS.some((k) => saved[k] !== picked[k]);
}

/** The other bank field's choice is never offered (Flask's pickers left it out). */
function otherBank(key: MappingKey, picked: Selection): string | null {
  if (key === "main_bank") return picked.deposit_bank || null;
  if (key === "deposit_bank") return picked.main_bank || null;
  return null;
}

/**
 * An account picker's rows for what is typed (Flask's `initialize*Search`): every option when the box
 * is empty or still shows the current choice, else those whose name or code holds the text, any case.
 */
export function accountOptions(field: MappingField, query: string, currentLabel: string, picked: Selection): XeroOption[] {
  const skip = otherBank(field.key, picked);
  const offered = field.options.filter((o) => o.id !== skip);
  const q = query.trim().toLowerCase();
  if (!q || q === currentLabel.trim().toLowerCase()) return offered;
  return offered.filter((o) => o.name.toLowerCase().includes(q) || (o.code ?? "").toLowerCase().includes(q));
}

/**
 * A contact picker's rows (Flask's contact search): the names holding the text, and `offerNew` - the
 * text to offer as a new contact when no name is exactly it (Flask's "+ Add '<name>' as a new
 * contact"), or "" for its bare "+ Add as a new contact" when nothing is typed and nothing matches.
 */
export function contactOptions(field: MappingField, query: string, currentLabel: string): { matches: XeroOption[]; offerNew: string | null } {
  const q = query.trim();
  if (!q || q.toLowerCase() === currentLabel.trim().toLowerCase()) return { matches: field.options, offerNew: field.options.length ? null : "" };
  const folded = q.toLowerCase();
  const matches = field.options.filter((o) => o.name.toLowerCase().includes(folded));
  const exact = field.options.some((o) => o.name.toLowerCase() === folded);
  return { matches, offerNew: exact ? null : q };
}

/**
 * What the mapping's own rules say before it is sent, field by field (each field's key -> its
 * sentence; empty when it may go). An empty field is only reported once a save was refused for it
 * (`refused`), as CLAUDE.md asks; the two banks being one is said at once.
 */
export function mappingProblems(mapping: MappingField[], picked: Selection, refused: boolean): Partial<Record<MappingKey, string>> {
  const out: Partial<Record<MappingKey, string>> = {};
  if (refused) {
    for (const field of mapping) if (!picked[field.key]) out[field.key] = `Choose the ${field.label}.`;
  }
  if (picked.main_bank && picked.main_bank === picked.deposit_bank) {
    out.main_bank = SAME_BANK;
    out.deposit_bank = SAME_BANK;
  }
  return out;
}

/** The fields an API sentence names ("Choose the <label>.", "... from the list.", the two banks), to mark them. */
export function fieldsNamed(sentence: string, mapping: MappingField[]): MappingKey[] {
  const text = sentence.toLowerCase();
  return mapping.filter((f) => text.includes(`the ${f.label.toLowerCase()}`)).map((f) => f.key);
}

/** The PUT's body: the eight keys, each a Xero id. */
export function mappingBody(picked: Selection): Selection {
  return Object.fromEntries(MAPPING_KEYS.map((k) => [k, picked[k]])) as Selection;
}

/** A new contact goes into every contact picker's list (one Xero contact list), and is chosen in its own. */
export function withContact(mapping: MappingField[], contact: XeroOption): MappingField[] {
  return mapping.map((f) => (f.kind === "contact" && !f.options.some((o) => o.id === contact.id) ? { ...f, options: [...f.options, contact] } : f));
}

// --- the account codes ---------------------------------------------------------------------------

/** Flask's row label: "<code> - <name>", or the code alone. */
export function codeLabel(row: AccountCode): string {
  return row.name ? `${row.code} - ${row.name}` : row.code;
}

/** The rows Flask offered (a row without a code can never be saved), filtered by the search box. */
export function shownCodes(codes: AccountCode[], query: string): AccountCode[] {
  const rows = codes.filter((r) => r.code.trim() !== "");
  const q = query.trim().toLowerCase();
  return q ? rows.filter((r) => codeLabel(r).toLowerCase().includes(q)) : rows;
}

/** "Select all"'s box for the rows shown: all ticked, some (indeterminate) or none. */
export function selectAllState(rows: AccountCode[], ticked: ReadonlySet<string>): "all" | "some" | "none" {
  const on = rows.filter((r) => ticked.has(r.code)).length;
  if (rows.length > 0 && on === rows.length) return "all";
  return on > 0 ? "some" : "none";
}

/** The rule as it is ticked: at least one stays ticked - unless the company has no codes at all (the API's rule). */
export function codesProblem(codes: AccountCode[], ticked: ReadonlySet<string>): string | null {
  const offered = codes.filter((r) => r.code.trim() !== "");
  return offered.length > 0 && !offered.some((r) => ticked.has(r.code)) ? CODES_NONE : null;
}

/** Whether the ticks differ from what was read. */
export function codesChanged(codes: AccountCode[], ticked: ReadonlySet<string>): boolean {
  return codes.some((r) => r.code.trim() !== "" && r.selected !== ticked.has(r.code));
}

/** The PUT's body: the ticked codes, sorted (Flask's `tickedCodes`). */
export function codesBody(ticked: ReadonlySet<string>): { codes: string[] } {
  return { codes: [...ticked].filter((c) => c.trim() !== "").sort() };
}
