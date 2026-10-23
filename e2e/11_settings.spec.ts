// Petty Cash Settings (components/settings/*, Flask's ORIGINAL look), against a STUBBED Petty Cash
// API. Needs only `npm run dev`. The other tabs are minty-web's and the payments app's pages,
// reached through Flask's hand-offs (never a Flask page); those are caught, so nothing leaves the app.

import { expect, test, type Page, type Route } from "@playwright/test";

import { companyRef } from "./companyRef";
import {
  catchHandoffs,
  expectHubHandoff,
  expectNoHorizontalScroll,
  mintModuleToken,
} from "./helpers";

const ENTITY = "3d65f186-5ba1-4bf7-a1b0-cc64a113eb5c";
const NAME = "E2E Petty Cash Shop";
const BASE = `/entity/${companyRef(ENTITY, NAME)}/petty-cash`;
const SETTINGS = `/entity/${companyRef(ENTITY, NAME)}/settings/petty-cash`;
const API =
  /\/api\/petty-cash\/v1\/companies\/[^/]+\/(settings(?:\/country|\/xero(?:\/mapping|\/account-codes)?)?|sales-methods(?:\/[^/?]+)?|suppliers)$/;
/** minty-web's pages for the other tabs, in the company's address (`next` of Flask's hand-off). */
const HUB_SETTINGS = `/entity/${companyRef(ENTITY, NAME)}/settings`;

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
const CASHIER: Perms = {
  ...ALL,
  edit_country: false,
  add_sales_method: false,
  rename_sales_method: false,
  remove_sales_method: false,
  reorder_sales_methods: false,
};

const m = (id: string, name: string, shared = false): Method => ({
  id,
  name,
  value_name: `${name.toLowerCase()}_sales`,
  shared,
});

// the Xero cards (GET /settings/xero and its two PUTs)
const BANK_PC = "b0000000-0000-4000-8000-000000000001";
const BANK_HSBC = "b0000000-0000-4000-8000-000000000002";
const SALES = "a0000000-0000-4000-8000-000000000200";
const DRAWINGS = "a0000000-0000-4000-8000-000000000880";
const SUSPENSE = "a0000000-0000-4000-8000-000000000990";
const WALKIN = "c0000000-0000-4000-8000-000000000001";
const TESS = "c0000000-0000-4000-8000-000000000002";
const NEW_CONTACT = "c0000000-0000-4000-8000-000000000099";
const MAPPING_KEYS = [
  "main_bank",
  "deposit_bank",
  "cashsale_account",
  "cashsale_contact",
  "owners_account",
  "owners_contact",
  "discrepancy_account",
  "discrepancy_contact",
] as const;
type MappingKey = (typeof MAPPING_KEYS)[number];
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
const BANKS = [
  { id: BANK_PC, name: "Petty Cash", code: "090" },
  { id: BANK_HSBC, name: "HSBC Current", code: "091" },
];
const ACCOUNTS = [
  { id: SALES, name: "Sales", code: "200" },
  { id: DRAWINGS, name: "Owner Drawings", code: "880" },
  { id: SUSPENSE, name: "Suspense", code: "990" },
];
const SAVED_MAPPING: Record<MappingKey, string | null> = {
  main_bank: BANK_PC,
  deposit_bank: BANK_HSBC,
  cashsale_account: SALES,
  cashsale_contact: WALKIN,
  owners_account: DRAWINGS,
  owners_contact: TESS,
  discrepancy_account: SUSPENSE,
  discrepancy_contact: TESS,
};
const EMPTY_MAPPING = Object.fromEntries(MAPPING_KEYS.map((k) => [k, null])) as Record<
  MappingKey,
  string | null
>;

function xeroState(
  over: { live?: boolean; edit?: boolean; mapping?: Record<MappingKey, string | null> } = {},
) {
  const mapping = over.mapping ?? SAVED_MAPPING;
  return {
    live: over.live ?? true,
    edit: over.edit ?? true,
    mapping: { ...mapping },
    saved: mapping.main_bank !== null,
    contacts: [
      { id: WALKIN, name: "Walk-in Customer" },
      { id: TESS, name: "Tess Tester" },
    ],
    codes: [
      { code: "400", name: "Advertising", selected: true },
      { code: "404", name: "Bank Fees", selected: false },
      { code: "429", name: "General Expenses", selected: true },
    ],
  };
}

/** What the stubbed API holds; each write changes it and answers the read again. */
function initialState(over: { perms?: Perms; xero?: ReturnType<typeof xeroState> } = {}) {
  return {
    country: { code: "HK", currency: "c-hkd" },
    electronic: [m(VISA, "Visa"), m(ALIPAY, "AlipayHK")],
    delivery: [m(FOODPANDA, "Foodpanda", true)],
    available: {
      electronic: [{ id: OCTOPUS, name: "Octopus" }],
      delivery: [{ id: KEETA, name: "Keeta" }],
    },
    perms: over.perms ?? ALL,
    xero: over.xero ?? xeroState({ live: false }),
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
    xero_connected: s.xero.live,
    permissions: s.perms,
  };
}

