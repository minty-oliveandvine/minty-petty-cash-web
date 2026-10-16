"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react";

import { useLeaveGuard } from "@minty/shared/leaveGuard";
import { Button, buttonClass, Field, Icon, InlineAlert, inputClass, Modal, Skeleton } from "@minty/shared/ui";

import { AppBar } from "@/components/layout/AppBar";
import { MoreMenu, type MoreItem } from "@/components/ui/MoreMenu";
import { ToastRegion, type ToastMessage } from "@/components/ui/Toast";
import { ApiError, pettyCashFetch } from "@/lib/apiClient";
import { pettyCashHome } from "@/lib/companyPages";
import { settingsUrl } from "@/lib/flaskPages";
import {
  addMethod,
  catalogueOptions,
  chooseCountry,
  countryBody,
  countryChoiceOf,
  draftOf,
  isPending,
  METHOD_TYPES,
  moveMethod,
  movedText,
  nameProblem,
  pendingOps,
  removeMethod,
  renameMethod,
  saveMethods,
  TYPE_LABEL,
  type CatalogueMethod,
  type CountryChoice,
  type Draft,
  type DraftRow,
  type MethodType,
  type SaveOutcome,
  type Settings,
  type SettingsAnswer,
} from "@/lib/settings";
import { useAuth } from "@/lib/useAuth";

const UNREACHABLE = "We couldn't reach Petty Cash. Check your connection, then reload the page.";
const NOT_SAVED = "We couldn't reach Petty Cash, so this wasn't saved. Check your connection, then try again.";
/** Flask's page, word for word: the reason beside a Save this person may not press. */
const NO_RIGHT = "Only Accountants and Admins can change these.";
const NOTHING_YET = "No changes to save yet.";

const GROUP_SUB: Record<MethodType, string> = {
  electronic: "Card and wallet payments a Daily Closing can record.",
  delivery: "Delivery platforms a Daily Closing can record.",
};

type Load = { kind: "loading" } | { kind: "ready"; settings: Settings } | { kind: "failed"; message: string };

/**
 * Petty Cash settings - Part 15.20 (Business setup) as 15.20b's grouped forms with one Save per
 * card, in the order of Flask's redesigned page (`entity/settings_entity.html`), drawn with this
 * app's components:
 *
 * 1. **Country & currency** - two pickers, `PUT /settings/country`; a country alone brings its
 *    currency.
 * 2. **Sales methods** - Electronic and Delivery, in list order: add (from the catalogue, or a new
 *    name), rename, remove and move (a row's More menu - the way that works by keyboard and on a
 *    phone). Every change waits for the card's Save, which sends them one by one (lib/settings.ts).
 * 3. **Xero**, only while Xero is connected: one sentence and a full-page link to Flask's page,
 *    where the account mapping and the account codes stay (the owner, 2026-10-16).
 *
 * Each control shows only where `permissions` allows it; a Save the person may not press is
 * disabled with the reason beside it. A refusal is the API's sentence inline in its card - never a
 * toast, never a false success; a save that went through is confirmed with a toast. Unsaved
 * changes ask before the page is left (`@minty/shared/leaveGuard`).
 */
export function PettyCashSettings() {
  const auth = useAuth();
  const [load, setLoad] = useState<Load>({ kind: "loading" });

  useEffect(() => {
    let live = true;
    pettyCashFetch<Settings>("/settings")
      .then((settings) => live && setLoad({ kind: "ready", settings }))
      .catch((err: unknown) => {
        // A 401 has already gone back through the hand-off.
        if (!live || (err instanceof ApiError && err.status === 401)) return;
        setLoad({ kind: "failed", message: err instanceof ApiError ? err.message : UNREACHABLE });
      });
    return () => {
      live = false;
    };
  }, []);

  const entityId = auth?.entityId ?? "";
  const entityName = auth?.entityName ?? "";
  const home = auth ? pettyCashHome(entityId, entityName) : "";

  return (
    <>
      <AppBar companyName={entityName} />
      {/* Part 15.D page padding 16 / 24 / 32; a form is a centred 720 column (15.3). */}
      <main className="px-4 pb-16 pt-6 sm:px-6 lg:px-8 lg:pt-8">
        <div className="mx-auto flex w-full min-w-0 max-w-[720px] flex-col gap-5">
          {/* Part 15.1 Standard header: the way back and the title (no intro text, 2.9.10). */}
          <div className="flex flex-col gap-1">
            {home ? (
              <Link
                href={home}
                className="-ml-1 inline-flex min-h-11 w-fit items-center gap-1 rounded-lg pr-2 text-body-m font-medium text-text-link hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus"
              >
                <Icon name="chevron_left" size="md" />
                Petty Cash
              </Link>
            ) : (
              <span className="min-h-11" aria-hidden />
            )}
            <h1 className="text-display-m text-text-primary">Petty Cash settings</h1>
          </div>

          {load.kind === "ready" && auth ? (
            <SettingsCards initial={load.settings} entityId={entityId} />
          ) : load.kind === "failed" ? (
            <InlineAlert tone="danger">{load.message}</InlineAlert>
          ) : (
            <div className="flex flex-col gap-4" role="status" aria-busy="true" aria-label="Loading">
              <Skeleton className="h-48 w-full rounded-lg" />
              <Skeleton className="h-72 w-full rounded-lg" />
            </div>
          )}
        </div>
      </main>
    </>
  );
}

