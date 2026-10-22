/**
 * Petty Cash settings - the parts that need no Xero (Part 15.20 / 15.20b, one Save per card): the
 * rules of `components/settings/PettyCashSettings.tsx`. It reads `GET /settings` and writes through
 * `PUT /settings/country` and the sales-method routes (Minty `petty_cash_api/routes/settings.py`).
 *
 * The sales methods keep every change - add, rename, remove, move - on the page until the card's
 * Save, as Flask's page does (`static/js/petty_cash_settings.js`). The API takes one change per
 * call, so Save sends them one by one: removals, additions, renames, then each list's order. It
 * stops at the first refusal; what went through is kept and the rest stays waiting for Save.
 */

export const METHOD_TYPES = ["electronic", "delivery"] as const;
export type MethodType = (typeof METHOD_TYPES)[number];

/** The API's limit on a method's name (`NAME_MAX`). */
export const NAME_MAX = 100;

export const TYPE_LABEL: Record<MethodType, string> = { electronic: "Electronic", delivery: "Delivery" };

/** `shared`: another company has the same catalogue method, so the API refuses to rename it (409). */
export type SalesMethod = { id: string; name: string; value_name: string; shared: boolean };
export type CatalogueMethod = { id: string; name: string };

export type SettingsPermissions = {
  edit_country: boolean;
  view_sales_methods: boolean;
  add_sales_method: boolean;
  rename_sales_method: boolean;
  remove_sales_method: boolean;
  reorder_sales_methods: boolean;
};

/** `GET /settings`. */
export type Settings = {
  country: {
    country_code: string | null;
    currency_id: string | null;
    countries: { code: string; name: string }[];
    currencies: { id: string; name: string }[];
    selected_country: string | null;
    selected_currency: string | null;
  };
  sales_methods: Record<MethodType, SalesMethod[]>;
  available: Record<MethodType, CatalogueMethod[]>;
  xero_connected: boolean;
  permissions: SettingsPermissions;
};

/** Every write answers the whole read again, plus the sentence to confirm it with. */
export type SettingsAnswer = Settings & { message: string };

const fold = (name: string) => name.trim().toLowerCase();

// --- Country & currency ---------------------------------------------------------------------

/**
 * What the two pickers hold. `currency` "" after a country change means "the country's own" -
 * the API brings it when only the country is sent.
 */
export type CountryChoice = { country: string; currency: string };

export function countryChoiceOf(settings: Settings): CountryChoice {
  return { country: settings.country.country_code ?? "", currency: settings.country.currency_id ?? "" };
}

/**
 * A new country: the currency goes back to "the country's own" until one is chosen. Back to the
 * saved country is the saved pair again.
 */
export function chooseCountry(settings: Settings, country: string): CountryChoice {
  const saved = countryChoiceOf(settings);
  return country === saved.country ? saved : { country, currency: "" };
}

/**
 * The body for `PUT /settings/country`: only what changed, or null when nothing did. A country
 * alone brings its currency; a currency chosen too wins (the API's rule).
 */
export function countryBody(settings: Settings, choice: CountryChoice): { country_code?: string; currency_id?: string } | null {
  const saved = countryChoiceOf(settings);
  const body: { country_code?: string; currency_id?: string } = {};
  if (choice.country && choice.country !== saved.country) body.country_code = choice.country;
  if (choice.currency && choice.currency !== saved.currency) body.currency_id = choice.currency;
  return Object.keys(body).length ? body : null;
}

// --- Sales methods: the list as it stands on the page ----------------------------------------

/** A method on the page: saved (`id`), or added and not saved yet (`id` null). */
export type DraftRow = {
  key: string;
  id: string | null;
  name: string;
  /** The name the API has; null for a method not saved yet. */
  savedName: string | null;
  /** The catalogue method an addition picks (`sale_info_id`); null for a new name. */
  catalogueId: string | null;
  /** Another company uses it too: it can't be renamed here (`shared` in the read). */
  shared: boolean;
};

export type Removed = { id: string; name: string; type: MethodType; shared: boolean };

export type Draft = { lists: Record<MethodType, DraftRow[]>; removed: Removed[] };