function xeroRead(s: State): Json {
  const x = s.xero;
  return {
    live: x.live,
    organisation: x.live ? "E2E Xero Org" : null,
    mapping: x.live
      ? MAPPING_KEYS.map((key) => ({
          key,
          label: LABELS[key],
          kind: key.endsWith("contact") ? "contact" : "account",
          options: key.endsWith("bank") ? BANKS : key.endsWith("contact") ? x.contacts : ACCOUNTS,
          selected: x.mapping[key],
        }))
      : null,
    mapping_saved: x.saved,
    account_codes: x.live ? x.codes : null,
    permissions: { edit_mapping: x.edit, edit_account_codes: x.edit },
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
    if (call.method === "GET" && path === "/settings/xero")
      return route.fulfill({ json: xeroRead(state) });
    sent.push(call);
    const no = refuse(call);
    if (no) return route.fulfill({ status: no.status, json: { error: no.error } });
    if (path === "/settings/xero/mapping") {
      const first = !state.xero.saved;
      for (const key of MAPPING_KEYS) state.xero.mapping[key] = String(body?.[key]);
      state.xero.saved = true;
      return route.fulfill({
        json: { ...xeroRead(state), message: "Xero account mapping saved.", first_save: first },
      });
    }
    if (path === "/settings/xero/account-codes") {
      const codes = body?.codes as string[];
      state.xero.codes = state.xero.codes.map((c) => ({ ...c, selected: codes.includes(c.code) }));
      return route.fulfill({ json: { ...xeroRead(state), message: "Account codes saved." } });
    }
    if (path === "/suppliers") {
      const made = { id: NEW_CONTACT, name: String(body?.name) };
      state.xero.contacts = [...state.xero.contacts, made];
      return route.fulfill({ status: 201, json: made });
    }
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
      const added = fromCatalogue
        ? m(fromCatalogue.id, fromCatalogue.name)
        : m("0c000000-0000-4000-8000-000000000001", String(body?.name));
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
        if (call.method === "PUT")
          state[type] = state[type].map((x) =>
            x.id === id ? { ...x, name: String(body?.name) } : x,
          );
        if (call.method === "DELETE") state[type] = state[type].filter((x) => x.id !== id);
      }
      message =
        call.method === "PUT"
          ? "Name saved."
          : "Method removed. Reports that used it keep their amounts.";
    }
    return route.fulfill({ status, json: { ...read(state), message } });
  });
  await page.route("**/api/me/profile**", (route) =>
    route.fulfill({ json: { user: { name: "Tess Tester", initials: "TT" } } }),
  );
  // Flask's hand-offs (to minty-web, and to the payments app's settings): caught, so nothing leaves
  await catchHandoffs(page);
  await page.route(/\/entity\/[0-9a-f-]{36}\/settings\/payment-request$/, (route) =>
    route.fulfill({ contentType: "text/html", body: "<title>Hand-off</title><p>Hand-off</p>" }),
  );
  return sent;
}

async function enter(page: Page, next: string) {
  const token = mintModuleToken({
    secret: "stub",
    userId: "u",
    entityId: ENTITY,
    entityName: NAME,
  });
  await page.goto(
    `/landing?${new URLSearchParams({ token, entity_id: ENTITY, entity_name: NAME, next })}`,
  );
}

async function open(page: Page, state = initialState(), refuse?: Refuse) {
  const sent = await stub(page, state, refuse);
  await enter(page, SETTINGS);
  await expect(page.getByRole("heading", { name: "Settings", level: 1 })).toBeVisible();
  await expect(card(page, "Electronic").getByRole("listitem").first()).toBeVisible();
  return sent;
}

