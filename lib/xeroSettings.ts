/**
 * Petty Cash settings' Xero cards (Part 15.20b, one Save per card): the rules of
 * `components/settings/XeroCards.tsx`. They read `GET /settings/xero` and write through
 * `PUT /settings/xero/mapping` and `PUT /settings/xero/account-codes` (Minty
 * `petty_cash_api/routes/settings.py`, `xero_settings_answer`); a new contact is `POST /suppliers`.
 *
 * The read asks Xero on the server, so the page reads it once. Connecting to Xero stays Flask's.
 */

import { MAX_SUPPLIER_NAME } from "@/lib/expenses";

/** The eight choices, in Flask's order (`xero_mapping.FIELDS`, without the Discrepancy Bank Account, which mirrors the Petty Cash Account). */
export const MAPPING_KEYS = [
  "main_bank",
  "deposit_bank",
  "cashsale_account",
  "cashsale_contact",
  "owners_account",
  "owners_contact",
  "discrepancy_account",
  "discrepancy_contact",
] as const;
export type MappingKey = (typeof MAPPING_KEYS)[number];

export type XeroOption = { id: string; name: string; code?: string };

export type MappingField = {
  key: MappingKey;
  label: string;
  kind: "account" | "contact";
  options: XeroOption[];
  /** The saved choice's Xero id, or null. */
  selected: string | null;
};

export type AccountCode = { code: string; name: string; selected: boolean };

/** `GET /settings/xero`. `mapping` and `account_codes` are null unless Xero is live. */
export type XeroSettings = {
  live: boolean;
  organisation: string | null;
  mapping: MappingField[] | null;
  /** A mapping has been saved before: until then, nothing can be published to Xero. */
  mapping_saved: boolean;
  account_codes: AccountCode[] | null;
  permissions: { edit_mapping: boolean; edit_account_codes: boolean };
};

export type MappingAnswer = XeroSettings & { message: string; first_save: boolean };
export type CodesAnswer = XeroSettings & { message: string };

/** A save's answer as the read it carries (without its sentence). */
export function readOf({
  live,
  organisation,
  mapping,
  mapping_saved,
  account_codes,
  permissions,
}: XeroSettings): XeroSettings {
  return { live, organisation, mapping, mapping_saved, account_codes, permissions };
}

const fold = (text: string) => text.trim().replace(/\s+/g, " ").toLowerCase();

/** "429 — General Expenses" for an account with a code (Part 14: the accounting value stays visible); the name alone otherwise. */
export function optionLabel(option: XeroOption): string {
  return option.code ? `${option.code} — ${option.name}` : option.name;
}

// --- The account mapping ----------------------------------------------------------------------

/** One picker on the page: what is typed, the choice (a Xero id, "" for none), and whether it was left. */
export type Pick = { text: string; id: string; left: boolean };
export type MappingDraft = Record<MappingKey, Pick>;

function fieldOf(settings: XeroSettings, key: MappingKey): MappingField | undefined {
  return settings.mapping?.find((f) => f.key === key);
}

function labelOfId(field: MappingField, id: string): string {
  const option = field.options.find((o) => o.id === id);
  return option ? optionLabel(option) : "";
}

export function mappingDraftOf(settings: XeroSettings): MappingDraft {
  const draft = {} as MappingDraft;
  for (const key of MAPPING_KEYS) {
    const field = fieldOf(settings, key);
    const id = field?.selected ?? "";
    draft[key] = { text: field && id ? labelOfId(field, id) : "", id, left: false };
  }
  return draft;
}

/** Typing: the choice goes unless the text is still the chosen option's own. */
export function typeInto(draft: MappingDraft, field: MappingField, text: string): MappingDraft {
  const pick = draft[field.key];
  const keep = pick.id && text === labelOfId(field, pick.id);
  return { ...draft, [field.key]: { text, id: keep ? pick.id : "", left: false } };
}

export function chooseOption(
  draft: MappingDraft,
  field: MappingField,
  option: XeroOption,
): MappingDraft {
  return { ...draft, [field.key]: { text: optionLabel(option), id: option.id, left: false } };
}

/** The one option a typed text names in full (its label or its name, any case), or null. */
export function exactOption(field: MappingField, text: string): XeroOption | null {
  const q = fold(text);
  if (!q) return null;
  const hits = field.options.filter((o) => fold(optionLabel(o)) === q || fold(o.name) === q);
  return hits.length === 1 ? hits[0] : null;
}

/** Leaving a field: a text that names one option in full is that option. */
export function leaveField(draft: MappingDraft, field: MappingField): MappingDraft {
  const pick = draft[field.key];
  if (!pick.id) {
    const hit = exactOption(field, pick.text);
    if (hit) return { ...draft, [field.key]: { text: optionLabel(hit), id: hit.id, left: true } };
  }
  return { ...draft, [field.key]: { ...pick, left: true } };
}

/** The options to show as `text` is typed: all of them while it is the chosen one's own text. */
export function optionMatches(field: MappingField, pick: Pick): XeroOption[] {
  const q = fold(pick.text);
  if (!q || (pick.id && pick.text === labelOfId(field, pick.id))) return field.options;
  return field.options.filter((o) => fold(optionLabel(o)).includes(q));
}

export const SAME_BANKS =
  "The Petty Cash Account and the Deposit Bank Account can't be the same. Choose a different one for each.";

/**
 * What is wrong with one choice (CLAUDE.md, Part 11 wording):
 * - the Deposit Bank Account the same as the Petty Cash Account, at once (the API's sentence);
 * - a text that names no option, once the field is left ("not finished yet" waits);
 * - empty, after a refused Save - or at once when a saved choice is emptied.
 */
