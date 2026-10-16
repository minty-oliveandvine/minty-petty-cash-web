import { describe, expect, it } from "vitest";

import { ApiError } from "@/lib/apiClient";
import { settingsHref } from "@/lib/companyPages";
import {
  addMethod,
  catalogueOptions,
  chooseCountry,
  countryBody,
  countryChoiceOf,
  draftOf,
  isPending,
  moveMethod,
  movedText,
  nameProblem,
  pendingOps,
  removeMethod,
  renameMethod,
  saveMethods,
  type MethodCall,
  type Settings,
  type SettingsAnswer,
} from "@/lib/settings";

const m = (id: string, name: string, shared = false) => ({ id, name, value_name: `${name.toLowerCase()}_sales`, shared });

function settings(over: Partial<Settings> = {}): Settings {
  return {
    country: {
      country_code: "HK",
      currency_id: "cur-hkd",
      countries: [{ code: "HK", name: "Hong Kong" }, { code: "SG", name: "Singapore" }],
      currencies: [{ id: "cur-hkd", name: "HKD" }, { id: "cur-sgd", name: "SGD" }],
      selected_country: "Hong Kong",
      selected_currency: "HKD",
    },
    sales_methods: { electronic: [m("e1", "Visa"), m("e2", "Octopus"), m("e3", "AlipayHK")], delivery: [m("d1", "Foodpanda")] },
    available: { electronic: [{ id: "c-wechat", name: "WeChat Pay" }, { id: "c-amex", name: "AMEX" }], delivery: [{ id: "c-keeta", name: "Keeta" }] },
    xero_connected: false,
    permissions: {
      edit_country: true,
      view_sales_methods: true,
      add_sales_method: true,
      rename_sales_method: true,
      remove_sales_method: true,
      reorder_sales_methods: true,
    },
    ...over,
  };
}

const names = (draft: ReturnType<typeof draftOf>, type: "electronic" | "delivery") => draft.lists[type].map((r) => r.name);

describe("settingsHref", () => {
  it("is Flask's address for the page, in the company's readable form", () => {
    expect(settingsHref("360812e1-9f94-46a3-aa31-347e21afde8e", "Olive & Vine")).toBe("/entity/360812e1/olive-and-vine/settings/petty-cash");
  });
});

describe("country and currency", () => {
  it("sends only what changed, and nothing when nothing did", () => {
    const s = settings();
    expect(countryBody(s, countryChoiceOf(s))).toBeNull();
    expect(countryBody(s, { country: "HK", currency: "cur-sgd" })).toEqual({ currency_id: "cur-sgd" });
    expect(countryBody(s, { country: "SG", currency: "cur-sgd" })).toEqual({ country_code: "SG", currency_id: "cur-sgd" });
  });

  it("lets a country alone bring its currency, and puts the saved pair back for the saved country", () => {
    const s = settings();
    const sg = chooseCountry(s, "SG");
    expect(sg).toEqual({ country: "SG", currency: "" });
    expect(countryBody(s, sg)).toEqual({ country_code: "SG" });
    expect(chooseCountry(s, "HK")).toEqual({ country: "HK", currency: "cur-hkd" });
  });

  it("starts empty for a company with neither", () => {
    const s = settings({ country: { ...settings().country, country_code: null, currency_id: null } });
    expect(countryChoiceOf(s)).toEqual({ country: "", currency: "" });
    expect(countryBody(s, { country: "", currency: "" })).toBeNull();
  });
});

