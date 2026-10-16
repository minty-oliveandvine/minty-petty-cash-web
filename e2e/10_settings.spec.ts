// Petty Cash settings (components/settings/PettyCashSettings.tsx, Part 15.20 / 15.20b), against a
// STUBBED Petty Cash API that applies each change the way Flask's does. Needs only `npm run dev`.
// Flask's own settings page (the Xero parts) is caught, so nothing leaves the app. Refusals are
// inline alerts, never toasts; a save that went through is a toast.

import { expect, test, type Page, type Request, type Route } from "@playwright/test";

import { companyRef } from "./companyRef";
import { expectNoHorizontalScroll, mintModuleToken } from "./helpers";

const ENTITY = "3d65f186-5ba1-4bf7-a1b0-cc64a113eb5c";
const NAME = "E2E Petty Cash Shop";
const HOME = `/entity/${companyRef(ENTITY, NAME)}/petty-cash`;
const SETTINGS = `/entity/${companyRef(ENTITY, NAME)}/settings/petty-cash`;
const exact = (url: string) => new RegExp(`${url.replace(/[?.]/g, "\\$&")}$`);

type Json = Record<string, unknown>;
type Method = { id: string; name: string; value_name: string; shared: boolean };
type Kind = "electronic" | "delivery";
type State = {
  country: Json & { country_code: string | null; currency_id: string | null };
  sales_methods: Record<Kind, Method[]>;
  available: Record<Kind, { id: string; name: string }[]>;
  xero_connected: boolean;
  permissions: Record<string, boolean>;
};

const m = (id: string, name: string, shared = false): Method => ({ id, name, value_name: `${name.toLowerCase()}_sales`, shared });

const ALL = {
  edit_country: true,
  view_sales_methods: true,
  add_sales_method: true,
  rename_sales_method: true,
  remove_sales_method: true,
  reorder_sales_methods: true,
};
const CASHIER = { ...ALL, edit_country: false, add_sales_method: false, rename_sales_method: false, remove_sales_method: false, reorder_sales_methods: false };

function settings(over: Partial<State> = {}): State {
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
    permissions: ALL,
    ...over,
  };
}

type Call = { method: string; path: string; body: Json | null };
/** Refuse a call: return [status, sentence], or null to let it through. */
type Refuse = (call: Call) => [number, string] | null;

/** The settings routes over one state, applied as Flask does; every call is recorded. */
async function stub(page: Page, start: State, refuse: Refuse = () => null): Promise<Call[]> {
  const state: State = structuredClone(start);
  const calls: Call[] = [];
  let next = 0;
  const answer = (route: Route, message: string, status = 200) => route.fulfill({ status, json: { ...structuredClone(state), message } });

  await page.route(/\/api\/petty-cash\/v1\/companies\/[^/]+\/(settings|sales-methods)(\/.*)?$/, async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname.replace(/^.*\/companies\/[^/]+/, "");
    if (req.method() === "GET" && path === "/settings") return route.fulfill({ json: structuredClone(state) });
    const call: Call = { method: req.method(), path, body: req.postDataJSON() ?? null };
    calls.push(call);
    const no = refuse(call);
    if (no) return route.fulfill({ status: no[0], json: { error: no[1] } });
    const body = (call.body ?? {}) as { type?: Kind; name?: string; sale_info_id?: string; method_ids?: string[]; country_code?: string; currency_id?: string };
    if (path === "/settings/country") {
      if (body.country_code) state.country = { ...state.country, country_code: body.country_code, currency_id: body.currency_id ?? "cur-sgd", selected_country: "Singapore", selected_currency: "SGD" };
      return answer(route, "Country and currency saved.");
    }
    if (path === "/sales-methods" && call.method === "POST") {
      const t = body.type!;
      const name = body.sale_info_id ? state.available[t].find((a) => a.id === body.sale_info_id)!.name : body.name!;
      state.available[t] = state.available[t].filter((a) => a.name !== name);
      next += 1;
      state.sales_methods[t].push(m(`new${next}`, name));
      return answer(route, `${name} added.`, 201);
    }
    if (path === "/sales-methods/order") {
      const t = body.type!;
      state.sales_methods[t] = body.method_ids!.map((id) => state.sales_methods[t].find((x) => x.id === id)!);
      return answer(route, "Order saved.");
    }
    const id = path.split("/").pop();
    for (const t of ["electronic", "delivery"] as const) {
      if (call.method === "DELETE") state.sales_methods[t] = state.sales_methods[t].filter((x) => x.id !== id);
      else state.sales_methods[t] = state.sales_methods[t].map((x) => (x.id === id ? { ...x, name: body.name! } : x));
    }
    return answer(route, call.method === "DELETE" ? "Method removed. Reports that used it keep their amounts." : "Name saved.");
  });
  await page.route("**/api/me/profile**", (route) => route.fulfill({ json: { user: { name: "Tess Tester", initials: "TT" } } }));
  // Flask's settings page (the Xero parts, by the company's full id): caught.
  await page.route(/\/entity\/[0-9a-f-]{36}\/settings\/petty-cash$/, (route) => route.fulfill({ contentType: "text/html", body: "<title>Flask page</title><p>Flask settings</p>" }));
  return calls;
}

