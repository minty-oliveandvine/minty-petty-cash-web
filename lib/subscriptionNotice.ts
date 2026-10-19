/**
 * The subscription notice on the launch page (Flask's `templates/petty_cash/launch.html`, its
 * `subscriptionNoticeModal`): billing problems - a module past due, a paid module winding down -
 * once per company per sign-in, with "Go to subscription settings" for the payer and, for anyone
 * else, who the payer is. minty-payment-request-web shows the same notice (its
 * `lib/subscriptionNotice.ts`); this is that rule set in this app's client.
 *
 * Read from minty-subscription-api (`SUBSCRIPTION_API_URL`), where subscription state lives:
 * `GET /api/entities/<id>/subscription-notice` with this app's token (Flask signs it with the shared
 * key; the API holds it to the company it names). A notice is an interruption, not a feature, so
 * a failed read shows nothing - and says why in the console, never silently.
 *
 * The settings link is minty-web's Module page (`subscriptionSettingsUrl`, lib/hub.ts) through
 * Flask's hand-off - never a Flask page. The read's `settings_path` names the same page through the
 * same hand-off, on Flask's origin, so it is not used.
 */

import { ApiError, subscriptionFetch } from "@/lib/apiClient";
import { decodeJwtPayload, getAuth } from "@/lib/auth";

export type NoticeSeverity = "critical" | "warning" | "info";

export type SubscriptionNoticeItem = {
  /** `past_due` or `pending_cancel` - the two kinds the engine still emits. */
  kind: string;
  severity: NoticeSeverity;
  /** The module's display name ("Petty Cash"). */
  module: string;
  module_code: string;
  title: string;
  detail: string;
  deadline: string | null;
};

export type SubscriptionNotice = {
  items: SubscriptionNoticeItem[];
  /** True only for the payer - anyone else is told who to ask. */
  can_manage: boolean;
  payer: { name: string; email: string } | null;
  severity: NoticeSeverity | null;
  settings_path: string | null;
};

/** The modal's title: "Action needed" when anything is critical, else "Your subscription" (Flask's). */
export function noticeTitle(notice: SubscriptionNotice): string {
  return notice.severity === "critical" ? "Action needed" : "Your subscription";
}

/** An item's alert tone: critical is Danger, warning Warning, anything else Info. */
export function noticeTone(severity: NoticeSeverity): "danger" | "warning" | "info" {
  return severity === "critical" ? "danger" : severity === "warning" ? "warning" : "info";
}

/**
 * For anyone but the payer: "Billing for this company is managed by Olive (olive@example.com).
 * Only they can change its subscription." - or null (the payer, or no payer known).
 */
export function payerLine(notice: SubscriptionNotice): string | null {
  if (notice.can_manage || !notice.payer) return null;
  const { name, email } = notice.payer;
  const who = name || email;
  if (!who) return null;
  return `Billing for this company is managed by ${who}${name && email ? ` (${email})` : ""}. Only they can change its subscription.`;
}

/** The notice for the company, or null when there is nothing to show or the read failed (logged). */
export async function fetchSubscriptionNotice(entityId: string): Promise<SubscriptionNotice | null> {
  if (!entityId) return null;
  try {
    // A notice must never move the page: a 401 only rejects, it does not go back through the hand-off.
    const data = await subscriptionFetch<SubscriptionNotice>(`/api/entities/${encodeURIComponent(entityId)}/subscription-notice`, {
      onUnauthorized: "reject",
    });
    if (!data || !Array.isArray(data.items)) {
      console.warn("[subscription-notice] not shown: the answer has no items");
      return null;
    }
    return data.items.length ? data : null;
  } catch (err) {
    // The status or the network error's name only - never a token or an answer body.
    console.warn("[subscription-notice] not shown:", err instanceof ApiError ? `status ${err.status}` : err instanceof Error ? err.name : "unknown error");
    return null;
  }
}

/** sessionStorage: the notices already shown in this tab, as `<sid>:<company>`. */
const SEEN_KEY = "petty_cash_subscription_notice_seen";

/**
 * Whether to show the notice now - and if so, mark it shown: once per company per sign-in (Flask's
 * `claim_subscription_notice`). The token's `sid` changes on every sign-in, so signing in again
 * shows it again; a token without one falls back to once per tab. Storage blocked: shown - a
 * repeated warning is a smaller failure than a missed one.
 */
export function claimSubscriptionNotice(entityId: string): boolean {
  if (!entityId) return false;
  const token = getAuth()?.token ?? "";
  const sidClaim = token ? decodeJwtPayload(token)?.sid : undefined;
  const sid = typeof sidClaim === "string" ? sidClaim : "";
  const key = sid ? `${sid}:${entityId}` : entityId;
  try {
    const parsed: unknown = JSON.parse(sessionStorage.getItem(SEEN_KEY) ?? "[]");
    const seen = Array.isArray(parsed) ? parsed.filter((k): k is string => typeof k === "string") : [];
    if (seen.includes(key)) return false;
    // Another sign-in's entries can never match again: drop them rather than grow forever.
    const kept = sid ? seen.filter((k) => k.startsWith(`${sid}:`)) : seen;
    sessionStorage.setItem(SEEN_KEY, JSON.stringify([...kept, key]));
    return true;
  } catch {
    return true;
  }
}