describe("the sales-method list on the page", () => {
  it("adds a catalogue method under its own spelling, and a new name as typed", () => {
    const s = settings();
    let d = addMethod(draftOf(s), "electronic", "wechat pay", s.available.electronic);
    d = addMethod(d, "electronic", "  Tap & Go ", s.available.electronic);
    const added = d.lists.electronic.slice(3);
    expect(added.map((r) => [r.name, r.id, r.catalogueId])).toEqual([
      ["WeChat Pay", null, "c-wechat"],
      ["Tap & Go", null, null],
    ]);
    expect(added.every(isPending)).toBe(true);
  });

  it("renames, removes and moves; a removed method added back is the same one", () => {
    const s = settings();
    let d = renameMethod(draftOf(s), "electronic", "e2", "Octopus Card", s.available.electronic);
    expect(isPending(d.lists.electronic[1])).toBe(true);
    d = removeMethod(d, "electronic", "e1");
    expect(names(d, "electronic")).toEqual(["Octopus Card", "AlipayHK"]);
    expect(d.removed).toEqual([{ id: "e1", name: "Visa", type: "electronic", shared: false }]);
    d = moveMethod(d, "electronic", "e3", -1);
    expect(names(d, "electronic")).toEqual(["AlipayHK", "Octopus Card"]);
    expect(movedText(d, "electronic", "e3")).toBe("AlipayHK moved to 1 of 2.");
    expect(moveMethod(d, "electronic", "e3", -1)).toBe(d);
    d = addMethod(d, "electronic", "VISA", s.available.electronic);
    expect(d.removed).toEqual([]);
    expect(d.lists.electronic[2]).toMatchObject({ id: "e1", name: "Visa", savedName: "Visa" });
  });

  it("drops an addition that is removed before Save, and lets it pick the catalogue again when renamed", () => {
    const s = settings();
    let d = addMethod(draftOf(s), "delivery", "Deliveroo", s.available.delivery);
    const key = d.lists.delivery[1].key;
    d = renameMethod(d, "delivery", key, "keeta", s.available.delivery);
    expect(d.lists.delivery[1]).toMatchObject({ name: "Keeta", catalogueId: "c-keeta" });
    d = removeMethod(d, "delivery", key);
    expect(d.removed).toEqual([]);
    expect(pendingOps(d, s)).toEqual([]);
  });

  it("offers catalogue methods not on the list, removed ones included, narrowed as typed, A to Z", () => {
    const s = settings();
    let d = removeMethod(draftOf(s), "electronic", "e2");
    expect(catalogueOptions(d, "electronic", s.available.electronic, "").map((o) => o.name)).toEqual(["AMEX", "Octopus", "WeChat Pay"]);
    expect(catalogueOptions(d, "electronic", s.available.electronic, " pay").map((o) => o.name)).toEqual(["WeChat Pay"]);
    d = addMethod(d, "electronic", "AMEX", s.available.electronic);
    expect(catalogueOptions(d, "electronic", s.available.electronic, "").map((o) => o.name)).toEqual(["Octopus", "WeChat Pay"]);
  });
});

describe("nameProblem, as typed", () => {
  const s = settings();
  const draft = draftOf(s);

  it("says an empty name only after a refused Add or Rename", () => {
    expect(nameProblem("  ", { draft, type: "electronic", purpose: "add", attempted: false })).toBeNull();
    expect(nameProblem("", { draft, type: "electronic", purpose: "add", attempted: true })).toBe(
      "The method's name is still empty. Choose a method or type a new name to add it.",
    );
    expect(nameProblem("", { draft, type: "electronic", purpose: "rename", attempted: true })).toBe(
      "The method's name is still empty. Type its new name to save it.",
    );
  });

  it("says a name over 100 characters at once, naming the limit", () => {
    expect(nameProblem("x".repeat(100), { draft, type: "electronic", purpose: "add", attempted: false })).toBeNull();
    expect(nameProblem("x".repeat(101), { draft, type: "electronic", purpose: "add", attempted: false })).toBe(
      "The name is 101 characters. Shorten it to 100 characters or fewer.",
    );
  });

  it("says at once that a method other companies use can't take a new name, and lets its own name stand", () => {
    const s = settings({ sales_methods: { electronic: [m("e1", "Visa", true), m("e2", "Octopus")], delivery: [] } });
    const d = draftOf(s);
    const shared = "Other companies use Visa too, so it can't be renamed here. Remove it and add a new method instead.";
    expect(nameProblem("Visa", { draft: d, type: "electronic", purpose: "rename", attempted: true, except: "e1" })).toBeNull();
    expect(nameProblem("Visa Card", { draft: d, type: "electronic", purpose: "rename", attempted: false, except: "e1" })).toBe(shared);
    expect(nameProblem("VISA", { draft: d, type: "electronic", purpose: "rename", attempted: false, except: "e1" })).toBe(shared);
    expect(nameProblem("Octopus Card", { draft: d, type: "electronic", purpose: "rename", attempted: false, except: "e2" })).toBeNull();
    // Removed and added back, it is still the shared one.
    const back = addMethod(removeMethod(d, "electronic", "e1"), "electronic", "visa", s.available.electronic);
    expect(back.lists.electronic[1]).toMatchObject({ id: "e1", shared: true });
  });

  it("says a name already on that list at once (any case), but not the row's own", () => {
    expect(nameProblem("visa ", { draft, type: "electronic", purpose: "add", attempted: false })).toBe("visa is already on the list. Type another name.");
    expect(nameProblem("Visa", { draft, type: "delivery", purpose: "add", attempted: false })).toBeNull();
    expect(nameProblem("VISA", { draft, type: "electronic", purpose: "rename", attempted: false, except: "e1" })).toBeNull();
  });
});

