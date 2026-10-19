import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const subscriptionFetch = vi.fn();
vi.mock("@/lib/apiClient", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/apiClient")>()),
  subscriptionFetch: (...args: unknown[]) => subscriptionFetch(...args),
}));

import { ApiError } from "@/lib/apiClient";
import { clearAuth, setAuth } from "@/lib/auth";
import {
  claimSubscriptionNotice,
  fetchSubscriptionNotice,
  noticeTitle,
  noticeTone,
  payerLine,
  type SubscriptionNotice,
} from "@/lib/subscriptionNotice";

const notice = (over: Partial<SubscriptionNotice> = {}): SubscriptionNotice => ({
  items: [{ kind: "past_due", severity: "critical", module: "Petty Cash", module_code: "petty_cash", title: "Petty Cash is past due", detail: "Pay by 20 Oct.", deadline: "2026-10-20" }],
  can_manage: true,
  payer: { name: "Olive", email: "olive@example.com" },
  severity: "critical",
  settings_path: "/handoff/minty-web?next=/entity/x/company/settings/modules",
  ...over,
});

/** A token whose payload carries `sid` (the signature is not checked in the browser). */
function token(sid: string | null): string {
  const payload = btoa(JSON.stringify({ user_id: "u1", entity_id: "e1", ...(sid ? { sid } : {}), exp: Math.floor(Date.now() / 1000) + 600 }));
  return `h.${payload.replace(/=+$/, "")}.s`;
}

describe("what the notice says (Flask's launch page)", () => {
  it("is Action needed when anything is critical, else Your subscription", () => {
    expect(noticeTitle(notice())).toBe("Action needed");
    expect(noticeTitle(notice({ severity: "warning" }))).toBe("Your subscription");
    expect(noticeTitle(notice({ severity: null }))).toBe("Your subscription");
  });

  it("gives each item its tone", () => {
    expect(noticeTone("critical")).toBe("danger");
    expect(noticeTone("warning")).toBe("warning");
    expect(noticeTone("info")).toBe("info");
  });

  it("tells anyone but the payer who the payer is", () => {
    expect(payerLine(notice())).toBeNull();
    expect(payerLine(notice({ can_manage: false }))).toBe(
      "Billing for this company is managed by Olive (olive@example.com). Only they can change its subscription.",
    );
    expect(payerLine(notice({ can_manage: false, payer: { name: "", email: "olive@example.com" } }))).toBe(
      "Billing for this company is managed by olive@example.com. Only they can change its subscription.",
    );
    expect(payerLine(notice({ can_manage: false, payer: null }))).toBeNull();
  });
});

describe("reading it from the subscription API", () => {
  beforeEach(() => subscriptionFetch.mockReset());

  it("asks for the company's notice without ever moving the page on a 401", async () => {
    subscriptionFetch.mockResolvedValue(notice());
    await expect(fetchSubscriptionNotice("e 1")).resolves.toEqual(notice());
    expect(subscriptionFetch).toHaveBeenCalledWith("/api/entities/e%201/subscription-notice", { onUnauthorized: "reject" });
  });

  it("shows nothing when there is nothing to say", async () => {
    subscriptionFetch.mockResolvedValue({ items: [] });
    await expect(fetchSubscriptionNotice("e1")).resolves.toBeNull();
    await expect(fetchSubscriptionNotice("")).resolves.toBeNull();
  });

  it("shows nothing when the read fails or is malformed - and says why in the console", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    subscriptionFetch.mockRejectedValueOnce(new ApiError(403, "No"));
    await expect(fetchSubscriptionNotice("e1")).resolves.toBeNull();
    expect(warn).toHaveBeenLastCalledWith("[subscription-notice] not shown:", "status 403");
    subscriptionFetch.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await expect(fetchSubscriptionNotice("e1")).resolves.toBeNull();
    expect(warn).toHaveBeenLastCalledWith("[subscription-notice] not shown:", "TypeError");
    subscriptionFetch.mockResolvedValueOnce({ nope: true });
    await expect(fetchSubscriptionNotice("e1")).resolves.toBeNull();
    expect(warn).toHaveBeenCalledTimes(3);
  });
});

describe("once per company per sign-in (claim_subscription_notice)", () => {
  afterEach(() => {
    sessionStorage.clear();
    clearAuth();
  });

  it("is shown once per company in a sign-in", () => {
    setAuth(token("sid-1"), "e1", "Olive");
    expect(claimSubscriptionNotice("e1")).toBe(true);
    expect(claimSubscriptionNotice("e1")).toBe(false);
    expect(claimSubscriptionNotice("e2")).toBe(true);
  });

  it("is shown again after signing in again, and forgets the old sign-in", () => {
    setAuth(token("sid-1"), "e1", "Olive");
    expect(claimSubscriptionNotice("e1")).toBe(true);
    setAuth(token("sid-2"), "e1", "Olive");
    expect(claimSubscriptionNotice("e1")).toBe(true);
    expect(JSON.parse(sessionStorage.getItem("petty_cash_subscription_notice_seen") ?? "[]")).toEqual(["sid-2:e1"]);
  });

  it("falls back to once per tab for a token without a sign-in id", () => {
    setAuth(token(null), "e1", "Olive");
    expect(claimSubscriptionNotice("e1")).toBe(true);
    expect(claimSubscriptionNotice("e1")).toBe(false);
    expect(claimSubscriptionNotice("")).toBe(false);
  });
});
