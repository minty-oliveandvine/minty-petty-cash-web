// Petty Cash Settings (components/settings/*, Flask's ORIGINAL look), against a STUBBED Petty Cash
// API. Needs only `npm run dev`. Flask's pages (its settings page, the other tabs) are caught, so
// nothing leaves the app.

import { expect, test, type Page, type Route } from "@playwright/test";

import { companyRef } from "./companyRef";
import { expectNoHorizontalScroll, mintModuleToken } from "./helpers";

const ENTITY = "3d65f186-5ba1-4bf7-a1b0-cc64a113eb5c";
const NAME = "E2E Petty Cash Shop";
const BASE = `/entity/${companyRef(ENTITY, NAME)}/petty-cash`;
const SETTINGS = `/entity/${companyRef(ENTITY, NAME)}/settings/petty-cash`;
const API = /\/api\/petty-cash\/v1\/companies\/[^/]+\/(settings(?:\/country)?|sales-methods(?:\/[^/?]+)?)$/;
const FLASK_SETTINGS = new RegExp(`/entity/${ENTITY}/settings/petty-cash$`);

const VISA = "0a000000-0000-4000-8000-000000000001";
const ALIPAY = "0a000000-0000-4000-8000-000000000002";
const FOODPANDA = "0a000000-0000-4000-8000-000000000003";
const OCTOPUS = "0b000000-0000-4000-8000-000000000001";
const KEETA = "0b000000-0000-4000-8000-000000000002";

type Json = Record<string, unknown>;
type Method = { id: string; name: string; value_name: string; shared: boolean };
type Perms = Record<string, boolean>;

const ALL: Perms = {
  edit_country: true,
  view_sales_methods: true,
  add_sales_method: true,
  rename_sales_method: true,
  remove_sales_method: true,
  reorder_sales_methods: true,
};
const CASHIER: Perms = { ...ALL, edit_country: false, add_sales_method: false, rename_sales_method: false, remove_sales_method: false, reorder_sales_methods: false };

const m = (id: string, name: string, shared = false): Method => ({ id, name, value_name: `${name.toLowerCase()}_sales`, shared });

/** What the stubbed API holds; each write changes it and answers the read again. */
function initialState(over: { perms?: Perms; xero?: boolean } = {}) {
  return {
    country: { code: "HK", currency: "c-hkd" },
    electronic: [m(VISA, "Visa"), m(ALIPAY, "AlipayHK")],
    delivery: [m(FOODPANDA, "Foodpanda", true)],
    available: { electronic: [{ id: OCTOPUS, name: "Octopus" }], delivery: [{ id: KEETA, name: "Keeta" }] },
    perms: over.perms ?? ALL,
    xero: over.xero ?? false,
  };
}
type State = ReturnType<typeof initialState>;

const COUNTRIES = [
  { code: "HK", name: "Hong Kong", currency: "c-hkd" },
  { code: "SG", name: "Singapore", currency: "c-sgd" },
];
const CURRENCIES = [
  { id: "c-hkd", name: "HKD" },
  { id: "c-sgd", name: "SGD" },
];

function read(s: State): Json {
  return {
    country: {
      country_code: s.country.code,
      currency_id: s.country.currency,
      countries: COUNTRIES.map(({ code, name }) => ({ code, name })),
      currencies: CURRENCIES,
      selected_country: COUNTRIES.find((c) => c.code === s.country.code)?.name ?? null,
      selected_currency: CURRENCIES.find((c) => c.id === s.country.currency)?.name ?? null,
    },
    sales_methods: { electronic: s.electronic, delivery: s.delivery },
    available: s.available,
    xero_connected: s.xero,
    permissions: s.perms,
  };
}

type Sent = { method: string; path: string; body: Json | null };
type Refuse = (sent: Sent) => { status: number; error: string } | null;

