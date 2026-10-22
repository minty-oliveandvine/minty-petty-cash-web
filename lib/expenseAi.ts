/**
 * The receipt reader (Part 15.14 AI-assisted; Part 14 AI field): what
 * `POST /reports/expenses/extract` answers, and how its suggestions land in the expense form -
 * as pure functions over the form's state, so the form (components/closing/ExpenseForm.tsx) only
 * draws what this says. Flask's `static/js/expense_ai.js` is the behaviour being ported:
 *
 *   Reading      a receipt is attached and being read  -> a calm notice; the form stays usable
 *   Suggested    a value came back with `applied: true` -> filled in empty fields only, marked
 *                ("Suggested from the receipt", "... Check it" for the medium band)
 *   Confirmed    the person changes the field          -> the marking goes
 *   Blank        low band (`applied: false`)           -> never filled; at most a hint to use it
 *   Unavailable  any failure                           -> nothing at all
 *
 * Two rules the rest exists to keep (Flask's): NEVER OVERWRITE THE PERSON - a field that holds a
 * value when the answer arrives is left alone, and the receipt's different reading is only
 * offered ("Use the value from the receipt"); and ADD IS NEVER BLOCKED - the read runs beside
 * the form, and nothing is written until Add (the API writes nothing either).
 *
 * A supplier is chosen only by its id from the company's list; a name read off the receipt that
 * is not a supplier is only offered for the New supplier panel - never created. The banding is
 * the server's (`EXPENSE_AI_CONF_*`); this side follows `band` and `applied` as they come.
 */

import { formatAmount, parseAmount } from "@minty/shared/money";

import type { ExpenseAccount, Supplier } from "@/lib/expenses";
import { money } from "@/lib/money";

export type Band = "high" | "medium" | "low";

/** One read field: the value, the model's confidence (0-1), its band, and whether to prefill. */
export type ReadField = { value: string; confidence: number; band: Band; applied: boolean };

export type Suggestions = {
  supplier?: ReadField & { contact_id?: string; detected_name?: string };
  account?: ReadField & { account_id?: string; code?: string; name?: string };
  amount?: ReadField;
  description?: ReadField;
  document_date?: ReadField;
  currency?: string;
  entity_currency?: string | null;
};

/** What the extract route answers: suggestions, or null and a reason code (shown to nobody). */
export type ExtractAnswer = { suggestions: Suggestions | null; reason: string | null };

/** The fields a suggestion can fill. */
export type SuggestedField = "amount" | "supplier" | "account" | "description";

/** The entry form's own values (the receipt is kept apart). */
export type EntryValues = { amount: string; query: string; supplier: Supplier | null; accountId: string; remarks: string };

/** A hint under a field: the receipt reads something else (or, low band, might). Nothing moves without its button. */
export type ReadNote = { text: string; fill: Partial<EntryValues>; band: Band };

export type EntryState = {
  values: EntryValues;
  /** Fields holding an untouched suggestion, by band. */
  marks: Partial<Record<SuggestedField, Band>>;
  notes: Partial<Record<SuggestedField, ReadNote>>;
  /** A supplier name read off the receipt that is not on the list - offered for New supplier. */
  detectedName: string | null;
  /** The one polite announcement of what the reading did ("" for nothing). */
  announcement: string;
};

export const EMPTY_VALUES: EntryValues = { amount: "", query: "", supplier: null, accountId: "", remarks: "" };

export function entryState(values: EntryValues = EMPTY_VALUES): EntryState {
  return { values, marks: {}, notes: {}, detectedName: null, announcement: "" };
}

// ---------------------------------------------------------------------------------------------
// The session latch

/**
 * The app can't know in advance whether the reader is switched on (`EXPENSE_AI_ENABLED` is the
 * API's): it learns from a `disabled` answer, and then gets out of the way for the rest of the
 * session - no further reads, nothing shown. `not_configured` means the same thing.
 */
