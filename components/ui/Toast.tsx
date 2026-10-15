"use client";

/**
 * Part 14 "Toast", built here because `@minty/shared/ui` has none yet - minty-payment-request-web's
 * `components/Toast.tsx` look (Part 14 wins there, owner 2026-10-13): one card on the raised
 * surface, a bold "Success" label and the message, a close button; at most 480 wide, bottom-left
 * of the page on a computer and bottom-centre on a phone. No colour or icon by type.
 *
 * A toast confirms something low-risk that already happened ("The link is copied."). Errors never
 * go here: they are inline alerts beside their cause (15.10). It lives 5 s, paused while the
 * pointer or the focus is on it (Part 14: 4-6 s). The region is always in the page, so a new
 * message is announced (aria-live polite).
 */

import { createPortal } from "react-dom";
import { useEffect, useRef, useState } from "react";

import { Icon } from "@minty/shared/ui";

import { useMounted } from "@/components/ui/Sidebar";

const LIFE_MS = 5000;

/** A message to show; a new `id` shows it again even when the words are the same. */
export type ToastMessage = { id: number; message: string };

export function ToastRegion({ toast, onDismiss }: { toast: ToastMessage | null; onDismiss: () => void }) {
  const mounted = useMounted();
  if (!mounted) return null;
  return createPortal(
    <div
      className="pointer-events-none fixed inset-x-4 bottom-[max(16px,env(safe-area-inset-bottom))] z-[500] mx-auto flex max-w-[480px] flex-col gap-2 sm:left-6 sm:right-auto sm:mx-0 sm:w-[min(480px,calc(100vw-3rem))]"
      aria-live="polite"
    >
      {toast ? <ToastCard key={toast.id} message={toast.message} onDismiss={onDismiss} /> : null}
    </div>,
    document.body,
  );
}

/** One toast: its own life, paused while the pointer or the focus is on it. */
function ToastCard({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  const [paused, setPaused] = useState(false);
  const dismiss = useRef(onDismiss);
  useEffect(() => {
    dismiss.current = onDismiss;
  }, [onDismiss]);

  useEffect(() => {
    if (paused) return;
    const timer = window.setTimeout(() => dismiss.current(), LIFE_MS);
    return () => window.clearTimeout(timer);
  }, [paused]);

  return (
    <div
      role="status"
      data-toast-type="success"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      className="pointer-events-auto flex items-start gap-3 rounded-lg border border-border-default bg-surface-raised p-3 text-body-m text-text-primary shadow-overlay"
    >
      <div className="min-w-0 flex-1 py-0.5">
        <p className="font-semibold">Success</p>
        <p className="break-words text-text-secondary">{message}</p>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="-m-1 inline-flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-lg text-text-secondary hover:bg-state-hover hover:text-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus"
      >
        <Icon name="close" size="md" />
      </button>
    </div>
  );
}
