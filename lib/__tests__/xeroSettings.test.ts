import { describe, expect, it } from "vitest";

import {
  CODES_NONE,
  MAPPING_GROUPS,
  MAPPING_KEYS,
  SAME_BANK,
  accountOptions,
  codeLabel,
  codesBody,
  codesChanged,
  codesProblem,
  contactOptions,
  fieldsNamed,
  mappingBody,
  mappingChanged,
  mappingProblems,
  optionLabel,
  selectAllState,
  selectionOf,
  shownCodes,
  withContact,
  type AccountCode,
  type MappingField,
} from "@/lib/xeroSettings";

const LABELS: Record<string, string> = {
  main_bank: "Petty Cash Account",
  deposit_bank: "Deposit Bank Account",
  cashsale_account: "Cash Sales account code",
  cashsale_contact: "Cash Sales contact",
  owners_account: "Director Personal Account code",
  owners_contact: "Director / Responsible person",
  discrepancy_account: "Discrepancy account code",
  discrepancy_contact: "Discrepancy contact",
};

const BANKS = [
  { id: "b1", name: "Petty Cash", code: "090" },
  { id: "b2", name: "HSBC Current", code: "" },
];
const SALES = [
  { id: "a1", name: "Sales", code: "200" },
  { id: "a2", name: "Other Revenue", code: "260" },
];
const CONTACTS = [
  { id: "c1", name: "Walk-in Customer" },
  { id: "c2", name: "Tess Tester" },
];

const mapping = (selected: Partial<Record<string, string>> = {}): MappingField[] =>
  MAPPING_KEYS.map((key) => ({
    key,
    label: LABELS[key],
    kind: key.endsWith("contact") ? "contact" : "account",
    options: key.endsWith("bank") ? BANKS : key.endsWith("contact") ? CONTACTS : SALES,
    selected: selected[key] ?? null,
  }));

describe("the mapping card's layout", () => {
  it("draws Flask's groups in order, every chosen key once, without the Discrepancy Bank Account", () => {
    expect(MAPPING_GROUPS.map((g) => g.title)).toEqual(["Petty Cash Account", "Deposit Bank Account", "Cash Sales", "Director Personal Account", "Discrepancy - Other Expense"]);
    expect(MAPPING_GROUPS.flatMap((g) => g.fields.map((f) => f.key))).toEqual([...MAPPING_KEYS]);
  });
});

describe("a picker's rows", () => {
  it("labels an account Name - Code, or the name alone", () => {
    expect(optionLabel({ id: "a1", name: "Sales", code: "200" })).toBe("Sales - 200");
    expect(optionLabel({ id: "b2", name: "HSBC Current", code: "" })).toBe("HSBC Current");
    expect(optionLabel({ id: "c1", name: "Walk-in Customer" })).toBe("Walk-in Customer");
  });

  it("filters accounts by name or code, any case; the current choice shown lists everything", () => {
    const field = mapping()[2];
    const picked = selectionOf(mapping());
    expect(accountOptions(field, "", "", picked)).toEqual(SALES);
    expect(accountOptions(field, "REV", "", picked).map((o) => o.id)).toEqual(["a2"]);
    expect(accountOptions(field, "200", "", picked).map((o) => o.id)).toEqual(["a1"]);
    expect(accountOptions(field, "Sales - 200", "Sales - 200", picked)).toEqual(SALES);
  });

  it("never offers the bank already chosen for the other bank field", () => {
    const fields = mapping();
    const picked = { ...selectionOf(fields), deposit_bank: "b2" };
    expect(accountOptions(fields[0], "", "", picked).map((o) => o.id)).toEqual(["b1"]);
    expect(accountOptions(fields[1], "", "", { ...picked, main_bank: "b1" }).map((o) => o.id)).toEqual(["b2"]);
  });

  it("offers a typed contact as new unless one has exactly that name", () => {
    const field = mapping()[3];
    expect(contactOptions(field, "", "")).toEqual({ matches: CONTACTS, offerNew: null });
    expect(contactOptions(field, "tess", "")).toEqual({ matches: [CONTACTS[1]], offerNew: "tess" });
    expect(contactOptions(field, "TESS TESTER", "")).toEqual({ matches: [CONTACTS[1]], offerNew: null });
    expect(contactOptions(field, "Zed", "")).toEqual({ matches: [], offerNew: "Zed" });
    // the box still shows the choice: everything, nothing new
    expect(contactOptions(field, "Tess Tester", "Tess Tester")).toEqual({ matches: CONTACTS, offerNew: null });
    // no contacts at all: Flask's bare "+ Add as a new contact"
    expect(contactOptions({ ...field, options: [] }, "", "")).toEqual({ matches: [], offerNew: "" });
  });
});

