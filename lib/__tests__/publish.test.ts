import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/apiClient";
import {
  MAX_POLLS,
  POLL_MS,
  SETTLE_MS,
  nextProgress,
  partialMessage,
  publishingLabel,
  runPublish,
  statusEnd,
  type PublishEnd,
  type PublishingStatus,
} from "@/lib/publish";

const status = (over: Partial<PublishingStatus> = {}): PublishingStatus => ({
  report_id: "r-1",
  publishing_status: "publishing",
  status_label: "Publishing",
  status_tone: "info",
  xero_integrated: false,
  was_published: false,
  published_at: null,
  reasons: [],
  ...over,
});

describe("how a status read ends a publish", () => {
  it("keeps going while it is publishing", () => {
    expect(statusEnd(status())).toBeNull();
  });

  it("is published when completed, or once it is in Xero", () => {
    expect(statusEnd(status({ publishing_status: "completed" }))).toEqual({ kind: "published" });
    expect(statusEnd(status({ publishing_status: "unpublished", xero_integrated: true }))).toEqual({
      kind: "published",
    });
  });

  it("is partial when it failed with open reasons - the resolved ones are left out", () => {
    const reasons = [
      { text: "Account 400 is archived in Xero.", resolved: false },
      { text: "Acme isn't a Xero contact.", resolved: true },
    ];
    expect(statusEnd(status({ publishing_status: "failed", reasons }))).toEqual({
      kind: "partial",
      reasons: ["Account 400 is archived in Xero."],
    });
  });

  it("is failed with no open reason, or when it was put back to unpublished", () => {
    expect(statusEnd(status({ publishing_status: "failed" }))).toEqual({ kind: "failed" });
    expect(
      statusEnd(status({ publishing_status: "failed", reasons: [{ text: "x", resolved: true }] })),
    ).toEqual({ kind: "failed" });
    expect(statusEnd(status({ publishing_status: "unpublished" }))).toEqual({ kind: "failed" });
  });
});

describe("Flask's words and rules", () => {
  it("labels a republish", () => {
    expect(publishingLabel(false)).toBe("Publishing to Xero...");
    expect(publishingLabel(true)).toBe("Republishing to Xero...");
  });

  it("joins a partial publish's reasons", () => {
    expect(partialMessage(["A", "B"])).toBe("Xero publish is done partially due to A; B");
    expect(partialMessage([])).toBe(
      "Xero publish is done partially due to some entries could not be published",
    );
  });

  it("creeps the bar towards 85%, never past it", () => {
    expect(nextProgress(15)).toBe(21);
    expect(nextProgress(84)).toBe(85);
    expect(nextProgress(85)).toBe(85);
    let p = 15;
    for (let i = 0; i < 200; i++) p = nextProgress(p);
    expect(p).toBe(85);
  });
});

