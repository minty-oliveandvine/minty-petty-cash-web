import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/apiClient";
import {
  announcement,
  isWorking,
  pollPublishing,
  POLL_CAP,
  POLL_MS,
  publishConfirm,
  publishedMessage,
  refusalOf,
  republishWarning,
  settle,
  type PublishingStatus,
} from "@/lib/publish";

function status(over: Partial<PublishingStatus> = {}): PublishingStatus {
  return {
    report_id: "r1",
    publishing_status: "publishing",
    status_label: "Publishing to Xero",
    status_tone: "info",
    xero_integrated: false,
    was_published: false,
    published_at: null,
    reasons: [],
    ...over,
  };
}

const PUBLISHED = status({
  publishing_status: "completed",
  status_label: "Published to Xero",
  status_tone: "success",
  xero_integrated: true,
  was_published: true,
});
const FAILED = status({
  publishing_status: "failed",
  status_label: "Publish failed",
  status_tone: "danger",
  reasons: [
    { text: "Account 429 is archived in Xero.", resolved: false },
    { text: "ParknShop is not a contact in Xero.", resolved: true },
  ],
});

describe("how a status settles", () => {
  it("keeps publishing while the API says so", () => {
    expect(settle(status())).toEqual({ kind: "publishing" });
  });

  it("is published only when Xero holds the report (xero_integrated)", () => {
    expect(settle(PUBLISHED)).toEqual({ kind: "published" });
  });

  it("is a failure with the API's reasons for failed, a partial publish, or a publish put back", () => {
    expect(settle(FAILED)).toEqual({ kind: "failed", reasons: FAILED.reasons, message: null });
    expect(settle(status({ publishing_status: "completed", xero_integrated: false }))).toEqual({
      kind: "failed",
      reasons: [],
      message: null,
    });
    expect(settle(status({ publishing_status: "unpublished" }))).toEqual({
      kind: "failed",
      reasons: [],
      message: null,
    });
  });

  it("is working while publishing or stalled, and says each change for the live region", () => {
    expect(isWorking({ kind: "publishing" })).toBe(true);
    expect(isWorking({ kind: "stalled" })).toBe(true);
    expect(isWorking({ kind: "idle" })).toBe(false);
    expect(isWorking({ kind: "published" })).toBe(false);
    expect(announcement({ kind: "publishing" })).toBe("Publishing to Xero.");
    expect(announcement({ kind: "stalled" })).toBe("Xero is still working on it.");
    expect(announcement({ kind: "published" })).toBe("Published to Xero.");
    expect(announcement({ kind: "failed", reasons: [], message: null })).toBe(
      "Publishing to Xero failed.",
    );
    expect(announcement({ kind: "idle" })).toBe("");
  });
});

describe("the words", () => {
  it("asks first, and again once the report has been to Xero", () => {
    expect(publishConfirm(false)).toMatchObject({
      title: "Publish to Xero?",
      verb: "Publish to Xero",
    });
    expect(publishConfirm(true)).toMatchObject({
      title: "Publish to Xero again?",
      verb: "Publish again",
    });
  });

  it("warns that a report already in Xero gets a second copy unless the old entries are voided", () => {
    expect(republishWarning(false)).toBeNull();
    expect(republishWarning(true)).toEqual({
      title: "Xero gets a second copy",
      body: "Publishing again adds new entries in Xero. The ones there now are not removed: void them in Xero by hand, or the day is counted twice.",
    });
  });

  it("names the day in the toast", () => {
    expect(publishedMessage("2026-10-13")).toBe(
      "The Daily Report for Tue 13 Oct 2026 is published to Xero.",
    );
  });
});

describe("a refused start", () => {
  it("is the API's sentence, with reconnect only when the API says so", () => {
    const why = "I've lost access to your Xero account. Mind reconnecting it in Settings?";
    expect(refusalOf(new ApiError(400, why, { error: why, reconnect: true }))).toEqual({
      message: why,
      reconnect: true,
    });
    expect(
      refusalOf(
        new ApiError(400, "Xero settings incomplete.", { error: "Xero settings incomplete." }),
      ),
    ).toEqual({ message: "Xero settings incomplete.", reconnect: false });
    expect(refusalOf(new ApiError(409, "Busy", { error: "Busy", reconnect: "yes" }))).toEqual({
      message: "Busy",
      reconnect: false,
    });
  });

  it("says the connection when no answer came, and nothing for a 401 (the hand-off has the page)", () => {
    expect(refusalOf(new TypeError("Failed to fetch"))).toEqual({
      message: "We couldn't start the publish. Check your connection, then try again.",
      reconnect: false,
    });
    expect(refusalOf(new ApiError(401, "ended"))).toBeNull();
  });
});

