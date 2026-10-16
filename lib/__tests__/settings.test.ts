import { describe, expect, it } from "vitest";

import {
  NAME_EMPTY,
  catalogueOptions,
  countryChange,
  methodNameProblem,
  movedIds,
  registryOptions,
  settingsHref,
  sharedRenameMessage,
  viewOnly,
  type SettingsPermissions,
  type SettingsRead,
} from "@/lib/settings";

const ENTITY = "360812e1-9f94-46a3-aa31-347e21afde8e";

const NONE: SettingsPermissions = {
  edit_country: false,
  view_sales_methods: true,
  add_sales_method: false,
  rename_sales_method: false,
  remove_sales_method: false,
  reorder_sales_methods: false,
};

const read = (over: Partial<SettingsRead["country"]> = {}): SettingsRead => ({
  country: {
    country_code: "HK",
    currency_id: "c-hkd",
    countries: [
      { code: "HK", name: "Hong Kong" },
      { code: "SG", name: "Singapore" },
    ],
    currencies: [
      { id: "c-hkd", name: "HKD" },
      { id: "c-sgd", name: "SGD" },
    ],
    selected_country: "Hong Kong",
    selected_currency: "HKD",
    ...over,
  },
  sales_methods: { electronic: [], delivery: [] },
  available: { electronic: [], delivery: [] },
  xero_connected: false,
  permissions: NONE,
});

describe("the page's address", () => {
  it("is Flask's own: /entity/<shortid>/<name>/settings/petty-cash", () => {
    expect(settingsHref(ENTITY, "Olive & Vine")).toBe("/entity/360812e1/olive-and-vine/settings/petty-cash");
  });
});

describe("the country and currency pickers (Flask's wireRegistryPicker)", () => {
  const rows = [
    { value: "HK", label: "Hong Kong" },
    { value: "SG", label: "Singapore" },
    { value: "GB", label: "United Kingdom" },
  ];

  it("lists everything when empty, or when the box still shows the current choice", () => {
    expect(registryOptions(rows, "", "Hong Kong")).toEqual(rows);
    expect(registryOptions(rows, "hong kong", "Hong Kong")).toEqual(rows);
  });

  it("filters by any part of the name, in any case", () => {
    expect(registryOptions(rows, "king", "Hong Kong").map((r) => r.value)).toEqual(["GB"]);
    expect(registryOptions(rows, "ON", "")).toEqual([rows[0]]);
  });

  it("gives nothing for a name that matches none", () => {
    expect(registryOptions(rows, "zz", "Hong Kong")).toEqual([]);
  });
});

describe("what the country Save sends", () => {
  it("nothing when nothing changed", () => {
    expect(countryChange(read(), { country_code: "HK", currency_id: "c-hkd" })).toBeNull();
  });

  it("a country alone, so it brings its own currency", () => {
    expect(countryChange(read(), { country_code: "SG", currency_id: "c-hkd" })).toEqual({ country_code: "SG" });
  });

  it("a currency picked by hand, with the country when that changed too", () => {
    expect(countryChange(read(), { country_code: "HK", currency_id: "c-sgd" })).toEqual({ currency_id: "c-sgd" });
    expect(countryChange(read(), { country_code: "SG", currency_id: "c-sgd" })).toEqual({ country_code: "SG", currency_id: "c-sgd" });
  });

  it("a first choice for a company that has none", () => {
    expect(countryChange(read({ country_code: null, currency_id: null }), { country_code: "SG", currency_id: "" })).toEqual({ country_code: "SG" });
  });
});

describe("the catalogue picker (Flask's method catalogue)", () => {
  const available = [
    { id: "1", name: "Octopus" },
    { id: "2", name: "AlipayHK" },
    { id: "3", name: "PayMe" },
  ];

  it("offers every method not on the list, filtered by any part of the name", () => {
    expect(catalogueOptions(available, "").map((m) => m.id)).toEqual(["1", "2", "3"]);
    expect(catalogueOptions(available, "pay").map((m) => m.id)).toEqual(["2", "3"]);
    expect(catalogueOptions(available, "zz")).toEqual([]);
  });
});

describe("a method's name, checked as it is typed", () => {
  const listed = [
    { id: "a", name: "Visa", value_name: "visa_sales", shared: false },
    { id: "b", name: "Octopus", value_name: "octopus_sales", shared: true },
  ];

  it("says nothing while it is empty: that only means it is not finished", () => {
    expect(methodNameProblem("", listed)).toBeNull();
    expect(methodNameProblem("   ", listed)).toBeNull();
    expect(NAME_EMPTY).toBe("The method's name is still empty. Type a name to add it.");
  });

  it("names the limit past 100 characters", () => {
    expect(methodNameProblem("x".repeat(100), listed)).toBeNull();
    expect(methodNameProblem("x".repeat(101), listed)).toBe("That name is too long. Keep it to 100 characters or fewer.");
  });

  it("refuses a name already on the list, in any case, as the API does", () => {
    expect(methodNameProblem(" visa ", listed)).toBe("visa is already on the list.");
  });

  it("lets a rename keep its own name", () => {
    expect(methodNameProblem("VISA", listed, "a")).toBeNull();
    expect(methodNameProblem("Octopus", listed, "a")).toBe("Octopus is already on the list.");
  });
});

describe("a shared method's rename", () => {
  it("says at once why it can't be renamed, and what to do instead", () => {
    expect(sharedRenameMessage("Visa")).toBe("Other companies use Visa too, so it can't be renamed here. Delete it and add a new method instead.");
  });
});

describe("Move up and Move down", () => {
  it("moves one place and gives the type's full list in its new order", () => {
    expect(movedIds(["a", "b", "c"], 1, -1)).toEqual(["b", "a", "c"]);
    expect(movedIds(["a", "b", "c"], 1, 1)).toEqual(["a", "c", "b"]);
  });

  it("goes nowhere past either end", () => {
    expect(movedIds(["a", "b"], 0, -1)).toBeNull();
    expect(movedIds(["a", "b"], 1, 1)).toBeNull();
  });
});

describe("view-only", () => {
  it("is a person who may change nothing on the page (a cashier)", () => {
    expect(viewOnly(NONE)).toBe(true);
    expect(viewOnly({ ...NONE, reorder_sales_methods: true })).toBe(false);
    expect(viewOnly({ ...NONE, edit_country: true })).toBe(false);
  });
});
