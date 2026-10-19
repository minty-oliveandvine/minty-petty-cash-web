import { afterEach, describe, expect, it } from "vitest";

import {
  cleared,
  clearLabel,
  dateNote,
  edited,
  entryState,
  noteAnswer,
  readerOff,
  readingCopy,
  resetReaderLatch,
  suggestedText,
  suggestionsOf,
  usedNote,
  withoutSuggestions,
  withSuggestions,
  type Band,
  type ReadField,
  type Suggestions,
} from "@/lib/expenseAi";

const SUPPLIERS = [
  { id: "c1", name: "ParknShop" },
  { id: "c3", name: "Wellcome" },
];
const ACCOUNTS = [
  { id: "a1", code: "429", name: "General Expenses" },
  { id: "a2", code: "461", name: "Printing & Stationery" },
];
const CTX = { suppliers: SUPPLIERS, accounts: ACCOUNTS, code: "HKD", day: "2026-10-13", canCreateSupplier: true };

const read = (value: string, band: Band, applied = band !== "low"): ReadField => ({ value, confidence: band === "high" ? 0.95 : band === "medium" ? 0.7 : 0.3, band, applied });

function answer(band: Band = "high"): Suggestions {
  return {
    amount: read("448.80", band),
    description: read("Courier delivery", band),
    supplier: { ...read("Wellcome", band), contact_id: "c3" },
    account: { ...read("461 Printing & Stationery", band), account_id: "a2", code: "461", name: "Printing & Stationery" },
    document_date: read("2026-10-12", "high"),
    currency: "HKD",
    entity_currency: "HKD",
  };
}

describe("an answer on an empty form", () => {
  it("fills every applied field, marks each with its band, and says so once", () => {
    const next = withSuggestions(entryState(), answer("high"), CTX);
    expect(next.values).toEqual({ amount: "448.80", query: "Wellcome", supplier: { id: "c3", name: "Wellcome" }, accountId: "a2", remarks: "Courier delivery" });
    expect(next.marks).toEqual({ amount: "high", description: "high", supplier: "high", account: "high" });
    expect(next.notes).toEqual({});
    expect(next.announcement).toBe("Suggestions from the receipt filled 4 fields: amount, description, supplier, account. Check them before you go on.");
  });

  it("marks the medium band for checking - it is filled all the same", () => {
    const next = withSuggestions(entryState(), answer("medium"), CTX);
    expect(next.values.amount).toBe("448.80");
    expect(next.marks.amount).toBe("medium");
    expect(suggestedText("medium")).toBe("Suggested from the receipt. Check it before you go on.");
    expect(suggestedText("high")).toBe("Suggested from the receipt.");
  });

  it("never fills the low band: the amount, supplier and account become hints with the receipt's reading, the description nothing", () => {
    const next = withSuggestions(entryState(), answer("low"), CTX);
    expect(next.values).toEqual(entryState().values);
    expect(next.marks).toEqual({});
    expect(next.notes.amount).toEqual({ text: "The receipt might read HKD448.80.", fill: { amount: "448.80" }, band: "low" });
    expect(next.notes.supplier?.text).toBe('The receipt might read like "Wellcome".');
    expect(next.notes.account?.text).toBe('The receipt might read like "Printing & Stationery".');
    expect(next.notes.description).toBeUndefined();
    expect(next.announcement).toBe("The receipt reads differently for: amount, supplier, account. Nothing was changed.");
  });

  it("groups a large amount as the Amount input shows it", () => {
    const next = withSuggestions(entryState(), { amount: read("12345.5", "high") }, CTX);
    expect(next.values.amount).toBe("12,345.50");
  });

  it("chooses a supplier and an account only by an id the company has", () => {
    const next = withSuggestions(
      entryState(),
      { supplier: { ...read("Ghost Ltd", "high"), contact_id: "nope" }, account: { ...read("999 Gone", "high"), account_id: "gone", code: "999", name: "Gone" } },
      CTX,
    );
    expect(next.values.supplier).toBeNull();
    expect(next.values.accountId).toBe("");
    expect(next.marks).toEqual({});
  });

  it("offers a supplier name that is not on the list for New supplier - only to someone who may add one", () => {
    const unknown: Suggestions = { supplier: { value: "", confidence: 0, band: "low", applied: false, contact_id: "", detected_name: " Kwok Transport " } };
    const next = withSuggestions(entryState(), unknown, CTX);
    expect(next.detectedName).toBe("Kwok Transport");
    expect(next.values.supplier).toBeNull();
    expect(next.announcement).toBe("The receipt names a supplier that is not in your list: Kwok Transport.");
    expect(withSuggestions(entryState(), unknown, { ...CTX, canCreateSupplier: false }).detectedName).toBeNull();
  });

  it("adds a far-off receipt date to the announcement, and never blocks anything", () => {
    const s = { ...answer("high"), document_date: read("2026-09-01", "high") };
    expect(withSuggestions(entryState(), s, CTX).announcement).toContain("This receipt is dated 2026-09-01, more than a week from this report's day.");
    expect(dateNote(read("2026-10-07", "high"), "2026-10-13")).toBe("");
    expect(dateNote(read("2026-10-01", "low"), "2026-10-13")).toBe("");
  });

  it("ignores the currency, as Flask does", () => {
    const s = { ...answer("high"), currency: "USD", entity_currency: "HKD" };
    expect(withSuggestions(entryState(), s, CTX).values.amount).toBe("448.80");
  });
});