let seq = 0;

export function draftOf(settings: Settings): Draft {
  const lists = {} as Record<MethodType, DraftRow[]>;
  for (const type of METHOD_TYPES) {
    lists[type] = settings.sales_methods[type].map((m) => ({ key: m.id, id: m.id, name: m.name, savedName: m.name, catalogueId: null, shared: m.shared }));
  }
  return { lists, removed: [] };
}

function withList(draft: Draft, type: MethodType, list: DraftRow[]): Draft {
  return { ...draft, lists: { ...draft.lists, [type]: list } };
}

/** The catalogue method a name picks (any case), if any. */
function catalogueMatch(available: CatalogueMethod[], name: string): CatalogueMethod | null {
  return available.find((m) => fold(m.name) === fold(name)) ?? null;
}

/**
 * Add `name` to `type`'s list, at its end. A name the catalogue has is that catalogue method (its
 * own spelling); a method removed on this page and not saved yet comes back as it was.
 */
export function addMethod(draft: Draft, type: MethodType, name: string, available: CatalogueMethod[]): Draft {
  const gone = draft.removed.find((r) => r.type === type && fold(r.name) === fold(name));
  if (gone) {
    const back: DraftRow = { key: gone.id, id: gone.id, name: gone.name, savedName: gone.name, catalogueId: null, shared: gone.shared };
    return { lists: { ...draft.lists, [type]: [...draft.lists[type], back] }, removed: draft.removed.filter((r) => r !== gone) };
  }
  const match = catalogueMatch(available, name);
  seq += 1;
  const row: DraftRow = { key: `new-${seq}`, id: null, name: match?.name ?? name.trim(), savedName: null, catalogueId: match?.id ?? null, shared: false };
  return withList(draft, type, [...draft.lists[type], row]);
}

/** A new name for a method on the page. One not saved yet picks the catalogue method again, if any. */
export function renameMethod(draft: Draft, type: MethodType, key: string, name: string, available: CatalogueMethod[]): Draft {
  return withList(
    draft,
    type,
    draft.lists[type].map((row) => {
      if (row.key !== key) return row;
      if (row.id) return { ...row, name: name.trim() };
      const match = catalogueMatch(available, name);
      return { ...row, name: match?.name ?? name.trim(), catalogueId: match?.id ?? null };
    }),
  );
}

/** Take a method off the list: a saved one is switched off on Save; one not saved yet just goes. */
export function removeMethod(draft: Draft, type: MethodType, key: string): Draft {
  const row = draft.lists[type].find((r) => r.key === key);
  if (!row) return draft;
  const next = withList(draft, type, draft.lists[type].filter((r) => r !== row));
  return row.id ? { ...next, removed: [...draft.removed, { id: row.id, name: row.savedName ?? row.name, type, shared: row.shared }] } : next;
}

/** Move a method one place up (-1) or down (+1); nothing at either end. */
export function moveMethod(draft: Draft, type: MethodType, key: string, step: -1 | 1): Draft {
  const list = [...draft.lists[type]];
  const at = list.findIndex((r) => r.key === key);
  const to = at + step;
  if (at < 0 || to < 0 || to >= list.length) return draft;
  [list[at], list[to]] = [list[to], list[at]];
  return withList(draft, type, list);
}

/** "Visa moved to 2 of 4." - said after a move, so a screen reader hears where it went. */
export function movedText(draft: Draft, type: MethodType, key: string): string {
  const list = draft.lists[type];
  const at = list.findIndex((r) => r.key === key);
  return at < 0 ? "" : `${list[at].name} moved to ${at + 1} of ${list.length}.`;
}

/** Whether a row shows "Not saved yet": an addition, or a new name. */
export function isPending(row: DraftRow): boolean {
  return row.id === null || row.name !== row.savedName;
}

const EMPTY = {
  add: "The method's name is still empty. Choose a method or type a new name to add it.",
  rename: "The method's name is still empty. Type its new name to save it.",
} as const;