describe("pendingOps", () => {
  it("is nothing for the list as loaded", () => {
    const s = settings();
    expect(pendingOps(draftOf(s), s)).toEqual([]);
  });

  it("lists removals, additions, renames, then a changed order", () => {
    const s = settings();
    let d = removeMethod(draftOf(s), "electronic", "e1");
    d = addMethod(d, "delivery", "Keeta", s.available.delivery);
    d = renameMethod(d, "electronic", "e2", "Octopus Card", s.available.electronic);
    d = moveMethod(d, "electronic", "e3", -1);
    expect(pendingOps(d, s).map((op) => op.kind + ":" + op.type)).toEqual(["remove:electronic", "add:delivery", "rename:electronic", "order:electronic"]);
  });

  it("needs no order for an addition left at the end", () => {
    const s = settings();
    const d = addMethod(draftOf(s), "electronic", "AMEX", s.available.electronic);
    expect(pendingOps(d, s).map((op) => op.kind)).toEqual(["add"]);
    expect(pendingOps(moveMethod(d, "electronic", d.lists.electronic[3].key, -1), s).map((op) => op.kind)).toEqual(["add", "order"]);
  });
});

/** A fake API over a settings read: applies each call the way Flask does, or refuses where told. */
function fakeApi(start: Settings, refuse: (path: string, init: { method: string; json?: unknown }) => ApiError | null = () => null) {
  let state = structuredClone(start);
  const calls: { method: string; path: string; json?: unknown }[] = [];
  let next = 0;
  const call: MethodCall = async (path, init) => {
    calls.push({ method: init.method, path, json: init.json });
    const no = refuse(path, init);
    if (no) throw no;
    const body = (init.json ?? {}) as { type?: "electronic" | "delivery"; name?: string; sale_info_id?: string; method_ids?: string[] };
    let message = "";
    if (init.method === "DELETE") {
      const id = path.split("/").pop();
      for (const t of ["electronic", "delivery"] as const) state.sales_methods[t] = state.sales_methods[t].filter((x) => x.id !== id);
      message = "Method removed. Reports that used it keep their amounts.";
    } else if (init.method === "POST") {
      const t = body.type!;
      const name = body.sale_info_id ? state.available[t].find((a) => a.id === body.sale_info_id)!.name : body.name!;
      next += 1;
      state.sales_methods[t].push(m(`new${next}`, name));
      message = `${name} added.`;
    } else if (path === "/sales-methods/order") {
      const t = body.type!;
      state.sales_methods[t] = body.method_ids!.map((id) => state.sales_methods[t].find((x) => x.id === id)!);
      message = "Order saved.";
    } else {
      const id = path.split("/").pop();
      for (const t of ["electronic", "delivery"] as const) state.sales_methods[t] = state.sales_methods[t].map((x) => (x.id === id ? { ...x, name: body.name! } : x));
      message = "Name saved.";
    }
    state = structuredClone(state);
    return { ...state, message } as SettingsAnswer;
  };
  return { call, calls };
}