describe("the mapping's rules", () => {
  it("starts from the saved choices and knows when something changed", () => {
    const fields = mapping({ main_bank: "b1", cashsale_contact: "c1" });
    const picked = selectionOf(fields);
    expect(picked.main_bank).toBe("b1");
    expect(picked.deposit_bank).toBe("");
    expect(mappingChanged(fields, picked)).toBe(false);
    expect(mappingChanged(fields, { ...picked, deposit_bank: "b2" })).toBe(true);
  });

  it("says an empty field only after a refused save, and the two banks being one at once", () => {
    const fields = mapping();
    const picked = { ...selectionOf(fields), main_bank: "b1", deposit_bank: "b1" };
    expect(mappingProblems(fields, picked, false)).toEqual({ main_bank: SAME_BANK, deposit_bank: SAME_BANK });
    const refused = mappingProblems(fields, { ...picked, deposit_bank: "b2" }, true);
    expect(refused.main_bank).toBeUndefined();
    expect(refused.cashsale_account).toBe("Choose the Cash Sales account code.");
    expect(refused.owners_contact).toBe("Choose the Director / Responsible person.");
    expect(Object.keys(refused)).toHaveLength(6);
  });

  it("finds the fields an API sentence names", () => {
    const fields = mapping();
    expect(fieldsNamed(SAME_BANK, fields)).toEqual(["main_bank", "deposit_bank"]);
    expect(fieldsNamed("Choose the Cash Sales contact from the list. Choose the Discrepancy account code from the list.", fields)).toEqual(["cashsale_contact", "discrepancy_account"]);
    expect(fieldsNamed("Choose the Director Personal Account code.", fields)).toEqual(["owners_account"]);
    expect(fieldsNamed("Something went wrong.", fields)).toEqual([]);
  });

  it("sends the eight keys, nothing else", () => {
    const picked = { ...selectionOf(mapping()), main_bank: "b1" };
    expect(Object.keys(mappingBody({ ...picked, extra: "x" } as typeof picked))).toEqual([...MAPPING_KEYS]);
    expect(mappingBody(picked).main_bank).toBe("b1");
  });

  it("puts a new contact in every contact list, once", () => {
    const next = withContact(mapping(), { id: "c9", name: "New Person" });
    expect(next.filter((f) => f.kind === "contact").every((f) => f.options.at(-1)?.id === "c9")).toBe(true);
    expect(next.filter((f) => f.kind === "account").every((f) => !f.options.some((o) => o.id === "c9"))).toBe(true);
    expect(withContact(next, { id: "c9", name: "New Person" })[3].options).toHaveLength(3);
  });
});

describe("the account codes", () => {
  const CODES: AccountCode[] = [
    { code: "400", name: "Advertising", selected: true },
    { code: "404", name: "Bank Fees", selected: false },
    { code: "", name: "No code", selected: false },
    { code: "429", name: "", selected: false },
  ];

  it("labels and filters Flask's way, leaving out a row without a code", () => {
    expect(codeLabel(CODES[0])).toBe("400 - Advertising");
    expect(codeLabel(CODES[3])).toBe("429");
    expect(shownCodes(CODES, "").map((r) => r.code)).toEqual(["400", "404", "429"]);
    expect(shownCodes(CODES, "bank").map((r) => r.code)).toEqual(["404"]);
    expect(shownCodes(CODES, "40").map((r) => r.code)).toEqual(["400", "404"]);
  });

  it("Select all reads all, some or none of the rows shown", () => {
    const rows = shownCodes(CODES, "");
    expect(selectAllState(rows, new Set(["400", "404", "429"]))).toBe("all");
    expect(selectAllState(rows, new Set(["400"]))).toBe("some");
    expect(selectAllState(rows, new Set())).toBe("none");
    expect(selectAllState([], new Set())).toBe("none");
  });

  it("keeps at least one ticked, unless there are no codes at all", () => {
    expect(codesProblem(CODES, new Set())).toBe(CODES_NONE);
    expect(codesProblem(CODES, new Set(["404"]))).toBeNull();
    expect(codesProblem([], new Set())).toBeNull();
  });

  it("knows when the ticks changed, and sends them sorted", () => {
    expect(codesChanged(CODES, new Set(["400"]))).toBe(false);
    expect(codesChanged(CODES, new Set(["400", "404"]))).toBe(true);
    expect(codesBody(new Set(["429", "400"]))).toEqual({ codes: ["400", "429"] });
  });
});
