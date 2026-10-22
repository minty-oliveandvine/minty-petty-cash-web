"use client";

/**
 * Publish to Xero, in the app (Wave 2j) - shared by the Daily Report (DailyReport.tsx), the outcome
 * page (ReportOutcome.tsx) and the report history's rows (components/history/ReportHistory.tsx):
 *
 * - `PublishDialog`: the Part 14 Confirmation modal first (15.9h: the consequence is external). A
 *   report that has been to Xero warns that Xero gets a second copy. `POST /reports/<id>/publish`
 *   is sent once (a ref guards it); a refusal is the API's sentence inside the dialog, which stays
 *   open - with a full-page link to minty-web's Entity & Integration (through Flask's hand-off) when Xero must be connected again.
 * - `usePublish`: after the 202, reads `GET /reports/<id>/publishing-status` until it leaves
 *   `publishing` (lib/publish.ts's poller: capped, stopped on unmount), handing each answer to the
 *   page so its pill and facts follow the API's.
 * - `PublishProgress`: the 15.12 partial-success Info line while Xero works, "still working" with
 *   Check again at the cap, a Danger alert with the reasons and Try again when it fails - and a
 *   polite live region that says each change. Success is the page's pill and a toast.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { Button, buttonClass, Icon, InlineAlert, Modal } from "@minty/shared/ui";

import { pettyCashFetch } from "@/lib/apiClient";
import type { PublishReason } from "@/lib/history";
import {
  announcement,
  FAILED,
  pollPublishing,
  publishConfirm,
  PUBLISHING,
  refusalOf,
  republishWarning,
  settle,
  STALLED,
  type PublishingStatus,
  type PublishStarted,
  type PublishState,
} from "@/lib/publish";

const statusPath = (reportId: string) =>
  `/reports/${encodeURIComponent(reportId)}/publishing-status`;

/**
 * A report's publish on the page. `initial` is the report's `publishing_status` as read: a page
 * opened while Xero works carries on watching, and one that failed reads its reasons once.
 * `onStatus` has every status read (the page redraws its pill from it); `onPublished` fires when
 * the publish went through (the page's toast).
 */
