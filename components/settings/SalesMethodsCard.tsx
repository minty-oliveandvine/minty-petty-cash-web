"use client";

import { useEffect, useId, useRef, useState } from "react";

import {
  BTN_OUTLINE,
  BTN_SOLID,
  Combo,
  FIELD_PROBLEM,
  INPUT_INVALID,
  Icon,
  LABEL,
  SettingsCard,
  TEXT_INPUT,
  type ComboRow,
} from "@/components/settings/SettingsParts";
import {
  ADD_NAME_MAX,
  KIND,
  NAME_EMPTY,
  RENAME_NAME_MAX,
  catalogueOptions,
  methodNameProblem,
  sharedRenameMessage,
  type CatalogueMethod,
  type MethodType,
  type SalesMethod,
  type SettingsPermissions,
} from "@/lib/settings";

const OTHER = "__other__";
const OTHER_LABEL = "Other";

/** What the card asks the page to send; each resolves true once the API said yes. */
export type MethodActions = {
  add: (type: MethodType, body: { sale_info_id: string } | { name: string }) => Promise<boolean>;
  rename: (method: SalesMethod, name: string) => Promise<boolean>;
  move: (type: MethodType, index: number, step: -1 | 1) => void;
  remove: (type: MethodType, method: SalesMethod) => void;
  /** Flask's error toast. */
  say: (message: string) => void;
};

/**
 * One of Flask's Electronic / Delivery cards (`partials/electronic_delivery_section.html`): the
 * methods in order, a name to click for a rename, the ⋮ with Move up, Move down and Delete, and
 * "Add New Method" - the catalogue picker, or "+ Other" for a new name. Each change is the API's
 * at once (Flask's page held them for its one Save); the page shows what the API answers.
 */
export function SalesMethodsCard({
  type,
  methods,
  available,
  permissions,
  busy,
  menuOpen,
  onMenu,
  actions,
}: {
  type: MethodType;
  methods: SalesMethod[];
  available: CatalogueMethod[];
  permissions: SettingsPermissions;
  busy: boolean;
  /** The method whose ⋮ is open (one on the page at a time), or null. */
  menuOpen: string | null;
  onMenu: (id: string | null) => void;
  actions: MethodActions;
}) {
  const kind = KIND[type];
  const editable =
    permissions.add_sales_method ||
    permissions.rename_sales_method ||
    permissions.remove_sales_method ||
    permissions.reorder_sales_methods;
  const hasMenu = permissions.reorder_sales_methods || permissions.remove_sales_method;
  const [renaming, setRenaming] = useState<string | null>(null);
  // a shared method's name was clicked: why it can't be renamed, under its row
  const [sharedNote, setSharedNote] = useState<string | null>(null);
  const noteId = useId();
  const [adding, setAdding] = useState(false);

  let note: string | null = null;
  if (!permissions.view_sales_methods)
    note = "You can't see the sales methods. Ask an Accountant or an Admin.";
  else if (!methods.length) note = `No ${kind.title.toLowerCase()} methods yet.`;

  return (
    <SettingsCard title={kind.title} sub={kind.sub} readOnly={!editable} testId={type}>
      {note ? (
        <p className="m-0 px-3 py-2 text-sm text-flask-set-gray-500" role="status">
          {note}
        </p>
      ) : null}
      <ul className="m-0 list-none p-0" aria-label={`${kind.title} methods`}>
        {methods.map((method, index) => (
          <li key={method.id} data-method={method.name}>
            <div className="flex min-h-12 items-center justify-between gap-3 border-b border-flask-gray-100 py-1 pl-3 pr-1">
              {renaming === method.id ? (
                <RenameBox
                  method={method}
                  listed={methods}
                  onDone={() => setRenaming(null)}
                  onCommit={(name) => actions.rename(method, name)}
                />
              ) : permissions.rename_sales_method ? (
                <button
                  type="button"
                  title="Rename"
                  disabled={busy}
                  aria-describedby={sharedNote === method.id ? noteId : undefined}
                  onClick={() => {
                    if (method.shared) {
                      setSharedNote(method.id);
                      return;
                    }
                    setSharedNote(null);
                    setRenaming(method.id);
                  }}
                  className="m-0 min-w-0 cursor-text truncate border-0 bg-transparent p-0 text-left text-base text-flask-set-gray-700 hover:text-flask-teal"
                >
                  {method.name}
                </button>
              ) : (
                <span className="min-w-0 truncate text-base text-flask-set-gray-700">
                  {method.name}
                </span>
              )}
              {hasMenu && renaming !== method.id ? (
                <RowMenu
                  method={method}
                  open={menuOpen === method.id}
                  onToggle={() => onMenu(menuOpen === method.id ? null : method.id)}
                  items={[
                    ...(permissions.reorder_sales_methods
                      ? [
                          {
                            label: "Move up",
                            disabled: busy || index === 0,
                            run: () => actions.move(type, index, -1),
                          },
                          {
                            label: "Move down",
                            disabled: busy || index === methods.length - 1,
                            run: () => actions.move(type, index, 1),
                          },
                        ]
                      : []),
                    ...(permissions.remove_sales_method
                      ? [
                          {
                            label: "Delete",
                            disabled: busy,
                            run: () => actions.remove(type, method),
                          },
                        ]
                      : []),
                  ]}
                  close={() => onMenu(null)}
                />
              ) : null}
            </div>
            {sharedNote === method.id ? (
              <p id={noteId} role="status" className={`${FIELD_PROBLEM} px-3 pb-2 pt-1`}>
                {sharedRenameMessage(method.name)}
              </p>
            ) : null}
          </li>
        ))}
      </ul>

      {permissions.add_sales_method ? (
        adding ? (
          <AddForm
            type={type}
            methods={methods}
            available={available}
            busy={busy}
            actions={actions}
            onClose={() => setAdding(false)}
          />
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={() => setAdding(true)}
            className={`${BTN_OUTLINE} w-full`}
          >
            <Icon name="add" className="text-[20px]" />
            Add New Method
          </button>
        )
      ) : null}
    </SettingsCard>
  );
}

