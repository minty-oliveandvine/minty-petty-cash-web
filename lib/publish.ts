/**
 * Publishing a report to Xero, as Flask's ORIGINAL `report/submitted.html` and
 * `report_history/report_history.html` (Minty `1c25b35^1`) did it: `POST /reports/<id>/publish`
 * starts it (202), then `GET /reports/<id>/publishing-status` is asked every two seconds until the
 * report is no longer `publishing` - at most 90 times (three minutes), Flask's cap. While it runs,
 * the overlay's bar creeps towards 85% the way Flask's did.
 *
 * Minty `petty_cash_api/routes/report.py` (`publish_answer`, `publishing_status`) and
 * `xero/services/publish_start.py` say what the API answers.
 */

import { ApiError, pettyCashFetch } from "@/lib/apiClient";

/** Flask's interval and cap: every 2 s, 90 times. */
export const POLL_MS = 2000;
export const MAX_POLLS = 90;
/** How long the full bar shows before the outcome is said (Flask's 600 ms). */
export const SETTLE_MS = 600;

/** `GET /reports/<id>/publishing-status`. */
export type PublishingStatus = {
  report_id: string;
  publishing_status: "publishing" | "completed" | "failed" | "unpublished";
  status_label: string;
  status_tone: string;
  xero_integrated: boolean;
  was_published: boolean;
  published_at: string | null;
  reasons: { text: string; resolved: boolean }[];
};

/** How a publish ended - or why it never started. */
export type PublishEnd =
  | { kind: "published" }
  /** Failed with reasons the person can act on: Flask's "done partially". */
  | { kind: "partial"; reasons: string[] }
  | { kind: "failed" }
  /** Still `publishing` after the cap. */
  | { kind: "slow" }
  /** The start was refused: the API's sentence; `reconnect` when Xero must be connected again. */
  | { kind: "refused"; message: string; status: number; reconnect: boolean }
  /** A status read was refused (the report is gone, or the right was taken away). */
  | { kind: "lost"; message: string }
  /** A 401: the browser is already on its way back through Flask's hand-off. */
  | { kind: "signed-out" };

/** Flask's words. */
export const PUBLISH_WORDS = {
  initiating: "Initiating...",
  sending: "Sending request to Xero...",
  done: "Published successfully!",
  partly: "Partially published",
  failed: "Publishing to Xero failed. Please try again.",
  slow: "Publishing is taking longer than expected. Please check again later.",
  unreachable: "I couldn't publish that report to Xero. Mind trying again?",
  /** The Submitted page's success toasts. */
  published: "Report Successfully Published",
  republished: "Report Successfully Republished",
  /** Report history's success toast. */
  historyPublished: "Report published to Xero successfully!",
} as const;

/** The overlay's heading: "Publishing to Xero..." or, after the republish confirm, "Republishing...". */
export function publishingLabel(republish: boolean): string {
  return republish ? "Republishing to Xero..." : "Publishing to Xero...";
}

/** Flask's partial-publish toast: the open reasons, joined. */
export function partialMessage(reasons: string[]): string {
  return `Xero publish is done partially due to ${reasons.length ? reasons.join("; ") : "some entries could not be published"}`;
}

/** How a status read ends the publish; null while it is still `publishing`. */
export function statusEnd(status: PublishingStatus): PublishEnd | null {
  if (status.publishing_status === "completed" || status.xero_integrated) return { kind: "published" };
  if (status.publishing_status === "publishing") return null;
  // "failed", or "unpublished" (put back): either way it is not in Xero
  const open = status.reasons.filter((r) => !r.resolved).map((r) => r.text);
  return status.publishing_status === "failed" && open.length ? { kind: "partial", reasons: open } : { kind: "failed" };
}

/** Flask's bar while it polls: a step towards 85% each time, never past it. */
export function nextProgress(progress: number): number {
  return progress < 85 ? progress + Math.max(1, Math.round((85 - progress) / 12)) : progress;
}

export type PublishRun = {
  /** "Publishing to Xero..." or "Republishing to Xero...". */
  republish: boolean;
  /** `false`: only watch a publish already under way ("Check again"). */
  start?: boolean;
  onProgress: (percent: number, label: string) => void;
  onEnd: (end: PublishEnd) => void;
  /** For tests. */
  fetcher?: typeof pettyCashFetch;
};

/**
 * Start (or watch) a publish. Returns `cancel`: nothing is asked and nothing is said after it -
 * a page calls it when it goes away, so no request is left polling.
 */
export function runPublish(reportId: string, run: PublishRun): () => void {
  const fetcher = run.fetcher ?? pettyCashFetch;
  const path = `/reports/${encodeURIComponent(reportId)}`;
  const label = publishingLabel(run.republish);
  let cancelled = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let polls = 0;
  let progress = 15;

  const later = (fn: () => void, ms: number) => {
    timer = setTimeout(() => {
      timer = null;
      if (!cancelled) fn();
    }, ms);
  };
  const end = (outcome: PublishEnd) => {
    if (cancelled) return;
    if (outcome.kind === "published" || outcome.kind === "partial") {
      run.onProgress(100, outcome.kind === "published" ? PUBLISH_WORDS.done : PUBLISH_WORDS.partly);
      later(() => run.onEnd(outcome), SETTLE_MS);
    } else {
      run.onEnd(outcome);
    }
  };

  const poll = () => {
    polls += 1;
    progress = nextProgress(progress);
    run.onProgress(progress, label);
    fetcher<PublishingStatus>(`${path}/publishing-status`).then(
      (status) => {
        if (cancelled) return;
        const outcome = statusEnd(status);
        if (outcome) end(outcome);
        else if (polls >= MAX_POLLS) end({ kind: "slow" });
        else later(poll, POLL_MS);
      },
      (err: unknown) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) return end({ kind: "signed-out" });
        if (err instanceof ApiError && (err.status === 403 || err.status === 404)) return end({ kind: "lost", message: err.message });
        // a dropped connection or a server error: keep asking, up to the cap (Flask's rule)
        if (polls >= MAX_POLLS) end({ kind: "slow" });
        else later(poll, POLL_MS);
      },
    );
  };

  if (run.start === false) {
    run.onProgress(progress, label);
    later(poll, POLL_MS);
  } else {
    run.onProgress(5, PUBLISH_WORDS.initiating);
    run.onProgress(10, PUBLISH_WORDS.sending);
    fetcher<{ publishing_status: string; message?: string }>(`${path}/publish`, { method: "POST" }).then(
      () => {
        if (cancelled) return;
        run.onProgress(progress, label);
        later(poll, POLL_MS);
      },
      (err: unknown) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) return end({ kind: "signed-out" });
        if (err instanceof ApiError) {
          const body = err.body as { reconnect?: unknown } | null;
          return end({ kind: "refused", message: err.message, status: err.status, reconnect: body?.reconnect === true });
        }
        end({ kind: "refused", message: PUBLISH_WORDS.unreachable, status: 0, reconnect: false });
      },
    );
  }

  return () => {
    cancelled = true;
    if (timer !== null) clearTimeout(timer);
  };
}
