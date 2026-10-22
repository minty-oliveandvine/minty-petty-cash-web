// Petty Cash settings (components/settings/PettyCashSettings.tsx, Part 15.20 / 15.20b), against a
// STUBBED Petty Cash API that applies each change the way Flask's does. Needs only `npm run dev`.
// Connecting Xero is minty-web's Entity & Integration, through Flask's hand-off (caught) - never a
// Flask page. Refusals are
// inline alerts, never toasts; a save that went through is a toast.

import { expect, test, type Page, type Request, type Route } from "@playwright/test";

import { companyRef } from "@minty/shared/e2e";
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

const m = (id: string, name: string, shared = false): Method => ({
  id,
  name,
  value_name: `${name.toLowerCase()}_sales`,
  shared,
});

const ALL = {
  edit_country: true,
  view_sales_methods: true,
  add_sales_method: true,
  rename_sales_method: true,
  remove_sales_method: true,
  reorder_sales_methods: true,
};
const CASHIER = {
  ...ALL,
  edit_country: false,
  add_sales_method: false,
  rename_sales_method: false,
  remove_sales_method: false,
  reorder_sales_methods: false,
};

function settings(over: Partial<State> = {}): State {
  return {
    country: {
      country_code: "HK",
      currency_id: "cur-hkd",
      countries: [
        { code: "HK", name: "Hong Kong" },
        { code: "SG", name: "Singapore" },
      ],
      currencies: [
        { id: "cur-hkd", name: "HKD" },
        { id: "cur-sgd", name: "SGD" },
      ],
      selected_country: "Hong Kong",
      selected_currency: "HKD",
    },
    sales_methods: {
      electronic: [m("e1", "Visa"), m("e2", "Octopus"), m("e3", "AlipayHK")],
      delivery: [m("d1", "Foodpanda")],
    },
    available: {
      electronic: [
        { id: "c-wechat", name: "WeChat Pay" },
        { id: "c-amex", name: "AMEX" },
      ],
      delivery: [{ id: "c-keeta", name: "Keeta" }],
    },
    xero_connected: false,
    permissions: ALL,
    ...over,
  };
}

// --- The Xero cards' read (`GET /settings/xero`) -------------------------------------------------

type Option = { id: string; name: string; code?: string };
type XeroField = {
  key: string;
  label: string;
  kind: "account" | "contact";
  options: Option[];
  selected: string | null;
};
type XeroState = {
  live: boolean;
  organisation: string | null;
  mapping: XeroField[] | null;
  mapping_saved: boolean;
  account_codes: { code: string; name: string; selected: boolean }[] | null;
  permissions: { edit_mapping: boolean; edit_account_codes: boolean };
};

const BANKS: Option[] = [
  { id: "b-pc", name: "Petty Cash", code: "091" },
  { id: "b-hsbc", name: "HSBC Current", code: "" },
];
const CONTACTS: Option[] = [
  { id: "c-cash", name: "Cash Customer" },
  { id: "c-olive", name: "Olive Tan" },
];
const REVENUE: Option[] = [
  { id: "a-200", name: "Sales", code: "200" },
  { id: "a-260", name: "Other Revenue", code: "260" },
];
const OWNERS: Option[] = [
  { id: "a-880", name: "Owner Funds Introduced", code: "880" },
  { id: "a-881", name: "Director Loan", code: "881" },
];
const COSTS: Option[] = [
  { id: "a-429", name: "General Expenses", code: "429" },
  { id: "a-480", name: "Cash Discrepancy", code: "480" },
];
/** Flask's labels and order (`xero_mapping.FIELDS`), each with its options and saved choice. */
const FIELDS: [string, string, "account" | "contact", Option[], string][] = [
  ["main_bank", "Petty Cash Account", "account", BANKS, "b-pc"],
  ["deposit_bank", "Deposit Bank Account", "account", BANKS, "b-hsbc"],
  ["cashsale_account", "Cash Sales account code", "account", REVENUE, "a-200"],
  ["cashsale_contact", "Cash Sales contact", "contact", CONTACTS, "c-cash"],
  ["owners_account", "Director Personal Account code", "account", OWNERS, "a-880"],
  ["owners_contact", "Director / Responsible person", "contact", CONTACTS, "c-olive"],
  ["discrepancy_account", "Discrepancy account code", "account", COSTS, "a-480"],
  ["discrepancy_contact", "Discrepancy contact", "contact", CONTACTS, "c-olive"],
];
const SAVED_IDS = Object.fromEntries(FIELDS.map(([key, , , , id]) => [key, id]));
const XERO_ALL = { edit_mapping: true, edit_account_codes: true };

/** A live company's read: saved (every choice made) or not saved yet. */
function xeroRead(saved = true, over: Partial<XeroState> = {}): XeroState {
  return {
    live: true,
    organisation: "E2E Demo Org",
    mapping: FIELDS.map(([key, label, kind, options, id]) => ({
      key,
      label,
      kind,
      options,
      selected: saved ? id : null,
    })),
    mapping_saved: saved,
    account_codes: [
      { code: "400", name: "Advertising", selected: false },
      { code: "429", name: "General Expenses", selected: true },
      { code: "453", name: "Office Expenses", selected: false },
    ],
    permissions: XERO_ALL,
    ...over,
  };
}

const NOT_LIVE: XeroState = {
  live: false,
  organisation: null,
  mapping: null,
  mapping_saved: false,
  account_codes: null,
  permissions: XERO_ALL,
};

type Call = { method: string; path: string; body: Json | null };
/** Refuse a call: return [status, sentence], or null to let it through. */
type Refuse = (call: Call) => [number, string] | null;
/** How often this test's page asked for the Xero read (one test at a time per worker). */
let xeroReads = 0;

/**
 * The settings routes over one state, applied as Flask does; every write is recorded. The Xero
 * read is `xero` (not live by default), or `[status, sentence]` for a refused read. New contacts
 * (`POST /suppliers`) are made here too - nothing reaches Xero.
 */