/** Flask's rename: the name becomes a box; Enter or leaving saves, Escape puts it back. */
function RenameBox({
  method,
  listed,
  onDone,
  onCommit,
}: {
  method: SalesMethod;
  listed: SalesMethod[];
  onDone: () => void;
  onCommit: (name: string) => Promise<boolean>;
}) {
  const [text, setText] = useState(method.name);
  const box = useRef<HTMLInputElement>(null);
  const problemId = useId();
  const problem = methodNameProblem(text, listed, RENAME_NAME_MAX, method.id);
  // a ref: Enter then the blur it causes must send once
  const done = useRef(false);

  useEffect(() => {
    box.current?.focus();
    box.current?.select();
  }, []);

  async function finish(commit: boolean) {
    if (done.current) return;
    const next = text.trim();
    // nothing typed, or the same name: put it back, as Flask did
    if (!commit || !next || next === method.name) {
      done.current = true;
      onDone();
      return;
    }
    if (problem) return; // said under the box; the box stays
    done.current = true;
    await onCommit(next);
    onDone();
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1 py-1">
      <input
        ref={box}
        type="text"
        value={text}
        aria-label={`Rename ${method.name}`}
        aria-invalid={problem ? true : undefined}
        aria-describedby={problem ? problemId : undefined}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            void finish(true);
          } else if (e.key === "Escape") {
            e.preventDefault();
            void finish(false);
          }
        }}
        onBlur={() => void finish(true)}
        className={`m-0 h-9 w-full min-w-0 max-w-80 rounded-flask-md border border-flask-set-gray-300 bg-flask-white px-2 text-base text-flask-black outline-none focus:border-flask-teal focus:ring-2 focus:ring-flask-teal/25 ${problem ? INPUT_INVALID : ""}`}
      />
      {problem ? (
        <p id={problemId} className={FIELD_PROBLEM}>
          {problem}
        </p>
      ) : null}
    </div>
  );
}