describe("never overwriting the person", () => {
  const typed = entryState({ amount: "44.80", query: "ParknShop", supplier: SUPPLIERS[0], accountId: "a1", remarks: "Taxi" });

  it("leaves every filled field alone and offers the receipt's different reading instead", () => {
    const next = withSuggestions(typed, answer("high"), CTX);
    expect(next.values).toEqual(typed.values);
    expect(next.marks).toEqual({});
    expect(next.notes.amount?.text).toBe("The receipt reads HKD448.80, not HKD44.80.");
    expect(next.notes.supplier?.text).toBe('The receipt reads like "Wellcome", not "ParknShop".');
    expect(next.notes.account?.text).toBe('The receipt reads more like "Printing & Stationery" than "General Expenses".');
    expect(next.notes.description).toBeUndefined();
  });

  it("says nothing where the receipt agrees", () => {
    const same = entryState({ amount: "448.80", query: "wellcome", supplier: SUPPLIERS[1], accountId: "a2", remarks: "" });
    expect(withSuggestions(same, answer("high"), CTX).notes).toEqual({});
  });

  it("hedges a low-band disagreement", () => {
    expect(withSuggestions(typed, answer("low"), CTX).notes.amount?.text).toBe("The receipt might read HKD448.80, not HKD44.80.");
  });

  it("uses the receipt's reading only on its button, marked as suggested", () => {
    const next = usedNote(withSuggestions(typed, answer("high"), CTX), "amount");
    expect(next.values.amount).toBe("448.80");
    expect(next.marks.amount).toBe("high");
    expect(next.notes.amount).toBeUndefined();
  });
});

describe("after the answer", () => {
  const filled = () => withSuggestions(entryState(), answer("medium"), CTX);

  it("a field the person changes is theirs: its marking goes, the others stay", () => {
    const next = edited(filled(), "amount", { amount: "450" });
    expect(next.values.amount).toBe("450");
    expect(next.marks).toEqual({ description: "medium", supplier: "medium", account: "medium" });
  });

  it("the same value again (the amount grouped on blur) is no change", () => {
    const state = filled();
    expect(edited(state, "amount", { amount: "448.80" })).toBe(state);
  });

  it("the amount grouped on blur keeps its note - leaving the field to press 'Use' must not withdraw the offer", () => {
    const typed = withSuggestions(entryState({ ...entryState().values, amount: "45" }), { amount: read("48.80", "high") }, CTX);
    const blurred = edited(typed, "amount", { amount: "45.00" });
    expect(blurred.values.amount).toBe("45.00");
    expect(blurred.notes.amount?.text).toBe("The receipt reads HKD48.80, not HKD45.00.");
    expect(edited(typed, "amount", { amount: "46" }).notes.amount).toBeUndefined();
  });

  it("Clear empties a suggested field and its marking; a field no longer marked is never cleared", () => {
    const next = cleared(filled(), "supplier");
    expect(next.values.supplier).toBeNull();
    expect(next.values.query).toBe("");
    expect(next.marks.supplier).toBeUndefined();
    const mine = edited(filled(), "account", { accountId: "a1" });
    expect(cleared(mine, "account").values.accountId).toBe("a1");
    expect(clearLabel("account")).toBe("Clear the suggested account");
  });

  it("another receipt takes the old suggestions' values with them - and leaves what the person typed", () => {
    const state = edited(filled(), "description", { remarks: "Mine" });
    const next = withoutSuggestions(state);
    expect(next.values).toEqual({ amount: "", query: "", supplier: null, accountId: "", remarks: "Mine" });
    expect(next).toMatchObject({ marks: {}, notes: {}, detectedName: null, announcement: "" });
  });

  it("choosing a supplier yourself withdraws the offered name", () => {
    const offered = { ...entryState(), detectedName: "Kwok Transport" };
    expect(edited(offered, "supplier", { query: "Kw" }).detectedName).toBeNull();
    expect(edited(offered, "amount", { amount: "5" }).detectedName).toBe("Kwok Transport");
  });
});

describe("the answer and the session latch", () => {
  afterEach(() => resetReaderLatch());

  it("takes suggestions only from an answer that has them", () => {
    expect(suggestionsOf({ suggestions: null, reason: "rate_limited" })).toBeNull();
    expect(suggestionsOf(null)).toBeNull();
    expect(suggestionsOf({ lines: [] })).toBeNull();
    expect(suggestionsOf({ suggestions: { amount: read("1.00", "high") }, reason: null })).toEqual({ amount: read("1.00", "high") });
  });

  it("switches off for the session on 'disabled' (and 'not_configured'), never on a passing failure", () => {
    expect(readerOff()).toBe(false);
    noteAnswer({ reason: "rate_limited" });
    noteAnswer({ reason: "timeout" });
    noteAnswer(null);
    expect(readerOff()).toBe(false);
    noteAnswer({ reason: "disabled" });
    expect(readerOff()).toBe(true);
    expect(sessionStorage.getItem("minty.pc.receipt-reader")).toBe("off");
  });

  it("holds for the tab's session: a reload still finds it off", () => {
    sessionStorage.setItem("minty.pc.receipt-reader", "off");
    expect(readerOff()).toBe(true);
    sessionStorage.clear();
    noteAnswer({ reason: "not_configured" });
    sessionStorage.clear();
    // the in-memory latch holds even when storage is wiped or blocked
    expect(readerOff()).toBe(true);
  });
});

describe("the copy sent for reading", () => {
  it("is the file itself for a PDF, or where the canvas APIs are missing", async () => {
    const pdf = new File(["%PDF-1.4"], "scan.pdf", { type: "application/pdf" });
    expect(await readingCopy(pdf)).toBe(pdf);
    const png = new File(["x"], "taxi.png", { type: "image/png" });
    expect(await readingCopy(png)).toBe(png);
  });
});
