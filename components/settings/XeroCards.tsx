"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";

import {
  BTN_OUTLINE,
  BTN_SOLID,
  Combo,
  FIELD_PROBLEM,
  INPUT_INVALID,
  Icon,
  LABEL,
  SAVE_BTN,
  SettingsCard,
  TEXT_INPUT,
  type ComboRow,
} from "@/components/settings/SettingsParts";
import type { ApiRequest } from "@/lib/apiClient";
import {
  CONTACT_EMPTY,
  MAPPING_GROUPS,
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
  type CodesAnswer,
  type MappingAnswer,
  type MappingField,
  type MappingKey,
  type Selection,
  type XeroOption,
  type XeroRead,
} from "@/lib/xeroSettings";

/**
 * Flask's two Xero cards on Petty Cash Settings (Minty `1c25b35^1`): "Xero account mapping"
 * (`partials/xero_account_mapping_cards_classic.html` and its script) and "Petty Cash Account Code"
 * (`static/js/petty_cash_settings.js`'s checklist). Each saves on its own: `PUT /settings/xero/mapping`
 * and `PUT /settings/xero/account-codes`. Without a live connection each keeps its heading and
 * shows Flask's "Xero isn't connected" notice.
 */

export type XeroLoad =
  | { kind: "loading" }
  | { kind: "ready"; read: XeroRead }
  | { kind: "failed"; message: string; retry: boolean };

/** One call through the page: its busy overlay and refusal toast; null when it did not go through. */
export type Call = <T>(
  path: string,
  init: ApiRequest,
  busyText?: string,
  onRefused?: (message: string) => void,
) => Promise<T | null>;

const ADD = "__add__";

/** Flask's `xero_not_connected()` notice. Connecting is on minty-web's Entity & Integration, through Flask's hand-off. */
function NotConnected({ connectHref }: { connectHref: string }) {
  return (
    <div
      role="status"
      className="flex items-start gap-2 rounded-flask-lg border border-flask-set-alert-edge bg-flask-set-alert-bg px-4 py-2.5 text-sm text-flask-set-gray-600"
    >
      <Icon name="link_off" className="text-[18px] leading-5 text-flask-set-alert-icon" />
      <span>
        Xero isn&apos;t connected. Connect it in{" "}
        <a
          href={connectHref}
          className="font-medium text-flask-set-link underline underline-offset-2"
        >
          Entity &amp; Integration
        </a>{" "}
        to set these up.
      </span>
    </div>
  );
}

/** Flask's `.pcs-skeleton`: five pulsing rows while Xero is asked. */
function Skeleton() {
  return (
    <div className="flex flex-col gap-3 py-4" aria-hidden="true">
      {Array.from({ length: 5 }, (_, i) => (
        <div key={i} className="flex animate-pulse items-center justify-between gap-3 px-3 sm:px-4">
          <span className="h-4 flex-1 rounded-flask bg-flask-gray-100" />
          <span className="h-4 w-4 shrink-0 rounded-flask bg-flask-gray-100" />
        </div>
      ))}
    </div>
  );
}

/** What a card shows before its read is ready: loading, or why it failed (with Try again when it may help). */
function NotReady({
  load,
  onRetry,
}: {
  load: Exclude<XeroLoad, { kind: "ready" }>;
  onRetry: () => void;
}) {
  if (load.kind === "loading") {
    return (
      <>
        <p className="sr-only" role="status">
          Loading…
        </p>
        <Skeleton />
      </>
    );
  }
  return (
    <div className="flex flex-col items-start gap-3" role="alert">
      <p className="m-0 text-sm text-flask-set-gray-700">{load.message}</p>
      {load.retry ? (
        <button type="button" className={BTN_OUTLINE} onClick={onRetry}>
          Try again
        </button>
      ) : null}
    </div>
  );
}

// --- the mapping ---------------------------------------------------------------------------------

