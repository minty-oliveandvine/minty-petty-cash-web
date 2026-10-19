"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type RefObject } from "react";

import { useToast } from "@/components/flask/Toasts";
import { Modal } from "@/components/report/ReportChrome";
import { ApiError, HOUSE_FALLBACK, pettyCashFetch } from "@/lib/apiClient";
import { DELETE_IN_XERO, DELETE_WARNING, EDIT_PUBLISHED_CONFIRM } from "@/lib/report";
import { shareUrl } from "@/lib/share";
import { stepHref } from "@/lib/wizardPages";

const UNREACHABLE = "We couldn't reach Petty Cash. Check your connection, then reload the page.";
const COPY_FAILED = "Failed to copy link";

type Reopened = { report_id: string; transaction_date: string; status: "draft"; next: "opening" };

const CLOSE_ICON = (
  <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
  </svg>
);

const NOTE_ICON = (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor" className="h-5 w-5 text-flask-danger" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
  </svg>
);

/** Flask's Export Options item: the round slate button with the share glyph, "Share" under it. */
export function ShareButton({ onClick }: { onClick: () => void }) {
  return (
    <div className="flex flex-col items-center gap-2 sm:gap-3">
      <button
        type="button"
        onClick={onClick}
        aria-label="Share"
        className="flex h-12 w-12 items-center justify-center rounded-full bg-flask-slate-100 transition duration-300 hover:-translate-y-0.5 hover:shadow-flask-lift focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-flask-teal sm:h-16 sm:w-16"
      >
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="h-5 w-5 text-flask-olive sm:h-6 sm:w-6" aria-hidden="true">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M7.217 10.907a2.25 2.25 0 1 0 0 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186 9.566-5.314m-9.566 7.5 9.566 5.314m0 0a2.25 2.25 0 1 0 3.935 2.186 2.25 2.25 0 0 0-3.935-2.186Zm0-12.814a2.25 2.25 0 1 0 3.933-2.185 2.25 2.25 0 0 0-3.933 2.185Z"
          />
        </svg>
      </button>
      <span className="text-sm text-flask-gray-700" aria-hidden="true">
        Share
      </span>
    </div>
  );
}

/**
 * Edit Report (a report's view) and Edit (report history), as Flask's `handleEditReport`: its
 * confirm first for a report that has been to Xero, "Converting report to draft...", `POST
 * /reports/<id>/reopen`, "Back to draft — opening it for you now.", then this app's Opening for
 * the day. A refusal says the API's sentence. `actingRef` is the page's one-action-at-a-time guard.
 */
export function useEditReport(entityId: string, entityName: string, actingRef: RefObject<boolean>) {
  const toast = useToast();
  const router = useRouter();
  return async function edit(reportId: string, wasPublished: boolean) {
    if (actingRef.current) return;
    if (wasPublished && !window.confirm(EDIT_PUBLISHED_CONFIRM)) return;
    actingRef.current = true;
    toast("Converting report to draft...", "info");
    try {
      const answer = await pettyCashFetch<Reopened>(`/reports/${encodeURIComponent(reportId)}/reopen`, { method: "POST" });
      toast("Back to draft — opening it for you now.", "success");
      router.push(stepHref(entityId, entityName, "opening", answer.transaction_date));
    } catch (err) {
      actingRef.current = false;
      if (err instanceof ApiError && err.status === 401) return;
      toast(err instanceof ApiError ? err.message : UNREACHABLE, "error");
    }
  };
}

/**
 * Flask's share: the modal opens at once saying "Generating link...", then `POST
 * /reports/<id>/share-link` fills in the link. A refusal closes it and says the API's sentence.
 * `link` is null while closed, `{url: null}` while the link is being made.
 *
 * The link is this app's own public page, `<origin>/share/<path>` (app/share, lib/share.ts), built
 * from the answer's `path`; its `url` is Flask's old page and is not used. An answer without a
 * usable path closes the modal with the house sentence rather than show a link that cannot work.
 */
export function useShareLink(reportId: string) {
  const toast = useToast();
  const [link, setLink] = useState<{ url: string | null } | null>(null);
  // the latest request: a link that arrives after the modal was closed is dropped
  const ticket = useRef(0);

  async function open() {
    const mine = ++ticket.current;
    setLink({ url: null });
    try {
      const answer = await pettyCashFetch<{ path?: unknown }>(`/reports/${encodeURIComponent(reportId)}/share-link`, { method: "POST" });
      if (ticket.current !== mine) return;
      const url = shareUrl(window.location.origin, answer?.path);
      if (url) {
        setLink({ url });
      } else {
        setLink(null);
        toast(HOUSE_FALLBACK, "error");
      }
    } catch (err) {
      if (ticket.current !== mine || (err instanceof ApiError && err.status === 401)) return;
      setLink(null);
      toast(err instanceof ApiError ? err.message : UNREACHABLE, "error");
    }
  }

  function close() {
    ticket.current += 1;
    setLink(null);
  }

  return { link, open, close };
}

