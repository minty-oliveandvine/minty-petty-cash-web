"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { useToast } from "@/components/flask/Toasts";
import { Modal } from "@/components/report/ReportChrome";
import { PUBLISH_WORDS, partialMessage, publishingLabel, runPublish, type PublishEnd } from "@/lib/publish";
import { settingsTabUrl } from "@/lib/settings";

/** Where the publish was started: Flask's two pages word their modal and their toasts differently. */
export type PublishPlace = "submitted" | "history";

/** A publish asked for: straight away, or after the republish confirm (`duplicate`: warn of duplicates). */
export type PublishAsk = { reportId: string; confirm: null | { duplicate: boolean } };

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

const SPINNER_PATH = "M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z";
const CANCEL = "flex-1 rounded-flask-xl border-2 border-flask-teal px-4 py-3 font-medium text-flask-teal transition-colors hover:bg-flask-teal/10";
const CONFIRM = "flex flex-1 items-center justify-center gap-2 rounded-flask-xl bg-flask-teal px-4 py-3 font-medium text-flask-white transition-colors hover:bg-flask-teal/80";

/**
 * Flask's "Republish Report" (#republishReportModal), each page's own words: the Submitted page
 * always warns of duplicates; report history only for a report fully in Xero (a partly published
 * one is re-sent selectively), then "Still want to go ahead?". Cancel / Confirm.
 */
