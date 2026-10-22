import { describe, expect, it } from "vitest";

import {
  chooseOption,
  codeLabel,
  codeMatches,
  codeRows,
  codesDirty,
  codesProblem,
  exactOption,
  leaveField,
  MAPPING_KEYS,
  mappingBody,
  mappingDirty,
  mappingDraftOf,
  mappingProblem,
  mappingProblems,
  mappingSavedMessage,
  newContactProblem,
  NO_CODE,
  offersNewContact,
  optionLabel,
  optionMatches,
  readOf,
  SAME_BANKS,
  shownState,
  tickedOf,
  toggleCode,
  toggleShown,
  typeInto,
  withContact,
  type MappingField,
  type MappingKey,
  type XeroSettings,
} from "@/lib/xeroSettings";

const BANKS = [
  { id: "b-pc", name: "Petty Cash", code: "091" },
  { id: "b-hsbc", name: "HSBC Current", code: "" },
];
const CONTACTS = [
  { id: "c-cash", name: "Cash Customer" },
  { id: "c-olive", name: "Olive Tan" },
];
const LABELS: Record<MappingKey, string> = {
  main_bank: "Petty Cash Account",
  deposit_bank: "Deposit Bank Account",
  cashsale_account: "Cash Sales account code",
  cashsale_contact: "Cash Sales contact",
  owners_account: "Director Personal Account code",
  owners_contact: "Director / Responsible person",
  discrepancy_account: "Discrepancy account code",
  discrepancy_contact: "Discrepancy contact",
};

function field(key: MappingKey, selected: string | null = null): MappingField {
  const contact = key.endsWith("_contact");
  const options = contact
    ? CONTACTS
    : key.endsWith("_bank")
      ? BANKS
      : [
          { id: `a-${key}`, name: "General Expenses", code: "429" },
          { id: `a2-${key}`, name: "Sales", code: "200" },
        ];
  return { key, label: LABELS[key], kind: contact ? "contact" : "account", options, selected };
}

const SAVED: Record<MappingKey, string> = {
  main_bank: "b-pc",
  deposit_bank: "b-hsbc",
  cashsale_account: "a2-cashsale_account",
  cashsale_contact: "c-cash",
  owners_account: "a-owners_account",
  owners_contact: "c-olive",
  discrepancy_account: "a-discrepancy_account",
  discrepancy_contact: "c-olive",
};

function xero(over: Partial<XeroSettings> = {}, saved = true): XeroSettings {
  return {
    live: true,
    organisation: "E2E Org",
    mapping: MAPPING_KEYS.map((k) => field(k, saved ? SAVED[k] : null)),
    mapping_saved: saved,
    account_codes: [
      { code: "429", name: "General Expenses", selected: true },
      { code: "400", name: "Advertising", selected: false },
      { code: "", name: "No code", selected: false },
    ],
    permissions: { edit_mapping: true, edit_account_codes: true },
    ...over,
  };
}

const f = (s: XeroSettings, key: MappingKey) => s.mapping!.find((x) => x.key === key)!;