export const READER_OFF_REASONS: readonly string[] = ["disabled", "not_configured"];

const LATCH_KEY = "minty.pc.receipt-reader";
let latched = false;

/** Whether the reader has said it is off in this browser session (tab). */
export function readerOff(): boolean {
  if (latched) return true;
  try {
    return sessionStorage.getItem(LATCH_KEY) === "off";
  } catch {
    // Storage can be blocked (private mode, site data off): the in-memory latch still holds.
    return false;
  }
}

/** Notes an answer: an off reason switches the reader off for the session. */
export function noteAnswer(answer: Pick<ExtractAnswer, "reason"> | null): void {
  if (!answer?.reason || !READER_OFF_REASONS.includes(answer.reason)) return;
  latched = true;
  try {
    sessionStorage.setItem(LATCH_KEY, "off");
  } catch {
    // As above: the in-memory latch is enough for this page's life.
  }
}

/** Tests only: forget the in-memory latch. */
export function resetReaderLatch(): void {
  latched = false;
}

/** The answer as data this side trusts the shape of, or null (anything else is "no suggestions"). */
export function suggestionsOf(answer: unknown): Suggestions | null {
  if (!answer || typeof answer !== "object") return null;
  const s = (answer as { suggestions?: unknown }).suggestions;
  return s && typeof s === "object" ? (s as Suggestions) : null;
}

// ---------------------------------------------------------------------------------------------
// The words

/** The source line under a filled field (Part 14 AI field: plain source text, no "AI"). */
export function suggestedText(band: Band): string {
  return band === "medium" ? "Suggested from the receipt. Check it before you go on." : "Suggested from the receipt.";
}

const FIELD_NAMES: Record<SuggestedField, string> = { amount: "amount", supplier: "supplier", account: "account", description: "description" };

/** The Clear button's accessible name. */
export function clearLabel(field: SuggestedField): string {
  return `Clear the suggested ${FIELD_NAMES[field]}`;
}

const hedge = (band: Band) => (band === "low" ? "might read" : "reads");

// ---------------------------------------------------------------------------------------------
// The rules

const emptyText = (text: string) => text.trim() === "";
const sameText = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
const sameAmount = (a: string, b: string) => Math.abs((parseAmount(a) ?? 0) - (parseAmount(b) ?? 0)) < 0.005;

/**
 * The receipt's amount as plain digits: the reader may send it with currency letters, a symbol or
 * spaces ("HKD 448.80", "$ 1,200"), which the shared formatter would refuse - only the digits, the
 * point and a minus are kept (a minus keeps a negative reading out, as before).
 */
const receiptAmount = (raw: string) => raw.replace(/[^\d.-]/g, "");

/** More than a week between the receipt's date and the day being closed: said, never blocking. */
export function dateNote(date: ReadField | undefined, day: string): string {
  if (!date?.applied || !date.value) return "";
  const receipt = Date.parse(date.value);
  const report = Date.parse(day);
  if (Number.isNaN(receipt) || Number.isNaN(report)) return "";
  if (Math.abs(receipt - report) / 86_400_000 <= 7) return "";
  return `This receipt is dated ${date.value}, more than a week from this report's day.`;
}

/**
 * The form after an answer: each applied suggestion fills its field when the field is empty
 * (and marks it); a reading that differs from what is already there - or a low-band one for an
 * empty field - becomes a note with "Use the value from the receipt"; an unknown supplier name is
 * offered for New supplier. Previous suggestions are expected to be gone already (`withoutSuggestions`).
 */