/** Every call the page makes, stubbed; returns what was sent. `refuse` answers a write with a refusal. */
async function stub(page: Page, state: State, refuse: Refuse = () => null) {
  const sent: Sent[] = [];
  await page.route(API, async (route: Route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname.replace(/^.*\/companies\/[^/]+/, "");
    const body = req.postData() ? (JSON.parse(req.postData() as string) as Json) : null;
    const call = { method: req.method(), path, body };
    if (call.method === "GET" && path === "/settings") return route.fulfill({ json: read(state) });
    sent.push(call);
    const no = refuse(call);
    if (no) return route.fulfill({ status: no.status, json: { error: no.error } });
    let message = "";
    let status = 200;
    if (path === "/settings/country") {
      const country = COUNTRIES.find((c) => c.code === body?.country_code);
      if (country) state.country = { code: country.code, currency: country.currency };
      if (typeof body?.currency_id === "string") state.country.currency = body.currency_id;
      message = "Country and currency saved.";
    } else if (path === "/sales-methods" && call.method === "POST") {
      const type = body?.type as "electronic" | "delivery";
      const fromCatalogue = state.available[type].find((a) => a.id === body?.sale_info_id);
      const added = fromCatalogue ? m(fromCatalogue.id, fromCatalogue.name) : m("0c000000-0000-4000-8000-000000000001", String(body?.name));
      state[type] = [...state[type], added];
      state.available[type] = state.available[type].filter((a) => a.id !== added.id);
      message = `${added.name} added.`;
      status = 201;
    } else if (path === "/sales-methods/order") {
      const type = body?.type as "electronic" | "delivery";
      const ids = body?.method_ids as string[];
      state[type] = ids.map((id) => state[type].find((x) => x.id === id) as Method);
      message = "Order saved.";
    } else {
      const id = path.split("/").pop();
      for (const type of ["electronic", "delivery"] as const) {
        if (call.method === "PUT") state[type] = state[type].map((x) => (x.id === id ? { ...x, name: String(body?.name) } : x));
        if (call.method === "DELETE") state[type] = state[type].filter((x) => x.id !== id);
      }
      message = call.method === "PUT" ? "Name saved." : "Method removed. Reports that used it keep their amounts.";
    }
    return route.fulfill({ status, json: { ...read(state), message } });
  });
  await page.route("**/api/me/profile**", (route) => route.fulfill({ json: { user: { name: "Tess Tester", initials: "TT" } } }));
  // Flask's pages: caught
  await page.route(/\/entity\/[0-9a-f-]{36}\/settings\/[a-z-]+$/, (route) => route.fulfill({ contentType: "text/html", body: "<title>Flask page</title><p>Flask page</p>" }));
  return sent;
}

async function enter(page: Page, next: string) {
  const token = mintModuleToken({ secret: "stub", userId: "u", entityId: ENTITY, entityName: NAME });
  await page.goto(`/landing?${new URLSearchParams({ token, entity_id: ENTITY, entity_name: NAME, next })}`);
}

async function open(page: Page, state = initialState(), refuse?: Refuse) {
  const sent = await stub(page, state, refuse);
  await enter(page, SETTINGS);
  await expect(page.getByRole("heading", { name: "Settings", level: 1 })).toBeVisible();
  await expect(card(page, "Electronic").getByRole("listitem").first()).toBeVisible();
  return sent;
}

const card = (page: Page, title: string) => page.getByRole("region", { name: title, exact: true });
const rows = (page: Page, title: string) => card(page, title).getByRole("list").getByRole("listitem");
const toast = (page: Page, text: string | RegExp) => page.locator("[data-toast-type]").filter({ hasText: text });
const rowMenu = async (page: Page, title: string, name: string) => {
  await card(page, title).getByRole("button", { name: `Actions for ${name}` }).click();
  return card(page, title).getByRole("menu");
};