export function XeroMappingCard({
  load,
  busy,
  call,
  connectHref,
  onRetry,
  onSaved,
  onAdded,
}: {
  load: XeroLoad;
  busy: boolean;
  call: Call;
  connectHref: string;
  onRetry: () => void;
  /** The API's answer to a save that went through. */
  onSaved: (answer: MappingAnswer) => void;
  /** A contact was created: Flask's success toast. */
  onAdded: (message: string) => void;
}) {
  const editable = load.kind === "ready" && load.read.permissions.edit_mapping;
  return (
    <SettingsCard
      title="Xero account mapping"
      sub="The Xero accounts and contacts a petty cash report posts to."
      readOnly={load.kind === "ready" && !editable}
      testId="xero-mapping"
    >
      {load.kind !== "ready" ? (
        <NotReady load={load} onRetry={onRetry} />
      ) : !load.read.live || !load.read.mapping ? (
        <NotConnected connectHref={connectHref} />
      ) : (
        // a new read (a save) starts the form again from what the API holds
        <MappingForm
          key={JSON.stringify(load.read.mapping)}
          fields={load.read.mapping}
          editable={editable}
          busy={busy}
          call={call}
          onSaved={onSaved}
          onAdded={onAdded}
        />
      )}
    </SettingsCard>
  );
}