describe("polling", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  function poller(
    answers: (PublishingStatus | Error)[],
    options: { cap?: number; immediate?: boolean } = {},
  ) {
    const read = vi.fn(async () => {
      const next = answers.length > 1 ? answers.shift()! : answers[0];
      if (next instanceof Error) throw next;
      return next;
    });
    const onStatus = vi.fn();
    const onStalled = vi.fn();
    const onRefused = vi.fn();
    const stop = pollPublishing({ read, onStatus, onStalled, onRefused, ...options });
    return { read, onStatus, onStalled, onRefused, stop };
  }

  it("waits an interval, reads until the status leaves publishing, then stops", async () => {
    const p = poller([status(), status(), PUBLISHED]);
    expect(p.read).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(POLL_MS);
    expect(p.read).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(POLL_MS * 2);
    expect(p.read).toHaveBeenCalledTimes(3);
    expect(p.onStatus).toHaveBeenLastCalledWith(PUBLISHED);
    await vi.advanceTimersByTimeAsync(POLL_MS * 10);
    expect(p.read).toHaveBeenCalledTimes(3);
    expect(p.onStalled).not.toHaveBeenCalled();
  });

  it("reads at once when asked (Check again, a page opened mid-publish)", async () => {
    const p = poller([FAILED], { immediate: true });
    await vi.advanceTimersByTimeAsync(0);
    expect(p.read).toHaveBeenCalledTimes(1);
    expect(p.onStatus).toHaveBeenCalledWith(FAILED);
  });

  it("stops at the cap and says Xero is still working on it", async () => {
    const p = poller([status()]);
    await vi.advanceTimersByTimeAsync(POLL_MS * (POLL_CAP + 5));
    expect(p.read).toHaveBeenCalledTimes(POLL_CAP);
    expect(p.onStalled).toHaveBeenCalledTimes(1);
  });

  it("retries a read that got no answer (counting towards the cap), and stops at a refusal", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const p = poller(
      [
        new TypeError("Failed to fetch"),
        status(),
        new ApiError(404, "Hmm, I couldn't find that report."),
      ],
      { cap: 10 },
    );
    await vi.advanceTimersByTimeAsync(POLL_MS * 3);
    expect(p.read).toHaveBeenCalledTimes(3);
    expect(p.onRefused).toHaveBeenCalledWith("Hmm, I couldn't find that report.");
    await vi.advanceTimersByTimeAsync(POLL_MS * 5);
    expect(p.read).toHaveBeenCalledTimes(3);
  });

  it("stops quietly at a 401", async () => {
    const p = poller([new ApiError(401, "ended")]);
    await vi.advanceTimersByTimeAsync(POLL_MS * 3);
    expect(p.read).toHaveBeenCalledTimes(1);
    expect(p.onRefused).not.toHaveBeenCalled();
  });

  it("reads nothing more once stopped (unmount), even an answer already on its way", async () => {
    let answer: (s: PublishingStatus) => void = () => {};
    const read = vi.fn(() => new Promise<PublishingStatus>((resolve) => (answer = resolve)));
    const onStatus = vi.fn();
    const stop = pollPublishing({ read, onStatus, onStalled: vi.fn(), onRefused: vi.fn() });
    await vi.advanceTimersByTimeAsync(POLL_MS);
    expect(read).toHaveBeenCalledTimes(1);
    stop();
    answer(status());
    await vi.advanceTimersByTimeAsync(POLL_MS * 5);
    expect(onStatus).not.toHaveBeenCalled();
    expect(read).toHaveBeenCalledTimes(1);
  });

  it("stopped before the first read, reads nothing", async () => {
    const p = poller([status()]);
    p.stop();
    await vi.advanceTimersByTimeAsync(POLL_MS * 5);
    expect(p.read).not.toHaveBeenCalled();
  });
});