test("the read: Flask's header and tabs, the country and currency, both lists in order", async ({ page }) => {
  await open(page);
  await expect(page.getByRole("link", { name: "Back" })).toHaveAttribute("href", BASE);
  await expect(page.getByText(NAME, { exact: true })).toBeVisible();
  const tabs = page.getByRole("navigation", { name: "Settings sections" });
  await expect(tabs.getByText("Petty Cash Settings")).toHaveAttribute("aria-current", "page");
  await expect(tabs.getByRole("link", { name: "Users" })).toHaveAttribute("href", new RegExp(`/entity/${ENTITY}/settings/users$`));
  await expect(tabs.getByRole("link", { name: "Payment Request Settings" })).toBeVisible();

  await expect(page.getByRole("combobox", { name: "Select Country" })).toHaveValue("Hong Kong");
  await expect(page.getByRole("combobox", { name: "Select Currency" })).toHaveValue("HKD");
  await expect(page.getByRole("button", { name: "Save Changes" })).toBeDisabled();

  await expect(rows(page, "Electronic")).toHaveText(["Visa", "AlipayHK"].map((n) => new RegExp(n)));
  await expect(rows(page, "Delivery")).toHaveText([/Foodpanda/]);
  await expect(card(page, "Electronic").getByRole("button", { name: "Add New Method" })).toBeEnabled();
  // not connected to Xero: no Xero card
  await expect(page.getByRole("link", { name: "Open Xero settings" })).toHaveCount(0);
  await expect(page.getByText(/view-only access/)).toHaveCount(0);
  await expectNoHorizontalScroll(page);
});

test("saving the country: picked from the list, the country alone sent, the API's sentence", async ({ page }) => {
  const sent = await open(page);
  const country = page.getByRole("combobox", { name: "Select Country" });
  await country.click();
  await expect(page.getByRole("option")).toHaveCount(2);
  await country.fill("sing");
  await expect(page.getByRole("option")).toHaveText(["Singapore"]);
  await page.getByRole("option", { name: "Singapore" }).click();
  await expect(country).toHaveValue("Singapore");
  // a name that matches nothing says so, and leaving the box puts the choice back
  await country.fill("zz");
  await expect(page.getByText("No matches")).toBeVisible();
  await country.blur();
  await expect(country).toHaveValue("Singapore");

  await page.getByRole("button", { name: "Save Changes" }).click();
  await expect(toast(page, "Country and currency saved.")).toBeVisible();
  expect(sent).toEqual([{ method: "PUT", path: "/settings/country", body: { country_code: "SG" } }]);
  // the country brought its currency
  await expect(page.getByRole("combobox", { name: "Select Currency" })).toHaveValue("SGD");
  await expect(page.getByRole("button", { name: "Save Changes" })).toBeDisabled();
});

test("a refused country save says the API's sentence and keeps the choice", async ({ page }) => {
  const sent = await open(page, initialState(), (s) => (s.path === "/settings/country" ? { status: 422, error: "Pick one of the currencies offered." } : null));
  const currency = page.getByRole("combobox", { name: "Select Currency" });
  await currency.click();
  await page.getByRole("option", { name: "SGD" }).click();
  await currency.press("Enter"); // Enter with the list closed submits
  await expect(toast(page, "Pick one of the currencies offered.")).toBeVisible();
  expect(sent).toEqual([{ method: "PUT", path: "/settings/country", body: { currency_id: "c-sgd" } }]);
  await expect(currency).toHaveValue("SGD");
  await expect(page.getByRole("button", { name: "Save Changes" })).toBeEnabled();
  await expect(toast(page, "Country and currency saved.")).toHaveCount(0);
});

test("adding from the catalogue: the methods offered, picked, sent by id, drawn from the answer", async ({ page }) => {
  const sent = await open(page);
  const electronic = card(page, "Electronic");
  await electronic.getByRole("button", { name: "Add New Method" }).click();
  const picker = electronic.getByRole("combobox", { name: "Method" });
  await expect(picker).toBeFocused();
  await expect(electronic.getByRole("option")).toHaveText(["Octopus", "+ Other (type a new name)"]);
  await picker.fill("zz");
  await expect(electronic.getByText("No matching payment method found")).toBeVisible();
  await picker.fill("oct");
  await electronic.getByRole("option", { name: "Octopus" }).click();
  await electronic.getByRole("button", { name: "Add", exact: true }).click();
  await expect(toast(page, "Octopus added.")).toBeVisible();
  expect(sent).toEqual([{ method: "POST", path: "/sales-methods", body: { type: "electronic", sale_info_id: OCTOPUS } }]);
  await expect(rows(page, "Electronic")).toHaveText([/Visa/, /AlipayHK/, /Octopus/]);
  await expect(electronic.getByRole("button", { name: "Add New Method" })).toBeVisible();
});

