"use client";

/**
 * Petty Cash settings' Xero cards (Part 15.20b, one Save per card), in Flask's words and order
 * (`entity/settings_entity.html`, `partials/xero_account_mapping_cards_classic.html`,
 * `static/js/petty_cash_settings.js`); rules in lib/xeroSettings.ts:
 *
 * - `MappingCard` - **Xero account mapping**: eight searchable pickers (Part 14 Supplier picker's
 *   combobox), each checked as typed; a contact field can add a new contact in Xero
 *   (`POST /suppliers`), which is then chosen. Save sends `PUT /settings/xero/mapping`.
 * - `CodesCard` - **Petty Cash account codes**: a checklist with search and Select all; at least
 *   one stays picked, said beside the gated Save. Save sends `PUT /settings/xero/account-codes`.
 * - `NotConnectedCard` - without a live Xero connection: one sentence and a full-page link to
 *   minty-web's Entity & Integration (through Flask's hand-off, `integrationUrl`), where Xero is
 *   connected.
 *
 * A refusal is the API's sentence inline in its card - never a toast, never a false success.
 */

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";

import { buttonClass, Button, ErrorSummary, Field, Icon, InlineAlert, inputClass } from "@minty/shared/ui";

import { Card, CardSave, NOT_SAVED } from "@/components/settings/SettingsCard";
import { ApiError, pettyCashFetch } from "@/lib/apiClient";
import {
  chooseOption,
  codeLabel,
  codeMatches,
  codeRows,
  codesDirty,
  codesProblem,
  leaveField,
  mappingBody,
  mappingDirty,
  mappingProblem,
  mappingProblems,
  newContactProblem,
  offersNewContact,
  optionLabel,
  optionMatches,
  shownState,
  toggleCode,
  toggleShown,
  typeInto,
  type CodesAnswer,
  type MappingAnswer,
  type MappingDraft,
  type MappingField,
  type MappingKey,
  type Pick,
  type XeroOption,
  type XeroSettings,
} from "@/lib/xeroSettings";

const CONTACT_NOT_ADDED = "We couldn't add this contact. Check your connection, then try again.";

/** Each field's why, from Flask's page. */
const HELPER: Record<MappingKey, string> = {
  main_bank: "The bank account in Xero that holds the petty cash.",
  deposit_bank: "The bank account that excess cash is deposited into.",
  cashsale_account: "The account code that cash sales are recorded to.",
  cashsale_contact: "The customer contact for cash sales.",
  owners_account: "The account code for an advance payment from the director.",
  owners_contact: "The director, or the person responsible for the petty cash.",
  discrepancy_account: "The account code that a cash difference is recorded to.",
  discrepancy_contact: "The person a cash difference is recorded against.",
};

const fieldId = (key: MappingKey) => `xero-${key.replace(/_/g, "-")}`;

/** The API's sentence for a refusal, or null for a 401 (the hand-off has the page). */
function refusal(err: unknown, fallback: string): string | null {
  if (err instanceof ApiError) return err.status === 401 ? null : err.message;
  return fallback;
}

// --- Not connected ------------------------------------------------------------------------------

export function NotConnectedCard({ href }: { href: string }) {
  return (
    <Card id="xero" title="Xero" sub="The Xero accounts, contacts and account codes a Daily Report is published to.">
      <p className="text-body-m text-text-primary">
        Xero isn&apos;t connected for this company. Connect it in Entity &amp; Integration, then the account mapping and the account codes can be set here.
      </p>
      <a href={href} className={`${buttonClass("secondary")} w-full sm:w-auto sm:self-start`}>
        Connect Xero in Entity &amp; Integration
        <Icon name="arrow_forward" />
      </a>
    </Card>
  );
}

// --- The account mapping ------------------------------------------------------------------------