/** The dashboard's read, for the pages that land there. */
async function stubHome(page: Page) {
  await page.route(/\/api\/petty-cash\/v1\/companies\/[^/]+\/home$/, (route) =>
    route.fulfill({
      json: {
        server_today: "2026-10-14",
        user_count: 1,
        currency_code: "HKD",
        latest: {
          date: "2026-10-13",
          closing_balance: 1160.5,
          deposit: 0,
          deposit_bank_name: "No deposit",
          deposit_bank_number: "",
          deposit_correction_missing_settings: [],
          can_correct_deposit: true,
          submitter_first_name: "Tess",
        },
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
}

const card = (page: Page, title: string) => page.getByRole("region", { name: title, exact: true });
const rows = (page: Page, title: string) =>
  card(page, title).getByRole("list").getByRole("listitem");
const toast = (page: Page, text: string | RegExp) =>
  page.locator("[data-toast-type]").filter({ hasText: text });
const rowMenu = async (page: Page, title: string, name: string) => {
  await card(page, title)
    .getByRole("button", { name: `Actions for ${name}` })
    .click();
  return card(page, title).getByRole("menu");
};

test("the read: Flask's header and tabs, the country and currency, both lists in order", async ({
  page,
}) => {
  await open(page);
  await expect(page.getByRole("link", { name: "Back" })).toHaveAttribute("href", BASE);
  await expect(page.getByText(NAME, { exact: true })).toBeVisible();
  const tabs = page.getByRole("navigation", { name: "Settings sections" });
  await expect(tabs.getByText("Petty Cash Settings")).toHaveAttribute("aria-current", "page");
  // the other tabs: minty-web's pages through /handoff/minty-web, the payments app's through Flask's hand-off
  await expectHubHandoff(
    tabs.getByRole("link", { name: "Users" }),
    `${HUB_SETTINGS}/users`,
    ENTITY,
  );
  await expectHubHandoff(
    tabs.getByRole("link", { name: "Entity & Integration" }),
    `${HUB_SETTINGS}/integration`,
    ENTITY,
  );
  await expectHubHandoff(
    tabs.getByRole("link", { name: "Modules" }),
    `${HUB_SETTINGS}/modules`,
    ENTITY,
  );
  const payments = tabs.getByRole("link", { name: "Payment Request Settings" });
  await expect(payments).toBeVisible();
  expect(new URL((await payments.getAttribute("href")) ?? "").pathname).toBe(
    `/entity/${ENTITY}/settings/payment-request`,
  );

  await expect(page.getByRole("combobox", { name: "Select Country" })).toHaveValue("Hong Kong");
  await expect(page.getByRole("combobox", { name: "Select Currency" })).toHaveValue("HKD");
  await expect(page.getByRole("button", { name: "Save Changes" })).toBeDisabled();

  await expect(rows(page, "Electronic")).toHaveText(["Visa", "AlipayHK"].map((n) => new RegExp(n)));
  await expect(rows(page, "Delivery")).toHaveText([/Foodpanda/]);
  await expect(
    card(page, "Electronic").getByRole("button", { name: "Add New Method" }),
  ).toBeEnabled();
  // not connected to Xero: the two Xero cards say so (their own test is below)
  await expect(page.getByText("Xero isn't connected.", { exact: false })).toHaveCount(2);
  await expect(page.getByText(/view-only access/)).toHaveCount(0);
  await expectNoHorizontalScroll(page);
});

test("saving the country: picked from the list, the country alone sent, the API's sentence", async ({
  page,
}) => {
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
  expect(sent).toEqual([
    { method: "PUT", path: "/settings/country", body: { country_code: "SG" } },
  ]);
  // the country brought its currency
  await expect(page.getByRole("combobox", { name: "Select Currency" })).toHaveValue("SGD");
  await expect(page.getByRole("button", { name: "Save Changes" })).toBeDisabled();
});

test("a refused country save says the API's sentence and keeps the choice", async ({ page }) => {
  const sent = await open(page, initialState(), (s) =>
    s.path === "/settings/country"
      ? { status: 422, error: "Pick one of the currencies offered." }
      : null,
  );
  const currency = page.getByRole("combobox", { name: "Select Currency" });
  await currency.click();
  await page.getByRole("option", { name: "SGD" }).click();
  await currency.press("Enter"); // Enter with the list closed submits
  await expect(toast(page, "Pick one of the currencies offered.")).toBeVisible();
  expect(sent).toEqual([
    { method: "PUT", path: "/settings/country", body: { currency_id: "c-sgd" } },
  ]);
  await expect(currency).toHaveValue("SGD");
  await expect(page.getByRole("button", { name: "Save Changes" })).toBeEnabled();
  await expect(toast(page, "Country and currency saved.")).toHaveCount(0);
});

test("adding from the catalogue: the methods offered, picked, sent by id, drawn from the answer", async ({
  page,
}) => {
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
  expect(sent).toEqual([
    { method: "POST", path: "/sales-methods", body: { type: "electronic", sale_info_id: OCTOPUS } },
  ]);
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
  await expect(
    delivery.getByText("The method's name is still empty. Type a name to add it."),
  ).toBeVisible();
  await name.fill("x".repeat(101));
  await expect(
    delivery.getByText("That name is too long. Keep it to 100 characters or fewer."),
  ).toBeVisible();
  await expect(name).toHaveAttribute("aria-invalid", "true");
  await name.fill("foodpanda");
  await expect(delivery.getByText("foodpanda is already on the list.")).toBeVisible();
  await name.press("Enter");
  expect(sent).toEqual([]);
  await name.fill("Deliveroo Plus");
  await expect(name).not.toHaveAttribute("aria-invalid", "true");
  await name.press("Enter");
  await expect(toast(page, "Deliveroo Plus added.")).toBeVisible();
  expect(sent).toEqual([
    { method: "POST", path: "/sales-methods", body: { type: "delivery", name: "Deliveroo Plus" } },
  ]);
  await expect(rows(page, "Delivery")).toHaveText([/Foodpanda/, /Deliveroo Plus/]);
});

test("an add the API refuses (409) says its sentence and keeps the form", async ({ page }) => {
  await open(page, initialState(), (s) =>
    s.path === "/sales-methods" ? { status: 409, error: "Tap & Go is already on the list." } : null,
  );
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
  expect(sent).toEqual([
    { method: "PUT", path: `/sales-methods/${ALIPAY}`, body: { name: "Alipay HK" } },
  ]);
  await expect(rows(page, "Electronic")).toHaveText([/Visa/, /Alipay HK/]);
});

test("a rename of a method another company shares (409) says why and keeps the old name", async ({
  page,
}) => {
  await open(page, initialState(), (s) =>
    s.method === "PUT" && s.path.startsWith("/sales-methods/")
      ? { status: 409, error: "Visa is used by other companies too. Add a new method instead." }
      : null,
  );
  const electronic = card(page, "Electronic");
  await electronic.getByRole("button", { name: "Visa", exact: true }).click();
  await electronic.getByRole("textbox", { name: "Rename Visa" }).fill("Visa Card");
  await electronic.getByRole("textbox", { name: "Rename Visa" }).press("Enter");
  await expect(
    toast(page, "Visa is used by other companies too. Add a new method instead."),
  ).toBeVisible();
  await expect(rows(page, "Electronic")).toHaveText([/Visa/, /AlipayHK/]);
  await expect(toast(page, "Name saved.")).toHaveCount(0);
});

test("a shared method says at once that it can't be renamed, and opens no box", async ({
  page,
}) => {
  const sent = await open(page);
  const delivery = card(page, "Delivery");
  const name = delivery.getByRole("button", { name: "Foodpanda", exact: true });
  await name.click();
  const note = delivery.getByText(
    "Other companies use Foodpanda too, so it can't be renamed here. Delete it and add a new method instead.",
  );
  await expect(note).toBeVisible();
  await expect(name).toHaveAccessibleDescription(/Other companies use Foodpanda too/);
  await expect(delivery.getByRole("textbox", { name: "Rename Foodpanda" })).toHaveCount(0);
  expect(sent).toEqual([]);
  // a method no one else has still renames
  await card(page, "Electronic").getByRole("button", { name: "Visa", exact: true }).click();
  await expect(
    card(page, "Electronic").getByRole("textbox", { name: "Rename Visa" }),
  ).toBeFocused();
  await expectNoHorizontalScroll(page);
});

test("removing: Flask's confirm, Go back sends nothing, Delete switches it off", async ({
  page,
}) => {
  const sent = await open(page);
  await (
    await rowMenu(page, "Delivery", "Foodpanda")
  )
    .getByRole("menuitem", { name: "Delete" })
    .click();
  const dialog = page.getByRole("dialog", { name: "Delete Delivery Method" });
  await expect(dialog).toContainText(
    'Are you sure you want to delete "Foodpanda"? This action cannot be undone.',
  );
  await expect(dialog.getByRole("button", { name: "Go back" })).toBeFocused();
  await dialog.getByRole("button", { name: "Go back" }).click();
  await expect(dialog).toHaveCount(0);
  expect(sent).toEqual([]);

  await (
    await rowMenu(page, "Delivery", "Foodpanda")
  )
    .getByRole("menuitem", { name: "Delete" })
    .click();
  await page
    .getByRole("dialog", { name: "Delete Delivery Method" })
    .getByRole("button", { name: "Delete" })
    .click();
  await expect(
    toast(page, "Method removed. Reports that used it keep their amounts."),
  ).toBeVisible();
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

  await (
    await rowMenu(page, "Electronic", "AlipayHK")
  )
    .getByRole("menuitem", { name: "Move up" })
    .click();
  await expect(toast(page, "Order saved.")).toBeVisible();
  expect(sent).toEqual([
    {
      method: "PUT",
      path: "/sales-methods/order",
      body: { type: "electronic", method_ids: [ALIPAY, VISA] },
    },
  ]);
  await expect(rows(page, "Electronic")).toHaveText([/AlipayHK/, /Visa/]);
});

test("a reorder refused because the list changed (409) keeps the order and says why", async ({
  page,
}) => {
  await open(page, initialState(), (s) =>
    s.path === "/sales-methods/order"
      ? {
          status: 409,
          error: "The list changed since it was loaded. Reload the page and order it again.",
        }
      : null,
  );
  await (
    await rowMenu(page, "Electronic", "Visa")
  )
    .getByRole("menuitem", { name: "Move down" })
    .click();
  await expect(
    toast(page, "The list changed since it was loaded. Reload the page and order it again."),
  ).toBeVisible();
  await expect(rows(page, "Electronic")).toHaveText([/Visa/, /AlipayHK/]);
});

test("a cashier sees it all read-only: the notice, no controls, Save off", async ({ page }) => {
  const sent = await open(page, initialState({ perms: CASHIER }));
  await expect(
    page.getByText(
      "You have view-only access to these settings. Ask an Accountant or Admin to make changes.",
    ),
  ).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Select Country" })).toBeDisabled();
  await expect(page.getByRole("combobox", { name: "Select Currency" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Save Changes" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Add New Method" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Actions for/ })).toHaveCount(0);
  // the names are text, not buttons
  await expect(
    card(page, "Electronic").getByRole("button", { name: "Visa", exact: true }),
  ).toHaveCount(0);
  await expect(card(page, "Electronic").getByText("Visa")).toBeVisible();
  expect(sent).toEqual([]);
  await expectNoHorizontalScroll(page);
});

test("a failure says so and offers a retry; a 403 says the API's sentence", async ({ page }) => {
  let forbidden = false;
  await page.route(/\/api\/petty-cash\/v1\/companies\/[^/]+\/settings$/, async (route) => {
    if (!forbidden)
      return route.fulfill({
        status: 500,
        json: { error: "Something went wrong on our side. Please try again." },
      });
    return route.fulfill({
      status: 403,
      json: { error: "You don't have permission to see these settings." },
    });
  });
  await page.route(/\/api\/petty-cash\/v1\/companies\/[^/]+\/settings\/xero$/, (route) =>
    route.fulfill({ status: 500, json: { error: "Not the subject here." } }),
  );
  await page.route("**/api/me/profile**", (route) =>
    route.fulfill({ json: { user: { name: "Tess Tester", initials: "TT" } } }),
  );
  await enter(page, SETTINGS);
  await expect(page.getByText("Something went wrong on our side. Please try again.")).toBeVisible();
  forbidden = true;
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByText("You don't have permission to see these settings.")).toBeVisible();
});

test("the way in: the dashboard's Entity Settings and the sidebar's Settings", async ({ page }) => {
  await stub(page, initialState());
  await stubHome(page);
  await enter(page, BASE);
  await expect(page.getByRole("link", { name: /Entity Settings/ })).toHaveAttribute(
    "href",
    SETTINGS,
  );
  await page.getByRole("button", { name: "Open navigation menu" }).click();
  const settings = page.getByRole("link", { name: "Settings", exact: true });
  await expect(settings).toHaveAttribute("href", SETTINGS);
  await settings.click();
  await expect(page).toHaveURL(new RegExp(`${SETTINGS}$`));
  await expect(page.getByRole("combobox", { name: "Select Country" })).toHaveValue("Hong Kong");
});

// ---- the Xero cards ----

const MAPPING = "Xero account mapping";
const CODES = "Petty Cash Account Code";
const picker = (page: Page, sub: string, nth = 0) =>
  card(page, MAPPING).getByRole("combobox", { name: sub }).nth(nth);
const PICKERS: [string, number, string][] = [
  ["Select Petty Cash bank account from Xero", 0, "Petty Cash - 090"],
  ["Select bank account to deposit excess cash", 0, "HSBC Current - 091"],
  ["Select account code for cash sales", 0, "Sales - 200"],
  ["Select the Customer contact", 0, "Walk-in Customer"],
  ["Select account code for the Advance Payment from director", 0, "Owner Drawings - 880"],
  ["Select Director or Responsible person", 0, "Tess Tester"],
  ["Select account code to record Cash Discrepancy", 0, "Suspense - 990"],
  ["Select Director or Responsible person", 1, "Tess Tester"],
];
const saveIn = (page: Page, title: string) =>
  card(page, title).getByRole("button", { name: "Save Changes" });
const pickFrom = async (page: Page, sub: string, option: RegExp, nth = 0) => {
  await picker(page, sub, nth).click();
  await card(page, MAPPING).getByRole("option", { name: option }).first().click();
};

test("Xero not connected: both cards keep their headings and show Flask's notice, linking to Entity & Integration", async ({
  page,
}) => {
  const sent = await open(page);
  for (const title of [MAPPING, CODES]) {
    await expect(
      card(page, title).getByRole("status").filter({
        hasText: "Xero isn't connected. Connect it in Entity & Integration to set these up.",
      }),
    ).toBeVisible();
  }
  await expect(card(page, MAPPING).getByRole("combobox")).toHaveCount(0);
  await expect(card(page, CODES).getByRole("checkbox")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Save Changes" })).toHaveCount(1); // the country's only
  const link = card(page, MAPPING).getByRole("link", { name: "Entity & Integration" });
  await expectHubHandoff(link, `${HUB_SETTINGS}/integration`, ENTITY);
  expect(sent).toEqual([]);
  await expectNoHorizontalScroll(page);
  await link.click();
  await expect(page).toHaveURL(
    (url) =>
      url.pathname === "/handoff/minty-web" &&
      url.searchParams.get("next") === `${HUB_SETTINGS}/integration`,
  );
  await expect(page.getByText("Hand-off")).toBeVisible();
});

test("the Xero read: Flask's groups, the eight pickers in order with the saved choices, the codes ticked", async ({
  page,
}) => {
  let reads = 0;
  page.on("request", (r) => {
    if (r.method() === "GET" && /\/settings\/xero$/.test(r.url())) reads += 1;
  });
  await open(page, initialState({ xero: xeroState() }));
  const mapping = card(page, MAPPING);
  for (const title of [
    "Petty Cash Account",
    "Deposit Bank Account",
    "Cash Sales",
    "Director Personal Account",
    "Discrepancy - Other Expense",
  ]) {
    await expect(mapping.getByRole("heading", { name: title, level: 3 })).toBeVisible();
  }
  await expect(mapping.getByRole("combobox")).toHaveCount(8);
  for (const [sub, nth, value] of PICKERS) await expect(picker(page, sub, nth)).toHaveValue(value);
  await expect(picker(page, PICKERS[0][0])).toHaveAttribute("aria-required", "true");
  await expect(saveIn(page, MAPPING)).toBeDisabled();

  const codes = card(page, CODES);
  await expect(codes.getByRole("checkbox", { name: "400 - Advertising" })).toBeChecked();
  await expect(codes.getByRole("checkbox", { name: "404 - Bank Fees" })).not.toBeChecked();
  await expect(codes.getByRole("checkbox", { name: "429 - General Expenses" })).toBeChecked();
  await expect(
    codes.getByRole("checkbox", { name: "Select all visible account codes" }),
  ).not.toBeChecked();
  await expect(saveIn(page, CODES)).toBeDisabled();
  await expect(page.getByText(/view-only access/)).toHaveCount(0);
  // the read asks Xero: once per page load
  expect(reads).toBe(1);
  await expectNoHorizontalScroll(page);
});

test("saving the mapping: a new pick, the other bank never offered, the eight keys sent, the API's sentence", async ({
  page,
}) => {
  const sent = await open(page, initialState({ xero: xeroState() }));
  const mapping = card(page, MAPPING);
  // the Deposit Bank Account never offers the Petty Cash Account's bank
  await picker(page, "Select bank account to deposit excess cash").click();
  await expect(mapping.getByRole("option")).toHaveCount(1);
  await expect(mapping.getByRole("option")).toContainText("HSBC Current");
  await page.keyboard.press("Escape");

  const sales = picker(page, "Select account code for cash sales");
  await sales.click();
  await sales.fill("880");
  await expect(mapping.getByRole("option")).toHaveCount(1);
  await mapping.getByRole("option", { name: /Owner Drawings/ }).click();
  await expect(sales).toHaveValue("Owner Drawings - 880");
  await saveIn(page, MAPPING).click();
  await expect(toast(page, "Xero account mapping saved.")).toBeVisible();
  expect(sent).toEqual([
    {
      method: "PUT",
      path: "/settings/xero/mapping",
      body: { ...SAVED_MAPPING, cashsale_account: DRAWINGS },
    },
  ]);
  await expect(sales).toHaveValue("Owner Drawings - 880");
  await expect(saveIn(page, MAPPING)).toBeDisabled();
  // not the first save: the page stays
  await expect(page).toHaveURL(new RegExp(`${SETTINGS}$`));
});

for (const [sentence, marked] of [
  ["Choose the Cash Sales contact from the list.", ["Select the Customer contact"]],
  [
    "The Petty Cash Account and the Deposit Bank Account can't be the same. Choose a different one for each.",
    ["Select Petty Cash bank account from Xero", "Select bank account to deposit excess cash"],
  ],
  ["Choose the Discrepancy account code.", ["Select account code to record Cash Discrepancy"]],
] as const) {
  test(`a mapping save refused (422) says the API's sentence and marks its field: "${sentence.slice(0, 32)}..."`, async ({
    page,
  }) => {
    const sent = await open(page, initialState({ xero: xeroState() }), (s) =>
      s.path === "/settings/xero/mapping" ? { status: 422, error: sentence } : null,
    );
    await pickFrom(page, "Select account code for cash sales", /Owner Drawings/);
    await saveIn(page, MAPPING).click();
    await expect(toast(page, sentence)).toBeVisible();
    expect(sent).toHaveLength(1);
    for (const sub of marked)
      await expect(picker(page, sub)).toHaveAttribute("aria-invalid", "true");
    const sales = picker(page, "Select account code for cash sales");
    await expect(sales).not.toHaveAttribute("aria-invalid", "true");
    // the choice is kept, and Save stays on for another go
    await expect(sales).toHaveValue("Owner Drawings - 880");
    await expect(saveIn(page, MAPPING)).toBeEnabled();
  });
}

test("a mapping save refused because Xero has not synced (409) says why", async ({ page }) => {
  const why =
    "Some choices haven't synced from Xero yet: Cash Sales contact. Try again once the Xero sync has finished.";
  await open(page, initialState({ xero: xeroState() }), (s) =>
    s.path === "/settings/xero/mapping" ? { status: 409, error: why } : null,
  );
  await pickFrom(page, "Select account code for cash sales", /Owner Drawings/);
  await saveIn(page, MAPPING).click();
  await expect(toast(page, why)).toBeVisible();
});

test("first setup: nothing red on open; a refused Save lists what is missing; the first save goes to the dashboard", async ({
  page,
}) => {
  const sent = await open(page, initialState({ xero: xeroState({ mapping: EMPTY_MAPPING }) }));
  await stubHome(page);
  const mapping = card(page, MAPPING);
  await expect(picker(page, PICKERS[0][0])).toHaveValue("");
  await expect(mapping.locator("[aria-invalid=true]")).toHaveCount(0);
  await expect(saveIn(page, MAPPING)).toBeDisabled();

  await pickFrom(page, PICKERS[0][0], /Petty Cash/);
  await saveIn(page, MAPPING).click();
  const summary = mapping.getByRole("alert");
  await expect(summary).toBeFocused();
  await expect(summary.getByRole("link")).toHaveCount(7);
  await expect(
    summary.getByRole("link", { name: "Choose the Deposit Bank Account." }),
  ).toBeVisible();
  await expect(picker(page, PICKERS[1][0])).toHaveAttribute("aria-invalid", "true");
  await expect(picker(page, PICKERS[0][0])).not.toHaveAttribute("aria-invalid", "true");
  expect(sent).toEqual([]);
  await summary.getByRole("link", { name: "Choose the Cash Sales account code." }).click();
  await expect(picker(page, PICKERS[2][0])).toBeFocused();
  await page.keyboard.press("Escape");

  await pickFrom(page, PICKERS[1][0], /HSBC Current/);
  await pickFrom(page, PICKERS[2][0], /Sales/);
  await pickFrom(page, PICKERS[3][0], /Walk-in Customer/);
  await pickFrom(page, PICKERS[4][0], /Owner Drawings/);
  await pickFrom(page, PICKERS[5][0], /Tess Tester/);
  await pickFrom(page, PICKERS[6][0], /Suspense/);
  // one left: focus goes to it with its sentence, no summary
  await saveIn(page, MAPPING).click();
  await expect(mapping.getByRole("alert")).toHaveCount(0);
  await expect(picker(page, PICKERS[7][0], 1)).toBeFocused();
  await expect(mapping.getByText("Choose the Discrepancy contact.")).toBeVisible();
  await mapping.getByRole("option", { name: /Tess Tester/ }).click();
  await expect(mapping.getByText("Choose the Discrepancy contact.")).toHaveCount(0);

  await saveIn(page, MAPPING).click();
  await expect(page).toHaveURL(new RegExp(`${BASE}$`));
  await expect(toast(page, "Xero account mapping saved.")).toBeVisible();
  expect(sent).toEqual([{ method: "PUT", path: "/settings/xero/mapping", body: SAVED_MAPPING }]);
});

test("adding a new contact: Flask's offer, the New Contact box, POST /suppliers, then chosen and saved", async ({
  page,
}) => {
  const sent = await open(page, initialState({ xero: xeroState() }));
  const mapping = card(page, MAPPING);
  const contact = picker(page, "Select the Customer contact");
  await contact.click();
  await contact.fill("zz");
  await expect(mapping.getByText("No Xero contact found")).toBeVisible();
  await contact.fill("Tess");
  await expect(mapping.getByRole("option")).toHaveText([
    "Tess Tester",
    "+ Add 'Tess' as a new contact",
  ]);
  await contact.fill("Nina Ng");
  await mapping.getByRole("option", { name: "+ Add 'Nina Ng' as a new contact" }).click();

  const name = mapping.getByRole("textbox", { name: "New Contact" });
  await expect(name).toHaveValue("Nina Ng");
  await expect(name).toBeFocused();
  // emptied: said under the box on Create, nothing sent
  await name.fill("");
  await mapping.getByRole("button", { name: "Create" }).click();
  await expect(
    mapping.getByText("The contact's name is still empty. Type a name to create it."),
  ).toBeVisible();
  expect(sent).toEqual([]);
  await name.fill("Nina Ng");
  await name.press("Enter");
  await expect(toast(page, "That contact's added!")).toBeVisible();
  expect(sent).toEqual([{ method: "POST", path: "/suppliers", body: { name: "Nina Ng" } }]);
  await expect(contact).toHaveValue("Nina Ng");
  // the other contact pickers offer it too
  await picker(page, "Select Director or Responsible person").click();
  await expect(mapping.getByRole("option", { name: "Nina Ng" })).toBeVisible();
  await page.keyboard.press("Escape");

  await saveIn(page, MAPPING).click();
  await expect(toast(page, "Xero account mapping saved.")).toBeVisible();
  expect(sent[1]).toEqual({
    method: "PUT",
    path: "/settings/xero/mapping",
    body: { ...SAVED_MAPPING, cashsale_contact: NEW_CONTACT },
  });
});

test("a new contact the API refuses says its sentence and keeps the box; Cancel puts the picker back", async ({
  page,
}) => {
  await open(page, initialState({ xero: xeroState() }), (s) =>
    s.path === "/suppliers"
      ? { status: 403, error: "You don't have permission to add contacts." }
      : null,
  );
  const mapping = card(page, MAPPING);
  const contact = picker(page, "Select the Customer contact");
  await contact.click();
  await contact.fill("Nina Ng");
  await mapping.getByRole("option", { name: "+ Add 'Nina Ng' as a new contact" }).click();
  await mapping.getByRole("button", { name: "Create" }).click();
  await expect(toast(page, "You don't have permission to add contacts.")).toBeVisible();
  await expect(mapping.getByRole("textbox", { name: "New Contact" })).toHaveValue("Nina Ng");
  await mapping.getByRole("button", { name: "Cancel" }).click();
  await expect(contact).toHaveValue("Walk-in Customer");
});

test("account codes: the search, Select all, at least one ticked (said at once), then saved", async ({
  page,
}) => {
  const sent = await open(page, initialState({ xero: xeroState() }));
  const codes = card(page, CODES);
  const search = codes.getByRole("searchbox", { name: "Search account code" });
  await search.fill("bank");
  await expect(codes.getByRole("checkbox")).toHaveCount(2); // Select all and Bank Fees
  await search.fill("zz");
  await expect(codes.getByText("No codes match your search.")).toBeVisible();
  await search.fill("");

  await codes.getByRole("checkbox", { name: "400 - Advertising" }).uncheck();
  await expect(codes.getByText("Pick at least one account code.")).toHaveCount(0);
  await codes.getByRole("checkbox", { name: "429 - General Expenses" }).uncheck();
  await expect(codes.getByText("Pick at least one account code.")).toBeVisible();
  await expect(saveIn(page, CODES)).toBeDisabled();
  await expect(saveIn(page, CODES)).toHaveAccessibleDescription("Pick at least one account code.");

  // Select all ticks every row shown; some ticked reads as mixed
  const all = codes.getByRole("checkbox", { name: "Select all visible account codes" });
  await all.check();
  for (const n of ["400 - Advertising", "404 - Bank Fees", "429 - General Expenses"])
    await expect(codes.getByRole("checkbox", { name: n })).toBeChecked();
  await codes.getByRole("checkbox", { name: "400 - Advertising" }).uncheck();
  await codes.getByRole("checkbox", { name: "429 - General Expenses" }).uncheck();
  expect(await all.evaluate((el: HTMLInputElement) => el.indeterminate)).toBe(true);
  await expect(codes.getByText("Pick at least one account code.")).toHaveCount(0);

  await saveIn(page, CODES).click();
  await expect(toast(page, "Account codes saved.")).toBeVisible();
  expect(sent).toEqual([
    { method: "PUT", path: "/settings/xero/account-codes", body: { codes: ["404"] } },
  ]);
  await expect(codes.getByRole("checkbox", { name: "404 - Bank Fees" })).toBeChecked();
  await expect(saveIn(page, CODES)).toBeDisabled();
});

test("account codes the API refuses (422) say its sentence and keep the ticks", async ({
  page,
}) => {
  await open(page, initialState({ xero: xeroState() }), (s) =>
    s.path === "/settings/xero/account-codes"
      ? { status: 422, error: "Pick at least one account code." }
      : null,
  );
  const codes = card(page, CODES);
  await codes.getByRole("checkbox", { name: "404 - Bank Fees" }).check();
  await saveIn(page, CODES).click();
  await expect(toast(page, "Pick at least one account code.")).toBeVisible();
  await expect(codes.getByRole("checkbox", { name: "404 - Bank Fees" })).toBeChecked();
});

test("a cashier sees the Xero cards read-only: the choices and ticks, no Save, the search still works", async ({
  page,
}) => {
  const sent = await open(page, initialState({ perms: CASHIER, xero: xeroState({ edit: false }) }));
  for (const [sub, nth, value] of PICKERS) {
    await expect(picker(page, sub, nth)).toHaveValue(value);
    await expect(picker(page, sub, nth)).toBeDisabled();
  }
  const codes = card(page, CODES);
  await expect(codes.getByRole("checkbox", { name: "400 - Advertising" })).toBeChecked();
  await expect(codes.getByRole("checkbox", { name: "400 - Advertising" })).toBeDisabled();
  await expect(
    codes.getByRole("checkbox", { name: "Select all visible account codes" }),
  ).toBeDisabled();
  await expect(saveIn(page, MAPPING)).toHaveCount(0);
  await expect(saveIn(page, CODES)).toHaveCount(0);
  await codes.getByRole("searchbox", { name: "Search account code" }).fill("bank");
  await expect(codes.getByRole("checkbox")).toHaveCount(2);
  expect(sent).toEqual([]);
  await expectNoHorizontalScroll(page);
});

test("a Xero read that fails says so in both cards, and Try again asks once more", async ({
  page,
}) => {
  let fail = true;
  await stub(page, initialState({ xero: xeroState() }));
  // registered after the stub, so it answers first
  await page.route(/\/api\/petty-cash\/v1\/companies\/[^/]+\/settings\/xero$/, (route) =>
    fail
      ? route.fulfill({
          status: 502,
          json: { error: "I couldn't reach Xero just now. Try again in a minute." },
        })
      : route.fallback(),
  );
  await enter(page, SETTINGS);
  await expect(
    card(page, MAPPING).getByText("I couldn't reach Xero just now. Try again in a minute."),
  ).toBeVisible();
  await expect(
    card(page, CODES).getByText("I couldn't reach Xero just now. Try again in a minute."),
  ).toBeVisible();
  // the cards that need no Xero are there all the same
  await expect(page.getByRole("combobox", { name: "Select Country" })).toHaveValue("Hong Kong");
  fail = false;
  await card(page, MAPPING).getByRole("button", { name: "Try again" }).click();
  await expect(picker(page, PICKERS[0][0])).toHaveValue("Petty Cash - 090");
  await expect(
    card(page, CODES).getByRole("checkbox", { name: "400 - Advertising" }),
  ).toBeChecked();
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