export function usePublish({
  reportId,
  initial,
  onStatus,
  onPublished,
}: {
  reportId: string;
  initial: string | null;
  onStatus: (status: PublishingStatus) => void;
  onPublished: () => void;
}) {
  const [state, setState] = useState<PublishState>(() =>
    initial === "publishing" ? { kind: "publishing" } : { kind: "idle" },
  );
  const stop = useRef<(() => void) | null>(null);
  const handlers = useRef({ onStatus, onPublished });
  useEffect(() => {
    handlers.current = { onStatus, onPublished };
  });

  const watch = useCallback(() => {
    stop.current?.();
    stop.current = pollPublishing({
      read: () => pettyCashFetch<PublishingStatus>(statusPath(reportId)),
      // The pill is the API's: read at once, so it says "Publishing to Xero" in its own words.
      immediate: true,
      onStatus: (status) => {
        handlers.current.onStatus(status);
        const next = settle(status);
        setState(next);
        if (next.kind === "published") handlers.current.onPublished();
      },
      onStalled: () => setState({ kind: "stalled" }),
      onRefused: (message) => setState({ kind: "failed", reasons: [], message }),
    });
  }, [reportId]);

  useEffect(() => {
    if (initial === "publishing" || initial === "failed") watch();
    return () => {
      stop.current?.();
      stop.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, for the report as it was read
  }, [watch]);

  /** After the 202 (and Check again): Xero is working on it; watch until it settles. */
  const begin = useCallback(() => {
    setState({ kind: "publishing" });
    watch();
  }, [watch]);

  return { state, begin };
}

/** A failed publish's reasons, each with an icon and, once resolved, "· Resolved" in words. */
export function PublishReasons({ reasons }: { reasons: PublishReason[] }) {
  return (
    <ul className="flex min-w-0 flex-col gap-1">
      {reasons.map((reason, i) => (
        <li key={i} className="flex min-w-0 items-start gap-1.5 text-body-s text-text-secondary">
          <Icon
            name={reason.resolved ? "check_circle" : "error"}
            size="sm"
            className={`mt-0.5 ${reason.resolved ? "text-status-success-ink" : "text-status-danger-ink"}`}
          />
          <span className="min-w-0 break-words">
            {reason.text}
            {/* In words, not only the icon's colour. */}
            {reason.resolved ? (
              <span className="font-semibold text-text-primary"> · Resolved</span>
            ) : null}
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Where the publish stands, under the place it was started: Info while Xero works (15.12 partial
 * success), Info with Check again once the poll cap is reached, Danger with the reasons and Try
 * again when it failed. The live region is always in the page, so each change is said (polite).
 */
export function PublishProgress({
  state,
  onRetry,
  onCheckAgain,
  className,
}: {
  state: PublishState;
  /** Try again (the confirmation again), where the person may publish. */
  onRetry?: () => void;
  onCheckAgain: () => void;
  className?: string;
}) {
  return (
    <>
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {announcement(state)}
      </p>
      {state.kind === "publishing" ? (
        <InlineAlert tone="info" title={PUBLISHING.title} className={className}>
          {PUBLISHING.body}
        </InlineAlert>
      ) : state.kind === "stalled" ? (
        <InlineAlert
          tone="info"
          title={STALLED.title}
          className={className}
          action={
            <Button kind="link" onClick={onCheckAgain}>
              Check again
            </Button>
          }
        >
          {STALLED.body}
        </InlineAlert>
      ) : state.kind === "failed" ? (
        <InlineAlert
          tone="danger"
          title={FAILED.title}
          className={className}
          action={
            onRetry ? (
              <Button kind="link" onClick={onRetry}>
                Try again
              </Button>
            ) : null
          }
        >
          {state.message ? (
            state.message
          ) : state.reasons.length ? (
            <PublishReasons reasons={state.reasons} />
          ) : (
            FAILED.body
          )}
        </InlineAlert>
      ) : null}
    </>
  );
}

/**
 * Publish to Xero's Confirmation modal. `again` names it "again" (the report is in Xero);
 * `wasPublished` (every read carries it) adds the second-copy warning. `onStarted` has the 202.
 */
export function PublishDialog({
  reportId,
  again,
  wasPublished,
  reconnectHref,
  onCancel,
  onStarted,
}: {
  reportId: string;
  again: boolean;
  wasPublished: boolean;
  /** minty-web's Entity & Integration through Flask's hand-off (`integrationUrl`, lib/hub.ts), where Xero is connected again. */
  reconnectHref: string;
  onCancel: () => void;
  onStarted: () => void;
}) {
  const cancel = useRef<HTMLButtonElement>(null);
  const inFlight = useRef(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<{ message: string; reconnect: boolean } | null>(null);

  const words = publishConfirm(again);
  const warning = republishWarning(wasPublished);

  async function confirm() {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setProblem(null);
    try {
      await pettyCashFetch<PublishStarted>(`/reports/${encodeURIComponent(reportId)}/publish`, {
        method: "POST",
      });
      onStarted();
    } catch (err) {
      const refusal = refusalOf(err);
      if (!refusal) return; // a 401: the hand-off has the page
      inFlight.current = false;
      setBusy(false);
      setProblem(refusal);
    }
  }

  return (
    <Modal
      open
      role={warning ? "alertdialog" : "dialog"}
      onRequestClose={() => !busy && onCancel()}
      initialFocus={cancel}
      title={words.title}
      description={words.body}
      footer={
        <>
          <Button ref={cancel} kind="secondary" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button
            kind="primary"
            onClick={() => void confirm()}
            processing={busy}
            processingLabel="Publishing…"
          >
            {words.verb}
          </Button>
        </>
      }
    >
      {warning || problem ? (
        <div className="flex flex-col gap-3">
          {warning ? (
            <InlineAlert tone="warning" title={warning.title}>
              {warning.body}
            </InlineAlert>
          ) : null}
          {problem ? (
            <InlineAlert
              tone="danger"
              action={
                problem.reconnect ? (
                  <a href={reconnectHref} className={buttonClass("link")}>
                    Reconnect Xero in Entity &amp; Integration
                  </a>
                ) : null
              }
            >
              {problem.message}
            </InlineAlert>
          ) : null}
        </div>
      ) : null}
    </Modal>
  );
}
