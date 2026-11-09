import { describe, expect, it } from "vitest";

import {
  ADD_NAME_MAX,
  NAME_EMPTY,
  RENAME_NAME_MAX,
  catalogueOptions,
  methodNameProblem,
  movedIds,
  settingsHref,
  settingsTabUrl,
  sharedRenameMessage,
  viewOnly,
  type SettingsPermissions,
} from "@/lib/settings";

const ENTITY = "360812e1-9f94-46a3-aa31-347e21afde8e";

const NONE: SettingsPermissions = {
  edit_xero: false,
  view_sales_methods: true,
  add_sales_method: false,
  rename_sales_method: false,
  remove_sales_method: false,
  reorder_sales_methods: false,
};

describe("the page's address", () => {
  it("is Flask's own: /entity/<shortid>/<name>/settings/petty-cash", () => {
    expect(settingsHref(ENTITY, "Olive & Vine")).toBe(
      "/entity/360812e1/olive-and-vine/settings/petty-cash",
    );
  });
});

describe("the other settings tabs - never a Flask page", () => {
  it.each(["users", "integration", "modules"] as const)(
    "%s is minty-web's page, through Flask's /handoff/minty-web",
    (tab) => {
      const url = new URL(settingsTabUrl(ENTITY, "Olive & Vine", tab));
      expect(url.origin + url.pathname).toBe("http://localhost:8002/handoff/minty-web");
      expect(url.searchParams.get("next")).toBe(`/entity/360812e1/olive-and-vine/settings/${tab}`);
      expect(url.searchParams.get("entity_id")).toBe(ENTITY);
    },
  );

  it("Payment Request Settings is the payments app's page, through Flask's hand-off that mints its token", () => {
    expect(new URL(settingsTabUrl(ENTITY, "Olive & Vine", "payment-request")).pathname).toBe(
      `/entity/${ENTITY}/settings/payment-request`,
    );
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
    expect(methodNameProblem("", listed, ADD_NAME_MAX)).toBeNull();
    expect(methodNameProblem("   ", listed, ADD_NAME_MAX)).toBeNull();
    expect(NAME_EMPTY).toBe("The method's name is still empty. Type a name to add it.");
  });

  it("names the API's limits: 74 to add (room for _sales), 80 to rename", () => {
    expect(ADD_NAME_MAX).toBe(74);
    expect(RENAME_NAME_MAX).toBe(80);
    expect(methodNameProblem("x".repeat(74), listed, ADD_NAME_MAX)).toBeNull();
    expect(methodNameProblem("x".repeat(75), listed, ADD_NAME_MAX)).toBe(
      "That name is too long. Keep it to 74 characters or fewer.",
    );
    expect(methodNameProblem("x".repeat(80), listed, RENAME_NAME_MAX, "a")).toBeNull();
    expect(methodNameProblem("x".repeat(81), listed, RENAME_NAME_MAX, "a")).toBe(
      "That name is too long. Keep it to 80 characters or fewer.",
    );
  });

  it("refuses a name already on the list, in any case, as the API does", () => {
    expect(methodNameProblem(" visa ", listed, ADD_NAME_MAX)).toBe("visa is already on the list.");
  });

  it("lets a rename keep its own name", () => {
    expect(methodNameProblem("VISA", listed, RENAME_NAME_MAX, "a")).toBeNull();
    expect(methodNameProblem("Octopus", listed, RENAME_NAME_MAX, "a")).toBe(
      "Octopus is already on the list.",
    );
  });
});

describe("a shared method's rename", () => {
  it("says at once why it can't be renamed, and what to do instead", () => {
    expect(sharedRenameMessage("Visa")).toBe(
      "Other companies use Visa too, so it can't be renamed here. Delete it and add a new method instead.",
    );
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
    expect(viewOnly({ ...NONE, edit_xero: true })).toBe(false);
  });
});
