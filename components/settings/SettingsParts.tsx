"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

/**
 * The pieces of Flask's ORIGINAL Petty Cash Settings page (`entity/settings_entity.html`,
 * `static/css/settings_page.css`, Minty `1c25b35^1`), drawn with the `flask-*` tokens: its glyphs,
 * its collapsible card, its buttons, its searchable picker (ThemedSelect's look) and minty-web's
 * confirm dialog (`components/minty_dialog.html`) that it asked with.
 */

/**
 * A Material Symbols glyph at the size its box sets. The package's unlayered `font-size: 24px`
 * beats any utility on the glyph itself, so the glyph inherits and the wrapper is sized.
 */
export function Icon({ name, className = "" }: { name: string; className?: string }) {
  return (
    <span className={`inline-flex shrink-0 ${className}`} aria-hidden="true">
      <span className="material-symbols-rounded" style={{ fontSize: "inherit" }}>
        {name}
      </span>
    </span>
  );
}

export const BTN =
  "inline-flex h-11 items-center justify-center gap-1.5 rounded-flask-lg border px-4 text-sm font-semibold transition-[background-color,opacity] disabled:cursor-not-allowed disabled:opacity-50";
export const BTN_OUTLINE = `${BTN} border-flask-teal bg-flask-white text-flask-teal enabled:hover:bg-flask-teal/10`;
export const BTN_SOLID = `${BTN} border-transparent bg-flask-teal text-flask-white enabled:hover:opacity-90`;

const INPUT =
  "block h-11 w-full rounded-flask-lg border border-flask-set-gray-300 bg-flask-white text-base text-flask-black outline-none transition-[border-color,box-shadow] placeholder:text-flask-set-gray-700 placeholder:opacity-100 focus:border-flask-teal focus:ring-2 focus:ring-flask-teal/25 disabled:cursor-not-allowed disabled:bg-flask-gray-200 disabled:text-flask-set-gray-500 sm:text-sm";
export const TEXT_INPUT = `${INPUT} px-3`;
/** A field's own problem: the red edge Flask's mapping check drew. */
export const INPUT_INVALID = "border-flask-set-red-500 ring-2 ring-flask-set-red-500/20 focus:border-flask-set-red-500 focus:ring-flask-set-red-500/20";

export const LABEL = "block text-sm text-flask-set-gray-600";
export const FIELD_PROBLEM = "m-0 text-sm text-flask-set-red-600";

/** Flask's `.pcs-card`: a heading that folds the card, a sentence under it, the body. Grey when read-only. */
export function SettingsCard({
  title,
  sub,
  readOnly = false,
  collapsible = true,
  children,
  testId,
}: {
  title: string;
  sub: string;
  readOnly?: boolean;
  collapsible?: boolean;
  children: ReactNode;
  testId?: string;
}) {
  const [open, setOpen] = useState(true);
  const bodyId = useId();
  return (
    <section
      data-settings-card={testId}
      aria-label={title}
      className={`rounded-flask-lg border border-flask-gray-200 shadow-flask ${readOnly ? "bg-flask-gray-100" : "bg-flask-white"}`}
    >
      <div className="p-4 sm:px-5">
        <h2 className="m-0 text-[length:inherit] font-[inherit]">
          {collapsible ? (
            <button
              type="button"
              aria-expanded={open}
              aria-controls={bodyId}
              onClick={() => setOpen((o) => !o)}
              className="flex w-full cursor-pointer items-start justify-between gap-3 border-0 bg-transparent p-0 text-left"
            >
              <span className="min-w-0 flex-1 text-base font-semibold text-flask-set-gray-800 sm:text-lg">{title}</span>
              <Icon name="expand_more" className={`text-[24px] text-flask-set-gray-400 transition-transform duration-200 ease-out ${open ? "" : "rotate-180"}`} />
            </button>
          ) : (
            <span className="block text-base font-semibold text-flask-set-gray-800 sm:text-lg">{title}</span>
          )}
        </h2>
        <p className="m-0 text-sm text-flask-set-gray-600">{sub}</p>
      </div>
      <div id={bodyId} hidden={!open} className="flex flex-col gap-3 px-4 pb-4 sm:px-5 sm:pb-5">
        {children}
      </div>
    </section>
  );
}

