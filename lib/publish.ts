/**
 * Publish to Xero, in the app (Wave 2j): what `POST /reports/<id>/publish` and
 * `GET /reports/<id>/publishing-status` answer (the Petty Cash API; Flask's
 * `petty_cash_api/routes/report.py`, `publish_answer` / `publishing_status`), and the rules the
 * three places share - the Daily Report, the outcome page and the report history - as pure
 * functions: how a status settles, what a refusal says, the republish warning, and the poller.
 *
 * The start answers 202 while Xero's worker runs in the background; the status is read every
 * `POLL_MS` until it leaves `publishing`, at most `POLL_CAP` times - then the page says Xero is
 * still working on it and offers Check again. Every word on the pill is the API's.
 */

import { ApiError } from "@/lib/apiClient";
import { formatWeekdayDay } from "@/lib/dates";
import type { PublishReason } from "@/lib/history";

/** What `GET /reports/<id>/publishing-status` answers. */
export type PublishingStatus = {
  report_id: string;
  /** "publishing" | "completed" | "failed" | "unpublished" (null for a report never sent). */
  publishing_status: string | null;
  status_label: string;
  status_tone: string;
  xero_integrated: boolean;
  was_published: boolean;
  published_at: string | null;
  /** A failed publish's reasons, each still open or resolved since; empty otherwise. */
  reasons: PublishReason[];
};

/** What `POST /reports/<id>/publish` answers when the publish starts (202). */
export type PublishStarted = { publishing_status: "publishing"; message: string };

/** How often the status is read while Xero works on it, and how many reads before "still working". */
export const POLL_MS = 3000;
export const POLL_CAP = 40; // two minutes

/** Where a publish stands on the page. */
export type PublishState =
  | { kind: "idle" }
  | { kind: "publishing" }
  /** The poll cap was reached while Xero still worked on it: Check again. */
  | { kind: "stalled" }
  | { kind: "published" }
  /** A failed (or partial) publish with its reasons; `message` is a read the API refused instead. */
  | { kind: "failed"; reasons: PublishReason[]; message: string | null };

/** Whether the page is waiting on Xero (no Publish action is offered meanwhile). */
export function isWorking(state: PublishState): boolean {
  return state.kind === "publishing" || state.kind === "stalled";
}

/**
 * A status read, as the page's state: still publishing; published (Xero holds the report as it
 * stands, `xero_integrated`); or anything else - failed, a partial publish, or put back - a failure
 * with the API's reasons.
 */
export function settle(status: PublishingStatus): PublishState {
  if (status.publishing_status === "publishing") return { kind: "publishing" };
  if (status.xero_integrated) return { kind: "published" };
  return { kind: "failed", reasons: status.reasons ?? [], message: null };
}

/** Said in the polite live region when the publish changes (15.12: status changes are announced). */
export function announcement(state: PublishState): string {
  switch (state.kind) {
    case "publishing":
      return "Publishing to Xero.";
    case "stalled":
      return "Xero is still working on it.";
    case "published":
      return "Published to Xero.";
    case "failed":
      return "Publishing to Xero failed.";
    default:
      return "";
  }
}

/** What the page shows while Xero works, once it stalls, and when it fails (Flask's page's words). */
export const PUBLISHING = { title: "Publishing to Xero", body: "This can take a few minutes. You can leave this page; Xero carries on." };
export const STALLED = { title: "Xero is still working on it", body: "The report is submitted. Check again in a few minutes; it shows here once Xero has it." };
export const FAILED = { title: "Publishing to Xero failed", body: "Nothing more was sent. Check the Xero connection, then try again." };

/** The toast after a publish that went through. */
export function publishedMessage(day: string): string {
  return `The Daily Report for ${formatWeekdayDay(day)} is published to Xero.`;
}

/** The confirmation's title, description and verb - "again" once the report has been to Xero. */
export function publishConfirm(again: boolean): { title: string; body: string; verb: string } {
  return {
    title: again ? "Publish to Xero again?" : "Publish to Xero?",
    body: "The day's sales, expenses with their receipts and the bank deposit are sent to this company's Xero organisation.",
    verb: again ? "Publish again" : "Publish to Xero",
  };
}

/**
 * The republish warning (Part 11: what happens, then what to do): a report that has been to Xero
 * (`was_published`) gets a second copy there unless the old entries are voided.
 */
export function republishWarning(wasPublished: boolean): { title: string; body: string } | null {
  if (!wasPublished) return null;
  return {
    title: "Xero gets a second copy",
    body: "Publishing again adds new entries in Xero. The ones there now are not removed: void them in Xero by hand, or the day is counted twice.",
  };
}

const NOT_STARTED = "We couldn't start the publish. Check your connection, then try again.";

/**
 * A refused start, as the dialog shows it: the API's sentence, and `reconnect` when Xero must be
 * connected again (in Flask's settings). Null for a 401, which has already gone back through the
 * hand-off.
 */
export function refusalOf(err: unknown): { message: string; reconnect: boolean } | null {
  if (!(err instanceof ApiError)) return { message: NOT_STARTED, reconnect: false };
  if (err.status === 401) return null;
  const body = err.body as { reconnect?: unknown } | null;
  return { message: err.message, reconnect: Boolean(body && typeof body === "object" && body.reconnect === true) };
}

/**
 * Read the status every `interval` until it leaves `publishing` (or `cap` reads), handing each
 * answer to `onStatus`. A read that never got an answer is retried (it counts towards the cap); a
 * refusal (403, 404) stops and goes to `onRefused`; a 401 stops quietly (the hand-off has the
 * page). The first read waits `interval` unless `immediate`. Returns the stop - call it on unmount.
 */
export function pollPublishing({
  read,
  onStatus,
  onStalled,
  onRefused,
  interval = POLL_MS,
  cap = POLL_CAP,
  immediate = false,
}: {
  read: () => Promise<PublishingStatus>;
  onStatus: (status: PublishingStatus) => void;
  onStalled: () => void;
  onRefused: (message: string) => void;
  interval?: number;
  cap?: number;
  immediate?: boolean;
}): () => void {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let reads = 0;

  const next = () => {
    if (stopped) return;
    if (reads >= cap) {
      stopped = true;
      onStalled();
      return;
    }
    timer = setTimeout(tick, interval);
  };

  async function tick() {
    timer = null;
    if (stopped) return;
    reads += 1;
    try {
      const status = await read();
      if (stopped) return;
      onStatus(status);
      if (status.publishing_status === "publishing") next();
      else stopped = true;
    } catch (err) {
      if (stopped) return;
      if (err instanceof ApiError) {
        stopped = true;
        if (err.status !== 401) onRefused(err.message);
        return;
      }
      // No answer (the connection): try again at the next tick.
      console.error("Reading the Xero publishing status failed", err);
      next();
    }
  }

  if (immediate) void tick();
  else timer = setTimeout(tick, interval);

  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
  };
}