async function stub(
  page: Page,
  start: State,
  refuse: Refuse = () => null,
  xero: XeroState | [number, string] = NOT_LIVE,
): Promise<Call[]> {
  const state: State = structuredClone(start);
  const xstate: XeroState | null = Array.isArray(xero) ? null : structuredClone(xero);
  const calls: Call[] = [];
  xeroReads = 0;
  let next = 0;
  const answer = (route: Route, message: string, status = 200) =>
    route.fulfill({ status, json: { ...structuredClone(state), message } });

  await page.route(/\/api\/petty-cash\/v1\/companies\/[^/]+\/suppliers$/, async (route) => {
    const call: Call = {
      method: route.request().method(),
      path: "/suppliers",
      body: route.request().postDataJSON() ?? null,
    };
    calls.push(call);
    const no = refuse(call);
    if (no) return route.fulfill({ status: no[0], json: { error: no[1] } });
    next += 1;
    const made = { id: `c-new${next}`, name: String(call.body?.name) };
    // Kept as a synced contact: the read offers it in every contact field from now on.
    if (xstate?.mapping)
      xstate.mapping = xstate.mapping.map((f) =>
        f.kind === "contact" ? { ...f, options: [...f.options, made] } : f,
      );
    return route.fulfill({ status: 201, json: made });
  });

  await page.route(
    /\/api\/petty-cash\/v1\/companies\/[^/]+\/(settings|sales-methods)(\/.*)?$/,
    async (route) => {
      const req = route.request();
      const path = new URL(req.url()).pathname.replace(/^.*\/companies\/[^/]+/, "");
      if (req.method() === "GET" && path === "/settings")
        return route.fulfill({ json: structuredClone(state) });
      if (req.method() === "GET" && path === "/settings/xero") {
        xeroReads += 1;
        return xstate
          ? route.fulfill({ json: structuredClone(xstate) })
          : route.fulfill({
              status: (xero as [number, string])[0],
              json: { error: (xero as [number, string])[1] },
            });
      }
      const call: Call = { method: req.method(), path, body: req.postDataJSON() ?? null };
      calls.push(call);
      const no = refuse(call);
      if (no) return route.fulfill({ status: no[0], json: { error: no[1] } });
      if (path === "/settings/xero/mapping" && xstate) {
        const firstSave = !xstate.mapping_saved;
        xstate.mapping = xstate.mapping!.map((f) => ({
          ...f,
          selected: String(call.body?.[f.key] ?? "") || null,
        }));
        xstate.mapping_saved = true;
        return route.fulfill({
          json: {
            ...structuredClone(xstate),
            message: "Xero account mapping saved.",
            first_save: firstSave,
          },
        });
      }
      if (path === "/settings/xero/account-codes" && xstate) {
        const codes = (call.body?.codes ?? []) as string[];
        if (!codes.length)
          return route.fulfill({ status: 422, json: { error: "Pick at least one account code." } });
        xstate.account_codes = xstate.account_codes!.map((c) => ({
          ...c,
          selected: codes.includes(c.code),
        }));
        return route.fulfill({
          json: { ...structuredClone(xstate), message: "Account codes saved." },
        });
      }
      const body = (call.body ?? {}) as {
        type?: Kind;
        name?: string;
        sale_info_id?: string;
        method_ids?: string[];
        country_code?: string;
        currency_id?: string;
      };
      if (path === "/settings/country") {
        if (body.country_code)
          state.country = {
            ...state.country,
            country_code: body.country_code,
            currency_id: body.currency_id ?? "cur-sgd",
            selected_country: "Singapore",
            selected_currency: "SGD",
          };
        return answer(route, "Country and currency saved.");
      }
      if (path === "/sales-methods" && call.method === "POST") {
        const t = body.type!;
        const name = body.sale_info_id
          ? state.available[t].find((a) => a.id === body.sale_info_id)!.name
          : body.name!;
        state.available[t] = state.available[t].filter((a) => a.name !== name);
        next += 1;
        state.sales_methods[t].push(m(`new${next}`, name));
        return answer(route, `${name} added.`, 201);
      }
      if (path === "/sales-methods/order") {
        const t = body.type!;
        state.sales_methods[t] = body.method_ids!.map((id) =>
          state.sales_methods[t].find((x) => x.id === id)!,
        );
        return answer(route, "Order saved.");
      }
      const id = path.split("/").pop();
      for (const t of ["electronic", "delivery"] as const) {
        if (call.method === "DELETE")
          state.sales_methods[t] = state.sales_methods[t].filter((x) => x.id !== id);
        else
          state.sales_methods[t] = state.sales_methods[t].map((x) =>
            x.id === id ? { ...x, name: body.name! } : x,
          );
      }
      return answer(
        route,
        call.method === "DELETE"
          ? "Method removed. Reports that used it keep their amounts."
          : "Name saved.",
      );
    },
  );
  await page.route("**/api/me/profile**", (route) =>
    route.fulfill({ json: { user: { name: "Tess Tester", initials: "TT" } } }),
  );
  // Flask's hand-off to minty-web (Connect Xero): caught.
  await page.route(/\/handoff\/minty-web\?/, (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<title>Hand-off</title><p>minty-web hand-off</p>",
    }),
  );
  return calls;
}