describe("the mapping on the page", () => {
  it("labels an account by its code and name, a bank or contact without a code by its name", () => {
    expect(optionLabel({ id: "x", name: "General Expenses", code: "429" })).toBe(
      "429 — General Expenses",
    );
    expect(optionLabel({ id: "x", name: "HSBC Current", code: "" })).toBe("HSBC Current");
    expect(optionLabel({ id: "x", name: "Olive Tan" })).toBe("Olive Tan");
  });

  it("starts from the saved choices, and an unsaved mapping from nothing", () => {
    const s = xero();
    const d = mappingDraftOf(s);
    expect(d.main_bank).toEqual({ text: "091 — Petty Cash", id: "b-pc", left: false });
    expect(d.cashsale_contact.text).toBe("Cash Customer");
    expect(mappingDirty(s, d)).toBe(false);
    expect(mappingDraftOf(xero({}, false)).main_bank).toEqual({ text: "", id: "", left: false });
  });

  it("typing drops the choice, choosing sets it, and the body is the eight ids", () => {
    const s = xero();
    let d = typeInto(mappingDraftOf(s), f(s, "cashsale_contact"), "Oli");
    expect(d.cashsale_contact).toEqual({ text: "Oli", id: "", left: false });
    expect(mappingDirty(s, d)).toBe(true);
    d = chooseOption(d, f(s, "cashsale_contact"), CONTACTS[1]);
    expect(d.cashsale_contact.id).toBe("c-olive");
    expect(mappingBody(d)).toEqual({ ...SAVED, cashsale_contact: "c-olive" });
    expect(Object.keys(mappingBody(d))).not.toContain("discrepancy_bank");
  });

  it("leaving a field with a name typed in full chooses it; any case, by name or label", () => {
    const s = xero({}, false);
    const typed = typeInto(mappingDraftOf(s), f(s, "main_bank"), "petty cash");
    expect(leaveField(typed, f(s, "main_bank")).main_bank).toEqual({
      text: "091 — Petty Cash",
      id: "b-pc",
      left: true,
    });
    expect(exactOption(f(s, "main_bank"), "091 — petty cash")?.id).toBe("b-pc");
    expect(exactOption(f(s, "main_bank"), "Petty")).toBeNull();
    expect(
      leaveField(typeInto(mappingDraftOf(s), f(s, "main_bank"), "Petty"), f(s, "main_bank"))
        .main_bank,
    ).toEqual({ text: "Petty", id: "", left: true });
  });

  it("narrows the options as typed, and shows them all while the field holds its choice", () => {
    const s = xero();
    const d = mappingDraftOf(s);
    expect(optionMatches(f(s, "main_bank"), d.main_bank)).toHaveLength(2);
    expect(
      optionMatches(f(s, "cashsale_account"), { text: "429", id: "", left: false }).map(
        (o) => o.id,
      ),
    ).toEqual(["a-cashsale_account"]);
    expect(
      optionMatches(f(s, "cashsale_account"), { text: "sal", id: "", left: false }).map(
        (o) => o.name,
      ),
    ).toEqual(["Sales"]);
  });
});

describe("the mapping's checks, as typed", () => {
  it("says the two banks are the same at once, on the Deposit Bank Account", () => {
    const s = xero();
    const d = chooseOption(mappingDraftOf(s), f(s, "deposit_bank"), BANKS[0]);
    expect(mappingProblem(s, d, "deposit_bank", false)).toBe(SAME_BANKS);
    expect(mappingProblem(s, d, "main_bank", false)).toBeNull();
  });

  it("a name not in the list waits until the field is left, or a refused Save", () => {
    const s = xero();
    const typed = typeInto(mappingDraftOf(s), f(s, "owners_contact"), "Nobody");
    expect(mappingProblem(s, typed, "owners_contact", false)).toBeNull();
    const want =
      "Nobody isn't in the list. Choose the Director / Responsible person from the list.";
    expect(
      mappingProblem(s, leaveField(typed, f(s, "owners_contact")), "owners_contact", false),
    ).toBe(want);
    expect(mappingProblem(s, typed, "owners_contact", true)).toBe(want);
  });

  it("empty: at once when a saved choice is emptied, otherwise only after a refused Save", () => {
    const saved = xero();
    const emptied = typeInto(mappingDraftOf(saved), f(saved, "cashsale_account"), "");
    expect(mappingProblem(saved, emptied, "cashsale_account", false)).toBe(
      "The Cash Sales account code is still empty. Choose one from the list to save.",
    );
    const fresh = xero({}, false);
    expect(mappingProblems(fresh, mappingDraftOf(fresh), false)).toEqual([]);
    const refused = mappingProblems(fresh, mappingDraftOf(fresh), true);
    expect(refused.map((p) => p.key)).toEqual([...MAPPING_KEYS]);
    expect(refused[0].message).toBe(
      "The Petty Cash Account is still empty. Choose one from the list to save.",
    );
  });
});

