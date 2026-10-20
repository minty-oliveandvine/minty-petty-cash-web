/**
 * My Profile's Subscriptions Overview read, for the packaged card (`@minty/shared/profile`):
 * subscription-api's `GET /api/me/subscriptions` over this app's bearer (`subscriptionFetch`, to
 * `SUBSCRIPTION_API_URL`), every page walked - as minty-web's `fetchAllPayerSubscriptions` does,
 * so the figures count every company. A refusal is an `ApiError`; a 401 has already gone back
 * through the hand-off.
 *
 * Module-level on purpose: the card reads again whenever `load` changes identity.
 */

import type { SubscriptionsList } from "@minty/shared/profile";

import { subscriptionFetch } from "@/lib/apiClient";

/** The most subscription-api answers in one page (minty-web's `MAX_PER_PAGE`). */
const PER_PAGE = 100;

type Page = SubscriptionsList & { pages: number };

const page = (n: number, signal: AbortSignal) =>
  subscriptionFetch<Page>("/api/me/subscriptions", { query: { page: n, per_page: PER_PAGE }, signal });

export async function loadSubscriptions(signal: AbortSignal): Promise<SubscriptionsList> {
  const first = await page(1, signal);
  const entities = [...first.entities];
  for (let n = 2; n <= first.pages; n++) entities.push(...(await page(n, signal)).entities);
  return { entities };
}