describe("runPublish", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  /** A stub API: POST answers `start`, each status read the next of `reads` (the last repeats). */
  function api(start: () => Promise<unknown>, reads: (() => Promise<PublishingStatus>)[]) {
    const calls: string[] = [];
    let n = 0;
    const fetcher = vi.fn((path: string, init?: { method?: string }) => {
      calls.push(`${init?.method ?? "GET"} ${path}`);
      if (path.endsWith("/publish")) return start();
      const read = reads[Math.min(n++, reads.length - 1)];
      return read();
    }) as never;
    return { fetcher, calls };
  }
  const ok = (s: PublishingStatus) => () => Promise.resolve(s);
  const accepted = () =>
    Promise.resolve({
      publishing_status: "publishing",
      message: "Publishing to Xero. This can take a few minutes.",
    });

  function run(fetcher: never, opts: { republish?: boolean; start?: boolean } = {}) {
    const ends: PublishEnd[] = [];
    const progress: [number, string][] = [];
    const cancel = runPublish("r-1", {
      republish: opts.republish ?? false,
      start: opts.start,
      fetcher,
      onProgress: (p, l) => progress.push([p, l]),
      onEnd: (e) => ends.push(e),
    });
    return { ends, progress, cancel };
  }

  it("starts, then asks every two seconds until it is published, then holds the full bar before saying so", async () => {
    const { fetcher, calls } = api(accepted, [
      ok(status()),
      ok(status()),
      ok(status({ publishing_status: "completed", xero_integrated: true })),
    ]);
    const { ends, progress } = run(fetcher);
    await vi.advanceTimersByTimeAsync(0);
    expect(calls).toEqual(["POST /reports/r-1/publish"]);
    expect(progress.slice(0, 3)).toEqual([
      [5, "Initiating..."],
      [10, "Sending request to Xero..."],
      [15, "Publishing to Xero..."],
    ]);

    await vi.advanceTimersByTimeAsync(POLL_MS - 1);
    expect(calls).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(calls).toEqual(["POST /reports/r-1/publish", "GET /reports/r-1/publishing-status"]);
    await vi.advanceTimersByTimeAsync(POLL_MS * 2);
    expect(calls).toHaveLength(4);
    expect(progress.at(-1)).toEqual([100, "Published successfully!"]);
    expect(ends).toEqual([]);
    await vi.advanceTimersByTimeAsync(SETTLE_MS);
    expect(ends).toEqual([{ kind: "published" }]);
    // and nothing more is asked
    await vi.advanceTimersByTimeAsync(POLL_MS * 10);
    expect(calls).toHaveLength(4);
  });

  it("labels the bar for a republish", async () => {
    const { fetcher } = api(accepted, [ok(status())]);
    const { progress, cancel } = run(fetcher, { republish: true });
    await vi.advanceTimersByTimeAsync(POLL_MS);
    expect(progress.at(-1)?.[1]).toBe("Republishing to Xero...");
    cancel();
  });

  it("ends partial with the open reasons, and failed without any", async () => {
    const partial = api(accepted, [
      ok(
        status({
          publishing_status: "failed",
          reasons: [{ text: "Account 400 is archived in Xero.", resolved: false }],
        }),
      ),
    ]);
    const a = run(partial.fetcher);
    await vi.advanceTimersByTimeAsync(POLL_MS + SETTLE_MS);
    expect(a.progress.at(-1)).toEqual([100, "Partially published"]);
    expect(a.ends).toEqual([{ kind: "partial", reasons: ["Account 400 is archived in Xero."] }]);

    const failed = api(accepted, [ok(status({ publishing_status: "failed" }))]);
    const b = run(failed.fetcher);
    await vi.advanceTimersByTimeAsync(POLL_MS);
    expect(b.ends).toEqual([{ kind: "failed" }]);
  });

  it("stops at the cap and says it is slow", async () => {
    const { fetcher, calls } = api(accepted, [ok(status())]);
    const { ends } = run(fetcher);
    await vi.advanceTimersByTimeAsync(POLL_MS * MAX_POLLS);
    expect(calls).toHaveLength(1 + MAX_POLLS);
    expect(ends).toEqual([{ kind: "slow" }]);
    await vi.advanceTimersByTimeAsync(POLL_MS * 10);
    expect(calls).toHaveLength(1 + MAX_POLLS);
  });

  it("keeps asking through a dropped connection, and stops on a refused read", async () => {
    const flaky = api(accepted, [
      () => Promise.reject(new TypeError("Failed to fetch")),
      ok(status({ publishing_status: "completed" })),
    ]);
    const a = run(flaky.fetcher);
    await vi.advanceTimersByTimeAsync(POLL_MS * 2 + SETTLE_MS);
    expect(a.ends).toEqual([{ kind: "published" }]);

    const gone = api(accepted, [
      () => Promise.reject(new ApiError(404, "I couldn't find that report.")),
    ]);
    const b = run(gone.fetcher);
    await vi.advanceTimersByTimeAsync(POLL_MS * 3);
    expect(b.ends).toEqual([{ kind: "lost", message: "I couldn't find that report." }]);
    expect(gone.calls).toHaveLength(2);
  });

  it("asks nothing more once cancelled - a page that goes away leaves nothing polling", async () => {
    const { fetcher, calls } = api(accepted, [ok(status())]);
    const { ends, cancel } = run(fetcher);
    await vi.advanceTimersByTimeAsync(POLL_MS * 2);
    expect(calls).toHaveLength(3);
    cancel();
    await vi.advanceTimersByTimeAsync(POLL_MS * 20);
    expect(calls).toHaveLength(3);
    expect(ends).toEqual([]);
  });

  it("says nothing when cancelled while the start is still on its way", async () => {
    let answer: (v: unknown) => void = () => {};
    const { fetcher, calls } = api(
      () => new Promise((resolve) => (answer = resolve)),
      [ok(status())],
    );
    const { ends, cancel } = run(fetcher);
    cancel();
    answer({ publishing_status: "publishing" });
    await vi.advanceTimersByTimeAsync(POLL_MS * 5);
    expect(calls).toHaveLength(1);
    expect(ends).toEqual([]);
  });

  it("watches without starting (Check again)", async () => {
    const { fetcher, calls } = api(accepted, [ok(status({ publishing_status: "completed" }))]);
    const { ends } = run(fetcher, { start: false });
    await vi.advanceTimersByTimeAsync(POLL_MS + SETTLE_MS);
    expect(calls).toEqual(["GET /reports/r-1/publishing-status"]);
    expect(ends).toEqual([{ kind: "published" }]);
  });

  it("passes a refused start's sentence on, with reconnect when Xero must be connected again", async () => {
    const reconnect = api(
      () =>
        Promise.reject(
          new ApiError(
            400,
            "I've lost access to your Xero account. Mind reconnecting it in Settings?",
            { error: "x", reconnect: true },
          ),
        ),
      [],
    );
    const a = run(reconnect.fetcher);
    await vi.advanceTimersByTimeAsync(0);
    expect(a.ends).toEqual([
      {
        kind: "refused",
        status: 400,
        reconnect: true,
        message: "I've lost access to your Xero account. Mind reconnecting it in Settings?",
      },
    ]);

    const busy = api(
      () =>
        Promise.reject(
          new ApiError(409, "Publishing already in progress. Please wait...", {
            error: "Publishing already in progress. Please wait...",
          }),
        ),
      [],
    );
    const b = run(busy.fetcher);
    await vi.advanceTimersByTimeAsync(POLL_MS * 3);
    expect(b.ends).toEqual([
      {
        kind: "refused",
        status: 409,
        reconnect: false,
        message: "Publishing already in progress. Please wait...",
      },
    ]);
    expect(busy.calls).toHaveLength(1);

    const offline = api(() => Promise.reject(new TypeError("Failed to fetch")), []);
    const c = run(offline.fetcher);
    await vi.advanceTimersByTimeAsync(0);
    expect(c.ends).toEqual([
      {
        kind: "refused",
        status: 0,
        reconnect: false,
        message: "I couldn't publish that report to Xero. Mind trying again?",
      },
    ]);

    const lapsed = api(() => Promise.reject(new ApiError(401, "Your session has ended.")), []);
    const d = run(lapsed.fetcher);
    await vi.advanceTimersByTimeAsync(0);
    expect(d.ends).toEqual([{ kind: "signed-out" }]);
  });
});