export function MappingCard({
  xero,
  draft,
  onDraft,
  onContact,
  onSaved,
}: {
  xero: XeroSettings;
  draft: MappingDraft;
  onDraft: (draft: MappingDraft) => void;
  /** A contact added in Xero: offered in every contact field from now on. */
  onContact: (contact: XeroOption) => void;
  onSaved: (answer: MappingAnswer) => void;
}) {
  const fields = xero.mapping ?? [];
  const may = xero.permissions.edit_mapping;
  const [attempted, setAttempted] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const dirty = mappingDirty(xero, draft);
  const summary = attempted ? mappingProblems(xero, draft, true).map((p) => ({ fieldId: fieldId(p.key), message: p.message })) : [];

  function change(next: MappingDraft) {
    onDraft(next);
    setProblem(null);
  }

  async function save() {
    if (!may || !dirty || saving) return;
    setAttempted(true);
    const problems = mappingProblems(xero, draft, true);
    if (problems.length) {
      setAttempt((n) => n + 1);
      // One problem: its field takes focus. Two or more: the summary does.
      if (problems.length === 1) document.getElementById(fieldId(problems[0].key))?.focus();
      return;
    }
    setSaving(true);
    setProblem(null);
    try {
      const answer = await pettyCashFetch<MappingAnswer>("/settings/xero/mapping", { method: "PUT", json: mappingBody(draft) });
      setAttempted(false);
      onSaved(answer);
    } catch (err) {
      setProblem(refusal(err, NOT_SAVED));
    }
    setSaving(false);
  }

  return (
    <Card id="xero-mapping" title="Xero account mapping" sub="The Xero accounts and contacts a Daily Report is published to.">
      {xero.organisation ? (
        <p className="min-w-0 break-words text-body-s text-text-secondary">
          Xero organisation: <span className="font-semibold text-text-primary">{xero.organisation}</span>
        </p>
      ) : null}
      {!xero.mapping_saved ? (
        <InlineAlert tone="info" title="Not set up yet">
          Daily Reports can be published to Xero once these choices are saved.
        </InlineAlert>
      ) : null}
      <ErrorSummary items={summary} attempt={attempt} />
      {may ? (
        <div className="grid min-w-0 gap-4 sm:grid-cols-2">
          {fields.map((field) => (
            <XeroPicker
              key={field.key}
              field={field}
              pick={draft[field.key]}
              problem={mappingProblem(xero, draft, field.key, attempted)}
              disabled={saving}
              onType={(text) => change(typeInto(draft, field, text))}
              onChoose={(option) => change(chooseOption(draft, field, option))}
              onLeave={() => onDraft(leaveField(draft, field))}
              onContact={(contact) => {
                onContact(contact);
                change(chooseOption(draft, field, contact));
              }}
            />
          ))}
        </div>
      ) : (
        <dl className="grid min-w-0 gap-x-4 gap-y-2 text-body-m sm:grid-cols-[auto_1fr]">
          {fields.map((field) => {
            const chosen = field.options.find((o) => o.id === field.selected);
            return (
              <div key={field.key} className="contents">
                <dt className="text-text-secondary">{field.label}</dt>
                <dd className="min-w-0 break-words text-text-primary">{chosen ? optionLabel(chosen) : "Not chosen yet"}</dd>
              </div>
            );
          })}
        </dl>
      )}
      <p className="text-body-s text-text-secondary">A cash difference is recorded against the Petty Cash Account.</p>
      {problem ? <InlineAlert tone="danger">{problem}</InlineAlert> : null}
      <CardSave id="xero-mapping" may={may} dirty={dirty} saving={saving} onSave={() => void save()} />
    </Card>
  );
}

/**
 * One choice: an ARIA combobox over the field's Xero options (the Part 14 Supplier picker's
 * pattern), narrowed as typed by code or name. ↑ ↓ move, Enter chooses, Escape closes the list. A
 * contact field ends the list with 'Add "…" as a new contact' when no contact has that name and the
 * person may change the mapping; adding is never automatic - it opens the New contact panel.
 */