/**
 * Flask's "Share Report" (#shareLinkModal): the 30-day sentence, the link in a read-only field with
 * Copy beside it, "Link copied to clipboard!" for three seconds, and Close.
 */
export function ShareModal({ url, onClose }: { url: string | null; onClose: () => void }) {
  const toast = useToast();
  const field = useRef<HTMLInputElement>(null);
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  function shown() {
    setCopied(true);
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopied(false), 3000);
  }

  async function copy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      shown();
    } catch {
      // no Clipboard API here (or no permission): Flask's way, the field selected and copied
      field.current?.select();
      field.current?.setSelectionRange(0, 99999);
      if (document.execCommand("copy")) shown();
      else toast(COPY_FAILED, "error");
    }
  }

  return (
    <Modal titleId="shareReportTitle" onClose={onClose} wide className="rounded-flask-lg bg-flask-white p-6">
      <div className="mb-6 flex items-center justify-between">
        <h2 id="shareReportTitle" className="text-xl font-bold text-flask-gray-900">
          Share Report
        </h2>
        <button type="button" onClick={onClose} aria-label="Close" className="text-flask-gray-400 hover:text-flask-gray-600">
          {CLOSE_ICON}
        </button>
      </div>

      <div className="mb-6">
        <p className="mb-4 text-sm text-flask-gray-600">Share this link to allow others to view this report. The link will expire in 30 days.</p>
        <div className="flex items-center gap-2">
          <input
            ref={field}
            type="text"
            readOnly
            disabled={!url}
            value={url ?? ""}
            placeholder="Generating link..."
            aria-label="Share link"
            className="min-w-0 flex-1 rounded-flask-lg border border-flask-gray-300 bg-flask-gray-50 px-4 py-2 text-sm"
          />
          <button
            type="button"
            onClick={() => void copy()}
            disabled={!url}
            className="whitespace-nowrap rounded-flask-lg bg-flask-teal px-4 py-2 font-medium text-flask-white transition-colors hover:bg-flask-teal/80"
          >
            Copy
          </button>
        </div>
        {copied ? (
          <p className="mt-2 text-sm text-flask-green-ink" role="status">
            Link copied to clipboard!
          </p>
        ) : null}
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={onClose}
          className="rounded-flask-lg border-2 border-flask-gray-300 px-4 py-2 font-medium text-flask-gray-700 transition-colors hover:bg-flask-gray-50"
        >
          Close
        </button>
      </div>
    </Modal>
  );
}

/**
 * Flask's "Delete Report" (#deleteReportModal): the red warning, then Cancel / Delete. A report that
 * has been to Xero is warned about first (the owner's rule, 2026-10-15, in Flask's own words).
 */
export function DeleteReportModal({ wasPublished, onCancel, onDelete }: { wasPublished: boolean; onCancel: () => void; onDelete: () => void }) {
  return (
    <Modal titleId="deleteReportTitle" onClose={onCancel} className="rounded-flask-lg bg-flask-white p-6">
      <div className="mb-6 flex items-center justify-between">
        <h2 id="deleteReportTitle" className="text-xl font-bold text-flask-gray-900">
          Delete Report
        </h2>
        <button type="button" onClick={onCancel} aria-label="Close" className="text-flask-gray-400 hover:text-flask-gray-600">
          {CLOSE_ICON}
        </button>
      </div>

      {wasPublished ? (
        <div className="mb-4 flex items-start rounded-[8px] border-l-4 border-l-flask-amber-edge bg-flask-amber-bg px-4 py-3">
          <svg className="mr-3 mt-0.5 flex-shrink-0" width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <circle cx="10" cy="10" r="9" className="fill-flask-amber-bg stroke-flask-amber" strokeWidth="2" />
            <rect x="9" y="8" width="2" height="5" rx="1" className="fill-flask-amber" />
            <rect x="9" y="5" width="2" height="2" rx="1" className="fill-flask-amber" />
          </svg>
          <div className="min-w-0">
            <p className="mb-1 text-sm font-bold text-flask-amber-ink">{DELETE_IN_XERO.title}</p>
            <p className="text-sm leading-snug text-flask-amber-ink">{DELETE_IN_XERO.body}</p>
          </div>
        </div>
      ) : null}

      <div className="mb-6 rounded-flask-lg border border-flask-danger-edge bg-flask-danger-bg p-4">
        <div className="flex items-start">
          <div className="flex-shrink-0">{NOTE_ICON}</div>
          <div className="ml-3">
            <p className="text-sm text-flask-danger-ink">
              <span className="font-bold">Warning:</span>
            </p>
            <p className="mt-1 text-sm text-flask-danger-ink">{DELETE_WARNING}</p>
          </div>
        </div>
      </div>

      <div className="flex gap-3">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 rounded-flask-xl border-2 border-flask-teal px-4 py-3 font-medium text-flask-teal transition-colors hover:bg-flask-teal/10"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="flex flex-1 items-center justify-center gap-2 rounded-flask-xl bg-flask-teal px-4 py-3 font-medium text-flask-white transition-colors hover:bg-flask-teal/80"
        >
          <span>Delete</span>
        </button>
      </div>
    </Modal>
  );
}