describe("saveMethods", () => {
  it("sends one change and confirms with the API's own sentence", async () => {
    const s = settings();
    const api = fakeApi(s);
    const out = await saveMethods(addMethod(draftOf(s), "electronic", "WeChat Pay", s.available.electronic), s, api.call);
    expect(api.calls).toEqual([{ method: "POST", path: "/sales-methods", json: { type: "electronic", sale_info_id: "c-wechat" } }]);
    expect(out.failure).toBeNull();
    expect(out.message).toBe("WeChat Pay added.");
    expect(names(out.draft, "electronic")).toEqual(["Visa", "Octopus", "AlipayHK", "WeChat Pay"]);
    expect(pendingOps(out.draft, out.settings)).toEqual([]);
  });

  it("sends every change in order, placing an addition where the page put it", async () => {
    const s = settings();
    let d = removeMethod(draftOf(s), "electronic", "e1");
    d = addMethod(d, "electronic", "Tap & Go", s.available.electronic);
    d = moveMethod(d, "electronic", d.lists.electronic[2].key, -1);
    d = renameMethod(d, "delivery", "d1", "foodpanda HK", s.available.delivery);
    const api = fakeApi(s);
    const out = await saveMethods(d, s, api.call);
    expect(api.calls).toEqual([
      { method: "DELETE", path: "/sales-methods/e1", json: undefined },
      { method: "POST", path: "/sales-methods", json: { type: "electronic", name: "Tap & Go" } },
      { method: "PUT", path: "/sales-methods/d1", json: { name: "foodpanda HK" } },
      { method: "PUT", path: "/sales-methods/order", json: { type: "electronic", method_ids: ["e2", "new1", "e3"] } },
    ]);
    expect(out.message).toBe("Sales methods saved.");
    expect(names(out.draft, "electronic")).toEqual(["Octopus", "Tap & Go", "AlipayHK"]);
    expect(names(out.draft, "delivery")).toEqual(["foodpanda HK"]);
  });

  it("stops at the first refusal, keeps what went through and leaves the rest waiting", async () => {
    const s = settings();
    let d = removeMethod(draftOf(s), "delivery", "d1");
    d = renameMethod(d, "electronic", "e2", "Octopus Card", s.available.electronic);
    d = moveMethod(d, "electronic", "e3", -1);
    const shared = new ApiError(409, "Octopus is used by other companies, so it can't be renamed here. Add a new method instead.");
    const api = fakeApi(s, (path, init) => (init.method === "PUT" && path === "/sales-methods/e2" ? shared : null));
    const out = await saveMethods(d, s, api.call);
    expect(api.calls.map((c) => `${c.method} ${c.path}`)).toEqual(["DELETE /sales-methods/d1", "PUT /sales-methods/e2"]);
    expect(out.message).toBeNull();
    expect(out.failure).toEqual({ what: "Octopus wasn't renamed", error: shared });
    expect(out.sent).toBe(1);
    expect(out.settings.sales_methods.delivery).toEqual([]);
    expect(out.draft.removed).toEqual([]);
    expect(pendingOps(out.draft, out.settings).map((op) => op.kind)).toEqual(["rename", "order"]);
  });

  it("names a refused addition and a refused order", async () => {
    const s = settings();
    const dup = new ApiError(409, "AMEX is already on the list.");
    const api = fakeApi(s, (_path, init) => (init.method === "POST" ? dup : null));
    const added = await saveMethods(addMethod(draftOf(s), "electronic", "AMEX", s.available.electronic), s, api.call);
    expect(added.failure?.what).toBe("AMEX wasn't added");
    expect(added.draft.lists.electronic[3]).toMatchObject({ name: "AMEX", id: null });

    const stale = new ApiError(409, "The list changed since it was loaded. Reload the page and order it again.");
    const api2 = fakeApi(s, (path) => (path === "/sales-methods/order" ? stale : null));
    const moved = await saveMethods(moveMethod(draftOf(s), "electronic", "e2", 1), s, api2.call);
    expect(moved.failure).toEqual({ what: "The Electronic order wasn't saved", error: stale });
  });

  it("never reorders for someone who may not", async () => {
    const s = settings({ permissions: { ...settings().permissions, reorder_sales_methods: false } });
    const api = fakeApi(s);
    const d = addMethod(draftOf(s), "electronic", "AMEX", s.available.electronic);
    const out = await saveMethods(moveMethod(d, "electronic", d.lists.electronic[3].key, -1), s, api.call);
    expect(api.calls.map((c) => c.method)).toEqual(["POST"]);
    expect(names(out.draft, "electronic")).toEqual(["Visa", "Octopus", "AlipayHK", "AMEX"]);
  });
});