export function withSuggestions(
  state: EntryState,
  s: Suggestions,
  {
    suppliers,
    accounts,
    code,
    day,
    canCreateSupplier,
  }: { suppliers: Supplier[]; accounts: ExpenseAccount[]; code: string | null; day: string; canCreateSupplier: boolean },
): EntryState {
  const values = { ...state.values };
  const marks = { ...state.marks };
  const notes = { ...state.notes };
  let detectedName: string | null = null;
  const filled: SuggestedField[] = [];

  const fill = (field: SuggestedField, patch: Partial<EntryValues>, band: Band) => {
    Object.assign(values, patch);
    marks[field] = band;
    delete notes[field];
    filled.push(field);
  };

  // The amount.
  const amount = s.amount;
  const read = amount?.value ? receiptAmount(amount.value) : "";
  const shown = formatAmount(read);
  if (amount && shown && (parseAmount(read) ?? 0) > 0) {
    if (amount.applied && emptyText(values.amount)) fill("amount", { amount: shown }, amount.band);
    else if (emptyText(values.amount))
      notes.amount = { text: `The receipt ${hedge(amount.band)} ${money(shown, code)}.`, fill: { amount: shown }, band: amount.band };
    else if (!sameAmount(values.amount, read))
      notes.amount = {
        text: `The receipt ${hedge(amount.band)} ${money(shown, code)}, not ${money(parseAmount(values.amount) ?? 0, code)}.`,
        fill: { amount: shown },
        band: amount.band,
      };
  }

  // The description: filled only, never argued with (Flask's rule).
  const description = s.description;
  if (description?.applied && description.value && emptyText(values.remarks)) fill("description", { remarks: description.value }, description.band);

  // The supplier: by its id from the company's list only.
  const supplier = s.supplier;
  const supplierEmpty = !values.supplier && emptyText(values.query);
  const known = supplier?.contact_id ? (suppliers.find((x) => x.id === supplier.contact_id) ?? null) : null;
  if (supplier && known) {
    const patch = { supplier: known, query: known.name };
    if (supplier.applied && supplierEmpty) fill("supplier", patch, supplier.band);
    else if (supplierEmpty) notes.supplier = { text: `The receipt ${hedge(supplier.band)} like "${known.name}".`, fill: patch, band: supplier.band };
    else if (!sameText(values.supplier?.name ?? values.query, known.name))
      notes.supplier = {
        text: `The receipt ${hedge(supplier.band)} like "${known.name}", not "${(values.supplier?.name ?? values.query).trim()}".`,
        fill: patch,
        band: supplier.band,
      };
  } else if (supplier?.detected_name?.trim() && supplierEmpty && canCreateSupplier) {
    detectedName = supplier.detected_name.trim();
  }

  // The account: by its id from the accounts switched on for Petty Cash only.
  const account = s.account;
  const chosen = account?.account_id ? (accounts.find((a) => a.id === account.account_id) ?? null) : null;
  if (account && chosen) {
    const patch = { accountId: chosen.id };
    if (account.applied && values.accountId === "") fill("account", patch, account.band);
    else if (values.accountId === "") notes.account = { text: `The receipt ${hedge(account.band)} like "${chosen.name}".`, fill: patch, band: account.band };
    else if (values.accountId !== chosen.id) {
      const current = accounts.find((a) => a.id === values.accountId);
      notes.account = {
        text: current
          ? `The receipt ${hedge(account.band)} more like "${chosen.name}" than "${current.name}".`
          : `The receipt ${hedge(account.band)} more like "${chosen.name}".`,
        fill: patch,
        band: account.band,
      };
    }
  }

  // One announcement, not several: a live region written twice quickly may be read once.
  const parts: string[] = [];
  if (filled.length) {
    parts.push(
      `Suggestions from the receipt filled ${filled.length} ${filled.length === 1 ? "field" : "fields"}: ${filled.map((f) => FIELD_NAMES[f]).join(", ")}. Check them before you go on.`,
    );
  }
  const differing = (Object.keys(notes) as SuggestedField[]).filter((f) => notes[f] && !state.notes[f]);
  if (differing.length) parts.push(`The receipt reads differently for: ${differing.map((f) => FIELD_NAMES[f]).join(", ")}. Nothing was changed.`);
  if (detectedName) parts.push(`The receipt names a supplier that is not in your list: ${detectedName}.`);
  const date = dateNote(s.document_date, day);
  if (date && parts.length) parts.push(date);

  return { values, marks, notes, detectedName, announcement: parts.join(" ") };
}