/**
 * What is wrong with a name, as it is typed (CLAUDE.md): over 100 characters, or already on the
 * list (any case - the API's 409), at once; empty only after a refused Add or Rename (`attempted`).
 * `except` is the row being renamed: a method other companies use too (`shared`) can't take a new
 * name at all, said as soon as the name differs from its saved one (the API's 409).
 */
export function nameProblem(
  name: string,
  { draft, type, purpose, attempted, except }: { draft: Draft; type: MethodType; purpose: "add" | "rename"; attempted: boolean; except?: string },
): string | null {
  const t = name.trim();
  if (!t) return attempted ? EMPTY[purpose] : null;
  const renamed = except ? draft.lists[type].find((r) => r.key === except) : undefined;
  if (renamed?.shared && renamed.savedName !== null && t !== renamed.savedName) {
    return `Other companies use ${renamed.savedName} too, so it can't be renamed here. Remove it and add a new method instead.`;
  }
  if (t.length > NAME_MAX) return `The name is ${t.length} characters. Shorten it to ${NAME_MAX} characters or fewer.`;
  if (draft.lists[type].some((r) => r.key !== except && fold(r.name) === fold(t))) return `${t} is already on the list. Type another name.`;
  return null;
}

/**
 * The catalogue methods to offer for `type` as `query` is typed: those not on the list, plus any
 * removed on this page and not saved yet (adding one back undoes the removal), narrowed by the
 * query (any case, anywhere in the name), A to Z.
 */