test("adding by name: Other, the name checked as it is typed, then sent", async ({ page }) => {
  const sent = await open(page);
  const delivery = card(page, "Delivery");
  await delivery.getByRole("button", { name: "Add New Method" }).click();
  await delivery.getByRole("combobox", { name: "Method" }).click();
  await delivery.getByRole("option", { name: "+ Other (type a new name)" }).click();
  const name = delivery.getByRole("textbox", { name: "Name" });
  await expect(name).toBeFocused();
  // empty: nothing said until Add is refused for it
  await expect(delivery.getByText(/still empty/)).toHaveCount(0);
  await delivery.getByRole("button", { name: "Add", exact: true }).click();
  await expect(delivery.getByText("The method's name is still empty. Type a name to add it.")).toBeVisible();
  await name.fill("x".repeat(101));
  await expect(delivery.getByText("That name is too long. Keep it to 100 characters or fewer.")).toBeVisible();
  await expect(name).toHaveAttribute("aria-invalid", "true");
  await name.fill("foodpanda");
  await expect(delivery.getByText("foodpanda is already on the list.")).toBeVisible();
  await name.press("Enter");
  expect(sent).toEqual([]);
  await name.fill("Deliveroo Plus");
  await expect(name).not.toHaveAttribute("aria-invalid", "true");
  await name.press("Enter");
  await expect(toast(page, "Deliveroo Plus added.")).toBeVisible();
  expect(sent).toEqual([{ method: "POST", path: "/sales-methods", body: { type: "delivery", name: "Deliveroo Plus" } }]);
  await expect(rows(page, "Delivery")).toHaveText([/Foodpanda/, /Deliveroo Plus/]);
});

test("an add the API refuses (409) says its sentence and keeps the form", async ({ page }) => {
  await open(page, initialState(), (s) => (s.path === "/sales-methods" ? { status: 409, error: "Tap & Go is already on the list." } : null));
  const electronic = card(page, "Electronic");
  await electronic.getByRole("button", { name: "Add New Method" }).click();
  await electronic.getByRole("combobox", { name: "Method" }).click();
  await electronic.getByRole("option", { name: "+ Other (type a new name)" }).click();
  await electronic.getByRole("textbox", { name: "Name" }).fill("Tap & Go");
  await electronic.getByRole("button", { name: "Add", exact: true }).click();
  await expect(toast(page, "Tap & Go is already on the list.")).toBeVisible();
  await expect(electronic.getByRole("textbox", { name: "Name" })).toHaveValue("Tap & Go");
  await expect(rows(page, "Electronic")).toHaveCount(2);
  // Cancel closes it, nothing more sent
  await electronic.getByRole("button", { name: "Cancel" }).click();
  await expect(electronic.getByRole("button", { name: "Add New Method" })).toBeVisible();
});

test("renaming: click the name, Enter saves; Escape puts it back", async ({ page }) => {
  const sent = await open(page);
  const electronic = card(page, "Electronic");
  await electronic.getByRole("button", { name: "AlipayHK", exact: true }).click();
  const box = electronic.getByRole("textbox", { name: "Rename AlipayHK" });
  await expect(box).toBeFocused();
  await box.fill("visa");
  await expect(electronic.getByText("visa is already on the list.")).toBeVisible();
  await box.press("Escape");
  await expect(electronic.getByRole("button", { name: "AlipayHK", exact: true })).toBeVisible();
  expect(sent).toEqual([]);

  await electronic.getByRole("button", { name: "AlipayHK", exact: true }).click();
  await electronic.getByRole("textbox", { name: "Rename AlipayHK" }).fill("Alipay HK");
  await electronic.getByRole("textbox", { name: "Rename AlipayHK" }).press("Enter");
  await expect(toast(page, "Name saved.")).toBeVisible();
  expect(sent).toEqual([{ method: "PUT", path: `/sales-methods/${ALIPAY}`, body: { name: "Alipay HK" } }]);
  await expect(rows(page, "Electronic")).toHaveText([/Visa/, /Alipay HK/]);
});

