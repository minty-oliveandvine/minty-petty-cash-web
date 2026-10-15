"use client";

/**
 * The app's ONE full-screen file view (Part 14 Document viewer, full screen on a phone; the
 * owner's rule: files open full screen, never in a new tab and never as a download).
 *
 * It takes the file's bytes from `source` - a receipt saved on a line is read from the API with
 * the bearer (`pettyCashBlob`), one still being added is the picked File - and draws them from an
 * object URL it owns and revokes: an image in `<img>`, a PDF in the browser's own viewer in an
 * `<iframe>` (pdf.js is not a dependency of this app). A read that fails says why, in place.
 *
 * Escape closes it in the CAPTURE phase on `window`, before the Drawer's document listener, so
 * one Escape closes exactly this layer and leaves the entry form under it open. Focus starts on
 * Close, stays inside, and goes back to what opened it.
 */

import { createPortal } from "react-dom";
import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from "react";

import { InlineAlert, Skeleton } from "@minty/shared/ui";
import { pushAppScrollLock } from "@minty/shared/scrollLock";

import { ApiError } from "@/lib/apiClient";
import { receiptKind } from "@/lib/expenses";

const UNREACHABLE = "We couldn't open this receipt. Check your connection, then try again.";
const FOCUSABLE = 'a[href], button:not([disabled]), iframe, [tabindex]:not([tabindex="-1"])';

export type ViewerFile = {
  name: string;
  mime: string | null;
  /** The bytes: a Blob now (a picked file), or a read (a saved receipt). */
  source: Blob | (() => Promise<Blob>);
};

type Shown = { kind: "loading" } | { kind: "ready"; url: string; mime: string } | { kind: "failed"; message: string };

export default function ReceiptViewer({ file, onClose }: { file: ViewerFile; onClose: () => void }) {
  const titleId = useId();
  const root = useRef<HTMLDivElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const [shown, setShown] = useState<Shown>({ kind: "loading" });

  useEffect(() => {
    let live = true;
    let url: string | null = null;
    const blob = typeof file.source === "function" ? file.source() : Promise.resolve(file.source);
    blob
      .then((b) => {
        if (!live) return;
        url = URL.createObjectURL(b);
        // The API types the bytes by what they are; a picked file by what the browser says.
        setShown({ kind: "ready", url, mime: b.type || file.mime || "" });
      })
      .catch((err: unknown) => {
        // A 401 has already gone back through the hand-off.
        if (!live || (err instanceof ApiError && err.status === 401)) return;
        setShown({ kind: "failed", message: err instanceof ApiError ? err.message : UNREACHABLE });
      });
    return () => {
      live = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [file]);

  useEffect(() => pushAppScrollLock(), []);

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopImmediatePropagation();
      onClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeButton.current?.focus();
    return () => {
      if (opener?.isConnected) opener.focus();
    };
  }, []);

  const trap = useCallback((e: KeyboardEvent) => {
    if (e.key !== "Tab" || !root.current) return;
    const items = Array.from(root.current.querySelectorAll<HTMLElement>(FOCUSABLE));
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }, []);

  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      ref={root}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onKeyDown={trap}
      // Above the Drawer (250) and a Modal (300); the document canvas stays light (Part 13).
      className="fixed inset-0 z-[340] flex flex-col bg-surface-document"
    >
      <div className="flex min-w-0 shrink-0 items-center justify-between gap-2 border-b border-border-subtle bg-surface-card px-3 py-2 pt-[max(8px,env(safe-area-inset-top))] sm:px-4">
        <p id={titleId} className="min-w-0 truncate text-body-m font-semibold text-text-primary" title={file.name}>
          {file.name}
        </p>
        <button
          ref={closeButton}
          type="button"
          onClick={onClose}
          aria-label="Close receipt"
          className="inline-flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-lg text-text-secondary hover:bg-state-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus"
        >
          <span className="material-symbols-rounded" style={{ fontSize: 24 }} aria-hidden>
            close
          </span>
        </button>
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-auto p-2 sm:p-4">
        {shown.kind === "loading" ? (
          <div role="status" aria-label="Opening the receipt" className="mx-auto flex w-full max-w-3xl flex-1">
            <Skeleton className="h-full min-h-60 w-full" />
          </div>
        ) : shown.kind === "failed" ? (
          <div className="mx-auto w-full max-w-xl">
            <InlineAlert tone="danger">{shown.message}</InlineAlert>
          </div>
        ) : receiptKind(shown.mime) === "pdf" ? (
          <iframe src={shown.url} title={file.name} className="mx-auto block min-h-0 w-full max-w-5xl flex-1 rounded-lg border border-border-default bg-surface-card" />
        ) : receiptKind(shown.mime) === "image" ? (
          // eslint-disable-next-line @next/next/no-img-element -- an object URL; next/image cannot optimise it
          <img src={shown.url} alt={`Receipt: ${file.name}`} className="mx-auto block h-auto max-h-full w-auto max-w-full object-contain" draggable={false} />
        ) : (
          <div className="mx-auto w-full max-w-xl">
            <InlineAlert tone="info">This file can&apos;t be shown here. It isn&apos;t a PDF, JPEG or PNG.</InlineAlert>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