async function arrive(page: Page, next: string) {
  const token = mintModuleToken({ secret: "stub", userId: "u", entityId: ENTITY, entityName: NAME });
  await page.goto(`/landing?${new URLSearchParams({ token, entity_id: ENTITY, entity_name: NAME, next })}`);
}

async function openWith(page: Page, start: State = settings(), refuse?: Refuse): Promise<Call[]> {
  const calls = await stub(page, start, refuse);
  await arrive(page, SETTINGS);
  await expect(page.getByRole("heading", { level: 1, name: "Petty Cash settings" })).toBeVisible();
  await expect(page.getByRole("status", { name: "Loading" })).toHaveCount(0);
  return calls;
}

const countryCard = (page: Page) => page.getByRole("region", { name: "Country & currency" });
const methodsCard = (page: Page) => page.getByRole("region", { name: "Sales methods" });
const group = (page: Page, label: "Electronic" | "Delivery") => methodsCard(page).getByRole("group", { name: label, exact: true });
const rowsOf = (page: Page, label: "Electronic" | "Delivery") => group(page, label).getByRole("list", { name: `${label} methods` }).getByRole("listitem");
const rowOf = (page: Page, label: "Electronic" | "Delivery", name: string) => rowsOf(page, label).filter({ hasText: name });
const more = (page: Page, name: string) => methodsCard(page).getByRole("button", { name: `More actions for ${name}` });
const toast = (page: Page) => page.locator('[data-toast-type="success"]');

async function menuItem(page: Page, method: string, item: string) {
  await more(page, method).click();
  await page.getByRole("menu", { name: `More actions for ${method}` }).getByRole("menuitem", { name: item }).click();
}

test("the read: both cards, the lists in order, each Save waiting for a change", async ({ page }) => {
  const calls = await openWith(page);
  await expect(countryCard(page).getByLabel("Country")).toHaveValue("HK");
  await expect(countryCard(page).getByLabel("Currency")).toHaveValue("cur-hkd");
  await expect(rowsOf(page, "Electronic")).toHaveText([/^Visa/, /^Octopus/, /^AlipayHK/]);
  await expect(rowsOf(page, "Delivery")).toHaveText([/^Foodpanda/]);
  for (const card of [countryCard(page), methodsCard(page)]) {
    const save = card.getByRole("button", { name: "Save", exact: true });
    await expect(save).toBeDisabled();
    await expect(save).toHaveAccessibleDescription("No changes to save yet.");
  }
  // Xero is not connected: no Xero card.
  await expect(page.getByRole("region", { name: "Xero" })).toHaveCount(0);
  expect(calls).toEqual([]);
  await expectNoHorizontalScroll(page);
});

test("saving the country alone brings its currency, with the API's sentence as a toast", async ({ page }) => {
  const calls = await openWith(page);
  const card = countryCard(page);
  await card.getByLabel("Country").selectOption("SG");
  await expect(card.getByLabel("Currency")).toHaveValue("");
  await expect(card.getByLabel("Currency").locator("option:checked")).toHaveText("The country's own currency");
  await expect(card.getByText("Saving sets the currency that goes with the country.", { exact: false })).toBeVisible();
  // Back to the saved country is nothing to save.
  await card.getByLabel("Country").selectOption("HK");
  await expect(card.getByLabel("Currency")).toHaveValue("cur-hkd");
  await expect(card.getByRole("button", { name: "Save", exact: true })).toBeDisabled();

  await card.getByLabel("Country").selectOption("SG");
  await card.getByRole("button", { name: "Save", exact: true }).click();
  await expect(toast(page)).toContainText("Country and currency saved.");
  expect(calls).toEqual([{ method: "PUT", path: "/settings/country", body: { country_code: "SG" } }]);
  await expect(card.getByLabel("Currency")).toHaveValue("cur-sgd");
  await expect(card.getByRole("button", { name: "Save", exact: true })).toBeDisabled();
});