test("a rename of a method another company shares (409) says why and keeps the old name", async ({ page }) => {
  await open(page, initialState(), (s) =>
    s.method === "PUT" && s.path.startsWith("/sales-methods/") ? { status: 409, error: "Visa is used by other companies too. Add a new method instead." } : null,
  );
  const electronic = card(page, "Electronic");
  await electronic.getByRole("button", { name: "Visa", exact: true }).click();
  await electronic.getByRole("textbox", { name: "Rename Visa" }).fill("Visa Card");
  await electronic.getByRole("textbox", { name: "Rename Visa" }).press("Enter");
  await expect(toast(page, "Visa is used by other companies too. Add a new method instead.")).toBeVisible();
  await expect(rows(page, "Electronic")).toHaveText([/Visa/, /AlipayHK/]);
  await expect(toast(page, "Name saved.")).toHaveCount(0);
});

test("a shared method says at once that it can't be renamed, and opens no box", async ({ page }) => {
  const sent = await open(page);
  const delivery = card(page, "Delivery");
  const name = delivery.getByRole("button", { name: "Foodpanda", exact: true });
  await name.click();
  const note = delivery.getByText("Other companies use Foodpanda too, so it can't be renamed here. Delete it and add a new method instead.");
  await expect(note).toBeVisible();
  await expect(name).toHaveAccessibleDescription(/Other companies use Foodpanda too/);
  await expect(delivery.getByRole("textbox", { name: "Rename Foodpanda" })).toHaveCount(0);
  expect(sent).toEqual([]);
  // a method no one else has still renames
  await card(page, "Electronic").getByRole("button", { name: "Visa", exact: true }).click();
  await expect(card(page, "Electronic").getByRole("textbox", { name: "Rename Visa" })).toBeFocused();
  await expectNoHorizontalScroll(page);
});

test("removing: Flask's confirm, Go back sends nothing, Delete switches it off", async ({ page }) => {
  const sent = await open(page);
  await (await rowMenu(page, "Delivery", "Foodpanda")).getByRole("menuitem", { name: "Delete" }).click();
  const dialog = page.getByRole("dialog", { name: "Delete Delivery Method" });
  await expect(dialog).toContainText('Are you sure you want to delete "Foodpanda"? This action cannot be undone.');
  await expect(dialog.getByRole("button", { name: "Go back" })).toBeFocused();
  await dialog.getByRole("button", { name: "Go back" }).click();
  await expect(dialog).toHaveCount(0);
  expect(sent).toEqual([]);

  await (await rowMenu(page, "Delivery", "Foodpanda")).getByRole("menuitem", { name: "Delete" }).click();
  await page.getByRole("dialog", { name: "Delete Delivery Method" }).getByRole("button", { name: "Delete" }).click();
  await expect(toast(page, "Method removed. Reports that used it keep their amounts.")).toBeVisible();
  expect(sent).toEqual([{ method: "DELETE", path: `/sales-methods/${FOODPANDA}`, body: null }]);
  await expect(rows(page, "Delivery")).toHaveCount(0);
  await expect(card(page, "Delivery").getByText("No delivery methods yet.")).toBeVisible();
});

test("reordering: Move up sends the type's whole list in its new order", async ({ page }) => {
  const sent = await open(page);
  const first = await rowMenu(page, "Electronic", "Visa");
  await expect(first.getByRole("menuitem", { name: "Move up" })).toBeDisabled();
  await expect(first.getByRole("menuitem", { name: "Move down" })).toBeEnabled();
  await page.keyboard.press("Escape");
  await expect(card(page, "Electronic").getByRole("menu")).toHaveCount(0);

  await (await rowMenu(page, "Electronic", "AlipayHK")).getByRole("menuitem", { name: "Move up" }).click();
  await expect(toast(page, "Order saved.")).toBeVisible();
  expect(sent).toEqual([{ method: "PUT", path: "/sales-methods/order", body: { type: "electronic", method_ids: [ALIPAY, VISA] } }]);
  await expect(rows(page, "Electronic")).toHaveText([/AlipayHK/, /Visa/]);
});