function XeroPicker({
  field,
  pick,
  problem,
  disabled,
  onType,
  onChoose,
  onLeave,
  onContact,
}: {
  field: MappingField;
  pick: Pick;
  problem: string | null;
  disabled: boolean;
  onType: (text: string) => void;
  onChoose: (option: XeroOption) => void;
  onLeave: () => void;
  onContact: (contact: XeroOption) => void;
}) {
  const id = fieldId(field.key);
  const listId = `${id}-list`;
  const input = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [newName, setNewName] = useState<string | null>(null);
  const [announce, setAnnounce] = useState("");
  const contact = field.kind === "contact";
  const noun = contact ? "contact" : "account";

  const matches = optionMatches(field, pick);
  const offerNew = offersNewContact(field, pick.text, true);
  const count = matches.length + (offerNew ? 1 : 0);

  function choose(option: XeroOption) {
    onChoose(option);
    setOpen(false);
    setActive(-1);
  }

  function select(index: number) {
    if (index < matches.length) choose(matches[index]);
    else if (offerNew) {
      setOpen(false);
      setNewName(pick.text.trim());
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) setOpen(true);
      if (!count) return;
      setActive((i) => (e.key === "ArrowDown" ? (i + 1) % count : i <= 0 ? count - 1 : i - 1));
    } else if (e.key === "Enter" && open && active >= 0) {
      e.preventDefault();
      select(active);
    } else if (e.key === "Escape" && open) {
      e.preventDefault();
      setOpen(false);
      setActive(-1);
    }
  }

  const status = !open
    ? ""
    : matches.length
      ? `${matches.length} ${matches.length === 1 ? noun : `${noun}s`} found.`
      : offerNew
        ? `No contact is called ${pick.text.trim()}. You can add it as a new contact.`
        : `No ${noun} matches.`;

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <Field id={id} label={field.label} required error={newName === null ? problem : undefined} helper={HELPER[field.key]}>
        {(a11y) => (
          <div className="flex min-w-0 flex-col gap-1">
            <div className="relative">
              <input
                {...a11y}
                ref={input}
                type="text"
                role="combobox"
                aria-autocomplete="list"
                aria-expanded={open}
                aria-controls={listId}
                aria-activedescendant={open && active >= 0 ? `${listId}-${active}` : undefined}
                autoComplete="off"
                placeholder={contact ? "Search contacts" : "Search by code or name"}
                value={pick.text}
                disabled={disabled}
                onChange={(e) => {
                  onType(e.target.value);
                  setOpen(true);
                  setActive(-1);
                  setNewName(null);
                }}
                onClick={() => setOpen(true)}
                onBlur={() => {
                  setOpen(false);
                  setActive(-1);
                  onLeave();
                }}
                onKeyDown={onKeyDown}
                className={`${inputClass(Boolean(problem) && newName === null)} pr-10`}
              />
              <Icon name="search" className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-text-secondary" />
              {/* Over the page, not in its flow: closing it on a blur never moves the Save under a click. */}
              {open ? (
                <ul
                  id={listId}
                  role="listbox"
                  aria-label={`${field.label} choices`}
                  className="absolute inset-x-0 top-full z-20 mt-1 max-h-[264px] overflow-y-auto rounded-lg border border-border-default bg-surface-raised py-1 shadow-modal"
                >
                  {matches.map((o, i) => (
                    <li
                      key={o.id}
                      id={`${listId}-${i}`}
                      role="option"
                      aria-selected={pick.id === o.id}
                      // Keep the focus in the field, so choosing never blurs it first.
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => choose(o)}
                      className={`flex min-h-[52px] cursor-pointer items-center gap-2 px-3 text-body-m text-text-primary hover:bg-state-hover ${i === active ? "bg-state-selected" : ""}`}
                    >
                      <span className="min-w-0 flex-1 break-words">{optionLabel(o)}</span>
                      {pick.id === o.id ? <Icon name="check" className="text-text-link" /> : null}
                    </li>
                  ))}
                  {offerNew ? (
                    <li
                      id={`${listId}-${matches.length}`}
                      role="option"
                      aria-selected={false}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => select(matches.length)}
                      className={`flex min-h-[52px] cursor-pointer items-center gap-2 px-3 text-body-m text-text-link hover:bg-state-hover ${
                        matches.length ? "border-t border-border-subtle" : ""
                      } ${active === matches.length ? "bg-state-selected" : ""}`}
                    >
                      <Icon name="add" />
                      <span className="min-w-0 flex-1 break-words">Add &ldquo;{pick.text.trim()}&rdquo; as a new contact</span>
                    </li>
                  ) : null}
                  {count === 0 ? (
                    <li role="presentation" className="px-3 py-3 text-body-m text-text-secondary">
                      {field.options.length ? `No ${noun} matches that.` : `No ${noun}s are synced from Xero yet.`}
                    </li>
                  ) : null}
                </ul>
              ) : null}
            </div>
            <p className="sr-only" aria-live="polite">
              {status || announce}
            </p>
          </div>
        )}
      </Field>
      {newName !== null ? (
        <NewContact
          initial={newName}
          field={field}
          onCancel={() => {
            setNewName(null);
            input.current?.focus();
          }}
          onAdded={(added) => {
            onContact(added);
            setNewName(null);
            setAnnounce(`${added.name} is added as a contact.`);
            input.current?.focus();
          }}
        />
      ) : null}
    </div>
  );
}