test("a refused country save shows the API's sentence in the card, never a toast", async ({ page }) => {
  const calls = await openWith(page, settings(), (call) => (call.path === "/settings/country" ? [422, "Pick one of the currencies offered."] : null));
  const card = countryCard(page);
  await card.getByLabel("Currency").selectOption("cur-sgd");
  await card.getByRole("button", { name: "Save", exact: true }).click();
  await expect(card.getByRole("alert")).toContainText("Pick one of the currencies offered.");
  await expect(toast(page)).toHaveCount(0);
  expect(calls).toEqual([{ method: "PUT", path: "/settings/country", body: { currency_id: "cur-sgd" } }]);
  // The choice is kept, so it can be saved again.
  await expect(card.getByLabel("Currency")).toHaveValue("cur-sgd");
  await expect(card.getByRole("button", { name: "Save", exact: true })).toBeEnabled();
});

test("adding from the catalogue waits for Save, then sends the catalogue method", async ({ page }) => {
  const calls = await openWith(page);
  await group(page, "Electronic").getByRole("button", { name: "Add electronic method" }).click();
  const panel = page.getByRole("group", { name: "Add electronic method" });
  const field = panel.getByRole("combobox", { name: /Method/ });
  await expect(field).toBeFocused();
  await field.fill("pay");
  const options = panel.getByRole("listbox").getByRole("option");
  await expect(options).toHaveText(["WeChat Pay"]);
  await options.first().click();
  await expect(field).toHaveValue("WeChat Pay");
  await panel.getByRole("button", { name: "Add", exact: true }).click();
  await expect(rowOf(page, "Electronic", "WeChat Pay")).toContainText("Added · not saved yet");
  await expect(group(page, "Electronic").getByRole("button", { name: "Add electronic method" })).toBeFocused();
  expect(calls).toEqual([]);

  await methodsCard(page).getByRole("button", { name: "Save", exact: true }).click();
  await expect(toast(page)).toContainText("WeChat Pay added.");
  expect(calls).toEqual([{ method: "POST", path: "/sales-methods", body: { type: "electronic", sale_info_id: "c-wechat" } }]);
  await expect(rowOf(page, "Electronic", "WeChat Pay")).not.toContainText("not saved yet");
  await expect(methodsCard(page).getByRole("button", { name: "Save", exact: true })).toBeDisabled();
});

test("adding by name is checked as typed, and a refused addition shows the API's 409", async ({ page }) => {
  const calls = await openWith(page, settings(), (call) => (call.method === "POST" ? [409, "Tap & Go is already on the list."] : null));
  await group(page, "Electronic").getByRole("button", { name: "Add electronic method" }).click();
  const panel = page.getByRole("group", { name: "Add electronic method" });
  const field = panel.getByRole("combobox", { name: /Method/ });
  // Mandatory: the red * from the start (and "(required)" for a screen reader), never red until a refused Add.
  await expect(panel.getByText("*", { exact: true })).toBeVisible();
  await expect(field).toHaveAttribute("aria-required", "true");
  await expect(field).not.toHaveAttribute("aria-invalid", "true");
  await panel.getByRole("button", { name: "Add", exact: true }).click();
  await expect(panel.getByRole("alert")).toHaveText("The method's name is still empty. Choose a method or type a new name to add it.");
  await expect(field).toBeFocused();
  // As typed: over 100 at once, and a name already on the list at once.
  await field.fill("x".repeat(101));
  await expect(panel.getByRole("alert")).toHaveText("The name is 101 characters. Shorten it to 100 characters or fewer.");
  await field.fill("visa");
  await expect(panel.getByRole("alert")).toHaveText("visa is already on the list. Type another name.");
  await field.fill("Tap & Go");
  await expect(panel.getByRole("alert")).toHaveCount(0);
  await field.press("Enter");
  await expect(rowOf(page, "Electronic", "Tap & Go")).toContainText("Added · not saved yet");

  await methodsCard(page).getByRole("button", { name: "Save", exact: true }).click();
  const alert = methodsCard(page).getByRole("alert");
  await expect(alert).toContainText("Tap & Go wasn't added");
  await expect(alert).toContainText("Tap & Go is already on the list.");
  await expect(toast(page)).toHaveCount(0);
  expect(calls).toEqual([{ method: "POST", path: "/sales-methods", body: { type: "electronic", name: "Tap & Go" } }]);
  // Still waiting for Save.
  await expect(rowOf(page, "Electronic", "Tap & Go")).toContainText("Added · not saved yet");
  await expect(methodsCard(page).getByRole("button", { name: "Save", exact: true })).toBeEnabled();
});