/**
 * The person changed a field: it is theirs now (Confirmed) - its marking and its note go, and for
 * the supplier the offered name too. A change to the same value (the amount grouped on blur) is no change.
 */
export function edited(state: EntryState, field: SuggestedField, patch: Partial<EntryValues>): EntryState {
  const values = { ...state.values, ...patch };
  const changed = (Object.keys(patch) as (keyof EntryValues)[]).some((k) => patch[k] !== state.values[k]);
  if (!changed) return state;
  // The amount grouped on blur ("45" -> "45.00") is the same amount: the field keeps its marking
  // and its note - leaving the field to press "Use the amount from the receipt" must not withdraw it.
  if (field === "amount" && patch.amount !== undefined && !emptyText(patch.amount) && !emptyText(state.values.amount) && sameAmount(patch.amount, state.values.amount))
    return { ...state, values };
  const marks = { ...state.marks };
  const notes = { ...state.notes };
  delete marks[field];
  delete notes[field];
  return { ...state, values, marks, notes, detectedName: field === "supplier" ? null : state.detectedName };
}

const CLEARED: Record<SuggestedField, Partial<EntryValues>> = {
  amount: { amount: "" },
  supplier: { supplier: null, query: "" },
  account: { accountId: "" },
  description: { remarks: "" },
};

/** Clear: a suggested field's value goes with its marking (only ever for a field still marked). */
export function cleared(state: EntryState, field: SuggestedField): EntryState {
  if (!state.marks[field]) return state;
  const marks = { ...state.marks };
  delete marks[field];
  return { ...state, values: { ...state.values, ...CLEARED[field] }, marks };
}

/** "Use the value from the receipt": the note's value goes in, marked as suggested. */
export function usedNote(state: EntryState, field: SuggestedField): EntryState {
  const note = state.notes[field];
  if (!note) return state;
  const notes = { ...state.notes };
  delete notes[field];
  return { ...state, values: { ...state.values, ...note.fill }, marks: { ...state.marks, [field]: note.band }, notes };
}

/**
 * Another receipt (or none): the old one's suggestions go entirely - the VALUES of fields still
 * marked too, or the never-overwrite rule would protect stale suggestions as if typed. Fields the
 * person changed are unmarked already and stay as they are.
 */
export function withoutSuggestions(state: EntryState): EntryState {
  let values = { ...state.values };
  for (const field of Object.keys(state.marks) as SuggestedField[]) values = { ...values, ...CLEARED[field] };
  return { values, marks: {}, notes: {}, detectedName: null, announcement: "" };
}

// ---------------------------------------------------------------------------------------------
// The copy that is sent

const MAX_EDGE = 2000;
const JPEG_QUALITY = 0.85;

/**
 * A photo resized in the browser before it is read (Flask's `shrinkForUpload`): a phone photo is
 * 8-12 MB, and 2000px on the long edge is plenty to read a receipt. THIS COPY IS FOR READING ONLY -
 * Add still sends the untouched original. A PDF, a small photo, or a browser without the canvas
 * APIs gets the file itself back; so does any failure.
 */
export async function readingCopy(file: File): Promise<Blob> {
  if (!/^image\/(jpe?g|png)$/i.test(file.type)) return file;
  if (typeof createImageBitmap !== "function" || typeof document === "undefined") return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    if (scale === 1) {
      bitmap.close();
      return file;
    }
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const context = canvas.getContext("2d");
    if (!context) {
      bitmap.close();
      return file;
    }
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY));
    // Only when it is actually smaller: a tiny detailed image can re-encode larger.
    return blob && blob.size < file.size ? blob : file;
  } catch {
    // Unsupported, out of memory, a browser quirk: the original goes, and the server shrinks it.
    return file;
  }
}