/** minty-web's RowMenu as Flask drew it: the ⋮, then a 201px card of actions. */
function RowMenu({
  method,
  open,
  onToggle,
  items,
  close,
}: {
  method: SalesMethod;
  open: boolean;
  onToggle: () => void;
  items: { label: string; disabled: boolean; run: () => void }[];
  close: () => void;
}) {
  const menuId = useId();
  const button = useRef<HTMLButtonElement>(null);
  return (
    <div className="relative flex shrink-0 items-center" data-row-menu>
      <button
        ref={button}
        type="button"
        onClick={onToggle}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={`Actions for ${method.name}`}
        // 44px wide for a finger without moving Flask's 32px button
        className="relative m-0 flex h-10 w-8 cursor-pointer items-center justify-center rounded-flask-md border-0 bg-transparent p-0 text-[26px] font-bold leading-none text-flask-set-dots before:absolute before:-inset-x-1.5 before:-inset-y-0.5 before:content-[''] hover:bg-flask-gray-100"
      >
        ⋮
      </button>
      {open ? (
        <ul
          id={menuId}
          role="menu"
          aria-label={`Actions for ${method.name}`}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              close();
              button.current?.focus();
            }
          }}
          className="absolute right-0 top-[calc(100%+0.25rem)] z-30 m-0 w-[201px] list-none rounded-[14px] bg-flask-white py-2 shadow-flask-row-menu"
        >
          {items.map((item) => (
            <li key={item.label} role="none">
              <button
                type="button"
                role="menuitem"
                disabled={item.disabled}
                onClick={() => {
                  close();
                  item.run();
                }}
                className="m-0 block w-full cursor-pointer border-0 bg-transparent px-[22px] py-[7px] text-left text-[15px] leading-6 text-flask-set-menu-ink enabled:hover:bg-flask-gray-50 disabled:cursor-not-allowed disabled:text-flask-set-menu-off"
              >
                {item.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

type Choice = { id: string; name: string } | "other" | null;

/** "Add New Method": the catalogue picker, "+ Other" for a new name, Cancel / Add. */
function AddForm({
  type,
  methods,
  available,
  busy,
  actions,
  onClose,
}: {
  type: MethodType;
  methods: SalesMethod[];
  available: CatalogueMethod[];
  busy: boolean;
  actions: MethodActions;
  onClose: () => void;
}) {
  const kind = KIND[type];
  const catalogId = useId();
  const nameId = useId();
  const nameProblemId = useId();
  const [text, setText] = useState("");
  const [choice, setChoice] = useState<Choice>(null);
  const [name, setName] = useState("");
  const [refusedEmpty, setRefusedEmpty] = useState(false);
  const catalog = useRef<HTMLInputElement | null>(null);
  const nameBox = useRef<HTMLInputElement>(null);
  const nameProblem =
    methodNameProblem(name, methods, ADD_NAME_MAX) ??
    (refusedEmpty && !name.trim() ? NAME_EMPTY : null);

  useEffect(() => {
    catalog.current = document.getElementById(catalogId) as HTMLInputElement | null;
    catalog.current?.focus();
  }, [catalogId]);

  useEffect(() => {
    if (choice === "other") nameBox.current?.focus();
  }, [choice]);

  function rows(query: string): ComboRow[] {
    const offered = catalogueOptions(available, query);
    const out: ComboRow[] = offered.map((m) => ({ key: m.id, label: m.name }));
    if (!offered.length)
      out.push({ key: "none", label: `No matching ${kind.noun} found`, info: true });
    // "Other" always stays reachable: it opens the Name box for a brand new method
    out.push({ key: OTHER, label: "+ Other (type a new name)", muted: true });
    return out;
  }

  async function commit() {
    if (busy) return;
    if (choice === "other") {
      const wanted = name.trim();
      if (!wanted) {
        setRefusedEmpty(true);
        nameBox.current?.focus();
        return;
      }
      if (nameProblem) {
        nameBox.current?.focus();
        return;
      }
      if (await actions.add(type, { name: wanted })) onClose();
      return;
    }
    if (choice) {
      if (await actions.add(type, { sale_info_id: choice.id })) onClose();
      return;
    }
    actions.say("Pick a method from the list, or Other.");
    catalog.current?.focus();
  }

  return (
    <form
      className="flex flex-col gap-2"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void commit();
      }}
    >
      <label className={LABEL} htmlFor={catalogId}>
        Method
      </label>
      <Combo
        id={catalogId}
        value={text}
        placeholder={kind.pick}
        rows={rows}
        rotateChevron
        onText={(t) => {
          // typing filters the list; nothing is chosen until a row is picked
          setText(t);
          setChoice(null);
        }}
        onPick={(key) => {
          if (key === OTHER) {
            setChoice("other");
            setText(OTHER_LABEL);
            setName("");
            setRefusedEmpty(false);
            return;
          }
          const picked = available.find((m) => m.id === key);
          if (!picked) return;
          setChoice({ id: picked.id, name: picked.name });
          setText(picked.name);
        }}
        onBlur={() => setText((t) => (choice === "other" ? OTHER_LABEL : choice ? choice.name : t))}
      />
      {choice === "other" ? (
        <div className="flex flex-col gap-2">
          <label className={LABEL} htmlFor={nameId}>
            Name
          </label>
          <input
            ref={nameBox}
            id={nameId}
            type="text"
            autoComplete="off"
            placeholder={kind.enter}
            value={name}
            aria-invalid={nameProblem ? true : undefined}
            aria-describedby={nameProblem ? nameProblemId : undefined}
            onChange={(e) => setName(e.target.value)}
            className={`${TEXT_INPUT} -mt-0.5 ${nameProblem ? INPUT_INVALID : ""}`}
          />
          {nameProblem ? (
            <p id={nameProblemId} className={FIELD_PROBLEM}>
              {nameProblem}
            </p>
          ) : null}
        </div>
      ) : null}
      <div className="flex gap-3">
        <button type="button" onClick={onClose} className={`${BTN_OUTLINE} flex-1`}>
          Cancel
        </button>
        <button type="submit" disabled={busy} className={`${BTN_SOLID} flex-1`}>
          Add
        </button>
      </div>
    </form>
  );
}