test("renaming is checked as typed, and a 409 the read did not foresee shows the API's sentence", async ({ page }) => {
  const shared = "That method is used by other companies, so it can't be renamed here. Add a new one instead.";
  const calls = await openWith(page, settings(), (call) => (call.method === "PUT" && call.path === "/sales-methods/e2" ? [409, shared] : null));
  await menuItem(page, "Octopus", "Rename");
  const dialog = page.getByRole("dialog", { name: "Rename Octopus" });
  const field = dialog.getByRole("textbox", { name: /Name/ });
  await expect(field).toBeFocused();
  await field.fill("");
  await dialog.getByRole("button", { name: "Rename" }).click();
  await expect(dialog.getByRole("alert")).toHaveText("The method's name is still empty. Type its new name to save it.");
  await field.fill("ALIPAYHK");
  await expect(dialog.getByRole("alert")).toHaveText("ALIPAYHK is already on the list. Type another name.");
  await field.fill("Octopus Card");
  await field.press("Enter");
  await expect(dialog).toHaveCount(0);
  await expect(more(page, "Octopus Card")).toBeFocused();
  await expect(rowOf(page, "Electronic", "Octopus Card")).toContainText("Renamed from Octopus · not saved yet");

  await methodsCard(page).getByRole("button", { name: "Save", exact: true }).click();
  const alert = methodsCard(page).getByRole("alert");
  await expect(alert).toContainText("Octopus wasn't renamed");
  await expect(alert).toContainText(shared);
  await expect(toast(page)).toHaveCount(0);
  expect(calls).toEqual([{ method: "PUT", path: "/sales-methods/e2", body: { name: "Octopus Card" } }]);
});

test("a method other companies use can't take a new name: said as typed, and nothing is sent", async ({ page }) => {
  const calls = await openWith(page, settings({ sales_methods: { electronic: [m("e1", "Visa", true), m("e2", "Octopus")], delivery: [m("d1", "Foodpanda")] } }));
  await menuItem(page, "Visa", "Rename");
  const dialog = page.getByRole("dialog", { name: "Rename Visa" });
  const field = dialog.getByRole("textbox", { name: /Name/ });
  // Its own name stands: nothing is said on arrival.
  await expect(dialog.getByRole("alert")).toHaveCount(0);
  await field.fill("Visa Card");
  await expect(dialog.getByRole("alert")).toHaveText("Other companies use Visa too, so it can't be renamed here. Remove it and add a new method instead.");
  await expect(field).toHaveAttribute("aria-invalid", "true");
  await field.press("Enter");
  await expect(dialog).toBeVisible();
  await expect(field).toBeFocused();
  await field.fill("Visa");
  await expect(dialog.getByRole("alert")).toHaveCount(0);
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(rowOf(page, "Electronic", "Visa")).not.toContainText("not saved yet");
  await expect(methodsCard(page).getByRole("button", { name: "Save", exact: true })).toBeDisabled();
  expect(calls).toEqual([]);
});

test("a rename that goes through is confirmed with a toast", async ({ page }) => {
  const calls = await openWith(page);
  await menuItem(page, "Foodpanda", "Rename");
  const dialog = page.getByRole("dialog", { name: "Rename Foodpanda" });
  await dialog.getByRole("textbox", { name: /Name/ }).fill("foodpanda HK");
  await dialog.getByRole("button", { name: "Rename" }).click();
  await methodsCard(page).getByRole("button", { name: "Save", exact: true }).click();
  await expect(toast(page)).toContainText("Name saved.");
  expect(calls).toEqual([{ method: "PUT", path: "/sales-methods/d1", body: { name: "foodpanda HK" } }]);
  await expect(rowsOf(page, "Delivery")).toHaveText([/^foodpanda HK/]);
});