async function arrive(page: Page, next: string) {
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

async function openWith(
  page: Page,
  start: State = settings(),
  refuse?: Refuse,
  xero?: XeroState | [number, string],
): Promise<Call[]> {
  const calls = await stub(page, start, refuse, xero);
  await arrive(page, SETTINGS);
  await expect(page.getByRole("heading", { level: 1, name: "Petty Cash settings" })).toBeVisible();
  await expect(page.getByRole("status", { name: "Loading" })).toHaveCount(0);
  return calls;
}

const countryCard = (page: Page) => page.getByRole("region", { name: "Country & currency" });
const methodsCard = (page: Page) => page.getByRole("region", { name: "Sales methods" });
const group = (page: Page, label: "Electronic" | "Delivery") =>
  methodsCard(page).getByRole("group", { name: label, exact: true });
const rowsOf = (page: Page, label: "Electronic" | "Delivery") =>
  group(page, label)
    .getByRole("list", { name: `${label} methods` })
    .getByRole("listitem");
const rowOf = (page: Page, label: "Electronic" | "Delivery", name: string) =>
  rowsOf(page, label).filter({ hasText: name });
const more = (page: Page, name: string) =>
  methodsCard(page).getByRole("button", { name: `More actions for ${name}` });
const toast = (page: Page) => page.locator('[data-toast-type="success"]');

async function menuItem(page: Page, method: string, item: string) {
  await more(page, method).click();
  await page
    .getByRole("menu", { name: `More actions for ${method}` })
    .getByRole("menuitem", { name: item })
    .click();
}

test("the read: both cards, the lists in order, each Save waiting for a change", async ({
  page,
}) => {
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
  // Xero is not live: one Xero card (see below), no mapping or codes cards.
  await expect(page.getByRole("region", { name: "Xero", exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Xero account mapping" })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Petty Cash account codes" })).toHaveCount(0);
  expect(calls).toEqual([]);
  expect(xeroReads).toBe(1);
  await expectNoHorizontalScroll(page);
});

test("saving the country alone brings its currency, with the API's sentence as a toast", async ({
  page,
}) => {
  const calls = await openWith(page);
  const card = countryCard(page);
  await card.getByLabel("Country").selectOption("SG");
  await expect(card.getByLabel("Currency")).toHaveValue("");
  await expect(card.getByLabel("Currency").locator("option:checked")).toHaveText(
    "The country's own currency",
  );
  await expect(
    card.getByText("Saving sets the currency that goes with the country.", { exact: false }),
  ).toBeVisible();
  // Back to the saved country is nothing to save.
  await card.getByLabel("Country").selectOption("HK");
  await expect(card.getByLabel("Currency")).toHaveValue("cur-hkd");
  await expect(card.getByRole("button", { name: "Save", exact: true })).toBeDisabled();

  await card.getByLabel("Country").selectOption("SG");
  await card.getByRole("button", { name: "Save", exact: true }).click();
  await expect(toast(page)).toContainText("Country and currency saved.");
  expect(calls).toEqual([
    { method: "PUT", path: "/settings/country", body: { country_code: "SG" } },
  ]);
  await expect(card.getByLabel("Currency")).toHaveValue("cur-sgd");
  await expect(card.getByRole("button", { name: "Save", exact: true })).toBeDisabled();
});

test("a refused country save shows the API's sentence in the card, never a toast", async ({
  page,
}) => {
  const calls = await openWith(page, settings(), (call) =>
    call.path === "/settings/country" ? [422, "Pick one of the currencies offered."] : null,
  );
  const card = countryCard(page);
  await card.getByLabel("Currency").selectOption("cur-sgd");
  await card.getByRole("button", { name: "Save", exact: true }).click();
  await expect(card.getByRole("alert")).toContainText("Pick one of the currencies offered.");
  await expect(toast(page)).toHaveCount(0);
  expect(calls).toEqual([
    { method: "PUT", path: "/settings/country", body: { currency_id: "cur-sgd" } },
  ]);
  // The choice is kept, so it can be saved again.
  await expect(card.getByLabel("Currency")).toHaveValue("cur-sgd");
  await expect(card.getByRole("button", { name: "Save", exact: true })).toBeEnabled();
});

test("adding from the catalogue waits for Save, then sends the catalogue method", async ({
  page,
}) => {
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
  await expect(
    group(page, "Electronic").getByRole("button", { name: "Add electronic method" }),
  ).toBeFocused();
  expect(calls).toEqual([]);

  await methodsCard(page).getByRole("button", { name: "Save", exact: true }).click();
  await expect(toast(page)).toContainText("WeChat Pay added.");
  expect(calls).toEqual([
    {
      method: "POST",
      path: "/sales-methods",
      body: { type: "electronic", sale_info_id: "c-wechat" },
    },
  ]);
  await expect(rowOf(page, "Electronic", "WeChat Pay")).not.toContainText("not saved yet");
  await expect(methodsCard(page).getByRole("button", { name: "Save", exact: true })).toBeDisabled();
});

test("adding by name is checked as typed, and a refused addition shows the API's 409", async ({
  page,
}) => {
  const calls = await openWith(page, settings(), (call) =>
    call.method === "POST" ? [409, "Tap & Go is already on the list."] : null,
  );
  await group(page, "Electronic").getByRole("button", { name: "Add electronic method" }).click();
  const panel = page.getByRole("group", { name: "Add electronic method" });
  const field = panel.getByRole("combobox", { name: /Method/ });
  // Mandatory: the red * from the start (and "(required)" for a screen reader), never red until a refused Add.
  await expect(panel.getByText("*", { exact: true })).toBeVisible();
  await expect(field).toHaveAttribute("aria-required", "true");
  await expect(field).not.toHaveAttribute("aria-invalid", "true");
  await panel.getByRole("button", { name: "Add", exact: true }).click();
  await expect(panel.getByRole("alert")).toHaveText(
    "The method's name is still empty. Choose a method or type a new name to add it.",
  );
  await expect(field).toBeFocused();
  // As typed: over 100 at once, and a name already on the list at once.
  await field.fill("x".repeat(101));
  await expect(panel.getByRole("alert")).toHaveText(
    "The name is 101 characters. Shorten it to 100 characters or fewer.",
  );
  await field.fill("visa");
  await expect(panel.getByRole("alert")).toHaveText(
    "visa is already on the list. Type another name.",
  );
  await field.fill("Tap & Go");
  await expect(panel.getByRole("alert")).toHaveCount(0);
  await field.press("Enter");
  await expect(rowOf(page, "Electronic", "Tap & Go")).toContainText("Added · not saved yet");

  await methodsCard(page).getByRole("button", { name: "Save", exact: true }).click();
  const alert = methodsCard(page).getByRole("alert");
  await expect(alert).toContainText("Tap & Go wasn't added");
  await expect(alert).toContainText("Tap & Go is already on the list.");
  await expect(toast(page)).toHaveCount(0);
  expect(calls).toEqual([
    { method: "POST", path: "/sales-methods", body: { type: "electronic", name: "Tap & Go" } },
  ]);
  // Still waiting for Save.
  await expect(rowOf(page, "Electronic", "Tap & Go")).toContainText("Added · not saved yet");
  await expect(methodsCard(page).getByRole("button", { name: "Save", exact: true })).toBeEnabled();
});

test("renaming is checked as typed, and a 409 the read did not foresee shows the API's sentence", async ({
  page,
}) => {
  const shared =
    "That method is used by other companies, so it can't be renamed here. Add a new one instead.";
  const calls = await openWith(page, settings(), (call) =>
    call.method === "PUT" && call.path === "/sales-methods/e2" ? [409, shared] : null,
  );
  await menuItem(page, "Octopus", "Rename");
  const dialog = page.getByRole("dialog", { name: "Rename Octopus" });
  const field = dialog.getByRole("textbox", { name: /Name/ });
  await expect(field).toBeFocused();
  await field.fill("");
  await dialog.getByRole("button", { name: "Rename" }).click();
  await expect(dialog.getByRole("alert")).toHaveText(
    "The method's name is still empty. Type its new name to save it.",
  );
  await field.fill("ALIPAYHK");
  await expect(dialog.getByRole("alert")).toHaveText(
    "ALIPAYHK is already on the list. Type another name.",
  );
  await field.fill("Octopus Card");
  await field.press("Enter");
  await expect(dialog).toHaveCount(0);
  await expect(more(page, "Octopus Card")).toBeFocused();
  await expect(rowOf(page, "Electronic", "Octopus Card")).toContainText(
    "Renamed from Octopus · not saved yet",
  );

  await methodsCard(page).getByRole("button", { name: "Save", exact: true }).click();
  const alert = methodsCard(page).getByRole("alert");
  await expect(alert).toContainText("Octopus wasn't renamed");
  await expect(alert).toContainText(shared);
  await expect(toast(page)).toHaveCount(0);
  expect(calls).toEqual([
    { method: "PUT", path: "/sales-methods/e2", body: { name: "Octopus Card" } },
  ]);
});

test("a method other companies use can't take a new name: said as typed, and nothing is sent", async ({
  page,
}) => {
  const calls = await openWith(
    page,
    settings({
      sales_methods: {
        electronic: [m("e1", "Visa", true), m("e2", "Octopus")],
        delivery: [m("d1", "Foodpanda")],
      },
    }),
  );
  await menuItem(page, "Visa", "Rename");
  const dialog = page.getByRole("dialog", { name: "Rename Visa" });
  const field = dialog.getByRole("textbox", { name: /Name/ });
  // Its own name stands: nothing is said on arrival.
  await expect(dialog.getByRole("alert")).toHaveCount(0);
  await field.fill("Visa Card");
  await expect(dialog.getByRole("alert")).toHaveText(
    "Other companies use Visa too, so it can't be renamed here. Remove it and add a new method instead.",
  );
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
  expect(calls).toEqual([
    { method: "PUT", path: "/sales-methods/d1", body: { name: "foodpanda HK" } },
  ]);
  await expect(rowsOf(page, "Delivery")).toHaveText([/^foodpanda HK/]);
});

test("removing switches the method off on Save", async ({ page }) => {
  const calls = await openWith(page);
  await menuItem(page, "Visa", "Remove");
  await expect(rowsOf(page, "Electronic")).toHaveText([/^Octopus/, /^AlipayHK/]);
  await expect(
    methodsCard(page).getByText("Removed when you save: Visa.", { exact: false }),
  ).toBeVisible();
  expect(calls).toEqual([]);
  await methodsCard(page).getByRole("button", { name: "Save", exact: true }).click();
  await expect(toast(page)).toContainText(
    "Method removed. Reports that used it keep their amounts.",
  );
  expect(calls).toEqual([{ method: "DELETE", path: "/sales-methods/e1", body: null }]);
  await expect(methodsCard(page).getByText("Removed when you save", { exact: false })).toHaveCount(
    0,
  );
});

test("reordering by keyboard: the More menu's Move up, the focus kept on the row, the new place said", async ({
  page,
}) => {
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
  await expect(
    page.getByRole("menu", { name: "More actions for Visa" }).getByRole("menuitem"),
  ).toHaveText([/Rename$/, /Move down$/, /Remove$/]);
  await page.keyboard.press("Escape");

  await methodsCard(page).getByRole("button", { name: "Save", exact: true }).click();
  await expect(toast(page)).toContainText("Order saved.");
  expect(calls).toEqual([
    {
      method: "PUT",
      path: "/sales-methods/order",
      body: { type: "electronic", method_ids: ["e1", "e3", "e2"] },
    },
  ]);
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
  expect(calls).toEqual([
    {
      method: "PUT",
      path: "/sales-methods/order",
      body: { type: "electronic", method_ids: ["e2", "e1", "e3"] },
    },
  ]);
});

test("several changes go out one by one; a stale order stops the save and keeps what went through", async ({
  page,
}) => {
  const calls = await openWith(page, settings(), (call) =>
    call.path === "/sales-methods/order"
      ? [409, "The list changed since it was loaded. Reload the page and order it again."]
      : null,
  );
  await menuItem(page, "Foodpanda", "Remove");
  await menuItem(page, "Octopus", "Move down");
  await methodsCard(page).getByRole("button", { name: "Save", exact: true }).click();
  const alert = methodsCard(page).getByRole("alert");
  await expect(alert).toContainText("The Electronic order wasn't saved");
  await expect(alert).toContainText(
    "The list changed since it was loaded. Reload the page and order it again. The changes before it are saved; the rest are still waiting for Save.",
  );
  expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual([
    "DELETE /sales-methods/d1",
    "PUT /sales-methods/order",
  ]);
  await expect(group(page, "Delivery").getByText("No delivery methods yet.")).toBeVisible();
  await expect(methodsCard(page).getByText("Removed when you save", { exact: false })).toHaveCount(
    0,
  );
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

// --- The Xero cards (Wave 2k) -------------------------------------------------------------------

const mappingCard = (page: Page) => page.getByRole("region", { name: "Xero account mapping" });
const codesCard = (page: Page) => page.getByRole("region", { name: "Petty Cash account codes" });
const picker = (page: Page, label: string) =>
  mappingCard(page).getByRole("combobox", { name: label });
const saveOf = (card: ReturnType<typeof mappingCard>) =>
  card.getByRole("button", { name: "Save", exact: true });
const SAME =
  "The Petty Cash Account and the Deposit Bank Account can't be the same. Choose a different one for each.";
const LABELS = FIELDS.map(([, label]) => label);

/** Type into a picker and choose an option from its list. */
async function choose(page: Page, label: string, typed: string, option: string) {
  await picker(page, label).fill(typed);
  await mappingCard(page).getByRole("option", { name: option }).click();
}

test("Xero not live: one card linking through the hand-off to minty-web's Entity & Integration, where Xero is connected", async ({
  page,
}) => {
  await openWith(page, settings({ xero_connected: true }));
  const card = page.getByRole("region", { name: "Xero", exact: true });
  await expect(card).toContainText(
    "Xero isn't connected for this company. Connect it in Entity & Integration",
  );
  const link = card.getByRole("link", { name: "Connect Xero in Entity & Integration" });
  const href = new URL((await link.getAttribute("href"))!);
  expect(href.pathname).toBe("/handoff/minty-web");
  expect(href.searchParams.get("next")).toBe(
    `/entity/${companyRef(ENTITY, NAME)}/settings/integration`,
  );
  expect(href.searchParams.get("entity_id")).toBe(ENTITY);
  await expect(link).not.toHaveAttribute("target", /.+/);
  await link.click();
  await expect(page).toHaveURL(/\/handoff\/minty-web\?/);
  await expect(page.getByText("minty-web hand-off")).toBeVisible();
});

test("Xero live: the mapping's eight choices in Flask's order with the saved ones, the codes ticked, read once", async ({
  page,
}) => {
  const calls = await openWith(page, settings({ xero_connected: true }), undefined, xeroRead());
  // the order on the page: Country, the mapping, the sales methods, the codes (Flask's)
  await expect(page.getByRole("main").getByRole("heading", { level: 2 })).toHaveText([
    "Country & currency",
    "Xero account mapping",
    "Sales methods",
    "Petty Cash account codes",
  ]);
  await expect(mappingCard(page)).toContainText("Xero organisation: E2E Demo Org");
  await expect(mappingCard(page).getByRole("combobox")).toHaveCount(8);
  for (const [i, label] of LABELS.entries()) {
    const box = mappingCard(page).getByRole("combobox").nth(i);
    await expect(box).toHaveAccessibleName(`${label} (required)`);
    await expect(box).toHaveAttribute("aria-required", "true");
  }
  await expect(picker(page, "Petty Cash Account")).toHaveValue("091 — Petty Cash");
  await expect(picker(page, "Deposit Bank Account")).toHaveValue("HSBC Current");
  await expect(picker(page, "Cash Sales account code")).toHaveValue("200 — Sales");
  await expect(picker(page, "Director / Responsible person")).toHaveValue("Olive Tan");
  await expect(mappingCard(page).getByText("Not set up yet")).toHaveCount(0);
  const codes = codesCard(page).getByRole("checkbox");
  await expect(codes).toHaveCount(4);
  await expect(
    codesCard(page).getByRole("checkbox", { name: "429 — General Expenses" }),
  ).toBeChecked();
  await expect(
    codesCard(page).getByRole("checkbox", { name: "400 — Advertising" }),
  ).not.toBeChecked();
  await expect(codesCard(page).getByText("1 of 3 picked")).toBeVisible();
  for (const card of [mappingCard(page), codesCard(page)]) {
    await expect(saveOf(card)).toBeDisabled();
    await expect(saveOf(card)).toHaveAccessibleDescription("No changes to save yet.");
  }
  // the list opens with every option, the saved one marked
  await picker(page, "Petty Cash Account").click();
  await expect(mappingCard(page).getByRole("option")).toHaveCount(2);
  await expect(mappingCard(page).getByRole("option", { name: "091 — Petty Cash" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await page.keyboard.press("Escape");
  await expect(mappingCard(page).getByRole("listbox")).toHaveCount(0);
  expect(xeroReads).toBe(1);
  expect(calls).toEqual([]);
  await expectNoHorizontalScroll(page);
});

test("the mapping: a choice by typing, by keyboard and from the list, then Save sends the eight ids, with a toast", async ({
  page,
}) => {
  const calls = await openWith(page, settings({ xero_connected: true }), undefined, xeroRead());
  // narrowed by code as typed, chosen with the keyboard
  await picker(page, "Discrepancy account code").fill("42");
  await expect(mappingCard(page).getByRole("option")).toHaveText([/429 — General Expenses$/]);
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(picker(page, "Discrepancy account code")).toHaveValue("429 — General Expenses");
  // by name, from the list
  await choose(page, "Cash Sales contact", "oli", "Olive Tan");
  // typed in full and left: that option
  await picker(page, "Director Personal Account code").fill("director loan");
  await picker(page, "Director Personal Account code").press("Tab");
  await expect(picker(page, "Director Personal Account code")).toHaveValue("881 — Director Loan");
  await expect(saveOf(mappingCard(page))).toBeEnabled();
  await saveOf(mappingCard(page)).click();
  await expect(toast(page)).toContainText("Xero account mapping saved.");
  await expect(toast(page)).not.toContainText("can be published");
  expect(calls).toEqual([
    {
      method: "PUT",
      path: "/settings/xero/mapping",
      body: {
        ...SAVED_IDS,
        discrepancy_account: "a-429",
        cashsale_contact: "c-olive",
        owners_account: "a-881",
      },
    },
  ]);
  // the Discrepancy Bank Account is the API's: never sent
  expect(Object.keys(calls[0].body!)).not.toContain("discrepancy_bank");
  await expect(saveOf(mappingCard(page))).toHaveAccessibleDescription("No changes to save yet.");
  await expect(picker(page, "Cash Sales contact")).toHaveValue("Olive Tan");
});

test("the mapping is checked as typed: the same bank at once, a name not in the list when left, an emptied choice at once", async ({
  page,
}) => {
  const calls = await openWith(page, settings({ xero_connected: true }), undefined, xeroRead());
  await choose(page, "Deposit Bank Account", "petty", "091 — Petty Cash");
  await expect(picker(page, "Deposit Bank Account")).toHaveAccessibleDescription(SAME);
  await expect(picker(page, "Deposit Bank Account")).toHaveAttribute("aria-invalid", "true");
  await expect(picker(page, "Petty Cash Account")).not.toHaveAttribute("aria-invalid", "true");

  // not finished yet: said once the field is left
  await picker(page, "Director / Responsible person").fill("Nobody");
  await expect(picker(page, "Director / Responsible person")).not.toHaveAttribute(
    "aria-invalid",
    "true",
  );
  await picker(page, "Director / Responsible person").press("Tab");
  await expect(picker(page, "Director / Responsible person")).toHaveAccessibleDescription(
    "Nobody isn't in the list. Choose the Director / Responsible person from the list.",
  );

  // a saved choice emptied: at once
  await picker(page, "Cash Sales account code").fill("");
  await expect(picker(page, "Cash Sales account code")).toHaveAccessibleDescription(
    "The Cash Sales account code is still empty. Choose one from the list to save.",
  );

  // Save: three problems, the summary takes the focus and links to each; nothing is sent
  await saveOf(mappingCard(page)).click();
  const summary = mappingCard(page).getByRole("alert").filter({ hasText: "3 details need a look" });
  await expect(summary).toBeFocused();
  await expect(summary.getByRole("link")).toHaveText([
    SAME,
    "The Cash Sales account code is still empty. Choose one from the list to save.",
    "Nobody isn't in the list. Choose the Director / Responsible person from the list.",
  ]);
  await summary.getByRole("link").first().click();
  await expect(picker(page, "Deposit Bank Account")).toBeFocused();
  expect(calls).toEqual([]);

  // fixed: the messages clear as the choices are made
  await choose(page, "Deposit Bank Account", "hsbc", "HSBC Current");
  await expect(picker(page, "Deposit Bank Account")).not.toHaveAttribute("aria-invalid", "true");
  await choose(page, "Director / Responsible person", "cash", "Cash Customer");
  await choose(page, "Cash Sales account code", "260", "260 — Other Revenue");
  await expect(summary).toHaveCount(0);
});

test("first use: nothing saved yet - a refused Save names each empty choice, then the first save says what it unlocks", async ({
  page,
}) => {
  const calls = await openWith(
    page,
    settings({ xero_connected: true }),
    undefined,
    xeroRead(false),
  );
  await expect(mappingCard(page).getByText("Not set up yet")).toBeVisible();
  await expect(mappingCard(page)).toContainText(
    "Daily Reports can be published to Xero once these choices are saved.",
  );
  // the red * from the start, and no field red before a Save
  await expect(mappingCard(page).locator('[aria-invalid="true"]')).toHaveCount(0);
  await expect(saveOf(mappingCard(page))).toHaveAccessibleDescription("No changes to save yet.");

  await choose(page, "Petty Cash Account", "petty", "091 — Petty Cash");
  await saveOf(mappingCard(page)).click();
  const summary = mappingCard(page).getByRole("alert").filter({ hasText: "7 details need a look" });
  await expect(summary).toBeFocused();
  await expect(summary.getByRole("link").first()).toHaveText(
    "The Deposit Bank Account is still empty. Choose one from the list to save.",
  );
  await expect(mappingCard(page).locator('input[aria-invalid="true"]')).toHaveCount(7);

  for (const [label, typed, option] of [
    ["Deposit Bank Account", "hsbc", "HSBC Current"],
    ["Cash Sales account code", "200", "200 — Sales"],
    ["Cash Sales contact", "cash", "Cash Customer"],
    ["Director Personal Account code", "880", "880 — Owner Funds Introduced"],
    ["Director / Responsible person", "olive", "Olive Tan"],
    ["Discrepancy account code", "480", "480 — Cash Discrepancy"],
  ]) {
    await choose(page, label, typed, option);
  }
  // one problem left: Save moves the focus to it (no summary)
  await saveOf(mappingCard(page)).click();
  await expect(picker(page, "Discrepancy contact")).toBeFocused();
  await expect(
    mappingCard(page).getByRole("alert").filter({ hasText: "details need a look" }),
  ).toHaveCount(0);
  expect(calls).toEqual([]);

  await choose(page, "Discrepancy contact", "olive", "Olive Tan");
  await saveOf(mappingCard(page)).click();
  await expect(toast(page)).toContainText(
    "Xero account mapping saved. Daily Reports can be published to Xero now.",
  );
  await expect(mappingCard(page).getByText("Not set up yet")).toHaveCount(0);
  expect(calls).toHaveLength(1);
  expect(calls[0].body).toEqual(SAVED_IDS);
});

test("the mapping: each refusal from the API is said in the card, never a toast, and the choices stay", async ({
  page,
}) => {
  let refusal: [number, string] = [422, ""];
  const calls = await openWith(
    page,
    settings({ xero_connected: true }),
    (call) => (call.path === "/settings/xero/mapping" ? refusal : null),
    xeroRead(),
  );
  await choose(page, "Cash Sales contact", "olive", "Olive Tan");
  const refusals: [number, string][] = [
    [422, "Choose the Cash Sales contact."],
    [422, SAME],
    [422, "Choose the Cash Sales contact from the list."],
    [
      409,
      "Some choices haven't synced from Xero yet: Cash Sales contact (c-olive). Try again once the Xero sync has finished.",
    ],
    [409, "Xero isn't connected for this company. Connect it in the company's settings first."],
    [403, "Only Accountants and Admins can change these."],
  ];
  for (const [i, r] of refusals.entries()) {
    refusal = r;
    await saveOf(mappingCard(page)).click();
    await expect(mappingCard(page).getByRole("alert").filter({ hasText: r[1] })).toHaveAttribute(
      "data-tone",
      "danger",
    );
    expect(calls).toHaveLength(i + 1);
    await expect(picker(page, "Cash Sales contact")).toHaveValue("Olive Tan");
    await expect(saveOf(mappingCard(page))).toBeEnabled();
  }
  await expect(toast(page)).toHaveCount(0);
  // a new choice clears the old refusal
  await choose(page, "Cash Sales contact", "cash", "Cash Customer");
  await expect(mappingCard(page).getByRole("alert")).toHaveCount(0);
});

test("adding a contact: offered when no contact has the name, made with POST /suppliers, then chosen and offered everywhere", async ({
  page,
}) => {
  let refuseContact = true;
  const calls = await openWith(
    page,
    settings({ xero_connected: true }),
    (call) =>
      call.path === "/suppliers" && refuseContact
        ? [403, "You do not have permission to create contacts for this entity."]
        : null,
    xeroRead(),
  );
  // a name a contact has (any case, extra spaces): no Add
  await picker(page, "Cash Sales contact").fill("  olive   tan ");
  await expect(mappingCard(page).getByRole("option", { name: /as a new contact/ })).toHaveCount(0);
  // the account fields never offer it
  await picker(page, "Cash Sales account code").fill("Walk-in");
  await expect(mappingCard(page).getByRole("option", { name: /as a new contact/ })).toHaveCount(0);
  await picker(page, "Cash Sales account code").fill("200 — Sales");
  await picker(page, "Cash Sales account code").press("Tab");

  await picker(page, "Cash Sales contact").fill("Walk-in Customer");
  await mappingCard(page)
    .getByRole("option", { name: "Add “Walk-in Customer” as a new contact" })
    .click();
  const panel = mappingCard(page).getByRole("group", { name: "New contact" });
  const name = panel.getByRole("textbox", { name: "Contact's name" });
  await expect(name).toBeFocused();
  await expect(name).toHaveValue("Walk-in Customer");
  // checked as typed
  await name.fill("olive tan");
  await expect(name).toHaveAccessibleDescription(
    "Olive Tan is already a contact. Choose it from the list.",
  );
  await name.fill("");
  await panel.getByRole("button", { name: "Add contact" }).click();
  await expect(name).toHaveAccessibleDescription(
    "The contact's name is still empty. Add the name to continue.",
  );
  expect(calls).toEqual([]);
  // refused by the API: said in the panel
  await name.fill("Walk-in Customer");
  await panel.getByRole("button", { name: "Add contact" }).click();
  await expect(panel.getByRole("alert")).toContainText(
    "You do not have permission to create contacts for this entity.",
  );
  refuseContact = false;
  await name.press("Enter");

  await expect(panel).toHaveCount(0);
  await expect(picker(page, "Cash Sales contact")).toHaveValue("Walk-in Customer");
  await expect(picker(page, "Cash Sales contact")).toBeFocused();
  expect(calls.map((c) => c.body)).toEqual([
    { name: "Walk-in Customer" },
    { name: "Walk-in Customer" },
  ]);
  // offered in the other contact fields too
  await picker(page, "Discrepancy contact").fill("walk");
  await expect(mappingCard(page).getByRole("option", { name: "Walk-in Customer" })).toBeVisible();
  await page.keyboard.press("Escape");
  await picker(page, "Discrepancy contact").fill("Olive Tan");
  await picker(page, "Discrepancy contact").press("Tab");

  await saveOf(mappingCard(page)).click();
  await expect(toast(page)).toContainText("Xero account mapping saved.");
  expect(calls.at(-1)).toEqual({
    method: "PUT",
    path: "/settings/xero/mapping",
    body: { ...SAVED_IDS, cashsale_contact: "c-new1" },
  });
  await expect(picker(page, "Cash Sales contact")).toHaveValue("Walk-in Customer");
});

test("the account codes: tick, search and Select all, then Save sends the ticked codes, with a toast", async ({
  page,
}) => {
  const calls = await openWith(page, settings({ xero_connected: true }), undefined, xeroRead());
  const card = codesCard(page);
  await card.getByRole("checkbox", { name: "400 — Advertising" }).check();
  await expect(card.getByText("2 of 3 picked")).toBeVisible();
  await card.getByRole("searchbox", { name: "Search account codes" }).fill("office");
  await expect(card.getByRole("checkbox")).toHaveCount(2);
  await card.getByRole("checkbox", { name: "Select all shown" }).check();
  await card.getByRole("searchbox", { name: "Search account codes" }).fill("");
  await expect(card.getByRole("checkbox", { name: "Select all" })).toBeChecked();
  await card.getByRole("searchbox", { name: "Search account codes" }).fill("zzz");
  await expect(card.getByText("No code matches that search.")).toBeVisible();
  await card.getByRole("searchbox", { name: "Search account codes" }).fill("");
  // unsaved: leaving asks first
  await page.getByRole("main").getByRole("link", { name: "Petty Cash" }).click();
  await page
    .getByRole("alertdialog", { name: "Leave without saving?" })
    .getByRole("button", { name: "Go Back" })
    .click();

  await saveOf(card).click();
  await expect(toast(page)).toContainText("Account codes saved.");
  expect(calls).toEqual([
    { method: "PUT", path: "/settings/xero/account-codes", body: { codes: ["400", "429", "453"] } },
  ]);
  await expect(saveOf(card)).toHaveAccessibleDescription("No changes to save yet.");
});

test("the account codes: at least one stays picked - said beside the gated Save as it happens", async ({
  page,
}) => {
  const calls = await openWith(
    page,
    settings({ xero_connected: true }),
    (call) =>
      call.path === "/settings/xero/account-codes"
        ? [422, "Pick at least one account code."]
        : null,
    xeroRead(),
  );
  const card = codesCard(page);
  const rule =
    "No account code is picked. Pick at least one to save: an expense can use only the picked codes.";
  await card.getByRole("checkbox", { name: "429 — General Expenses" }).uncheck();
  await expect(saveOf(card)).toBeDisabled();
  await expect(saveOf(card)).toHaveAccessibleDescription(rule);
  await expect(card.getByText(rule)).toBeVisible();
  await card.getByRole("checkbox", { name: "Select all" }).check();
  await card.getByRole("checkbox", { name: "Select all" }).uncheck();
  await expect(saveOf(card)).toHaveAccessibleDescription(rule);
  await card.getByRole("checkbox", { name: "453 — Office Expenses" }).check();
  await expect(saveOf(card)).toBeEnabled();
  await expect(card.getByText(rule)).toHaveCount(0);
  // the API's own 422, should it disagree: inline, never a toast
  await saveOf(card).click();
  await expect(card.getByRole("alert")).toContainText("Pick at least one account code.");
  await expect(toast(page)).toHaveCount(0);
  expect(calls).toEqual([
    { method: "PUT", path: "/settings/xero/account-codes", body: { codes: ["453"] } },
  ]);
});

test("a cashier sees the Xero cards read-only, each Save with its reason", async ({ page }) => {
  const calls = await openWith(
    page,
    settings({ permissions: CASHIER, xero_connected: true }),
    undefined,
    xeroRead(true, { permissions: { edit_mapping: false, edit_account_codes: false } }),
  );
  await expect(mappingCard(page).getByRole("combobox")).toHaveCount(0);
  await expect(mappingCard(page).getByRole("definition")).toHaveText([
    "091 — Petty Cash",
    "HSBC Current",
    "200 — Sales",
    "Cash Customer",
    "880 — Owner Funds Introduced",
    "Olive Tan",
    "480 — Cash Discrepancy",
    "Olive Tan",
  ]);
  await expect(codesCard(page).getByRole("checkbox")).toHaveCount(0);
  await expect(
    codesCard(page).getByRole("list", { name: "Picked account codes" }).getByRole("listitem"),
  ).toHaveText([/429 — General Expenses$/]);
  for (const card of [mappingCard(page), codesCard(page)]) {
    await expect(saveOf(card)).toBeDisabled();
    await expect(saveOf(card)).toHaveAccessibleDescription(
      "Only Accountants and Admins can change these.",
    );
  }
  expect(calls).toEqual([]);
});

test("a role that can't see the Xero settings is told so, and the other cards still work", async ({
  page,
}) => {
  await openWith(page, settings({ xero_connected: true }), undefined, [
    403,
    "You don't have permission to see these settings.",
  ]);
  await expect(page.getByRole("region", { name: "Xero", exact: true })).toContainText(
    "Your role can't see the Xero settings. Ask an Accountant or an Admin.",
  );
  await expect(countryCard(page).getByLabel("Country")).toHaveValue("HK");
});

test("unsaved changes ask before the page is left", async ({ page }) => {
  await openWith(page);
  await menuItem(page, "Visa", "Remove");
  await page.getByRole("main").getByRole("link", { name: "Petty Cash" }).click();
  const dialog = page.getByRole("alertdialog", { name: "Leave without saving?" });
  await expect(dialog.getByRole("button", { name: "Go Back" })).toBeFocused();
  await dialog.getByRole("button", { name: "Go Back" }).click();
  await expect(page).toHaveURL(exact(SETTINGS));
  await expect(
    methodsCard(page).getByText("Removed when you save: Visa.", { exact: false }),
  ).toBeVisible();
});

test("the sidebar's Settings opens this page, and its way back is the launch page", async ({
  page,
}) => {
  await stub(page, settings());
  await page.route("**/api/petty-cash/v1/companies/*/home", (route) =>
    route.fulfill({
      json: {
        server_today: "2026-10-14",
        user_count: 1,
        currency_code: "HKD",
        latest: {
          date: "2026-10-13",
          closing_balance: 760,
          deposit: 0,
          deposit_bank_name: "No deposit",
          deposit_bank_number: "",
          deposit_correction_missing_settings: [],
          can_correct_deposit: true,
          submitter_first_name: "Olive",
        },
        draft: null,
        draft_date: null,
        published: {},
        today_has_report: false,
        today_is_latest_report: true,
        xero_settings: { complete: true, missing: [] },
        permissions: { read_only: false, correct_deposit: true },
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
  await expect(page.getByRole("link", { name: "Settings", exact: true })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await page.keyboard.press("Escape");
  await page.getByRole("main").getByRole("link", { name: "Petty Cash" }).click();
  await expect(page).toHaveURL(exact(HOME));
});

test("long names are never clipped, and the page never scrolls sideways", async ({ page }) => {
  const long = "A delivery platform with a very long trading name Limited Hong Kong Branch Office";
  const xero = xeroRead();
  xero.mapping![0].options = [{ id: "b-pc", name: `${long} Petty Cash`, code: "091" }, BANKS[1]];
  await openWith(
    page,
    settings({
      sales_methods: { electronic: [m("e1", "x".repeat(100))], delivery: [m("d1", long)] },
      xero_connected: true,
    }),
    undefined,
    xero,
  );
  await page.evaluate(() => document.fonts.ready);
  const clipped = await page.evaluate(() =>
    Array.from(
      document.querySelectorAll(
        "main p, main span, main a, main button, main label, main h2, main h3",
      ),
    )
      // (the screen-reader-only "(required)" is 1px wide by design)
      .filter(
        (el) =>
          !el.classList.contains("sr-only") &&
          el.scrollWidth > el.clientWidth + 1 &&
          getComputedStyle(el).overflowX !== "auto",
      )
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

// --- the settings pills (the owner, 2026-10-19: "like the rest of the settings") ---------------

const pills = (page: Page) => page.getByRole("navigation", { name: "Settings sections" });

test("the settings pills: every section in the other apps' order, this page current, the rest through their hand-offs", async ({
  page,
}) => {
  await openWith(page);
  const nav = pills(page);
  await expect(nav.locator("a, span[aria-current]")).toHaveText([
    "Users",
    "Entity & Integration",
    "Petty Cash Settings",
    "Payment Request Settings",
    "Modules",
  ]);
  await expect(nav.getByText("Petty Cash Settings")).toHaveAttribute("aria-current", "page");
  await expect(nav.getByRole("link", { name: "Petty Cash Settings" })).toHaveCount(0);

  const next = async (name: string) =>
    new URL((await nav.getByRole("link", { name }).getAttribute("href")) ?? "").searchParams.get(
      "next",
    );
  const company = companyRef(ENTITY, NAME);
  expect(await next("Users")).toBe(`/entity/${company}/settings/users`);
  expect(await next("Entity & Integration")).toBe(`/entity/${company}/settings/integration`);
  expect(await next("Modules")).toBe(`/entity/${company}/settings/modules`);
  const payments = new URL(
    (await nav.getByRole("link", { name: "Payment Request Settings" }).getAttribute("href")) ?? "",
  );
  expect(payments.pathname).toBe(`/entity/${ENTITY}/settings/payment-request`);
  for (const href of await nav
    .getByRole("link")
    .evaluateAll((links) => links.map((a) => a.getAttribute("href") ?? ""))) {
    expect(new URL(href).searchParams.has("token")).toBe(false);
  }
});

test("the settings pills leave Payment Request Settings out when the company doesn't have that module", async ({
  page,
}) => {
  await stub(page, settings());
  const token = mintModuleToken(
    { secret: "stub", userId: "u", entityId: ENTITY, entityName: NAME },
    { billing_enabled: false },
  );
  await page.goto(
    `/landing?${new URLSearchParams({ token, entity_id: ENTITY, entity_name: NAME, next: SETTINGS })}`,
  );
  await expect(page.getByRole("heading", { level: 1, name: "Petty Cash settings" })).toBeVisible();
  await expect(pills(page).locator("a, span[aria-current]")).toHaveText([
    "Users",
    "Entity & Integration",
    "Petty Cash Settings",
    "Modules",
  ]);
});

test("the settings pills wrap on a phone: no sideways scroll, every pill a 44px target", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await openWith(page);
  await expectNoHorizontalScroll(page);
  for (const box of await pills(page)
    .locator("a, span[aria-current]")
    .evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height))) {
    expect(box).toBeGreaterThanOrEqual(44);
  }
});