export function catalogueOptions(draft: Draft, type: MethodType, available: CatalogueMethod[], query: string): CatalogueMethod[] {
  const listed = new Set(draft.lists[type].map((r) => fold(r.name)));
  const q = fold(query);
  const pool = [...available, ...draft.removed.filter((r) => r.type === type).map((r) => ({ id: r.id, name: r.name }))];
  const seen = new Set<string>();
  return pool
    .filter((m) => {
      const k = fold(m.name);
      if (listed.has(k) || seen.has(k)) return false;
      seen.add(k);
      return !q || k.includes(q);
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

// --- Saving the sales methods ----------------------------------------------------------------

export type MethodOp =
  | { kind: "remove"; type: MethodType; id: string; name: string }
  | { kind: "add"; type: MethodType; key: string; name: string; catalogueId: string | null }
  | { kind: "rename"; type: MethodType; key: string; id: string; from: string; name: string }
  | { kind: "order"; type: MethodType };

/**
 * The changes waiting for Save, in the order they are sent: removals, additions, renames, then
 * the order of each list whose order the page changed. The saved order of a list after its
 * removals and additions is its saved methods still on it, then the additions, in page order.
 */
export function pendingOps(draft: Draft, settings: Settings): MethodOp[] {
  const ops: MethodOp[] = draft.removed.map((r) => ({ kind: "remove", type: r.type, id: r.id, name: r.name }));
  for (const type of METHOD_TYPES) {
    for (const row of draft.lists[type]) {
      if (!row.id) ops.push({ kind: "add", type, key: row.key, name: row.name, catalogueId: row.catalogueId });
    }
  }
  for (const type of METHOD_TYPES) {
    for (const row of draft.lists[type]) {
      if (row.id && row.savedName !== null && row.name !== row.savedName) ops.push({ kind: "rename", type, key: row.key, id: row.id, from: row.savedName, name: row.name });
    }
  }
  for (const type of METHOD_TYPES) {
    const list = draft.lists[type];
    const onPage = new Set(list.map((r) => r.id).filter(Boolean));
    const expected = [
      ...settings.sales_methods[type].filter((m) => onPage.has(m.id)).map((m) => m.id),
      ...list.filter((r) => !r.id).map((r) => r.key),
    ];
    const shown = list.map((r) => r.id ?? r.key);
    if (shown.join("\n") !== expected.join("\n")) ops.push({ kind: "order", type });
  }
  return ops;
}

/** One call to the API: the path under the company, the method, the JSON body. */
export type MethodCall = (path: string, init: { method: "POST" | "PUT" | "DELETE"; body?: unknown }) => Promise<SettingsAnswer>;

export type SaveOutcome = {
  /** The newest answer (the read the page shows now). */
  settings: Settings;
  /** The page's list: everything saved, or - after a refusal - what is still waiting. */
  draft: Draft;
  /** The sentence for the toast when everything went through; null otherwise. */
  message: string | null;
  /** The refusal that stopped the save: what was not saved, and the API's sentence. */
  failure: { what: string; error: unknown } | null;
  /** How many changes went through before it. */
  sent: number;
};

function whatOf(op: MethodOp): string {
  switch (op.kind) {
    case "remove":
      return `${op.name} wasn't removed`;
    case "add":
      return `${op.name} wasn't added`;
    case "rename":
      return `${op.from} wasn't renamed`;
    case "order":
      return `The ${TYPE_LABEL[op.type]} order wasn't saved`;
  }
}

/** After an answer: the row an addition became, by name, among the ids no other row holds. */
function placeAdded(draft: Draft, type: MethodType, key: string, answer: Settings): Draft {
  const held = new Set(draft.lists[type].map((r) => r.id).filter(Boolean));
  return withList(
    draft,
    type,
    draft.lists[type].map((row) => {
      if (row.key !== key) return row;
      const saved = answer.sales_methods[type].find((m) => !held.has(m.id) && fold(m.name) === fold(row.name));
      return saved ? { ...row, id: saved.id, name: saved.name, savedName: saved.name, catalogueId: null, shared: saved.shared } : row;
    }),
  );
}

/**
 * Save the sales methods card: each waiting change through its own call, stopping at the first
 * refusal. A list whose order the page set is put in that order once its additions have ids -
 * also when the API placed an addition elsewhere - but only for someone who may reorder.
 */
export async function saveMethods(draft: Draft, settings: Settings, call: MethodCall): Promise<SaveOutcome> {
  const ops = pendingOps(draft, settings);
  let current = settings;
  let page = draft;
  let last: string | null = null;
  let sent = 0;
  const touched = new Set<MethodType>(ops.map((op) => op.type));

  /** One call; the refusal that stops the save, or null when it went through. */
  const run = async (op: MethodOp, path: string, init: Parameters<MethodCall>[1]): Promise<SaveOutcome["failure"]> => {
    try {
      const { message, ...read } = await call(path, init);
      current = read;
      last = message;
      sent += 1;
      return null;
    } catch (error) {
      return { what: whatOf(op), error };
    }
  };

  let failure: SaveOutcome["failure"] = null;
  for (const op of ops) {
    if (op.kind === "remove") {
      failure = await run(op, `/sales-methods/${encodeURIComponent(op.id)}`, { method: "DELETE" });
      if (failure) break;
      page = { ...page, removed: page.removed.filter((r) => r.id !== op.id) };
    } else if (op.kind === "add") {
      const body = op.catalogueId ? { type: op.type, sale_info_id: op.catalogueId } : { type: op.type, name: op.name };
      failure = await run(op, "/sales-methods", { method: "POST", body });
      if (failure) break;
      page = placeAdded(page, op.type, op.key, current);
    } else if (op.kind === "rename") {
      failure = await run(op, `/sales-methods/${encodeURIComponent(op.id)}`, { method: "PUT", body: { name: op.name } });
      if (failure) break;
      page = withList(page, op.type, page.lists[op.type].map((r) => (r.key === op.key ? { ...r, savedName: r.name } : r)));
    }
  }

  if (!failure && current.permissions.reorder_sales_methods) {
    for (const type of METHOD_TYPES) {
      if (!touched.has(type)) continue;
      const wanted = page.lists[type].map((r) => r.id);
      if (wanted.some((id) => !id)) continue; // an addition the answer did not show: nothing to place
      if (wanted.join("\n") === current.sales_methods[type].map((m) => m.id).join("\n")) continue;
      failure = await run({ kind: "order", type }, "/sales-methods/order", { method: "PUT", body: { type, method_ids: wanted } });
      if (failure) break;
    }
  }

  if (failure) return { settings: current, draft: page, message: null, failure, sent };
  return { settings: current, draft: draftOf(current), message: sent === 1 ? last : sent > 1 ? "Sales methods saved." : null, failure: null, sent };
}