/** The New contact panel: its name (checked as typed, duplicates refused), then Add contact - made in Xero at once. */
function NewContact({ initial, field, onCancel, onAdded }: { initial: string; field: MappingField; onCancel: () => void; onAdded: (contact: XeroOption) => void }) {
  const titleId = useId();
  const input = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(initial);
  const [attempted, setAttempted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [serverProblem, setServerProblem] = useState<string | null>(null);
  const problem = newContactProblem(name, field, attempted);

  useEffect(() => {
    input.current?.focus();
  }, []);

  async function create() {
    if (saving) return;
    setAttempted(true);
    setServerProblem(null);
    if (newContactProblem(name, field, true)) {
      input.current?.focus();
      return;
    }
    setSaving(true);
    try {
      onAdded(await pettyCashFetch<XeroOption>("/suppliers", { method: "POST", json: { name: name.trim() } }));
    } catch (err) {
      const sentence = refusal(err, CONTACT_NOT_ADDED);
      if (sentence === null) return;
      setSaving(false);
      setServerProblem(sentence);
    }
  }

  return (
    <div role="group" aria-labelledby={titleId} className="flex min-w-0 flex-col gap-3 rounded-lg border border-border-default bg-surface-card p-4">
      <h3 id={titleId} className="text-title-m text-text-primary">
        New contact
      </h3>
      <Field label="Contact's name" required error={problem} helper="It's added to your Xero contacts now and chosen here. The mapping is saved with Save.">
        {(a11y) => (
          <input
            {...a11y}
            ref={input}
            type="text"
            autoComplete="off"
            value={name}
            disabled={saving}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void create();
              }
            }}
            className={inputClass(Boolean(problem))}
          />
        )}
      </Field>
      {serverProblem ? <InlineAlert tone="danger">{serverProblem}</InlineAlert> : null}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button kind="ghost" onClick={onCancel} disabled={saving} className="w-full sm:w-auto">
          Cancel
        </Button>
        <Button kind="secondary" onClick={() => void create()} processing={saving} processingLabel="Adding…" className="w-full sm:w-auto">
          Add contact
        </Button>
      </div>
    </div>
  );
}

// --- The account codes --------------------------------------------------------------------------