export function RepublishModal({ place, duplicate, onCancel, onConfirm }: { place: PublishPlace; duplicate: boolean; onCancel: () => void; onConfirm: () => void }) {
  return (
    <Modal titleId="republishReportTitle" onClose={onCancel} className="rounded-flask-lg bg-flask-white p-6">
      <div className="relative mb-6 flex items-center justify-center">
        <h2 id="republishReportTitle" className="text-xl font-bold text-flask-gray-900">
          Republish Report
        </h2>
        <button type="button" onClick={onCancel} aria-label="Close" className="absolute right-0 text-flask-gray-400 hover:text-flask-gray-600">
          {CLOSE_ICON}
        </button>
      </div>

      <div className="mb-6 rounded-flask-lg border border-flask-danger-edge bg-flask-danger-bg p-4">
        <div className="flex items-start">
          <div className="flex-shrink-0">{NOTE_ICON}</div>
          <div className="ml-3">
            {place === "submitted" ? (
              <>
                <p className="text-sm text-flask-danger-ink">This report was previously published. This action may create duplicate entries in Xero.</p>
                <p className="mt-2 text-sm text-flask-danger-ink">Do you wish to continue?</p>
              </>
            ) : (
              <>
                {duplicate ? <p className="text-sm text-flask-danger-ink">I&apos;ve already published this report — republishing may create duplicates in Xero.</p> : null}
                <p className="mt-2 text-sm text-flask-danger-ink">Still want to go ahead?</p>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="flex gap-3">
        <button type="button" onClick={onCancel} className={CANCEL}>
          Cancel
        </button>
        <button type="button" onClick={onConfirm} className={CONFIRM}>
          <span>Confirm</span>
        </button>
      </div>
    </Modal>
  );
}

/**
 * Flask's full-screen publishing overlay (#publishingOverlay): the spinner, the label, the bar and
 * its percentage, "Please do not close or navigate away.". After the cap it says the publish is
 * still going and offers to check again.
 */
function PublishingOverlay({ label, percent, slow, onCheck, onClose }: { label: string; percent: number; slow: boolean; onCheck: () => void; onClose: () => void }) {
  const check = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (slow) check.current?.focus();
  }, [slow]);
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-flask-black/60 p-4">
      <div
        role={slow ? "alertdialog" : "dialog"}
        aria-modal="true"
        aria-labelledby="publishingOverlayText"
        aria-describedby={slow ? "publishingSlowText" : undefined}
        className="flex w-[320px] max-w-[90vw] flex-col items-center rounded-flask-2xl bg-flask-white p-8 shadow-flask-2xl"
      >
        {slow ? (
          <>
            <span id="publishingOverlayText" className="mb-3 text-base font-semibold text-flask-gray-800">
              Still publishing to Xero
            </span>
            <p id="publishingSlowText" className="mb-6 text-center text-sm text-flask-gray-500">
              {PUBLISH_WORDS.slow}
            </p>
            <div className="flex w-full gap-3">
              <button type="button" onClick={onClose} className={CANCEL}>
                Close
              </button>
              <button ref={check} type="button" onClick={onCheck} className={CONFIRM}>
                Check again
              </button>
            </div>
          </>
        ) : (
          <>
            <svg className="mb-4 h-10 w-10 animate-spin text-flask-teal" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" aria-hidden="true">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d={SPINNER_PATH} />
            </svg>
            <span id="publishingOverlayText" className="mb-3 text-base font-semibold text-flask-gray-800" role="status">
              {label}
            </span>
            <div
              className="mb-2 h-3 w-full overflow-hidden rounded-full bg-flask-gray-200"
              role="progressbar"
              aria-label="Publishing progress"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={percent}
            >
              <div className="h-3 rounded-full bg-flask-teal transition-all duration-500 ease-out" style={{ width: `${percent}%` }} />
            </div>
            <span className="text-sm font-medium text-flask-gray-500">{percent}%</span>
            <p className="mt-3 text-center text-xs text-flask-gray-400">Please do not close or navigate away.</p>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * A refusal because Xero must be connected again (`reconnect: true`). Connecting happens on
 * minty-web's Entity & Integration, so the API's sentence comes with a full-page link there,
 * through Flask's hand-off. Flask only toasted it.
 */
function ReconnectModal({ message, entityId, entityName, onClose }: { message: string; entityId: string; entityName: string; onClose: () => void }) {
  return (
    <Modal titleId="reconnectXeroTitle" onClose={onClose} className="rounded-flask-lg bg-flask-white p-6">
      <div className="relative mb-6 flex items-center justify-center">
        <h2 id="reconnectXeroTitle" className="text-xl font-bold text-flask-gray-900">
          Reconnect Xero
        </h2>
        <button type="button" onClick={onClose} aria-label="Close" className="absolute right-0 text-flask-gray-400 hover:text-flask-gray-600">
          {CLOSE_ICON}
        </button>
      </div>
      <div className="mb-6 rounded-flask-lg border border-flask-danger-edge bg-flask-danger-bg p-4">
        <div className="flex items-start">
          <div className="flex-shrink-0">{NOTE_ICON}</div>
          <p className="ml-3 text-sm text-flask-danger-ink">{message}</p>
        </div>
      </div>
      <div className="flex gap-3">
        <button type="button" onClick={onClose} className={CANCEL}>
          Close
        </button>
        <a href={settingsTabUrl(entityId, entityName, "integration")} className={`${CONFIRM} text-center`}>
          Reconnect Xero in Entity &amp; Integration
        </a>
      </div>
    </Modal>
  );
}

/**
 * Publish to Xero, as Flask's two pages did it: `ask` opens the republish confirm when one is due,
 * else starts at once; the overlay runs while `lib/publish.ts` polls; the outcome is said as
 * Flask's toast, then `onChanged` lets the page read itself again. A page that goes away cancels
 * the poll. `ui` goes in the page's overlays.
 */
export function usePublish({ place, entityId, entityName, onChanged }: { place: PublishPlace; entityId: string; entityName: string; onChanged: () => void }) {
  const toast = useToast();
  const [confirm, setConfirm] = useState<{ reportId: string; duplicate: boolean } | null>(null);
  const [running, setRunning] = useState<{ reportId: string; republish: boolean; label: string; percent: number; slow: boolean } | null>(null);
  const [reconnect, setReconnect] = useState<string | null>(null);
  const cancel = useRef<(() => void) | null>(null);
  const changed = useRef(onChanged);
  useEffect(() => {
    changed.current = onChanged;
  }, [onChanged]);
  useEffect(
    () => () => {
      cancel.current?.();
      cancel.current = null;
    },
    [],
  );

  const ended = useCallback(
    (end: PublishEnd, republish: boolean) => {
      cancel.current = null;
      if (end.kind === "slow") {
        setRunning((r) => (r ? { ...r, slow: true } : r));
        return;
      }
      setRunning(null);
      switch (end.kind) {
        case "published":
          toast(place === "history" ? PUBLISH_WORDS.historyPublished : republish ? PUBLISH_WORDS.republished : PUBLISH_WORDS.published, "success");
          break;
        case "partial":
          toast(partialMessage(end.reasons), "warning");
          break;
        case "failed":
          toast(PUBLISH_WORDS.failed, "error");
          break;
        case "lost":
          toast(end.message, "error");
          break;
        case "refused":
          if (end.reconnect) setReconnect(end.message);
          // the Submitted page warned of a publish already under way; history said it as an error
          else toast(end.message, end.status === 409 && place === "submitted" ? "warning" : "error");
          return;
        case "signed-out":
          return;
      }
      changed.current();
    },
    [place, toast],
  );

  const go = useCallback(
    (reportId: string, republish: boolean, start: boolean) => {
      if (cancel.current) return;
      setRunning({ reportId, republish, label: publishingLabel(republish), percent: 0, slow: false });
      cancel.current = runPublish(reportId, {
        republish,
        start,
        onProgress: (percent, label) => setRunning((r) => (r ? { ...r, percent, label } : r)),
        onEnd: (end) => ended(end, republish),
      });
    },
    [ended],
  );

  const ask = useCallback(
    (what: PublishAsk) => {
      if (cancel.current) return;
      if (what.confirm) setConfirm({ reportId: what.reportId, duplicate: what.confirm.duplicate });
      else go(what.reportId, false, true);
    },
    [go],
  );

  const ui = (
    <>
      {confirm ? (
        <RepublishModal
          place={place}
          duplicate={confirm.duplicate}
          onCancel={() => setConfirm(null)}
          onConfirm={() => {
            setConfirm(null);
            go(confirm.reportId, true, true);
          }}
        />
      ) : null}
      {reconnect ? <ReconnectModal message={reconnect} entityId={entityId} entityName={entityName} onClose={() => setReconnect(null)} /> : null}
      {running ? (
        <PublishingOverlay
          label={running.label}
          percent={running.percent}
          slow={running.slow}
          onCheck={() => go(running.reportId, running.republish, false)}
          onClose={() => setRunning(null)}
        />
      ) : null}
    </>
  );

  return { ask, ui, busy: running !== null };
}