/** One row of a picker's list: pickable, or a line of information (`info`). */
export type ComboRow = { key: string; label: string; info?: boolean; selected?: boolean; muted?: boolean };

/**
 * Flask's searchable picker (`picker()` in petty_cash_settings.js, ThemedSelect's look): focus or a
 * click lists everything, typing filters, ↑/↓ move, Enter or a click picks, Escape and leaving the
 * box close it - and the box shows the current choice again (`onBlur`). Enter with the list closed
 * is left to the form, so it submits.
 */
export function Combo({
  id,
  value,
  placeholder,
  disabled = false,
  rows,
  onText,
  onPick,
  onBlur,
  rotateChevron = false,
  invalid = false,
  describedBy,
}: {
  id: string;
  value: string;
  placeholder: string;
  disabled?: boolean;
  /** The rows for what is typed ("" when the list opens on focus). */
  rows: (query: string) => ComboRow[];
  onText: (text: string) => void;
  onPick: (key: string) => void;
  onBlur: () => void;
  rotateChevron?: boolean;
  invalid?: boolean;
  describedBy?: string;
}) {
  const listId = `${id}-suggestions`;
  const [query, setQuery] = useState<string | null>(null);
  const [active, setActive] = useState(-1);
  const list = useRef<HTMLDivElement>(null);
  const shown = query === null ? [] : rows(query);
  const pickable = shown.filter((r) => !r.info);
  const open = shown.length > 0;

  useEffect(() => {
    if (active < 0) return;
    list.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView?.({ block: "nearest" });
  }, [active]);

  function openList(q: string) {
    setQuery(q);
    setActive(-1);
  }

  function choose(key: string) {
    setQuery(null);
    setActive(-1);
    onPick(key);
  }

  function onKey(e: KeyboardEvent<HTMLInputElement>) {
    if (!open) return;
    const count = pickable.length;
    if (e.key === "ArrowDown" && count) {
      e.preventDefault();
      setActive((a) => (a + 1) % count);
    } else if (e.key === "ArrowUp" && count) {
      e.preventDefault();
      setActive((a) => (a <= 0 ? count - 1 : a - 1));
    } else if (e.key === "Enter") {
      if (active >= 0 && pickable[active]) {
        e.preventDefault();
        choose(pickable[active].key);
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      setQuery(null);
      onBlur();
    }
  }

  return (
    <div className="relative -mt-0.5">
      <input
        id={id}
        type="text"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={listId}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        autoComplete="off"
        placeholder={placeholder}
        value={value}
        disabled={disabled}
        onFocus={() => openList("")}
        onClick={() => {
          if (!open) openList("");
        }}
        onChange={(e) => {
          onText(e.target.value);
          openList(e.target.value.trim());
        }}
        onBlur={() => {
          setQuery(null);
          onBlur();
        }}
        onKeyDown={onKey}
        className={`${INPUT} cursor-pointer pl-3 pr-14 ${invalid ? INPUT_INVALID : ""}`}
      />
      <span
        aria-hidden="true"
        className={`pointer-events-none absolute inset-y-px right-px flex w-[2.6875rem] items-center justify-center rounded-r-[7px] border-l border-flask-set-gray-300 ${disabled ? "bg-flask-gray-200" : "bg-flask-set-strip"}`}
      >
        <Icon name="expand_more" className={`text-[22px] text-flask-menu transition-transform ${rotateChevron && open ? "rotate-180" : ""}`} />
      </span>
      <div
        id={listId}
        ref={list}
        role="listbox"
        hidden={!open}
        className="absolute inset-x-0 top-[calc(100%+0.25rem)] z-50 m-0 max-h-60 overflow-y-auto rounded-flask-lg border border-flask-set-gray-300 bg-flask-white py-1 shadow-flask-suggest"
      >
        {shown.map((row) => {
          if (row.info) {
            return (
              <div key={row.key} className="px-3 py-2.5 text-sm text-flask-set-gray-500">
                {row.label}
              </div>
            );
          }
          const i = pickable.indexOf(row);
          return (
            <div
              key={row.key}
              role="option"
              data-index={i}
              aria-selected={row.selected ? true : undefined}
              onMouseDown={(e) => {
                // mousedown, so the box's blur cannot close the list first
                e.preventDefault();
                choose(row.key);
              }}
              className={`cursor-pointer px-3 py-2.5 text-sm transition-colors hover:bg-flask-teal/10 ${
                row.selected ? "bg-flask-teal/15 font-semibold text-flask-teal" : i === active ? "bg-flask-teal/15" : ""
              } ${row.selected ? "" : row.muted ? "text-flask-set-gray-600" : "text-flask-black"}`}
            >
              {row.label}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * minty-web's ConfirmDialog as Flask's pages draw it (`MintyDialog.confirm`): a white card over the
 * blurred page, the title with Minty beside it, the sentences, then Go back (grey edge) and the
 * action (red here). Go back is focused first, Tab stays on the two buttons, and Escape or the
 * backdrop answers the safe way.
 */
export function ConfirmDialog({
  title,
  children,
  confirmLabel,
  onBack,
  onConfirm,
}: {
  title: string;
  children: ReactNode;
  confirmLabel: string;
  onBack: () => void;
  onConfirm: () => void;
}) {
  const titleId = useId();
  const back = useRef<HTMLButtonElement>(null);
  const confirm = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const returnTo = document.activeElement as HTMLElement | null;
    back.current?.focus();
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopImmediatePropagation();
        onBack();
      } else if (e.key === "Tab") {
        const first = back.current;
        const last = confirm.current;
        const at = document.activeElement;
        if (e.shiftKey && at === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && at === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      if (returnTo?.isConnected) returnTo.focus();
    };
  }, [onBack]);

  return (
    <div className="fixed inset-0 z-[250] flex items-center justify-center p-4">
      <button type="button" tabIndex={-1} aria-hidden="true" onClick={onBack} className="absolute inset-0 m-0 h-full w-full cursor-default border-0 bg-flask-white/60 p-0 backdrop-blur-[3px]" />
      <div role="dialog" aria-modal="true" aria-labelledby={titleId} className="relative w-full max-w-[435px] rounded-[24px] border border-flask-white/40 bg-flask-white p-12 text-left shadow-flask-dialog">
        <div className="flex items-start justify-between gap-4">
          <h2 id={titleId} className="m-0 min-w-0 flex-1 text-[26px] font-bold leading-tight text-flask-black">
            {title}
          </h2>
          {/* eslint-disable-next-line @next/next/no-img-element -- Flask's fixed-size picture, nothing to optimise */}
          <img src="/img/minty-surprised.png" alt="" width={113} height={144} className="-mr-3 -mt-2 block h-[144px] w-auto max-w-none shrink-0" />
        </div>
        <div className="mt-6 flex flex-col gap-4 text-[15px] leading-[1.375] text-flask-dialog-body [overflow-wrap:anywhere]">{children}</div>
        <div className="-mx-[9px] mt-8 flex gap-5">
          <button
            ref={back}
            type="button"
            onClick={onBack}
            className="h-[66px] flex-1 cursor-pointer rounded-[14px] border border-flask-dialog-edge/30 bg-flask-white px-2 text-lg font-bold leading-tight text-flask-black hover:bg-flask-gray-50"
          >
            Go back
          </button>
          <button
            ref={confirm}
            type="button"
            onClick={onConfirm}
            className="h-[66px] flex-1 cursor-pointer rounded-[14px] border border-transparent bg-flask-dialog-red px-2 text-lg font-bold leading-tight text-flask-white hover:opacity-90"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Flask's busy overlay (`#xeroLoadingOverlay`): the page blurred, a card with the spinner and what is happening. */
export function BusyOverlay({ text }: { text: string }) {
  return (
    <div role="status" aria-live="polite" className="fixed inset-0 z-[300] flex items-center justify-center bg-flask-white/60 p-4 backdrop-blur-[3px]">
      <div className="flex items-center gap-3 rounded-[14px] bg-flask-white px-6 py-4 text-[15px] font-medium leading-[1.375] text-flask-set-gray-700 shadow-flask-dialog">
        <Icon name="progress_activity" className="animate-spin text-[24px] text-flask-teal" />
        <span>{text}</span>
      </div>
    </div>
  );
}