/** The cards, over one read: each card's answer is the whole read again. */
function SettingsCards({ initial, entityId }: { initial: Settings; entityId: string }) {
  const [settings, setSettings] = useState(initial);
  const [choice, setChoice] = useState<CountryChoice>(() => countryChoiceOf(initial));
  const [draft, setDraft] = useState<Draft>(() => draftOf(initial));
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const goBack = useRef<HTMLButtonElement>(null);

  const dirty = countryBody(settings, choice) !== null || pendingOps(draft, settings).length > 0;
  const leave = useLeaveGuard(dirty, () => {
    setChoice(countryChoiceOf(settings));
    setDraft(draftOf(settings));
  });

  const say = (message: string) => setToast({ id: Date.now(), message });

  return (
    <>
      <CountryCard
        settings={settings}
        choice={choice}
        onChoice={setChoice}
        onSaved={({ message, ...read }) => {
          setSettings(read);
          setChoice(countryChoiceOf(read));
          say(message);
        }}
      />
      <MethodsCard
        settings={settings}
        draft={draft}
        onDraft={setDraft}
        onSaved={(out) => {
          setSettings(out.settings);
          setDraft(out.draft);
          if (out.message) say(out.message);
        }}
      />
      {settings.xero_connected ? <XeroCard href={settingsUrl(entityId)} /> : null}
      <ToastRegion toast={toast} onDismiss={() => setToast(null)} />
      <Modal
        open={leave.open}
        onRequestClose={leave.stay}
        role="alertdialog"
        title="Leave without saving?"
        description="You have unsaved changes. Your changes will be lost if you leave this page."
        initialFocus={goBack}
        footer={
          <>
            <Button kind="ghost" onClick={leave.discard}>
              Discard changes
            </Button>
            <Button ref={goBack} kind="primary" onClick={leave.stay}>
              Go Back
            </Button>
          </>
        }
      />
    </>
  );
}

/** A settings card (15.20b): a Section header (h2 + why), its fields, then its own Save. */
function Card({ id, title, sub, children }: { id: string; title: string; sub: string; children: ReactNode }) {
  return (
    <section aria-labelledby={`${id}-title`} className="flex min-w-0 flex-col gap-4 rounded-lg border border-border-subtle bg-surface-card p-4 sm:p-6">
      <div className="flex flex-col gap-1">
        <h2 id={`${id}-title`} className="text-title-l text-text-primary">
          {title}
        </h2>
        <p className="text-body-m text-text-secondary">{sub}</p>
      </div>
      {children}
    </section>
  );
}

/**
 * A card's Save (Part 14 Button, Primary): first and full width on a phone, at the right from 640.
 * Disabled with its reason beside it while the person may not change the card, or nothing changed.
 */
function CardSave({ id, may, dirty, saving, onSave }: { id: string; may: boolean; dirty: boolean; saving: boolean; onSave: () => void }) {
  const reason = !may ? NO_RIGHT : !dirty && !saving ? NOTHING_YET : null;
  const reasonId = `${id}-save-reason`;
  return (
    <div className="flex flex-col gap-2 border-t border-border-subtle pt-4 sm:flex-row-reverse sm:items-center sm:justify-start sm:gap-3">
      <Button
        kind="primary"
        className="w-full sm:w-auto"
        onClick={onSave}
        disabled={reason !== null}
        processing={saving}
        processingLabel="Saving…"
        aria-describedby={reason ? reasonId : undefined}
      >
        Save
      </Button>
      {reason ? (
        <p id={reasonId} className="text-body-s text-text-secondary">
          {reason}
        </p>
      ) : null}
    </div>
  );
}