test("removing switches the method off on Save", async ({ page }) => {
  const calls = await openWith(page);
  await menuItem(page, "Visa", "Remove");
  await expect(rowsOf(page, "Electronic")).toHaveText([/^Octopus/, /^AlipayHK/]);
  await expect(methodsCard(page).getByText("Removed when you save: Visa.", { exact: false })).toBeVisible();
  expect(calls).toEqual([]);
  await methodsCard(page).getByRole("button", { name: "Save", exact: true }).click();
  await expect(toast(page)).toContainText("Method removed. Reports that used it keep their amounts.");
  expect(calls).toEqual([{ method: "DELETE", path: "/sales-methods/e1", body: null }]);
  await expect(methodsCard(page).getByText("Removed when you save", { exact: false })).toHaveCount(0);
});

test("reordering by keyboard: the More menu's Move up, the focus kept on the row, the new place said", async ({ page }) => {
  const calls = await openWith(page);
  const trigger = more(page, "AlipayHK");
  await trigger.focus();
  await page.keyboard.press("Enter");
  const menu = page.getByRole("menu", { name: "More actions for AlipayHK" });
  await expect(menu.getByRole("menuitem")).toHaveText([/Rename$/, /Move up$/, /Remove$/]);
  await expect(menu.getByRole("menuitem", { name: "Rename" })).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(rowsOf(page, "Electronic")).toHaveText([/^Visa/, /^AlipayHK/, /^Octopus/]);
  await expect(more(page, "AlipayHK")).toBeFocused();
  await expect(methodsCard(page).getByText("AlipayHK moved to 2 of 3.")).toBeAttached();
  // The first row has no Move up, the last no Move down.
  await more(page, "Visa").click();
  await expect(page.getByRole("menu", { name: "More actions for Visa" }).getByRole("menuitem")).toHaveText([/Rename$/, /Move down$/, /Remove$/]);
  await page.keyboard.press("Escape");

  await methodsCard(page).getByRole("button", { name: "Save", exact: true }).click();
  await expect(toast(page)).toContainText("Order saved.");
  expect(calls).toEqual([{ method: "PUT", path: "/sales-methods/order", body: { type: "electronic", method_ids: ["e1", "e3", "e2"] } }]);
});

test("reordering on a phone: the More menu opens as a bottom sheet", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "phone", "a phone's touch");
  const calls = await openWith(page);
  await more(page, "Visa").tap();
  const menu = page.getByRole("menu", { name: "More actions for Visa" });
  const box = await menu.boundingBox();
  expect(box && Math.round(box.y + box.height)).toBe(page.viewportSize()!.height);
  await menu.getByRole("menuitem", { name: "Move down" }).tap();
  await expect(rowsOf(page, "Electronic")).toHaveText([/^Octopus/, /^Visa/, /^AlipayHK/]);
  await methodsCard(page).getByRole("button", { name: "Save", exact: true }).tap();
  await expect(toast(page)).toContainText("Order saved.");
  expect(calls).toEqual([{ method: "PUT", path: "/sales-methods/order", body: { type: "electronic", method_ids: ["e2", "e1", "e3"] } }]);
});

test("several changes go out one by one; a stale order stops the save and keeps what went through", async ({ page }) => {
  const calls = await openWith(page, settings(), (call) => (call.path === "/sales-methods/order" ? [409, "The list changed since it was loaded. Reload the page and order it again."] : null));
  await menuItem(page, "Foodpanda", "Remove");
  await menuItem(page, "Octopus", "Move down");
  await methodsCard(page).getByRole("button", { name: "Save", exact: true }).click();
  const alert = methodsCard(page).getByRole("alert");
  await expect(alert).toContainText("The Electronic order wasn't saved");
  await expect(alert).toContainText("The list changed since it was loaded. Reload the page and order it again. The changes before it are saved; the rest are still waiting for Save.");
  expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual(["DELETE /sales-methods/d1", "PUT /sales-methods/order"]);
  await expect(group(page, "Delivery").getByText("No delivery methods yet.")).toBeVisible();
  await expect(methodsCard(page).getByText("Removed when you save", { exact: false })).toHaveCount(0);
  await expect(toast(page)).toHaveCount(0);
});

test("a cashier sees the page read-only, each Save with its reason beside it", async ({ page }) => {
  await openWith(page, settings({ permissions: CASHIER }));
  const country = countryCard(page);
  await expect(country.getByRole("combobox")).toHaveCount(0);
  await expect(country.getByText("Hong Kong")).toBeVisible();
  await expect(country.getByText("HKD")).toBeVisible();
  await expect(rowsOf(page, "Electronic")).toHaveText(["Visa", "Octopus", "AlipayHK"]);
  await expect(methodsCard(page).getByRole("button", { name: /More actions/ })).toHaveCount(0);
  await expect(methodsCard(page).getByRole("button", { name: /^Add / })).toHaveCount(0);
  for (const card of [country, methodsCard(page)]) {
    const save = card.getByRole("button", { name: "Save", exact: true });
    await expect(save).toBeDisabled();
    await expect(save).toHaveAccessibleDescription("Only Accountants and Admins can change these.");
  }
});