function MappingForm({
  fields: initial,
  editable,
  busy,
  call,
  onSaved,
  onAdded,
}: {
  fields: MappingField[];
  editable: boolean;
  busy: boolean;
  call: Call;
  onSaved: (answer: MappingAnswer) => void;
  onAdded: (message: string) => void;
}) {
  const ids = useId();
  const idOf = (key: MappingKey) => `${ids}-${key}`;
  // the lists grow by a contact created here
  const [fields, setFields] = useState(initial);
  const [picked, setPicked] = useState<Selection>(() => selectionOf(initial));
  const labelOf = (key: MappingKey, id: string): string => {
    const option = fields.find((f) => f.key === key)?.options.find((o) => o.id === id);
    return option ? optionLabel(option) : "";
  };
  const [texts, setTexts] = useState<Record<MappingKey, string>>(() => {
    const start = selectionOf(initial);
    return Object.fromEntries(
      initial.map((f) => {
        const option = f.options.find((o) => o.id === start[f.key]);
        return [f.key, option ? optionLabel(option) : ""];
      }),
    ) as Record<MappingKey, string>;
  });
  const [refused, setRefused] = useState(false);
  // fields an API refusal named: Flask's red edge until the field is changed
  const [marked, setMarked] = useState<ReadonlySet<MappingKey>>(new Set());
  const [adding, setAdding] = useState<{
    key: MappingKey;
    name: string;
    refusedEmpty: boolean;
  } | null>(null);
  const [summary, setSummary] = useState<MappingKey[] | null>(null);
  const summaryRef = useRef<HTMLDivElement>(null);
  const problems = mappingProblems(fields, picked, refused);
  const changed = mappingChanged(initial, picked);
  const byKey = new Map(fields.map((f) => [f.key, f]));

  useEffect(() => {
    if (summary && summary.length > 1) summaryRef.current?.focus();
  }, [summary]);

  function pick(key: MappingKey, option: XeroOption) {
    setPicked((p) => ({ ...p, [key]: option.id }));
    setTexts((t) => ({ ...t, [key]: optionLabel(option) }));
    setMarked((m) => {
      const next = new Set(m);
      next.delete(key);
      return next;
    });
  }

  function rows(field: MappingField) {
    return (query: string): ComboRow[] => {
      const current = labelOf(field.key, picked[field.key]);
      if (field.kind === "account") {
        const offered = accountOptions(field, query, current, picked);
        const out: ComboRow[] = offered.map((o) => ({
          key: o.id,
          label: o.name,
          sub: o.code || undefined,
          selected: o.id === picked[field.key],
        }));
        if (!offered.length) out.push({ key: "none", label: "No matches", info: true });
        return out;
      }
      const { matches, offerNew } = contactOptions(field, query, current);
      const out: ComboRow[] = matches.map((o) => ({
        key: o.id,
        label: o.name,
        selected: o.id === picked[field.key],
      }));
      if (!matches.length) out.push({ key: "none", label: "No Xero contact found", info: true });
      if (offerNew !== null && editable) {
        out.push({
          key: ADD,
          label: offerNew ? `+ Add '${offerNew}' as a new contact` : "+ Add as a new contact",
          muted: true,
          divided: matches.length > 0,
        });
      }
      return out;
    };
  }

  async function createContact() {
    if (!adding || busy) return;
    const name = adding.name.trim();
    if (!name) {
      setAdding({ ...adding, refusedEmpty: true });
      document.getElementById(`${idOf(adding.key)}-new`)?.focus();
      return;
    }
    const made = await call<XeroOption>(
      "/suppliers",
      { method: "POST", json: { name } },
      "Creating contact…",
    );
    if (!made) return;
    const contact = { id: made.id, name: made.name };
    setFields((f) => withContact(f, contact));
    pick(adding.key, contact);
    const key = adding.key;
    setAdding(null);
    window.setTimeout(() => document.getElementById(idOf(key))?.focus(), 0);
    onAdded("That contact's added!");
  }

  async function save() {
    if (!editable || busy) return;
    const now = mappingProblems(fields, picked, true);
    const wrong = fields.map((f) => f.key).filter((k) => now[k]);
    if (wrong.length) {
      setRefused(true);
      setSummary(wrong);
      if (wrong.length === 1) document.getElementById(idOf(wrong[0]))?.focus();
      return;
    }
    setSummary(null);
    const answer = await call<MappingAnswer>(
      "/settings/xero/mapping",
      { method: "PUT", json: mappingBody(picked) },
      undefined,
      (message) => setMarked(new Set(fieldsNamed(message, fields))),
    );
    if (answer) onSaved(answer);
  }

  return (
    <form
      noValidate
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      {summary && summary.length > 1 ? (
        <div
          ref={summaryRef}
          tabIndex={-1}
          role="alert"
          className="rounded-flask-lg border border-flask-set-alert-edge bg-flask-set-alert-bg px-4 py-2.5 text-sm text-flask-set-gray-700 outline-none"
        >
          <p className="m-0 font-semibold">
            Some choices are still missing. Choose each one to save the mapping.
          </p>
          <ul className="m-0 mt-1 list-disc pl-5">
            {summary.map((key) => (
              <li key={key}>
                <a
                  href={`#${idOf(key)}`}
                  onClick={(e) => {
                    e.preventDefault();
                    document.getElementById(idOf(key))?.focus();
                  }}
                  className="text-flask-set-link underline underline-offset-2"
                >
                  {problems[key] ?? byKey.get(key)?.label}
                </a>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {MAPPING_GROUPS.map((group, gi) => (
        <div
          key={group.title}
          className={`flex flex-col gap-2 ${gi ? "border-t border-flask-gray-100 pt-4" : ""}`}
        >
          <h3 className="m-0 text-[15px] font-semibold leading-[1.375rem] text-flask-set-gray-800">
            {group.title}
          </h3>
          {group.fields.map(({ key, sub, placeholder }) => {
            const field = byKey.get(key);
            if (!field) return null;
            const id = idOf(key);
            const problem = problems[key];
            const problemId = `${id}-problem`;
            if (adding?.key === key) {
              const emptyNote = adding.refusedEmpty && !adding.name.trim() ? CONTACT_EMPTY : null;
              return (
                <div key={key} className="flex flex-col gap-2">
                  <p className={LABEL}>{sub}</p>
                  <div className="flex flex-col gap-2 rounded-flask-lg border border-flask-gray-200 bg-flask-white p-4">
                    <label className={LABEL} htmlFor={`${id}-new`}>
                      New Contact{" "}
                      <span className="text-flask-set-red-600" aria-hidden="true">
                        *
                      </span>
                      <span className="sr-only"> (required)</span>
                    </label>
                    <input
                      id={`${id}-new`}
                      type="text"
                      autoComplete="off"
                      autoFocus
                      aria-required
                      placeholder="Enter a New Contact"
                      value={adding.name}
                      aria-invalid={emptyNote ? true : undefined}
                      aria-describedby={emptyNote ? `${id}-new-problem` : undefined}
                      onChange={(e) => setAdding({ ...adding, name: e.target.value })}
                      onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          void createContact();
                        } else if (e.key === "Escape") {
                          e.preventDefault();
                          setAdding(null);
                        }
                      }}
                      className={`${TEXT_INPUT} -mt-0.5 ${emptyNote ? INPUT_INVALID : ""}`}
                    />
                    {emptyNote ? (
                      <p id={`${id}-new-problem`} className={FIELD_PROBLEM}>
                        {emptyNote}
                      </p>
                    ) : null}
                    <div className="flex gap-3">
                      <button
                        type="button"
                        onClick={() => setAdding(null)}
                        className={`${BTN_OUTLINE} flex-1`}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void createContact()}
                        className={`${BTN_SOLID} flex-1`}
                      >
                        Create
                      </button>
                    </div>
                  </div>
                </div>
              );
            }
            return (
              <div key={key} className="flex flex-col gap-2">
                <label className={LABEL} htmlFor={id}>
                  {sub}
                  <span className="sr-only"> (required)</span>
                </label>
                <Combo
                  id={id}
                  value={texts[key]}
                  placeholder={placeholder}
                  disabled={!editable}
                  required
                  rotateChevron
                  invalid={Boolean(problem) || marked.has(key)}
                  describedBy={problem ? problemId : undefined}
                  rows={rows(field)}
                  onText={(t) => setTexts((all) => ({ ...all, [key]: t }))}
                  onPick={(optionId) => {
                    if (optionId === ADD) {
                      const typed = texts[key].trim();
                      const current = labelOf(key, picked[key]);
                      setAdding({ key, name: typed === current ? "" : typed, refusedEmpty: false });
                      setTexts((all) => ({ ...all, [key]: current }));
                      return;
                    }
                    const option = field.options.find((o) => o.id === optionId);
                    if (option) pick(key, option);
                  }}
                  onBlur={() => setTexts((all) => ({ ...all, [key]: labelOf(key, picked[key]) }))}
                />
                {problem ? (
                  <p id={problemId} className={FIELD_PROBLEM}>
                    {problem}
                  </p>
                ) : null}
              </div>
            );
          })}
        </div>
      ))}

      {editable ? (
        <div className="mt-3 flex flex-col gap-3">
          <button type="submit" disabled={!changed || busy} className={SAVE_BTN}>
            Save Changes
          </button>
        </div>
      ) : null}
    </form>
  );
}

// --- the account codes ---------------------------------------------------------------------------

export function AccountCodesCard({
  load,
  busy,
  call,
  connectHref,
  onRetry,
  onSaved,
}: {
  load: XeroLoad;
  busy: boolean;
  call: Call;
  connectHref: string;
  onRetry: () => void;
  onSaved: (answer: CodesAnswer) => void;
}) {
  const editable = load.kind === "ready" && load.read.permissions.edit_account_codes;
  return (
    <SettingsCard
      title="Petty Cash Account Code"
      sub="Only selected account code will appear when adding an expense in Petty Cash."
      readOnly={load.kind === "ready" && !editable}
      testId="account-codes"
    >
      {load.kind !== "ready" ? (
        <NotReady load={load} onRetry={onRetry} />
      ) : !load.read.live || !load.read.account_codes ? (
        <NotConnected connectHref={connectHref} />
      ) : (
        <CodesForm
          key={JSON.stringify(load.read.account_codes)}
          codes={load.read.account_codes}
          editable={editable}
          busy={busy}
          call={call}
          onSaved={onSaved}
        />
      )}
    </SettingsCard>
  );
}

function CodesForm({
  codes,
  editable,
  busy,
  call,
  onSaved,
}: {
  codes: AccountCode[];
  editable: boolean;
  busy: boolean;
  call: Call;
  onSaved: (answer: CodesAnswer) => void;
}) {
  const searchId = useId();
  const hintId = useId();
  const [query, setQuery] = useState("");
  const [ticked, setTicked] = useState<ReadonlySet<string>>(
    () => new Set(codes.filter((r) => r.selected).map((r) => r.code)),
  );
  const rows = shownCodes(codes, query);
  const all = selectAllState(rows, ticked);
  const problem = editable ? codesProblem(codes, ticked) : null;
  const changed = codesChanged(codes, ticked);
  const hasCodes = shownCodes(codes, "").length > 0;

  function set(changes: string[], on: boolean) {
    setTicked((t) => {
      const next = new Set(t);
      for (const code of changes) {
        if (on) next.add(code);
        else next.delete(code);
      }
      return next;
    });
  }

  async function save() {
    if (!editable || busy || problem || !changed) return;
    const answer = await call<CodesAnswer>("/settings/xero/account-codes", {
      method: "PUT",
      json: codesBody(ticked),
    });
    if (answer) onSaved(answer);
  }

  return (
    <form
      noValidate
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <div className="relative">
        <label htmlFor={searchId} className="sr-only">
          Search account code
        </label>
        <input
          id={searchId}
          type="search"
          autoComplete="off"
          placeholder="Search account code"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            // Enter in the search box filters; it never saves
            if (e.key === "Enter") e.preventDefault();
          }}
          className="block h-11 w-full rounded-flask-lg border border-flask-set-gray-300 bg-flask-white pl-3 pr-11 text-base text-flask-black outline-none transition-[border-color,box-shadow] placeholder:text-flask-set-gray-700 placeholder:opacity-100 focus:border-flask-teal focus:ring-2 focus:ring-flask-teal/25"
        />
        <Icon
          name="search"
          className="pointer-events-none absolute inset-y-0 right-3 items-center text-[20px] text-flask-set-gray-300"
        />
      </div>

      {!hasCodes ? (
        <p className="m-0 py-8 text-center text-sm text-flask-menu/60">
          No account codes yet - I&apos;ll show them here once Xero&apos;s connected.
        </p>
      ) : (
        <>
          <ul
            aria-label="Account codes"
            className="m-0 max-h-[min(24rem,50vh)] list-none overflow-y-auto overscroll-contain rounded-b-flask-lg border-b border-r border-flask-gray-100 p-0 [scrollbar-gutter:stable] [scrollbar-width:thin]"
          >
            <li
              className={`sticky top-0 z-10 ${editable ? "bg-flask-white" : "bg-flask-gray-100"}`}
            >
              <label className="flex min-h-12 cursor-pointer items-center justify-between gap-3 px-3 py-3 sm:px-4">
                <span className="min-w-0 flex-1 text-right text-base text-flask-menu">
                  Select all
                </span>
                <Tick
                  checked={all === "all"}
                  indeterminate={all === "some"}
                  disabled={!editable || rows.length === 0}
                  label="Select all visible account codes"
                  onChange={(on) =>
                    set(
                      rows.map((r) => r.code),
                      on,
                    )
                  }
                />
              </label>
            </li>
            {rows.map((row, i) => (
              <li
                key={row.code}
                className={i ? "border-t border-flask-gray-100" : ""}
                data-code={row.code}
              >
                <label className="flex min-h-12 cursor-pointer items-center justify-between gap-3 px-3 py-3 sm:px-4">
                  <span className="min-w-0 flex-1 text-base text-flask-set-gray-700 [overflow-wrap:anywhere]">
                    {codeLabel(row)}
                  </span>
                  <Tick
                    checked={ticked.has(row.code)}
                    disabled={!editable}
                    onChange={(on) => set([row.code], on)}
                  />
                </label>
              </li>
            ))}
          </ul>
          {rows.length === 0 ? (
            <p className="m-0 text-center text-sm text-flask-menu/60">
              No codes match your search.
            </p>
          ) : null}
        </>
      )}

      {editable ? (
        <div className="mt-3 flex flex-col gap-3">
          {problem ? (
            <p id={hintId} role="status" className="m-0 text-sm text-flask-set-red-600">
              {problem}
            </p>
          ) : null}
          <button
            type="submit"
            disabled={!changed || Boolean(problem) || busy}
            aria-describedby={problem ? hintId : undefined}
            className={SAVE_BTN}
          >
            Save Changes
          </button>
        </div>
      ) : null}
    </form>
  );
}