/** A native select in Part 14 Input geometry, with the chevron (the report history's Rows per page). */
function SelectField({
  label,
  value,
  onChange,
  options,
  blank,
  helper,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  /** The empty choice's words, when the empty choice is offered. */
  blank?: string;
  helper?: ReactNode;
}) {
  return (
    <Field label={label} helper={helper}>
      {(a11y) => (
        <div className="relative">
          <select {...a11y} value={value} onChange={(e) => onChange(e.target.value)} className={`${inputClass(false)} cursor-pointer appearance-none pr-9`}>
            {blank !== undefined ? <option value="">{blank}</option> : null}
            {options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <Icon name="expand_more" className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-text-secondary" />
        </div>
      )}
    </Field>
  );
}

/** Country & currency: two pickers and the card's Save (`PUT /settings/country`, only what changed). */
function CountryCard({
  settings,
  choice,
  onChoice,
  onSaved,
}: {
  settings: Settings;
  choice: CountryChoice;
  onChoice: (choice: CountryChoice) => void;
  onSaved: (answer: SettingsAnswer) => void;
}) {
  const c = settings.country;
  const may = settings.permissions.edit_country;
  const body = countryBody(settings, choice);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const countryChanged = choice.country !== (c.country_code ?? "");

  async function save() {
    if (!may || !body || saving) return;
    setSaving(true);
    setProblem(null);
    try {
      onSaved(await pettyCashFetch<SettingsAnswer>("/settings/country", { method: "PUT", json: body }));
    } catch (err) {
      // A 401 has already gone back through the hand-off.
      if (!(err instanceof ApiError && err.status === 401)) setProblem(err instanceof ApiError ? err.message : NOT_SAVED);
    }
    setSaving(false);
  }

  return (
    <Card id="country" title="Country & currency" sub="Where this company reports from, and the currency its petty cash is counted in.">
      {may ? (
        <div className="grid min-w-0 gap-4 sm:grid-cols-2">
          <SelectField
            label="Country"
            value={choice.country}
            blank={choice.country ? undefined : "Choose a country"}
            options={c.countries.map((x) => ({ value: x.code, label: x.name }))}
            onChange={(v) => {
              onChoice(chooseCountry(settings, v));
              setProblem(null);
            }}
          />
          <SelectField
            label="Currency"
            value={choice.currency}
            blank={countryChanged ? "The country's own currency" : choice.currency ? undefined : "Choose a currency"}
            helper={countryChanged && !choice.currency ? "Saving sets the currency that goes with the country. Choose one here to use another." : undefined}
            options={c.currencies.map((x) => ({ value: x.id, label: x.name }))}
            onChange={(v) => {
              onChoice({ ...choice, currency: v });
              setProblem(null);
            }}
          />
        </div>
      ) : (
        <dl className="grid min-w-0 gap-x-4 gap-y-2 text-body-m sm:grid-cols-[auto_1fr]">
          <dt className="text-text-secondary">Country</dt>
          <dd className="min-w-0 break-words text-text-primary">{c.selected_country ?? "Not set yet"}</dd>
          <dt className="text-text-secondary">Currency</dt>
          <dd className="min-w-0 break-words text-text-primary">{c.selected_currency ?? "Not set yet"}</dd>
        </dl>
      )}
      {problem ? <InlineAlert tone="danger">{problem}</InlineAlert> : null}
      <CardSave id="country" may={may} dirty={body !== null} saving={saving} onSave={() => void save()} />
    </Card>
  );
}

/**
 * Sales methods: the Electronic and Delivery lists in their order, each change waiting for the
 * card's Save. A refused change names what wasn't saved, with the API's sentence; what went
 * through before it is kept.
 */
function MethodsCard({
  settings,
  draft,
  onDraft,
  onSaved,
}: {
  settings: Settings;
  draft: Draft;
  onDraft: (draft: Draft) => void;
  onSaved: (out: SaveOutcome) => void;
}) {
  const p = settings.permissions;
  const mayChange = p.add_sales_method || p.rename_sales_method || p.remove_sales_method || p.reorder_sales_methods;
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<{ title: string; message: string } | null>(null);
  const [renaming, setRenaming] = useState<{ type: MethodType; row: DraftRow } | null>(null);
  const [announce, setAnnounce] = useState("");
  const lists = useRef<HTMLDivElement>(null);
  // After a move the row is drawn in its new place: its More button takes the focus back.
  const refocus = useRef<string | null>(null);
  const dirty = pendingOps(draft, settings).length > 0;

  useEffect(() => {
    const key = refocus.current;
    if (!key) return;
    refocus.current = null;
    lists.current?.querySelector<HTMLElement>(`[data-row="${CSS.escape(key)}"] [aria-haspopup="menu"]`)?.focus();
  }, [draft]);

  function change(next: Draft) {
    onDraft(next);
    setFailure(null);
  }

  async function save() {
    if (saving || !dirty) return;
    setSaving(true);
    setFailure(null);
    const out = await saveMethods(draft, settings, (path, init) => pettyCashFetch<SettingsAnswer>(path, init));
    setSaving(false);
    onSaved(out);
    const err = out.failure?.error;
    // A 401 has already gone back through the hand-off.
    if (!out.failure || (err instanceof ApiError && err.status === 401)) return;
    const sentence = err instanceof ApiError ? err.message : NOT_SAVED;
    setFailure({ title: out.failure.what, message: out.sent ? `${sentence} The changes before it are saved; the rest are still waiting for Save.` : sentence });
  }

  return (
    <Card id="sales-methods" title="Sales methods" sub="The ways customers pay, besides cash, that a Daily Closing records.">
      {p.view_sales_methods ? (
        <>
          <div ref={lists} className="flex min-w-0 flex-col gap-6">
            {METHOD_TYPES.map((type) => (
              <MethodGroup
                key={type}
                type={type}
                draft={draft}
                settings={settings}
                onChange={change}
                onRename={(row) => setRenaming({ type, row })}
                onMoved={(next, key) => {
                  refocus.current = key;
                  setAnnounce(movedText(next, type, key));
                }}
              />
            ))}
            <p className="sr-only" aria-live="polite">
              {announce}
            </p>
          </div>
          {draft.removed.length ? (
            <p className="min-w-0 break-words text-body-s text-text-secondary">
              Removed when you save: {draft.removed.map((r) => r.name).join(", ")}. Reports that used them keep their amounts.
            </p>
          ) : null}
          {failure ? (
            <InlineAlert tone="danger" title={failure.title}>
              {failure.message}
            </InlineAlert>
          ) : null}
          <CardSave id="sales-methods" may={mayChange} dirty={dirty} saving={saving} onSave={() => void save()} />
        </>
      ) : (
        <p className="text-body-m text-text-secondary">Your role can&apos;t see the sales methods. Ask an Accountant or an Admin.</p>
      )}
      {renaming ? (
        <RenameDialog
          type={renaming.type}
          row={renaming.row}
          draft={draft}
          onCancel={() => setRenaming(null)}
          onRename={(name) => {
            change(renameMethod(draft, renaming.type, renaming.row.key, name, settings.available[renaming.type]));
            setRenaming(null);
          }}
        />
      ) : null}
    </Card>
  );
}

/** One list (Electronic or Delivery): its rows in order, then Add. */
function MethodGroup({
  type,
  draft,
  settings,
  onChange,
  onRename,
  onMoved,
}: {
  type: MethodType;
  draft: Draft;
  settings: Settings;
  onChange: (draft: Draft) => void;
  onRename: (row: DraftRow) => void;
  onMoved: (draft: Draft, key: string) => void;
}) {
  const p = settings.permissions;
  const label = TYPE_LABEL[type];
  const list = draft.lists[type];
  const available = settings.available[type];
  const [adding, setAdding] = useState(false);
  const addButton = useRef<HTMLButtonElement>(null);
  // The Add button comes back when the panel closes: it takes the focus back then.
  const refocusAdd = useRef(false);

  useEffect(() => {
    if (adding || !refocusAdd.current) return;
    refocusAdd.current = false;
    addButton.current?.focus();
  }, [adding]);

  function closePanel() {
    refocusAdd.current = true;
    setAdding(false);
  }

  function move(row: DraftRow, step: -1 | 1) {
    const next = moveMethod(draft, type, row.key, step);
    onChange(next);
    onMoved(next, row.key);
  }

  return (
    <div role="group" aria-labelledby={`${type}-title`} className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <h3 id={`${type}-title`} className="text-title-m text-text-primary">
          {label}
        </h3>
        <p className="text-body-s text-text-secondary">{GROUP_SUB[type]}</p>
      </div>
      {list.length ? (
        <ol aria-label={`${label} methods`} className="flex min-w-0 flex-col divide-y divide-border-subtle rounded-lg border border-border-subtle">
          {list.map((row, i) => {
            const saved = row.id !== null;
            // A method not saved yet is the person's own addition: changing it needs only the right to add.
            const items: MoreItem[] = [
              ...((saved ? p.rename_sales_method : p.add_sales_method) ? [{ key: "rename", label: "Rename", icon: "edit", onSelect: () => onRename(row) }] : []),
              ...(p.reorder_sales_methods && i > 0 ? [{ key: "up", label: "Move up", icon: "arrow_upward", onSelect: () => move(row, -1) }] : []),
              ...(p.reorder_sales_methods && i < list.length - 1 ? [{ key: "down", label: "Move down", icon: "arrow_downward", onSelect: () => move(row, 1) }] : []),
              ...((saved ? p.remove_sales_method : p.add_sales_method)
                ? [{ key: "remove", label: "Remove", icon: "delete", danger: true, onSelect: () => onChange(removeMethod(draft, type, row.key)) }]
                : []),
            ];
            return (
              <li key={row.key} data-row={row.key} className="flex min-h-14 min-w-0 items-center gap-3 px-4 py-2">
                <div className="min-w-0 flex-1">
                  <p className="break-words text-body-m text-text-primary">{row.name}</p>
                  {isPending(row) ? (
                    <p className="break-words text-body-s text-text-secondary">{saved ? `Renamed from ${row.savedName} · not saved yet` : "Added · not saved yet"}</p>
                  ) : null}
                </div>
                <MoreMenu label={`More actions for ${row.name}`} items={items} />
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="text-body-m text-text-secondary">No {label.toLowerCase()} methods yet.</p>
      )}
      {p.add_sales_method ? (
        adding ? (
          <AddMethod type={type} draft={draft} available={available} onCancel={closePanel} onAdd={(name) => {
            onChange(addMethod(draft, type, name, available));
            closePanel();
          }} />
        ) : (
          <Button ref={addButton} kind="secondary" icon={<Icon name="add" />} className="w-full sm:w-auto sm:self-start" onClick={() => setAdding(true)}>
            Add {label.toLowerCase()} method
          </Button>
        )
      ) : null}
    </div>
  );
}

/**
 * Add a method: one field, an ARIA combobox over the catalogue methods not on the list (the
 * Supplier picker's pattern, ExpenseForm.tsx), narrowed as typed. A name the catalogue has is that
 * method; any other name is a new one. ↑ ↓ move, Enter chooses (or adds, with no option
 * highlighted), Escape closes the list. The name is checked as it is typed.
 *
 * The list opens as the field is typed in or clicked (not on arrival, so it never stands over the
 * buttons unasked), in the page's flow, and stays open while the focus moves to Cancel or Add -
 * closing it on that blur would move the buttons under the click.
 */
function AddMethod({
  type,
  draft,
  available,
  onAdd,
  onCancel,
}: {
  type: MethodType;
  draft: Draft;
  available: CatalogueMethod[];
  onAdd: (name: string) => void;
  onCancel: () => void;
}) {
  const id = `add-${type}`;
  const listId = `${id}-list`;
  const label = TYPE_LABEL[type];
  const input = useRef<HTMLInputElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [attempted, setAttempted] = useState(false);
  const options = catalogueOptions(draft, type, available, query);
  const problem = nameProblem(query, { draft, type, purpose: "add", attempted });

  useEffect(() => {
    input.current?.focus();
  }, []);

  function choose(option: CatalogueMethod) {
    setQuery(option.name);
    setOpen(false);
    setActive(-1);
  }

  function add() {
    setAttempted(true);
    setOpen(false);
    if (nameProblem(query, { draft, type, purpose: "add", attempted: true })) {
      input.current?.focus();
      return;
    }
    onAdd(query);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) setOpen(true);
      if (!options.length) return;
      setActive((i) => (e.key === "ArrowDown" ? (i + 1) % options.length : i <= 0 ? options.length - 1 : i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (open && active >= 0 && options[active]) choose(options[active]);
      else add();
    } else if (e.key === "Escape" && open) {
      e.preventDefault();
      setOpen(false);
      setActive(-1);
    }
  }

  const status = !open ? "" : options.length ? `${options.length} ${options.length === 1 ? "method" : "methods"} to choose from.` : "";

  return (
    <div ref={panel} role="group" aria-label={`Add ${label.toLowerCase()} method`} className="flex min-w-0 flex-col gap-3 rounded-lg border border-border-default bg-surface-card p-4">
      <Field id={id} label="Method" required error={problem} helper="Choose one from the list, or type a new name.">
        {(a11y) => (
          <div className="flex min-w-0 flex-col gap-1">
            <div className="relative">
              <input
                {...a11y}
                ref={input}
                type="text"
                role="combobox"
                aria-autocomplete="list"
                aria-expanded={open && options.length > 0}
                aria-controls={listId}
                aria-activedescendant={open && active >= 0 ? `${listId}-${active}` : undefined}
                autoComplete="off"
                placeholder="Start typing a name"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setOpen(true);
                  setActive(-1);
                }}
                onClick={() => setOpen(true)}
                onBlur={(e) => {
                  if (e.relatedTarget instanceof Node && panel.current?.contains(e.relatedTarget)) return;
                  setOpen(false);
                  setActive(-1);
                }}
                onKeyDown={onKeyDown}
                className={`${inputClass(Boolean(problem))} pr-10`}
              />
              <Icon name="search" className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-text-secondary" />
            </div>
            {open && options.length ? (
              <ul id={listId} role="listbox" aria-label={`${label} methods to add`} className="max-h-[264px] overflow-y-auto rounded-lg border border-border-default bg-surface-raised py-1 shadow-modal">
                {options.map((o, i) => (
                  <li
                    key={o.id}
                    id={`${listId}-${i}`}
                    role="option"
                    aria-selected={i === active}
                    // Keep the focus in the field, so choosing never blurs it first.
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => choose(o)}
                    className={`flex min-h-[52px] cursor-pointer items-center px-3 text-body-m text-text-primary hover:bg-state-hover ${i === active ? "bg-state-selected" : ""}`}
                  >
                    <span className="min-w-0 break-words">{o.name}</span>
                  </li>
                ))}
              </ul>
            ) : null}
            <p className="sr-only" aria-live="polite">
              {status}
            </p>
          </div>
        )}
      </Field>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button kind="ghost" className="w-full sm:w-auto" onClick={onCancel}>
          Cancel
        </Button>
        <Button kind="secondary" className="w-full sm:w-auto" onClick={add}>
          Add
        </Button>
      </div>
    </div>
  );
}

/** Rename: a small form in a Part 14 modal (a bottom sheet on a phone); the name is checked as typed. */
function RenameDialog({
  type,
  row,
  draft,
  onRename,
  onCancel,
}: {
  type: MethodType;
  row: DraftRow;
  draft: Draft;
  onRename: (name: string) => void;
  onCancel: () => void;
}) {
  const formId = useId();
  const field = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(row.name);
  const [attempted, setAttempted] = useState(false);
  const problem = nameProblem(name, { draft, type, purpose: "rename", attempted, except: row.key });

  function submit(e: FormEvent) {
    e.preventDefault();
    setAttempted(true);
    if (nameProblem(name, { draft, type, purpose: "rename", attempted: true, except: row.key })) {
      field.current?.focus();
      return;
    }
    onRename(name);
  }

  return (
    <Modal
      open
      onRequestClose={onCancel}
      title={`Rename ${row.name}`}
      description="The new name is saved with the Sales methods card's Save."
      initialFocus={field}
      footer={
        <>
          <Button kind="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button kind="primary" type="submit" form={formId}>
            Rename
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={submit} noValidate>
        <Field label="Name" required error={problem}>
          {(a11y) => <input {...a11y} ref={field} type="text" autoComplete="off" value={name} onChange={(e) => setName(e.target.value)} className={inputClass(Boolean(problem))} />}
        </Field>
      </form>
    </Modal>
  );
}

/** Xero, while connected: the mapping and the account codes stay on Flask's page (a full-page link). */
function XeroCard({ href }: { href: string }) {
  return (
    <Card id="xero" title="Xero" sub="The Xero account mapping and the Petty Cash account codes are set on the Xero settings page, which reads them from Xero.">
      <a href={href} className={`${buttonClass("secondary")} w-full sm:w-auto sm:self-start`}>
        Go to Xero settings
        <Icon name="arrow_forward" />
      </a>
    </Card>
  );
}