test("while Xero is connected, one card links to Flask's page for the Xero parts", async ({ page }) => {
  await openWith(page, settings({ xero_connected: true }));
  const card = page.getByRole("region", { name: "Xero" });
  await expect(card).toContainText("The Xero account mapping and the Petty Cash account codes are set on the Xero settings page");
  const link = card.getByRole("link", { name: "Go to Xero settings" });
  await expect(link).toHaveAttribute("href", new RegExp(`/entity/${ENTITY}/settings/petty-cash$`));
  await expect(link).not.toHaveAttribute("target", /.+/);
  await link.click();
  await expect(page.getByText("Flask settings")).toBeVisible();
});

test("unsaved changes ask before the page is left", async ({ page }) => {
  await openWith(page);
  await menuItem(page, "Visa", "Remove");
  await page.getByRole("main").getByRole("link", { name: "Petty Cash" }).click();
  const dialog = page.getByRole("alertdialog", { name: "Leave without saving?" });
  await expect(dialog.getByRole("button", { name: "Go Back" })).toBeFocused();
  await dialog.getByRole("button", { name: "Go Back" }).click();
  await expect(page).toHaveURL(exact(SETTINGS));
  await expect(methodsCard(page).getByText("Removed when you save: Visa.", { exact: false })).toBeVisible();
});

test("the sidebar's Settings opens this page, and its way back is the launch page", async ({ page }) => {
  await stub(page, settings());
  await page.route("**/api/petty-cash/v1/companies/*/home", (route) =>
    route.fulfill({
      json: {
        server_today: "2026-10-14", user_count: 1, currency_code: "HKD",
        latest: { date: "2026-10-13", closing_balance: 760, deposit: 0, deposit_bank_name: "No deposit", deposit_bank_number: "", deposit_correction_missing_settings: [], can_correct_deposit: true, submitter_first_name: "Olive" },
        draft: null, draft_date: null, published: {},
        today_has_report: false, today_is_latest_report: true, xero_settings: { complete: true, missing: [] }, permissions: { read_only: false, correct_deposit: true },
      },
    }),
  );
  await arrive(page, HOME);
  await expect(page.getByRole("heading", { level: 1, name: "Petty Cash" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Start today's Daily Closing" })).toBeVisible();
  await page.getByRole("button", { name: "Open navigation menu" }).click();
  const link = page.getByRole("link", { name: "Settings", exact: true });
  await expect(link).toHaveAttribute("href", SETTINGS);
  await link.click();
  await expect(page).toHaveURL(exact(SETTINGS));
  // Hydrated (the cards need the cookie), so the menu answers.
  await expect(methodsCard(page)).toBeVisible();

  await page.getByRole("button", { name: "Open navigation menu" }).click();
  await expect(page.getByRole("link", { name: "Settings", exact: true })).toHaveAttribute("aria-current", "page");
  await page.keyboard.press("Escape");
  await page.getByRole("main").getByRole("link", { name: "Petty Cash" }).click();
  await expect(page).toHaveURL(exact(HOME));
});

test("long names are never clipped, and the page never scrolls sideways", async ({ page }) => {
  const long = "A delivery platform with a very long trading name Limited Hong Kong Branch Office";
  await openWith(page, settings({ sales_methods: { electronic: [m("e1", "x".repeat(100))], delivery: [m("d1", long)] }, xero_connected: true }));
  await page.evaluate(() => document.fonts.ready);
  const clipped = await page.evaluate(() =>
    Array.from(document.querySelectorAll("main p, main span, main a, main button, main label, main h2, main h3"))
      .filter((el) => el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflowX !== "auto")
      .map((el) => el.textContent),
  );
  expect(clipped).toEqual([]);
  await expectNoHorizontalScroll(page);
});

test("the page reloads with no console error", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("requestfailed", (r: Request) => errors.push(`failed: ${r.url()}`));
  await openWith(page, settings({ xero_connected: true }));
  await page.reload();
  await expect(page.getByRole("heading", { level: 1, name: "Petty Cash settings" })).toBeVisible();
  await expect(rowsOf(page, "Electronic")).toHaveCount(3);
  expect(errors).toEqual([]);
});