/** Flask's `.pcs-tick`: a 16px box, teal with a white tick when on, a white bar when some are on. */
function Tick({
  checked,
  indeterminate = false,
  disabled,
  label,
  onChange,
}: {
  checked: boolean;
  indeterminate?: boolean;
  disabled: boolean;
  label?: string;
  onChange: (on: boolean) => void;
}) {
  const box = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (box.current) box.current.indeterminate = indeterminate;
  }, [indeterminate]);
  const GLYPH =
    "pointer-events-none absolute inset-0 m-auto hidden h-3.5 w-3.5 fill-flask-white peer-disabled:opacity-40";
  return (
    <span className="relative inline-flex h-4 w-4 shrink-0">
      <input
        ref={box}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        aria-label={label}
        onChange={(e) => onChange(e.target.checked)}
        className="peer m-0 h-4 w-4 cursor-pointer appearance-none rounded-flask border border-flask-menu/40 bg-flask-white checked:border-flask-teal checked:bg-flask-teal indeterminate:border-flask-teal indeterminate:bg-flask-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-flask-teal/50 disabled:cursor-not-allowed disabled:opacity-40"
      />
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className={`${GLYPH} ${indeterminate ? "" : "peer-checked:block"}`}
      >
        <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
      </svg>
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className={`${GLYPH} ${indeterminate ? "block" : ""}`}
      >
        <path d="M6 11h12v2H6z" />
      </svg>
    </span>
  );
}