test("a reorder refused because the list changed (409) keeps the order and says why", async ({ page }) => {
  await open(page, initialState(), (s) =>
    s.path === "/sales-methods/order" ? { status: 409, error: "The list changed since it was loaded. Reload the page and order it again." } : null,
  );
  await (await rowMenu(page, "Electronic", "Visa")).getByRole("menuitem", { name: "Move down" }).click();
  await expect(toast(page, "The list changed since it was loaded. Reload the page and order it again.")).toBeVisible();
  await expect(rows(page, "Electronic")).toHaveText([/Visa/, /AlipayHK/]);
});

test("a cashier sees it all read-only: the notice, no controls, Save off", async ({ page }) => {
  const sent = await open(page, initialState({ perms: CASHIER }));
  await expect(page.getByText("You have view-only access to these settings. Ask an Accountant or Admin to make changes.")).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Select Country" })).toBeDisabled();
  await expect(page.getByRole("combobox", { name: "Select Currency" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Save Changes" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Add New Method" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Actions for/ })).toHaveCount(0);
  // the names are text, not buttons
  await expect(card(page, "Electronic").getByRole("button", { name: "Visa", exact: true })).toHaveCount(0);
  await expect(card(page, "Electronic").getByText("Visa")).toBeVisible();
  expect(sent).toEqual([]);
  await expectNoHorizontalScroll(page);
});

test("Xero's card: only while connected, a full-page link to Flask's settings page", async ({ page }) => {
  await open(page, initialState({ xero: true }));
  const link = page.getByRole("link", { name: "Open Xero settings" });
  await expect(link).toHaveAttribute("href", FLASK_SETTINGS);
  await link.click();
  await expect(page).toHaveURL(FLASK_SETTINGS);
  await expect(page.getByText("Flask page")).toBeVisible();
});

test("a failure says so and offers a retry; a 403 says the API's sentence", async ({ page }) => {
  let forbidden = false;
  await page.route(/\/api\/petty-cash\/v1\/companies\/[^/]+\/settings$/, async (route) => {
    if (!forbidden) return route.fulfill({ status: 500, json: { error: "Something went wrong on our side. Please try again." } });
    return route.fulfill({ status: 403, json: { error: "You don't have permission to see these settings." } });
  });
  await page.route("**/api/me/profile**", (route) => route.fulfill({ json: { user: { name: "Tess Tester", initials: "TT" } } }));
  await enter(page, SETTINGS);
  await expect(page.getByText("Something went wrong on our side. Please try again.")).toBeVisible();
  forbidden = true;
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByText("You don't have permission to see these settings.")).toBeVisible();
});

test("the way in: the dashboard's Entity Settings and the sidebar's Settings", async ({ page }) => {
  await stub(page, initialState());
  await page.route(/\/api\/petty-cash\/v1\/companies\/[^/]+\/home$/, (route) =>
    route.fulfill({
      json: {
        server_today: "2026-10-14",
        user_count: 1,
        currency_code: "HKD",
        latest: { date: "2026-10-13", closing_balance: 1160.5, deposit: 0, deposit_bank_name: "No deposit", deposit_bank_number: "", deposit_correction_missing_settings: [], can_correct_deposit: true, submitter_first_name: "Tess" },
        draft: null,
        draft_date: null,
        published: {},
        today_has_report: false,
        today_is_latest_report: false,
        xero_settings: { complete: true, missing: [] },
        permissions: { read_only: false, correct_deposit: true },
      },
    }),
  );
  await enter(page, BASE);
  await expect(page.getByRole("link", { name: /Entity Settings/ })).toHaveAttribute("href", SETTINGS);
  await page.getByRole("button", { name: "Open navigation menu" }).click();
  const settings = page.getByRole("link", { name: "Settings", exact: true });
  await expect(settings).toHaveAttribute("href", SETTINGS);
  await settings.click();
  await expect(page).toHaveURL(new RegExp(`${SETTINGS}$`));
  await expect(page.getByRole("combobox", { name: "Select Country" })).toHaveValue("Hong Kong");
});

test("the page reloads with no console error", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (e) => errors.push(e.message));
  await open(page);
  await page.reload();
  await expect(rows(page, "Electronic")).toHaveCount(2);
  expect(errors).toEqual([]);
});