describe("a new contact", () => {
  it("is offered for a contact field only, when allowed and no contact has the name", () => {
    const s = xero();
    expect(offersNewContact(f(s, "cashsale_contact"), "Walk-in", true)).toBe(true);
    expect(offersNewContact(f(s, "cashsale_contact"), "  olive   tan ", true)).toBe(false);
    expect(offersNewContact(f(s, "cashsale_contact"), "Walk-in", false)).toBe(false);
    expect(offersNewContact(f(s, "cashsale_contact"), " ", true)).toBe(false);
    expect(offersNewContact(f(s, "cashsale_account"), "Walk-in", true)).toBe(false);
  });

  it("checks the name as typed: empty only after Add, too long and a duplicate at once", () => {
    const c = f(xero(), "owners_contact");
    expect(newContactProblem("", c, false)).toBeNull();
    expect(newContactProblem("", c, true)).toBe(
      "The contact's name is still empty. Add the name to continue.",
    );
    expect(newContactProblem("x".repeat(151), c, false)).toBe(
      "The name is 151 characters. Keep it to 150 characters or fewer.",
    );
    expect(newContactProblem("olive tan", c, false)).toBe(
      "Olive Tan is already a contact. Choose it from the list.",
    );
    expect(newContactProblem("Walk-in", c, false)).toBeNull();
  });

  it("is offered in every contact field, A to Z, and not in the account fields", () => {
    const s = withContact(xero(), { id: "c-new", name: "Andy Lau" });
    for (const key of ["cashsale_contact", "owners_contact", "discrepancy_contact"] as const) {
      expect(f(s, key).options.map((o) => o.name)).toEqual([
        "Andy Lau",
        "Cash Customer",
        "Olive Tan",
      ]);
    }
    expect(f(s, "main_bank").options).toHaveLength(2);
  });
});

describe("the save's toast", () => {
  it("says what the first save unlocks", () => {
    const answer = { ...xero(), message: "Xero account mapping saved.", first_save: true };
    expect(mappingSavedMessage(answer)).toBe(
      "Xero account mapping saved. Daily Reports can be published to Xero now.",
    );
    expect(mappingSavedMessage({ ...answer, first_save: false })).toBe(
      "Xero account mapping saved.",
    );
  });

  it("keeps the read an answer carries, without its sentence", () => {
    const read = xero();
    expect(
      readOf({ ...read, message: "Account codes saved.", first_save: false } as XeroSettings),
    ).toEqual(read);
  });
});

describe("the account codes", () => {
  it("offers only codes that have a code, and reads the picked ones", () => {
    const s = xero();
    expect(codeRows(s).map((c) => c.code)).toEqual(["429", "400"]);
    expect(tickedOf(s)).toEqual(["429"]);
    expect(codeLabel(codeRows(s)[0])).toBe("429 — General Expenses");
  });

  it("searches by code or name", () => {
    const rows = codeRows(xero());
    expect(codeMatches(rows, "adv").map((c) => c.code)).toEqual(["400"]);
    expect(codeMatches(rows, "42").map((c) => c.code)).toEqual(["429"]);
    expect(codeMatches(rows, "")).toHaveLength(2);
  });

  it("ticks one, and all or none of those shown, with Select all's mixed state", () => {
    const rows = codeRows(xero());
    expect(toggleCode(["429"], "400", true)).toEqual(["400", "429"]);
    expect(toggleCode(["400", "429"], "429", false)).toEqual(["400"]);
    expect(shownState(["429"], rows)).toBe("some");
    expect(toggleShown(["429"], rows, true)).toEqual(["400", "429"]);
    expect(shownState(["400", "429"], rows)).toBe("all");
    // only the shown ones change
    expect(toggleShown(["400", "429"], [rows[1]], false)).toEqual(["429"]);
    expect(shownState([], rows)).toBe("none");
  });

  it("keeps at least one picked when there are codes, and knows when the card changed", () => {
    const s = xero();
    expect(codesProblem(s, [])).toBe(NO_CODE);
    expect(codesProblem(s, ["400"])).toBeNull();
    expect(codesProblem(xero({ account_codes: [] }), [])).toBeNull();
    expect(codesDirty(s, ["429"])).toBe(false);
    expect(codesDirty(s, ["400", "429"])).toBe(true);
  });
});