export function CodesCard({
  xero,
  ticked,
  onTicked,
  onSaved,
}: {
  xero: XeroSettings;
  ticked: string[];
  onTicked: (ticked: string[]) => void;
  onSaved: (answer: CodesAnswer) => void;
}) {
  const may = xero.permissions.edit_account_codes;
  const rows = codeRows(xero);
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const shown = codeMatches(rows, query);
  const all = useRef<HTMLInputElement>(null);
  const state = shownState(ticked, shown);
  const dirty = codesDirty(xero, ticked);
  const rule = codesProblem(xero, ticked);

  // Select all's mixed state is a DOM property only.
  useEffect(() => {
    if (all.current) all.current.indeterminate = state === "some";
  }, [state]);

  function change(next: string[]) {
    onTicked(next);
    setProblem(null);
  }

  async function save() {
    if (!may || !dirty || rule || saving) return;
    setSaving(true);
    setProblem(null);
    try {
      onSaved(await pettyCashFetch<CodesAnswer>("/settings/xero/account-codes", { method: "PUT", json: { codes: ticked } }));
    } catch (err) {
      setProblem(refusal(err, NOT_SAVED));
    }
    setSaving(false);
  }

  const picked = rows.filter((c) => ticked.includes(c.code));

  return (
    <Card id="account-codes" title="Petty Cash account codes" sub="Only the picked account codes appear when adding an expense in Petty Cash.">
      {!rows.length ? (
        <p className="text-body-m text-text-secondary">No account codes are synced from Xero yet.</p>
      ) : may ? (
        <>
          <Field label="Search account codes">
            {(a11y) => (
              <div className="relative">
                <input
                  {...a11y}
                  type="search"
                  autoComplete="off"
                  placeholder="Search by code or name"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => {
                    // Enter here never saves the card.
                    if (e.key === "Enter") e.preventDefault();
                  }}
                  className={`${inputClass(false)} pr-10`}
                />
                <Icon name="search" className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-text-secondary" />
              </div>
            )}
          </Field>
          <p className="text-body-s text-text-secondary" aria-live="polite">
            {picked.length} of {rows.length} picked
          </p>
          {shown.length ? (
            <ul aria-label="Account codes" className="flex min-w-0 flex-col divide-y divide-border-subtle rounded-lg border border-border-subtle">
              <li>
                <label className="flex min-h-11 cursor-pointer items-center gap-3 px-4 py-2 text-body-m font-semibold text-text-primary hover:bg-state-hover has-focus-visible:outline-2 has-focus-visible:outline-border-focus">
                  <input
                    ref={all}
                    type="checkbox"
                    checked={state === "all"}
                    disabled={saving}
                    onChange={(e) => change(toggleShown(ticked, shown, e.target.checked))}
                    className="size-5 shrink-0 accent-action-primary"
                  />
                  {query.trim() ? "Select all shown" : "Select all"}
                </label>
              </li>
              {shown.map((c) => (
                <li key={c.code}>
                  <label className="flex min-h-11 cursor-pointer items-center gap-3 px-4 py-2 text-body-m text-text-primary hover:bg-state-hover has-focus-visible:outline-2 has-focus-visible:outline-border-focus">
                    <input
                      type="checkbox"
                      checked={ticked.includes(c.code)}
                      disabled={saving}
                      onChange={(e) => change(toggleCode(ticked, c.code, e.target.checked))}
                      className="size-5 shrink-0 accent-action-primary"
                    />
                    <span className="min-w-0 break-words">{codeLabel(c)}</span>
                  </label>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-body-m text-text-secondary">No code matches that search.</p>
          )}
        </>
      ) : picked.length ? (
        <ul aria-label="Picked account codes" className="flex min-w-0 flex-col gap-1 text-body-m text-text-primary">
          {picked.map((c) => (
            <li key={c.code} className="flex min-w-0 items-start gap-2">
              <Icon name="check" size="sm" className="mt-0.5 text-text-link" />
              <span className="min-w-0 break-words">{codeLabel(c)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-body-m text-text-secondary">No account code is picked yet.</p>
      )}
      {problem ? <InlineAlert tone="danger">{problem}</InlineAlert> : null}
      <CardSave id="account-codes" may={may} dirty={dirty} saving={saving} blocked={rule} onSave={() => void save()} />
    </Card>
  );
}

