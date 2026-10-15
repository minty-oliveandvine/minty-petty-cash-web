"use client";

/**
 * Part 14 "Menu · Menu item" as a record's More (overflow) menu, built here because
 * `@minty/shared/ui` has none yet: rare and destructive actions one step away (D15-14), the
 * Danger item last over a divider; a Danger item opens a Confirmation modal (the caller's).
 *
 * The trigger is an icon button named for the record ("More report actions") with
 * `aria-haspopup="menu"` and `aria-expanded`. Open, the focus goes to the first item; ↑ ↓ Home End
 * move, Enter chooses, Escape and Tab close it and the focus goes back to the trigger; a click
 * anywhere else closes it. Under the trigger on a computer (240 wide, right-aligned); a bottom
 * sheet over the scrim on a phone (Part 14: "On phone opens as a bottom sheet with the same items").
 */

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";

import { buttonClass, Icon } from "@minty/shared/ui";

export type MoreItem = { key: string; label: string; icon: string; danger?: boolean } & ({ onSelect: () => void } | { href: string });

const ITEM =
  "flex min-h-11 w-full min-w-0 cursor-pointer items-center gap-3 px-4 py-2 text-left text-body-m hover:bg-state-hover focus-visible:bg-state-hover focus-visible:outline-none";

export function MoreMenu({ label, items }: { label: string; items: MoreItem[] }) {
  const menuId = useId();
  const wrap = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

  const entries = () => Array.from(menu.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);

  useEffect(() => {
    if (!open) return;
    entries()[0]?.focus();
    const onDown = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  function close(refocus: boolean) {
    setOpen(false);
    if (refocus) trigger.current?.focus();
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const all = entries();
    const at = all.indexOf(document.activeElement as HTMLElement);
    const move = (to: number) => {
      e.preventDefault();
      all[(to + all.length) % all.length]?.focus();
    };
    if (e.key === "ArrowDown") move(at + 1);
    else if (e.key === "ArrowUp") move(at - 1);
    else if (e.key === "Home") move(0);
    else if (e.key === "End") move(all.length - 1);
    else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      close(true);
    } else if (e.key === "Tab") close(false);
  }

  if (items.length === 0) return null;
  return (
    <div ref={wrap} className="relative shrink-0">
      <button
        ref={trigger}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((o) => !o)}
        className={`${buttonClass("secondary")} w-11 overflow-hidden px-0!`}
      >
        <Icon name="more_horiz" size="md" />
      </button>
      {open ? (
        <>
          {/* The phone's bottom sheet sits over the Part 13 scrim; a click on it closes the menu. */}
          <div className="fixed inset-0 z-[200] bg-overlay-scrim sm:hidden" aria-hidden onClick={() => close(true)} />
          <div
            ref={menu}
            id={menuId}
            role="menu"
            aria-label={label}
            onKeyDown={onKeyDown}
            className="fixed inset-x-0 bottom-0 z-[210] flex flex-col rounded-t-xl bg-surface-raised py-2 pb-[max(8px,env(safe-area-inset-bottom))] shadow-modal sm:absolute sm:inset-x-auto sm:bottom-auto sm:right-0 sm:top-full sm:mt-1 sm:w-60 sm:rounded-lg sm:border sm:border-border-default sm:py-1 sm:shadow-overlay"
          >
            {items.map((item) => {
              const tone = item.danger ? "border-t border-border-subtle text-action-danger" : "text-text-primary";
              const body = (
                <>
                  <Icon name={item.icon} size="md" />
                  <span className="min-w-0 break-words">{item.label}</span>
                </>
              );
              return "href" in item ? (
                // A full-page address (another app's page): a plain link.
                <a key={item.key} role="menuitem" tabIndex={-1} href={item.href} className={`${ITEM} ${tone}`}>
                  {body}
                </a>
              ) : (
                <button
                  key={item.key}
                  type="button"
                  role="menuitem"
                  tabIndex={-1}
                  className={`${ITEM} ${tone}`}
                  onClick={() => {
                    // The trigger holds the focus first, so a dialog this opens hands it back there.
                    close(true);
                    item.onSelect();
                  }}
                >
                  {body}
                </button>
              );
            })}
          </div>
        </>
      ) : null}
    </div>
  );
}
