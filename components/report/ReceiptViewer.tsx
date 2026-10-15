"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import { pettyCashBlob } from "@/lib/apiClient";
import type { ExpenseLine } from "@/lib/expenses";

export type ShownReceipt = { url: string; kind: "image" | "pdf" | "other"; name: string };

const MESSAGE = "px-4 py-6 text-center text-sm text-flask-gray-500";

/**
 * Flask's receipt viewer (`components/receipt_viewer_modal.html`): one receipt, full screen, on
 * this page - never a new tab (the user's rule). The whole window, not the phone card: drawn into
 * the document body, over everything. A half-black backdrop, a white card 94% of the height and at
 * most 1024px wide, "Receipt" and the file's name, the receipt, and Close.
 *
 * An image is drawn as Flask draws it, full width. A PDF is the browser's own viewer in an
 * `<object>` of the bytes (Flask draws its pages with pdf.js, which this app does not carry).
 * Escape closes the receipt only, not a modal under it.
 */
export function ReceiptViewer({ receipt, onClose }: { receipt: ShownReceipt; onClose: () => void }) {
  const [broken, setBroken] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopImmediatePropagation();
      onClose();
    };
    // capture: ahead of the Expense Details modal's own Escape underneath
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  let body;
  if (receipt.kind === "image") {
    body = broken ? (
      <p className={MESSAGE}>This image can&apos;t be previewed here.</p>
    ) : (
      // eslint-disable-next-line @next/next/no-img-element -- an object URL of the receipt's bytes
      <img
        src={receipt.url}
        alt={receipt.name || "Receipt"}
        onError={() => setBroken(true)}
        className="mx-auto block h-auto w-full rounded-flask border border-flask-gray-200 bg-flask-white"
      />
    );
  } else if (receipt.kind === "pdf") {
    body = (
      <object data={receipt.url} type="application/pdf" aria-label={receipt.name || "Receipt"} className="block h-full min-h-[60vh] w-full">
        <p className={MESSAGE}>This PDF can&apos;t be previewed here.</p>
      </object>
    );
  } else {
    body = <p className={MESSAGE}>This file can&apos;t be previewed here.</p>;
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-flask-black/50 p-2 sm:p-4"
      onClick={(e) => {
        // a portal still bubbles through React's tree: keep the click from whatever drew the viewer
        e.stopPropagation();
        onClose();
      }}
      onKeyDown={(e) => e.stopPropagation()}
      role="dialog"
      aria-modal="true"
      aria-labelledby="receiptViewerTitle"
    >
      <div
        className="mx-auto flex h-[94vh] w-full min-w-0 max-w-5xl flex-col rounded-flask-lg bg-flask-white p-4 shadow-flask-xl sm:p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 id="receiptViewerTitle" className="text-xl font-bold text-flask-gray-900">
            Receipt
          </h2>
        </div>
        <p className="-mt-3 mb-3 truncate text-sm text-flask-gray-500">{receipt.name}</p>
        <div className="min-h-0 flex-1 overflow-y-auto rounded-flask-lg border border-flask-gray-200 bg-flask-gray-50 p-2">{body}</div>
        <div className="mt-4 flex justify-center">
          <button
            type="button"
            autoFocus
            onClick={onClose}
            className="flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-flask-xl bg-flask-teal px-4 py-3 font-medium text-flask-white transition-colors hover:bg-flask-teal/80"
          >
            Close
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export type ReceiptUrls = Record<string, { url?: string; failed?: boolean }>;

/**
 * A line's receipts as object URLs, read with the bearer from
 * `GET /expense-lines/<id>/receipts/<receipt id>` while `line` is shown, and let go after.
 */
export function useReceiptUrls(line: ExpenseLine | null): ReceiptUrls {
  const [urls, setUrls] = useState<ReceiptUrls>({});
  useEffect(() => {
    if (!line) return;
    let live = true;
    const made: string[] = [];
    for (const receipt of line.receipts) {
      pettyCashBlob(`/expense-lines/${encodeURIComponent(line.id)}/receipts/${encodeURIComponent(receipt.id)}`)
        .then((blob) => {
          const url = URL.createObjectURL(blob);
          made.push(url);
          if (live) setUrls((all) => ({ ...all, [receipt.id]: { url } }));
          else URL.revokeObjectURL(url);
        })
        .catch(() => {
          if (live) setUrls((all) => ({ ...all, [receipt.id]: { failed: true } }));
        });
    }
    return () => {
      live = false;
      made.forEach((url) => URL.revokeObjectURL(url));
      setUrls({});
    };
  }, [line]);
  return urls;
}