export function mappingProblem(
  settings: XeroSettings,
  draft: MappingDraft,
  key: MappingKey,
  attempted: boolean,
): string | null {
  const field = fieldOf(settings, key);
  if (!field) return null;
  const pick = draft[key];
  if (key === "deposit_bank" && pick.id && pick.id === draft.main_bank.id) return SAME_BANKS;
  if (pick.id) return null;
  const text = pick.text.trim();
  if (text)
    return pick.left || attempted
      ? `${text} isn't in the list. Choose the ${field.label} from the list.`
      : null;
  return attempted || field.selected
    ? `The ${field.label} is still empty. Choose one from the list to save.`
    : null;
}

/** Every choice's problem, in the page's order: what a refused Save lists. */
export function mappingProblems(
  settings: XeroSettings,
  draft: MappingDraft,
  attempted: boolean,
): { key: MappingKey; message: string }[] {
  return MAPPING_KEYS.flatMap((key) => {
    const message = mappingProblem(settings, draft, key, attempted);
    return message ? [{ key, message }] : [];
  });
}

/** Whether the card changed: a choice other than the saved one, or a text typed over it. */
export function mappingDirty(settings: XeroSettings, draft: MappingDraft): boolean {
  const saved = mappingDraftOf(settings);
  return MAPPING_KEYS.some(
    (key) => draft[key].id !== saved[key].id || draft[key].text !== saved[key].text,
  );
}

/** The body for `PUT /settings/xero/mapping`: the eight Xero ids (the API sets the Discrepancy Bank Account). */
export function mappingBody(draft: MappingDraft): Record<MappingKey, string> {
  return Object.fromEntries(MAPPING_KEYS.map((key) => [key, draft[key].id])) as Record<
    MappingKey,
    string
  >;
}

/** The toast after a save. The first one says what it unlocks. */
export function mappingSavedMessage(answer: MappingAnswer): string {
  return answer.first_save
    ? `${answer.message} Daily Reports can be published to Xero now.`
    : answer.message;
}

// --- A new contact ------------------------------------------------------------------------------

/** Whether the list ends with 'Add "…" as a new contact': allowed, something typed, and no contact has that name. */
export function offersNewContact(field: MappingField, text: string, canCreate: boolean): boolean {
  const q = fold(text);
  return (
    canCreate &&
    field.kind === "contact" &&
    q !== "" &&
    !field.options.some((o) => fold(o.name) === q)
  );
}

/** A new contact's name, as it is typed. Empty waits for the Add contact press. */
export function newContactProblem(
  name: string,
  field: MappingField,
  attempted: boolean,
): string | null {
  const t = name.trim();
  if (!t) return attempted ? "The contact's name is still empty. Add the name to continue." : null;
  if (t.length > MAX_SUPPLIER_NAME)
    return `The name is ${t.length} characters. Keep it to ${MAX_SUPPLIER_NAME} characters or fewer.`;
  const same = field.options.find((o) => fold(o.name) === fold(t));
  return same ? `${same.name} is already a contact. Choose it from the list.` : null;
}

/** The read with a new contact offered in every contact field, A to Z. */
export function withContact(
  settings: XeroSettings,
  contact: { id: string; name: string },
): XeroSettings {
  if (!settings.mapping) return settings;
  return {
    ...settings,
    mapping: settings.mapping.map((f) =>
      f.kind !== "contact"
        ? f
        : {
            ...f,
            options: [
              ...f.options.filter((o) => o.id !== contact.id),
              { id: contact.id, name: contact.name },
            ].sort((a, b) => a.name.localeCompare(b.name)),
          },
    ),
  };
}

// --- The account codes --------------------------------------------------------------------------

/** The codes on offer: a row without a code can never be saved, so it is not offered (Flask's rule). */
export function codeRows(settings: XeroSettings): AccountCode[] {
  return (settings.account_codes ?? []).filter((c) => c.code.trim() !== "");
}

export function tickedOf(settings: XeroSettings): string[] {
  return codeRows(settings)
    .filter((c) => c.selected)
    .map((c) => c.code)
    .sort();
}

export function codeLabel(code: AccountCode): string {
  return code.name ? `${code.code} — ${code.name}` : code.code;
}

/** The codes whose label holds the search, any case; all of them for an empty one. */
export function codeMatches(codes: AccountCode[], query: string): AccountCode[] {
  const q = fold(query);
  return q ? codes.filter((c) => fold(codeLabel(c)).includes(q)) : codes;
}

export function toggleCode(ticked: string[], code: string, on: boolean): string[] {
  const rest = ticked.filter((c) => c !== code);
  return (on ? [...rest, code] : rest).sort();
}

/** Select all: every shown code on (or off), the others as they were. */
export function toggleShown(ticked: string[], shown: AccountCode[], on: boolean): string[] {
  const codes = new Set(shown.map((c) => c.code));
  const rest = ticked.filter((c) => !codes.has(c));
  return (on ? [...rest, ...codes] : rest).sort();
}

/** "all" | "some" | "none" of the shown codes ticked (Select all's mixed state). */
export function shownState(ticked: string[], shown: AccountCode[]): "all" | "some" | "none" {
  const n = shown.filter((c) => ticked.includes(c.code)).length;
  return n === 0 ? "none" : n === shown.length ? "all" : "some";
}

export const NO_CODE =
  "No account code is picked. Pick at least one to save: an expense can use only the picked codes.";

/** At least one code stays picked when the company has any (the API's 422 "Pick at least one account code."). */
export function codesProblem(settings: XeroSettings, ticked: string[]): string | null {
  return codeRows(settings).length > 0 && ticked.length === 0 ? NO_CODE : null;
}

export function codesDirty(settings: XeroSettings, ticked: string[]): boolean {
  return [...ticked].sort().join("\n") !== tickedOf(settings).join("\n");
}
